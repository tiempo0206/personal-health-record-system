/**
 * ============================================================================
 * 文件：modules/consent/scope.js
 * 层：业务模块层（医生授权 —— 模块 5）
 * 职责：在 core/dict.js 的 consentScope 字典之上提供"授权范围"这一层的行为：
 *      范围包含哪些记录类型、当前用户在该范围下有多少条记录、一组范围覆盖了
 *      多少档案、哪些范围属于敏感数据、常用组合预设。
 *      本文件是 modules/consent 中第一个被加载的，同时负责建立 PHR.consent
 *      命名空间并注册 consent 业务模块。
 *      ⚠️ 范围清单本身只在 core/dict.js 定义一次，本文件绝不重复定义，
 *         以保证"用户界面 / 权限校验 / 医生视图"三处用的是同一份定义。
 * 依赖：core/namespace.js、core/dict.js、modules/records/{categories,record.service}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  PHR.consent = PHR.consent || {};

  var mod = PHR.registerModule('consent', {
    title: '授权管理',
    description: '把必要的档案限范围、限时限地开放给医生，随时可查、随时可撤销',
    icon: '🔑',
    order: 5
  });
  /* 模块标题要随语言切换而变：registerModule 会把 title 拷贝成普通字符串，
     而脚本加载时语言尚未探测，因此注册后用 getter 覆盖，使面包屑即时跟随。 */
  Object.defineProperty(mod, 'title', {
    get: function () { return PHR.t('module.consent.title', '授权管理'); },
    enumerable: true, configurable: true
  });
  Object.defineProperty(mod, 'description', {
    get: function () { return PHR.t('module.consent.desc', '把必要的档案限范围、限时限地开放给医生，随时可查、随时可撤销'); },
    enumerable: true, configurable: true
  });

  /* ================================================================== *
   * 一、敏感范围
   *     这四类之所以建议"单独确认"，理由各不相同：
   *       · basic   含身份证号、住址、紧急联系人，与"看病"无关却可被用于身份冒用；
   *       · family  描述的是没有同意能力的第三方（父母、兄弟姐妹、子女）的健康信息，
   *                 患者授权自己的档案时会顺带把它们交出去，伦理上需要额外意识；
   *       · insight 是系统基于全部档案推断出的结论（风险评分、遗传提示），
   *                 信息密度高于任何单条记录 —— 授权它等于交出整份档案的推论结果；
   *       · psych   心理测评结果的社会风险显著高于一般体检数据：
   *                 ① **污名化** —— 抑郁/焦虑的标签一旦流出，可能影响他人对当事人的
   *                    判断，而这种影响往往不随病情好转而消失；
   *                 ② **歧视风险** —— 在就业、保险、婚恋等场景中，
   *                    心理就诊史被区别对待的情况现实存在；
   *                 ③ **不可撤回** —— 被看到的内容无法收回，与"授权可撤销"无关。
   *                 因此 psych 默认不勾选、不进常用组合、不进检索索引，
   *                 也刻意不参与健康洞察的风险评分（那会通过"授权 insight"的
   *                 推理路径间接泄漏心理数据）。
   * ================================================================== */
  var SENSITIVE = ['basic', 'family', 'insight', 'psych'];

  /* ------------------------------------------------------------------ *
   * 范围取数器注册表
   * ------------------------------------------------------------------
   * 背景：多数范围的数据都在 records 集合里，靠"记录类型 → scope"反查即可。
   * 但心理测评（psych）的数据在**独立集合** assessments 里，不对应任何记录类型。
   * 如果不做特殊处理，授权向导会显示"包含：—　·　当前 0 条记录"——
   * 用户明明有 3 份报告，界面却说 0 条，这是 UI 在说谎，比不显示更糟。
   *
   * 因此把"某个范围下有多少数据、由谁提供"抽成这张小表：
   * 新增这类"独立集合"的范围时，只需要在这里加一项，
   * recordCountOf / list / coverage 三处自动接上，不必再写 if (key === 'xxx')。
   * ------------------------------------------------------------------ */
  var PROVIDERS = {
    psych: {
      // 数据来自心理测评模块的独立集合
      count: function () {
        try { return PHR.assessment.countFor(PHR.session.userId()); } catch (e) { return 0; }
      },
      // 这个范围不对应任何"记录类型"，改为列出它的内容形态
      typeNames: function () { return [PHR.t('consent.scope.psychTypeName', '心理量表报告')]; },
      // 是否计入"健康档案条数"的覆盖率分母（见 coverage 的说明）
      countsAsRecords: false
    }
  };

  function providerOf(key) { return PROVIDERS[key] || null; }

  /* ================================================================== *
   * 二、读取
   * ================================================================== */
  /** 范围字典（唯一来源：core/dict.js） */
  function dict() { return D.consentScope || []; }

  /** 当前用户在该范围下的数据条数（未登录或模块缺失时返回 0） */
  function recordCountOf(key) {
    var p = providerOf(key);
    if (p) { return p.count(); }
    try { return PHR.records.service.list({ scopes: [key] }).length; }
    catch (e) { return 0; }
  }

  /** 全部范围，每项附加记录类型与记录条数 */
  function list() {
    return dict().map(function (s) {
      var p = providerOf(s.key);
      var types = [];
      var typeNames;
      if (p) {
        typeNames = p.typeNames();
      } else {
        try { types = PHR.records.categories.typesOfScope(s.key); } catch (e) { types = []; }
        typeNames = types.map(function (t) { return D.recordTypeName(t); });
      }
      return {
        key: s.key,
        name: nameOf(s.key),
        desc: descOf(s.key),
        types: types,
        typeNames: typeNames,
        recordCount: recordCountOf(s.key),
        unit: p ? PHR.t('consent.unit.report', '份') : PHR.t('consent.unit.record', '条'),
        sensitive: SENSITIVE.indexOf(s.key) >= 0
      };
    });
  }

  /** 单个范围；不存在返回 null */
  function get(key) {
    var hit = list().filter(function (s) { return s.key === key; })[0];
    return hit || null;
  }

  /** 范围中文名，找不到时回退为 —
   *  名称走字典层（PHR.dict.nameOf → dict.consentScope.*），随语言自动切换。 */
  function nameOf(key) {
    return PHR.dict.nameOf(D.consentScope, key);
  }

  /** 一句说明，用于确认页与详情弹窗
   *  desc 未登记在字典层，用动态键 consent.scope.<key>.desc 取词，兜底即 dict.js 原文。 */
  function descOf(key) {
    var hit = dict().filter(function (s) { return s.key === key; })[0];
    return hit ? PHR.t('consent.scope.' + hit.key + '.desc', hit.desc) : '';
  }

  /** describe(['vital','lab']) → '体征指标、检验检查报告' */
  function describe(keys) {
    var names = sanitize(keys).map(nameOf);
    return names.length ? names.join(PHR.t('consent.sep.list', '、')) : '—';
  }

  /* ================================================================== *
   * 三、校验
   * ================================================================== */
  function isValid(key) {
    return dict().some(function (s) { return s.key === key; });
  }

  /** 过滤掉非法 key 并去重 —— 授权写入前必须经过这一层 */
  function sanitize(keys) {
    return U.unique((keys || []).filter(isValid));
  }

  /* ================================================================== *
   * 四、覆盖度
   *     授权向导第 2 步与确认页都会实时显示它，
   *     让用户在"看得够不够"和"给得多不多"之间有个可比较的数字。
   *
   *     口径说明（很重要）：coverage() 只统计**健康档案条数**这一个域。
   *     心理测评报告的单位是"份"，与"条记录"不是一回事 ——
   *     把它们混在一起算百分比，会得到"勾了 1 个范围就多覆盖 3 条"
   *     这种没有意义的数字，还会系统性地高估覆盖度。
   *     因此两个域分开表达：coverage() 给档案域的百分比，
   *     coverageDetail() 给分域明细，界面并列展示。
   * ================================================================== */
  function coverage(keys) {
    var safe = sanitize(keys);
    var total = 0, hit = 0;
    try {
      total = PHR.records.service.all().length;
      hit = safe.length ? PHR.records.service.list({ scopes: safe }).length : 0;
    } catch (e) { PHR.warn(PHR.t('consent.warn.coverageFail', '授权覆盖度计算失败'), e); }
    return {
      records: hit,
      total: total,
      percent: total ? Math.round(hit / total * 100) : 0
    };
  }

  /**
   * 分域覆盖明细：健康档案与心理测评各自单独计数。
   * @returns {{records:{hit,total}, assessments:{hit,total}}}
   */
  function coverageDetail(keys) {
    var safe = sanitize(keys);
    var out = { records: { hit: 0, total: 0 }, assessments: { hit: 0, total: 0 } };

    try {
      out.records.total = PHR.records.service.all().length;
      out.records.hit = safe.length ? PHR.records.service.list({ scopes: safe }).length : 0;
    } catch (e) { /* 忽略 */ }

    try {
      var uid = PHR.session.userId();
      out.assessments.total = PHR.assessment ? PHR.assessment.countFor(uid) : 0;
      out.assessments.hit = safe.indexOf('psych') >= 0 ? out.assessments.total : 0;
    } catch (e) { /* 忽略 */ }

    return out;
  }

  /** 一句话描述覆盖情况（界面直接用它，避免各处自己拼百分比） */
  function coverageText(keys) {
    var d = coverageDetail(keys);
    var parts = [PHR.t('consent.coverage.records', '健康档案 {hit} / {total} 条',
      { hit: d.records.hit, total: d.records.total })];
    if (d.assessments.total) {
      parts.push(PHR.t('consent.coverage.assessments', '心理测评 {hit} / {total} 份',
        { hit: d.assessments.hit, total: d.assessments.total }));
    }
    if (!d.records.total && !d.assessments.total) { return PHR.t('consent.coverage.none', '你目前还没有可授权的数据。'); }
    return PHR.t('consent.coverage.text', '本次授权覆盖：{list}',
      { list: parts.join(PHR.t('consent.sep.dot', '　·　')) });
  }

  /* ================================================================== *
   * 五、敏感范围
   * ================================================================== */
  function sensitiveKeys() { return SENSITIVE.slice(); }

  function isSensitive(key) { return SENSITIVE.indexOf(key) >= 0; }

  /** 已选范围里的敏感项，用于向导中的额外提示 */
  function sensitiveIn(keys) {
    return sanitize(keys).filter(isSensitive);
  }

  /* ================================================================== *
   * 六、常用组合预设
   *     新用户面对 10 个范围容易"要么全勾、要么不知道勾什么"。
   *     预设的作用是把"临床上够用"的最小集合变成一个按钮，
   *     让用户从"选最小够用"而不是"全选"开始。
   *
   *     ⚠️ 刻意**不**把 psych 放进任何预设：心理测评结果的敏感度高于
   *     一般体检数据（涉及污名化、就业与保险歧视风险），必须是用户
   *     主动、单独勾选，不能被"一键复诊"这类按钮顺带带出去。
   * ================================================================== */
  var PRESETS = [
    {
      key: 'revisit', name: '复诊（最常用）',
      desc: '带上基本信息、既往病史、用药、过敏、体征、就诊记录与系统结论，医生一次就能看完病情全貌。',
      scopes: ['basic', 'history', 'medication', 'allergy', 'vital', 'visit', 'insight']
    },
    {
      key: 'lab_only', name: '只看化验',
      desc: '只需要医生帮忙解读化验单时用这个，暴露面最小。',
      scopes: ['basic', 'lab']
    },
    {
      key: 'emergency', name: '急诊',
      desc: '急诊最关心的是"有没有过敏、在吃什么药、有什么基础病"，因此不带检验报告与家族史。',
      scopes: ['basic', 'history', 'medication', 'allergy', 'vital']
    },
    {
      key: 'chronic', name: '慢病随访',
      desc: '高血压、糖尿病等长期管理场景：体征趋势 + 化验 + 用药，配合随访提醒使用。',
      scopes: ['basic', 'history', 'medication', 'vital', 'lab']
    },
    {
      key: 'drug', name: '用药咨询',
      desc: '请医生帮忙看看用药方案是否合理、有没有相互作用。',
      scopes: ['basic', 'medication', 'allergy']
    },
    {
      key: 'first', name: '首次就诊',
      desc: '第一次看这位医生，除家族史外都给：信息全，但仍把最敏感的一项留给患者自己决定。',
      scopes: ['basic', 'history', 'medication', 'allergy', 'lab', 'vital', 'visit']
    }
  ];

  function comboPresets() {
    return PRESETS.map(function (p) {
      var text = presetText(p);
      return { key: p.key, name: text.name, desc: text.desc, scopes: sanitize(p.scopes) };
    });
  }

  function presetOf(key) {
    var hit = PRESETS.filter(function (p) { return p.key === key; })[0];
    if (!hit) { return null; }
    var text = presetText(hit);
    return { key: hit.key, name: text.name, desc: text.desc, scopes: sanitize(hit.scopes) };
  }

  /* 预设名与描述随语言切换，因此在读取时才取词 —— PRESETS 是模块级数组，
     脚本加载时语言还没有探测（PHR.i18n.detect() 在 core/boot.js 里才跑），
     若在字面量里直接调用 PHR.t 会永远停留在中文兜底。 */
  function presetText(p) {
    return {
      name: PHR.t('consent.preset.' + p.key + '.name', p.name),
      desc: PHR.t('consent.preset.' + p.key + '.desc', p.desc)
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.consent.scope = {
    dict: dict,
    list: list,
    get: get,
    nameOf: nameOf,
    descOf: descOf,
    describe: describe,
    isValid: isValid,
    sanitize: sanitize,
    coverage: coverage,
    coverageDetail: coverageDetail,
    coverageText: coverageText,
    recordCountOf: recordCountOf,
    sensitiveKeys: sensitiveKeys,
    isSensitive: isSensitive,
    sensitiveIn: sensitiveIn,
    comboPresets: comboPresets,
    presetOf: presetOf
  };

})(window.PHR);
