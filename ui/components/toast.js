/**
 * ============================================================================
 * 文件：ui/components/toast.js
 * 层：表现层（组件）
 * 职责：右上角浮层提示。任何模块都可以通过
 *        PHR.bus.emit('toast', { message:'...', type:'ok' })
 *      或直接调用 PHR.ui.toast(...) 弹出提示，无需自己操作 DOM。
 * 依赖：core/namespace.js、core/event-bus.js、ui/components/dom.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var dom = PHR.ui.dom;
  var host = null;

  function ensureHost() {
    if (host && document.body.contains(host)) { return host; }
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }

  var ICONS = { ok: '✅', warn: '⚠️', danger: '⛔', info: 'ℹ️', primary: '💡' };

  /**
   * 弹出一条提示。
   * @param {string|object} message 文本，或 { message, title, detail, type, duration }
   * @param {string} [type] ok | warn | danger | info
   */
  function toast(message, type) {
    var cfg = typeof message === 'object' ? message : { message: message, type: type };
    var tone = cfg.type || cfg.tone || 'info';
    var duration = cfg.duration === undefined ? (tone === 'danger' ? 6000 : 3200) : cfg.duration;

    var node = document.createElement('div');
    node.className = 'toast tone-' + tone;
    node.innerHTML =
      '<span class="ico" aria-hidden="true">' + (cfg.icon || ICONS[tone] || 'ℹ️') + '</span>' +
      '<div class="msg">' +
        (cfg.title ? '<div class="t">' + dom.esc(cfg.title) + '</div>' : '') +
        '<div>' + dom.esc(cfg.message || '') + '</div>' +
        (cfg.detail ? '<div class="d">' + dom.esc(cfg.detail) + '</div>' : '') +
      '</div>' +
      '<button class="close" aria-label="' + dom.esc(PHR.t('ui.close', '关闭')) + '">✕</button>';

    var close = function () {
      if (!node.parentNode) { return; }
      node.classList.add('leaving');
      setTimeout(function () { if (node.parentNode) { node.parentNode.removeChild(node); } }, 140);
    };
    node.querySelector('.close').addEventListener('click', close);

    ensureHost().appendChild(node);
    if (duration > 0) { setTimeout(close, duration); }
    return close;
  }

  /* 便捷方法 */
  toast.ok = function (m, o) { return toast(Object.assign({ message: m, type: 'ok' }, o || {})); };
  toast.warn = function (m, o) { return toast(Object.assign({ message: m, type: 'warn' }, o || {})); };
  toast.danger = function (m, o) { return toast(Object.assign({ message: m, type: 'danger' }, o || {})); };
  toast.info = function (m, o) { return toast(Object.assign({ message: m, type: 'info' }, o || {})); };

  /* 订阅全局 toast 事件，让业务模块不必依赖 UI 层 */
  PHR.bus.on('toast', function (payload) { toast(payload || {}); });

  PHR.ui.toast = toast;

})(window.PHR);
