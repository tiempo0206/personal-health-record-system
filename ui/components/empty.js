/**
 * ============================================================================
 * 文件：ui/components/empty.js
 * 层：表现层（组件）
 * 职责：空状态、加载中、骨架屏三种"占位"视图，保证每个列表页都有
 *      友好的零数据提示与下一步操作引导。
 * 依赖：core/namespace.js、ui/components/dom.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var dom = PHR.ui.dom;

  /**
   * 空状态。
   * @param {object} cfg { icon, title, hint, action:{label,action,icon}, compact }
   * @returns {string} HTML
   */
  function empty(cfg) {
    cfg = cfg || {};
    var html = '<div class="empty"' + (cfg.compact ? ' style="padding:var(--sp-6) var(--sp-4)"' : '') + '>';
    if (cfg.icon) { html += '<div class="ico" aria-hidden="true">' + cfg.icon + '</div>'; }
    html += '<div class="title">' + dom.esc(cfg.title || PHR.t('ui.noData', '暂无数据')) + '</div>';
    if (cfg.hint) { html += '<div class="hint">' + dom.esc(cfg.hint) + '</div>'; }
    if (cfg.action) {
      html += '<button class="btn btn-primary" data-action="' + dom.esc(cfg.action.action || 'noop') + '">' +
        (cfg.action.icon ? cfg.action.icon + ' ' : '') + dom.esc(cfg.action.label) + '</button>';
    }
    html += '</div>';
    return html;
  }

  /** 加载中 */
  function loading(text) {
    return '<div class="loading"><span class="spinner" aria-hidden="true"></span>' +
      dom.esc(text || PHR.t('ui.loading', '加载中…')) + '</div>';
  }

  /** 骨架屏：n 行 */
  function skeleton(rows, opt) {
    opt = opt || {};
    var out = [];
    for (var i = 0; i < (rows || 3); i++) {
      out.push('<div class="skeleton" style="width:' + (opt.full ? 100 : (58 + Math.round(Math.random() * 38))) +
        '%;margin-bottom:' + (opt.gap || 10) + 'px' + (opt.height ? ';height:' + opt.height + 'px' : '') + '"></div>');
    }
    return '<div style="padding:var(--sp-4)">' + out.join('') + '</div>';
  }

  /** 加载失败 */
  function error(message, retryAction) {
    return '<div class="empty"><div class="ico">⚠️</div>' +
      '<div class="title">' + dom.esc(PHR.t('ui.error', '出了点问题')) + '</div>' +
      '<div class="hint">' + dom.esc(message || PHR.t('ui.errorHint', '数据加载失败，请重试。')) + '</div>' +
      (retryAction ? '<button class="btn" data-action="' + dom.esc(retryAction) + '">' +
        dom.esc(PHR.t('ui.retry', '重试')) + '</button>' : '') +
      '</div>';
  }

  /** 内联通知条 */
  function notice(tone, title, body, opt) {
    opt = opt || {};
    var icons = { ok: '✅', warn: '⚠️', danger: '⛔', info: 'ℹ️', primary: '💡' };
    return '<div class="notice tone-' + (tone || 'info') + '">' +
      '<span class="ico" aria-hidden="true">' + (opt.icon || icons[tone] || 'ℹ️') + '</span>' +
      '<div class="body">' + (title ? '<strong>' + dom.esc(title) + '</strong>' : '') +
      (title && body ? '<br>' : '') + (opt.raw ? body : dom.esc(body || '')) + '</div>' +
      (opt.action ? '<button class="btn btn-sm" data-action="' + dom.esc(opt.action.action) + '">' +
        dom.esc(opt.action.label) + '</button>' : '') +
      '</div>';
  }

  PHR.ui.empty = empty;
  PHR.ui.loading = loading;
  PHR.ui.skeleton = skeleton;
  PHR.ui.error = error;
  PHR.ui.notice = notice;

})(window.PHR);
