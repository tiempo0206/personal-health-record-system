/**
 * ============================================================================
 * 文件：modules/records/history.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：把"确诊疾病 / 手术 / 住院 / 疫苗 / 体检 / 家族病史"聚合为一份
 *      结构化的**既往病史**，并在此基础上给出遗传风险与慢病随访提示。
 *      对应需求原文："用户可以录入基本信息、既往病史、家族病史"。
 * 依赖：core/dict.js、modules/records/record.service.js
 * ============================================================================
 *
 * ⚠️ 免责声明：本模块的遗传风险评估是**基于规则的科普级提示**，
 *    不是医学诊断，不能替代医生的专业判断。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* ================================================================== *
   * 一、各类病史的原始清单
   * ================================================================== */
  function diagnoses() { return PHR.records.service.byType('diagnosis'); }
  function surgeries() { return PHR.records.service.byType('surgery'); }
  function hospitalizations() { return PHR.records.service.byType('hospitalization'); }
  function vaccinations() { return PHR.records.service.byType('vaccination'); }
  function checkups() { return PHR.records.service.byType('checkup'); }
  function familyHistory() { return PHR.records.service.byType('family'); }
  function visits() { return PHR.records.service.byType('visit'); }

  /** 仍然处于"治疗中/未愈"的疾病 */
  function activeConditions() {
    return diagnoses().filter(function (r) {
      return r.data.status === 'active' || r.data.status === 'control';
    });
  }

  /** 需要长期管理的慢性病（按疾病分类判断） */
  function chronicConditions() {
    var chronicCats = ['cardio', 'endocrine', 'respiratory', 'urinary', 'immune', 'mental'];
    return diagnoses().filter(function (r) {
      return chronicCats.indexOf(r.diseaseCat) >= 0 &&
             (r.data.status === 'active' || r.data.status === 'control');
    });
  }

  /** 按疾病分类归并的确诊疾病 */
  function byDiseaseCategory() {
    var map = {};
    diagnoses().forEach(function (r) {
      (map[r.diseaseCat] = map[r.diseaseCat] || []).push(r);
    });
    return (D.diseaseCategory || []).map(function (c) {
      return { key: c.key, name: D.nameOf(D.diseaseCategory, c.key), icon: c.icon, records: map[c.key] || [] };
    }).filter(function (g) { return g.records.length; });
  }

  /** 按亲属关系归并的家族病史 */
  function familyByRelation() {
    var map = {};
    familyHistory().forEach(function (r) {
      (map[r.data.relation] = map[r.data.relation] || []).push(r);
    });
    return (D.familyRelation || []).map(function (rel) {
      return { key: rel.key, name: D.nameOf(D.familyRelation, rel.key), records: map[rel.key] || [] };
    }).filter(function (g) { return g.records.length; });
  }

  /* ================================================================== *
   * 二、病史摘要
   * ================================================================== */
  /**
   * 一页式的病史摘要，供医生视图与导出使用。
   */
  function summary() {
    var dx = diagnoses();
    var sx = surgeries();
    var hz = hospitalizations();
    var va = vaccinations();

    return {
      conditionCount: dx.length,
      activeCount: activeConditions().length,
      surgeryCount: sx.length,
      hospitalizationCount: hz.length,
      totalHospitalDays: U.sum(hz, function (r) {
        return Math.max(0, U.daysBetween(r.data.dischargeDate, r.data.admitDate));
      }),
      vaccinationCount: va.length,
      lastCheckupAt: checkups().length ? U.max(checkups(), 'date') : null,
      firstRecordAt: PHR.records.service.all().length ? U.min(PHR.records.service.all(), 'date') : null,
      followUpDue: followUpDue()
    };
  }

  /**
   * 随访提醒：根据疾病分类给出建议复查周期，
   * 并算出"距离上次相关就诊/检查已经过了多久"。
   */
  /* 说明：规则表在模块加载时就建立了，而语言要到 core/boot.js 才探测，
     因此名称与建议文案一律在**使用处**取词（下面的 U.t('hist.fu.<分类>.name') 等）。 */
  var FOLLOW_UP_RULES = {
    cardio:      { months: 3,  name: '心血管', advice: '血压与血脂建议每 3 个月复查一次' },
    endocrine:   { months: 3,  name: '内分泌', advice: '血糖与糖化血红蛋白建议每 3 个月复查一次' },
    respiratory: { months: 6,  name: '呼吸系统', advice: '建议每半年复查肺功能' },
    urinary:     { months: 6,  name: '泌尿系统', advice: '建议每半年复查肾功能与尿常规' },
    immune:      { months: 6,  name: '免疫风湿', advice: '建议每半年复查免疫指标' },
    digestive:   { months: 6,  name: '消化系统', advice: '建议每半年复查肝功能' },
    neuro:       { months: 6,  name: '神经系统', advice: '建议每半年复诊评估' },
    oncology:    { months: 3,  name: '肿瘤相关', advice: '请严格遵循主治医生制定的复查计划' }
  };

  function followUpDue() {
    var out = [];
    var now = Date.now();

    chronicConditions().forEach(function (r) {
      var rule = FOLLOW_UP_RULES[r.diseaseCat];
      if (!rule) { return; }
      var months = rule.months;
      var dueAt = U.addDays(Math.max(r.date, lastRelatedVisit(r)), months * 30);
      var left = Math.ceil((dueAt - now) / 86400000);
      out.push({
        record: r,
        diseaseName: r.data.diseaseName,
        category: U.t('hist.fu.' + r.diseaseCat + '.name', rule.name),
        nextDate: dueAt,
        daysLeft: left,
        overdue: left < 0,
        advice: U.t('hist.fu.' + r.diseaseCat + '.advice', rule.advice),
        level: left < 0 ? 'warn' : left <= 14 ? 'info' : 'ok'
      });
    });

    return out.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  }

  /** 找出与该疾病相关的最近一次就诊或检查时间 */
  function lastRelatedVisit(record) {
    var cat = record.diseaseCat;
    var related = PHR.records.service.all().filter(function (r) {
      return r.diseaseCat === cat &&
             (r.type === 'visit' || r.type === 'lab' || r.type === 'imaging' || r.type === 'checkup');
    });
    return related.length ? U.max(related, 'date') : record.date;
  }

  /* ================================================================== *
   * 三、家族遗传风险提示
   * ================================================================== */
  /**
   * 基于家族病史的科普级风险提示。
   * 规则：
   *   · 一级亲属（父母、兄弟姐妹、子女）患同一疾病 → 风险提升
   *   · 两位及以上亲属患同一疾病 → 风险进一步提升
   *   · 亲属发病年龄 < 55 岁 → 早发提示
   *   · 若本人已确诊同一疾病 → 明确标注
   */
  var FIRST_DEGREE = ['father', 'mother', 'brother', 'sister', 'son'];

  var RISK_KNOWLEDGE = {
    cardio:      { name: '心血管疾病', advice: '控制血压血脂、戒烟限酒、每年查心电图与血脂' },
    endocrine:   { name: '糖尿病 / 代谢病', advice: '建议每年查空腹血糖与糖化血红蛋白，控制体重' },
    oncology:    { name: '肿瘤', advice: '按医生建议定期做针对性筛查（如胃肠镜、乳腺/甲状腺超声）' },
    neuro:       { name: '神经系统疾病', advice: '控制血压、避免长期熬夜，出现言语或肢体异常立即就医' },
    respiratory: { name: '呼吸系统疾病', advice: '戒烟、避免粉尘环境、每年查肺功能' },
    digestive:   { name: '消化系统疾病', advice: '规律饮食、限制饮酒、按需做胃肠镜' },
    urinary:     { name: '泌尿系统疾病', advice: '多饮水、控制尿酸、每年查肾功能' },
    immune:      { name: '免疫与风湿疾病', advice: '注意关节症状，出现持续晨僵及时就诊' },
    mental:      { name: '精神心理问题', advice: '关注情绪变化，必要时寻求专业心理支持' },
    eye:         { name: '眼科疾病', advice: '每年查视力与眼底，尤其合并糖尿病时' }
  };

  function geneticRisks() {
    var fam = familyHistory();
    var own = diagnoses();
    var map = {};

    fam.forEach(function (r) {
      var cat = r.diseaseCat || 'other';
      if (!map[cat]) { map[cat] = { category: cat, relatives: [], earlyOnset: false }; }
      map[cat].relatives.push(r);
      if (r.data.onsetAge && Number(r.data.onsetAge) < 55) { map[cat].earlyOnset = true; }
    });

    return Object.keys(map).map(function (cat) {
      var g = map[cat];
      var know = RISK_KNOWLEDGE[cat] || { name: D.nameOf(D.diseaseCategory, cat), advice: '建议在体检时向医生说明家族史' };
      var riskName = RISK_KNOWLEDGE[cat]
        ? U.t('hist.grisk.' + cat + '.name', know.name)
        : know.name;
      var riskAdvice = RISK_KNOWLEDGE[cat]
        ? U.t('hist.grisk.' + cat + '.advice', know.advice)
        : U.t('hist.grisk.default.advice', know.advice);
      var firstDegree = g.relatives.filter(function (r) { return FIRST_DEGREE.indexOf(r.data.relation) >= 0; });

      var level = 'info';
      if (firstDegree.length >= 2 || (firstDegree.length >= 1 && g.earlyOnset)) { level = 'high'; }
      else if (firstDegree.length === 1) { level = 'medium'; }
      else if (g.relatives.length >= 2) { level = 'medium'; }

      var selfHas = own.some(function (d) { return d.diseaseCat === cat; });

      var reason = [];
      reason.push(U.t('hist.grisk.reasonCount', '家族中有 {n} 位亲属患有{name}',
        { n: g.relatives.length, name: riskName }));
      if (firstDegree.length) {
        reason.push(U.t('hist.grisk.reasonFirstDegree', '其中一级亲属 {n} 位', { n: firstDegree.length }));
      }
      if (g.earlyOnset) { reason.push(U.t('hist.grisk.reasonEarlyOnset', '存在 55 岁前发病的亲属')); }
      if (selfHas) { reason.push(U.t('hist.grisk.reasonSelf', '您本人已确诊相关疾病')); }

      var finalLevel = selfHas ? 'high' : level;
      return {
        category: cat,
        name: riskName,
        icon: (D.diseaseCategory.filter(function (c) { return c.key === cat; })[0] || {}).icon || '📌',
        level: finalLevel,
        levelName: {
          high: U.t('hist.grisk.level.high', '较高关注'),
          medium: U.t('hist.grisk.level.medium', '需要关注'),
          info: U.t('hist.grisk.level.info', '一般关注')
        }[finalLevel],
        tone: { high: 'danger', medium: 'warn', info: 'info' }[finalLevel],
        relatives: g.relatives,
        reason: reason.join(U.t('ui.listSep', '；')),
        advice: riskAdvice
      };
    }).sort(function (a, b) {
      var w = { high: 3, medium: 2, info: 1 };
      return w[b.level] - w[a.level];
    });
  }

  /* ================================================================== *
   * 四、疫苗接种提示
   * ================================================================== */
  var VACCINE_SUGGEST = [
    { id: 'flu', name: '流感疫苗', cycle: 12, why: '建议每年接种一次，尤其是慢病患者与老年人' },
    { id: 'pneumo', name: '肺炎疫苗', cycle: 60, why: '65 岁以上或合并慢性呼吸/心血管疾病者建议接种' },
    { id: 'hepb', name: '乙肝疫苗', cycle: 0, why: '完成全程接种后一般无需加强，抗体消失者可补种' },
    { id: 'zoster', name: '带状疱疹疫苗', cycle: 0, why: '50 岁以上可咨询医生是否接种' }
  ];

  function vaccineSuggestions() {
    var list = vaccinations();
    return VACCINE_SUGGEST.map(function (v) {
      var name = U.t('hist.vax.' + v.id + '.name', v.name);
      var hit = list.filter(function (r) { return r.data.vaccineName.indexOf(name.slice(0, 2)) >= 0; });
      var lastAt = hit.length ? U.max(hit, 'date') : null;
      var monthsAgo = lastAt ? Math.floor((Date.now() - lastAt) / (30 * 86400000)) : null;
      var due = v.cycle > 0 && (lastAt === null || monthsAgo >= v.cycle);
      return {
        name: name,
        why: U.t('hist.vax.' + v.id + '.why', v.why),
        lastAt: lastAt,
        monthsAgo: monthsAgo,
        due: due,
        level: due ? 'warn' : 'ok',
        advice: lastAt === null
          ? U.t('hist.vax.noRecord', '系统中没有接种记录，如已接种请补充录入')
          : (due
              ? U.t('hist.vax.due', '距上次接种已 {n} 个月，建议咨询是否需再次接种', { n: monthsAgo })
              : U.t('hist.vax.normal', '接种记录正常'))
      };
    });
  }

  /* ================================================================== *
   * 五、导出用的完整病史
   * ================================================================== */
  /**
   * 生成一份结构化的病史包，供医生视图与备份导出使用。
   */
  function bundle() {
    return {
      profile: PHR.records.profile.get(),
      diagnoses: diagnoses(),
      activeConditions: activeConditions(),
      chronicConditions: chronicConditions(),
      surgeries: surgeries(),
      hospitalizations: hospitalizations(),
      vaccinations: vaccinations(),
      checkups: checkups(),
      family: familyHistory(),
      allergies: PHR.records.medication.allergiesBySeverity(),
      medications: PHR.records.medication.current(),
      summary: summary(),
      geneticRisks: geneticRisks(),
      generatedAt: Date.now()
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.history = {
    diagnoses: diagnoses,
    surgeries: surgeries,
    hospitalizations: hospitalizations,
    vaccinations: vaccinations,
    checkups: checkups,
    familyHistory: familyHistory,
    visits: visits,
    activeConditions: activeConditions,
    chronicConditions: chronicConditions,
    byDiseaseCategory: byDiseaseCategory,
    familyByRelation: familyByRelation,
    summary: summary,
    followUpDue: followUpDue,
    followUpRules: FOLLOW_UP_RULES,
    geneticRisks: geneticRisks,
    vaccineSuggestions: vaccineSuggestions,
    bundle: bundle
  };

})(window.PHR);
