/**
 * ============================================================================
 * 文件：modules/assessment/scoring.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：计分引擎 —— 把「一份作答」变成「一组分数与分级」。
 *
 *      核心设计：**零特判**。引擎里没有任何一句 "if (scaleKey === 'phq9')"
 *      之类的量表专属逻辑，所有差异都从 scales.js 的声明里读：
 *        · 反向计分     读题目上的 reverse
 *        · 单题选项不同 读题目上的 options（否则用量表级 options）
 *        · 线性换算     读量表上的 transform
 *        · 分级         读量表上的 levels（按 max 升序取第一个满足的）
 *      因此新增一个量表**不需要动本文件**。
 *
 * 依赖：modules/assessment/scales.js、core/utils.js
 * ============================================================================
 *
 * 数据结构约定：
 *   answers = { 1: 0, 2: 3, ... }   // 键是题号 item.i，值是所选选项的 value
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var S = PHR.assessment.scales;

  /* ================================================================== *
   * 一、基础取值
   * ================================================================== */

  /** 某题选项里的最大分值（反向计分要用） */
  function maxOptionOf(scaleKey, i) {
    return U.max(S.optionsOf(scaleKey, i), 'value') || 0;
  }

  /**
   * 把用户选的原始值换算成本题得分。
   * 反向计分题（reverse: true）做 max - value 翻转。
   * 例：PSS-10 第 4 题「对自己处理问题的能力有信心」
   *     选 4（非常经常）说明掌控感强 → 本题应记 0 分。
   */
  function itemScore(scaleKey, itemDef, value) {
    if (value === null || value === undefined || value === '') { return null; }
    var v = Number(value);
    if (isNaN(v)) { return null; }
    if (!itemDef || !itemDef.reverse) { return v; }
    return maxOptionOf(scaleKey, itemDef.i) - v;
  }

  /** 取某题某分值对应的文字标签（报告里展示"你选了哪一项"） */
  function labelOf(scaleKey, i, value) {
    if (value === null || value === undefined) {
      return PHR.t('assessment.scoring.unanswered', '未作答');
    }
    var opts = S.optionsOf(scaleKey, i);
    var hit = opts.filter(function (o) { return Number(o.value) === Number(value); })[0];
    return hit ? hit.label : String(value);
  }

  /* ================================================================== *
   * 二、完整性校验
   * ================================================================== */
  /**
   * 检查是否全部作答。
   * @returns {{ok:boolean, missing:number[], answered:number, total:number, percent:number}}
   */
  function validate(scaleKey, answers) {
    var scale = S.get(scaleKey);
    if (!scale) {
      return { ok: false, missing: [], answered: 0, total: 0, percent: 0,
               reason: PHR.t('assessment.scoring.noScale', '量表不存在') };
    }

    answers = answers || {};
    var missing = [];
    scale.items.forEach(function (it) {
      var v = answers[it.i];
      if (v === null || v === undefined || v === '') { missing.push(it.i); }
    });

    var answered = scale.items.length - missing.length;
    return {
      ok: missing.length === 0,
      missing: missing,
      answered: answered,
      total: scale.items.length,
      percent: Math.round(answered / scale.items.length * 100),
      reason: missing.length
        ? PHR.t('assessment.scoring.missing', '还有 {n} 题未作答', { n: missing.length })
        : ''
    };
  }

  /* ================================================================== *
   * 三、分级
   * ================================================================== */
  /**
   * 按总分取分级。levels 按 max 升序排列，取第一个 total <= max 的档。
   * 若总分超出最后一档（理论上不会），回退到最后一档。
   */
  function levelOf(scale, total) {
    if (!scale || !scale.levels || !scale.levels.length) {
      return { key: 'unknown', name: '—', tone: 'muted', summary: '' };
    }
    for (var i = 0; i < scale.levels.length; i++) {
      if (total <= scale.levels[i].max) { return scale.levels[i]; }
    }
    return scale.levels[scale.levels.length - 1];
  }

  /* ================================================================== *
   * 四、主计分
   * ================================================================== */
  /**
   * 计算一份作答的完整结果。
   * @param {string} scaleKey
   * @param {object} answers { 题号: 选项值 }
   * @returns {object} {
   *   scaleKey, scaleName, icon, color,
   *   raw,              原始总分（未做线性换算）
   *   total,            最终总分（已做线性换算）
   *   max,              最终满分
   *   percent,          得分率 0~100
   *   level,            分级对象 { key, name, tone, summary }
   *   dimensions,       维度分 [{ key, name, score, max, percent, level }]
   *   items,            逐题明细 [{ i, text, value, label, score, reverse }]
   *   critical,         命中的关键条目 [{ i, text, value, label }]
   *   answeredCount, totalCount, at
   * }
   */
  function score(scaleKey, answers) {
    var scale = S.get(scaleKey);
    if (!scale) { return null; }

    answers = answers || {};
    var items = [];
    var raw = 0;
    var maxRaw = 0;
    var critical = [];

    scale.items.forEach(function (it) {
      var rawValue = answers[it.i];
      var has = !(rawValue === null || rawValue === undefined || rawValue === '');
      var sc = has ? itemScore(scaleKey, it, rawValue) : 0;
      var itemMax = maxOptionOf(scaleKey, it.i);

      raw += sc;
      maxRaw += itemMax;

      var row = {
        i: it.i,
        text: it.text,
        reverse: !!it.reverse,
        value: has ? Number(rawValue) : null,
        label: labelOf(scaleKey, it.i, rawValue),
        score: sc,
        max: itemMax,
        note: it.note || ''
      };
      items.push(row);

      if (it.critical && has && Number(rawValue) > 0) {
        critical.push({ i: it.i, text: it.text, value: Number(rawValue), label: row.label });
      }
    });

    // 线性换算（WHO-5 的 ×4）；没有声明 transform 时恒等
    var tf = scale.transform;
    var total = tf ? Math.round(raw * tf.factor) : raw;
    var max = tf ? tf.max : maxRaw;

    // 维度分：用**原始分**统计（与 total 的量纲一致），同时给出维度内的百分比
    var dimensions = (scale.dimensions || []).map(function (d) {
      var score_ = 0, dimMax = 0;
      d.items.forEach(function (i) {
        var hit = items.filter(function (x) { return x.i === i; })[0];
        if (!hit) { return; }
        score_ += hit.score;
        dimMax += hit.max;
      });
      return {
        key: d.key,
        name: d.name,
        score: score_,
        max: dimMax,
        percent: dimMax ? Math.round(score_ / dimMax * 100) : 0,
        /* 维度级分级：借用该维度在总量表里的占比，只做语气提示，不做诊断解读 */
        level: dimMax
          ? (score_ / dimMax >= 0.66 ? 'high' : score_ / dimMax >= 0.33 ? 'medium' : 'low')
          : 'low'
      };
    });

    var level = levelOf(scale, total);

    return {
      scaleKey: scale.key,
      scaleName: scale.name,
      shortName: scale.shortName,
      icon: scale.icon,
      color: scale.color,
      topic: scale.topic,
      source: scale.source,
      higherIsBetter: scale.higherIsBetter !== false,

      raw: raw,
      maxRaw: maxRaw,
      transformed: !!tf,

      total: total,
      max: max,
      percent: max ? Math.round(total / max * 100) : 0,

      level: { key: level.key, name: level.name, tone: level.tone, summary: level.summary },

      dimensions: dimensions,
      items: items,
      critical: critical,

      answeredCount: items.filter(function (x) { return x.value !== null; }).length,
      totalCount: items.length,
      at: Date.now()
    };
  }

  /* ================================================================== *
   * 五、趋势比较
   * ================================================================== */
  /**
   * 比较两次同量表的结果。
   * 注意方向：`higherIsBetter` 决定"升高"是变好还是变坏，
   * 所以界面上不能简单地把"下降"画成绿色。
   * @returns {{delta, direction, better, text}|null}
   */
  function compare(prev, curr) {
    if (!prev || !curr || prev.scaleKey !== curr.scaleKey) { return null; }

    var scale = S.get(curr.scaleKey);
    var higherBetter = scale ? scale.higherIsBetter !== false : false;

    var delta = curr.total - prev.total;
    var direction = delta === 0 ? 'flat' : (delta > 0 ? 'up' : 'down');
    // 变化不足满分 5% 视为基本持平，避免把噪声当成变化
    var threshold = Math.max(1, Math.round(curr.max * 0.05));
    if (Math.abs(delta) < threshold) { direction = 'flat'; }

    var better;
    if (direction === 'flat') { better = null; }
    else { better = higherBetter ? (direction === 'up') : (direction === 'down'); }

    var name = scale ? scale.shortName : PHR.t('assessment.scoring.scoreWord', '得分');
    var text;
    if (direction === 'flat') {
      text = PHR.t('assessment.scoring.cmpFlat', '与上次基本持平（{from} → {to} 分）',
        { from: prev.total, to: curr.total });
    } else {
      text = PHR.t(
        better ? 'assessment.scoring.cmpBetter' : 'assessment.scoring.cmpWorse',
        name + '从 {from} 分变为 {to} 分（{delta} 分），' + (better ? '方向是向好的' : '方向需要留意'),
        { name: name, from: prev.total, to: curr.total, delta: (delta > 0 ? '+' : '') + delta }
      );
    }
    return { delta: delta, direction: direction, better: better, text: text,
             from: prev.total, to: curr.total, at: prev.at };
  }

  /**
   * 一组历史记录的趋势摘要。
   * @param {Array} results 同量表的历次结果（时间升序）
   */
  function trend(results) {
    if (!results || results.length < 2) {
      return { count: results ? results.length : 0, enough: false,
               text: PHR.t('assessment.scoring.trendNeed2', '至少完成两次同一量表，才能看出变化趋势。') };
    }
    var first = results[0];
    var last = results[results.length - 1];
    var cmp = compare(first, last);
    var values = results.map(function (r) { return r.total; });

    return {
      count: results.length,
      enough: true,
      values: values,
      first: first,
      last: last,
      delta: cmp ? cmp.delta : 0,
      direction: cmp ? cmp.direction : 'flat',
      better: cmp ? cmp.better : null,
      text: cmp ? cmp.text : '',
      best: U.min(values),
      worst: U.max(values),
      avg: Math.round(U.avg(values) * 10) / 10,
      points: results.map(function (r) { return { x: r.at, y: r.total }; })
    };
  }

  /* ================================================================== *
   * 六、快速筛查的后续推荐
   * ================================================================== */
  /**
   * 快速筛查做完后，按维度分推荐做哪份完整量表。
   * 规则写在量表数据里（quick 的 recommends 字段），本处只负责执行。
   */
  function recommend(scaleKey, result) {
    var scale = S.get(scaleKey);
    if (!scale || !scale.recommends || !result) { return []; }
    var dims = {};
    (result.dimensions || []).forEach(function (d) { dims[d.key] = d; });

    return scale.recommends.filter(function (r) {
      var d = dims[r.dimension];
      return d && d.score >= r.when;
    }).map(function (r) {
      var target = S.get(r.scale);
      return {
        scaleKey: r.scale,
        name: target ? target.name : r.scale,
        icon: target ? target.icon : '📋',
        desc: target ? target.desc : '',
        estMinutes: target ? target.estMinutes : 2,
        reason: PHR.t('assessment.scoring.recommend',
          '「{name}」{score} 分（≥ {when}），建议做一次完整量表',
          { name: dims[r.dimension] ? dims[r.dimension].name : '',
            score: dims[r.dimension].score,
            when: r.when })
      };
    });
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.assessment.scoring = {
    validate: validate,
    score: score,
    levelOf: levelOf,
    labelOf: labelOf,
    itemScore: itemScore,
    maxOptionOf: maxOptionOf,
    compare: compare,
    trend: trend,
    recommend: recommend
  };

})(window.PHR);
