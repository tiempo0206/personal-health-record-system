/**
 * ============================================================================
 * 文件：modules/insight/risk.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：健康风险评估。把「个人信息 + 病史 + 体征指标 + 用药情况」综合成一个
 *      0~100 的健康得分与分项风险，并给出"最容易改善的 3 件事"。
 *
 *      ⚠️ 这是基于公开流行病学常识的**简易规则模型**，不是临床评分工具
 *      （如 Framingham 风险方程、ASCVD  pooled cohort equations、
 *        China-PAR 等），没有经过人群验证，**不能用于诊断或指导治疗**。
 *      它的用途只有一个：帮助用户看懂"我现在的短板在哪、先改什么最划算"。
 *
 *      评分口径说明：score 是**健康得分**（越高越好），由 9 个维度各自扣分后
 *      相加得到；level 是由得分换算出的风险等级（低 → 高）。
 * 依赖：core/dict*.js、modules/records/{vital,profile,history,medication}.service.js、
 *      modules/insight/{metrics,trend.service}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var M = PHR.insight.metrics;

  /* 各维度满分（合计 114 分）。分值反映"这一项对整体健康的可干预程度"：
     血压、血糖、慢病给最高权重，因为它们既有明确危害又可被有效干预。 */
  var MAX = {
    bp: 18, glucose: 16, lipid: 12, body: 12, lifestyle: 12,
    family: 10, chronic: 16, adherence: 10, followUp: 8
  };

  /* 维度得分的等级名（只用于展示，因此直接在取值时查词条） */
  var LEVEL_NAME = { ok: '良好', info: '一般', warn: '需要关注', danger: '明显偏差' };
  var LEVEL_KEY = { ok: 'ok', info: 'info', warn: 'warn', danger: 'danger' };

  /* 综合风险等级：同样是展示值，但保留中文字面量供其它模块做 === 比较 */
  var RISK_LEVEL = { '低': 'low', '较低': 'fairlyLow', '中等': 'moderate', '较高': 'fairlyHigh', '高': 'high' };

  /* 证据列表 / 整句的标点：中文用「、」「；」「。」，英文另取 */
  function listSep() { return PHR.t('insight.punct.listSep', '、'); }
  function clauseSep() { return PHR.t('insight.punct.clauseSep', '；'); }

  function V() { return PHR.records.vital; }
  function H() { return PHR.records.history; }
  function MED() { return PHR.records.medication; }

  /* ================================================================== *
   * 一、构造一个风险维度
   * ================================================================== */
  /**
   * @param {object} o { name, category, weight, deduction, evidence, advice }
   * @returns {{name, category, weight, score, deduction, level, levelName, tone,
   *            evidence, advice}}
   */
  function factor(o) {
    var max = o.weight;
    var d = Math.max(0, Math.min(max, o.deduction));
    var score = Math.round((1 - d / max) * 100);
    var level = score >= 80 ? 'ok' : score >= 60 ? 'info' : score >= 40 ? 'warn' : 'danger';
    return {
      name: o.name,
      category: o.category,
      weight: max,
      score: score,
      deduction: Math.round(d),
      level: level,
      levelName: PHR.t('insight.risk.factorLevel.' + LEVEL_KEY[level], LEVEL_NAME[level]),
      tone: level,                      // 与徽章 tone 同名，视图可直接当 CSS 类用
      missing: !!o.missing,             // true = 该维度根本没有数据，结论只是"占位"
      evidence: o.evidence,
      advice: o.advice
    };
  }

  /* ================================================================== *
   * 二、九个维度的判断依据（evidence 一律引用真实数据）
   * ================================================================== */

  /** ① 血压：用近 30 天均值 + 达标率（记录不足 30 天时退回全部记录） */
  function bpFactor() {
    var all = V().summary('systolic', { days: 90 });
    if (!all.count) {
      return factor({
        name: PHR.t('insight.risk.bp.name', '血压'),
        category: PHR.t('insight.risk.bp.category', '心血管'),
        weight: MAX.bp, deduction: MAX.bp * 0.5, missing: true,
        evidence: PHR.t('insight.risk.bp.missing.evidence',
          '系统里还没有血压记录，这一项按"信息缺失"处理（扣半分）。'),
        advice: PHR.t('insight.risk.bp.missing.advice',
          '建议连续 7 天早晚各测一次血压并记录，这是评估心血管风险最基础的一步。')
      });
    }
    var s = V().summary('systolic', { days: 30 });
    var use = s.count >= 3 ? s : all;
    var use30 = (use === s);
    var over = use.series.filter(function (p) { return D.judge('systolic', p.y) !== 'ok'; }).length;
    var avg = use.avg;
    var d = 0;
    if (avg >= 140) { d += 12; } else if (avg >= 130) { d += 8; }
    else if (avg >= 120) { d += 4; } else if (avg < 100) { d += 8; }
    else if (avg < 110) { d += 3; }
    d += (100 - use.inRangeRate) / 100 * 6;

    var band = avg >= 140 ? PHR.t('insight.risk.bp.band.high140', '已达到高血压的干预阈值')
      : avg >= 130 ? PHR.t('insight.risk.bp.band.high130', '高于家庭自测的理想上限 130 mmHg')
      : avg >= 120 ? PHR.t('insight.risk.bp.band.high120', '处于"正常高值"区间')
      : avg < 100 ? PHR.t('insight.risk.bp.band.low', '偏低')
      : PHR.t('insight.risk.bp.band.ideal', '在理想区间');

    return factor({
      name: PHR.t('insight.risk.bp.name', '血压'),
      category: PHR.t('insight.risk.bp.category', '心血管'),
      weight: MAX.bp, deduction: d,
      evidence: PHR.t('insight.risk.bp.evidence',
        '{window}共 {n} 次收缩压读数，平均 {avg} mmHg，{band}；' +
        '其中 {over} 次超出正常范围（达标率 {rate}%）{extra}。',
        {
          window: use30
            ? PHR.t('insight.risk.bp.window30', '近 30 天')
            : PHR.t('insight.risk.bp.window90', '近 90 天'),
          n: use.count, avg: avg, band: band, over: over, rate: use.inRangeRate,
          extra: use30
            ? PHR.t('insight.risk.bp.extra', '；近 90 天共 {n90} 次记录，平均 {avg90} mmHg',
                { n90: all.count, avg90: all.avg })
            : ''
        }),
      advice: d >= 8
        ? PHR.t('insight.risk.bp.adviceHigh',
            '建议减少钠盐摄入（每日 <6 g）、控制体重，并在相同条件下连续监测 7 天后复诊。')
        : d > 0
        ? PHR.t('insight.risk.bp.adviceMid',
            '继续保持低盐饮食与规律作息，每周固定测量 2~3 次。')
        : PHR.t('insight.risk.bp.adviceGood',
            '血压控制良好，保持目前的用药与生活方式。')
    });
  }

  /** ② 血糖：空腹血糖均值 + 糖化血红蛋白（近 3 个月） */
  function glucoseFactor() {
    var g = V().summary('glucose', { days: 90 });
    var h = V().summary('hba1c', { days: 365 });
    if (!g.count && !h.count) {
      return factor({
        name: PHR.t('insight.risk.glucose.name', '血糖'),
        category: PHR.t('insight.risk.glucose.category', '内分泌'),
        weight: MAX.glucose, deduction: MAX.glucose * 0.5, missing: true,
        evidence: PHR.t('insight.risk.glucose.missing.evidence',
          '系统里没有空腹血糖与糖化血红蛋白记录，这一项按"信息缺失"处理。'),
        advice: PHR.t('insight.risk.glucose.missing.advice',
          '建议在体检时加做空腹血糖与糖化血红蛋白（HbA1c），后者反映近 2~3 个月的平均血糖。')
      });
    }

    var d = 0;
    var ev = [];
    if (g.count) {
      if (g.avg >= 7.0) { d += 10; } else if (g.avg >= 6.1) { d += 6; }
      else if (g.avg < 3.9) { d += 6; }
      ev.push(PHR.t('insight.risk.glucose.evGlucose',
        '近 90 天空腹血糖平均 {avg} mmol/L（{n} 次，达标率 {rate}%）',
        { avg: g.avg, n: g.count, rate: g.inRangeRate }));
    } else {
      ev.push(PHR.t('insight.risk.glucose.evNoGlucose', '没有空腹血糖记录'));
    }

    if (h.count) {
      if (h.latest.value >= 8.0) { d += 6; } else if (h.latest.value >= 6.5) { d += 3.5; }
      ev.push(PHR.t('insight.risk.glucose.evHba1c', '糖化血红蛋白最近一次 {value}%（{date}）',
        { value: h.latest.value, date: U.fmtDate(h.latest.at) }));
    } else {
      ev.push(PHR.t('insight.risk.glucose.evNoHba1c',
        '没有糖化血红蛋白记录（建议每 3 个月复查一次）'));
    }

    // 正在好转的趋势可以适度抵消扣分，避免"越测越焦虑"
    var t = PHR.insight.trend.analyze('glucose', 90);
    if (!t.empty && t.better && t.direction === '下降') {
      d -= 1.5;
      ev.push(PHR.t('insight.risk.glucose.evTrend', '趋势向好：近 90 天整体下降 {pct}%',
        { pct: Math.abs(t.changePercent) }));
    }

    return factor({
      name: PHR.t('insight.risk.glucose.name', '血糖'),
      category: PHR.t('insight.risk.glucose.category', '内分泌'),
      weight: MAX.glucose, deduction: d,
      evidence: ev.join(clauseSep()) + PHR.t('insight.punct.end', '。'),
      advice: d >= 8 ? PHR.t('insight.risk.glucose.adviceHigh',
          '建议尽快到内分泌科就诊，评估是否需要调整饮食结构或用药方案。')
        : d > 0 ? PHR.t('insight.risk.glucose.adviceMid',
          '建议控制精制碳水与含糖饮料，餐后散步 20 分钟，并按医生要求复查糖化血红蛋白。')
        : PHR.t('insight.risk.glucose.adviceGood', '血糖控制良好，继续保持。')
    });
  }

  /** ③ 血脂：以 LDL-C（"坏胆固醇"）为核心 */
  function lipidFactor() {
    var l = V().summary('ldl', { days: 365 });
    if (!l.count) {
      return factor({
        name: PHR.t('insight.risk.lipid.name', '血脂（LDL-C）'),
        category: PHR.t('insight.risk.bp.category', '心血管'),
        weight: MAX.lipid, deduction: MAX.lipid * 0.4, missing: true,
        evidence: PHR.t('insight.risk.lipid.missing.evidence',
          '系统里没有低密度脂蛋白记录，这一项按"信息缺失"处理。'),
        advice: PHR.t('insight.risk.lipid.missing.advice',
          '建议在体检时查一次血脂四项（总胆固醇、甘油三酯、LDL-C、HDL-C）。')
      });
    }
    var v = l.latest.value;
    var d = v >= 4.1 ? 10 : v >= 3.4 ? 6 : v >= 2.6 ? 2 : 0;
    var t = PHR.insight.trend.analyze('ldl', 365);
    if (!t.empty && t.better && t.direction === '下降') { d -= 1; }

    return factor({
      name: PHR.t('insight.risk.lipid.name', '血脂（LDL-C）'),
      category: PHR.t('insight.risk.bp.category', '心血管'),
      weight: MAX.lipid, deduction: d,
      evidence: PHR.t('insight.risk.lipid.evidence',
        '最近一次低密度脂蛋白 {value} mmol/L（{date}），共 {n} 次记录、范围 {min}~{max} mmol/L{trend}。' +
        '正常上限 3.4 mmol/L。',
        {
          value: v, date: U.fmtDate(l.latest.at), n: l.count, min: l.min, max: l.max,
          trend: t.empty ? '' : PHR.t('insight.risk.lipid.trendNote', '，近一年趋势{direction}',
            { direction: PHR.insight.trend.dirName(t.direction) })
        }),
      advice: d >= 6 ? PHR.t('insight.risk.lipid.adviceHigh',
          '建议减少动物内脏、油炸食品与反式脂肪摄入，增加膳食纤维与有氧运动；' +
          '若已有心血管病史，请与医生讨论是否需要他汀类药物。')
        : d > 0 ? PHR.t('insight.risk.lipid.adviceMid',
          '已接近上限，注意控制饱和脂肪摄入并保持运动。')
        : PHR.t('insight.risk.lipid.adviceGood', '血脂控制良好，继续保持。')
    });
  }

  /** ④ 体型：BMI + 腰围（中心性肥胖的危害独立于 BMI） */
  function bodyFactor() {
    var b = V().summary('bmi', { days: 365 });
    var w = V().summary('waist', { days: 365 });
    var ps = PHR.records.profile.summary();
    var bmi = b.count ? b.latest.value : (ps ? ps.bmi : null);

    if (bmi === null && !w.count) {
      return factor({
        name: PHR.t('insight.risk.body.name', '体型（BMI / 腰围）'),
        category: PHR.t('insight.risk.body.category', '代谢'),
        weight: MAX.body, deduction: MAX.body * 0.4, missing: true,
        evidence: PHR.t('insight.risk.body.missing.evidence',
          '既没有 BMI 也没有腰围记录{ps}，无法评估。',
          { ps: ps ? '' : PHR.t('insight.risk.body.missing.psNote', '，个人基本信息也未填写') }),
        advice: PHR.t('insight.risk.body.missing.advice',
          '建议在「个人基本信息」中填写身高体重，并测量一次腰围。')
      });
    }

    var d = 0;
    var ev = [];
    if (bmi !== null) {
      if (bmi >= 28) { d += 9; } else if (bmi >= 24) { d += 6; }
      else if (bmi < 18.5) { d += 6; }
      ev.push(PHR.t('insight.risk.body.evBmi', 'BMI {bmi} kg/m²（中国成人正常 18.5~23.9）',
        { bmi: bmi }));
    }
    if (w.count) {
      if (w.latest.value >= 90) { d += 4; } else if (w.latest.value >= 85) { d += 2.5; }
      ev.push(PHR.t('insight.risk.body.evWaist',
        '腰围最近一次 {value} cm（男性 ≥90 / 女性 ≥85 提示中心性肥胖）',
        { value: w.latest.value }));
    }
    if (ps && ps.age !== null && ps.age >= 45 && bmi !== null && bmi >= 24) {
      d += 1;
      ev.push(PHR.t('insight.risk.body.evAgeOverweight',
        '年龄 {age} 岁并合并超重，代谢风险进一步升高', { age: ps.age }));
    }

    return factor({
      name: PHR.t('insight.risk.body.name', '体型（BMI / 腰围）'),
      category: PHR.t('insight.risk.body.category', '代谢'),
      weight: MAX.body, deduction: d,
      evidence: ev.join(clauseSep()) + PHR.t('insight.punct.end', '。'),
      advice: d >= 6 ? PHR.t('insight.risk.body.adviceHigh',
          '建议以"减重 5%~10%"为首要目标（约每月 1~2 kg 的平稳速度），' +
          '配合每周 150 分钟中等强度有氧运动与抗阻训练。')
        : d > 0 ? PHR.t('insight.risk.body.adviceMid',
          '体重已接近上限，注意控制总热量并保持每周 3 次以上运动。')
        : PHR.t('insight.risk.body.adviceGood', '体重与腰围都在健康区间，继续保持。')
    });
  }

  /** ⑤ 生活方式：吸烟 / 饮酒 / 运动（来自个人基本信息） */
  function lifestyleFactor() {
    var ps = PHR.records.profile.summary();
    if (!ps) {
      return factor({
        name: PHR.t('insight.risk.lifestyle.name', '生活方式'),
        category: PHR.t('insight.risk.lifestyle.category', '行为'),
        weight: MAX.lifestyle, deduction: MAX.lifestyle * 0.4, missing: true,
        evidence: PHR.t('insight.risk.lifestyle.missing.evidence',
          '还没有填写个人基本信息，无法评估吸烟、饮酒与运动情况。'),
        advice: PHR.t('insight.risk.lifestyle.missing.advice',
          '建议先完善「个人基本信息」中的生活习惯部分，系统才能给出针对性的建议。')
      });
    }
    var p = ps.profile;
    var d = 0;
    var ev = [];

    if (p.smoking === 'current') {
      d += 6;
      ev.push(PHR.t('insight.risk.lifestyle.evSmokingCurrent',
        '目前吸烟（心血管与呼吸系统风险显著升高）'));
    } else if (p.smoking === 'former') {
      d += 2;
      ev.push(PHR.t('insight.risk.lifestyle.evSmokingFormer',
        '已戒烟（风险会逐年下降，继续保持）'));
    } else {
      ev.push(PHR.t('insight.risk.lifestyle.evSmokingNo', '不吸烟'));
    }

    if (p.drinking === 'often') {
      d += 3;
      ev.push(PHR.t('insight.risk.lifestyle.evDrinkingOften', '经常饮酒'));
    } else if (p.drinking === 'sometimes') {
      d += 1;
      ev.push(PHR.t('insight.risk.lifestyle.evDrinkingSometimes', '偶尔饮酒'));
    } else {
      ev.push(PHR.t('insight.risk.lifestyle.evDrinkingNo', '不饮酒'));
    }

    if (p.exercise === 'never') {
      d += 4;
      ev.push(PHR.t('insight.risk.lifestyle.evExerciseNever', '基本不运动'));
    } else if (p.exercise === 'sometimes') {
      d += 1.5;
      ev.push(PHR.t('insight.risk.lifestyle.evExerciseSometimes', '运动偏少'));
    } else {
      ev.push(PHR.t('insight.risk.lifestyle.evExerciseRegular', '规律运动'));
    }

    if (ps.age !== null && ps.age >= 60) {
      d += 1;
      ev.push(PHR.t('insight.risk.lifestyle.evAge', '年龄 {age} 岁', { age: ps.age }));
    }

    // 步数是最客观的活动量证据，和自评的"运动情况"互相印证
    var st = V().summary('steps', { days: 7 });
    if (st.count) {
      if (st.avg < 4000) { d += 2; } else if (st.avg < 6000) { d += 1; }
      ev.push(PHR.t('insight.risk.lifestyle.evSteps', '最近 {n} 天平均每天 {steps} 步',
        { n: st.count, steps: Math.round(st.avg) }));
    }

    return factor({
      name: PHR.t('insight.risk.lifestyle.name', '生活方式'),
      category: PHR.t('insight.risk.lifestyle.category', '行为'),
      weight: MAX.lifestyle, deduction: d,
      evidence: ev.join(clauseSep()) + PHR.t('insight.punct.end', '。'),
      advice: d >= 6 ? PHR.t('insight.risk.lifestyle.adviceHigh',
          '优先处理最影响风险的一项：吸烟者尽早戒烟（可到戒烟门诊寻求帮助），' +
          '同时把每周运动量提升到 150 分钟中等强度。')
        : d > 0 ? PHR.t('insight.risk.lifestyle.adviceMid',
          '还有可提升空间：把每日步数目标定在 8000 步，并保持规律作息。')
        : PHR.t('insight.risk.lifestyle.adviceGood',
          '生活方式很健康，这是所有干预手段里性价比最高的一项，请继续保持。')
    });
  }

  /** ⑥ 家族遗传：直接复用病史模块的遗传风险判定（一级亲属 / 早发 / 多人同病） */
  function familyFactor() {
    var risks = H().geneticRisks();
    if (!risks.length) {
      return factor({
        name: PHR.t('insight.risk.family.name', '家族史'),
        category: PHR.t('insight.risk.family.category', '遗传'),
        weight: MAX.family, deduction: 0,
        evidence: PHR.t('insight.risk.family.noRisk.evidence',
          '家族病史中没有记录到明确的遗传风险。若亲属中有早发（<55 岁）的心血管病、糖尿病或肿瘤，' +
          '建议补充录入，这会直接影响筛查建议。'),
        advice: PHR.t('insight.risk.family.noRisk.advice',
          '每年一次常规体检；40 岁以后建议加上血脂、血糖与心电图。')
      });
    }
    var w = { high: 5, medium: 2.5, info: 0.8 };
    var d = U.sum(risks, function (r) { return w[r.level] || 1; });
    var early = risks.filter(function (r) { return r.reason.indexOf('55 岁前') >= 0; });
    if (early.length) { d += 2; }

    return factor({
      name: PHR.t('insight.risk.family.name', '家族史'),
      category: PHR.t('insight.risk.family.category', '遗传'),
      weight: MAX.family, deduction: d,
      evidence: risks.slice(0, 3).map(function (r) {
        return PHR.t('insight.risk.family.evidenceItem', '{name}（{reason}）',
          { name: r.name, reason: r.reason });
      }).join(clauseSep()) +
        (risks.length > 3
          ? PHR.t('insight.risk.family.evidenceMore', ' 等共 {n} 类', { n: risks.length })
          : '') +
        (early.length
          ? PHR.t('insight.risk.family.evidenceEarly',
              '。其中存在 55 岁前发病的亲属，属于早发家族史，筛查建议需要提前。')
          : PHR.t('insight.punct.end', '。')),
      advice: risks.slice(0, 2).map(function (r) { return r.advice; }).join(clauseSep()) +
        PHR.t('insight.risk.family.adviceTail',
          '。建议把家族史主动告知医生，作为筛查起始年龄的参考。')
    });
  }

  /** ⑦ 已确诊慢病：按疾病系统给权重，未控制（active）的额外加权 */
  function chronicFactor() {
    var list = H().chronicConditions();
    if (!list.length) {
      return factor({
        name: PHR.t('insight.risk.chronic.name', '已确诊慢病'),
        category: PHR.t('insight.risk.chronic.category', '病史'),
        weight: MAX.chronic, deduction: 0,
        evidence: PHR.t('insight.risk.chronic.none.evidence',
          '没有需要长期管理的慢性病记录。'),
        advice: PHR.t('insight.risk.chronic.none.advice',
          '保持每年一次常规体检，出现持续不适及时就诊并记录。')
      });
    }
    var W = { cardio: 5, endocrine: 4.5, respiratory: 3, urinary: 3, immune: 2.5, mental: 2 };
    var d = 0;
    list.forEach(function (r) {
      d += (W[r.diseaseCat] || 2);
      if (r.data.status === 'active') { d += 0.8; }
    });

    var byCat = {};
    list.forEach(function (r) { byCat[r.diseaseCat] = (byCat[r.diseaseCat] || 0) + 1; });
    var text = Object.keys(byCat).map(function (k) {
      return PHR.t('insight.risk.chronic.catCount', '{name} {n}',
        { name: D.nameOf(D.diseaseCategory, k), n: byCat[k] });
    }).join(listSep());

    return factor({
      name: PHR.t('insight.risk.chronic.name', '已确诊慢病'),
      category: PHR.t('insight.risk.chronic.category', '病史'),
      weight: MAX.chronic, deduction: d,
      evidence: PHR.t('insight.risk.chronic.evidence',
        '共 {n} 项需要长期管理的疾病（{cats}）：{names}{more}。其中 {active} 项处于活动期。',
        {
          n: list.length, cats: text,
          names: list.slice(0, 4).map(function (r) { return r.data.diseaseName; }).join(listSep()),
          more: list.length > 4 ? PHR.t('insight.risk.chronic.evidenceMore', ' 等') : '',
          active: list.filter(function (r) { return r.data.status === 'active'; }).length
        }),
      advice: PHR.t('insight.risk.chronic.advice',
        '慢病的核心是"长期稳定控制"而不是"治好"。请按医生制定的复查周期规律随访，' +
        '并把每次的检查结果录入档案，趋势不中断才能看出方案是否有效。')
    });
  }

  /** ⑧ 用药依从性：经常漏服比例 + 相互作用风险 */
  function adherenceFactor() {
    var a = MED().adherenceStats();
    var inter = MED().interactions();
    var danger = inter.filter(function (x) { return x.level === 'danger'; });

    if (!a.total) {
      return factor({
        name: PHR.t('insight.risk.adherence.name', '用药依从性'),
        category: PHR.t('insight.risk.adherence.category', '用药'),
        weight: MAX.adherence, deduction: 0,
        evidence: PHR.t('insight.risk.adherence.none.evidence', '目前没有用药记录。'),
        advice: PHR.t('insight.risk.adherence.none.advice',
          '如需长期服药，建议把药品名、剂量、起止时间完整录入，系统才能帮您检查相互作用与补药时间。')
      });
    }
    var poorRate = Math.round(a.poor / a.total * 100);
    var fairRate = Math.round(a.fair / a.total * 100);
    var d = poorRate >= 30 ? 8 : poorRate >= 10 ? 4 : fairRate >= 30 ? 2 : 0;
    if (danger.length) { d += 4; }

    return factor({
      name: PHR.t('insight.risk.adherence.name', '用药依从性'),
      category: PHR.t('insight.risk.adherence.category', '用药'),
      weight: MAX.adherence, deduction: d,
      evidence: PHR.t('insight.risk.adherence.evidence',
        '共 {n} 条用药记录：按时按量 {good} 条、偶尔漏服 {fair} 条、经常漏服 {poor} 条' +
        '（规律服药率 {rate}%）。{inter}',
        {
          n: a.total, good: a.good, fair: a.fair, poor: a.poor, rate: a.goodRate,
          inter: danger.length
            ? PHR.t('insight.risk.adherence.interNote',
                '另外检测到 {k} 组需要高度警惕的药物相互作用。', { k: danger.length })
            : ''
        }),
      advice: d >= 6 ? PHR.t('insight.risk.adherence.adviceHigh',
          '漏服是慢病控制失败最常见的原因。建议使用分装药盒 + 手机闹钟，' +
          '并把服药时间和固定动作绑定（如刷牙后）。')
        : danger.length ? PHR.t('insight.risk.adherence.adviceInter',
          '请把正在服用的全部药物清单（含保健品）交给医生或药师核对一次相互作用。')
        : PHR.t('insight.risk.adherence.adviceGood', '服药依从性良好，继续保持。')
    });
  }

  /** ⑨ 随访依从性：逾期未复查的条数 */
  function followUpFactor() {
    var due = H().followUpDue();
    if (!due.length) {
      return factor({
        name: PHR.t('insight.risk.followUp.name', '随访依从性'),
        category: PHR.t('insight.risk.followUp.category', '就医'),
        weight: MAX.followUp, deduction: 0,
        evidence: PHR.t('insight.risk.followUp.none.evidence',
          '目前没有需要定期复查的慢病随访计划。'),
        advice: PHR.t('insight.risk.followUp.none.advice',
          '一旦确诊需要长期管理的疾病，系统会自动按疾病分类生成复查提醒。')
      });
    }
    var overdue = due.filter(function (f) { return f.overdue; });
    var soon = due.filter(function (f) { return !f.overdue && f.daysLeft <= 14; });
    var d = overdue.length >= 2 ? 8 : overdue.length === 1 ? 5 : (soon.length ? 2 : 0);

    return factor({
      name: PHR.t('insight.risk.followUp.name', '随访依从性'),
      category: PHR.t('insight.risk.followUp.category', '就医'),
      weight: MAX.followUp, deduction: d,
      evidence: PHR.t('insight.risk.followUp.evidence',
        '共 {n} 项随访计划，其中 {overdue}{soon}。',
        {
          n: due.length,
          overdue: overdue.length
            ? overdue.map(function (f) {
                return PHR.t('insight.risk.followUp.overdueItem', '{name} 已逾期 {days} 天',
                  { name: f.diseaseName, days: Math.abs(f.daysLeft) });
              }).join(listSep())
            : PHR.t('insight.risk.followUp.overdueNone', '全部在有效期内'),
          soon: soon.length
            ? PHR.t('insight.risk.followUp.soonNote', '；另有 {k} 项将在 14 天内到期',
                { k: soon.length })
            : ''
        }),
      advice: overdue.length ? PHR.t('insight.risk.followUp.adviceOverdue',
          '逾期未复查会让医生无法判断当前方案是否仍然有效。' +
          '建议本周内预约，并把上次复查后的记录整理好一起带去。')
        : PHR.t('insight.risk.followUp.adviceOk',
          '请按计划时间复诊，保持检查结果连续。')
    });
  }

  /* ================================================================== *
   * 三、综合评分
   * ================================================================== */
  /**
   * @returns {{score, level, tone, factors, evidenceCount, summaryText, disclaimer}}
   */
  function assess() {
    var factors = [
      bpFactor(), glucoseFactor(), lipidFactor(), bodyFactor(), lifestyleFactor(),
      familyFactor(), chronicFactor(), adherenceFactor(), followUpFactor()
    ];
    var deduction = U.sum(factors, function (f) { return f.deduction; });
    var score = Math.max(0, Math.min(100, Math.round(100 - deduction)));

    var level = score >= 85 ? '低' : score >= 70 ? '较低' : score >= 55 ? '中等'
      : score >= 40 ? '较高' : '高';
    var tone = score >= 70 ? 'ok' : score >= 55 ? 'info' : score >= 40 ? 'warn' : 'danger';

    var weakest = factors.slice().sort(function (a, b) { return a.score - b.score; });
    var concern = weakest.filter(function (f) { return !f.missing && f.score < 80; }).slice(0, 2);
    var missing = factors.filter(function (f) { return f.missing; });

    return {
      score: score,
      level: level,
      levelName: PHR.t('insight.risk.level.' + (RISK_LEVEL[level] || 'moderate'), level),
      tone: tone,
      factors: factors,
      deduction: Math.round(deduction),
      evidenceCount: U.sum(factors, function (f) { return f.evidence ? 1 : 0; }),
      missingCount: missing.length,
      /** 数据完整度：有几成维度是真的算出来的，而不是"缺数据"的占位 */
      dataCoverage: Math.round((factors.length - missing.length) / factors.length * 100),
      summaryText: PHR.t('insight.risk.summary',
        '综合 {n} 个维度的评估，您的健康得分是 {score} 分，属于「{level}」风险等级。' +
        '{concern}{missing}想提高得分，可以先从下面「最容易改善的 3 件事」入手。',
        {
          n: factors.length, score: score,
          level: PHR.t('insight.risk.level.' + (RISK_LEVEL[level] || 'moderate'), level),
          concern: concern.length
            ? PHR.t('insight.risk.summary.concern', '当前最需要关注的是：{list}。',
                { list: concern.map(function (f) {
                    return PHR.t('insight.risk.summary.concernItem', '{name}（{level}）',
                      { name: f.name, level: f.levelName });
                  }).join(listSep()) })
            : (!missing.length
                ? PHR.t('insight.risk.summary.allGood', '各维度都在良好水平，请继续保持。')
                : ''),
          missing: missing.length
            ? PHR.t('insight.risk.summary.missing',
                '另有 {n} 个维度（{list}）因为缺少数据无法真正评估，当前按"信息缺失"计入 —— ' +
                '补齐这些记录后，结论会明显更准确。',
                { n: missing.length,
                  list: missing.map(function (f) { return f.name; }).join(listSep()) })
            : ''
        }),
      updatedAt: Date.now(),
      disclaimer: M.DISCLAIMER
    };
  }

  /** 分维度得分，供雷达图 / 条形图展示 */
  function byCategory() {
    return assess().factors.map(function (f) {
      return { label: f.name, value: f.score, level: f.level, levelName: f.levelName,
        tone: f.tone, weight: f.weight };
    });
  }

  /* ================================================================== *
   * 四、最容易改善的 3 件事
   * ================================================================== */
  /**
   * 排序依据 = 收益（impact）/ 难度（effort）。
   * 收益来自该维度当前的扣分幅度，难度是"要不要改变长期习惯"的粗略估计：
   *   effort 1 = 今天就能做（多喝水、按时吃药、去测量）
   *   effort 2 = 一两周形成习惯（减盐、增加步数）
   *   effort 3 = 需要长期坚持或寻求专业帮助（减重、戒烟）
   */
  function improvements() {
    var cand = [];
    var bp = V().summary('systolic', { days: 30 });
    var glu = V().summary('glucose', { days: 90 });
    var ldl = V().summary('ldl', { days: 365 });
    var bmiS = V().summary('bmi', { days: 365 });
    var st = V().summary('steps', { days: 7 });
    var sl = V().summary('sleepHours', { days: 7 });
    var uw = V().summary('waist', { days: 365 });
    var ps = PHR.records.profile.summary();
    var a = MED().adherenceStats();
    var due = H().followUpDue().filter(function (f) { return f.overdue; });
    var missing = V().missing(30);

    function add(o) { cand.push(o); }

    if (bp.count && bp.avg >= 130) {
      add({
        title: PHR.t('insight.risk.improve.salt.title', '把每日食盐降到 6 克以下'),
        metricKey: 'systolic', tone: 'warn',
        impact: 9, effort: 2,
        detail: PHR.t('insight.risk.improve.salt.detail',
          '少放半勺盐、少吃腌制与加工食品，通常 4~8 周就能看到变化。'),
        expected: PHR.t('insight.risk.improve.salt.expected',
          '预计收缩压可下降 3~5 mmHg（当前近 30 天平均 {avg} mmHg）。', { avg: bp.avg })
      });
    }
    if (bp.count && bp.count < 10) {
      add({
        title: PHR.t('insight.risk.improve.bpMonitor.title',
          '补足家庭血压监测：连续 7 天，早晚各一次'),
        metricKey: 'systolic', tone: 'info',
        impact: 6, effort: 1,
        detail: PHR.t('insight.risk.improve.bpMonitor.detail',
          '家庭自测的血压比诊室血压更能预测心血管风险，也是医生调整用药的依据。'),
        expected: PHR.t('insight.risk.improve.bpMonitor.expected',
          '7 天后即可得到可信的平均血压与晨峰信息（当前仅 {n} 次记录）。', { n: bp.count })
      });
    }
    if (bmiS.count && bmiS.latest.value >= 24) {
      // 体重优先取个人基本信息里的值；缺失时按 1.65 m 的身高从 BMI 反推一个近似值
      var wKg = (ps && ps.profile && ps.profile.weight) ? Number(ps.profile.weight)
        : Number((bmiS.latest.value * 1.65 * 1.65).toFixed(1));
      add({
        title: PHR.t('insight.risk.improve.weight.title', '减重 {min}~{max} kg（当前体重的 5%~10%）', {
          min: Math.max(1, Math.round(wKg * 0.05)),
          max: Math.max(2, Math.round(wKg * 0.1))
        }),
        metricKey: 'bmi', tone: 'warn',
        impact: 8, effort: 3,
        detail: PHR.t('insight.risk.improve.weight.detail',
          '不需要减到"标准体重"，减掉 5%~10% 就能显著改善血压、血糖与血脂。'),
        expected: PHR.t('insight.risk.improve.weight.expected',
          '预计收缩压下降 3~4 mmHg，空腹血糖下降 0.3~0.5 mmol/L。')
      });
    }
    if (st.count && st.avg < 6000) {
      var target = st.avg < 4000 ? 6000 : 8000;
      add({
        title: PHR.t('insight.risk.improve.steps.title', '把每日步数从 {from} 提升到 {to} 步', {
          from: Math.round(st.avg), to: target
        }),
        metricKey: 'steps', tone: 'info',
        impact: 7, effort: 1,
        detail: PHR.t('insight.risk.improve.steps.detail',
          '拆成三段各 10~15 分钟的快走更容易坚持，通勤提前一站下车也算。'),
        expected: PHR.t('insight.risk.improve.steps.expected',
          '预计 3 个月可让收缩压下降 3~5 mmHg，并改善空腹血糖与睡眠质量。')
      });
    }
    if (sl.count && sl.avg < 7) {
      add({
        title: PHR.t('insight.risk.improve.sleep.title', '把睡眠时长补到 7 小时以上'),
        metricKey: 'sleepHours', tone: 'warn',
        impact: 6, effort: 1,
        detail: PHR.t('insight.risk.improve.sleep.detail',
          '固定起床时间（比固定入睡时间更有效），睡前一小时远离屏幕与咖啡因。'),
        expected: PHR.t('insight.risk.improve.sleep.expected',
          '长期睡眠不足会推高血压与血糖，改善后晨起血压通常可下降 2~4 mmHg' +
          '（当前 7 天平均 {avg} 小时）。', { avg: sl.avg })
      });
    }
    if (ps && ps.profile.smoking === 'current') {
      add({
        title: PHR.t('insight.risk.improve.quitSmoking.title', '制定一个戒烟计划'),
        metricKey: null, tone: 'danger',
        impact: 10, effort: 3,
        detail: PHR.t('insight.risk.improve.quitSmoking.detail',
          '戒烟是所有干预里收益最大的一项：一年后冠心病风险可降低约一半。可到戒烟门诊寻求药物与行为支持。'),
        expected: PHR.t('insight.risk.improve.quitSmoking.expected',
          '预计 1 年后心血管风险显著下降，血压与心率也会同步改善。')
      });
    }
    if (a.total && (a.poor > 0 || Math.round(a.fair / a.total * 100) >= 30)) {
      add({
        title: PHR.t('insight.risk.improve.adherence.title', '把漏服率降到 10% 以下'),
        metricKey: null, tone: 'warn',
        impact: 8, effort: 1,
        detail: PHR.t('insight.risk.improve.adherence.detail',
          '用分装药盒 + 手机闹钟，把服药和固定动作绑定；出门前在包里放一份备用剂量。'),
        expected: PHR.t('insight.risk.improve.adherence.expected',
          '规律服药是慢病控制的前提，当前规律服药率为 {rate}%。', { rate: a.goodRate })
      });
    }
    if (due.length) {
      add({
        title: PHR.t('insight.risk.improve.followUp.title',
          '预约复诊：{disease} 已逾期 {days} 天',
          { disease: due[0].diseaseName, days: Math.abs(due[0].daysLeft) }),
        metricKey: null, tone: 'warn',
        impact: 7, effort: 1,
        detail: PHR.t('insight.risk.improve.followUp.detail',
          '带上上一次的检查结果与最近的体征记录，医生才能判断当前方案是否有效。'),
        expected: PHR.t('insight.risk.improve.followUp.expected',
          '及时复查能避免"方案早已失效却还在照旧服用"的情况。')
      });
    }
    if (glu.count && glu.avg >= 6.1) {
      add({
        title: PHR.t('insight.risk.improve.carbSwap.title', '调整主食结构：一半换成全谷杂豆'),
        metricKey: 'glucose', tone: 'warn',
        impact: 8, effort: 2,
        detail: PHR.t('insight.risk.improve.carbSwap.detail',
          '把白米饭、白面条的一半换成糙米、燕麦、杂豆，并按"先菜后饭"的顺序进食。'),
        expected: PHR.t('insight.risk.improve.carbSwap.expected',
          '预计 3 个月可使空腹血糖下降 0.3~0.6 mmol/L（当前平均 {avg} mmol/L）。',
          { avg: glu.avg })
      });
    }
    if (ldl.count && ldl.latest.value >= 3.4) {
      add({
        title: PHR.t('insight.risk.improve.satFat.title', '减少饱和脂肪摄入'),
        metricKey: 'ldl', tone: 'warn',
        impact: 7, effort: 2,
        detail: PHR.t('insight.risk.improve.satFat.detail',
          '少吃动物内脏、肥肉、油炸食品与奶油点心，改用植物油并增加深海鱼与坚果。'),
        expected: PHR.t('insight.risk.improve.satFat.expected',
          '预计 3~6 个月 LDL-C 可下降 0.3~0.5 mmol/L（当前 {value} mmol/L）。',
          { value: ldl.latest.value })
      });
    }
    if (uw.count && uw.latest.value >= 85) {
      add({
        title: PHR.t('insight.risk.improve.waist.title', '每周量一次腰围'),
        metricKey: 'waist', tone: 'info',
        impact: 4, effort: 1,
        detail: PHR.t('insight.risk.improve.waist.detail',
          '腰围是内脏脂肪最直观的指标，比体重更能反映代谢风险。'),
        expected: PHR.t('insight.risk.improve.waist.expected',
          '配合有氧运动，腰围每月可减少 0.5~1 cm（当前 {value} cm）。',
          { value: uw.latest.value })
      });
    }
    if (missing.length) {
      add({
        title: PHR.t('insight.risk.improve.retest.title', '补测：{list}',
          { list: missing.slice(0, 3).map(function (x) { return x.name; }).join(listSep()) }),
        metricKey: null, tone: 'info',
        impact: 4, effort: 1,
        detail: PHR.t('insight.risk.improve.retest.detail',
          '数据断档时，趋势分析与风险评分都会失真。'),
        expected: PHR.t('insight.risk.improve.retest.expected',
          '补齐后风险评分与趋势结论会更贴近真实情况。')
      });
    }

    if (!cand.length) {
      cand.push({
        title: PHR.t('insight.risk.improve.keepGoing.title', '保持现在的记录频率'),
        metricKey: null, tone: 'ok',
        impact: 3, effort: 1,
        detail: PHR.t('insight.risk.improve.keepGoing.detail',
          '各项指标都比较理想，继续按固定频率记录即可 —— 只有连续的数据才能及时发现变化。'),
        expected: PHR.t('insight.risk.improve.keepGoing.expected',
          '建议血压每周 2~3 次，体重每周 1 次，血脂血糖每 3 个月 1 次。')
      });
    }

    cand.sort(function (x, y) {
      var rx = x.impact / x.effort, ry = y.impact / y.effort;
      return (ry - rx) || (y.impact - x.impact);
    });
    return cand.slice(0, 3).map(function (c) {
      c.priority = c.impact >= 8
        ? PHR.t('insight.priority.high', '高')
        : c.impact >= 6 ? PHR.t('insight.priority.medium', '中')
        : PHR.t('insight.priority.low', '低');
      return c;
    });
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.insight.risk = {
    assess: assess,
    byCategory: byCategory,
    improvements: improvements
  };

  /* model 口径与免责声明都用 getter 暴露：
     加载本文件时语言还没定（detect 在 boot 阶段才跑），直接取值会永远停在中文。 */
  Object.defineProperty(PHR.insight.risk, 'model', {
    enumerable: true,
    get: function () {
      return {
        name: PHR.t('insight.risk.model.name', 'PHR 简易规则风险模型'),
        dimensions: Object.keys(MAX).length,
        maxDeduction: U.sum(Object.keys(MAX), function (k) { return MAX[k]; }),
        weights: U.clone(MAX),
        note: PHR.t('insight.risk.model.note',
          '本模型基于公开流行病学常识构建，未经过人群验证，' +
          '不是 Framingham / ASCVD / China-PAR 等临床评分工具，不能用于诊断或指导治疗。')
      };
    }
  });
  Object.defineProperty(PHR.insight.risk, 'disclaimer', {
    enumerable: true,
    get: function () { return M.DISCLAIMER; }
  });

})(window.PHR);
