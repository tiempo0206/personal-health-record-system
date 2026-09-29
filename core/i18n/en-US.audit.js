/**
 * 文件：core/i18n/en-US.audit.js
 * 层：核心基础设施层（国际化 · 英文词条 · 访问追踪模块）
 * 职责：登记访问追踪模块中文文案对应的英文词条（四个页签、筛选与统计、
 *      告警展示、导出文件名等）。
 * 依赖：core/i18n/i18n.js
 *
 * 说明：
 *   · 键名统一前缀 audit.（模块标题用 module.audit.title），与源码里的
 *     PHR.t('audit.xxx', '中文原文') 一一对应，不登记源码未用到的键。
 *   · 审计动作名走字典层（dict.auditAction.*，见 en-US.js），审计结果名
 *     复用通用徽章词条（badge.result.*），此处都不重复登记。
 *   · 六条异常检测规则的中文名与说明定义在 core/security.js（安全治理层），
 *     由该层自行登记，本文件不重复登记。
 */
(function (PHR) {
  'use strict';
  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    'module.audit.title': 'Access Log',
    'module.audit.desc': 'Record and review every access to your health records to detect unusual activity.',
    'audit.warn.writeFail': 'Failed to write audit log',

    /* ---------- 页头与页签 ---------- */
    'audit.tab.logs': 'Operation log',
    'audit.tab.doctors': 'Doctor activity',
    'audit.tab.stats': 'Statistics',
    'audit.scanNow': '🔄 Scan now',
    'audit.exportCsv': '⬇️ Export CSV',
    'audit.exportJson': '⬇️ Export JSON',
    'audit.exportCsvOk': 'CSV file exported',
    'audit.exportJsonOk': 'JSON file exported',
    'audit.scanFound': 'Scan complete — {n} new types of abnormal activity',
    'audit.scanNone': 'Scan complete — no new abnormal activity',

    /* ---------- 概览卡片 ---------- */
    'audit.tile.total': 'Total audit entries',
    'audit.tile.latest': 'Latest {when}',
    'audit.tile.week': 'Activity in the last 7 days',
    'audit.tile.weekToday': '{n} of them today',
    'audit.tile.denied': 'Blocked unauthorised access',
    'audit.tile.deniedYes': 'Blocked automatically',
    'audit.tile.deniedNo': 'No unauthorised attempts',
    'audit.riskScore': 'Account risk score',
    'audit.tile.riskHint': 'Risk level: {level}, {n} alerts',
    'audit.unit.records': 'entries',
    'audit.unit.times': 'times',
    'audit.unit.points': 'points',

    /* ---------- 筛选栏 ---------- */
    'audit.filter.keyword': 'Search action, target or detail…',
    'audit.filter.from': 'Start date',
    'audit.filter.to': 'End date',
    'audit.filter.toSep': 'to',
    'audit.filter.allGroups': 'All modules',
    'audit.filter.allResults': 'All results',
    'audit.filter.onlyRisk': 'Risk-related actions only',

    /* ---------- 表格列头与详情字段 ---------- */
    'audit.col.time': 'Time',
    'audit.col.actor': 'Actor',
    'audit.col.action': 'Action',
    'audit.col.targetDetail': 'Target & details',
    'audit.col.result': 'Result',
    'audit.col.source': 'Source',
    'audit.col.ops': 'Actions',
    'audit.col.target': 'Target',
    'audit.col.detail': 'Detail',
    'audit.col.module': 'Module',
    'audit.col.srcIp': 'Source IP',
    'audit.col.device': 'Device',
    'audit.col.identity': 'Role',
    'audit.col.targetType': 'Target type',
    'audit.col.doctor': 'Doctor',
    'audit.col.count': 'Accesses',
    'audit.col.lastAt': 'Last access',
    'audit.col.scopes': 'Records viewed',
    'audit.detailTitle': 'Audit detail',
    'audit.detail.actorWithType': '{name} ({type})',

    /* ---------- 操作者身份 ---------- */
    'audit.actorType.user': 'Owner',
    'audit.actorType.doctor': 'Doctor',
    'audit.actorType.system': 'System',
    'audit.actor.guest': 'Guest',
    'audit.actor.system': 'System',
    'audit.systemModule': 'System',
    'audit.logViewDetail': 'Viewed “{module} → {view}”',
    'audit.env.unknownOs': 'Unknown OS',
    'audit.env.unknownBrowser': 'Unknown browser',

    /* ---------- 安全告警页 ---------- */
    'audit.notice.title': 'How is abnormal access detected?',
    'audit.notice.body': 'Six detection rules are built in (brute force, off-hours access, bulk lookups in a short window, blocked unauthorised access, data export and account lockout). Every time you open this page or choose Scan now, all audit entries are analysed again.',
    'audit.riskLevel': 'Risk level',
    'audit.activeAlerts': 'Active alerts',
    'audit.nAlerts': '{n} alerts',
    'audit.nTimes': '{n} times',
    'audit.deniedBlocked': 'Unauthorised access blocked',
    'audit.liveTitle': 'Live detection results',
    'audit.liveSep': ': ',
    'audit.liveNone': 'No abnormal access detected at the moment.',
    'audit.alertList': 'Alert list',
    'audit.totalAlerts': 'Total {n}',
    'audit.markAllRead': 'Mark all as read',
    'audit.markReadOk': 'Marked {n} alerts as read',
    'audit.clearAlerts': 'Clear alerts',
    'audit.clearAlertsMsg': 'Clear all security alerts?',
    'audit.clearAlertsDetail': 'This does not affect the audit log itself. If the abnormal activity persists, the next scan will raise the alerts again.',
    'audit.cleared': 'Alerts cleared',
    'audit.emptyAlertsTitle': 'No alerts to deal with',
    'audit.emptyAlertsHint': 'Abnormal access is monitored continuously. If someone tries to view records they are not authorised for, or downloads records in bulk outside normal hours, an alert will appear here.',
    'audit.unread': 'Unread',
    'audit.suggestionLabel': 'Recommendation:',
    'audit.dismiss': 'Dismiss',
    'audit.gotoConsent': 'Manage access',
    'audit.gaugeLabel': 'Risk score',

    /* ---------- 医生行为页 ---------- */
    'audit.doctors.emptyTitle': 'No doctor access yet',
    'audit.doctors.emptyHint': 'Once you share records with a doctor, every access they make is recorded here.',
    'audit.doctors.emptyAction': 'Create a consent',
    'audit.doctors.noticeTitle': 'Why look at this page?',
    'audit.doctors.noticeBody': 'Even after granting access, you still need to know what the doctor actually looked at. These statistics help you judge whether a doctor’s volume of access matches the clinical need, whether there have been attempts beyond the consent, and whether the access times look normal.',
    'audit.doctors.chartTitle': 'Accesses by doctor',
    'audit.doctors.hourTitle': 'Access by time of day',
    'audit.doctors.hourHint': 'Access between midnight and 6 am is flagged as off-hours',
    'audit.doctors.tableTitle': 'Doctor details',

    /* ---------- 统计分析页 ---------- */
    'audit.stats.byGroup': 'By module',
    'audit.stats.topActions': 'Most frequent actions',
    'audit.stats.trend': 'Action trend over the last 30 days',
    'audit.stats.trendHint': 'Bar height shows the number of audit entries that day',
    'audit.stats.results': 'Result breakdown',
    'audit.stats.totalRecords': 'Total entries',
    'audit.hourLabel': '{h}:00',

    /* ---------- 动作分组（core/dict.js 的分组名，仅展示用） ---------- */
    'audit.group.auth': 'Account security',
    'audit.group.records': 'Health records',
    'audit.group.search': 'Smart search',
    'audit.group.insight': 'Health insight',
    'audit.group.consent': 'Consent management',
    'audit.group.community': 'Community',
    'audit.group.assessment': 'Mental health',
    'audit.group.ux': 'Data & preferences',
    'audit.group.security': 'Security',
    'audit.group.other': 'Other',

    /* ---------- 导出 ---------- */
    'audit.export.filePrefix': 'PHR-access-log_',
    'audit.export.targetName': 'Access log ({format})',
    'audit.export.detail': 'Exported {n} audit entries',
    'audit.listSep': ', ',
    'audit.purged': 'Purged {n} expired audit entries',

    /* ---------- 异常扫描与风险分级（modules/audit/security-anomaly.js） ---------- */
    'audit.scanLogDetail': 'The anomaly scan found {n} new types of abnormal activity',
    'audit.riskLevel.low': 'Low',
    'audit.riskLevel.fairlyLow': 'Fairly low',
    'audit.riskLevel.moderate': 'Moderate',
    'audit.riskLevel.fairlyHigh': 'Fairly high',
    'audit.riskLevel.high': 'High'
  });

})(window.PHR);
