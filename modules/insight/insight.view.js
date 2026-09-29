/**
 * ============================================================================
 * 文件：modules/insight/insight.view.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：注册「健康洞察」与「指标详情」两个页面，并负责页面骨架、页签切换与
 *      顶部的全局动作。五个页签的具体内容分别由 insight.panels.js（总览 /
 *      指标趋势 / 异常提醒 / 风险评估 / 预防建议）与 insight.detail.js
 *      （指标详情）渲染，本文件只做"装配"，不写业务判断。
 * 依赖：modules/insight/*、ui/components/*、ui/router.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var I = PHR.insight;         // 服务层命名空间（metrics.js 建立）

  /* 页签名。label 保持中文作为兜底，展示时经 tabLabel() 取当前语言的词条
     （本文件在 boot 之前加载，此处不能直接查词条 —— 那时语言还没定）。 */
  var TABS = [
    { key: 'overview', label: '总览', icon: '🧭' },
    { key: 'trend', label: '指标趋势', icon: '📈' },
    { key: 'alerts', label: '异常提醒', icon: '🚨' },
    { key: 'risk', label: '风险评估', icon: '🛡️' },
    { key: 'advice', label: '预防建议', icon: '💡' }
  ];

  function tabLabel(t) {
    return PHR.t('insight.tab.' + t.key, t.label);
  }

  /* ================================================================== *
   * 一、视图注册
   * ================================================================== */
  PHR.registerView('insight', {
    title: PHR.t('view.insight.title', '健康洞察'), icon: '📈', group: 'main', order: 5, module: 'insight',
    render: render
  });
  /* 指标详情：不出现在左侧导航，只能从趋势卡片或标题目录进入 */
  PHR.registerView('insight-detail', {
    title: PHR.t('view.insight-detail.title', '指标详情'), icon: '📈', group: 'main', order: 51, module: 'insight', nav: false,
    render: function (root, params) {
      var key = (params && (params.p1 || params.metricKey)) || '';
      if (I.detailView) { I.detailView.render(root, key); }
    }
  });

  /**
   * 路由别名：#/insight/<指标key> 也要打开指标详情页。
   *
   * 为什么需要这一步：ui/router.js 的通用规则是「#/<视图名>/<参数>」，
   * 而 #/insight/systolic 的第一段是 insight，会被解析成"健康洞察主页"。
   * 因此这里用 PHR.router.add 注册一条更具体的路由，
   * 让 router 在通用规则之前先匹配到它（自定义路由优先）。
   * 这样两种地址都能打开详情页：
   *   #/insight/systolic        （更自然，页面内部链接都用它）
   *   #/insight-detail/systolic （视图名直连，便于调试）
   */
  PHR.router.add('insight/:metricKey', function (ctx) {
    var target = PHR.views['insight-detail'];
    if (!target) { return; }
    PHR.shell.render(target, {
      path: ctx.path,
      parts: ['insight', ctx.params.metricKey],
      params: { p1: ctx.params.metricKey, metricKey: ctx.params.metricKey },
      query: ctx.query || {}
    });
  });

  /* ================================================================== *
   * 二、主页面
   * ================================================================== */
  function render(root, params) {
    if (params && params.tab && tabOf(params.tab)) { I.state.tab = params.tab; }
    logView();

    var counts = collectCounts();

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>' + dom.esc(PHR.t('insight.view.title', '健康洞察')) + '</h2>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="goto-records">' +
            dom.esc(PHR.t('insight.view.gotoRecords', '🗂️ 去档案中心')) + '</button>' +
          '<button class="btn btn-primary" data-action="add">' +
            dom.esc(PHR.t('insight.view.addRecord', '＋ 记录一次')) + '</button>' +
        '</div>' +
      '</div>' +

      sourceNoticeHtml() +

      '<div class="tabs" id="insight-tabs" role="tablist">' +
        TABS.map(function (t) { return tabBtn(t, counts); }).join('') +
      '</div>' +
      '<div id="insight-panel"></div>';

    dom.actions(root, {
      add: function () { I.panels.quickAdd(I.state.metrics[0] || 'systolic'); },
      'goto-records': function () { PHR.router.go('/records'); }
    });

    U.$('#insight-tabs', root).addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) { return; }
      I.state.tab = b.getAttribute('data-tab');
      U.$$('[data-tab]', root).forEach(function (x) {
        x.setAttribute('aria-selected', String(x === b));
      });
      drawPanel(root);
    });

    drawPanel(root);
  }

  function sourceNoticeHtml() {
    var meta = collectSourceMeta();
    var body = meta.total
      ? PHR.t('insight.view.sourceBody',
          '评分、趋势和提醒都基于健康档案实时计算。当前纳入 {records} 条档案记录，其中包含 {vitals} 条体征指标、{labs} 条检验报告；最近更新：{when}。',
          {
            records: meta.total,
            vitals: meta.vitals,
            labs: meta.labs,
            when: meta.lastAt ? U.fmtDateTime(meta.lastAt) : PHR.t('ui.none', '无')
          })
      : PHR.t('insight.view.sourceEmpty',
          '这里会根据健康档案里的体征指标、检验报告和基本信息生成趋势、提醒与评分。先添加或上传记录后，结果会自动更新。');

    return PHR.ui.notice('primary',
      PHR.t('insight.view.sourceTitle', '数据来源：健康档案'),
      body,
      { icon: '🗂️' }) + recentSourceReason(meta);
  }

  function collectSourceMeta() {
    var rows = (PHR.records && PHR.records.service) ? PHR.records.service.all() : [];
    var latest = null;
    rows.forEach(function (r) {
      var at = r.updatedAt || r.createdAt || r.date || 0;
      if (!latest || at > (latest.updatedAt || latest.createdAt || latest.date || 0)) { latest = r; }
    });
    return {
      total: rows.length,
      vitals: rows.filter(function (r) { return r.type === 'vital'; }).length,
      labs: rows.filter(function (r) { return r.type === 'lab'; }).length,
      lastAt: latest ? (latest.updatedAt || latest.createdAt || latest.date) : 0,
      latest: latest
    };
  }

  function recentSourceReason(meta) {
    var r = meta.latest;
    if (!r) { return ''; }
    var typeName = D.recordTypeName(r.type);
    var title = PHR.models.record.displayTitle(r);
    var body;
    if (r.type === 'vital' && r.data && r.data.metricKey) {
      var m = D.metric(r.data.metricKey);
      var value = PHR.records.vital.formatReading(r.data.metricKey, r.data.value, r.data.value2);
      body = PHR.t('insight.view.reasonVital',
        '最近纳入的是 {metric}：{value}。如果趋势或评分发生变化，通常是因为这条读数已经进入计算。',
        { metric: m ? m.name : typeName, value: value });
    } else if (r.type === 'lab') {
      body = PHR.t('insight.view.reasonLab',
        '最近纳入的是检验报告「{title}」。系统会把能识别的项目用于趋势和风险评分。',
        { title: title });
    } else {
      body = PHR.t('insight.view.reasonRecord',
        '最近纳入的是「{title}」（{type}）。健康档案变化后，本页会重新计算相关结论。',
        { title: title, type: typeName });
    }

    return '<div class="mt3">' + PHR.ui.notice('info',
      PHR.t('insight.view.reasonTitle', '为什么结果会变化？'),
      body,
      { icon: '🧾' }) + '</div>';
  }

  /** 页签上的角标：分别是"有数据的指标数""待处理提醒数""健康得分" */
  function collectCounts() {
    var out = { trend: 0, alerts: 0, risk: '' };
    try { out.trend = I.metrics.withData().length; } catch (e) { /* 忽略 */ }
    try { out.alerts = I.anomaly.active().length; } catch (e) { /* 忽略 */ }
    try { out.risk = I.risk.assess().score; } catch (e) { /* 忽略 */ }
    return out;
  }

  function tabOf(key) {
    return TABS.filter(function (t) { return t.key === key; })[0] || null;
  }

  function tabBtn(t, counts) {
    var cnt = t.key === 'trend' ? counts.trend
      : t.key === 'alerts' ? counts.alerts
      : t.key === 'risk' ? counts.risk : '';
    return '<button role="tab" data-tab="' + t.key + '" aria-selected="' + (I.state.tab === t.key) + '">' +
      '<span aria-hidden="true">' + t.icon + '</span> ' + dom.esc(tabLabel(t)) +
      (cnt !== '' && cnt !== null ? '<span class="cnt">' + dom.esc(String(cnt)) + '</span>' : '') +
      '</button>';
  }

  /** 把当前页签的内容渲染到面板容器里 */
  function drawPanel(root) {
    var host = U.$('#insight-panel', root || document);
    if (!host) { return; }
    // 每次都用全新的子元素承载内容：旧元素连同它绑定的监听器一起被回收，
    // 因此反复重绘不会造成监听器叠加。
    host.innerHTML = '<div></div>';
    var P = I.panels;
    var fn = P[I.state.tab] || P.overview;
    fn(host.firstElementChild);
  }

  var refreshTimer = null;

  function scheduleDataRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      var cur = PHR.router.current ? PHR.router.current() : null;
      var first = cur && cur.parts ? cur.parts[0] : '';
      if (first !== 'insight' && first !== 'insight-detail') { return; }
      if (PHR.router.reload) { PHR.router.reload(); }
    }, 80);
  }

  ['record:changed', 'metric:changed', 'profile:changed'].forEach(function (evt) {
    PHR.bus.on(evt, scheduleDataRefresh);
  });

  /* ================================================================== *
   * 三、审计：查看洞察页写 insight.view
   * ================================================================== */
  function logView() {
    var title = PHR.t('insight.view.title', '健康洞察');
    U.audit({
      action: 'insight.view', targetType: 'view', targetId: 'insight', targetName: title,
      detail: PHR.t('insight.view.auditDetail', '浏览了健康洞察页面（{tab}）',
        { tab: tabLabel(tabOf(I.state.tab) || TABS[0]) }),
      result: 'success'
    });
  }

  /* 供其它模块（如工作台卡片、预防建议里的"去记录"）跳转到指定页签 */
  PHR.insight.goTab = function (key) {
    I.state.tab = tabOf(key) ? key : 'overview';
    var cur = PHR.router.current();
    var parts = (cur && cur.parts) || [];
    // 只有"已经在洞察主页"时才原地重绘；在指标详情页（#/insight/<key>）或别的页面则跳转
    if (parts[0] === 'insight' && parts.length <= 1) { PHR.router.reload(); }
    else { PHR.router.go('/insight'); }
  };

})(window.PHR);
