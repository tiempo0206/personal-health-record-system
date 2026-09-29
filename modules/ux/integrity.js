/**
 * ============================================================================
 * 文件：modules/ux/integrity.js
 * 层：业务模块层（体验保障 —— 模块 8）
 * 职责：对本地数据库做一次"体检"——按 9 条规则扫描孤立数据、缺失必填、
 *      日期越界、数值异常、引用失效、授权重复、审计缺口与存储配额，
 *      给出评分、问题清单与抽样，并对其中三类可确定修复的问题提供修复。
 * 依赖：core/namespace.js、core/utils.js、core/models.js、core/dict*.js、
 *      core/store.js、PHR.audit（可选）
 * ============================================================================
 *
 * 设计取舍：
 *   1) 只报告不改动：除 orphan / date_out_of_range / invalid_type 三类
 *      "答案唯一"的问题外，其余问题交给用户自行判断（可能是真实数据）。
 *   2) 修复必须二次确认：repair(kinds) 不带第二个参数时只返回"将要做什么"，
 *      调用方弹窗确认后再以 repair(kinds, true) 真正执行。
 *   3) 用户表为空时跳过"孤立记录"检查，避免把整个库误判为脏数据。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* 本地存储告警阈值。localStorage 各家浏览器普遍只给 5MB 左右，4MB 就该提醒了；
     而本地数据库文件模式下数据落在磁盘上，几百 MB 都不是问题，用同一个数字
     会造成"明明很空却一直报警"的假警报 —— 所以按后端分开。 */
  var MAX_STORAGE_BYTES = 4 * 1024 * 1024;             // localStorage：4MB
  var MAX_STORAGE_BYTES_FILE = 256 * 1024 * 1024;      // database.json：256MB
  function storageLimit() {
    return PHR.store.driver === 'file' ? MAX_STORAGE_BYTES_FILE : MAX_STORAGE_BYTES;
  }
  var MIN_DATE = U.parseDate('1900-01-01');  // 早于此日期视为越界

  /* ================================================================== *
   * 一、规则表：每条规则都要说明"为什么要检查这一项"
   * ================================================================== */
  var RULES = {
    orphan: {
      name: '孤立记录', level: 'error', fixable: true,
      why: '记录里的 userId 在账号表中不存在，说明这批数据不属于任何账号：它既不会出现在任何人的档案里，又持续占用存储空间。',
      ok: '全部健康记录都能找到归属账号。',
      fix: '删除这些找不到主人的记录'
    },
    orphan_assessment: {
      name: '心理测评缺少归属', level: 'warn', fixable: false,
      why: '心理测评记录里的 userId 在账号表中不存在。它既不会出现在任何人的测评列表里，又持续占用存储空间。' +
           '本规则刻意**不提供自动修复** —— 心理数据一旦被程序自动删除就无法挽回，只报告、由人决定。',
      ok: '全部分心理测评都能找到归属账号。'
    },
    required_missing: {      name: '必填字段缺失', level: 'error', fixable: false,
      why: '标题、日期、类型是列表、时间线与检索的最小依赖；任一为空都会让记录在界面上显示为空白项，参与排序时也会落到错误的位置。',
      ok: '所有记录的标题、日期、类型都完整。'
    },
    invalid_type: {
      name: '记录类型无法识别', level: 'error', fixable: true,
      why: '类型不在数据字典中时，系统找不到它对应的表单字段口径，只能按「健康笔记」兜底渲染，字段会整体错位。',
      ok: '所有记录的类型都在数据字典中。',
      fix: '删除这些类型无法识别的记录'
    },
    date_out_of_range: {
      name: '日期越界', level: 'error', fixable: true,
      why: '未来日期通常是误填（把 2026 输成 2062），会把趋势图的时间轴拉长到无法阅读；1900 年之前的日期同样不可能属于本人。',
      ok: '所有记录的日期都在合理范围内。',
      fix: '把晚于今天的日期改为今天，把早于 1900 年的日期改为 1900-01-01'
    },
    value_abnormal: {
      name: '体征数值异常', level: 'warn', fixable: false,
      why: '数值不是数字、为负、或超过该指标阈值上限的 3 倍，几乎可以确定是录入错误（多打了一个零、写成了文字），会拉偏趋势图与风险评估。',
      ok: '体征数值都在合理量级。'
    },
    metric_missing: {
      name: '体征指标不存在', level: 'error', fixable: false,
      why: '体征记录引用了数据字典里没有的指标 key，趋势图无法分组、三级阈值判定也无法进行。',
      ok: '体征记录引用的指标都能在数据字典中找到。'
    },
    consent_duplicate: {
      name: '重复授权', level: 'warn', fixable: false,
      why: '同一位医生同时存在多条生效中的授权，会让"授权范围"的边界变得模糊，用户也难以判断医生到底能看到哪些数据。',
      ok: '没有同一位医生的重复生效授权。'
    },
    audit_incomplete: {
      name: '审计覆盖不足', level: 'warn', fixable: false,
      why: '"可追踪"是本系统的核心承诺：每一次数据写入都应留下日志。日志条数明显少于数据变更次数，说明存在未留痕的操作（历史数据迁移、批量写入等）。本项只做提示，不阻断任何功能。',
      ok: '审计日志条数与数据变更次数基本匹配。'
    },
    storage_quota: {
      name: '存储占用', level: 'warn', fixable: false,
      why: '浏览器给单个站点的存储通常只有 5MB 左右，接近上限时再写入会有失败风险，用户会突然"存不进去"。',
      ok: '存储占用在安全范围内。'
    }
  };

  /* 展示顺序（同时决定扣分顺序） */
  var ORDER = ['orphan', 'orphan_assessment', 'required_missing', 'invalid_type', 'date_out_of_range',
    'value_abnormal', 'metric_missing', 'consent_duplicate', 'audit_incomplete', 'storage_quota'];

  /** 可被自动修复的问题种类 */
  var FIXABLE = ['orphan', 'date_out_of_range', 'invalid_type'];

  /* 执行顺序：先按"内容"修正（类型、日期），最后再删除记录，
     否则先删掉的记录会让后面几类的实际处理条数对不上计划里的数字 */
  var FIX_ORDER = ['invalid_type', 'date_out_of_range', 'orphan'];

  /* ================================================================== *
   * 二、体检
   * ================================================================== */
  function usersById() {
    var map = {};
    PHR.db.users.all().forEach(function (u) { map[u.id] = u; });
    return map;
  }

  /** 指标的"定义上限"：优先取警戒区间上界，其次正常区间上界；无阈值的指标返回 null */
  function metricCap(metric) {
    if (!metric || metric.noThreshold) { return null; }
    var hi = null;
    if (metric.warn && metric.warn.max !== null && metric.warn.max !== undefined) { hi = metric.warn.max; }
    else if (metric.normal && metric.normal.max !== null && metric.normal.max !== undefined) { hi = metric.normal.max; }
    return hi === null ? null : hi * 3;
  }

  function describe(row) {
    return row.id + ' · ' + U.truncate(PHR.models.record.displayTitle(row) || PHR.t('integrity.noTitle', '（无标题）'), 24);
  }

  /** 按键名求和（U.sum 只支持函数或纯数字数组，这里补一个按键名累加的版本） */
  function sumOf(list, key) {
    return (list || []).reduce(function (s, x) { return s + (Number(x[key]) || 0); }, 0);
  }

  function make(key, count, detail, samples) {
    var r = RULES[key];
    return {
      key: key,
      /* 规则名与说明按当前语言取词；RULES 里的中文是兜底原文，模块加载时就求值了，
         那时语言还没探测，因此取词必须放在这里做，切换语言才会立即生效 */
      name: PHR.t('integrity.' + key + '.name', r.name),
      level: count > 0 ? r.level : 'ok',
      count: count, detail: detail, samples: (samples || []).slice(0, 5),
      why: PHR.t('integrity.' + key + '.why', r.why), fixable: !!r.fixable
    };
  }

  /**
   * 执行一次完整性体检。
   * @param {object} [opt] { audit:false 时不写审计日志（界面首次渲染用，避免刷屏） }
   * @returns {{ok, score, checkedAt, checkedAtText, items, stats}}
   */
  function check(opt) {
    opt = opt || {};
    var records = PHR.db.records.all();
    var users = usersById();
    var userIds = Object.keys(users);
    var items = [];
    var push = function (key, count, detail, samples) { items.push(make(key, count, detail, samples)); };

    /* 1) 孤立记录：记录找不到归属账号 */
    if (!userIds.length) {
      push('orphan', 0, PHR.t('integrity.orphan.skip', '当前没有任何账号数据，已跳过孤立记录检查（避免把整个数据库误判为脏数据）。'));
    } else {
      var orphans = records.filter(function (r) { return !users[r.userId]; });
      push('orphan', orphans.length, orphans.length
        ? PHR.t('integrity.orphan.detail', '有 {n} 条记录找不到归属账号，它们的 userId 在账号表中不存在。', { n: orphans.length })
        : PHR.t('integrity.orphan.ok', RULES.orphan.ok), orphans.map(describe));
    }

    /* 1b) 心理测评的孤立记录
       ⚠️ 必须与上一条一样带"账号表为空则跳过"的短路保护：
       否则在用户清空全部账号之后，整套心理测评会被判成脏数据。
       ⚠️ 本规则刻意设为**不可自动修复**（fixable: false）：
       心理测评数据一旦被程序自动删除就无法挽回，宁可只报告、由人决定。 */
    if (!userIds.length) {
      push('orphan_assessment', 0, PHR.t('integrity.orphan_assessment.skip', '当前没有任何账号数据，已跳过心理测评归属检查。'));
    } else {
      var orphanAssess = PHR.db.assessments.all().filter(function (a) { return !users[a.userId]; });
      push('orphan_assessment', orphanAssess.length, orphanAssess.length
        ? PHR.t('integrity.orphan_assessment.detail', '有 {n} 份心理测评找不到归属账号。', { n: orphanAssess.length })
        : PHR.t('integrity.orphan_assessment.ok', RULES.orphan_assessment.ok),
        orphanAssess.map(function (a) {
          return PHR.t('integrity.assessmentPrefix', '心理测评') + ' · ' + (a.scaleName || a.scaleKey);
        }));
    }

    /* 2) 必填缺失：标题 / 日期 / 类型为空 */
    var missing = records.filter(function (r) { return !r.title || !r.date || !r.type; });
    push('required_missing', missing.length, missing.length
      ? PHR.t('integrity.required_missing.detail', '有 {n} 条记录缺少标题、日期或类型，列表与时间线会显示为空白项。', { n: missing.length })
      : PHR.t('integrity.required_missing.ok', RULES.required_missing.ok), missing.map(describe));

    /* 3) 记录类型无法识别 */
    var badType = records.filter(function (r) { return r.type && !D.recordTypeMap[r.type]; });
    push('invalid_type', badType.length, badType.length
      ? PHR.t('integrity.invalid_type.detail', '有 {n} 条记录的类型不在数据字典中，界面只能按「健康笔记」兜底渲染。', { n: badType.length })
      : PHR.t('integrity.invalid_type.ok', RULES.invalid_type.ok), badType.map(describe));

    /* 4) 日期越界：晚于今天，或早于 1900 年 */
    var todayStr = U.today();
    var badDate = records.filter(function (r) {
      if (!r.date) { return false; }
      return U.fmtDate(r.date) > todayStr || r.date < MIN_DATE;
    });
    push('date_out_of_range', badDate.length, badDate.length
      ? PHR.t('integrity.date_out_of_range.detail', '有 {n} 条记录的日期晚于今天或早于 1900 年，会污染趋势图的时间轴。', { n: badDate.length })
      : PHR.t('integrity.date_out_of_range.ok', RULES.date_out_of_range.ok),
      badDate.map(function (r) {
        return PHR.t('integrity.sample.paren', '{row}（{value}）', { row: describe(r), value: U.fmtDate(r.date) });
      }));

    /* 5) 数值异常：体征记录的 value 非数字 / 为负 / 超过指标上限的 3 倍 */
    var badValue = [];
    records.forEach(function (r) {
      if (r.type !== 'vital' || !r.data) { return; }
      var v = r.data.value;
      if (typeof v !== 'number' || isNaN(v) || v < 0) { badValue.push(r); return; }
      var cap = metricCap(D.metric(r.data.metricKey));
      if (cap !== null && v > cap) { badValue.push(r); }
    });
    push('value_abnormal', badValue.length, badValue.length
      ? PHR.t('integrity.value_abnormal.detail', '有 {n} 条体征记录的数值不是数字、为负，或超过该指标阈值上限的 3 倍。', { n: badValue.length })
      : PHR.t('integrity.value_abnormal.ok', RULES.value_abnormal.ok),
      badValue.map(function (r) {
        return PHR.t('integrity.sample.paren', '{row}（{value}）',
          { row: describe(r), value: (r.data ? r.data.value : '') });
      }));

    /* 6) 体征孤立值：引用了不存在的指标 key */
    var badMetric = records.filter(function (r) {
      return r.type === 'vital' && r.data && r.data.metricKey && !D.metric(r.data.metricKey);
    });
    push('metric_missing', badMetric.length, badMetric.length
      ? PHR.t('integrity.metric_missing.detail', '有 {n} 条体征记录引用了数据字典中不存在的指标。', { n: badMetric.length })
      : PHR.t('integrity.metric_missing.ok', RULES.metric_missing.ok),
      badMetric.map(function (r) {
        return PHR.t('integrity.sample.paren', '{row}（{value}）', { row: describe(r), value: r.data.metricKey });
      }));

    /* 7) 授权一致性：同一医生同时有多条生效中的授权 */
    var byDoctor = {};
    PHR.db.consents.all().forEach(function (c) {
      if (PHR.models.consent.effectiveStatus(c) !== 'active') { return; }
      var k = (c.doctorName || PHR.t('integrity.noDoctorName', '（未填写姓名）')) + ' @ ' +
              (c.hospital || PHR.t('integrity.noHospital', '（未填写机构）'));
      (byDoctor[k] = byDoctor[k] || []).push(c);
    });
    var dup = [];
    Object.keys(byDoctor).forEach(function (k) {
      if (byDoctor[k].length > 1) {
        dup.push(PHR.t('integrity.sample.consentDup', '{name}（{n} 条）', { name: k, n: byDoctor[k].length }));
      }
    });
    push('consent_duplicate', dup.length, dup.length
      ? PHR.t('integrity.consent_duplicate.detail', '有 {n} 位医生同时持有多条生效中的授权，建议合并为一条。', { n: dup.length })
      : PHR.t('integrity.consent_duplicate.ok', RULES.consent_duplicate.ok), dup);

    /* 8) 审计完整性（提示级）：日志条数少于数据变更次数 */
    var writeOps = records.length + PHR.db.consents.count() + PHR.db.profiles.count()
      + PHR.db.assessments.count();
    var auditCount = PHR.db.audits.count();
    var gap = writeOps - auditCount;
    push('audit_incomplete', gap > 0 ? gap : 0, gap > 0
      ? PHR.t('integrity.audit_incomplete.detail',
        '现有 {ops} 条数据各至少需要一次写入留痕，而审计日志只有 {logs} 条，相差 {gap} 条。',
        { ops: writeOps, logs: auditCount, gap: gap })
      : PHR.t('integrity.audit_incomplete.ok', RULES.audit_incomplete.ok));

    /* 9) 存储配额 */
    var usage = PHR.store.usage();
    var limit = storageLimit();
    var over = usage.bytes > limit;
    push('storage_quota', over ? 1 : 0, over
      ? PHR.t('integrity.storage_quota.over',
        '存储已占用 {kb} KB，超过 {max} KB 的告警线，建议导出备份后清理历史数据。',
        { kb: usage.kb, max: Math.round(limit / 1024) })
      : PHR.t('integrity.storage_quota.ok', '存储占用 {kb} KB，后端类型：{driver}。',
        { kb: usage.kb, driver: PHR.store.describe() }));

    /* ---- 评分：错误级每类扣 15 分，提醒级每类扣 6 分，问题越多再叠加少量扣分 ---- */
    var score = 100;
    items.forEach(function (it) {
      if (!it.count) { return; }
      score -= (RULES[it.key].level === 'error' ? 15 : 6);
      if (it.count > 1) { score -= Math.min(10, (it.count - 1) * 2); }
    });
    score = Math.max(0, Math.min(100, score));

    var problems = items.filter(function (i) { return i.count > 0; });
    var totalIssues = sumOf(problems, 'count');
    var report = {
      ok: problems.every(function (i) { return i.level !== 'error'; }),
      score: score,
      checkedAt: Date.now(),
      checkedAtText: U.fmtFull(Date.now()),
      items: items,
      stats: {
        records: records.length,
        users: userIds.length,
        consents: PHR.db.consents.count(),
        audits: auditCount,
        usageBytes: usage.bytes,
        usageKb: usage.kb,
        driver: PHR.store.driver,
        problemKinds: problems.length,
        totalIssues: totalIssues
      }
    };

    if (opt.audit !== false) {
      audit(PHR.t('integrity.audit.check', '完整性自检：评分 {score}，发现 {kinds} 类问题（共 {n} 处）',
        { score: score, kinds: problems.length, n: totalIssues }));
    }
    return report;
  }

  /* ================================================================== *
   * 三、修复
   * ================================================================== */

  /** 生成"将要做什么"的清单，供界面弹二次确认 */
  function planRepair(kinds) {
    kinds = (kinds && kinds.length ? kinds : FIXABLE).filter(function (k) {
      return FIXABLE.indexOf(k) >= 0;
    });
    var items = check({ audit: false }).items;
    var actions = kinds.map(function (k) {
      var it = items.filter(function (x) { return x.key === k; })[0];
      return {
        key: k,
        name: PHR.t('integrity.' + k + '.name', RULES[k].name),
        count: it ? it.count : 0,
        detail: PHR.t('integrity.' + k + '.fix', RULES[k].fix), samples: it ? it.samples : []
      };
    }).filter(function (a) { return a.count > 0; });
    return { ok: true, kinds: kinds, actions: actions, total: sumOf(actions, 'count') };
  }

  /** 执行一类修复，返回处理条数 */
  function doFix(kind) {
    if (kind === 'orphan') {
      var users = usersById();
      if (!Object.keys(users).length) { return 0; }   // 没有账号数据时不动任何记录
      return PHR.db.records.removeWhere(function (r) { return !users[r.userId]; });
    }
    if (kind === 'invalid_type') {
      return PHR.db.records.removeWhere(function (r) { return r.type && !D.recordTypeMap[r.type]; });
    }
    if (kind === 'date_out_of_range') {
      var todayStr = U.today();
      var n = 0;
      PHR.db.records.all().forEach(function (r) {
        if (!r.date) { return; }
        var fixed = null;
        if (U.fmtDate(r.date) > todayStr) { fixed = Date.now(); }
        else if (r.date < MIN_DATE) { fixed = MIN_DATE; }
        if (fixed === null) { return; }
        PHR.db.records.update(r.id, {
          date: fixed,
          dateText: r.type === 'vital' ? U.fmtFull(fixed) : U.fmtDate(fixed)
        });
        n++;
      });
      return n;
    }
    return 0;
  }

  /**
   * 修复可自动处理的问题。
   * @param {Array} [kinds] 只修复指定种类，缺省为全部可修复项
   * @param {boolean} [confirmed] 必须显式传 true 才真正执行；
   *        否则只返回 repairPlan（needConfirm:true），由调用方弹二次确认。
   */
  function repair(kinds, confirmed) {
    var plan = planRepair(kinds);
    if (!plan.total) {
      return { ok: true, needConfirm: false, done: 0, result: {}, plan: plan,
        message: PHR.t('integrity.repair.none', '没有需要修复的问题。') };
    }
    if (confirmed !== true) {
      return { ok: false, needConfirm: true, done: 0, result: {}, plan: plan,
        message: PHR.t('integrity.repair.needConfirm', '修复前需要用户二次确认。') };
    }

    var result = {};
    var done = 0;
    plan.actions.slice()
      .sort(function (a, b) { return FIX_ORDER.indexOf(a.key) - FIX_ORDER.indexOf(b.key); })
      .forEach(function (a) {
        try { result[a.key] = doFix(a.key); done += result[a.key]; }
        catch (e) { result[a.key] = 0; PHR.warn(PHR.t('ux.integrity.warn.fixFail', '修复失败：{key}', { key: a.key }), e); }
      });

    var text = plan.actions.map(function (a) {
      return PHR.t('integrity.repairItem', '{name} {n} 条', { name: a.name, n: (result[a.key] || 0) });
    }).join(PHR.t('integrity.listSep', '，'));
    audit(PHR.t('integrity.audit.repair', '完整性修复：共处理 {n} 处（{detail}）', { n: done, detail: text }));
    return { ok: true, needConfirm: false, done: done, result: result, plan: plan,
      message: PHR.t('integrity.repairDone', '共处理 {n} 处问题。', { n: done }) };
  }

  function audit(detail) {
    U.audit({
      action: 'ux.integrity', result: 'success', targetType: 'system',
      targetName: PHR.t('integrity.targetName', '数据完整性'), detail: detail
    });
  }

  /* ================================================================== *
   * 四、挂载
   * ================================================================== */
  PHR.ux = PHR.ux || {};
  PHR.ux.integrity = {
    RULES: RULES,
    ORDER: ORDER,
    FIXABLE: FIXABLE,
    check: check,
    planRepair: planRepair,
    repair: repair
  };

})(window.PHR);
