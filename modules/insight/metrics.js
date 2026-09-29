/**
 * ============================================================================
 * 文件：modules/insight/metrics.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：健康洞察模块的入口文件与「指标语义层」。
 *      它是 core/dict-metrics.js 之上的一层薄封装：把冷冰冰的阈值翻译成
 *      用户能听懂的话，例如「空腹血糖 7.8 mmol/L，高于正常上限 6.1，
 *      属于需要关注的范围」。
 *
 *      ⚠️ 本文件**不定义任何医学数字**。正常 / 警戒 / 危急三级阈值的唯一来源
 *         是 core/dict-metrics.js，从而保证档案中心、健康洞察、医生视图三处
 *         对同一个数值的判定完全一致。
 * 依赖：core/namespace.js、core/dict-metrics.js、core/dict.js、
 *      modules/records/vital.service.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* 本模块是 modules/insight 中第一个被加载的文件，负责建立命名空间 */
  PHR.insight = PHR.insight || {};

  /* 模块元信息。
     注意：registerModule 会把 title/description **按值复制**进模块注册表，
     而本文件是在 boot 之前加载的（此时语言还没经 detect() 定下来），
     所以这里必须用 getter 延迟取值 —— 否则模块名会永远停在加载时的中文。 */
  var modMeta = PHR.registerModule('insight', {
    title: '健康洞察',
    description: '趋势分析、异常提醒、风险评估与预防建议：把复杂的指标变成看得懂的话',
    icon: '📈',
    order: 5
  });
  Object.defineProperty(modMeta, 'title', {
    configurable: true,
    get: function () { return PHR.t('module.insight.title', '健康洞察'); }
  });
  Object.defineProperty(modMeta, 'description', {
    configurable: true,
    get: function () {
      return PHR.t('module.insight.desc',
        '趋势分析、异常提醒、风险评估与预防建议：把复杂的指标变成看得懂的话');
    }
  });

  /* 覆盖率分级：记录条数越多，趋势结论越可信 */
  var COVERAGE = [
    { min: 10, name: '充足', key: 'abundant' },
    { min: 4, name: '偏少', key: 'sparse' },
    { min: 0, name: '不足', key: 'insufficient' }
  ];

  /**
   * 健康洞察页面共享的界面状态。
   * 服务层（本目录下的 *.service.js / anomaly.js / risk.js / advice.js）只读它，
   * 视图层负责写入，这样切页签、切时间范围时不必层层传参。
   */
  PHR.insight.state = PHR.insight.state || { tab: 'overview', days: 90, metrics: [] };

  /** 全模块统一的免责声明（所有对外返回的分析结果都会带上它）
   *  用 getter 暴露：语言可以随时切换，字符串不能在加载时定死。 */
  function disclaimerText() {
    return PHR.t('insight.disclaimer',
      '本页所有分析（趋势、告警、风险评分与预防建议）都是基于公开流行病学常识的' +
      '规则型科普提示，不构成医学诊断，也不能替代医生的专业判断。' +
      '任何用药、停药或治疗方案调整，请务必咨询具备执业资格的医生；' +
      '若出现胸痛、呼吸困难、意识改变等急症表现，请立即拨打 120。');
  }

  /* ================================================================== *
   * 一、数字与区间的中文排版
   * ================================================================== */
  /** 按指标精度格式化数字 */
  function fmt(v, digits) {
    if (v === null || v === undefined || isNaN(v)) { return '—'; }
    return Number(v).toFixed(digits === undefined ? 1 : digits);
  }

  /** 把一个区间渲染成「90~129」「≤ 3.40」「≥ 6000」 */
  function rangeText(range, digits) {
    if (!range) { return '—'; }
    var a = range.min, b = range.max;
    // min = 0 的指标（LDL、ALT、腰围…）医学上是"越低越好"，下界 0 只是占位，
    // 写成「0.00~3.40」会让人误以为低于 0 才有问题，因此统一表现为「≤ 3.40」。
    var noLow = (a === null || a === undefined || a === 0);
    var noHigh = (b === null || b === undefined);
    if (noLow && noHigh) { return PHR.t('insight.metric.noLimit', '不设限'); }
    if (noLow) { return '≤ ' + fmt(b, digits); }
    if (noHigh) { return '≥ ' + fmt(a, digits); }
    return fmt(a, digits) + '~' + fmt(b, digits);
  }

  /* ================================================================== *
   * 二、指标清单与查询
   * ================================================================== */
  function list() { return D.metrics.slice(); }

  function get(key) { return D.metric(key); }

  /** 按 group 归并（血压的收缩压/舒张压会合并成一组） */
  function groups() { return D.metricGroups(); }

  /** 是否是需要两个数值的指标（血压） */
  function isDual(key) { return key === 'systolic' || key === 'diastolic'; }

  /** 有数据的指标摘要（未记录过的指标不返回） */
  function withData(days) {
    if (!PHR.records || !PHR.records.vital) { return []; }
    return PHR.records.vital.summaryAll(days ? { days: days } : undefined)
      .filter(function (s) { return s.count > 0; });
  }

  /** 记录条数 → 覆盖率文案 */
  function coverageOf(count) {
    for (var i = 0; i < COVERAGE.length; i++) {
      if (count >= COVERAGE[i].min) {
        return PHR.t('insight.coverage.' + COVERAGE[i].key, COVERAGE[i].name);
      }
    }
    return PHR.t('insight.coverage.insufficient', '不足');
  }

  /** 正常区间的中文表述，如「90~129 mmHg」 */
  function normalRangeText(metric) {
    if (!metric) { return '—'; }
    if (metric.noThreshold) {
      return PHR.t('insight.metric.noAbsoluteNormal', '该指标没有绝对正常值');
    }
    return rangeText(metric.normal, metric.decimals) + ' ' + metric.unit;
  }

  /* ================================================================== *
   * 三、单个指标的状态
   * ================================================================== */
  /**
   * 指标的当前状态。
   * @param {string} metricKey
   * @param {number} [days] 只统计最近多少天
   * @returns {{level, levelName, tone, latest, count, coverage, avg, lastAt, summary}}
   */
  function statusOf(metricKey, days) {
    var m = get(metricKey);
    var s = (PHR.records && PHR.records.vital)
      ? PHR.records.vital.summary(metricKey, days ? { days: days } : undefined)
      : { count: 0, series: [] };
    var level = s.latest ? s.latest.level : 'unknown';
    return {
      metricKey: metricKey,
      metric: m,
      level: level,
      levelName: D.judgeName(level),
      tone: D.judgeTone(level),
      latest: s.latest || null,
      avg: s.count ? s.avg : null,
      count: s.count || 0,
      coverage: coverageOf(s.count || 0),
      lastAt: s.count ? s.to : null,
      summary: s
    };
  }

  /* ================================================================== *
   * 四、核心：把数字翻译成人话
   * ================================================================== */
  /**
   * 解释一次读数。
   * @param {string} metricKey
   * @param {number} value
   * @returns {{level, levelName, tone, headline, detail, advice, compareText}}
   *   headline    一句话结论，如「空腹血糖 7.8 mmol/L，高于正常上限 6.1」
   *   detail      完整解释（结论 + 处于什么范围 + 这个指标是什么）
   *   advice      分级建议，取自字典的 adviceNormal / adviceWarn / adviceCritical
   *   compareText 与正常边界的差距
   */
  function explain(metricKey, value) {
    var m = get(metricKey);
    var out = {
      metricKey: metricKey, metric: m || null, value: value,
      level: 'unknown', levelName: '—', tone: 'muted',
      headline: '', detail: '', advice: '', compareText: ''
    };
    if (!m) { out.headline = PHR.t('insight.metric.unknown', '未知指标'); return out; }

    var v = Number(value);
    var level = D.judge(metricKey, v);
    out.level = level;
    out.levelName = D.judgeName(level);
    out.tone = D.judgeTone(level);

    var name = m.shortName || m.name;
    var unit = m.unit || '';
    var show = fmt(v, m.decimals);

    // ① 没有阈值的指标（如体重）：只陈述数值，把重点引向趋势
    if (m.noThreshold || isNaN(v)) {
      out.headline = name + ' ' + show + ' ' + unit;
      out.detail = PHR.t('insight.explain.detailPlain', '{headline}。{desc}',
        { headline: out.headline, desc: m.desc });
      out.advice = level === 'ok' ? m.adviceNormal : m.adviceWarn;
      out.compareText = PHR.t('insight.explain.noThresholdCompare',
        '该指标没有绝对正常值，系统更关注它的变化趋势。');
      return out;
    }

    // ② 找出被突破的那一侧边界
    var bound = null;
    var isHigh = false;                    // 突破的是上限还是下限（用于选词条，不用于拼中文）
    if (m.normal.max !== null && m.normal.max !== undefined && v > m.normal.max) {
      bound = m.normal.max; isHigh = true;
    } else if (m.normal.min !== null && m.normal.min !== undefined && v < m.normal.min) {
      bound = m.normal.min; isHigh = false;
    }

    if (bound === null) {
      out.headline = PHR.t('insight.explain.headlineNormal',
        '{name} {value} {unit}，在正常范围内',
        { name: name, value: show, unit: unit });
      out.compareText = PHR.t('insight.explain.rangeNormal', '正常范围 {range}。',
        { range: normalRangeText(m) });
    } else {
      out.headline = PHR.t(
        isHigh ? 'insight.explain.headlineHigh' : 'insight.explain.headlineLow',
        isHigh ? '{name} {value} {unit}，高于正常上限 {bound}'
               : '{name} {value} {unit}，低于正常下限 {bound}',
        { name: name, value: show, unit: unit, bound: fmt(bound, m.decimals) });
      out.compareText = PHR.t(
        isHigh ? 'insight.explain.compareHigh' : 'insight.explain.compareLow',
        isHigh ? '比正常上限高 {diff} {unit}（正常范围 {range}）。'
               : '比正常下限低 {diff} {unit}（正常范围 {range}）。',
        { diff: fmt(Math.abs(v - bound), m.decimals), unit: unit, range: normalRangeText(m) });
    }

    // ③ 用一句话说明"落在哪一档"（分级只描述区间，不暗示诊断）
    var scope = PHR.t('insight.explain.scope.' + level,
      level === 'ok' ? '属于正常范围'
        : level === 'warning' ? '属于需要关注的范围'
        : '属于明显异常的范围，建议尽快就医');
    out.detail = PHR.t('insight.explain.detail', '{headline}，{scope}。{desc}',
      { headline: out.headline, scope: scope, desc: m.desc });
    out.advice = level === 'ok' ? m.adviceNormal
      : level === 'warning' ? m.adviceWarn
      : m.adviceCritical;
    return out;
  }

  /* ================================================================== *
   * 五、单位 / 精度 / 目标值
   * ================================================================== */
  function unitOf(metricKey) {
    var m = get(metricKey);
    return m ? m.unit : '';
  }

  function decimalsOf(metricKey) {
    var m = get(metricKey);
    return m ? m.decimals : 1;
  }

  /** 目标值（理想值）；没有定义时返回 null */
  function targetOf(metricKey) {
    var m = get(metricKey);
    return (m && m.target !== null && m.target !== undefined) ? m.target : null;
  }

  /** 该指标是否朝向"更低"更好 */
  function betterOf(metricKey) {
    var m = get(metricKey);
    return m ? m.better : 'range';
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  var api = {
    list: list,
    get: get,
    groups: groups,
    isDual: isDual,
    withData: withData,
    statusOf: statusOf,
    coverageOf: coverageOf,
    normalRangeText: normalRangeText,
    rangeText: rangeText,
    explain: explain,
    fmt: fmt,
    unitOf: unitOf,
    decimalsOf: decimalsOf,
    targetOf: targetOf,
    betterOf: betterOf
  };

  /* 免责声明用 getter：调用点写的还是 M.DISCLAIMER，但每次读到的都是当前语言 */
  Object.defineProperty(api, 'DISCLAIMER', {
    enumerable: true,
    get: disclaimerText
  });

  PHR.insight.metrics = api;

})(window.PHR);
