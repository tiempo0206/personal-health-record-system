/**
 * ============================================================================
 * 文件：ui/components/form.js
 * 层：表现层（组件）
 * 职责：由"字段模式(schema)"自动渲染表单并读取/校验数据。
 *      档案中心的 14 种记录类型、基本信息、授权表单等全部复用本组件，
 *      因此新增字段只需改 core/dict-records.js，无需改任何视图代码。
 * 依赖：core/namespace.js、core/models.js、ui/components/dom.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  /** 解析字段候选项（支持函数） */
  function opts(fd) {
    var o = fd.options;
    if (typeof o === 'function') { try { o = o(); } catch (e) { o = []; } }
    return o || [];
  }

  /* ================================================================== *
   * 一、单个字段渲染
   * ================================================================== */
  /** 字段标签：优先走 fields[].i18n 词条，回退中文原文（label 本身也是访问器） */
  function labelOf(fd) {
    return fd.i18n ? PHR.t(fd.i18n, fd.label) : fd.label;
  }

  function renderField(fd, values, errors) {
    var v = values[fd.name];
    if (v === undefined || v === null) { v = fd.type === 'checkbox' ? false : ''; }
    if (fd.type === 'hidden') {
      return '<input type="hidden" id="f_' + fd.name + '" name="' + fd.name +
        '" value="' + dom.esc(v) + '">';
    }
    var err = errors && errors[fd.name];
    var wrapCls = 'field' + (fd.span === 2 ? ' span-2' : '') + (err ? ' has-error' : '');
    /* 字段说明不进界面正文（那是写给开发者看的），收进标签后的 ⓘ 悬停提示 */
    var label = '<label for="f_' + fd.name + '">' + dom.esc(labelOf(fd)) +
      (fd.required ? '<span class="req" aria-hidden="true">*</span>' : '') + '</label>' +
      dom.tip(fd.hint);
    var errHtml = err ? '<div class="err">⚠ ' + dom.esc(err) + '</div>' : '';
    var input = '';
    var list = opts(fd);

    switch (fd.type) {

      case 'textarea':
        input = '<textarea class="textarea" id="f_' + fd.name + '" name="' + fd.name + '"' +
          (fd.required ? ' required' : '') +
          ' placeholder="' + dom.esc(fd.placeholder || '') + '">' + dom.esc(v) + '</textarea>';
        break;

      case 'select':
        input = '<select class="select" id="f_' + fd.name + '" name="' + fd.name + '"' +
          (fd.required ? ' required' : '') + '>' +
          '<option value="">' + dom.esc(fd.placeholder || PHR.t('ui.selectPlaceholder', '请选择…')) + '</option>' +
          list.map(function (o) {
            return '<option value="' + dom.esc(o.key) + '"' + (String(v) === String(o.key) ? ' selected' : '') + '>' +
              dom.esc(D.nameOf(list, o.key)) + '</option>';
          }).join('') + '</select>';
        break;

      case 'multiselect': {
        var chosen = Array.isArray(v) ? v : (v ? String(v).split(',') : []);
        input = '<div class="multi-select" id="f_' + fd.name + '" data-multiselect="' + fd.name + '">' +
          list.map(function (o) {
            return '<label class="checkbox"><input type="checkbox" value="' + dom.esc(o.key) + '"' +
              (chosen.indexOf(o.key) >= 0 ? ' checked' : '') + '><span>' + dom.esc(D.nameOf(list, o.key)) + '</span></label>';
          }).join('') + '</div>';
        break;
      }

      case 'checkbox':
        input = '<label class="checkbox"><input type="checkbox" id="f_' + fd.name + '" name="' + fd.name + '"' +
          (v === true || v === 'true' ? ' checked' : '') + '><span>' +
          dom.esc(fd.checkboxLabel || fd.placeholder || PHR.t('ui.yes', '是')) + '</span></label>';
        break;

      case 'tags': {
        var tags = Array.isArray(v) ? v : (v ? String(v).split(/[,，\s]+/).filter(Boolean) : []);
        input = '<div class="tags-input" data-tags="' + fd.name + '">' +
          tags.map(tagHtml).join('') +
          '<input type="text" placeholder="' + dom.esc(fd.placeholder || PHR.t('ui.tagsPlaceholder', '输入后回车添加')) +
          '" aria-label="' + dom.esc(PHR.t('ui.addTag', '添加标签')) + '">' +
          '</div>';
        break;
      }

      case 'date':
        input = '<input class="input" type="date" id="f_' + fd.name + '" name="' + fd.name + '"' +
          ' value="' + dom.esc(normalizeDate(v)) + '"' + (fd.required ? ' required' : '') + '>';
        break;

      case 'datetime':
        input = '<input class="input" type="datetime-local" id="f_' + fd.name + '" name="' + fd.name + '"' +
          ' value="' + dom.esc(normalizeDateTime(v)) + '"' + (fd.required ? ' required' : '') + '>';
        break;

      case 'number':
        input = '<input class="input" type="number" id="f_' + fd.name + '" name="' + fd.name + '"' +
          ' value="' + dom.esc(v === '' ? '' : v) + '"' +
          (fd.step !== undefined ? ' step="' + fd.step + '"' : ' step="any"') +
          (fd.min !== undefined ? ' min="' + fd.min + '"' : '') +
          (fd.max !== undefined ? ' max="' + fd.max + '"' : '') +
          (fd.required ? ' required' : '') +
          ' placeholder="' + dom.esc(fd.placeholder || '') + '">';
        break;

      default:
        input = '<input class="input" type="text" id="f_' + fd.name + '" name="' + fd.name + '"' +
          ' value="' + dom.esc(v) + '"' + (fd.required ? ' required' : '') +
          ' placeholder="' + dom.esc(fd.placeholder || '') + '">';
    }

    if (fd.unit && (fd.type === 'number')) {
      input = '<div class="input-with-unit">' + input + '<span class="unit">' + dom.esc(fd.unit) + '</span></div>';
    }

    return '<div class="' + wrapCls + '">' + label + input + errHtml + '</div>';
  }

  function tagHtml(t) {
    return '<span class="chip" data-tag="' + dom.esc(t) + '">' + dom.esc(t) +
      '<span class="x" role="button" aria-label="' + dom.esc(PHR.t('ui.remove', '移除')) + '">✕</span></span>';
  }

  function normalizeDate(v) {
    if (!v) { return ''; }
    if (typeof v === 'number') { return U.fmtDate(v); }
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { return s; }
    return U.fmtDate(U.parseDate(s));
  }

  function normalizeDateTime(v) {
    if (!v) { return ''; }
    var ts = typeof v === 'number' ? v : U.parseDate(v);
    if (isNaN(ts)) { return ''; }
    var d = new Date(ts);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()) +
      'T' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  }

  /* ================================================================== *
   * 二、整表渲染
   * ================================================================== */
  /**
   * @param {Array} fields 字段模式数组
   * @param {object} values 初始值
   * @param {object} errors 字段错误
   * @returns {string} HTML
   */
  function render(fields, values, errors) {
    return '<div class="form-grid">' +
      (fields || []).map(function (fd) { return renderField(fd, values || {}, errors || {}); }).join('') +
      '</div>';
  }

  /* ================================================================== *
   * 三、读取表单数据
   * ================================================================== */
  /**
   * 从容器中按字段模式读取数据（正确处理多选、标签、复选框、日期）。
   * @param {Element} container
   * @param {Array} fields
   */
  function read(container, fields) {
    var out = {};
    (fields || []).forEach(function (fd) {
      var node = container.querySelector('#f_' + fd.name);
      if (fd.type === 'multiselect') {
        var box = container.querySelector('[data-multiselect="' + fd.name + '"]');
        out[fd.name] = box
          ? U.$$('input[type=checkbox]:checked', box).map(function (c) { return c.value; })
          : [];
      } else if (fd.type === 'tags') {
        var tw = container.querySelector('[data-tags="' + fd.name + '"]');
        out[fd.name] = tw
          ? U.$$('.chip', tw).map(function (c) { return c.getAttribute('data-tag'); })
          : [];
      } else if (fd.type === 'checkbox') {
        out[fd.name] = !!(node && node.checked);
      } else if (fd.type === 'number') {
        out[fd.name] = node && node.value !== '' ? Number(node.value) : '';
      } else {
        out[fd.name] = node ? node.value : '';
      }
    });
    return out;
  }

  /* ================================================================== *
   * 四、交互增强（标签输入、多选高亮、实时校验）
   * ================================================================== */
  function enhance(container, fields, onChange) {
    // 标签输入：回车添加、点 ✕ 删除
    U.$$('[data-tags]', container).forEach(function (wrap) {
      var input = wrap.querySelector('input[type=text]');

      function addTag(text) {
        text = PHR.security.sanitizeText(text, 20);
        if (!text) { return; }
        var exists = U.$$('.chip', wrap).some(function (c) { return c.getAttribute('data-tag') === text; });
        if (exists) { return; }
        input.insertAdjacentHTML('beforebegin', tagHtml(text));
        input.value = '';
        if (onChange) { onChange(); }
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
          e.preventDefault();
          addTag(input.value);
        } else if (e.key === 'Backspace' && !input.value) {
          var chips = U.$$('.chip', wrap);
          if (chips.length) { chips[chips.length - 1].remove(); if (onChange) { onChange(); } }
        }
      });
      input.addEventListener('blur', function () { addTag(input.value); });

      wrap.addEventListener('click', function (e) {
        if (e.target.classList.contains('x')) {
          e.target.closest('.chip').remove();
          if (onChange) { onChange(); }
          input.focus();
        } else if (e.target === wrap) { input.focus(); }
      });
    });

    // 下拉选择：自动带出单位
    U.$$('select', container).forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (sel.name === 'metricKey') {
          var m = D.metric(sel.value);
          var unitInput = container.querySelector('#f_unit');
          if (m && unitInput) { unitInput.value = m.unit; }
          var v2 = container.querySelector('#f_value2');
          if (v2) { v2.disabled = !(sel.value === 'systolic' || sel.value === 'diastolic'); }
          var way = container.querySelector('#f_measureWay');
          if (way && !way.value) { way.value = 'home'; }
        }
        if (onChange) { onChange(); }
      });
    });

    // 任一字段变化时清除该字段的错误态
    container.addEventListener('input', function (e) {
      var f = e.target.closest('.field.has-error');
      if (f) { f.classList.remove('has-error'); var err = f.querySelector('.err'); if (err) { err.remove(); } }
      if (onChange) { onChange(); }
    });
    container.addEventListener('change', function (e) {
      var f = e.target.closest('.field.has-error');
      if (f) { f.classList.remove('has-error'); var err = f.querySelector('.err'); if (err) { err.remove(); } }
    });
  }

  /** 在容器内展示校验错误 */
  function showErrors(container, fields, errors) {
    U.$$('.field', container).forEach(function (f) {
      f.classList.remove('has-error');
      var e = f.querySelector('.err');
      if (e) { e.remove(); }
    });
    Object.keys(errors || {}).forEach(function (name) {
      var node = container.querySelector('#f_' + name);
      var wrap = node ? node.closest('.field') : null;
      if (!wrap) { return; }
      wrap.classList.add('has-error');
      wrap.insertAdjacentHTML('beforeend', '<div class="err">⚠ ' + dom.esc(errors[name]) + '</div>');
    });
    var first = container.querySelector('.field.has-error');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var input = first.querySelector('input,select,textarea');
      if (input) { input.focus(); }
    }
  }

  /* ================================================================== *
   * 五、通用表单对话框
   * ================================================================== */
  /**
   * 用字段模式快速弹出一个表单对话框。
   * @param {object} cfg { title, fields, values, size, submitLabel, onSubmit(values) -> {ok, errors, message} }
   */
  function dialog(cfg) {
    cfg = cfg || {};
    var m = PHR.ui.modal({
      title: cfg.title || PHR.t('ui.formTitle', '填写信息'),
      size: cfg.size || 'normal',
      body: '<form id="dlg_form" novalidate>' + render(cfg.fields, cfg.values || {}, {}) + '</form>',
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: cfg.submitLabel || PHR.t('ui.save', '保存'), tone: 'primary', close: false, action: function (v, close, body) {
            var form = body.querySelector('#dlg_form');
            var values = read(form, cfg.fields);
            var check = PHR.models.validateBySchema(cfg.fields, values);
            if (!check.ok) { showErrors(form, cfg.fields, check.errors); return false; }
            var res = cfg.onSubmit ? cfg.onSubmit(values, close, form) : { ok: true };
            if (res === false) { return false; }
            if (res && res.ok === false) {
              if (res.errors) { showErrors(form, cfg.fields, res.errors); }
              if (res.message) { PHR.ui.toast.warn(res.message); }
              return false;
            }
            close('submit');
          } }
      ]
    });
    enhance(m.body, cfg.fields);
    var form = m.body.querySelector('#dlg_form');
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    return m;
  }

  PHR.ui.form = {
    render: render,
    renderField: renderField,
    read: read,
    enhance: enhance,
    showErrors: showErrors,
    dialog: dialog,
    optionsOf: opts
  };

})(window.PHR);
