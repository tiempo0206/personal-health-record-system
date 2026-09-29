/**
 * ============================================================================
 * 文件：ui/components/badge.js
 * 层：表现层（组件）
 * 职责：统一生成各种"小标签"的 HTML —— 状态徽章、严重程度、记录类型、
 *      指标等级、授权状态、审计动作风险等。
 *      把这些映射集中在一处，可避免各视图各写一套颜色规则。
 * 依赖：core/namespace.js、core/dict*.js、ui/components/dom.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var D = PHR.dict;
  var dom = PHR.ui.dom;

  /** 基础徽章 */
  function badge(text, tone, opt) {
    opt = opt || {};
    return '<span class="badge tone-' + (tone || 'muted') + (opt.solid ? ' solid' : '') + '"' +
      (opt.title ? ' title="' + dom.esc(opt.title) + '"' : '') + '>' +
      (opt.icon ? '<span aria-hidden="true">' + opt.icon + '</span>' : '') +
      dom.esc(text) + '</span>';
  }

  /** 严重程度徽章 */
  function severity(key) {
    var hit = (D.severity || []).filter(function (s) { return s.key === key; })[0];
    if (!hit) { return '<span class="dim">—</span>'; }
    // 走 nameOf 而不是 hit.name —— severity 数组已打 __i18n 标记，语言随之切换
    return badge(D.nameOf(D.severity, key), hit.tone);
  }

  /** 指标等级徽章 */
  function metricLevel(level) {
    return badge(D.judgeName(level), D.judgeTone(level));
  }

  /** 记录类型徽章（带图标与主题色） */
  function recordType(typeKey) {
    var t = D.recordType(typeKey);
    return '<span class="badge" style="background:' + t.color + '1f;color:' + t.color +
      ';border-color:' + t.color + '40">' + t.icon + ' ' + dom.esc(t.name) + '</span>';
  }

  /** 疾病分类徽章 */
  function diseaseCat(key) {
    var hit = (D.diseaseCategory || []).filter(function (c) { return c.key === key; })[0];
    if (!hit) { return ''; }
    return '<span class="chip">' + hit.icon + ' ' + dom.esc(hit.name) + '</span>';
  }

  /** 授权状态徽章 */
  function consentStatus(status) {
    var map = {
      active:  { name: PHR.t('badge.consent.active',  '生效中'),  tone: 'ok',    icon: '✅' },
      pending: { name: PHR.t('badge.consent.pending', '未生效'),  tone: 'info',  icon: '⏳' },
      expired: { name: PHR.t('badge.consent.expired', '已过期'),  tone: 'warn',  icon: '⌛' },
      revoked: { name: PHR.t('badge.consent.revoked', '已撤销'),  tone: 'muted', icon: '🚫' }
    };
    var hit = map[status] || map.revoked;
    return badge(hit.name, hit.tone, { icon: hit.icon });
  }

  /** 审计动作风险徽章 */
  function actionRisk(actionKey) {
    var hit = (D.auditAction || []).filter(function (a) { return a.key === actionKey; })[0];
    if (!hit) { return badge(PHR.t('badge.unknownAction', '未知操作'), 'muted'); }
    var tone = hit.risk === 'danger' ? 'danger' : hit.risk === 'warn' ? 'warn' : 'info';
    // 同 severity：走 nameOf 让动作名随语言切换
    return badge(D.nameOf(D.auditAction, actionKey), tone);
  }

  /** 审计结果徽章 */
  function auditResult(result) {
    var map = {
      success: { name: PHR.t('badge.result.success', '成功'),   tone: 'ok' },
      fail:    { name: PHR.t('badge.result.fail',    '失败'),   tone: 'warn' },
      denied:  { name: PHR.t('badge.result.denied',  '已阻断'), tone: 'danger' }
    };
    var hit = map[result] || map.success;
    return badge(hit.name, hit.tone);
  }

  /** 数据来源徽章 */
  function source(src, name) {
    if (src === 'sync') {
      return badge(PHR.t('badge.source.sync', '医院同步'), 'info', { icon: '🔄', title: name || '' });
    }
    if (src === 'import') { return badge(PHR.t('badge.source.import', '外部导入'), 'accent'); }
    return badge(PHR.t('badge.source.manual', '手动录入'), 'muted');
  }

  /** 指标变化方向 */
  function delta(value, unit, betterIsLower) {
    if (value === null || value === undefined || isNaN(value) || value === 0) {
      return '<span class="delta dim">' + PHR.t('badge.delta.same', '— 与上次持平') + '</span>';
    }
    var up = value > 0;
    var good = betterIsLower ? !up : up;
    var tone = good ? 'ok' : 'danger';
    var arrow = up ? '▲' : '▼';
    var tpl = up ? 'badge.delta.up' : 'badge.delta.down';
    return '<span class="delta ' + tone + '">' +
      PHR.t(tpl, arrow + ' {value}{unit} 较上次', {
        value: dom.num(Math.abs(value), 1),
        unit: unit ? ' ' + dom.esc(unit) : ''
      }) + '</span>';
  }

  PHR.ui.badge = badge;
  PHR.ui.badges = {
    badge: badge,
    severity: severity,
    metricLevel: metricLevel,
    recordType: recordType,
    diseaseCat: diseaseCat,
    consentStatus: consentStatus,
    actionRisk: actionRisk,
    auditResult: auditResult,
    source: source,
    delta: delta
  };

})(window.PHR);
