/**
 * ============================================================================
 * 文件：ui/components/modal.js
 * 层：表现层（组件）
 * 职责：模态对话框与二次确认框。
 *      - PHR.ui.modal({...})   通用弹窗，支持自定义 body HTML / 按钮 / 生命周期
 *      - PHR.ui.confirm({...}) 危险操作二次确认（Promise 风格）
 *      - PHR.ui.detail({...})  只读详情弹窗（键值对表格）
 * 依赖：core/namespace.js、ui/components/dom.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var dom = PHR.ui.dom;
  var openStack = [];

  /**
   * 打开一个模态框。
   * @param {object} cfg {
   *   title, titleTip(标题后的悬停说明), body(HTML 字符串), size:'narrow'|'normal'|'wide',
   *   actions:[{label, tone, action, value, close:false}],
   *   onMount(bodyEl, close), onClose(reason), closable=true
   * }
   * @returns {{close:Function, el:Element}}
   */
  function modal(cfg) {
    cfg = cfg || {};

    var mask = document.createElement('div');
    mask.className = 'modal-mask';

    var sizeCls = cfg.size === 'wide' ? ' wide' : cfg.size === 'narrow' ? ' narrow' : '';
    var actions = cfg.actions || [];

    mask.innerHTML =
      '<div class="modal' + sizeCls + '" role="dialog" aria-modal="true" aria-label="' +
        dom.esc(cfg.title || PHR.t('ui.dialog', '对话框')) + '">' +
        '<div class="modal-head">' +
          '<h3>' + dom.esc(cfg.title || '') + dom.tip(cfg.titleTip) + '</h3>' +
          (cfg.closable === false ? '' : '<button class="modal-close" aria-label="' +
            dom.esc(PHR.t('ui.close', '关闭')) + '">✕</button>') +
        '</div>' +
        '<div class="modal-body">' + (cfg.body || '') + '</div>' +
        (actions.length ? '<div class="modal-foot">' + actions.map(function (a, i) {
          var cls = a.tone === 'primary' ? 'btn-primary'
                  : a.tone === 'danger' ? 'btn-danger'
                  : a.tone === 'ok' ? 'btn-ok'
                  : a.tone === 'ghost' ? 'btn-ghost' : '';
          return '<button class="btn ' + cls + '" data-idx="' + i + '">' + dom.esc(a.label) + '</button>';
        }).join('') + '</div>' : '') +
      '</div>';

    var box = mask.querySelector('.modal');
    var bodyEl = mask.querySelector('.modal-body');
    var closed = false;

    function close(reason) {
      if (closed) { return; }
      closed = true;
      mask.style.opacity = '0';
      setTimeout(function () {
        if (mask.parentNode) { mask.parentNode.removeChild(mask); }
        openStack = openStack.filter(function (x) { return x !== close; });
        if (cfg.onClose) { cfg.onClose(reason || 'close'); }
        syncBodyLock();
      }, 130);
    }

    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask && cfg.closable !== false) { close('backdrop'); }
    });
    var xBtn = mask.querySelector('.modal-close');
    if (xBtn) { xBtn.addEventListener('click', function () { close('x'); }); }

    dom.actions(mask, {});
    mask.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-idx]');
      if (!btn) { return; }
      var a = actions[Number(btn.getAttribute('data-idx'))];
      if (!a) { return; }
      var keep = a.action ? a.action(a.value, close, bodyEl) : undefined;
      // action 返回 false 表示不自动关闭
      if (a.close !== false && keep !== false) { close('action'); }
    });

    document.body.appendChild(mask);
    openStack.push(close);
    syncBodyLock();

    if (typeof cfg.onMount === 'function') { cfg.onMount(bodyEl, close); }

    // 自动聚焦第一个可交互元素
    var first = box.querySelector('input,select,textarea,button.btn-primary');
    if (first) { setTimeout(function () { first.focus(); }, 60); }

    // Esc 关闭
    mask.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && cfg.closable !== false) { close('esc'); }
    });

    return { close: close, el: mask, body: bodyEl };
  }

  function syncBodyLock() {
    document.body.style.overflow = openStack.length ? 'hidden' : '';
  }

  /**
   * 二次确认。返回 Promise<boolean>。
   * @param {object} cfg { title, message, detail, confirmLabel, cancelLabel, tone }
   */
  function confirm(cfg) {
    cfg = cfg || {};
    return new Promise(function (resolve) {
      var done = false;
      var m = modal({
        title: cfg.title || PHR.t('ui.confirmTitle', '请确认'),
        size: 'narrow',
        body:
          '<p style="margin:0 0 8px">' + dom.esc(cfg.message || PHR.t('ui.confirmMessage', '确定要执行此操作吗？')) + '</p>' +
          (cfg.detail ? dom.noticeHtml(cfg.tone || 'warn', cfg.detail) : '') +
          (cfg.requireText
            ? '<div class="field mt4"><label>' + dom.esc(PHR.t('ui.confirmType', '请输入')) +
              ' <code>' + dom.esc(cfg.requireText) +
              '</code> ' + dom.esc(PHR.t('ui.confirmTypeSuffix', '以确认')) +
              '</label><input class="input" name="confirmText" autocomplete="off"></div>'
            : ''),
        actions: [
          { label: cfg.cancelLabel || PHR.t('ui.cancel', '取消'), tone: 'ghost', action: function () { done = true; resolve(false); } },
          { label: cfg.confirmLabel || PHR.t('ui.confirm', '确定'), tone: cfg.tone || 'danger', action: function (v, close, body) {
              if (cfg.requireText) {
                var input = body.querySelector('[name="confirmText"]');
                if (!input || input.value.trim() !== cfg.requireText) {
                  PHR.ui.toast.warn(PHR.t('ui.confirmMismatch', '输入的确认文字不匹配'));
                  return false;
                }
              }
              done = true;
              resolve(true);
            } }
        ],
        onClose: function () { if (!done) { resolve(false); } }
      });
      return m;
    });
  }

  /**
   * 打开一个已存在的模态框（供 confirm 复用 notice 片段）
   * 这里只是把 notice 的 HTML 生成逻辑暴露出来，避免依赖加载顺序。
   */
  dom.noticeHtml = function (tone, text) {
    var icons = { ok: '✅', warn: '⚠️', danger: '⛔', info: 'ℹ️' };
    return '<div class="notice tone-' + tone + '"><span class="ico">' + (icons[tone] || 'ℹ️') +
      '</span><div class="body">' + dom.esc(text) + '</div></div>';
  };

  /**
   * 只读详情弹窗。
   * @param {object} cfg { title, fields:[[label, valueHtml], ...], raw:boolean, actions }
   */
  function detail(cfg) {
    cfg = cfg || {};
    var rows = (cfg.fields || []).map(function (pair) {
      var value = pair[1];
      var html = cfg.raw === false ? dom.esc(value === undefined || value === null ? '—' : value)
                                   : (value === undefined || value === null || value === '' ? '<span class="dim">—</span>' : value);
      return '<dt>' + dom.esc(pair[0]) + '</dt><dd>' + html + '</dd>';
    }).join('');
    return modal({
      title: cfg.title || PHR.t('ui.detail', '详情'),
      size: cfg.size || 'normal',
      body: '<dl class="kv">' + rows + '</dl>',
      actions: cfg.actions || [{ label: PHR.t('ui.close', '关闭'), tone: 'ghost' }]
    });
  }

  /** 关闭最上层的弹窗 */
  function closeTop() {
    var last = openStack[openStack.length - 1];
    if (last) { last('programmatic'); }
  }

  PHR.ui.modal = modal;
  PHR.ui.confirm = confirm;
  PHR.ui.detailModal = detail;
  PHR.ui.closeModal = closeTop;

  /* 全局 Esc 关闭最上层 */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openStack.length) { closeTop(); }
  });

})(window.PHR);
