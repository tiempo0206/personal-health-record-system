/**
 * ============================================================================
 * 文件：modules/insight/anomaly-detector.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：异常检测与告警中心。把"一堆读数"变成"几条需要现在处理的提醒"。
 *      六类检测规则（每类的判定理由见下方各函数注释）：
 *        ① 单次越界    最新读数落到 warning / critical
 *        ② 连续异常    最近 3 次读数中 ≥2 次异常
 *        ③ 快速变化    相邻两次变化超过正常区间宽度的 30%（血压用 24h/30mmHg 规则）
 *        ④ 长期未测    超过 30 天没有记录，或从未记录
 *        ⑤ 趋势恶化    trend.analyze 判定方向朝向更差的一侧且幅度超过阈值
 *        ⑥ 多指标联合  多项指标同时越界（如代谢综合征风险）
 * 依赖：core/dict-metrics.js、core/store.js、modules/records/vital.service.js、
 *      modules/insight/{metrics,trend.service}.js
 * ============================================================================
 *
 * ⚠️ 免责声明：这里的规则是科普级的"提醒"，不是诊断。规则的设计目标是在
 *    「不漏掉明显问题」与「不制造无谓焦虑」之间取平衡 —— 因此宁可把
 *    不确定的情况降级为 low，也不把一次偶然波动说成"危险"。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var M = PHR.insight.metrics;

  var RANK = { high: 3, medium: 2, low: 1 };
  var TONE = { high: 'danger', medium: 'warn', low: 'info' };

  var DISMISS_KEY = 'insight_dismissed';      // 已忽略的告警
  var DISMISS_DAYS = 30;                      // 忽略 30 天后自动"复活"，避免永远看不到
  var AUDIT_KEY = 'insight_alert_log';        // 高危告警的审计去重表
  var BP_KEYS = ['systolic', 'diastolic'];
  var CORE_KEYS = ['systolic', 'diastolic', 'glucose', 'heartRate', 'bmi', 'weight'];
  var MAX_ALERTS = 12;                        // 一次最多提示多少条，避免刷屏

  function V() { return PHR.records.vital; }

  /* ================================================================== *
   * 一、工具
   * ================================================================== */
  /**
   * 告警 id。它必须"稳定但不永久"：
   *   · 包含触发它的那次读数时间 → 下次出现新读数时会产生新 id，旧的忽略不会误伤新问题；
   *   · 同一条读数重复扫描 id 不变 → 用户忽略后不会立刻弹回来。
   */
  function mkId(rule, metricKey, at) {
    return [rule, metricKey, at ? U.fmtDate(at) : 'na'].join(':');
  }

  /** 判定一个数值是否"异常"（warning 或 critical） */
  function isBad(metricKey, value) {
    var lv = D.judge(metricKey, value);
    return lv === 'warning' || lv === 'critical';
  }

  function push(out, o) {
    o.tone = TONE[o.level] || 'info';
    out.push(o);
  }

  function fmtReading(metricKey, value) {
    return M.fmt(value, M.decimalsOf(metricKey)) + ' ' + M.unitOf(metricKey);
  }

  /* ================================================================== *
   * 二、规则 ①：单次越界
   * 为什么这样判：字典已经把每一次读数分成了三档。最新一次读数落到
   * "需要关注"以上，说明用户此刻的状态就值得看一眼 —— 这是最直接、
   * 也最容易理解的一类提醒。critical 直接升为 high。
   * ================================================================== */
  function ruleLatest(s, out) {
    var lt = s.latest;
    if (!lt || (lt.level !== 'warning' && lt.level !== 'critical')) { return; }
    var e = M.explain(s.metricKey, lt.value);
    var last = s.series[s.series.length - 1];
    push(out, {
      id: mkId('latest', s.metricKey, lt.at),
      level: lt.level === 'critical' ? 'high' : 'medium',
      source: 'latest', metricKey: s.metricKey, metricName: s.metric.name,
      icon: lt.level === 'critical' ? '🚨' : '⚠️',
      value: lt.value, unit: s.metric.unit, at: lt.at,
      recordId: last ? last.id : null,
      title: PHR.t('insight.anomaly.latest.title', '「{metric}」最近一次读数{level}',
        { metric: s.metric.shortName, level: lt.levelName }),
      detail: PHR.t('insight.anomaly.latest.detail', '{detail}（测量时间：{at}）',
        { detail: e.detail, at: U.fmtDate(lt.at) }),
      advice: e.advice
    });
  }

  /* ================================================================== *
   * 三、规则 ②：连续异常
   * 为什么这样判：单次偏高常由情绪、睡眠、测量姿势造成；连续两次以上异常
   * 才更可能是真实的身体状态变化。只看"最近 3 次里至少有 2 次"是为了让
   * 提醒来得早一点，而不是等到问题坐实。
   * ================================================================== */
  function ruleConsecutive(s, out) {
    if (s.count < 3) { return; }
    var last3 = s.series.slice(-3);
    var bad = last3.filter(function (p) { return isBad(s.metricKey, p.y); });
    if (bad.length < 2) { return; }

    var hasCritical = bad.some(function (p) { return D.judge(s.metricKey, p.y) === 'critical'; });
    var list = bad.map(function (p) {
      return PHR.t('insight.anomaly.readingAt', '{value}（{date}）',
        { value: fmtReading(s.metricKey, p.y), date: U.fmtDate(p.x) });
    }).join(PHR.t('insight.punct.listSep', '、'));

    push(out, {
      id: mkId('series', s.metricKey, last3[last3.length - 1].x),
      level: hasCritical ? 'high' : 'medium',
      source: 'pattern', metricKey: s.metricKey, metricName: s.metric.name,
      icon: '📉',
      value: last3[last3.length - 1].y, unit: s.metric.unit, at: last3[last3.length - 1].x,
      recordId: last3[last3.length - 1].id,
      title: PHR.t('insight.anomaly.consecutive.title', '「{metric}」连续多次异常',
        { metric: s.metric.shortName }),
      detail: PHR.t('insight.anomaly.consecutive.detail',
        '最近 3 次读数中有 {n} 次超出正常范围：{list}。正常范围是 {range}。',
        { n: bad.length, list: list, range: M.normalRangeText(s.metric) }),
      advice: PHR.t('insight.anomaly.consecutive.advice',
        '连续异常比单次波动更值得重视。建议在相同条件下（同一时段、同样姿势）复测 2~3 次，' +
        '若仍然异常，请带上这几条记录就诊。')
    });
  }

  /* ================================================================== *
   * 四、规则 ③：快速变化
   * 为什么这样判（三重条件，缺一不可）：
   *   ① 幅度达到"正常区间宽度的 30%"—— 接近一整档的三分之一，才值得复核；
   *   ② 变化后的数值本身已经偏离正常（落在 warning 以上），
   *      或者变化幅度达到"一档的 60%"——即使还在正常范围内也够大了；
   *   ③ 该指标的"单次读数"本身要有可比性。步数被明确排除：同一个人不同日子
   *      的日累计步数相差几千步完全正常，逐日比较只会制造噪音；它的真实问题
   *      由「趋势恶化（看多日均值）」和「单次越界」两条规则负责。
   *   血压单独使用 24 小时 / 30 mmHg 规则：收缩压正常区间宽度只有 39，
   *   30% 仅约 12 mmHg，而这在家庭自测中属于常见噪声；30 mmHg 是家庭血压
   *   监测中公认需要复测的波动幅度。
   * ================================================================== */
  var NO_JUMP = { steps: '日累计步数逐日波动天然很大，不适合做相邻两次比较' };

  function ruleFastChange(s, out) {
    var m = s.metric;
    if (m.noThreshold || s.count < 2 || NO_JUMP[s.metricKey]) { return; }

    var isBp = BP_KEYS.indexOf(s.metricKey) >= 0;
    var width = (m.normal.min !== null && m.normal.max !== null) ? (m.normal.max - m.normal.min) : null;
    var base = isBp ? 30 : (width ? width * 0.3 : Math.abs(s.avg) * 0.2);
    if (!base) { return; }
    var big = isBp ? 30 : (width ? width * 0.6 : Math.abs(s.avg) * 0.4);

    var series = s.series;
    for (var i = series.length - 1; i >= 1; i--) {
      var a = series[i - 1], b = series[i];
      // 血压限定在"相邻两次测量落在同一个 24 小时窗口内"
      if (isBp && (b.x - a.x) > 86400000) { continue; }
      var d = b.y - a.y;
      if (Math.abs(d) < base) { continue; }

      var lv = D.judge(s.metricKey, b.y);
      // 条件②：变化后的数值本身异常，或幅度足够大
      if (lv === 'ok' && Math.abs(d) < big) { continue; }

      var up = d > 0;
      push(out, {
        id: mkId('jump', s.metricKey, b.x),
        level: lv === 'critical' ? 'high' : lv === 'warning' ? 'medium' : 'low',
        source: 'pattern', metricKey: s.metricKey, metricName: m.name,
        icon: '⚡',
        value: b.y, unit: m.unit, at: b.x, recordId: b.id,
        title: PHR.t('insight.anomaly.fast.title', '「{metric}」短时间内变化较快',
          { metric: m.shortName }),
        detail: PHR.t(
          up ? 'insight.anomaly.fast.detailUp' : 'insight.anomaly.fast.detailDown',
          up ? '{from} 为 {fromVal}，{to} 变为 {toVal}，上升 {delta} {unit}' +
               '（判定阈值 {threshold} {unit}）。{note}'
             : '{from} 为 {fromVal}，{to} 变为 {toVal}，下降 {delta} {unit}' +
               '（判定阈值 {threshold} {unit}）。{note}',
          {
            from: U.fmtDate(a.x), fromVal: fmtReading(s.metricKey, a.y),
            to: U.fmtDate(b.x), toVal: fmtReading(s.metricKey, b.y),
            delta: M.fmt(Math.abs(d), m.decimals), unit: m.unit,
            threshold: M.fmt(base, m.decimals),
            note: isBp
              ? PHR.t('insight.anomaly.fast.bpNote',
                  '家庭血压监测中，24 小时内波动超过 30 mmHg 建议复测确认。')
              : ''
          }),
        advice: PHR.t('insight.anomaly.fast.advice',
          '先确认两次测量条件是否一致（时段、姿势、是否刚运动或服药），' +
          '条件不一致时以复测结果为准；若复测仍然如此，请咨询医生。')
      });
      return;   // 每个指标只报最近的一次快速变化
    }
  }

  /* ================================================================== *
   * 五、规则 ④：长期未测 / 从未记录
   * 为什么这样判：没有数据就没有趋势，风险评分也会失真。但"从未记录"
   * 的 16 个指标全报一遍会变成骚扰，所以只对核心指标（血压、血糖、
   * 心率、体重、BMI）做从未记录提示；已有历史但断更的则逐项提示。
   * ================================================================== */
  function ruleStale(out) {
    V().missing(30).forEach(function (item) {
      var ever = V().series(item.metricKey).length > 0;
      if (!ever && CORE_KEYS.indexOf(item.metricKey) < 0) { return; }

      var daysAgo = item.lastAt ? Math.floor((Date.now() - item.lastAt) / 86400000) : null;
      // 断更超过 90 天说明已经严重影响趋势判断，升为中优先级
      var level = !ever ? 'low' : (daysAgo > 90 ? 'medium' : 'low');

      push(out, {
        id: mkId('stale', item.metricKey, item.lastAt),
        level: level,
        source: 'pattern', metricKey: item.metricKey, metricName: item.name,
        icon: '⏰',
        value: null, unit: item.unit, at: item.lastAt || Date.now(), recordId: null,
        title: ever
          ? PHR.t('insight.anomaly.stale.titleEver', '「{metric}」已 {days} 天没有记录',
              { metric: item.name, days: daysAgo })
          : PHR.t('insight.anomaly.stale.titleNever', '还没有记录过「{metric}」',
              { metric: item.name }),
        detail: ever
          ? PHR.t('insight.anomaly.stale.detailEver',
              '上一次记录停留在 {date}，距今 {days} 天。数据断档后，趋势分析与风险评分都会失真。',
              { date: U.fmtDate(item.lastAt), days: daysAgo })
          : PHR.t('insight.anomaly.stale.detailNever',
              '系统里没有找到「{metric}」的读数，因此无法判断它的变化。{desc}',
              { metric: item.name, desc: item.desc }),
        advice: ever
          ? PHR.t('insight.anomaly.stale.adviceEver',
              '建议近期补测一次并记录，之后按固定频率（如每月一次）保持。')
          : PHR.t('insight.anomaly.stale.adviceNever', '建议补录一次作为基线。{desc}',
              { desc: item.desc || '' })
      });
    });
  }

  /* ================================================================== *
   * 六、规则 ⑤：趋势恶化
   * 为什么这样判：单次读数正常、但连续几个月朝坏的方向走，是最容易被
   * 忽略的情况。这里要求两个条件同时成立：① 回归判定方向不是"平稳"；
   * ② 该方向与指标的期望方向相反；③ 累计变化幅度 ≥5%，避免把微小漂移
   * 说成恶化。
   * ================================================================== */
  function ruleTrendWorse(s, out) {
    if (s.count < 3) { return; }
    var t = PHR.insight.trend.analyze(s.metricKey, 90);
    if (t.empty || t.direction === '平稳' || t.better) { return; }
    // 首尾变化与回归斜率符号相反时，说明数据起伏太大，不足以断言"趋势恶化"
    if (t.mismatch) { return; }
    if (Math.abs(t.changePercent) < 5) { return; }

    var lv = s.latest ? s.latest.level : 'ok';
    var dir = PHR.insight.trend.dirName(t.direction);
    push(out, {
      id: mkId('trend', s.metricKey, s.to),
      level: lv === 'critical' ? 'high' : 'medium',
      source: 'trend', metricKey: s.metricKey, metricName: s.metric.name,
      icon: '📈',
      value: s.latest ? s.latest.value : null, unit: s.metric.unit,
      at: s.to, recordId: null,
      title: PHR.t('insight.anomaly.trend.title',
        '「{metric}」近 90 天持续{direction}，方向不理想',
        { metric: s.metric.shortName, direction: dir }),
      detail: PHR.t('insight.anomaly.trend.detail',
        '{summary}（基于 {n} 次读数的最小二乘回归，拟合优度 R²={r2}）',
        { summary: t.summaryText, n: t.count, r2: t.r2 }),
      advice: PHR.t('insight.anomaly.trend.advice',
        '趋势性变化比单次读数更值得重视。建议先从饮食、运动、作息三方面找原因，' +
        '并把这段时间的记录整理好，在下次复诊时交给医生判断。')
    });
  }

  /* ================================================================== *
   * 七、规则 ⑥：多指标联合
   * 为什么这样判：单独看每一项都只是"偏高一点"，但几项代谢指标同时偏高时，
   * 心血管风险是相互叠加的，而不是简单相加。这类情况必须单独成一条，
   * 并明确写出"是三件事同时出现"，否则用户会逐条处理、看不到全局。
   * ================================================================== */
  function ruleCombo(out) {
    function avg30(key) {
      var s = V().summary(key, { days: 30 });
      return s.count ? s.avg : null;
    }
    function latest(key) {
      var s = V().summary(key, { days: 365 });
      return s.latest ? s.latest.value : null;
    }

    var bmi = latest('bmi');
    var sys = avg30('systolic');
    var ldl = latest('ldl');
    var glu = latest('glucose');

    if (bmi !== null && sys !== null && ldl !== null && bmi >= 24 && sys >= 130 && ldl >= 3.4) {
      push(out, {
        id: mkId('combo', 'metabolic', null),
        level: 'high', source: 'pattern', icon: '🧩',
        metricKey: 'bmi',
        metricName: PHR.t('insight.anomaly.combo.metabolic.metricName', '代谢相关指标（联合）'),
        value: bmi, unit: 'kg/m²', at: Date.now(), recordId: null,
        title: PHR.t('insight.anomaly.combo.metabolic.title',
          '代谢综合征风险：三项指标同时偏高'),
        detail: PHR.t('insight.anomaly.combo.metabolic.detail',
          '「BMI {bmi} kg/m²（≥24）」「近 30 天收缩压平均 {sys} mmHg（≥130）」' +
          '「低密度脂蛋白 {ldl} mmol/L（≥3.4）」三项同时出现。' +
          '单独看每一项都只是偏高，但三者同时存在时风险是叠加的，这一点逐条看提醒是看不出来的。',
          { bmi: bmi, sys: sys, ldl: ldl }),
        advice: PHR.t('insight.anomaly.combo.metabolic.advice',
          '建议到内分泌科或心血管内科做一次系统评估（空腹血糖、血脂四项、肝肾功能），' +
          '并把最近 90 天的血压与体重记录一起带给医生。')
      });
    }

    if (sys !== null && glu !== null && sys >= 130 && glu >= 7.0) {
      push(out, {
        id: mkId('combo', 'cardio-metabolic', null),
        level: 'high', source: 'pattern', icon: '🧩',
        metricKey: 'glucose',
        metricName: PHR.t('insight.anomaly.combo.cardio.metricName', '血压与血糖（联合）'),
        value: glu, unit: 'mmol/L', at: Date.now(), recordId: null,
        title: PHR.t('insight.anomaly.combo.cardio.title',
          '血压与血糖同时偏高，心血管风险叠加'),
        detail: PHR.t('insight.anomaly.combo.cardio.detail',
          '「近 30 天收缩压平均 {sys} mmHg」与「最近一次空腹血糖 {glu} mmol/L」同时偏高。' +
          '高血压与高血糖会相互加重对血管的损伤。',
          { sys: sys, glu: glu }),
        advice: PHR.t('insight.anomaly.combo.cardio.advice',
          '建议尽早到内分泌科就诊，评估是否需要同时管理血压与血糖，不要只处理其中一项。')
      });
    }
  }

  /* ================================================================== *
   * 八、扫描入口
   * ================================================================== */
  /**
   * 扫描全部指标，产出告警数组。
   * @param {number} [days] 趋势观察窗口，默认 90 天
   * @returns {Array<{id, level, tone, metricKey, metricName, icon, value, unit, at,
   *                  title, detail, advice, source, recordId}>}
   */
  function scan(days) {
    days = days || 90;
    var out = [];
    var metrics = M.withData(days);

    metrics.forEach(function (s) {
      ruleLatest(s, out);
      ruleConsecutive(s, out);
      ruleFastChange(s, out);
      ruleTrendWorse(s, out);
    });
    ruleStale(out);
    ruleCombo(out);

    // 血压是"同一次测量出的两个数"：收缩压与舒张压在同一天触发同类告警时，
    // 只保留收缩压那条 —— 否则用户会以为出现了两个独立的问题。
    out = out.filter(function (a) {
      if (a.metricKey !== 'diastolic') { return true; }
      return !out.some(function (b) {
        return b.metricKey === 'systolic' && b.source === a.source &&
          U.fmtDate(b.at) === U.fmtDate(a.at);
      });
    });

    out.sort(function (a, b) {
      return (RANK[b.level] - RANK[a.level]) || (b.at - a.at);
    });
    out = out.slice(0, MAX_ALERTS);

    auditHigh(out);
    return out;
  }

  /* ================================================================== *
   * 九、高危告警写审计（同一指标同一天只写一次）
   * ================================================================== */
  function auditHigh(list) {
    if (!PHR.audit || !PHR.audit.log) { return; }
    var log;
    try { log = PHR.store.read(AUDIT_KEY, {}) || {}; } catch (e) { return; }

    var today = U.today();
    var changed = false;
    Object.keys(log).forEach(function (k) {
      if (U.daysBetween(today, log[k]) > 7) { delete log[k]; changed = true; }
    });

    list.filter(function (a) { return a.level === 'high'; }).forEach(function (a) {
      var key = a.metricKey + '@' + today;
      if (log[key]) { return; }
      log[key] = today;
      changed = true;
      PHR.audit.log({
        action: 'insight.alert', targetType: 'metric', targetId: a.metricKey,
        targetName: a.metricName, result: 'success',
        detail: PHR.t('insight.anomaly.auditDetail', '{title}：{detail}',
          { title: a.title, detail: String(a.detail || '').slice(0, 160) })
      });
    });

    if (changed) {
      try { PHR.store.write(AUDIT_KEY, log); } catch (e) { PHR.warn(PHR.t('insight.warn.dedupWriteFail', '告警去重表写入失败'), e); }
    }
  }

  /* ================================================================== *
   * 十、展示过滤、忽略与统计
   * ================================================================== */
  /** 已忽略的告警 id（超过 30 天的自动失效，避免"忽略一次就永远看不见"） */
  function dismissed() {
    var rows;
    try { rows = PHR.store.read(DISMISS_KEY, []) || []; } catch (e) { return []; }
    var now = Date.now();
    return rows
      .filter(function (r) { return r && r.id && (now - r.at) < DISMISS_DAYS * 86400000; })
      .map(function (r) { return r.id; });
  }

  /** 忽略一条告警 */
  function dismiss(id) {
    if (!id) { return false; }
    var rows;
    try { rows = PHR.store.read(DISMISS_KEY, []) || []; } catch (e) { rows = []; }
    rows = rows.filter(function (r) { return r && r.id !== id && r.id; });
    rows.push({ id: id, at: Date.now() });
    if (rows.length > 200) { rows = rows.slice(rows.length - 200); }
    try { PHR.store.write(DISMISS_KEY, rows); } catch (e) { PHR.warn(PHR.t('insight.warn.dismissFail', '忽略告警失败'), e); }
    return true;
  }

  /** 恢复某条被忽略的告警 */
  function restore(id) {
    var rows;
    try { rows = PHR.store.read(DISMISS_KEY, []) || []; } catch (e) { return false; }
    try { PHR.store.write(DISMISS_KEY, rows.filter(function (r) { return r && r.id !== id; })); }
    catch (e) { return false; }
    return true;
  }

  /** 清空全部忽略记录 */
  function clearDismissed() {
    try { PHR.store.write(DISMISS_KEY, []); } catch (e) { PHR.warn(PHR.t('insight.warn.clearDismissFail', '清空忽略记录失败'), e); }
    return true;
  }

  /** 当前生效的提醒敏感度（防御式读取用户偏好） */
  function thresholdOf() {
    try {
      if (PHR.ux && PHR.ux.preference && PHR.ux.preference.get) {
        return PHR.ux.preference.get('alertThreshold') || 'warning';
      }
    } catch (e) { /* 偏好模块缺失时用默认值 */ }
    return 'warning';
  }

  /**
   * 按"全局开关 + 用户偏好 + 已忽略"过滤后，返回真正要显示的告警。
   * @param {object} [opt] { days, list }
   */
  function active(opt) {
    if (PHR.config && PHR.config.abnormalAlert === false) { return []; }
    opt = opt || {};
    var list = opt.list || scan(opt.days);
    var blocked = dismissed();
    var pref = thresholdOf();
    var min = pref === 'critical' ? RANK.high : pref === 'ok' ? RANK.low : RANK.medium;
    return list.filter(function (a) {
      return RANK[a.level] >= min && blocked.indexOf(a.id) < 0;
    });
  }

  /** 按等级分组统计 */
  function byLevel(opt) {
    opt = opt || {};
    var list = opt.list || scan(opt.days);
    var g = { high: [], medium: [], low: [] };
    list.forEach(function (a) { (g[a.level] || g.low).push(a); });
    return {
      high: g.high, medium: g.medium, low: g.low,
      count: { high: g.high.length, medium: g.medium.length, low: g.low.length, total: list.length }
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.insight.anomaly = {
    scan: scan,
    active: active,
    byLevel: byLevel,
    dismiss: dismiss,
    dismissed: dismissed,
    restore: restore,
    clearDismissed: clearDismissed,
    thresholdOf: thresholdOf
  };

  /* rules / disclaimer 都用 getter：加载本文件时语言还没定，
     直接取值会永远停在中文（详见 metrics.js 的同类说明）。 */
  Object.defineProperty(PHR.insight.anomaly, 'rules', {
    enumerable: true,
    get: function () {
      return [
        PHR.t('insight.anomaly.rule.latest', '单次越界'),
        PHR.t('insight.anomaly.rule.consecutive', '连续异常'),
        PHR.t('insight.anomaly.rule.fastChange', '快速变化'),
        PHR.t('insight.anomaly.rule.stale', '长期未测'),
        PHR.t('insight.anomaly.rule.trendWorse', '趋势恶化'),
        PHR.t('insight.anomaly.rule.combo', '多指标联合')
      ];
    }
  });
  Object.defineProperty(PHR.insight.anomaly, 'disclaimer', {
    enumerable: true,
    get: function () {
      return PHR.t('insight.anomaly.disclaimer',
        '提醒规则基于公开的流行病学常识与指标字典阈值，用于帮助您发现值得复测或就诊的情况，不构成诊断。');
    }
  });

})(window.PHR);
