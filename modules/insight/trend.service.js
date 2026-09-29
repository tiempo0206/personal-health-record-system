/**
 * ============================================================================
 * 文件：modules/insight/trend.service.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：趋势分析引擎。回答"这个指标在往哪个方向走、走得多快、稳不稳、
 *      这个方向是好是坏、从哪一天开始变的"。
 *      · analyze()       单指标趋势（最小二乘线性回归）
 *      · analyzeAll()    所有有数据指标的趋势
 *      · chartConfig()   直接输出 PHR.ui.chart.line 能吃的配置
 *      · changePoints()  显著转折点（"什么时候开始见效的"）
 *      · compare()       两个时间段的均值对比（"最近 30 天 vs 前 30 天"）
 * 依赖：core/dict-metrics.js、modules/records/vital.service.js、metrics.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var M = PHR.insight.metrics;

  var DAY = 86400000;

  function vital() { return PHR.records.vital; }

  /* ================================================================== *
   * 〇、方向 / 稳定性的展示名
   * direction 与 stability 是**内部枚举**：advice.js、anomaly.js、risk.js
   * 以及工作台都拿 '上升' / '平稳' / '稳定' 这些字面量做 === 比较，
   * 因此字段值本身必须保持中文不动；只在**展示**时经这两个helper 取英文。
   * 新增取值时，两张映射表要跟着补。
   * ================================================================== */
  var DIR_KEY = { '上升': 'up', '下降': 'down', '平稳': 'flat' };
  var STAB_KEY = { '稳定': 'stable', '波动': 'volatile' };

  function dirName(d) { return PHR.t('insight.trend.dir.' + (DIR_KEY[d] || 'flat'), d); }
  function stabilityName(s) { return PHR.t('insight.trend.stability.' + (STAB_KEY[s] || 'stable'), s); }

  /** 「约每月上升 2.3 mmHg」这种小句，按月斜率正负二选一 */
  function perMonthText(slopePerMonth, digits, unit) {
    var v = M.fmt(Math.abs(slopePerMonth), digits);
    return slopePerMonth > 0
      ? PHR.t('insight.trend.perMonthUp', '约合每月上升 {value} {unit}。', { value: v, unit: unit })
      : PHR.t('insight.trend.perMonthDown', '约合每月下降 {value} {unit}。', { value: v, unit: unit });
  }

  /* ================================================================== *
   * 一、数学工具
   * ================================================================== */
  /**
   * 最小二乘线性回归：把"数值随时间变化"拟合成一条直线 y = a + b·x。
   *
   *   b = Σ(xi - x̄)(yi - ȳ) / Σ(xi - x̄)²
   *   a = ȳ - b·x̄
   *
   * 其中 x 以"天"为单位（以第一个数据点为原点），所以 b 就是"平均每天变化多少"。
   * 为什么不用首尾两点直接相减？因为单次测量受情绪、时间、设备误差影响很大，
   * 只取两点等于把全部噪声都算进斜率里。回归使用了每一个数据点，结论更稳健。
   * 同时返回决定系数 R²，用来判断"这条直线到底能不能代表数据"。
   */
  function linreg(xs, ys) {
    var n = xs.length;
    if (n < 2) { return { slope: 0, intercept: ys[0] || 0, r2: 0 }; }
    var mx = U.avg(xs), my = U.avg(ys);
    var num = 0, den = 0, i;
    for (i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) * (xs[i] - mx);
    }
    var slope = den ? num / den : 0;
    var a = my - slope * mx;
    var ssTot = 0, ssRes = 0;
    for (i = 0; i < n; i++) {
      ssTot += Math.pow(ys[i] - my, 2);
      ssRes += Math.pow(ys[i] - (a + slope * xs[i]), 2);
    }
    return { slope: slope, intercept: a, r2: ssTot ? Math.max(0, 1 - ssRes / ssTot) : 0 };
  }

  /** 总体标准差（衡量波动大小） */
  function std(vals) {
    if (!vals || vals.length < 2) { return 0; }
    var m = U.avg(vals);
    return Math.sqrt(U.sum(vals, function (v) { return (v - m) * (v - m); }) / vals.length);
  }

  function round(v, digits) { return Number(Number(v).toFixed(digits === undefined ? 2 : digits)); }

  /* ================================================================== *
   * 二、单指标趋势分析
   * ================================================================== */
  /**
   * @param {string} metricKey
   * @param {number} [days] 观察窗口，默认 90 天
   * @returns {{
   *   metricKey, metric, direction:'上升'|'下降'|'平稳', slope, slopePerMonth,
   *   changePercent, volatility, stability:'稳定'|'波动', better, r2,
   *   summaryText, points, latest, count, window, empty
   * }}
   */
  function analyze(metricKey, days) {
    days = days || 90;
    var m = D.metric(metricKey);
    var s = vital().summary(metricKey, { days: days });
    var out = {
      metricKey: metricKey, metric: m,
      direction: '平稳', slope: 0, slopePerMonth: 0, changePercent: 0,
      volatility: 0, stability: '稳定', better: true, r2: 0, mismatch: false,
      summaryText: '', points: [], latest: null, count: 0, window: days, empty: true
    };
    var label = m ? m.shortName : metricKey;

    if (!s.count) {
      out.summaryText = PHR.t('insight.trend.empty',
        '还没有「{metric}」的记录，先记一笔，系统才能分析趋势。',
        { metric: m ? m.name : metricKey });
      return out;
    }

    out.points = s.series;
    out.latest = s.latest;
    out.count = s.count;
    out.empty = false;

    if (s.count === 1) {
      out.summaryText = PHR.t('insight.trend.single',
        '目前只有 1 次「{label}」记录（{value} {unit}），至少需要 3 次才能看出变化趋势。',
        { label: label, value: M.fmt(s.latest.value, m.decimals), unit: m.unit });
      return out;
    }

    /* ---- 1. 回归 ---- */
    var series = s.series;
    var first = series[0], last = series[series.length - 1];
    var xs = series.map(function (p) { return (p.x - first.x) / DAY; });   // 单位：天
    var ys = series.map(function (p) { return p.y; });
    var fit = linreg(xs, ys);

    out.slope = round(fit.slope, 4);
    out.slopePerMonth = round(fit.slope * 30, m.decimals);
    out.r2 = round(fit.r2, 3);
    out.changePercent = first.y
      ? round((last.y - first.y) / Math.abs(first.y) * 100, 1) : 0;

    /* ---- 2. 方向：以"正常区间宽度的 8% / 月"为显著阈值 ---- */
    var width = (m.normal.min !== null && m.normal.max !== null) ? (m.normal.max - m.normal.min) : null;
    var thr = width ? width * 0.08 : Math.abs(U.avg(ys)) * 0.03;
    if (!thr) { thr = 0.01; }
    out.direction = Math.abs(out.slopePerMonth) < thr ? '平稳'
      : (out.slopePerMonth > 0 ? '上升' : '下降');

    /* ---- 3. 波动性：用"去掉趋势后的残差标准差"，避免把持续上升误判为波动 ---- */
    var residuals = ys.map(function (y, i) { return y - (fit.intercept + fit.slope * xs[i]); });
    out.volatility = round(std(ys), m.decimals);
    var fluctLimit = width ? width * 0.25 : Math.abs(U.avg(ys)) * 0.1;
    out.stability = std(residuals) > (fluctLimit || 0.01) ? '波动' : '稳定';

    /* ---- 4. 这个方向是好是坏 ---- */
    out.better = true;
    if (out.direction !== '平稳') {
      if (m.better === 'lower') { out.better = out.direction === '下降'; }
      else if (m.better === 'higher') { out.better = out.direction === '上升'; }
      else if (m.target !== null && m.target !== undefined) {
        out.better = Math.abs(last.y - m.target) <= Math.abs(first.y - m.target);
      }
    }

    /* ---- 5. 一句话结论 ---- */
    // 回归斜率与"首尾相减"偶尔会给出相反的符号（数据起伏大时很常见）。
    // 这时如果还写"整体上升（-8.2%）"就会自相矛盾，所以单独用一种说法。
    out.mismatch = out.direction !== '平稳' &&
      ((out.slopePerMonth > 0) !== (out.changePercent > 0));

    if (out.direction === '平稳') {
      out.summaryText = PHR.t('insight.trend.summary.flat',
        '近 {days} 天的{label}整体平稳，平均 {avg} {unit}，波动范围 {min}~{max} {unit}。',
        {
          days: days, label: label,
          avg: M.fmt(U.avg(ys), m.decimals), unit: m.unit,
          min: M.fmt(s.min, m.decimals), max: M.fmt(s.max, m.decimals)
        }) +
        (out.stability === '波动'
          ? PHR.t('insight.trend.summary.flatVolatile',
              '个别读数跳动较大，注意每次测量条件保持一致。')
          : '');
    } else if (out.mismatch) {
      out.summaryText = PHR.t('insight.trend.summary.mismatch',
        '近 {days} 天的{label}起伏较大：首尾相比从 {first} 变到 {last} {unit}（{sign}{pct}%），' +
        '但按最小二乘回归整体{direction}，约合每月{dirWord} {slope} {unit}。' +
        '首尾两点容易被单次测量误差带偏，建议结合趋势图判断。',
        {
          days: days, label: label,
          first: M.fmt(first.y, m.decimals), last: M.fmt(last.y, m.decimals), unit: m.unit,
          sign: (out.changePercent > 0 ? '+' : ''), pct: out.changePercent,
          direction: dirName(out.direction),
          dirWord: out.slopePerMonth > 0 ? '上升' : '下降',
          slope: M.fmt(Math.abs(out.slopePerMonth), m.decimals),
          perMonth: perMonthText(out.slopePerMonth, m.decimals, m.unit)
        });
    } else {
      out.summaryText = PHR.t('insight.trend.summary.normal',
        '近 {days} 天的{label}整体呈{direction}趋势，从 {first} {unit} 变化到 {last} {unit}' +
        '（{sign}{pct}%），约合每月{dirWord} {slope} {unit}。',
        {
          days: days, label: label, direction: dirName(out.direction),
          first: M.fmt(first.y, m.decimals), last: M.fmt(last.y, m.decimals), unit: m.unit,
          sign: (out.changePercent > 0 ? '+' : ''), pct: out.changePercent,
          dirWord: out.slopePerMonth > 0 ? '上升' : '下降',
          slope: M.fmt(Math.abs(out.slopePerMonth), m.decimals),
          perMonth: perMonthText(out.slopePerMonth, m.decimals, m.unit)
        }) +
        (out.better
          ? PHR.t('insight.trend.summary.good', '这个方向是好的，继续保持。')
          : PHR.t('insight.trend.summary.bad', '这个方向不理想，建议参考下方的预防建议调整。'));
    }
    return out;
  }

  /** 全部有数据指标的趋势；把"在恶化"的排在前面，方便首页卡片优先展示 */
  function analyzeAll(days) {
    return M.withData(days).map(function (s) { return analyze(s.metricKey, days); })
      .sort(function (a, b) {
        var wa = (a.empty ? 0 : (a.better ? 0 : 1));
        var wb = (b.empty ? 0 : (b.better ? 0 : 1));
        if (wa !== wb) { return wb - wa; }
        return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      });
  }

  /* ================================================================== *
   * 三、折线图配置（视图直接使用）
   * ================================================================== */
  function pointsOf(metricKey, days) {
    return vital().series(metricKey, { days: days }).map(function (p) {
      return { x: p.x, y: p.y, meta: p.meta };
    });
  }

  /**
   * 血压是"一次测量出两个数"，因此拆成收缩压 + 舒张压两条线。
   * 数据来源有两种：① systolic 记录里同时填了 value / value2；
   * ② 用户把收缩压、舒张压分别记成了两条记录。这里两种都兼容。
   */
  function bpSeries(days) {
    var sys = vital().series('systolic', { days: days });
    var dia = vital().series('diastolic', { days: days });
    var top = [], bottom = [];
    sys.forEach(function (p) {
      top.push({ x: p.x, y: p.y, meta: p.meta });
      if (p.y2 !== null && p.y2 !== undefined) { bottom.push({ x: p.x, y: p.y2, meta: p.meta }); }
    });
    dia.forEach(function (p) { bottom.push({ x: p.x, y: p.y, meta: p.meta }); });
    bottom.sort(function (a, b) { return a.x - b.x; });
    return [
      { name: PHR.t('insight.trend.bp.systolic', '收缩压（高压）'), color: 'var(--danger)', points: top },
      { name: PHR.t('insight.trend.bp.diastolic', '舒张压（低压）'), color: 'var(--info)', points: bottom }
    ].filter(function (s) { return s.points.length; });
  }

  /**
   * 生成 PHR.ui.chart.line 的配置。
   * @returns {object} { series, bands, references, yUnit, valueDigits, ... }
   */
  function chartConfig(metricKey, days) {
    days = days || 90;
    var m = D.metric(metricKey);
    var cfg = {
      height: 220, series: [], bands: [], references: [],
      yUnit: m ? m.unit : '', valueDigits: m ? m.decimals : 1,
      xTicks: 5, legend: true, showPoints: true,
      ariaLabel: PHR.t('insight.trend.chart.aria', '{metric}趋势图',
        { metric: (m ? m.name : metricKey) }),
      emptyText: PHR.t('insight.trend.chart.empty',
        '还没有「{metric}」的记录，点「记录一次」开始积累数据。',
        { metric: (m ? m.name : metricKey) })
    };
    if (!m) { return cfg; }

    cfg.series = M.isDual(metricKey)
      ? bpSeries(days)
      : [{ name: m.name, color: 'var(--c1)', points: pointsOf(metricKey, days) }];

    // 正常区间画成 ok 底纹，警戒区间画成 warning 底纹（阈值全部来自字典）
    if (!m.noThreshold) {
      cfg.bands.push({ min: m.normal.min, max: m.normal.max, level: 'ok',
        label: PHR.t('insight.trend.chart.normalBand', '正常区间') });
      if (m.warn.min !== null && (m.normal.min === null || m.warn.min < m.normal.min)) {
        cfg.bands.push({ min: m.warn.min, max: m.normal.min, level: 'warning' });
      }
      if (m.warn.max !== null && (m.normal.max === null || m.warn.max > m.normal.max)) {
        cfg.bands.push({ min: m.normal.max, max: m.warn.max, level: 'warning' });
      }
    }

    // 目标值参考线
    var refs = [];
    if (M.isDual(metricKey)) {
      ['systolic', 'diastolic'].forEach(function (k) {
        var mk = D.metric(k);
        if (mk && mk.target !== null) {
          refs.push({ value: mk.target,
            label: PHR.t('insight.trend.chart.targetByName', '{name}目标 {value}',
              { name: mk.shortName, value: M.fmt(mk.target, mk.decimals) }) });
        }
      });
    } else if (m.target !== null && m.target !== undefined) {
      refs.push({ value: m.target,
        label: PHR.t('insight.trend.chart.target', '目标 {value} {unit}',
          { value: M.fmt(m.target, m.decimals), unit: m.unit }) });
    }
    cfg.references = refs;
    return cfg;
  }

  /* ================================================================== *
   * 四、转折点检测（"什么时候开始见效的"）
   * ================================================================== */
  /**
   * 相邻两点变化超过 2 倍标准差 → 视为显著转折。
   * 标准差太小（数据几乎是一条直线）时退回"正常区间宽度的 15%"，避免把
   * 一丁点抖动都标成转折。
   * @returns [{ at, from, to, delta, note }]
   */
  function changePoints(metricKey, days) {
    days = days || 90;
    var m = D.metric(metricKey);
    var s = vital().summary(metricKey, { days: days });
    if (s.count < 3) { return []; }

    var ys = s.series.map(function (p) { return p.y; });
    var thr = 2 * std(ys);
    if (!(thr > 0)) {
      var width = (m.normal.min !== null && m.normal.max !== null) ? (m.normal.max - m.normal.min) : null;
      thr = width ? width * 0.15 : Math.abs(U.avg(ys)) * 0.1;
    }
    if (!(thr > 0)) { return []; }

    var out = [];
    for (var i = 1; i < s.series.length; i++) {
      var a = s.series[i - 1], b = s.series[i];
      var d = b.y - a.y;
      if (Math.abs(d) < thr) { continue; }
      var up = d > 0;
      out.push({
        at: b.x,
        from: a.y,
        to: b.y,
        delta: round(d, m.decimals),
        note: PHR.t(
          up ? 'insight.trend.changePoint.noteUp' : 'insight.trend.changePoint.noteDown',
          up ? '较上一次上升 {value} {unit}（{from} → {to}），超过 2 倍标准差，属于显著变化。'
             : '较上一次下降 {value} {unit}（{from} → {to}），超过 2 倍标准差，属于显著变化。',
          {
            value: M.fmt(Math.abs(d), m.decimals), unit: m.unit,
            from: M.fmt(a.y, m.decimals), to: M.fmt(b.y, m.decimals)
          })
      });
    }
    return out.reverse();   // 最近的转折点排在前面
  }

  /* ================================================================== *
   * 五、两段时间的均值对比
   * ================================================================== */
  /** 把 30 / {from,to} / {days,offset} 统一成 {from,to} */
  function normalizePeriod(p, defDays, defOffset) {
    if (typeof p === 'number' && p > 0) { p = { days: p }; }
    p = p || {};
    if (p.from && p.to) { return { from: U.parseDate(p.from), to: U.parseDate(p.to) }; }
    var days = p.days || defDays;
    var offset = p.offset === undefined ? defOffset : p.offset;
    var to = Date.now() - offset * DAY;
    return { from: to - days * DAY, to: to };
  }

  function avgOver(metricKey, range) {
    var pts = vital().series(metricKey, { from: range.from, to: range.to });
    if (!pts.length) { return { avg: null, count: 0, from: range.from, to: range.to }; }
    return {
      avg: round(U.avg(pts.map(function (p) { return p.y; })), M.decimalsOf(metricKey)),
      count: pts.length, from: range.from, to: range.to
    };
  }

  /**
   * 对比两个时间段。
   * @param {string} metricKey
   * @param {number|object} periodA 最近的一段（默认 30 天）
   * @param {number|object} periodB 更早的一段（默认 A 之前的 30 天）
   * @returns {{aAvg,bAvg,delta,deltaPercent,better,text}}
   */
  function compare(metricKey, periodA, periodB) {
    var m = D.metric(metricKey) || { unit: '', decimals: 1, shortName: metricKey, better: 'range', target: null };
    var aDays = (typeof periodA === 'number' && periodA > 0) ? periodA : ((periodA && periodA.days) || 30);
    var a = avgOver(metricKey, normalizePeriod(periodA, 30, 0));
    // periodB 缺省时取"紧挨着 A 之前的那一段"，这样两段不重叠，比较才有意义
    var b = avgOver(metricKey, normalizePeriod(periodB, aDays, aDays));

    var out = {
      metricKey: metricKey, aAvg: a.avg, bAvg: b.avg, aCount: a.count, bCount: b.count,
      delta: null, deltaPercent: null, better: true, text: ''
    };
    if (a.avg === null || b.avg === null) {
      out.text = PHR.t('insight.trend.compare.missing',
        '两段时间中有一段没有「{metric}」的记录，无法比较。',
        { metric: m.shortName });
      return out;
    }

    out.delta = round(a.avg - b.avg, m.decimals);
    out.deltaPercent = b.avg ? round(out.delta / Math.abs(b.avg) * 100, 1) : 0;
    if (m.better === 'lower') { out.better = out.delta <= 0; }
    else if (m.better === 'higher') { out.better = out.delta >= 0; }
    else if (m.target !== null && m.target !== undefined) {
      out.better = Math.abs(a.avg - m.target) <= Math.abs(b.avg - m.target);
    }

    /* 整句拆成"两段均值 + 变化方向"两截：
       中文句间用逗号直接相连，英文需要在两句之间留一个空格，
       因此 compare.lead 的英文词条刻意以空格结尾。 */
    var deltaText;
    if (out.delta === 0) {
      deltaText = PHR.t('insight.trend.compare.flat', '两者基本持平。');
    } else {
      var key = (out.delta > 0 ? 'insight.trend.compare.up' : 'insight.trend.compare.down')
        + (out.better ? '' : 'Bad');
      var zh = (out.delta > 0 ? '上升 {delta} {unit}（{sign}{pct}%）' : '下降 {delta} {unit}（{sign}{pct}%）')
        + (out.better ? '，方向是好的。' : '，这个变化方向不理想。');
      deltaText = PHR.t(key, zh, {
        delta: M.fmt(Math.abs(out.delta), m.decimals), unit: m.unit,
        sign: (out.deltaPercent > 0 ? '+' : ''), pct: out.deltaPercent
      });
    }
    out.text = PHR.t('insight.trend.compare.lead',
      '最近一段平均 {a} {unit}，上一段平均 {b} {unit}，',
      { a: M.fmt(a.avg, m.decimals), b: M.fmt(b.avg, m.decimals), unit: m.unit }) + deltaText;
    return out;
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.insight.trend = {
    analyze: analyze,
    analyzeAll: analyzeAll,
    chartConfig: chartConfig,
    changePoints: changePoints,
    compare: compare,
    linreg: linreg,
    std: std,
    /** 内部枚举 → 展示名（视图层不要直接用中文字面量拼句子） */
    dirName: dirName,
    stabilityName: stabilityName
  };

})(window.PHR);
