/**
 * ============================================================================
 * 文件：modules/records/medication.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：把"处方 / 用药记录 / 过敏史"三类数据聚合起来，回答三个临床最常问的问题：
 *      ① 现在在吃什么药？（current）
 *      ② 有没有药物过敏、这次的药能不能吃？（checkDrug / allergenIndex）
 *      ③ 这些药一起吃有没有风险？该补药了吗？（interactions / refillReminders）
 * 依赖：core/dict.js、modules/records/record.service.js
 * ============================================================================
 *
 * ⚠️ 免责声明：本模块内置的药物相互作用与补药提醒规则是**教学用的极小样本**，
 *    既不完整也不构成任何医疗建议。真实产品必须接入权威药学数据库（如国家药监局
 *    药品说明书数据库、临床用药辅助决策系统），并由药师审核规则。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* ================================================================== *
   * 一、用药清单
   * ================================================================== */
  function all() { return PHR.records.service.byType('medication'); }

  /**
   * 正在服用的药物：
   *   · 标记为长期用药，或
   *   · 没有结束日期，或结束日期还没到
   */
  function current() {
    var today = Date.now();
    return all().filter(function (r) {
      if (r.data.longTerm) { return true; }
      if (!r.data.endDate) { return true; }
      return U.parseDate(r.data.endDate) >= today;
    }).sort(function (a, b) {
      // 长期用药排在前面
      return (b.data.longTerm ? 1 : 0) - (a.data.longTerm ? 1 : 0);
    });
  }

  /** 已停用的药物 */
  function past() {
    var curIds = {};
    current().forEach(function (r) { curIds[r.id] = true; });
    return all().filter(function (r) { return !curIds[r.id]; });
  }

  /** 处方记录 */
  function prescriptions() { return PHR.records.service.byType('prescription'); }

  /** 按药品名归并，得到"这个药我一共吃过几次、最近一次是什么时候" */
  function byDrug() {
    var map = {};
    all().concat(prescriptions()).forEach(function (r) {
      var name = String(r.data.drugName || '').trim();
      if (!name) { return; }
      if (!map[name]) {
        map[name] = { name: name, count: 0, firstAt: r.date, lastAt: r.date, records: [], longTerm: false };
      }
      var m = map[name];
      m.count++;
      m.firstAt = Math.min(m.firstAt, r.date);
      m.lastAt = Math.max(m.lastAt, r.date);
      m.longTerm = m.longTerm || !!r.data.longTerm;
      m.records.push(r);
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.lastAt - a.lastAt; });
  }

  /* ================================================================== *
   * 二、过敏史
   * ================================================================== */
  function allergies() { return PHR.records.service.byType('allergy'); }

  /** 严重程度从高到低排序的过敏清单 */
  function allergiesBySeverity() {
    return U.sortBy(allergies(), function (r) {
      var s = (D.severity || []).filter(function (x) { return x.key === r.data.severity; })[0];
      return s ? -s.weight : 0;
    });
  }

  /** 过敏原索引：过敏原名 → 记录（用于开药前的冲突检查） */
  function allergenIndex() {
    var map = {};
    allergies().forEach(function (r) {
      var key = String(r.data.allergen || '').trim();
      if (key) { map[key] = r; }
    });
    return map;
  }

  /**
   * 检查某个药品名是否命中已知过敏原。
   * 这是"原始需求 → 可用功能"的一个典型转化：
   * 单纯存一条"青霉素过敏"没有意义，能在开药时跳出来拦住才有意义。
   *
   * @param {string} drugName
   * @returns {{hit:boolean, allergen:string, severity:string, record:object, message:string}}
   */
  function checkDrug(drugName) {
    var name = String(drugName || '').trim();
    if (!name) { return { hit: false }; }

    var idx = allergenIndex();
    var hitKey = null;

    // 药物类过敏：做包含匹配（"注射用青霉素钠" 应命中 "青霉素"）
    Object.keys(idx).forEach(function (k) {
      var rec = idx[k];
      if (rec.data.allergenType !== 'drug') { return; }
      if (hitKey) { return; }
      if (name.indexOf(k) >= 0 || k.indexOf(name) >= 0) { hitKey = k; }
    });

    if (!hitKey) { return { hit: false }; }

    var rec = idx[hitKey];
    var sevName = D.nameOf(D.severity, rec.data.severity);
    return {
      hit: true,
      allergen: hitKey,
      severity: rec.data.severity,
      severityName: sevName,
      record: rec,
      message: U.t('med.checkDrug.hit',
        '⚠️ 「{name}」可能与您的过敏原「{allergen}」相关（过敏程度：{severity}）。' +
        '开药前请务必向医生说明过敏史。',
        { name: name, allergen: hitKey, severity: sevName })
    };
  }

  /* ================================================================== *
   * 三、用药相互作用（示例规则）
   * ================================================================== */
  /* 说明：规则的药品名（a/b/drug）既是匹配键也是展示文本，因此必须在
     **运行时**取词 —— 模块加载时语言尚未探测（见 core/boot.js 的启动顺序），
     在这里直接调用 PHR.t 只会拿到中文。下同。 */
  var INTERACTION_RULES = [
    {
      id: 'nsaid', a: '阿司匹林', b: '布洛芬', level: 'warn',
      text: '两者同属非甾体抗炎药，合用会增加胃肠道出血风险，且布洛芬可能削弱阿司匹林的心脏保护作用。'
    },
    {
      id: 'warfarin', a: '华法林', b: '阿司匹林', level: 'danger',
      text: '两者均有抗凝/抗血小板作用，合用出血风险显著升高，必须在医生监测凝血指标下使用。'
    },
    {
      id: 'metforminContrast', a: '二甲双胍', b: '碘造影剂', level: 'danger',
      text: '使用碘造影剂前后需暂停二甲双胍，否则可能诱发乳酸酸中毒。检查前请主动告知医生正在服用二甲双胍。'
    },
    {
      id: 'amlodipineSimvastatin', a: '氨氯地平', b: '辛伐他汀', level: 'warn',
      text: '氨氯地平会升高辛伐他汀血药浓度，增加肌病风险，辛伐他汀剂量通常需限制在 20mg 以内。'
    },
    {
      id: 'irbesartanSpironolactone', a: '厄贝沙坦', b: '螺内酯', level: 'warn',
      text: '两者均升高血钾，合用需定期监测血钾与肾功能。'
    },
    {
      id: 'cephalosporinAlcohol', a: '头孢', b: '酒精', level: 'danger',
      text: '使用头孢类抗菌药物期间饮酒可能引发双硫仑样反应（面部潮红、心悸、呼吸困难），用药期间及停药后 7 天内应禁酒。'
    },
    {
      id: 'levothyroxineCalcium', a: '左甲状腺素', b: '碳酸钙', level: 'warn',
      text: '钙剂会影响左甲状腺素吸收，两者服用时间应至少间隔 4 小时。'
    },
    {
      id: 'atorvastatinGrapefruit', a: '阿托伐他汀', b: '葡萄柚', level: 'warn',
      text: '葡萄柚汁会抑制他汀类药物代谢，升高血药浓度与肌肉不良反应风险，服药期间建议避免。'
    }
  ];

  /**
   * 扫描当前用药，返回命中的相互作用提示。
   *
   * 包含两类：
   *   · 药物 × 药物（INTERACTION_RULES）
   *   · 药物 × 个人情况（LIFESTYLE_RULES）—— 例如服用二甲双胍期间饮酒
   * 后者需要读取个人基本信息，因此能提示"同样一种药，对你个人的额外风险"。
   *
   * @param {Array} list  用药记录数组，默认取 current()
   * @param {object} opt  { includeLifestyle: true }
   * @returns [{ kind:'drug'|'lifestyle', level, text, drugs:[], rule }]
   */
  function interactions(list, opt) {
    opt = opt || {};
    var names = (list || current()).map(function (r) { return String(r.data.drugName || ''); });
    var out = [];

    INTERACTION_RULES.forEach(function (rule) {
      var key = 'med.ix.' + rule.id;
      var ra = U.t(key + '.a', rule.a);
      var rb = U.t(key + '.b', rule.b);
      var hitA = names.filter(function (n) { return n.indexOf(ra) >= 0; });
      var hitB = names.filter(function (n) { return n.indexOf(rb) >= 0; });
      if (hitA.length && hitB.length) {
        out.push({
          kind: 'drug',
          level: rule.level,
          text: U.t(key + '.text', rule.text),
          drugs: [hitA[0], hitB[0]],
          rule: ra + ' + ' + rb
        });
      }
    });

    if (opt.includeLifestyle !== false) {
      var profile = PHR.records.profile.get();
      // 个人情况的上下文：部分规则需要参考检验指标，而不只是基本信息
      var ctx = {
        creatinineAbnormal: PHR.records.vital && PHR.records.vital.abnormal('creatinine', 365).length > 0
      };
      LIFESTYLE_RULES.forEach(function (rule) {
        if (!rule.match(profile, ctx)) { return; }
        var lkey = 'med.ls.' + rule.id;
        var drug = U.t(lkey + '.drug', rule.drug);
        var hit = names.filter(function (n) { return n.indexOf(drug) >= 0; });
        if (!hit.length) { return; }
        out.push({
          kind: 'lifestyle',
          level: rule.level,
          text: U.t(lkey + '.text', rule.text),
          drugs: [hit[0]],
          rule: hit[0] + ' × ' + U.t(lkey + '.factor', rule.factor)
        });
      });
    }

    return out.sort(function (a, b) {
      if (a.level !== b.level) { return (a.level === 'danger' ? 0 : 1) - (b.level === 'danger' ? 0 : 1); }
      return (a.kind === 'drug' ? 0 : 1) - (b.kind === 'drug' ? 0 : 1);
    });
  }

  /**
   * 药物 × 个人情况 的额外风险规则。
   * 这些规则的价值在于：同一种药对不同的人风险不同，系统知道你的生活习惯，
   * 所以能给出"针对你个人"的提醒。
   */
  var LIFESTYLE_RULES = [
    {
      id: 'metforminAlcohol', drug: '二甲双胍', factor: '饮酒习惯', level: 'danger',
      match: function (p) { return p && (p.drinking === 'often' || p.drinking === 'sometimes'); },
      text: '服用二甲双胍期间饮酒会显著增加乳酸酸中毒的风险（一种罕见但可能致命的并发症）。' +
            '建议服药期间尽量避免饮酒。'
    },
    {
      id: 'statinAlcohol', drug: '阿托伐他汀', factor: '饮酒习惯', level: 'warn',
      match: function (p) { return p && p.drinking === 'often'; },
      text: '他汀类药物与酒精都需要肝脏代谢，经常饮酒会加重肝脏负担。' +
            '建议控制饮酒量，并定期复查肝功能（ALT/AST）。'
    },
    {
      id: 'aspirinAlcohol', drug: '阿司匹林', factor: '饮酒习惯', level: 'warn',
      match: function (p) { return p && (p.drinking === 'often' || p.drinking === 'sometimes'); },
      text: '阿司匹林与酒精都会刺激胃黏膜，同时存在会明显增加胃肠道出血风险。'
    },
    {
      id: 'amlodipineSmoking', drug: '氨氯地平', factor: '吸烟习惯', level: 'warn',
      match: function (p) { return p && p.smoking === 'current'; },
      text: '吸烟会减弱部分降压药的疗效，并加速动脉硬化。戒烟对血压控制的帮助可能不亚于加药。'
    },
    {
      id: 'irbesartanRenal', drug: '厄贝沙坦', factor: '肾功能', level: 'warn',
      match: function (p, ctx) { return ctx && ctx.creatinineAbnormal; },
      text: '您的血肌酐曾出现异常。沙坦类降压药需要经肾脏排泄，' +
            '肾功能异常时应由医生评估剂量并定期复查肾功能与血钾。'
    },
    {
      id: 'calciumThyroid', drug: '碳酸钙', factor: '甲状腺用药', level: 'warn',
      match: function (p) { return false; },   // 由药物相互作用规则覆盖，此处仅占位说明
      text: '钙剂会与其他药物竞争吸收，建议与其它药物间隔 2 小时以上服用。'
    }
  ];

  /* ================================================================== *
   * 四、依从性与补药提醒
   * ================================================================== */
  /** 依从性统计（用户自评的"按时按量/偶尔漏服/经常漏服"） */
  function adherenceStats() {
    var list = all();
    var map = { good: 0, fair: 0, poor: 0, unknown: 0 };
    list.forEach(function (r) {
      var k = r.data.adherence || 'unknown';
      map[k] = (map[k] || 0) + 1;
    });
    var total = list.length || 1;
    return {
      total: list.length,
      good: map.good, fair: map.fair, poor: map.poor,
      goodRate: Math.round(map.good / total * 100),
      items: [
        { label: U.t('med.adh.good', '按时按量'), value: map.good, color: 'var(--ok)' },
        { label: U.t('med.adh.fair', '偶尔漏服'), value: map.fair, color: 'var(--warn)' },
        { label: U.t('med.adh.poor', '经常漏服'), value: map.poor, color: 'var(--danger)' },
        { label: U.t('med.adh.unknown', '未自评'), value: map.unknown, color: 'var(--muted)' }
      ].filter(function (i) { return i.value > 0; })
    };
  }

  /**
   * 补药提醒：非长期用药且结束日期临近（7 天内）或已过期但仍在服用清单的逻辑。
   * 长期用药按 30 天一周期提醒复诊开药。
   */
  function refillReminders() {
    var out = [];
    var now = Date.now();

    all().forEach(function (r) {
      if (r.data.longTerm) {
        var daysSinceStart = Math.floor((now - U.parseDate(r.data.startDate)) / 86400000);
        var daysToNext = 30 - (daysSinceStart % 30);
        out.push({
          record: r,
          drugName: r.data.drugName,
          type: 'longterm',
          dueInDays: daysToNext,
          message: U.t('med.refill.longTerm',
            '长期用药「{drug}」已服用 {days} 天，建议每 30 天复诊评估一次（约 {left} 天后到期）。',
            { drug: r.data.drugName, days: daysSinceStart, left: daysToNext }),
          level: daysToNext <= 3 ? 'warn' : 'info'
        });
      } else if (r.data.endDate) {
        var left = Math.ceil((U.parseDate(r.data.endDate) - now) / 86400000);
        if (left <= 7) {
          out.push({
            record: r,
            drugName: r.data.drugName,
            type: 'course',
            dueInDays: left,
            message: left >= 0
              ? U.t('med.refill.courseLeft',
                  '「{drug}」的疗程还有 {n} 天结束，如需继续请提前复诊开药。',
                  { drug: r.data.drugName, n: left })
              : U.t('med.refill.courseEnded',
                  '「{drug}」的疗程已于 {n} 天前结束，请确认是否需要继续服用。',
                  { drug: r.data.drugName, n: Math.abs(left) }),
            level: left < 0 ? 'warn' : 'info'
          });
        }
      }
    });

    return out.sort(function (a, b) { return a.dueInDays - b.dueInDays; });
  }

  /** 不良反应汇总 */
  function sideEffects() {
    return all().filter(function (r) { return r.data.sideEffect; })
      .map(function (r) {
        return { drugName: r.data.drugName, effect: r.data.sideEffect, at: r.date, record: r };
      });
  }

  /* ================================================================== *
   * 五、给医生看的一页摘要
   * ================================================================== */
  function doctorSummary() {
    var cur = current();
    return {
      currentCount: cur.length,
      current: cur,
      longTerm: cur.filter(function (r) { return r.data.longTerm; }),
      allergies: allergiesBySeverity(),
      severeAllergies: allergiesBySeverity().filter(function (r) { return r.data.severity === 'severe' || r.data.severity === 'critical'; }),
      interactions: interactions(cur),
      sideEffects: sideEffects(),
      adherence: adherenceStats()
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.medication = {
    all: all,
    current: current,
    past: past,
    prescriptions: prescriptions,
    byDrug: byDrug,
    allergies: allergies,
    allergiesBySeverity: allergiesBySeverity,
    allergenIndex: allergenIndex,
    checkDrug: checkDrug,
    interactions: interactions,
    interactionRules: INTERACTION_RULES,
    lifestyleRules: LIFESTYLE_RULES,
    adherenceStats: adherenceStats,
    refillReminders: refillReminders,
    sideEffects: sideEffects,
    doctorSummary: doctorSummary
  };

})(window.PHR);
