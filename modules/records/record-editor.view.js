/**
 * ============================================================================
 * 文件：modules/records/record-editor.view.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：注册「录入 / 编辑健康记录」页面。
 *      路由：#/records-edit              先选类型再填表
 *            #/records-edit?type=lab     直接进入某类型的表单
 *            #/records-edit/<记录id>     编辑已有记录
 *      表单本身由 core/dict-records.js 的字段模式自动生成 —— 新增一种记录类型
 *      只需要改字典文件，本视图一行都不用动。
 * 依赖：modules/records/{record,medication,categories}.js、ui/components/form.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var S = PHR.records.service;
  var C = PHR.records.categories;

  var ctx = { type: null, recordId: null, values: {} };
  var QUICK_ENTRIES = [
    {
      key: 'bp', icon: '🩺', type: 'vital', metric: 'systolic',
      titleKey: 'editor.quick.bp.title', title: '血压',
      descKey: 'editor.quick.bp.desc', desc: '记录高压、低压和测量时间'
    },
    {
      key: 'glucose', icon: '🩸', type: 'vital', metric: 'glucose',
      titleKey: 'editor.quick.glucose.title', title: '血糖',
      descKey: 'editor.quick.glucose.desc', desc: '记录空腹血糖或日常血糖读数'
    },
    {
      key: 'lab', icon: '🧪', type: 'lab',
      titleKey: 'editor.quick.lab.title', title: '体检 / 化验单',
      descKey: 'editor.quick.lab.desc', desc: '录入 HbA1c、血脂、尿酸等报告项目'
    },
    {
      key: 'medication', icon: '💊', type: 'medication',
      titleKey: 'editor.quick.medication.title', title: '用药',
      descKey: 'editor.quick.medication.desc', desc: '记录正在吃的药、剂量和频率'
    },
    {
      key: 'allergy', icon: '⛔', type: 'allergy',
      titleKey: 'editor.quick.allergy.title', title: '过敏',
      descKey: 'editor.quick.allergy.desc', desc: '记录药物、食物或其它过敏反应'
    },
    {
      key: 'visit', icon: '🏥', type: 'visit',
      titleKey: 'editor.quick.visit.title', title: '就诊',
      descKey: 'editor.quick.visit.desc', desc: '记录门诊、复诊或医生建议'
    }
  ];

  PHR.registerView('records-edit', {
    title: PHR.t('view.records-edit.title', '录入健康记录'), icon: '📝', group: 'main', order: 98, nav: false, module: 'records',
    render: render
  });

  /* ================================================================== *
   * 入口
   * ================================================================== */
  function render(root, params) {
    var id = params.p1 || params.id || '';
    var type = params.type || '';

    if (id) {
      var rec = S.byId(id);
      if (!rec) {
        root.innerHTML = PHR.ui.empty({
          icon: '🔍',
          title: U.t('editor.notFound', '找不到这条记录'),
          hint: U.t('editor.notFoundHint', '它可能已被删除。'),
          action: { label: U.t('editor.backToList', '返回档案列表'), action: 'back' }
        });
        dom.actions(root, { back: function () { PHR.router.go('/records'); } });
        return;
      }
      ctx = { type: rec.type, recordId: id, values: U.clone(rec.data) };
      drawForm(root, rec);
      return;
    }

    if (type && D.recordTypeMap[type]) {
      ctx = { type: type, recordId: null, values: defaultValues(type, params) };
      drawForm(root, null);
      return;
    }

    ctx = { type: null, recordId: null, values: {} };
    drawTypePicker(root);
  }

  /** 新记录预填的默认值：日期默认今天，来源带参等 */
  function defaultValues(type, params) {
    var t = D.recordType(type);
    var v = {};
    var today = U.today();
    t.fields.forEach(function (fd) {
      if (fd.type === 'date') { v[fd.name] = today; }
      if (fd.type === 'datetime') { v[fd.name] = today + ' ' + U.pad2(new Date().getHours()) + ':' + U.pad2(new Date().getMinutes()); }
    });
    if (params && params.metric) { v.metricKey = params.metric; }
    if (params && params.recordId) { /* 预留：从别处带参复制 */ }
    return v;
  }

  /* ================================================================== *
   * 一、类型选择器
   * ================================================================== */
  function drawTypePicker(root) {
    var groups = C.byScope();
    var comp = C.completeness(S.all(), PHR.records.profile.get());
    var missing = comp.missing.map(function (m) { return m.key; });

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles"><h2>' + U.t('editor.picker.title', '新增健康记录') + '</h2></div>' +
        '<div class="actions"><button class="btn" data-action="back">' +
          U.t('editor.picker.back', '← 返回档案列表') + '</button></div>' +
      '</div>' +

      PHR.ui.notice('primary', U.t('editor.picker.hintTitle', '不知道从哪开始？'),
        U.t('editor.picker.hintBody',
          '建议先补全「过敏史」和「确诊疾病」，这两项对医生判断最关键。下面是按授权范围分组的全部记录类型。'),
        { icon: '🧭', action: { label: U.t('records.comp.guide', '查看录入引导'), action: 'guide' } }) +

      quickEntryHtml() +

      groups.map(function (g) {
        return '<div class="card mb4">' +
          '<div class="card-head">' +
            '<h3>' + dom.esc(g.name) + '</h3>' +
            '<div class="sub">' + dom.esc(g.desc) + '</div>' +
            '<div class="actions"><span class="badge tone-muted">' +
              U.t('editor.picker.typeCount', '{n} 种类型', { n: g.types.length }) + '</span></div>' +
          '</div>' +
          '<div class="card-body">' +
            '<div class="type-picker">' + g.types.map(function (t) {
              return '<button class="type-tile" data-type="' + t.key + '">' +
                '<span class="ico">' + t.icon + '</span>' +
                '<span class="n">' + dom.esc(t.name) +
                  (missing.indexOf(t.key) < 0 ? '' : ' <span class="badge tone-warn" style="font-size:10px">' +
                    U.t('editor.picker.todo', '待补') + '</span>') +
                '</span>' +
                '<span class="d">' + dom.esc(t.desc) + '</span>' +
              '</button>';
            }).join('') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

    dom.actions(root, {
      back: function () { PHR.router.go('/records'); },
      guide: function () { PHR.router.go('/records'); setTimeout(function () {
        var b = document.querySelector('[data-action="guide"]');
        if (b) { b.click(); }
      }, 60); }
    });

    root.addEventListener('click', function (e) {
      var q = e.target.closest('[data-quick-entry]');
      if (q) {
        var hit = QUICK_ENTRIES.filter(function (x) { return x.key === q.getAttribute('data-quick-entry'); })[0];
        if (hit) { PHR.router.go(quickEntryUrl(hit)); }
        return;
      }
      var t = e.target.closest('[data-type]');
      if (!t) { return; }
      PHR.router.go('/records-edit?type=' + t.getAttribute('data-type'));
    });
  }

  function quickEntryHtml() {
    return '<div class="card mb4">' +
      '<div class="card-head">' +
        '<h3>' + dom.esc(U.t('editor.quick.title', '常用记录')) + '</h3>' +
        '<div class="sub">' +
          dom.esc(U.t('editor.quick.sub', '不用先理解记录分类，直接选择你现在要记的内容。')) +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="type-picker">' + QUICK_ENTRIES.map(function (q) {
          return '<button class="type-tile" data-quick-entry="' + dom.esc(q.key) + '">' +
            '<span class="ico">' + q.icon + '</span>' +
            '<span class="n">' + dom.esc(U.t(q.titleKey, q.title)) + '</span>' +
            '<span class="d">' + dom.esc(U.t(q.descKey, q.desc)) + '</span>' +
          '</button>';
        }).join('') + '</div>' +
      '</div>' +
    '</div>';
  }

  function quickEntryUrl(q) {
    var url = '/records-edit?type=' + encodeURIComponent(q.type);
    if (q.metric) { url += '&metric=' + encodeURIComponent(q.metric); }
    return url;
  }

  /* ================================================================== *
   * 二、表单
   * ================================================================== */
  function drawForm(root, existing) {
    var type = ctx.type;
    var t = D.recordType(type);
    var isEdit = !!ctx.recordId;

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>' + t.icon + ' ' +
            (isEdit ? U.t('editor.editPrefix', '编辑') : U.t('editor.newPrefix', '新增')) +
            dom.esc(t.name) + '</h2>' +
          '<div class="desc">' + dom.esc(t.desc) + '</div>' +
        '</div>' +
        '<div class="actions">' +
          (type === 'vital' && !isEdit
            ? '<button class="btn" data-action="batch">' + U.t('editor.batch', '📊 快速批量录入') + '</button>'
            : '') +
          '<button class="btn" data-action="back">' + U.t('ui.cancel', '取消') + '</button>' +
          '<button class="btn btn-primary" data-action="save">' +
            (isEdit ? U.t('editor.saveEdit', '保存修改') : U.t('editor.saveNew', '保存记录')) + '</button>' +
        '</div>' +
      '</div>' +

      (isEdit && existing ? versionBanner(existing) : '') +
      '<div id="form-alerts"></div>' +

      '<div class="card"><div class="card-body">' +
        '<form id="record-form" novalidate>' +
          PHR.ui.form.render(t.fields, ctx.values, {}) +
        '</form>' +
        '<div class="form-actions">' +
          '<button class="btn btn-ghost" data-action="back">' + U.t('ui.cancel', '取消') + '</button>' +
          (isEdit ? '' : '<button class="btn" data-action="save-new">' +
            U.t('editor.saveAndNew', '保存并继续新增') + '</button>') +
          '<button class="btn btn-primary" data-action="save">' +
            (isEdit ? U.t('editor.saveEdit', '保存修改') : U.t('editor.saveNew', '保存记录')) + '</button>' +
        '</div>' +
      '</div></div>' +

      '<p class="dim t-xs mt4">' +
        U.t('editor.requiredNote',
          '字段前的 <span class="req">*</span> 为必填项。' +
          '保存后所有修改都会保留版本记录，可在档案列表中查看并回滚。') + '</p>';

    var formEl = U.$('#record-form', root);
    PHR.ui.form.enhance(formEl, t.fields, onFieldChange);
    onFieldChange();

    // 表单内回车不提交整个页面
    formEl.addEventListener('submit', function (e) { e.preventDefault(); });

    dom.actions(root, {
      back: function () { PHR.router.go(isEdit ? '/records' : '/records'); },
      save: function () { doSave(true); },
      'save-new': function () { doSave(false); },
      batch: function () { PHR.router.go('/insight'); }
    });
  }

  function versionBanner(rec) {
    var n = PHR.records.versions.countOf(rec.id);
    return '<div class="notice tone-info mb4"><span class="ico">🕘</span><div class="body">' +
      U.t('editor.versionBanner',
        '这条记录创建于 {created}，最后修改于 {updated}，当前是第 <b>{n}</b> 版。' +
        '保存后会生成新版本，旧内容不会丢失。',
        { created: U.fmtDateTime(rec.createdAt), updated: U.fmtRelative(rec.updatedAt), n: n }) +
      '</div><button class="btn btn-sm" data-action="versions">' +
        U.t('editor.viewHistory', '查看历史') + '</button></div>';
  }

  /* ------------------------------ 实时联动校验 ------------------------------ */
  function onFieldChange() {
    var type = ctx.type;
    var t = D.recordType(type);
    var formEl = document.getElementById('record-form');
    var alerts = document.getElementById('form-alerts');
    if (!formEl || !alerts) { return; }

    var values = PHR.ui.form.read(formEl, t.fields);
    var html = '';

    /* 1) 药品名与已知过敏原冲突检查 —— 只对含 drugName 字段的类型做 */
    if (values.drugName && PHR.records.medication) {
      var chk = PHR.records.medication.checkDrug(values.drugName);
      if (chk.hit) {
        html += PHR.ui.notice('danger', U.t('editor.allergyTitle', '过敏警示'), chk.message, { icon: '⛔' });
      }
    }

    /* 2) 体征指标的取值范围提示 */
    if (type === 'vital' && values.metricKey && values.value !== '' && values.value !== undefined) {
      var m = D.metric(values.metricKey);
      if (m) {
        var lv = D.judge(values.metricKey, values.value);
        if (lv === 'critical') {
          html += PHR.ui.notice('danger', U.t('editor.criticalTitle', '数值明显异常'),
            U.t('editor.criticalBody',
              '该读数（{v} {unit}）超出正常与警戒范围。' +
              '如果这是真实测量结果，请尽快就医；如果是误输入，请检查后再保存。',
              { v: values.value, unit: m.unit }), { icon: '🚨' });
        } else if (lv === 'warning') {
          html += PHR.ui.notice('warn', U.t('editor.warningTitle', '数值偏离正常范围'),
            U.t('editor.warningBody',
              '该读数（{v} {unit}）超出正常区间，参考范围 {range} {unit}。建议连续监测并记录测量情境。',
              { v: values.value, unit: m.unit, range: fmtRange(m.normal, m.decimals) }), { icon: '⚠️' });
        }
      }
    }

    /* 3) 数值范围即时提示 */
    var rangeWarn = t.fields.filter(function (fd) {
      return fd.type === 'number' && fd.min !== undefined && fd.max !== undefined &&
             values[fd.name] !== '' && values[fd.name] !== undefined &&
             (Number(values[fd.name]) < fd.min || Number(values[fd.name]) > fd.max);
    });
    if (rangeWarn.length) {
      html += PHR.ui.notice('warn', '', rangeWarn.map(function (fd) {
        return U.t('editor.rangeWarn', '「{label}」应在 {min} ~ {max} 之间',
          { label: fd.label, min: fd.min, max: fd.max });
      }).join(U.t('ui.listSep', '；')), { icon: '⚠️' });
    }

    alerts.innerHTML = html;
  }

  function fmtRange(range, digits) {
    if (!range) { return '—'; }
    var a = range.min, b = range.max;
    if (a === null) { return '≤ ' + Number(b).toFixed(digits); }
    if (b === null) { return '≥ ' + Number(a).toFixed(digits); }
    return Number(a).toFixed(digits) + ' ~ ' + Number(b).toFixed(digits);
  }

  /* ------------------------------ 保存 ------------------------------ */
  function doSave(stayOrLeave) {
    var t = D.recordType(ctx.type);
    var formEl = document.getElementById('record-form');
    if (!formEl) { return; }
    var values = PHR.ui.form.read(formEl, t.fields);

    var check = PHR.models.record.validate(ctx.type, values);
    if (!check.ok) {
      PHR.ui.form.showErrors(formEl, t.fields, check.errors);
      PHR.ui.toast.warn(U.t('editor.fixForm', '请先修正表单中标记的问题'));
      return;
    }

    var res;
    if (ctx.recordId) {
      res = S.update(ctx.recordId, values);
    } else {
      res = S.create(ctx.type, values);
    }

    if (!res.ok) {
      if (res.errors) { PHR.ui.form.showErrors(formEl, t.fields, res.errors); }
      PHR.ui.toast.danger(res.message || U.t('editor.saveFailed', '保存失败'));
      return;
    }

    PHR.ui.toast.ok(res.message, {
      title: ctx.recordId ? U.t('editor.savedEdit', '修改已保存') : U.t('editor.savedNew', '记录已保存')
    });

    // 体征异常即时提醒
    if (ctx.type === 'vital' && res.record) {
      var lv = D.judge(res.record.data.metricKey, res.record.data.value);
      if (lv === 'critical' && PHR.config.abnormalAlert) {
        PHR.bus.emit('toast', {
          type: 'danger', title: U.t('editor.metricAlertTitle', '指标异常提醒'),
          message: U.t('editor.metricAlertBody', '{name} 读数 {v} {unit}，已超出安全范围。', {
            name: D.metricName(res.record.data.metricKey),
            v: res.record.data.value,
            unit: (D.metric(res.record.data.metricKey) || {}).unit
          }),
          detail: U.t('editor.metricAlertDetail', '请查看「健康洞察」中的分析与建议，必要时尽快就医。'),
          duration: 8000
        });
      }
    }

    if (stayOrLeave) {
      PHR.router.go('/records');
    } else {
      // 保存并继续：清空表单，保留日期等默认值
      ctx.values = defaultValues(ctx.type, {});
      var root = (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : document.getElementById('view-root'));
      drawForm(root, null);
      PHR.ui.toast.info(U.t('editor.formCleared', '表单已清空，可以继续录入下一条'));
    }
  }

})(window.PHR);
