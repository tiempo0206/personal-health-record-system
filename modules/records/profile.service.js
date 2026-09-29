/**
 * ============================================================================
 * 文件：modules/records/profile.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：个人基本信息（与账号 1:1）的读写与派生计算。
 *      基本信息是所有其它模块的地基：BMI 需要身高体重、风险评分需要年龄性别、
 *      用药剂量需要体重、急救时需要血型与过敏史。
 * 依赖：core/models.js（PHR.db.profiles）、core/security.js（脱敏）
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ================================================================== *
   * 一、读取
   * ================================================================== */
  /** 当前用户的档案；不存在时返回一个空的骨架（不落库） */
  function get() {
    var uid = PHR.session.userId();
    if (!uid) { return null; }
    var p = PHR.db.profiles.firstBy('userId', uid);
    /* 姓名 / 紧急联系人 / 地址 / 职业是种子文本，按当前语言解析 */
    return p ? PHR.models.localize(p, ['realName', 'emergencyContact', 'address', 'occupation']) : null;
  }

  /** 取档案，若不存在则返回带默认值的空对象（表单首次渲染用） */
  function getOrDefault() {
    return get() || PHR.models.profile.create({ userId: PHR.session.userId() });
  }

  /** 是否已填写过基本信息 */
  function exists() {
    var p = get();
    return !!(p && p.realName && p.birthDate);
  }

  /** 按查看者身份取脱敏后的档案 */
  function getMasked(viewer) {
    var p = get();
    return p ? PHR.security.masker.profile(p, viewer || 'self') : null;
  }

  /* ================================================================== *
   * 二、写入
   * ================================================================== */
  /**
   * 保存基本信息（新增或更新）。
   * @param {object} values
   * @returns {{ok, errors, profile, message}}
   */
  function save(values) {
    var uid = PHR.session.userId();
    if (!uid) { return { ok: false, message: U.t('auth.err.needLogin', '请先登录') }; }

    var check = PHR.models.profile.validate(values);
    if (!check.ok) {
      return { ok: false, errors: check.errors, message: check.list.join(U.t('ui.listSep', '；')) };
    }

    var existing = get();
    var payload = Object.assign({}, values, { userId: uid });

    var saved;
    if (existing) {
      saved = PHR.db.profiles.update(existing.id, payload);
    } else {
      saved = PHR.db.profiles.insert(PHR.models.profile.create(payload));
    }

    // 同步体重到体征指标，让"体重/BMI 趋势"有起点数据
    syncWeight(sample(saved));

    PHR.audit.log({
      action: 'profile.update', targetType: 'profile', targetId: saved.id, targetName: saved.realName,
      detail: existing
        ? U.t('profile.audit.updated', '更新了个人基本信息')
        : U.t('profile.audit.completed', '完善了个人基本信息'),
      result: 'success'
    });

    PHR.bus.emit('profile:changed', { profile: saved, before: existing || null });
    return { ok: true, profile: saved, message: U.t('profile.saved', '个人基本信息已保存') };
  }

  /** 只同步体重变化，避免反复写入重复的体征记录 */
  function syncWeight(p) {
    if (!p || !p.weight) { return; }
    var today = U.today();
    var exists = PHR.db.records.all().some(function (r) {
      return r.userId === p.userId && r.type === 'vital' &&
             r.data.metricKey === 'weight' && U.fmtDate(r.date) === today;
    });
    if (exists) { return; }
    PHR.records.service.create('vital', {
      metricKey: 'weight',
      measuredAt: today + ' 07:30',
      value: p.weight,
      value2: '',
      unit: 'kg',
      measureWay: 'home',
      context: U.t('profile.syncWeightContext', '随个人基本信息一同记录'),
      note: ''
    }, { silent: true, source: 'manual' });
  }

  /* ================================================================== *
   * 三、派生信息
   * ================================================================== */
  /**
   * 把基本信息加工成"一眼能用"的摘要：年龄、BMI、体型判定、生活风险因素。
   */
  function summary() {
    var p = get();
    if (!p) { return null; }

    var age = p.birthDate ? U.ageFrom(p.birthDate) : null;
    var bmi = computeBmi(p.weight, p.height);
    var bmiLevel = bmi === null ? null : PHR.dict.judge('bmi', bmi);

    var risks = [];
    if (p.smoking === 'current') {
      risks.push({ name: U.t('profile.risk.smoking', '吸烟'), tone: 'danger',
        detail: U.t('profile.risk.smoking.detail', '吸烟显著提高心血管与呼吸系统疾病风险') });
    } else if (p.smoking === 'former') {
      risks.push({ name: U.t('profile.risk.formerSmoker', '曾吸烟'), tone: 'warn',
        detail: U.t('profile.risk.formerSmoker.detail', '戒烟后风险逐年下降，继续保持') });
    }
    if (p.drinking === 'often') {
      risks.push({ name: U.t('profile.risk.drinkingOften', '经常饮酒'), tone: 'warn',
        detail: U.t('profile.risk.drinkingOften.detail', '建议控制饮酒量，男性每日不超过 25g 酒精') });
    } else if (p.drinking === 'sometimes') {
      risks.push({ name: U.t('profile.risk.drinkingSometimes', '偶尔饮酒'), tone: 'info',
        detail: U.t('profile.risk.drinkingSometimes.detail', '适量即可') });
    }
    if (p.exercise === 'never') {
      risks.push({ name: U.t('profile.risk.noExercise', '缺乏运动'), tone: 'warn',
        detail: U.t('profile.risk.noExercise.detail', '建议每周至少 150 分钟中等强度有氧运动') });
    } else if (p.exercise === 'sometimes') {
      risks.push({ name: U.t('profile.risk.lessExercise', '运动偏少'), tone: 'info',
        detail: U.t('profile.risk.lessExercise.detail', '可以增加到每周 3~5 次') });
    }
    if (age !== null && age >= 40) {
      risks.push({ name: U.t('profile.risk.age', '年龄 {n} 岁', { n: age }), tone: 'info',
        detail: U.t('profile.risk.age.detail', '建议每年做一次常规体检') });
    }
    if (bmiLevel === 'critical') {
      risks.push({ name: U.t('profile.risk.bmi', 'BMI 异常'), tone: 'warn',
        detail: U.t('profile.risk.bmi.detail', '体重偏离健康区间，建议到营养科评估') });
    }

    return {
      profile: p,
      age: age,
      ageGroup: age === null ? '—'
        : age < 18 ? U.t('profile.ageGroup.minor', '未成年')
        : age < 45 ? U.t('profile.ageGroup.young', '青壮年')
        : age < 60 ? U.t('profile.ageGroup.middle', '中年')
        : U.t('profile.ageGroup.senior', '老年'),
      bmi: bmi,
      bmiLevel: bmiLevel,
      bmiText: bmiLevel ? PHR.dict.judgeName(bmiLevel) : '—',
      risks: risks,
      isComplete: !!(p.realName && p.birthDate && p.gender && p.bloodType && p.bloodType !== 'unknown')
    };
  }

  /**
   * BMI = 体重(kg) ÷ 身高(m)²
   * @returns {number|null} 保留一位小数
   */
  function computeBmi(weight, height) {
    var w = Number(weight), h = Number(height);
    if (!w || !h || h < 50) { return null; }
    var m = h / 100;
    return Number((w / (m * m)).toFixed(1));
  }

  /**
   * 急救信息卡：把抢救时最需要的几项抽出来。
   * 这是需求中"安全、可控"在紧急场景下的具体体现。
   */
  function emergencyCard() {
    var p = get();
    if (!p) { return null; }
    var allergies = PHR.records.service.byType('allergy');
    var meds = PHR.records.medication ? PHR.records.medication.current() : [];
    var diagnoses = PHR.records.service.byType('diagnosis');

    return {
      name: p.realName,
      gender: PHR.dict.nameOf(PHR.dict.gender, p.gender),
      age: p.birthDate ? U.ageFrom(p.birthDate) : null,
      bloodType: PHR.dict.nameOf(PHR.dict.bloodType, p.bloodType),
      weight: p.weight,
      height: p.height,
      allergies: allergies.map(function (a) {
        return {
          allergen: a.data.allergen,
          severity: PHR.dict.nameOf(PHR.dict.severity, a.data.severity),
          tone: ((PHR.dict.severity || []).filter(function (s) { return s.key === a.data.severity; })[0] || {}).tone || 'info'
        };
      }),
      medications: meds.map(function (m) { return m.data.drugName + ' ' + (m.data.dose || ''); }),
      conditions: diagnoses.map(function (d) { return d.data.diseaseName; }),
      emergencyContact: p.emergencyContact,
      emergencyPhone: p.emergencyPhone,
      updatedAt: p.updatedAt
    };
  }

  /** 供其它模块使用的极简样本 */
  function sample(p) {
    return {
      userId: p.userId, weight: p.weight, height: p.height, waist: p.waist,
      gender: p.gender, birthDate: p.birthDate
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.profile = {
    get: get,
    getOrDefault: getOrDefault,
    getMasked: getMasked,
    exists: exists,
    save: save,
    summary: summary,
    computeBmi: computeBmi,
    emergencyCard: emergencyCard
  };

})(window.PHR);
