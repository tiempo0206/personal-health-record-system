/**
 * ============================================================================
 * 文件：modules/ux/dashboard.view.js
 * 层：业务模块层（体验保障 —— 模块 8 · 首页工作台）
 * 职责：注册「工作台」——登录后的第一个页面，也是全系统的"总控台"。
 *      它把八个模块的关键信息压缩到一屏之内，回答用户最关心的四个问题：
 *        ① 我的身体现在怎么样？（健康状态与异常提醒）
 *        ② 有什么待办？（复诊、补测、授权到期）
 *        ③ 最近发生了什么？（最新记录）
 *        ④ 我的数据安全吗？（授权与访问追踪状态）
 * 依赖：modules/records/*、modules/insight/*、modules/consent/*、modules/audit/*
 *      （对后三个模块的调用全部做了存在性判断，任一模块缺失也不影响首页渲染）
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  PHR.registerView('dashboard', {
    title: PHR.t('view.dashboard.title', '工作台'), icon: '🏠', group: 'main', order: 0, module: 'ux',
    auditView: false,        // 首页不计入"查看记录"的审计，避免噪声
    render: render
  });

  /* ================================================================== *
   * 页面
   * ================================================================== */
  function render(root) {
    var user = PHR.session.currentUser();
    if (!user) {
      root.innerHTML = PHR.ui.empty({ icon: '🔒', title: PHR.t('dash.needLogin', '请先登录') });
      return;
    }

    var ctx = collect(user);

    root.innerHTML =
      hero(user, ctx) +
      statRow(ctx) +
      '<div class="grid" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--sp-5)">' +
        '<div>' + alertSection(ctx) + trendSection(ctx) + recentSection(ctx) + '</div>' +
        '<div>' + todoSection(ctx) + consentSection(ctx) + securitySection(ctx) + '</div>' +
      '</div>';

    mountCharts(ctx);
    bindActions(root);
  }

  /* ================================================================== *
   * 一、数据收集
   * ================================================================== */
  function collect(user) {
    var ctx = { user: user };

    /* --- 档案 --- */
    ctx.recordStats = PHR.records.service.stats();
    ctx.recent = PHR.records.service.recent(6);
    ctx.completeness = PHR.records.categories.completeness(
      PHR.records.service.all(), PHR.records.profile.get()
    );

    /* --- 健康洞察（模块缺失时降级） --- */
    ctx.insight = null;
    if (PHR.insight && PHR.insight.anomaly) {
      try {
        ctx.insight = {
          alerts: PHR.insight.anomaly.active ? PHR.insight.anomaly.active() : [],
          risk: PHR.insight.risk && PHR.insight.risk.assess ? PHR.insight.risk.assess() : null,
          advice: PHR.insight.advice && PHR.insight.advice.dailyPlan ? PHR.insight.advice.dailyPlan() : null,
          trends: PHR.insight.trend && PHR.insight.trend.analyzeAll
            ? PHR.insight.trend.analyzeAll(90).slice(0, 6) : []
        };
      } catch (e) {
        PHR.warn(PHR.t('dash.warn.insightAggregate', '健康洞察数据聚合失败'), e);
      }
    }

    /* --- 医生授权 --- */
    ctx.consents = { active: [], expiring: [], list: [] };
    if (PHR.consent && PHR.consent.list) {
      try {
        ctx.consents.list = PHR.consent.list() || [];
        ctx.consents.active = ctx.consents.list.filter(function (c) {
          return (c.runtimeStatus || c.status) === 'active';
        });
        ctx.consents.expiring = ctx.consents.active.filter(function (c) {
          return (c.daysLeft !== undefined ? c.daysLeft : 99) <= 3;
        });
      } catch (e) { PHR.warn(PHR.t('dash.warn.consentAggregate', '授权数据聚合失败'), e); }
    }

    /* --- 访问追踪 --- */
    ctx.audit = null;
    if (PHR.audit) {
      try {
        ctx.audit = {
          stats: PHR.audit.stats ? PHR.audit.stats() : null,
          alerts: PHR.audit.alerts ? PHR.audit.alerts() : [],
          risk: PHR.audit.riskScore ? PHR.audit.riskScore() : null,
          recent: PHR.audit.mine().slice(0, 5)
        };
      } catch (e) { PHR.warn(PHR.t('dash.warn.auditAggregate', '审计数据聚合失败'), e); }
    }

    /* --- 随访与用药提醒 --- */
    ctx.followUp = PHR.records.history.followUpDue().slice(0, 4);
    ctx.refill = PHR.records.medication.refillReminders().slice(0, 3);
    ctx.missingMetrics = PHR.records.vital.missing(30).slice(0, 4);

    /* --- 待办汇总 --- */
    ctx.todos = buildTodos(ctx);
    return ctx;
  }

  /** 把所有"该做的事"汇总成一份待办清单 */
  function buildTodos(ctx) {
    var out = [];

    (ctx.insight ? ctx.insight.alerts : []).slice(0, 3).forEach(function (a) {
      if (a.level === 'high') {
        out.push({ icon: '🚨', tone: 'danger', title: a.title, detail: a.advice || a.detail,
                   action: { label: PHR.t('dash.goHandle', '去处理'), route: '/insight' } });
      }
    });

    ctx.followUp.filter(function (f) { return f.overdue || f.daysLeft <= 14; }).forEach(function (f) {
      out.push({
        icon: f.overdue ? '⏰' : '📅', tone: f.overdue ? 'warn' : 'info',
        title: f.overdue
          ? PHR.t('dash.followUpOverdue', '已逾期：{name} 随访', { name: f.diseaseName })
          : PHR.t('dash.followUpSoon', '即将到期：{name} 随访', { name: f.diseaseName }),
        detail: PHR.t('dash.followUpDetail', '{advice}　建议时间：{date}',
          { advice: f.advice, date: U.fmtDate(f.nextDate) }),
        action: { label: PHR.t('dash.goHistory', '查看病史'), route: '/records?type=diagnosis' }
      });
    });

    ctx.refill.forEach(function (r) {
      out.push({ icon: '💊', tone: r.level === 'warn' ? 'warn' : 'info',
                 title: PHR.t('dash.refillTitle', '{name} 用药提醒', { name: r.drugName }), detail: r.message,
                 action: { label: PHR.t('dash.goMeds', '查看用药'), route: '/records?type=medication' } });
    });

    ctx.consents.expiring.forEach(function (c) {
      out.push({ icon: '🔑', tone: 'info',
                 title: PHR.t('dash.consentExpiringTitle', '授权即将到期：{name}', { name: c.doctorName }),
                 detail: PHR.t('dash.consentExpiringDetail', '还剩 {n} 天到期。如需继续共享，请延长有效期。',
                   { n: c.daysLeft }),
                 action: { label: PHR.t('dash.goConsent', '管理授权'), route: '/consent' } });
    });

    (ctx.audit ? ctx.audit.alerts : []).slice(0, 2).forEach(function (a) {
      out.push({ icon: '🛡️', tone: a.tone,
                 title: PHR.t('dash.securityAlertTitle', '安全提醒：{name}', { name: a.name }),
                 detail: a.suggestion,
                 action: { label: PHR.t('dash.goDetail', '查看详情'), route: '/audit?tab=alerts' } });
    });

    if (ctx.completeness.percent < 80) {
      out.push({ icon: '🧩', tone: 'primary',
                 title: PHR.t('dash.completenessTitle', '档案完整度 {n}%', { n: ctx.completeness.percent }),
                 detail: PHR.t('dash.completenessMissing', '还缺：{list}', {
                   list: ctx.completeness.missing.slice(0, 4).map(function (m) { return m.name; })
                     .join(PHR.t('ux.listSep', '、'))
                 }),
                 action: { label: PHR.t('dash.goComplete', '去补齐'), route: '/records-edit' } });
    }

    if (ctx.missingMetrics.length) {
      out.push({ icon: '📈', tone: 'info',
                 title: PHR.t('dash.missingMetricsTitle', '有 {n} 项指标超过 30 天未记录', { n: ctx.missingMetrics.length }),
                 detail: PHR.t('dash.missingMetricsDetail', '{list} —— 持续记录才能看出趋势。', {
                   list: ctx.missingMetrics.map(function (m) { return m.name; }).join(PHR.t('ux.listSep', '、'))
                 }),
                 action: { label: PHR.t('dash.goRecord', '去记录'), route: '/insight' } });
    }

    return out.slice(0, 6);
  }

  /* ================================================================== *
   * 二、首屏问候
   * ================================================================== */
  function hero(user, ctx) {
    var hour = new Date().getHours();
    var greetZh = hour < 6 ? '凌晨好' : hour < 11 ? '早上好' : hour < 14 ? '中午好'
                : hour < 18 ? '下午好' : hour < 23 ? '晚上好' : '夜深了';
    var greetKey = hour < 6 ? 'dash.greet.dawn' : hour < 11 ? 'dash.greet.morning' : hour < 14 ? 'dash.greet.noon'
                 : hour < 18 ? 'dash.greet.afternoon' : hour < 23 ? 'dash.greet.evening' : 'dash.greet.night';
    var greet = PHR.t(greetKey, greetZh);
    var name = user.displayName || user.username;

    // 用一句话概括当前状态，而不是罗列数字
    var line;
    var highAlerts = (ctx.insight ? ctx.insight.alerts : []).filter(function (a) { return a.level === 'high'; });
    if (highAlerts.length) {
      line = PHR.t('dash.hero.alertLine', '有 {n} 项指标需要您关注，建议先看看「健康洞察」里的提醒。', { n: highAlerts.length });
    } else if (ctx.todos.length) {
      line = PHR.t('dash.hero.todoLine', '目前身体指标平稳，还有 {n} 件事建议处理一下。', { n: ctx.todos.length });
    } else {
      line = PHR.t('dash.hero.okLine', '各项记录与指标都正常，保持规律作息就是最好的健康管理。');
    }

    return '<section class="hero">' +
      '<div class="greet">' + dom.esc(greet) + dom.esc(PHR.t('dash.greetSep', '，')) + dom.esc(name) + '</div>' +
      '<h2>' + dom.esc(line) + '</h2>' +
      '<div class="hero-actions">' +
        '<button class="btn solid" data-action="go" data-route="/records-edit">' +
          dom.esc(PHR.t('dash.addRecord', '＋ 记录一次')) + '</button>' +
        '<button class="btn" data-action="go" data-route="/insight">' +
          dom.esc(PHR.t('dash.viewInsight', '📈 查看健康洞察')) + '</button>' +
        '<button class="btn" data-action="go" data-route="/consent">' +
          dom.esc(PHR.t('dash.grantAccess', '🔑 授权给医生')) + '</button>' +
        '<button class="btn" data-action="go" data-route="/search">' +
          dom.esc(PHR.t('dash.searchRecords', '🔍 检索档案')) + '</button>' +
      '</div>' +
      '<div class="hero-stats">' +
        heroStat(dom.num(ctx.recordStats.total), PHR.t('dash.records', '条健康记录')) +
        heroStat(ctx.recordStats.types + ' / ' + D.recordTypes.length, PHR.t('dash.types', '类记录类型')) +
        heroStat(ctx.completeness.percent + '%', PHR.t('dash.completeness', '档案完整度')) +
        heroStat(ctx.consents.active.length, PHR.t('dash.activeConsents', '个生效中的授权')) +
        heroStat(ctx.audit ? ctx.audit.stats.denied : 0, PHR.t('dash.denied', '次越权被阻断')) +
      '</div>' +
    '</section>';

    function heroStat(n, l) {
      return '<div class="item"><div class="n">' + dom.esc(n) + '</div><div class="l">' + dom.esc(l) + '</div></div>';
    }
  }

  /* ================================================================== *
   * 三、健康状态卡片行
   * ================================================================== */
  function statRow(ctx) {
    var cards = [];

    /* 风险评分 */
    var risk = ctx.insight && ctx.insight.risk;
    cards.push({
      label: PHR.t('dash.riskScore', '健康风险评分'), icon: '🛡️',
      value: risk ? risk.score : '—', unit: PHR.t('dash.unitScore', '分'),
      tone: risk ? risk.tone : '',
      sub: risk ? PHR.t('dash.riskLevel', '风险等级：{level}', { level: risk.levelName || risk.level })
                : PHR.t('dash.riskFromInsight', '健康洞察模块提供'),
      route: '/insight'
    });

    /* 异常提醒数 */
    var alerts = ctx.insight ? ctx.insight.alerts : [];
    var high = alerts.filter(function (a) { return a.level === 'high'; });
    cards.push({
      label: PHR.t('dash.alerts', '指标提醒'), icon: high.length ? '🚨' : '✅',
      value: alerts.length, unit: PHR.t('dash.unitAlerts', '条'),
      tone: high.length ? 'danger' : alerts.length ? 'warn' : 'ok',
      sub: high.length ? PHR.t('dash.alertsUrgent', '{n} 条需要尽快处理', { n: high.length })
           : (alerts.length ? PHR.t('dash.alertsInfoOnly', '均为提示级') : PHR.t('dash.alertsNone', '暂无异常')),
      route: '/insight'
    });

    /* 最近一次指标 */
    var vitals = PHR.records.vital.summaryAll({ days: 365 });
    var latestAny = null, latestKey = null;
    vitals.forEach(function (v) {
      if (v.latest && (!latestAny || v.latest.at > latestAny.at)) {
        latestAny = v.latest;
        latestKey = v.metricKey;
      }
    });
    var latestMetric = latestKey ? D.metric(latestKey) : null;
    cards.push({
      label: latestAny ? D.metricName(latestKey) : PHR.t('dash.latestMetric', '最近指标'), icon: '📈',
      value: latestAny ? dom.num(latestAny.value, latestMetric ? latestMetric.decimals : 1) : '—',
      unit: latestMetric ? latestMetric.unit : '',
      tone: latestAny ? PHR.dict.judgeTone(latestAny.level) : '',
      sub: latestAny ? PHR.t('dash.measuredAt', '测于 {when}', { when: U.fmtRelative(latestAny.at) })
                     : PHR.t('dash.noVitals', '还没有体征记录'),
      route: latestKey ? ('/insight/' + latestKey) : '/insight'
    });

    /* 待办数 */
    cards.push({
      label: PHR.t('dash.todos', '待处理事项'), icon: ctx.todos.length ? '📌' : '🎉',
      value: ctx.todos.length, unit: PHR.t('dash.unitTodos', '项'),
      tone: ctx.todos.length ? 'info' : 'ok',
      sub: ctx.todos.length ? PHR.t('dash.todosHint', '见右侧待办清单') : PHR.t('dash.todoDone', '暂无待办，一切正常'),
      route: null
    });

    return '<div class="grid g4 mb5">' + cards.map(function (c) {
      return '<div class="stat' + (c.tone ? ' tone-' + c.tone : '') + '"' +
        (c.route ? ' data-action="go" data-route="' + dom.esc(c.route) + '" style="cursor:pointer"' : '') + '>' +
        '<span class="corner"></span>' +
        '<div class="label">' + c.icon + ' ' + dom.esc(c.label) + '</div>' +
        '<div class="value">' + dom.esc(c.value) + '<span class="unit">' + dom.esc(c.unit) + '</span></div>' +
        '<div class="delta dim">' + dom.esc(c.sub) + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ================================================================== *
   * 四、异常提醒
   * ================================================================== */
  function alertSection(ctx) {
    var alerts = (ctx.insight ? ctx.insight.alerts : []).slice(0, 3);
    if (!alerts.length) {
      return card('✅ ' + PHR.t('dash.alerts', '指标提醒'), PHR.t('dash.noAlerts', '暂无异常提醒'),
        PHR.ui.notice('ok', PHR.t('dash.allNormal', '各项指标都在正常范围内'), null, { icon: '👍' }),
        PHR.t('dash.viewAllAlerts', '查看全部提醒'), '/insight',
        PHR.t('dash.monitorNote', '系统会持续监测您的体征数据。当出现连续异常、快速变化或长期未测时，这里会出现提醒。'));
    }

    var body = alerts.map(function (a) {
      var sev = a.level === 'high' ? 'sev-high' : a.level === 'medium' ? 'sev-medium' : 'sev-low';
      return '<div class="alert-card ' + sev + '">' +
        '<span class="ico">' + (a.icon || (a.level === 'high' ? '🚨' : '⚠️')) + '</span>' +
        '<div class="body">' +
          '<div class="t">' + dom.esc(a.title || a.metricName || '') + '</div>' +
          '<div class="d">' + dom.esc(a.detail || '') + '</div>' +
          (a.advice ? '<div class="s"><b>' + dom.esc(PHR.t('dash.adviceLabel', '建议：')) + '</b>' +
            dom.esc(a.advice) + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    return card('🚨 ' + PHR.t('dash.alerts', '指标提醒'),
      PHR.t('dash.alertsPending', '{n} 条待关注', { n: alerts.length }),
      body, PHR.t('dash.viewAllAlerts', '查看全部提醒'), '/insight');
  }

  /* ================================================================== *
   * 五、趋势缩略
   * ================================================================== */
  function trendSection(ctx) {
    var trends = ctx.insight ? ctx.insight.trends : [];
    if (!trends.length) {
      return card('📈 ' + PHR.t('dash.trendTitle', '关键指标趋势'), PHR.t('dash.trendNoData', '还没有足够的趋势数据'),
        PHR.ui.empty({
          icon: '📈', title: PHR.t('dash.trendEmptyTitle', '还没有可分析的趋势'),
          hint: PHR.t('dash.trendEmptyHint', '连续记录同一指标 3 次以上，系统就能画出趋势并分析变化方向。'),
          action: { label: PHR.t('dash.goRecordVitals', '去记录体征'), action: 'go-insight' }, compact: true
        }), null, null);
    }

    var body = '<div class="grid g2" style="gap:var(--sp-3)">' + trends.map(function (t) {
      var m = t.metric || D.metric(t.metricKey);
      var up = /上升|Rising|rising/.test(t.direction);
      var down = /下降|Falling|falling/.test(t.direction);
      var arrow = up ? '▲' : down ? '▼' : '—';
      var tone = (!up && !down) ? 'muted' : (t.better ? 'ok' : 'danger');
      var series = (t.points || []).map(function (p) { return p.y !== undefined ? p.y : p; });
      return '<div class="metric-card" data-action="go" data-route="/insight/' + dom.esc(t.metricKey) +
        '" style="cursor:pointer;padding:var(--sp-3) var(--sp-4)">' +
        '<div class="top"><span class="name t-sm">' + (m ? m.name : t.metricKey) + '</span>' +
          '<span class="badge tone-' + tone + '">' + arrow + ' ' + dom.esc(PHR.t('phrase.' + t.direction, t.direction)) + '</span></div>' +
        '<div class="row between">' +
          '<span class="t-lg bold">' + dom.num(t.latest ? t.latest.value : (series.length ? series[series.length - 1] : '—'),
            m ? m.decimals : 1) + '<span class="unit t-xs dim"> ' + (m ? m.unit : '') + '</span></span>' +
          '<span>' + (PHR.ui.chart.spark(series, {
            width: 96, height: 28,
            color: tone === 'ok' ? 'var(--ok)' : tone === 'danger' ? 'var(--danger)' : 'var(--primary)'
          }) || '') + '</span>' +
        '</div>' +
        '<div class="t-xs dim ellipsis">' + dom.esc(t.summaryText || '') + '</div>' +
      '</div>';
    }).join('') + '</div>';

    return card('📈 ' + PHR.t('dash.trendTitle', '关键指标趋势'), PHR.t('dash.trendRange', '近 90 天'),
      body, PHR.t('dash.viewInsightFull', '查看完整洞察'), '/insight');
  }

  /* ================================================================== *
   * 六、最近记录
   * ================================================================== */
  function recentSection(ctx) {
    if (!ctx.recent.length) {
      return card('🕘 ' + PHR.t('dash.recent', '最近记录'), PHR.t('dash.recentNone', '还没有记录'),
        PHR.ui.empty({
          icon: '📭', title: PHR.t('dash.recentEmptyTitle', '还没有任何健康记录'),
          hint: PHR.t('dash.recentEmptyHint', '从录入第一条开始吧。建议先补「过敏史」与「确诊疾病」，这两项对医生最有帮助。'),
          action: { label: PHR.t('dash.addRecord', '新增记录'), action: 'go-new' }, compact: true
        }), null, null);
    }

    var body = '<div class="list">' + ctx.recent.map(function (r) {
      var t = D.recordType(r.type);
      return '<div class="list-item clickable" data-action="go" data-route="/records-edit/' + dom.esc(r.id) + '"' +
        ' style="padding:var(--sp-3) 0">' +
        '<span class="lead" style="background:' + t.color + '1f;color:' + t.color + ';width:32px;height:32px;font-size:15px">' + t.icon + '</span>' +
        '<div class="body"><div class="title t-sm">' + dom.esc(PHR.models.record.displayTitle(r)) + '</div>' +
          '<div class="sub t-xs">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 72)) + '</div></div>' +
        '<div class="meta"><span>' + U.fmtDate(r.date) + '</span>' +
          (r.source === 'sync' ? PHR.ui.badge(PHR.t('dash.synced', '已同步'), 'info') : '') + '</div>' +
      '</div>';
    }).join('') + '</div>';

    return card('🕘 ' + PHR.t('dash.recent', '最近记录'),
      PHR.t('dash.recentCount', '最新 {n} 条', { n: ctx.recent.length }),
      body, PHR.t('dash.viewAllRecords', '查看全部档案'), '/records');
  }

  /* ================================================================== *
   * 七、待办清单
   * ================================================================== */
  function todoSection(ctx) {
    if (!ctx.todos.length) {
      return card('📌 ' + PHR.t('dash.todos', '待办事项'), PHR.t('dash.todoDone', '全部完成'),
        PHR.ui.notice('ok', PHR.t('dash.todoEmptyTitle', '暂时没有需要处理的事项'),
          PHR.t('dash.todoEmptyBody', '系统会自动把复诊提醒、用药续方、授权到期、指标补测等事项汇总到这里。'),
          { icon: '🎉' }),
        null, null);
    }

    var body = '<div class="todo">' + ctx.todos.map(function (t) {
      return '<div class="todo-item">' +
        '<span class="ico">' + t.icon + '</span>' +
        '<div class="grow" style="min-width:0">' +
          '<div class="semibold t-sm">' + dom.esc(t.title) + '</div>' +
          '<div class="t-xs dim">' + dom.esc(t.detail) + '</div>' +
        '</div>' +
        (t.action ? '<button class="btn btn-sm" data-action="go" data-route="' +
          dom.esc(t.action.route) + '">' + dom.esc(t.action.label) + '</button>' : '') +
      '</div>';
    }).join('') + '</div>';

    return card('📌 ' + PHR.t('dash.todos', '待办事项'),
      PHR.t('dash.todoCount', '{n} 项', { n: ctx.todos.length }), body, null, null);
  }

  /* ================================================================== *
   * 八、授权状态
   * ================================================================== */
  function consentSection(ctx) {
    var active = ctx.consents.active;
    if (!active.length) {
      return card('🔑 ' + PHR.t('dash.consentStatus', '医生授权'), PHR.t('dash.noActiveConsent', '当前没有生效中的授权'),
        PHR.ui.notice('info', PHR.t('dash.consentPrivateTitle', '您的档案目前只有您本人可以查看'),
          PHR.t('dash.consentPrivateBody', '复诊前可以把必要资料临时授权给医生，并设置有效期，随时可以撤销。'),
          { icon: '🔒' }),
        PHR.t('dash.goGrant', '去授权'), '/consent');
    }

    var body = '<div class="list">' + active.slice(0, 3).map(function (c) {
      var left = c.daysLeft !== undefined ? c.daysLeft : null;
      return '<div class="list-item" style="padding:var(--sp-3) 0">' +
        '<span class="avatar sm" style="background:var(--info)">' +
          dom.esc(String(c.doctorName || PHR.t('dash.doctorInitial', '医')).slice(0, 1)) + '</span>' +
        '<div class="body"><div class="title t-sm">' + dom.esc(c.doctorName) +
          (c.doctorTitle ? '<span class="dim t-xs"> ' + dom.esc(c.doctorTitle) + '</span>' : '') + '</div>' +
          '<div class="sub t-xs">' + dom.esc(D.nameOf(D.hospital, c.hospital) || c.hospital || '') +
            dom.esc(PHR.t('dash.metaSep', '　·　')) + dom.esc(PHR.t('dash.accessCount', '{n} 次访问', { n: (c.accessCount || 0) })) +
            '</div></div>' +
        '<div class="meta">' + (left === null ? '' :
          '<span class="badge tone-' + (left <= 3 ? 'warn' : 'ok') + '">' +
            dom.esc(left >= 0 ? PHR.t('dash.daysLeft', '还剩 {n} 天', { n: left })
                              : PHR.t('badge.consent.expired', '已过期')) + '</span>') + '</div>' +
      '</div>';
    }).join('') + '</div>';

    if (ctx.consents.expiring.length) {
      body += PHR.ui.notice('warn', PHR.t('dash.consentExpiringNotice', '有授权即将到期'),
        ctx.consents.expiring.map(function (c) {
          return PHR.t('dash.consentExpiringItem', '{name}（{n} 天）', { name: c.doctorName, n: c.daysLeft });
        }).join(PHR.t('ux.listSep', '、')) +
        PHR.t('dash.consentExpiringSuffix', '。如需继续共享请延长有效期，否则到期后医生将无法查看。'), { icon: '⏰' });
    }

    return card('🔑 ' + PHR.t('dash.consentStatus', '医生授权'),
      PHR.t('dash.consentCount', '{n} 个生效中', { n: active.length }),
      body, PHR.t('dash.manageConsent', '管理授权'), '/consent');
  }

  /* ================================================================== *
   * 九、安全状态
   * ================================================================== */
  function securitySection(ctx) {
    var a = ctx.audit;
    var body;

    if (!a) {
      body = PHR.ui.notice('info', PHR.t('dash.auditNotLoaded', '访问追踪模块未加载'),
        PHR.t('dash.auditNotLoadedBody', '无法显示安全状态。'), { icon: 'ℹ️' });
    } else {
      var risk = a.risk || { score: 0, level: PHR.t('dash.riskLow', '低'), tone: 'ok' };
      body =
        '<div class="row gap4 wrap mb3" style="align-items:center">' +
          '<div id="sec-gauge"></div>' +
          '<div class="grow" style="min-width:150px">' +
            '<div class="t-sm">' + dom.esc(PHR.t('dash.accountRisk', '账号风险等级：')) +
              '<b class="' + risk.tone + '">' + dom.esc(risk.level) + '</b></div>' +
            '<div class="t-xs dim mt1">' + dom.esc(PHR.t('dash.auditWeekStats', '近 7 天 {week} 次操作　·　{denied} 次越权被阻断',
              { week: (a.stats ? a.stats.week : 0), denied: (a.stats ? a.stats.denied : 0) })) + '</div>' +
            '<div class="t-xs dim">' +
              (a.alerts.length ? PHR.t('dash.auditAlerts', '有 {n} 条安全告警', { n: a.alerts.length })
                               : PHR.t('dash.auditNoAlerts', '暂无安全告警')) + '</div>' +
          '</div>' +
        '</div>' +
        (a.recent.length
          ? '<div class="list">' + a.recent.slice(0, 3).map(function (e) {
              return '<div class="list-item" style="padding:8px 0">' +
                '<span class="lead" style="width:28px;height:28px;font-size:13px;background:transparent">' +
                  (e.actorType === 'doctor' ? '👨‍⚕️' : e.actorType === 'system' ? '🤖' : '🙋') + '</span>' +
                '<div class="body"><div class="t-xs">' + dom.esc(e.targetName || PHR.audit.actionName(e.action)) + '</div>' +
                  '<div class="t-xs dim">' + dom.esc(e.actor) + '　' + U.fmtRelative(e.at) + '</div></div>' +
              '</div>';
            }).join('') + '</div>'
          : '<div class="t-xs dim">' + dom.esc(PHR.t('dash.auditNoRecent', '暂无访问记录')) + '</div>');
    }

    return card('🛡️ ' + PHR.t('dash.security', '安全状态'),
      PHR.t('dash.securityFromAudit', '来自访问追踪'),
      body, PHR.t('dash.viewFullLog', '查看完整日志'), '/audit');
  }

  /* ================================================================== *
   * 十、通用卡片容器
   * ================================================================== */
  function card(title, sub, body, linkLabel, linkRoute, titleTip) {
    return '<div class="card mb4">' +
      '<div class="card-head">' +
        '<h3 class="t-lg">' + dom.esc(title) + dom.tip(titleTip) + '</h3>' +
        (sub ? '<div class="sub">' + dom.esc(sub) + '</div>' : '') +
        '<div class="actions">' +
          (linkLabel ? '<button class="btn btn-sm btn-ghost" data-action="go" data-route="' +
            dom.esc(linkRoute) + '">' + dom.esc(linkLabel) + ' →</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card-body">' + body + '</div>' +
    '</div>';
  }

  /* ================================================================== *
   * 十一、图表
   * ================================================================== */
  function mountCharts(ctx) {
    var g = document.getElementById('sec-gauge');
    if (g && ctx.audit && ctx.audit.risk) {
      PHR.ui.chart.gauge(g, {
        size: 110, thickness: 10,
        percent: ctx.audit.risk.score,
        value: ctx.audit.risk.score,
        label: PHR.t('dash.riskGauge', '风险分'),
        color: ctx.audit.risk.tone === 'ok' ? 'var(--ok)'
             : ctx.audit.risk.tone === 'warn' ? 'var(--warn)' : 'var(--danger)'
      });
    }
  }

  /* ================================================================== *
   * 十二、交互
   * ================================================================== */
  function bindActions(root) {
    dom.actions(root, {
      go: function (e, el) {
        var route = el.getAttribute('data-route');
        if (route) { PHR.router.go(route); }
      }
    });

    // 卡片内的空状态按钮走 data-action
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action="go-insight"]');
      if (b) { PHR.router.go('/insight'); }
      var n = e.target.closest('[data-action="go-new"]');
      if (n) { PHR.router.go('/records-edit'); }
    });
  }

})(window.PHR);
