/**
 * ============================================================================
 * 文件：modules/insight/insight.detail.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：渲染「指标详情」页（路由 #/insight/<metricKey>）—— 单指标的下钻页面：
 *        近 90 天大图（正常区间底纹 + 目标参考线）
 *        统计卡（最新 / 平均 / 最高 / 最低 / 达标率 / 波动性）
 *        趋势分析（方向、速度、稳定性、两个时间段的对比、显著转折点）
 *        该指标相关的告警
 *        指标解释与分级建议
 *        全部历史记录表格（可点进记录编辑器）
 * 依赖：modules/insight/*、ui/components/{chart,table,empty,badge}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var M = PHR.insight.metrics;

  var DETAIL_DAYS = 90;

  function vital() { return PHR.records.vital; }

  /* ================================================================== *
   * 入口
   * ================================================================== */
  function render(root, metricKey) {
    var m = D.metric(metricKey);
    if (!m) {
      root.innerHTML =
        '<div class="page-head"><div class="titles">' +
        '<h2>' + dom.esc(PHR.t('insight.detail.title', '指标详情')) + '</h2>' +
        '<div class="desc">' + dom.esc(PHR.t('insight.detail.notFoundDesc', '没有找到这个指标。')) + '</div>' +
        '</div>' +
        '<div class="actions"><button class="btn" data-action="back">' +
        dom.esc(PHR.t('insight.detail.back', '← 返回健康洞察')) + '</button></div></div>' +
        '<div class="card"><div class="card-body">' + PHR.ui.empty({
          icon: '🔍',
          title: PHR.t('insight.detail.unknownMetric', '未知的指标'),
          hint: PHR.t('insight.detail.unknownMetricHint',
            '请从「健康洞察 → 指标趋势」中点开某个指标卡片。'),
          action: { label: PHR.t('insight.detail.backToInsight', '返回健康洞察'), action: 'back' }
        }) + '</div></div>';
      dom.actions(root, { back: function () { PHR.router.go('/insight'); } });
      return;
    }

    var s = vital().summary(metricKey, { days: DETAIL_DAYS });
    var records = tableRows(metricKey);
    var t = PHR.insight.trend.analyze(metricKey, DETAIL_DAYS);
    var cmp = PHR.insight.trend.compare(metricKey, 30, 30);
    var points = PHR.insight.trend.changePoints(metricKey, DETAIL_DAYS);
    var alerts = PHR.insight.anomaly.scan().filter(function (a) { return a.metricKey === metricKey; });
    var e = s.count ? M.explain(metricKey, s.latest.value) : null;

    root.innerHTML = pageHead(m) + body(m, s, records, t, cmp, points, alerts, e);

    // 折线图（带正常区间底纹与目标参考线）
    var chartBox = root.querySelector('#detail-chart');
    if (chartBox) {
      var cfg = PHR.insight.trend.chartConfig(metricKey, DETAIL_DAYS);
      cfg.height = 300;
      PHR.ui.chart.line(chartBox, cfg);
    }

    // 历史记录表格：点任意一行进入记录编辑器
    var tableBox = root.querySelector('#detail-table');
    if (tableBox && records.length) {
      PHR.ui.table(tableBox, {
        pageSize: 8,
        defaultSort: { key: 'at', desc: true },
        onRowClick: function (r) {
          if (r && r.id) { PHR.router.go('/records-edit/' + r.id); }
        },
        columns: [
          { key: 'at', label: PHR.t('insight.detail.table.measuredAt', '测量时间'), width: '170px', sortable: true,
            render: function (r) {
              return '<div class="t-sm">' + U.fmtDateTime(r.at) + '</div>' +
                '<div class="t-xs dim">' + U.fmtRelative(r.at) + '</div>';
            } },
          { key: 'value', label: PHR.t('insight.detail.table.value', '读数'), width: '160px', align: 'right', sortable: true,
            render: function (r) {
              return '<span class="bold">' + dom.num(r.value, m.decimals) + '</span>' +
                (r.value2 !== null && r.value2 !== undefined
                  ? '<span class="dim"> / ' + dom.num(r.value2, m.decimals) + '</span>' : '') +
                ' <span class="t-xs dim">' + dom.esc(m.unit) + '</span>';
            } },
          { key: 'level', label: PHR.t('insight.detail.table.level', '判定'), width: '110px', align: 'center',
            render: function (r) { return PHR.ui.badges.metricLevel(r.level); } },
          { key: 'context', label: PHR.t('insight.detail.table.context', '测量情境与备注'), render: function (r) {
              return '<div class="t-sm">' + dom.esc(dom.or(r.context, '—')) +
                (r.way ? ' <span class="t-xs dim">（' + dom.esc(r.wayName) + '）</span>' : '') + '</div>' +
                (r.note ? '<div class="t-xs dim">' + dom.esc(r.note) + '</div>' : '');
            } },
          { key: 'ops', label: PHR.t('insight.detail.table.ops', '操作'), width: '80px', align: 'right',
            render: function () {
              return '<button class="btn btn-sm btn-ghost" data-stop>' +
                dom.esc(PHR.t('insight.detail.table.edit', '编辑')) + '</button>';
            } }
        ],
        rows: records,
        empty: { icon: '📭', title: PHR.t('insight.detail.table.empty', '还没有记录') }
      });
    }

    dom.actions(root, {
      back: function () { PHR.router.go('/insight'); },
      record: function () { PHR.insight.panels.quickAdd(metricKey, function () { PHR.router.reload(); }); },
      explain: function () { explainModal(m, e); }
    });
  }

  /** 把原始记录整理成表格行（时间倒序），判定结果在这里一次性算好 */
  function tableRows(metricKey) {
    var WAY = {
      home: PHR.t('insight.detail.way.home', '家庭自测'),
      clinic: PHR.t('insight.detail.way.clinic', '医院测量'),
      device: PHR.t('insight.detail.way.device', '可穿戴设备')
    };
    return vital().rows(metricKey).map(function (r) {
      var v = Number(r.data.value);
      return {
        id: r.id,
        at: r.date,
        value: v,
        value2: (r.data.value2 === '' || r.data.value2 === undefined) ? null : Number(r.data.value2),
        level: D.judge(metricKey, v),
        context: r.data.context || '',
        note: r.data.note || '',
        way: r.data.measureWay || '',
        wayName: WAY[r.data.measureWay] || r.data.measureWay || ''
      };
    }).sort(function (a, b) { return b.at - a.at; });
  }

  /* ================================================================== *
   * 页面结构
   * ================================================================== */
  function pageHead(m) {
    return '<div class="page-head">' +
      '<div class="titles"><h2>' + dom.esc(m.name) + '</h2>' +
        '<div class="desc">' + dom.esc(m.desc) + '</div></div>' +
      '<div class="actions">' +
        '<button class="btn" data-action="back">' +
          dom.esc(PHR.t('insight.detail.back', '← 返回健康洞察')) + '</button>' +
        '<button class="btn" data-action="explain">' +
          dom.esc(PHR.t('insight.panel.metricCard.explain', '这是什么？')) + '</button>' +
        '<button class="btn btn-primary" data-action="record">' +
          dom.esc(PHR.t('insight.view.addRecord', '＋ 记录一次')) + '</button>' +
      '</div></div>';
  }

  function body(m, s, records, t, cmp, points, alerts, e) {
    if (!s.count) {
      return '<div class="card"><div class="card-body">' + PHR.ui.empty({
        icon: '📈',
        title: PHR.t('insight.detail.empty.title', '还没有「{metric}」的记录', { metric: m.name }),
        hint: PHR.t('insight.detail.empty.hint',
          '记录 3 次以上，系统就能画出趋势并判断变化方向。'),
        action: { label: PHR.t('insight.detail.empty.action', '记录一次'), action: 'record' }
      }) + '</div></div>' + disclaimerCard();
    }

    /* direction / stability 是内部枚举（中文），展示时经 trend.dirName / stabilityName 取词 */
    var dirText = PHR.insight.trend.dirName(t.direction);
    var stabText = PHR.insight.trend.stabilityName(t.stability);

    return '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.detail.nearDays', '近 {days} 天趋势', { days: DETAIL_DAYS })) + '</h3>' +
        '<div class="sub">' + dom.esc(PHR.t('insight.detail.bandNote',
          '底纹为正常 / 警戒区间，虚线为目标值')) + '</div></div>' +
        '<div class="card-body"><div id="detail-chart"></div></div></div>' +

      statRow(m, s, t) +

      '<div class="grid g2 mb4">' +
        '<div class="card"><div class="card-head"><h3>' +
          dom.esc(PHR.t('insight.detail.trendAnalysis', '趋势分析')) + '</h3></div>' +
          '<div class="card-body">' +
            '<div class="t-sm mb3">' + dom.esc(t.summaryText) + '</div>' +
            '<dl class="kv">' +
              '<dt>' + dom.esc(PHR.t('insight.detail.changeDirection', '变化方向')) + '</dt><dd>' +
                dom.esc(dirText) +
                (t.direction === '平稳' ? ''
                  : (t.better
                      ? dom.esc(PHR.t('insight.detail.dirGood', '（方向理想）'))
                      : dom.esc(PHR.t('insight.detail.dirBad', '（方向不理想）')))) + '</dd>' +
              '<dt>' + dom.esc(PHR.t('insight.detail.speed', '速度')) + '</dt><dd>' +
                dom.esc(PHR.t('insight.detail.speedValue', '约每月 {value} {unit}',
                  { value: M.fmt(Math.abs(t.slopePerMonth), m.decimals), unit: m.unit })) + '</dd>' +
              '<dt>' + dom.esc(PHR.t('insight.detail.stability', '稳定性')) + '</dt><dd>' +
                dom.esc(PHR.t('insight.detail.stabilityValue', '{name}（波动 {value} {unit}）',
                  { name: stabText, value: dom.num(t.volatility, m.decimals), unit: m.unit })) + '</dd>' +
              '<dt>' + dom.esc(PHR.t('insight.detail.r2', '拟合优度')) + '</dt><dd>R² = ' +
                dom.esc(String(t.r2)) + '　' +
                '<span class="t-xs dim">' +
                dom.esc(PHR.t('insight.detail.r2Hint', '越接近 1 说明越接近直线变化')) + '</span></dd>' +
              '<dt>' + dom.esc(PHR.t('insight.detail.sample', '样本量')) + '</dt><dd>' +
                dom.esc(PHR.t('insight.detail.sampleValue', '{n} 次读数（数据{coverage}）',
                  { n: t.count, coverage: M.coverageOf(t.count) })) + '</dd>' +
            '</dl>' +
          '</div></div>' +

        '<div class="card"><div class="card-head"><h3>' +
          dom.esc(PHR.t('insight.detail.compare', '两段时间对比')) + '</h3>' +
          '<div class="sub">' +
          dom.esc(PHR.t('insight.detail.compareSub', '最近 30 天 vs 之前 30 天')) + '</div></div>' +
          '<div class="card-body">' +
            '<div class="t-sm mb3">' + dom.esc(cmp.text) + '</div>' +
            (points.length
              ? '<div class="semibold mb2">' +
                dom.esc(PHR.t('insight.detail.changePoints', '显著转折点（{n} 个）',
                  { n: points.length })) + '</div>' +
                '<ul class="t-sm" style="margin:0;padding-left:1.2em">' +
                points.slice(0, 5).map(function (p) {
                  return '<li>' + U.fmtDate(p.at) + '　' + dom.esc(p.note) + '</li>';
                }).join('') + '</ul>' +
                '<div class="t-xs dim mt2">' +
                dom.esc(PHR.t('insight.detail.changePointNote',
                  '判定标准：相邻两点变化超过 2 倍标准差。' +
                  '这类位置往往对应"换了药""开始运动"等生活事件，可以对照回忆一下。')) + '</div>'
              : '<div class="t-sm dim">' +
                dom.esc(PHR.t('insight.detail.noChangePoints',
                  '这段时间内没有检测到显著转折点，数据变化比较连续。')) + '</div>') +
          '</div></div>' +
      '</div>' +

      alertSection(alerts) +

      '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.detail.meaning', '这个指标说明了什么')) + '</h3></div>' +
        '<div class="card-body">' +
          '<dl class="kv">' +
            '<dt>' + dom.esc(PHR.t('insight.detail.meaningLabel', '指标含义')) + '</dt><dd>' +
              dom.esc(m.desc) + '</dd>' +
            '<dt>' + dom.esc(PHR.t('insight.detail.normalRange', '正常范围')) + '</dt><dd>' +
              dom.esc(M.normalRangeText(m)) + '</dd>' +
            '<dt>' + dom.esc(PHR.t('insight.detail.warnRange', '警戒范围')) + '</dt><dd>' +
              dom.esc(M.rangeText(m.warn, m.decimals) + ' ' + m.unit) + '</dd>' +
            (m.target !== null && m.target !== undefined
              ? '<dt>' + dom.esc(PHR.t('insight.detail.target', '目标值')) + '</dt><dd>' +
                dom.esc(M.fmt(m.target, m.decimals) + ' ' + m.unit) + '</dd>' : '') +
            (e ? '<dt>' + dom.esc(PHR.t('insight.detail.latest', '最近一次')) + '</dt><dd>' +
                 dom.esc(e.detail) + '</dd>' +
                 '<dt>' + dom.esc(PHR.t('insight.detail.latestAdvice', '与该值对应的建议')) + '</dt><dd>' +
                 dom.esc(e.advice) + '</dd>' : '') +
            '<dt>' + dom.esc(PHR.t('insight.detail.refMeasure', '参考记录方式')) + '</dt><dd>' +
              dom.esc(vital().defaultContext(m.key) || '—') + '</dd>' +
          '</dl>' +
        '</div></div>' +

      '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.detail.history', '全部历史记录')) + '</h3>' +
        '<div class="sub">' +
        dom.esc(PHR.t('insight.detail.historySub', '共 {n} 条，点击任意一行可编辑',
          { n: records.length })) + '</div></div>' +
        '<div class="card-body flush" id="detail-table"></div></div>' +

      disclaimerCard();
  }

  /** 六个统计卡 */
  function statRow(m, s, t) {
    function tile(label, value, unit, tone) {
      return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span class="corner"></span>' +
        '<div class="label">' + dom.esc(label) + '</div>' +
        '<div class="value">' + dom.esc(value) + '<span class="unit">' + dom.esc(unit) + '</span></div></div>';
    }
    var latestTone = s.level === 'ok' ? 'ok' : s.level === 'warning' ? 'warn' : 'danger';
    return '<div class="grid g4 mb4">' +
      tile(PHR.t('insight.detail.stat.latest', '最新读数'), dom.num(s.latest.value, m.decimals) +
        (s.latest.value2 !== null && s.latest.value2 !== undefined
          ? '/' + dom.num(s.latest.value2, m.decimals) : ''), m.unit, latestTone) +
      tile(PHR.t('insight.detail.stat.avg', '平均值'), dom.num(s.avg, m.decimals), m.unit, '') +
      tile(PHR.t('insight.detail.stat.maxmin', '最高 / 最低'),
        dom.num(s.max, m.decimals) + ' / ' + dom.num(s.min, m.decimals), m.unit, '') +
      tile(PHR.t('insight.detail.stat.inRange', '达标率'), String(s.inRangeRate), '%',
        s.inRangeRate >= 80 ? 'ok' : s.inRangeRate >= 50 ? 'warn' : 'danger') +
      tile(PHR.t('insight.detail.stat.volatility', '波动性'), dom.num(t.volatility, m.decimals), m.unit,
        t.stability === '稳定' ? 'ok' : 'warn') +
      tile(PHR.t('insight.detail.stat.count', '记录次数'), String(s.count),
        PHR.t('insight.detail.stat.countUnit', '次'), '') +
      '</div>';
  }

  function alertSection(alerts) {
    if (!alerts.length) {
      return '<div class="card mb4"><div class="card-body">' +
        PHR.ui.notice('ok',
          PHR.t('insight.detail.alertEmpty', '该指标当前没有异常提醒'),
          PHR.t('insight.detail.alertEmptyHint',
            '系统会持续扫描，出现连续异常、快速变化或趋势恶化时会在这里显示。'),
          { icon: '✅' }) + '</div></div>';
    }
    return '<div class="card mb4"><div class="card-head"><h3>' +
      dom.esc(PHR.t('insight.detail.alerts', '该指标相关的提醒')) + '</h3>' +
      '<div class="sub">' +
      dom.esc(PHR.t('insight.detail.alertsCount', '共 {n} 条', { n: alerts.length })) + '</div></div>' +
      '<div class="card-body">' + alerts.map(PHR.insight.panels.alertCard).join('') + '</div></div>';
  }

  function disclaimerCard() {
    return '<div class="card"><div class="card-body">' +
      PHR.ui.notice('warn', PHR.t('insight.detail.disclaimer', '⚠️ 免责声明'), M.DISCLAIMER,
        { icon: '⚕️' }) + '</div></div>';
  }

  /* ================================================================== *
   * 指标说明弹窗（复用面板里的说明逻辑）
   * ================================================================== */
  function explainModal(m, e) {
    PHR.ui.modal({
      title: PHR.t('insight.panel.explain.title', '{metric} · 指标说明', { metric: m.name }),
      body: '<dl class="kv">' +
        '<dt>' + dom.esc(PHR.t('insight.panel.explain.what', '这项指标')) + '</dt><dd>' +
          dom.esc(m.desc) + '</dd>' +
        '<dt>' + dom.esc(PHR.t('insight.detail.normalRange', '正常范围')) + '</dt><dd>' +
          dom.esc(M.normalRangeText(m)) + '</dd>' +
        '<dt>' + dom.esc(PHR.t('insight.detail.warnRange', '警戒范围')) + '</dt><dd>' +
          dom.esc(M.rangeText(m.warn, m.decimals) + ' ' + m.unit) + '</dd>' +
        (e ? '<dt>' + dom.esc(PHR.t('insight.detail.latest', '最近一次')) + '</dt><dd>' +
             dom.esc(e.detail) + '</dd>' +
             '<dt>' + dom.esc(PHR.t('insight.panel.explain.advice', '分级建议')) + '</dt><dd>' +
             dom.esc(e.advice) + '</dd>' : '') +
        '</dl>' +
        '<div class="mt4">' +
        PHR.ui.notice('warn', PHR.t('insight.detail.notDiagnosis', '这不是诊断'), M.DISCLAIMER,
          { icon: '⚠️' }) + '</div>'
    });
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.insight.detailView = {
    render: render,
    days: DETAIL_DAYS
  };

})(window.PHR);
