/**
 * ============================================================================
 * 文件：modules/records/categories.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：在 core/dict-records.js 的类型字典之上，提供"归类与统计"这一层能力：
 *      按授权范围分组、按疾病系统分组、统计各类记录数量、给出推荐录入顺序等。
 *      字典本身（字段模式）不在这里重复定义，避免两处维护。
 * 依赖：core/dict.js、core/dict-records.js、core/models.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /** 档案中心模块的命名空间（本文件是 modules/records 中第一个被加载的） */
  PHR.records = PHR.records || {};

  PHR.registerModule('records', {
    title: '档案中心',
    description: '14 类健康档案的录入、同步、分类、版本管理与时间线',
    icon: '🗂️',
    order: 2
  });

  /* 模块名随语言切换：注册发生在语言探测之前，只能用访问器延迟取词
     （与 core/dict-records.js 处理记录类型名称的做法一致） */
  (function () {
    var m = PHR.modules.records;
    var zhTitle = m.title, zhDesc = m.description;
    Object.defineProperty(m, 'title', {
      enumerable: true, configurable: true,
      get: function () { return U.t('module.records.title', zhTitle); }
    });
    Object.defineProperty(m, 'description', {
      enumerable: true, configurable: true,
      get: function () { return U.t('module.records.desc', zhDesc); }
    });
  })();

  /* ================================================================== *
   * 一、按授权范围分组
   * ================================================================== */
  /**
   * 把 14 种记录类型按"授权范围"归并，用于：
   *  · 录入页的分组展示
   *  · 医生授权页勾选范围时提示"这个范围包含哪些数据类型"
   *  · 医生视图按范围组织内容
   */
  function byScope() {
    var map = {};
    D.recordTypes.forEach(function (t) {
      (map[t.scope] = map[t.scope] || []).push(t);
    });
    return (D.consentScope || []).map(function (s) {
      return {
        key: s.key,
        // 名称走字典层取词（dict.consentScope.*）；desc 无字典项，走本模块词条
        name: D.nameOf(D.consentScope, s.key),
        desc: U.t('cat.scope.' + s.key + '.desc', s.desc),
        types: map[s.key] || []
      };
    }).filter(function (g) { return g.types.length; });
  }

  /** 取某个授权范围下包含的记录类型 key 列表 */
  function typesOfScope(scopeKey) {
    return D.recordTypes.filter(function (t) { return t.scope === scopeKey; })
      .map(function (t) { return t.key; });
  }

  /** 取某条记录所属的授权范围（记录自身优先，其次类型默认） */
  function scopeOf(record) {
    if (!record) { return 'basic'; }
    return record.scope || D.recordType(record.type).scope;
  }

  /* ================================================================== *
   * 二、按疾病系统分组
   * ================================================================== */
  /** 统计每种疾病分类下有多少条记录 */
  function countByDiseaseCat(records) {
    var map = {};
    (records || []).forEach(function (r) {
      var k = r.diseaseCat || 'other';
      map[k] = (map[k] || 0) + 1;
    });
    return (D.diseaseCategory || []).map(function (c) {
      return { key: c.key, name: D.nameOf(D.diseaseCategory, c.key), icon: c.icon, count: map[c.key] || 0 };
    }).filter(function (x) { return x.count > 0; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  /** 统计每种记录类型下有多少条 */
  function countByType(records) {
    var map = {};
    (records || []).forEach(function (r) { map[r.type] = (map[r.type] || 0) + 1; });
    return D.recordTypes.map(function (t) {
      return { key: t.key, name: t.name, icon: t.icon, color: t.color, count: map[t.key] || 0 };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  /* ================================================================== *
   * 三、推荐录入顺序
   *     新用户面对 14 种类型容易不知道从哪儿开始，这里给出引导。
   * ================================================================== */
  function recommendedOrder() {
    return [
      { key: 'basic',   name: U.t('cat.order.basic', '个人基本信息'), type: null,
        why: U.t('cat.order.basic.why', '血型、身高体重、过敏史是急救与用药计算的基础，医生最先要看的就是它。') },
      { key: 'allergy', name: U.t('cat.order.allergy', '过敏史'), type: 'allergy',
        why: U.t('cat.order.allergy.why', '药物过敏直接影响开方，漏填可能造成严重后果。') },
      { key: 'diagnosis', name: U.t('cat.order.diagnosis', '确诊疾病'), type: 'diagnosis',
        why: U.t('cat.order.diagnosis.why', '既往病史是医生判断病情走向的主要依据。') },
      { key: 'medication', name: U.t('cat.order.medication', '当前用药'), type: 'medication',
        why: U.t('cat.order.medication.why', '避免重复开药与药物相互作用。') },
      { key: 'family',  name: U.t('cat.order.family', '家族病史'), type: 'family',
        why: U.t('cat.order.family.why', '用于遗传风险评估，也是医生问诊的常规项目。') },
      { key: 'vital',   name: U.t('cat.order.vital', '体征指标'), type: 'vital',
        why: U.t('cat.order.vital.why', '有了连续数值才能画趋势图、做异常提醒。') },
      { key: 'visit',   name: U.t('cat.order.visit', '就诊记录'), type: 'visit',
        why: U.t('cat.order.visit.why', '把每次就诊的经过串起来，复诊时一目了然。') },
      { key: 'lab',     name: U.t('cat.order.lab', '检验报告'), type: 'lab',
        why: U.t('cat.order.lab.why', '化验单是客观证据，配合趋势图最有说服力。') }
    ];
  }

  /* ================================================================== *
   * 四、记录的新鲜度与完整性
   * ================================================================== */
  /**
   * 计算档案完整度：哪些必填项还没填。
   * @param {Array} records 全部记录
   * @param {object} profile 个人基本信息
   * @returns {{percent:number, filled:Array, missing:Array}}
   */
  function completeness(records, profile) {
    var checks = [
      { key: 'basic',    name: U.t('cat.comp.basic', '个人基本信息'), done: !!(profile && profile.realName && profile.birthDate) },
      { key: 'allergy',  name: U.t('cat.comp.allergy', '过敏史'),       done: has(records, 'allergy') },
      { key: 'diagnosis',name: U.t('cat.comp.diagnosis', '确诊疾病'),     done: has(records, 'diagnosis') },
      { key: 'medication',name:U.t('cat.comp.medication', '用药记录'),     done: has(records, 'medication') },
      { key: 'family',   name: U.t('cat.comp.family', '家族病史'),     done: has(records, 'family') },
      { key: 'vital',    name: U.t('cat.comp.vital', '体征指标'),     done: has(records, 'vital') },
      { key: 'visit',    name: U.t('cat.comp.visit', '就诊记录'),     done: has(records, 'visit') },
      { key: 'lab',      name: U.t('cat.comp.lab', '检验报告'),     done: has(records, 'lab') },
      { key: 'checkup',  name: U.t('cat.comp.checkup', '体检报告'),     done: has(records, 'checkup') },
      { key: 'vaccination', name: U.t('cat.comp.vaccination', '疫苗接种'),  done: has(records, 'vaccination') }
    ];
    var filled = checks.filter(function (c) { return c.done; });
    return {
      percent: Math.round(filled.length / checks.length * 100),
      filled: filled,
      missing: checks.filter(function (c) { return !c.done; })
    };
  }

  function has(records, type) {
    return (records || []).some(function (r) { return r.type === type; });
  }

  /* ================================================================== *
   * 五、展示辅助
   * ================================================================== */
  /** 记录类型的中文名（带缓存） */
  function typeName(key) { return D.recordTypeName(key); }

  /** 记录类型图标 */
  function typeIcon(key) { return D.recordType(key).icon; }

  /** 记录类型的主题色 */
  function typeColor(key) { return D.recordType(key).color; }

  /** 取某条记录最有代表性的几个字段，用于卡片展示 */
  function highlights(record, max) {
    var t = D.recordType(record.type);
    var out = [];
    var skip = { diseaseCat: 1, severity: 1, note: 1, tags: 1 };
    t.fields.forEach(function (fd) {
      if (out.length >= (max || 3)) { return; }
      if (skip[fd.name]) { return; }
      /* 走 fieldText 而不是直接读 record.data —— 种子文本挂着词条键，
         要按当前语言解析（否则英文卡片正文里会冒出中文）。 */
      var v = PHR.models.record.fieldText(record, fd.name);
      if (v === undefined || v === null || v === '' || v === false) { return; }
      if (fd.name === t.titleField) { return; }
      var opts = typeof fd.options === 'function' ? fd.options() : fd.options;
      if (fd.type === 'select') { v = D.nameOf(opts || [], v); }
      if (Array.isArray(v)) { v = v.map(function (x) { return D.nameOf(opts || [], x) || x; }).join(U.t('ui.listSep', '、')); }
      if (typeof v === 'boolean') { v = U.t('ui.yes', '是'); }
      if ((fd.type === 'date' || fd.type === 'datetime') && v) { v = U.fmtDate(U.parseDate(v)); }
      out.push({ label: fd.label, value: String(v) + (fd.unit && typeof v === 'number' ? ' ' + fd.unit : '') });
    });
    return out;
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.categories = {
    byScope: byScope,
    typesOfScope: typesOfScope,
    scopeOf: scopeOf,
    countByDiseaseCat: countByDiseaseCat,
    countByType: countByType,
    recommendedOrder: recommendedOrder,
    completeness: completeness,
    typeName: typeName,
    typeIcon: typeIcon,
    typeColor: typeColor,
    highlights: highlights
  };

})(window.PHR);
