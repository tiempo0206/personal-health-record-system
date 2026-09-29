/**
 * ============================================================================
 * 文件：modules/audit/audit.view.js
 * 层：业务模块层（访问追踪 —— 模块 6）
 * 职责：注册「访问追踪」页面，用四个页签呈现：
 *      ① 操作日志   完整的、可筛选的审计流水
 *      ② 安全告警   异常访问检测结果与处置建议
 *      ③ 医生行为   每个医生的访问次数、时段分布、被阻断次数
 *      ④ 统计分析   按动作分组 / 按天趋势 / 越权分布
 * 依赖：modules/audit/audit.service.js、audit.query.js、anomaly.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;

  /* 页面级状态 */
  var state = {
    tab: 'logs',
    filter: { from: '', to: '', groups: [], results: [], keyword: '', onlyRisk: false },
    table: null
  };

  /* 视图标题由 ui/shell.js 统一按 view.<视图名>.title 取词（此处的中文只是兜底），
     因此这里保持原样即可；要改标题请改 core/i18n/en-US.js 的 view.audit.title。 */
  PHR.registerView('audit', {
    title: PHR.t('view.audit.title', '访问追踪'), icon: '👁️', group: 'main', order: 6, module: 'audit',
    auditView: false,          // 打开审计页本身不写审计，避免自我循环
    render: render
  });

  /* ================================================================== *
   * 一、页面骨架
   * ================================================================== */
  function render(root) {
    var s = PHR.audit.stats();
    var risk = PHR.audit.riskScore();

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>' + PHR.t('view.audit.title', '访问追踪') + '</h2>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="scan">' + PHR.t('audit.scanNow', '🔄 立即扫描') + '</button>' +
          '<button class="btn" data-action="export-csv">' + PHR.t('audit.exportCsv', '⬇️ 导出 CSV') + '</button>' +
          '<button class="btn" data-action="export-json">' + PHR.t('audit.exportJson', '⬇️ 导出 JSON') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid g4 mb5">' +
        tile(PHR.t('audit.tile.total', '审计记录总数'), dom.num(s.total), PHR.t('audit.unit.records', '条'), '📋', '',
             PHR.t('audit.tile.latest', '最近一条 {when}', { when: s.lastAt ? U.fmtRelative(s.lastAt) : '—' })) +
        tile(PHR.t('audit.tile.week', '近 7 天活动'), dom.num(s.week), PHR.t('audit.unit.times', '次'), '📅', 'info',
             PHR.t('audit.tile.weekToday', '其中今天 {n} 次', { n: s.today })) +
        tile(PHR.t('audit.tile.denied', '被阻断的越权访问'), String(s.denied), PHR.t('audit.unit.times', '次'), '⛔',
             s.denied ? 'danger' : 'ok',
             s.denied ? PHR.t('audit.tile.deniedYes', '系统已自动拦截') : PHR.t('audit.tile.deniedNo', '未发现越权尝试')) +
        tile(PHR.t('audit.riskScore', '账号风险评分'), risk.score + '', PHR.t('audit.unit.points', '分'), '🛡️', risk.tone,
             PHR.t('audit.tile.riskHint', '风险等级：{level}，共 {n} 条告警', { level: risk.level, n: risk.alertCount })) +
      '</div>' +

      '<div class="tabs" id="audit-tabs" role="tablist">' +
        tabBtn('logs', PHR.t('audit.tab.logs', '操作日志'), s.total) +
        tabBtn('alerts', PHR.t('shell.alerts', '安全告警'), PHR.audit.alerts().length) +
        tabBtn('doctors', PHR.t('audit.tab.doctors', '医生行为'), s.doctors) +
        tabBtn('stats', PHR.t('audit.tab.stats', '统计分析'), '') +
      '</div>' +
      '<div id="audit-panel"></div>';

    dom.actions(root, {
      scan: scanNow,
      'export-csv': function () { PHR.audit.exportFile('csv'); PHR.ui.toast.ok(PHR.t('audit.exportCsvOk', '已导出 CSV 文件')); },
      'export-json': function () { PHR.audit.exportFile('json'); PHR.ui.toast.ok(PHR.t('audit.exportJsonOk', '已导出 JSON 文件')); }
    });

    var tabs = U.$('#audit-tabs', root);
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tab]');
        if (!b) { return; }
        state.tab = b.getAttribute('data-tab');
        U.$$('[data-tab]', root).forEach(function (x) {
          x.setAttribute('aria-selected', String(x === b));
        });
        drawPanel();
      });
    }

    drawPanel();
  }

  function tile(label, value, unit, icon, tone, deltaText) {
    return '<div class="stat' + (tone ? ' tone-' + tone : '') + '">' +
      '<span class="corner"></span>' +
      '<div class="label">' + icon + ' ' + dom.esc(label) + '</div>' +
      '<div class="value">' + dom.esc(value) + '<span class="unit">' + dom.esc(unit) + '</span></div>' +
      '<div class="delta dim">' + dom.esc(deltaText) + '</div>' +
    '</div>';
  }

  function tabBtn(key, label, count) {
    return '<button role="tab" data-tab="' + key + '" aria-selected="' + (state.tab === key) + '">' +
      dom.esc(label) + (count !== '' && count !== undefined ? '<span class="cnt">' + count + '</span>' : '') +
      '</button>';
  }

  function scanNow() {
    var added = PHR.audit.scanAlerts();
    PHR.audit.markAlertsRead();
    PHR.ui.toast.ok(added.length
      ? PHR.t('audit.scanFound', '扫描完成，发现 {n} 类新的异常行为', { n: added.length })
      : PHR.t('audit.scanNone', '扫描完成，未发现新的异常行为'));
    PHR.router.reload();
  }

  function drawPanel() {
    var panel = document.getElementById('audit-panel');
    if (!panel) { return; }
    if (state.tab === 'logs') { drawLogs(panel); }
    else if (state.tab === 'alerts') { drawAlerts(panel); }
    else if (state.tab === 'doctors') { drawDoctors(panel); }
    else { drawStats(panel); }
  }

  /* ================================================================== *
   * 二、页签一：操作日志
   * ================================================================== */
  function drawLogs(panel) {
    var opts = PHR.audit.filterOptions();
    var f = state.filter;

    panel.innerHTML =
      '<div class="card mb4"><div class="card-body tight">' +
        '<div class="row wrap gap3">' +
          '<div class="search-input-wrap" style="min-width:220px">' +
            '<span class="ico">🔍</span>' +
            '<input class="input" id="f-keyword" placeholder="' + PHR.t('audit.filter.keyword', '搜索动作、对象或详情…') + '" value="' + dom.esc(f.keyword) + '">' +
          '</div>' +
          '<input class="input" type="date" id="f-from" style="width:150px" value="' + dom.esc(f.from) + '" title="' + PHR.t('audit.filter.from', '起始日期') + '">' +
          '<span class="dim">' + PHR.t('audit.filter.toSep', '至') + '</span>' +
          '<input class="input" type="date" id="f-to" style="width:150px" value="' + dom.esc(f.to) + '" title="' + PHR.t('audit.filter.to', '结束日期') + '">' +
          '<select class="select" id="f-group" style="width:150px">' +
            '<option value="">' + PHR.t('audit.filter.allGroups', '全部模块') + '</option>' +
            opts.groups.map(function (g) {
              return '<option value="' + dom.esc(g) + '"' + (f.groups[0] === g ? ' selected' : '') + '>' +
                dom.esc(PHR.audit.actionGroupLabel(g)) + '</option>';
            }).join('') +
          '</select>' +
          '<select class="select" id="f-result" style="width:130px">' +
            '<option value="">' + PHR.t('audit.filter.allResults', '全部结果') + '</option>' +
            opts.results.map(function (r) {
              return '<option value="' + r.key + '"' + (f.results[0] === r.key ? ' selected' : '') + '>' + r.name + '</option>';
            }).join('') +
          '</select>' +
          '<label class="checkbox" style="padding:0"><input type="checkbox" id="f-risk"' + (f.onlyRisk ? ' checked' : '') +
            '><span>' + PHR.t('audit.filter.onlyRisk', '只看风险动作') + '</span></label>' +
          '<button class="btn btn-sm" data-action="reset-filter" data-stop>' + PHR.t('ui.reset', '重置') + '</button>' +
        '</div>' +
      '</div></div>' +

      '<div class="card"><div class="card-body flush" id="log-list"></div></div>';

    dom.actions(panel, {
      'reset-filter': function () {
        state.filter = { from: '', to: '', groups: [], results: [], keyword: '', onlyRisk: false };
        drawLogs(panel);
      }
    });

    function readFilter() {
      state.filter = {
        from: U.$('#f-from', panel).value,
        to: U.$('#f-to', panel).value,
        groups: U.$('#f-group', panel).value ? [U.$('#f-group', panel).value] : [],
        results: U.$('#f-result', panel).value ? [U.$('#f-result', panel).value] : [],
        keyword: U.$('#f-keyword', panel).value.trim(),
        onlyRisk: U.$('#f-risk', panel).checked
      };
      // 结束日期要包含当天 23:59
      var q = U.clone(state.filter);
      if (q.to) { q.to = U.parseDate(q.to) + 86399000; }
      if (q.from) { q.from = U.parseDate(q.from); }
      return q;
    }

    var listEl = U.$('#log-list', panel);
    state.table = PHR.ui.table(listEl, {
      pageSize: 15,
      columns: [
        { key: 'at', label: PHR.t('audit.col.time', '时间'), width: '150px', sortable: true,
          render: function (e) {
            return '<div class="t-sm">' + U.fmtDateTime(e.at) + '</div>' +
              '<div class="t-xs dim">' + U.fmtRelative(e.at) + '</div>';
          } },
        { key: 'actor', label: PHR.t('audit.col.actor', '操作者'), width: '130px', sortable: true,
          render: function (e) {
            var icon = e.actorType === 'doctor' ? '👨⚕️' : e.actorType === 'system' ? '🤖' : '🙋';
            return '<div class="row gap2">' + icon + '<span>' + dom.esc(e.actor) + '</span></div>';
          } },
        { key: 'action', label: PHR.t('audit.col.action', '动作'), width: '150px', sortable: true,
          render: function (e) { return PHR.ui.badges.actionRisk(e.action); } },
        { key: 'targetName', label: PHR.t('audit.col.targetDetail', '对象与详情'),
          render: function (e) {
            return '<div class="semibold">' + dom.esc(e.targetName || '—') + '</div>' +
              (e.detail ? '<div class="t-xs dim">' + dom.esc(e.detail) + '</div>' : '');
          } },
        { key: 'result', label: PHR.t('audit.col.result', '结果'), width: '90px', align: 'center',
          render: function (e) { return PHR.ui.badges.auditResult(e.result); } },
        { key: 'ip', label: PHR.t('audit.col.source', '来源'), width: '170px',
          render: function (e) {
            return '<div class="t-xs mono">' + dom.esc(e.ip) + '</div>' +
              '<div class="t-xs dim">' + dom.esc(e.device) + '</div>';
          } },
        { key: 'ops', label: PHR.t('audit.col.ops', '操作'), width: '70px', align: 'right',
          render: function () { return '<button class="btn btn-sm btn-ghost" data-action="detail" data-stop>' + PHR.t('ui.viewDetail', '详情') + '</button>'; } }
      ]
    });

    function refresh() {
      state.table.refresh(PHR.audit.query(readFilter()));
    }
    refresh();

    var deb = U.debounce(refresh, 260);
    ['f-keyword'].forEach(function (id) { U.$('#' + id, panel).addEventListener('input', deb); });
    ['f-from', 'f-to', 'f-group', 'f-result', 'f-risk'].forEach(function (id) {
      U.$('#' + id, panel).addEventListener('change', refresh);
    });

    dom.actions(panel, {
      detail: function (e, el) {
        var tr = el.closest('tr');
        var idx = Number(tr.getAttribute('data-row'));
        var rows = state.table.getRows();
        var entry = rows[idx];
        if (!entry) { return; }
        showDetail(entry);
      }
    });
  }

  function showDetail(e) {
    PHR.ui.detailModal({
      title: PHR.t('audit.detailTitle', '审计详情'),
      fields: [
        [PHR.t('audit.col.time', '时间'), U.fmtFull(e.at)],
        [PHR.t('audit.col.actor', '操作者'), PHR.t('audit.detail.actorWithType', '{name}（{type}）', {
          name: dom.esc(e.actor),
          type: PHR.audit.actorTypeName(e.actorType)
        })],
        [PHR.t('audit.col.action', '动作'), PHR.ui.badges.actionRisk(e.action)],
        [PHR.t('audit.col.module', '所属模块'), dom.esc(PHR.audit.actionGroupLabel(PHR.audit.actionGroup(e.action)))],
        [PHR.t('audit.col.target', '对象'), dom.esc(e.targetName || '—')],
        [PHR.t('audit.col.detail', '详情'), dom.esc(e.detail || '—')],
        [PHR.t('audit.col.result', '结果'), PHR.ui.badges.auditResult(e.result)],
        [PHR.t('audit.col.srcIp', '来源 IP'), '<span class="mono">' + dom.esc(e.ip) + '</span>'],
        [PHR.t('audit.col.device', '设备'), dom.esc(e.device)]
      ]
    });
  }

  /* ================================================================== *
   * 三、页签二：安全告警
   * ================================================================== */
  function drawAlerts(panel) {
    var list = PHR.audit.alerts();
    var live = PHR.audit.liveAlerts();
    var risk = PHR.audit.riskScore();

    var html =
      PHR.ui.notice('info', PHR.t('audit.notice.title', '异常访问是怎么被发现的？'),
        PHR.t('audit.notice.body',
          '系统内置了 6 条检测规则（暴力破解、非惯常时段访问、短时批量查阅、越权访问被拒绝、数据导出行为、账号被锁定），' +
          '每次打开本页或点击「立即扫描」都会重新分析全部审计日志。'), { icon: '🧠' }) +

      '<div class="grid g2 mb5">' +
        '<div class="card"><div class="card-body">' +
          '<div class="callout-title">🛡️ ' + PHR.t('audit.riskScore', '账号风险评分') + '</div>' +
          '<div class="risk-gauge"><div id="risk-gauge"></div>' +
            '<div class="risk-list">' +
              '<div class="row between"><span>' + PHR.t('audit.riskLevel', '风险等级') + '</span><span class="badge tone-' + risk.tone + '">' + risk.level + '</span></div>' +
              '<div class="row between"><span>' + PHR.t('audit.activeAlerts', '活跃告警') + '</span><span class="bold">' + PHR.t('audit.nAlerts', '{n} 条', { n: risk.alertCount }) + '</span></div>' +
              '<div class="row between"><span>' + PHR.t('audit.deniedBlocked', '越权被阻断') + '</span><span class="bold">' + PHR.t('audit.nTimes', '{n} 次', { n: PHR.audit.stats().denied }) + '</span></div>' +
            '</div>' +
          '</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-body">' +
          '<div class="callout-title">🔍 ' + PHR.t('audit.liveTitle', '实时检测结果') + '</div>' +
          (live.length
            ? '<ul style="margin:0;padding-left:1.2em">' + live.map(function (a) {
                return '<li><b>' + dom.esc(a.name) + '</b>' + PHR.t('audit.liveSep', '：') + dom.esc(a.detail) + '</li>';
              }).join('') + '</ul>'
            : '<div class="dim">' + PHR.t('audit.liveNone', '当前未检测到异常访问行为。') + '</div>') +
        '</div></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h3>' + PHR.t('audit.alertList', '告警列表') + dom.tip(PHR.t('audit.emptyAlertsHint',
          '系统会持续监测异常访问行为。当有人尝试越权查看、或在非惯常时段批量下载档案时，这里会出现提醒。')) + '</h3>' +
          '<div class="sub">' + PHR.t('audit.totalAlerts', '共 {n} 条', { n: list.length }) + '</div>' +
          '<div class="actions">' +
            '<button class="btn btn-sm" data-action="mark-read">' + PHR.t('audit.markAllRead', '全部标记已读') + '</button>' +
            '<button class="btn btn-sm" data-action="clear-alerts">' + PHR.t('audit.clearAlerts', '清空告警') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          (list.length ? list.map(alertCard).join('') : PHR.ui.empty({
            icon: '✅', title: PHR.t('audit.emptyAlertsTitle', '没有需要处理的告警')
          })) +
        '</div>' +
      '</div>';

    panel.innerHTML = html;

    var g = document.getElementById('risk-gauge');
    if (g) {
      PHR.ui.chart.gauge(g, {
        percent: risk.score, value: risk.score, label: PHR.t('audit.gaugeLabel', '风险分'),
        color: risk.tone === 'ok' ? 'var(--ok)' : risk.tone === 'warn' ? 'var(--warn)' : 'var(--danger)'
      });
    }

    dom.actions(panel, {
      'mark-read': function () {
        var n = PHR.audit.markAlertsRead();
        PHR.ui.toast.ok(PHR.t('audit.markReadOk', '已标记 {n} 条告警为已读', { n: n }));
        drawAlerts(panel);
      },
      'clear-alerts': function () {
        PHR.ui.confirm({
          title: PHR.t('audit.clearAlerts', '清空告警'),
          message: PHR.t('audit.clearAlertsMsg', '确定清空全部安全告警吗？'),
          detail: PHR.t('audit.clearAlertsDetail', '清空后不影响审计日志本身，下次扫描若仍存在异常会重新生成告警。')
        }).then(function (ok) { if (ok) { PHR.audit.clearAlerts(); drawAlerts(panel); PHR.ui.toast.ok(PHR.t('audit.cleared', '已清空告警')); } });
      },
      dismiss: function (e, el) {
        PHR.audit.dismissAlert(el.getAttribute('data-id'));
        drawAlerts(panel);
      },
      'goto-consent': function () { PHR.router.go('/consent'); }
    });
  }

  function alertCard(a) {
    var sev = a.tone === 'danger' ? 'sev-high' : a.tone === 'warn' ? 'sev-medium' : 'sev-low';
    return '<div class="alert-card ' + sev + '">' +
      '<span class="ico">' + (a.tone === 'danger' ? '🚨' : '⚠️') + '</span>' +
      '<div class="body">' +
        '<div class="t">' + dom.esc(a.name) +
          '<span class="badge tone-muted ml2">' + U.fmtRelative(a.at) + '</span>' +
          (a.read ? '' : '<span class="badge tone-danger ml2">' + PHR.t('audit.unread', '未读') + '</span>') +
          (a.count > 1 ? '<span class="badge tone-warn ml2">' + PHR.t('audit.nTimes', '{n} 次', { n: a.count }) + '</span>' : '') +
        '</div>' +
        '<div class="d">' + dom.esc(a.detail) + '</div>' +
        '<div class="s"><b>' + PHR.t('audit.suggestionLabel', '建议：') + '</b>' + dom.esc(a.suggestion) +
          (a.rule === 'denied_access' || a.rule === 'off_hours_access' || a.rule === 'bulk_read'
            ? ' <button class="btn btn-sm btn-soft" data-action="goto-consent" data-stop>' + PHR.t('audit.gotoConsent', '去管理授权') + '</button>' : '') +
        '</div>' +
      '</div>' +
      '<button class="btn btn-sm btn-ghost" data-action="dismiss" data-id="' + dom.esc(a.id) + '">' + PHR.t('audit.dismiss', '忽略') + '</button>' +
    '</div>';
  }

  /* ================================================================== *
   * 四、页签三：医生行为
   * ================================================================== */
  function drawDoctors(panel) {
    var list = PHR.audit.byDoctor();

    if (!list.length) {
      panel.innerHTML = '<div class="card"><div class="card-body">' + PHR.ui.empty({
        icon: '👨⚕️', title: PHR.t('audit.doctors.emptyTitle', '还没有医生访问记录'),
        hint: PHR.t('audit.doctors.emptyHint', '当您把档案授权给医生后，医生的每一次查阅都会记录在这里。'),
        action: { label: PHR.t('audit.doctors.emptyAction', '去创建授权'), action: 'goto' }
      }) + '</div></div>';
      dom.actions(panel, { goto: function () { PHR.router.go('/consent'); } });
      return;
    }

    panel.innerHTML =
      PHR.ui.notice('info', PHR.t('audit.doctors.noticeTitle', '为什么要看这一页？'),
        PHR.t('audit.doctors.noticeBody',
          '授权之后，您仍然需要知道医生实际看了什么。这里的统计可以帮助您判断：' +
          '某位医生的查阅量是否与就诊需要相称、是否出现过越权尝试、访问时间是否正常。'), { icon: '💡' }) +

      '<div class="card mb4"><div class="card-head"><h3>' + PHR.t('audit.doctors.chartTitle', '医生访问次数') + '</h3></div>' +
        '<div class="card-body" id="doctor-chart"></div></div>' +

      '<div class="card mb4"><div class="card-head"><h3>' + PHR.t('audit.doctors.hourTitle', '访问时段分布') + '</h3>' +
        '<div class="sub">' + PHR.t('audit.doctors.hourHint', '凌晨 0—6 点的访问会被标记为「非惯常时段」') + '</div></div>' +
        '<div class="card-body" id="hour-chart"></div></div>' +

      '<div class="card"><div class="card-head"><h3>' + PHR.t('audit.doctors.tableTitle', '医生明细') + '</h3></div>' +
        '<div class="card-body flush" id="doctor-table"></div></div>';

    PHR.ui.chart.bar(document.getElementById('doctor-chart'), {
      items: list.map(function (d, i) {
        return { label: d.name, value: d.count, color: 'var(--c' + ((i % 8) + 1) + ')' };
      }),
      yUnit: PHR.t('audit.unit.times', '次'), height: 200
    });

    PHR.ui.chart.bar(document.getElementById('hour-chart'), {
      items: PHR.audit.byHour().filter(function (h, i) { return i % 2 === 0; }),
      height: 170, horizontal: false, yUnit: PHR.t('audit.unit.times', '次')
    });

    PHR.ui.table(document.getElementById('doctor-table'), {
      pageSize: 0,
      columns: [
        { key: 'name', label: PHR.t('audit.col.doctor', '医生'), render: function (d) {
            return '<div class="row gap2"><span class="avatar sm" style="background:var(--info)">' +
              dom.esc(d.name.slice(0, 1)) + '</span><span class="semibold">' + dom.esc(d.name) + '</span></div>';
          } },
        { key: 'count', label: PHR.t('audit.col.count', '访问次数'), width: '100px', align: 'right',
          render: function (d) { return '<span class="bold">' + d.count + '</span> ' + PHR.t('audit.unit.times', '次'); } },
        { key: 'denied', label: PHR.t('audit.deniedBlocked', '越权被阻断'), width: '110px', align: 'right',
          render: function (d) {
            return d.denied ? PHR.ui.badge(PHR.t('audit.nTimes', '{n} 次', { n: d.denied }), 'danger') : '<span class="dim">0</span>';
          } },
        { key: 'lastAt', label: PHR.t('audit.col.lastAt', '最近访问'), width: '150px',
          render: function (d) { return '<div class="t-sm">' + U.fmtDateTime(d.lastAt) + '</div>' +
            '<div class="t-xs dim">' + U.fmtRelative(d.lastAt) + '</div>'; } },
        { key: 'scopes', label: PHR.t('audit.col.scopes', '查阅范围'), render: function (d) {
            var keys = Object.keys(d.scopes);
            return keys.length
              ? '<div class="tag-list">' + keys.map(function (k) {
                  return '<span class="chip">' + dom.esc(k) + ' ×' + d.scopes[k] + '</span>';
                }).join('') + '</div>'
              : '<span class="dim">—</span>';
          } },
        { key: 'env', label: PHR.t('audit.col.source', '来源'), width: '170px', render: function (d) {
            return '<div class="t-xs mono">' + dom.esc(d.ip) + '</div><div class="t-xs dim">' + dom.esc(d.device) + '</div>';
          } }
      ]
    });
  }

  /* ================================================================== *
   * 五、页签四：统计分析
   * ================================================================== */
  function drawStats(panel) {
    panel.innerHTML =
      '<div class="grid g2 mb4">' +
        '<div class="card"><div class="card-head"><h3>' + PHR.t('audit.stats.byGroup', '按业务模块分布') + '</h3></div>' +
          '<div class="card-body" id="st-group"></div></div>' +
        '<div class="card"><div class="card-head"><h3>' + PHR.t('audit.stats.topActions', '最频繁的操作') + '</h3></div>' +
          '<div class="card-body" id="st-action"></div></div>' +
      '</div>' +
      '<div class="card mb4"><div class="card-head"><h3>' + PHR.t('audit.stats.trend', '近 30 天操作趋势') + '</h3>' +
        '<div class="sub">' + PHR.t('audit.stats.trendHint', '柱高代表当天的审计记录条数') + '</div></div>' +
        '<div class="card-body" id="st-day"></div></div>' +
      '<div class="card"><div class="card-head"><h3>' + PHR.t('audit.stats.results', '结果构成') + '</h3></div>' +
        '<div class="card-body" id="st-result"></div></div>';

    PHR.ui.chart.donut(document.getElementById('st-group'), {
      items: PHR.audit.byGroup().map(function (g, i) {
        return { label: g.label, value: g.value, color: 'var(--c' + ((i % 8) + 1) + ')' };
      }),
      centerValue: PHR.audit.stats().total, centerLabel: PHR.t('audit.stats.totalRecords', '总记录')
    });

    PHR.ui.chart.bar(document.getElementById('st-action'), {
      items: PHR.audit.byAction(8), yUnit: PHR.t('audit.unit.times', '次')
    });

    PHR.ui.chart.bar(document.getElementById('st-day'), {
      items: PHR.audit.byDay(30).map(function (d) { return { label: d.label, value: d.y }; }),
      height: 220, horizontal: false, yUnit: PHR.t('audit.unit.records', '条')
    });

    var s = PHR.audit.stats();
    PHR.ui.chart.donut(document.getElementById('st-result'), {
      items: [
        { label: PHR.t('badge.result.success', '成功'), value: s.total - s.denied - s.failed, color: 'var(--ok)' },
        { label: PHR.t('badge.result.fail', '失败'), value: s.failed, color: 'var(--warn)' },
        { label: PHR.t('audit.deniedBlocked', '越权被阻断'), value: s.denied, color: 'var(--danger)' }
      ].filter(function (i) { return i.value > 0; }),
      centerValue: s.total, centerLabel: PHR.t('audit.stats.totalRecords', '总记录')
    });
  }

})(window.PHR);
