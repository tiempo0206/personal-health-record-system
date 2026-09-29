/**
 * ============================================================================
 * 文件：modules/assessment/assessment.service.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：测评会话的生命周期 —— 草稿、提交、入库、历史、趋势，
 *      以及**医生授权视角**的可见性判定。
 *
 *  ⚠️ 两条安全约束（改动本文件前务必先读）：
 *   ① `all()` 在**没有登录身份时必须返回空数组**。
 *      绝不能写成 `!uid || row.userId === uid` —— 医生访客的 userId 是空串，
 *      那样写会让任何没有身份标识的调用者拿到**所有患者**的心理测评结果。
 *      （这条教训来自 modules/records/record.service.js 里一个真实修掉的漏洞。）
 *   ② 心理数据**只存在 assessments 集合里**，绝不能落进 records 集合。
 *      因为 D.recordType() 找不到类型时会静默回退到 note 类型，而 note.scope
 *      是 'basic' —— 一旦混进去，只授权了「个人基本信息」的医生就能看到心理报告。
 *
 * 依赖：core/security.js（canViewScoped / filterByConsent 共用判定）
 *      modules/assessment/{scales,scoring,report,crisis}.js、modules/audit
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var S = PHR.assessment.scales;
  var SC = PHR.assessment.scoring;
  var RP = PHR.assessment.report;
  var CR = PHR.assessment.crisis;

  /** 心理测评数据归属的授权范围 key（字面量，不走 scopeOf —— 那正是泄漏点） */
  var SCOPE = 'psych';

  var DRAFT_KEY = 'assessment_draft';

  /* ================================================================== *
   * 一、读取
   * ================================================================== */

  /** 当前登录用户 id（会话模块缺失时视为未登录） */
  function uid() {
    return (PHR.session && PHR.session.userId) ? PHR.session.userId() : '';
  }

  /** 当前用户的全部测评（时间倒序）。无登录身份时返回空数组。 */
  function all() {
    var u = uid();
    if (!u) { return []; }
    return U.sortBy(
      PHR.db.assessments.all().filter(function (r) { return r.userId === u; }),
      'at', true
    );
  }

  /** 按 id 取；不属于本人时返回 null */
  function byId(id) {
    var r = PHR.db.assessments.byId(id);
    if (!r) { return null; }
    var u = uid();
    if (!u || r.userId !== u) { return null; }
    return r;
  }

  /** 某量表的历次结果（时间升序，供趋势图使用） */
  function history(scaleKey) {
    return U.sortBy(all().filter(function (r) { return r.scaleKey === scaleKey; }), 'at');
  }

  /** 某量表的最近一次结果 */
  function latest(scaleKey) {
    var h = history(scaleKey);
    return h.length ? h[h.length - 1] : null;
  }

  /** 某量表的趋势摘要 */
  function trend(scaleKey) {
    return SC.trend(history(scaleKey));
  }

  /** 每个量表最近一次结果 + 趋势，用于目录页 */
  function overview() {
    return S.list().map(function (sc) {
      var h = history(sc.key);
      var last = h.length ? h[h.length - 1] : null;
      return {
        scale: sc,
        count: h.length,
        latest: last,
        level: last ? last.level : null,
        trend: h.length >= 2 ? SC.compare(h[h.length - 2], last) : null
      };
    });
  }

  /** 统计汇总 */
  function stats() {
    var rows = all();
    var crisis = rows.filter(function (r) {
      return r.crisis && r.crisis.level && r.crisis.level !== 'none';
    });
    return {
      total: rows.length,
      scales: U.unique(rows.map(function (r) { return r.scaleKey; })).length,
      covered: U.unique(rows.map(function (r) { return r.scaleKey; })).length + ' / ' + S.list().length,
      crisis: crisis.length,
      lastAt: rows.length ? rows[0].at : null
    };
  }

  /* ================================================================== *
   * 二、草稿（作答中途离开不丢进度）
   * ================================================================== */
  function draft(scaleKey) {
    var d = PHR.store.read(DRAFT_KEY, null);
    if (!d || !d.answers) { return null; }
    if (scaleKey && d.scaleKey !== scaleKey) { return null; }
    return d;
  }

  function saveDraft(scaleKey, answers) {
    PHR.store.write(DRAFT_KEY, { scaleKey: scaleKey, answers: answers, at: Date.now() });
  }

  function clearDraft() { PHR.store.drop(DRAFT_KEY); }

  /* ================================================================== *
   * 三、提交
   * ================================================================== */
  /**
   * 提交一份作答：计分 → 生成报告 → 入库 → 写审计 → 返回报告。
   * @param {string} scaleKey
   * @param {object} answers
   * @returns {{ok:boolean, message:string, report:object, crisis:object}}
   */
  function submit(scaleKey, answers) {
    var me = uid();
    if (!me) { return { ok: false, message: PHR.t('assessment.service.needLogin', '请先登录') }; }

    var check = SC.validate(scaleKey, answers);
    if (!check.ok) {
      return { ok: false, message: check.reason, missing: check.missing };
    }

    var built = RP.build(scaleKey, answers, { userId: me });
    if (!built) {
      return { ok: false, message: PHR.t('assessment.scoring.noScale', '量表不存在') };
    }

    var saved = PHR.db.assessments.insert({
      userId: me,
      scaleKey: built.scaleKey,
      scaleName: built.scaleName,
      total: built.total,
      max: built.max,
      percent: built.percent,
      raw: built.raw,
      transformed: built.transformed,
      level: built.level,
      dimensions: built.dimensions,
      items: built.items,
      critical: built.critical,
      crisis: built.crisis,
      coping: built.coping,
      recommends: built.recommends,
      noCutoff: built.noCutoff,
      source: built.source,
      disclaimer: built.disclaimer,
      at: built.at
    });

    built.id = saved.id;
    clearDraft();

    /* ---- 审计留痕 ---- */
    U.audit({
      action: 'assessment.submit',
      targetType: 'assessment',
      targetId: saved.id,
      targetName: PHR.t('assessment.audit.targetScore', '{name}（{total}/{max} 分）',
        { name: built.scaleName, total: built.total, max: built.max }),
      detail: PHR.t('assessment.audit.submitted', '完成{name}，结果落在「{level}」',
        { name: built.scaleName, level: built.level.name }),
      result: 'success'
    });

    /* ---- 危机识别留痕（独立于上一条，便于事后追溯系统是否提示过） ---- */
    CR.logDetection(scaleKey, built, built.crisis && built.crisis.level !== 'none'
      ? { level: built.crisis.level, reasons: built.crisis.reasons }
      : null);

    PHR.bus.emit('assessment:changed', { action: 'insert', id: saved.id, scaleKey: scaleKey });
    PHR.bus.emit('shell:refreshAlertBadge');

    return {
      ok: true,
      message: PHR.t('assessment.service.done', '测评已完成'),
      report: built,
      crisis: CR.detect(scaleKey, built)
    };
  }

  /** 删除一份测评 */
  function remove(id) {
    var row = byId(id);
    if (!row) { return { ok: false, message: PHR.t('assessment.service.recordGone', '记录不存在') }; }
    PHR.db.assessments.remove(id);
    U.audit({
      action: 'assessment.submit', targetType: 'assessment', targetId: id,
      targetName: row.scaleName,
      detail: PHR.t('assessment.audit.removed', '删除了一份心理测评记录'),
      result: 'success'
    });
    return { ok: true, message: PHR.t('assessment.deleted', '已删除') };
  }

  /* ================================================================== *
   * 四、医生授权视角（与 records 共用同一套判定实现）
   * ================================================================== */

  /**
   * 某条授权的心理测评可见性判定。
   * 逻辑在 core/security.js 的 canViewScoped，本处只提供 scopeKey。
   * 注意 scopeKey 是**字面量 'psych'**，不经过 categories.scopeOf()。
   */
  function canView(row, consent) {
    return PHR.security.canViewScoped(row, consent, SCOPE);
  }

  /**
   * 取某条授权可见的心理测评记录。
   * 对应 records 的 forConsent，但数据源是 assessments 集合。
   * 授权里没有 psych 范围时返回**空数组**。
   */
  function forConsent(consent) {
    if (!consent) { return []; }
    if ((consent.scopes || []).indexOf(SCOPE) < 0) { return []; }

    var rows = PHR.db.assessments.all().filter(function (r) {
      return PHR.security.canViewScoped(r, consent, SCOPE);
    });
    return U.sortBy(rows, 'at', true);
  }

  /** 当前用户有没有可供授权的心理测评（授权向导显示条数用） */
  function countFor(userId) {
    if (!userId) { return 0; }
    return PHR.db.assessments.all().filter(function (r) { return r.userId === userId; }).length;
  }

  /* ================================================================== *
   * 五、自检（计分正确性 + 安全断言）
   * ------------------------------------------------------------------
   * 本项目没有测试框架，把关键断言做成运行时可调用的自检，
   * 由隐藏页面 #/assessment-selftest 渲染成机器可读的标记，
   * 用 headless Chrome --dump-dom 即可验证。
   * ================================================================== */
  function selfTest() {
    var cases = [];
    function t(name, actual, expected) {
      var ok = JSON.stringify(actual) === JSON.stringify(expected);
      cases.push({ name: name, actual: actual, expected: expected, ok: ok });
    }

    /* ---------- 1) 反向计分（最容易写错、且不会报错的地方） ---------- */
    // PSS-10 全选 4（非常经常）：正向 6 题各 4 分＝24；反向 4 题各 (4-4)=0 分 → 24
    var pssAll4 = {}; for (var i = 1; i <= 10; i++) { pssAll4[i] = 4; }
    t(PHR.t('assessment.selftest.pssAll4', 'PSS-10 全选 4 → 24（反向题归零）'),
      SC.score('pss10', pssAll4).total, 24);

    // PSS-10 全选 1：正向 6×1=6；反向 4×(4-1)=12 → 18
    var pssAll1 = {}; for (var j = 1; j <= 10; j++) { pssAll1[j] = 1; }
    t(PHR.t('assessment.selftest.pssAll1', 'PSS-10 全选 1 → 18（反向题翻转）'),
      SC.score('pss10', pssAll1).total, 18);

    // PSS-10 全选 0：正向 0；反向 4×4=16 → 16
    var pssAll0 = {}; for (var k = 1; k <= 10; k++) { pssAll0[k] = 0; }
    t(PHR.t('assessment.selftest.pssAll0', 'PSS-10 全选 0 → 16'),
      SC.score('pss10', pssAll0).total, 16);

    /* ---------- 2) 极值：**不含反向题**的量表，全选两端应等于两端 ----------
       注意：PSS-10 有 4 道反向题，"全选最低 → 0 分"对它**不成立**
       （全选 0 时反向题各得 4 分，合计 16）。这类量表的极值单独在下面断言。 */
    S.list().filter(function (sc) {
      return !sc.items.some(function (it) { return it.reverse; });
    }).forEach(function (sc) {
      var lowest = {}, highest = {};
      sc.items.forEach(function (it) {
        var opts = it.options || sc.options;
        var vals = opts.map(function (o) { return o.value; });
        lowest[it.i] = U.min(vals);
        highest[it.i] = U.max(vals);
      });
      // 满分要取**换算后**的分值（WHO-5 原始 25 分要 ×4 才是满分 100）
      var full = sc.transform ? sc.transform.max : S.maxOf(sc.key);
      t(PHR.t('assessment.selftest.allLowest', '{scale} 全选最低值 → 0 分', { scale: sc.key }),
        SC.score(sc.key, lowest).total, 0);
      t(PHR.t('assessment.selftest.allHighest', '{scale} 全选最高值 → 满分 {full} 分',
        { scale: sc.key, full: full }),
        SC.score(sc.key, highest).total, full);
    });

    /* ---------- 3) ISI 第 4 题使用独立选项集 ---------- */
    t(PHR.t('assessment.selftest.isiOptValues', 'ISI 第 4 题选项分值为 0..4'),
      S.optionsOf('isi', 4).map(function (o) { return o.value; }), [0, 1, 2, 3, 4]);
    t(PHR.t('assessment.selftest.isiOptFirst', 'ISI 第 4 题首项文案为「非常满意」'),
      S.optionsOf('isi', 4)[0].label,
      /* 文案会跟随语言，因此期望值也用同一个词条取 —— 断言校验的是
         "第 4 题用的是满意度的选项集"，这一点与语言无关 */
      PHR.t('assessment.opt.satisfy5.0', '非常满意'));

    /* ---------- 4) WHO-5 线性换算 ---------- */
    var who = {}; for (var w = 1; w <= 5; w++) { who[w] = 5; }
    t(PHR.t('assessment.selftest.whoRaw', 'WHO-5 全选「一直」→ 原始 25'),
      SC.score('who5', who).raw, 25);
    t(PHR.t('assessment.selftest.whoTotal', 'WHO-5 全选「一直」→ 换算 100'),
      SC.score('who5', who).total, 100);

    /* ---------- 5) 未答校验：绝不能把"没答"当成 0 分 ---------- */
    t(PHR.t('assessment.selftest.missingOk', '缺 1 题 → ok=false'),
      SC.validate('phq9', { 1: 0, 2: 0, 3: 0 }).ok, false);
    t(PHR.t('assessment.selftest.missingList', '缺 1 题 → missing 列出题号'),
      SC.validate('phq9', { 1: 0, 2: 0, 3: 0 }).missing.length, 6);

    /* ---------- 6) 分级边界 ---------- */
    // PHQ-9：4→未见、5→轻度、10→中度、20→重度
    function phqTotal(n) {
      var a = {}, left = n;
      for (var q = 1; q <= 9; q++) { var v = Math.min(3, left); a[q] = v; left -= v; }
      return SC.score('phq9', a).level.key;
    }
    function phqName(n) {
      return PHR.t('assessment.selftest.phqBoundary', 'PHQ-9 总分 {total} → {level}',
        { total: n, level: phqTotal(n) });
    }
    t(phqName(4), phqTotal(4), 'none');
    t(phqName(5), phqTotal(5), 'mild');
    t(phqName(10), phqTotal(10), 'moderate');
    t(PHR.t('assessment.selftest.phqBoundarySevere', 'PHQ-9 总分 20 → severe（症状负担重）'),
      phqTotal(20), 'severe');

    /* ---------- 7) 危机识别（安全断言） ---------- */
    function crisisLevel(answers) {
      var res = SC.score('phq9', answers);
      return CR.detect('phq9', res).level;
    }
    var zero = {}; for (var z = 1; z <= 9; z++) { zero[z] = 0; }
    t(PHR.t('assessment.selftest.item9Zero', 'PHQ-9 第9题=0 → none'), crisisLevel(zero), 'none');
    var one = Object.assign({}, zero); one[9] = 1;
    t(PHR.t('assessment.selftest.item9One', 'PHQ-9 第9题=1 → watch（不打断）'), crisisLevel(one), 'watch');
    var two = Object.assign({}, zero); two[9] = 2;
    t(PHR.t('assessment.selftest.item9Two', 'PHQ-9 第9题=2 → urgent'), crisisLevel(two), 'urgent');
    var three = Object.assign({}, zero); three[9] = 3;
    t(PHR.t('assessment.selftest.item9Three', 'PHQ-9 第9题=3 → urgent'), crisisLevel(three), 'urgent');

    // 总分 20 但第 9 题为 0：属"症状负担重"，应为 watch 而非 urgent
    var hiNoCrit = {}, left = 20;
    for (var q = 1; q <= 9; q++) {
      if (q === 9) { hiNoCrit[q] = 0; continue; }
      var v = Math.min(3, left); hiNoCrit[q] = v; left -= v;
    }
    t(PHR.t('assessment.selftest.highNoCritical', 'PHQ-9 总分高但无自伤条目 → watch（不误报危机）'),
      crisisLevel(hiNoCrit), 'watch');

    // 快速筛查满分必须也能触发危机通路（否则最低门槛的入口反而拿不到帮助）
    var qmax = {}; for (var qq = 1; qq <= 5; qq++) { qmax[qq] = 3; }
    var qres = SC.score('quick', qmax);
    t(PHR.t('assessment.selftest.quickUrgent', '快速筛查抑郁维度满分 → urgent'),
      CR.detect('quick', qres).level, 'urgent');

    /* ---------- 8) 安全断言：越权路径必须被堵死 ---------- */
    var fakeRow = { id: 'E000001', userId: 'U000001', scaleKey: 'phq9', total: 12 };
    var foreignRow = { id: 'E000002', userId: 'U999999', scaleKey: 'phq9', total: 12 };
    var consentBasic = { userId: 'U000001', scopes: ['basic', 'lab'], recordIds: [] };
    var consentPsych = { userId: 'U000001', scopes: ['basic', 'psych'], recordIds: [] };

    // ① 医生视角：只有 basic 范围的授权，看不到心理报告
    t(PHR.t('assessment.selftest.canViewNoPsych', 'canView：授权不含 psych 范围 → false'),
      PHR.security.canViewScoped(fakeRow, consentBasic, 'psych'), false);

    // ② 医生视角：越权访问他人数据
    t(PHR.t('assessment.selftest.canViewForeign', 'canView：他人授权访问本人数据 → false'),
      PHR.security.canViewScoped(fakeRow,
        { userId: 'U999999', scopes: ['psych'], recordIds: [] }, 'psych'), false);

    // ③ 医生视角：含 psych 范围则可以看
    t(PHR.t('assessment.selftest.canViewPsych', 'canView：授权含 psych 范围 → true'),
      PHR.security.canViewScoped(fakeRow, consentPsych, 'psych'), true);

    // ④ 医生视角：授权指定了别的记录 id，则这一条不放开
    t(PHR.t('assessment.selftest.canViewOtherRecord', 'canView：授权限定为其它记录 → false'),
      PHR.security.canViewScoped(fakeRow,
        { userId: 'U000001', scopes: ['psych'], recordIds: ['E000009'] }, 'psych'), false);

    // ⑤ 本人视角：无授权时只能看自己的
    t(PHR.t('assessment.selftest.canViewNoConsent', 'canView：无授权 + 他人数据 → false'),
      PHR.security.canViewScoped(foreignRow, null, 'psych'), false);

    /* ---------- 9) 心理数据绝不能出现在 records 集合里 ---------- */
    t(PHR.t('assessment.selftest.notInRecords', 'records 集合里没有心理测评数据'),
      PHR.db.records.all().filter(function (r) {
        return r.type === 'psych' || r.type === 'assessment';
      }).length, 0);

    /* ---------- 10) 无身份时不得返回全库数据 ----------
       这是修掉真实越权漏洞时立的约束，必须一直守着。
       做法：临时把会话替换成"没有 userId"的桩，断言 all() 返回空数组。 */
    var realSession = PHR.session;
    try {
      PHR.session = { userId: function () { return ''; } };
      t(PHR.t('assessment.selftest.noIdentityAll', '无身份（未登录/医生访客）时 all() 返回空数组'),
        all().length, 0);
      t(PHR.t('assessment.selftest.noIdentityById', '无身份时 byId() 拒绝返回数据'),
        byId('E000001'), null);
    } finally {
      PHR.session = realSession;
    }

    var passed = cases.filter(function (c) { return c.ok; }).length;
    return { cases: cases, passed: passed, total: cases.length, ok: passed === cases.length };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.assessment.service = {
    all: all,
    byId: byId,
    list: all,
    history: history,
    latest: latest,
    trend: trend,
    overview: overview,
    stats: stats,

    draft: draft,
    saveDraft: saveDraft,
    clearDraft: clearDraft,

    submit: submit,
    remove: remove,

    canView: canView,
    forConsent: forConsent,
    countFor: countFor,

    selfTest: selfTest,
    SCOPE: SCOPE
  };

  /* 平铺到 PHR.assessment 上，便于 PHR.assessment.all() 这类写法 */
  Object.keys(PHR.assessment.service).forEach(function (k) {
    if (PHR.assessment[k] === undefined) { PHR.assessment[k] = PHR.assessment.service[k]; }
  });

})(window.PHR);
