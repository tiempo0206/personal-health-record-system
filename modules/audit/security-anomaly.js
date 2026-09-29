/**
 * ============================================================================
 * 文件：modules/audit/security-anomaly.js
 * 层：业务模块层（访问追踪 —— 模块 6）
 * 职责：异常访问检测与安全告警管理。
 *      检测规则本身定义在 core/security.js（安全治理层），本文件只负责
 *      「调用规则 → 去重 → 落库 → 通知界面」，避免同一个阈值在两处维护。
 * 依赖：core/security.js、core/models.js、core/store.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ================================================================== *
   * 一、扫描并落库
   * ================================================================== */

  /** 同一条规则在同一天内只产生一条告警，避免重复刷屏 */
  function dedupeKey(alert, day) { return alert.rule + '@' + day; }

  /**
   * 重新扫描审计日志，把新出现的异常写入告警集合。
   * @returns {Array} 本次新增的告警
   */
  function scanAlerts() {
    var entries = PHR.audit.mine();
    var detected = PHR.security.detectAnomalies(entries, {
      userId: PHR.session && PHR.session.currentUser() ? PHR.session.currentUser().id : ''
    });

    var existing = PHR.db.alerts.all();
    var seen = {};
    existing.forEach(function (a) { seen[a.dedupeKey] = true; });

    var today = U.today();
    var added = [];

    detected.forEach(function (a) {
      var key = dedupeKey(a, today);
      if (seen[key]) {
        // 已存在：只刷新计数与详情，不重复插入
        var old = existing.filter(function (x) { return x.dedupeKey === key; })[0];
        if (old && old.count !== a.count) {
          PHR.db.alerts.update(old.id, { count: a.count, detail: a.detail, at: Date.now() });
        }
        return;
      }
      var row = PHR.db.alerts.insert({
        userId: PHR.session && PHR.session.currentUser() ? PHR.session.currentUser().id : '',
        rule: a.rule,
        name: a.name,
        tone: a.tone,
        severity: a.severity,
        desc: a.desc,
        detail: a.detail,
        suggestion: a.suggestion,
        count: a.count,
        dedupeKey: key,
        read: false,
        dismissed: false,
        at: Date.now()
      });
      added.push(row);
      PHR.bus.emit('security:alert', { alert: row });
    });

    if (added.length) {
      PHR.audit.log({
        action: 'security.alert',
        targetType: 'alert',
        targetName: added.map(function (a) { return a.name; }).join(PHR.t('audit.listSep', '、')),
        detail: PHR.t('audit.scanLogDetail', '异常访问扫描发现 {n} 类新的异常行为', { n: added.length }),
        result: 'success',
        actor: PHR.t('audit.actor.system', '系统'),
        actorType: 'system'
      });
    }
    return added;
  }

  /* ================================================================== *
   * 二、读取
   * ================================================================== */
  /** 全部告警（时间倒序，未忽略的排在前面） */
  function alerts(opt) {
    opt = opt || {};
    var list = U.sortBy(PHR.db.alerts.all(), 'at', true);
    if (!opt.includeDismissed) { list = list.filter(function (a) { return !a.dismissed; }); }
    return list;
  }

  /** 实时的异常检测结果（不落库，用于"当前风险"卡片） */
  function live() {
    return PHR.security.detectAnomalies(PHR.audit.mine(), {
      userId: PHR.session && PHR.session.currentUser() ? PHR.session.currentUser().id : ''
    });
  }

  /** 未读告警数（顶栏铃铛用） */
  function countUnread() {
    return PHR.db.alerts.all().filter(function (a) { return !a.read && !a.dismissed; }).length;
  }

  /** 全部标记为已读 */
  function markAllRead() {
    var n = 0;
    PHR.db.alerts.all().forEach(function (a) {
      if (!a.read) { PHR.db.alerts.update(a.id, { read: true }); n++; }
    });
    if (n) { PHR.bus.emit('shell:refreshAlertBadge'); }
    return n;
  }

  /** 忽略一条告警 */
  function dismiss(id) {
    PHR.db.alerts.update(id, { dismissed: true, read: true });
    PHR.bus.emit('shell:refreshAlertBadge');
  }

  /** 清空全部告警 */
  function clearAll() {
    PHR.db.alerts.clear();
    PHR.bus.emit('shell:refreshAlertBadge');
  }

  /* ================================================================== *
   * 三、风险评分
   *     把告警折算成 0~100 的"账号风险分"（分越高越危险），
   *     供安全设置页与访问追踪页展示。
   * ================================================================== */
  function riskScore() {
    var list = alerts();
    var score = 0;
    list.forEach(function (a) {
      score += a.tone === 'danger' ? 22 : 10;
      if (a.count >= 5) { score += 8; }
    });
    score = Math.min(100, score);
    var level = score === 0 ? PHR.t('audit.riskLevel.low', '低')
              : score < 25 ? PHR.t('audit.riskLevel.fairlyLow', '较低')
              : score < 50 ? PHR.t('audit.riskLevel.moderate', '中等')
              : score < 75 ? PHR.t('audit.riskLevel.fairlyHigh', '较高')
              : PHR.t('audit.riskLevel.high', '高');
    var tone = score === 0 ? 'ok' : score < 25 ? 'ok' : score < 50 ? 'warn' : 'danger';
    return { score: score, level: level, tone: tone, alertCount: list.length };
  }

  /* ================================================================== *
   * 四、挂载到 PHR.audit
   * ================================================================== */
  PHR.audit.scanAlerts = scanAlerts;
  PHR.audit.alerts = alerts;
  PHR.audit.liveAlerts = live;
  PHR.audit.countUnreadAlerts = countUnread;
  PHR.audit.markAlertsRead = markAllRead;
  PHR.audit.dismissAlert = dismiss;
  PHR.audit.clearAlerts = clearAll;
  PHR.audit.riskScore = riskScore;

  /* 登录后自动扫一次，让用户一进来就能看到风险概览 */
  PHR.bus.on('auth:login', function () {
    setTimeout(function () { try { scanAlerts(); } catch (e) { /* 忽略 */ } }, 300);
  });

})(window.PHR);
