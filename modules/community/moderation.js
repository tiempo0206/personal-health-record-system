/**
 * ============================================================================
 * 文件：modules/community/moderation.js
 * 层：业务模块层（患者社群 —— 模块 7）
 * 职责：社群内容审核。提供内置的医疗广告 / 敏感词词库、命中检测、打码，
 *      以及举报记录与帖子状态流转（normal / hidden / removed）。
 *
 * 为什么要拦这些词：
 *   患者社群的特殊风险在于"病友经验"极容易被误当成"医疗建议"。虚假医疗
 *   广告常用的套路是 —— 承诺疗效（包治百病 / 根治 / 永不复发）、制造稀缺
 *   （神药 / 祖传秘方 / 无效退款）、把交易引流到私域（加微信 / 私聊卖），
 *   以及劝人放弃正规治疗（不用去医院 / 停药就好）。这些内容一旦传播，
 *   轻则延误就诊，重则造成不可逆的伤害，因此平台必须在发布环节就拦下来。
 *
 * 重要说明：
 *   本模块是本地关键词审核 —— 词库硬编码在前端，可被绕过，
 *   只用于展示"发布前拦截"这一交互。真实产品必须改为
 *   服务端审核（模型 + 规则）+ 人工复核 + 申诉通道，并且审核记录要可追溯。
 * 依赖：core/namespace.js、core/dict.js、core/utils.js、core/store.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  var community = PHR.community = PHR.community || {};

  /* ================================================================== *
   * 一、词库
   *    level = 'block' 直接拒绝发布；level = 'warn' 允许发布但提示用户，
   *    并留给人工复核。why 用于向用户解释"为什么被拦"。
   * ================================================================== */
  /* 说明：why 用访问器（get）延迟取词。
     本词库在**脚本加载时**求值，而语言探测 PHR.i18n.detect() 要到
     core/boot.js 才执行 —— 若在此处直接调用 PHR.t，取到的永远是中文兜底
     并被固化下来，切到英文也不会变。改为 get 后，取词推迟到真正读取 why
     的那一刻（命中提示、审核记录展示），语言切换即可跟随。
     ⚠️ w（关键词）与 level（等级）是拦截规则本身，不是文案，绝不翻译。 */
  var RULES = [
    /* --- 虚假疗效承诺（block） --- */
    { w: '包治百病', level: 'block', get why() { return PHR.t('community.rule.packageCure', '承诺包治百病属于虚假宣传'); } },
    { w: '根治',     level: 'block', get why() { return PHR.t('community.rule.radicalCure', '医疗上极少有可以"根治"的疾病，此类表述会误导病友'); } },
    { w: '彻底治愈', level: 'block', get why() { return PHR.t('community.rule.totalCure', '治愈结论只能由医生依据检查结果判断'); } },
    { w: '药到病除', level: 'block', get why() { return PHR.t('community.rule.instantCure', '虚假疗效承诺'); } },
    { w: '永不复发', level: 'block', get why() { return PHR.t('community.rule.neverRelapse', '虚假疗效承诺'); } },
    { w: '不再吃药', level: 'block', get why() { return PHR.t('community.rule.stopMeds', '劝人停药存在严重安全风险'); } },
    { w: '不用去医院', level: 'block', get why() { return PHR.t('community.rule.skipHospital', '劝阻正规就医存在严重安全风险'); } },
    { w: '医院都是骗钱的', level: 'block', get why() { return PHR.t('community.rule.hospitalScam', '诋毁正规医疗机构，可能延误他人就诊'); } },
    { w: '治愈率百分之百', level: 'block', get why() { return PHR.t('community.rule.cureRateFull', '虚假疗效承诺'); } },
    { w: '百分百有效', level: 'block', get why() { return PHR.t('community.rule.alwaysEffective', '虚假疗效承诺'); } },
    { w: '一粒见效',   level: 'block', get why() { return PHR.t('community.rule.onePill', '夸大疗效的广告话术'); } },

    /* --- 神药 / 偏方推销（block） --- */
    { w: '神药',     level: 'block', get why() { return PHR.t('community.rule.miracleDrug', '推销"神药"是典型的虚假医疗广告'); } },
    { w: '特效药',   level: 'block', get why() { return PHR.t('community.rule.specialDrug', '处方药不得私自推荐与交易'); } },
    { w: '祖传秘方', level: 'block', get why() { return PHR.t('community.rule.ancestralRecipe', '无批准文号的"秘方"无法保证安全'); } },
    { w: '偏方治大病', level: 'block', get why() { return PHR.t('community.rule.folkCure', '以偏方替代正规治疗存在风险'); } },
    { w: '抗癌神方', level: 'block', get why() { return PHR.t('community.rule.cancerFormula', '肿瘤治疗必须在医生指导下进行'); } },
    { w: '纯天然无副作用', level: 'block', get why() { return PHR.t('community.rule.noSideEffect', '"无副作用"是虚假宣传，任何药物都有不良反应'); } },
    { w: '保健品能治病', level: 'block', get why() { return PHR.t('community.rule.supplementCure', '保健食品不能替代药品与治疗'); } },
    { w: '无效退款', level: 'block', get why() { return PHR.t('community.rule.refundPitch', '以"退款承诺"诱导购买属于广告营销话术'); } },
    { w: '一试就灵', level: 'block', get why() { return PHR.t('community.rule.worksFirstTry', '夸大疗效的广告话术'); } },

    /* --- 私域引流 / 交易（block） --- */
    { w: '加微信',   level: 'block', get why() { return PHR.t('community.rule.addWechat', '社群内不允许引流到私域进行药品交易'); } },
    { w: '加我微信', level: 'block', get why() { return PHR.t('community.rule.addMyWechat', '社群内不允许引流到私域进行药品交易'); } },
    { w: '私聊卖',   level: 'block', get why() { return PHR.t('community.rule.dmSell', '禁止在社群内买卖药品'); } },
    { w: '私信我买', level: 'block', get why() { return PHR.t('community.rule.dmBuy', '禁止在社群内买卖药品'); } },
    { w: '微商',     level: 'block', get why() { return PHR.t('community.rule.wechatSeller', '禁止微商推广'); } },
    { w: '代购',     level: 'block', get why() { return PHR.t('community.rule.drugSourcing', '禁止代购药品与境外处方药'); } },
    { w: '低价出药', level: 'block', get why() { return PHR.t('community.rule.cheapDrugs', '禁止转卖药品'); } },
    { w: '扫码购买', level: 'block', get why() { return PHR.t('community.rule.qrBuy', '禁止发布购买链接与二维码'); } },
    { w: '联系我买', level: 'block', get why() { return PHR.t('community.rule.contactToBuy', '禁止发布交易联系方式'); } },

    /* --- 需要人工复核的表述（warn） --- */
    { w: '偏方',     level: 'warn', get why() { return PHR.t('community.rule.folkRemedy', '偏方未经证实，建议同时标注"请遵医嘱"'); } },
    { w: '秘方',     level: 'warn', get why() { return PHR.t('community.rule.secretRemedy', '秘方未经审批，来源无法核实'); } },
    { w: '土方',     level: 'warn', get why() { return PHR.t('community.rule.homeRemedy', '土方未经证实，请注意安全'); } },
    { w: '自己加大剂量', level: 'warn', get why() { return PHR.t('community.rule.selfIncreaseDose', '自行调整剂量存在风险'); } },
    { w: '自己减量', level: 'warn', get why() { return PHR.t('community.rule.selfReduceDose', '药物调整应由医生决定'); } },
    { w: '网上说能治', level: 'warn', get why() { return PHR.t('community.rule.saidOnline', '来源不明的信息需要核实'); } },
    { w: '据说能治', level: 'warn', get why() { return PHR.t('community.rule.heardItCures', '来源不明的信息需要核实'); } },
    { w: '别听医生的', level: 'warn', get why() { return PHR.t('community.rule.ignoreDoctor', '不应引导他人违背医嘱'); } }
  ];

  function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ================================================================== *
   * 二、检测与打码
   * ================================================================== */

  /**
   * 检测一段文本是否命中词库（大小写不敏感）。
   * @param {string} text
   * @returns {{ok:boolean, hits:string[], level:'ok'|'warn'|'block',
   *            reasons:Array<{word,level,why}>}}
   */
  function check(text) {
    var s = String(text === null || text === undefined ? '' : text);
    var lower = s.toLowerCase();
    var hits = [];
    var reasons = [];
    var level = 'ok';

    RULES.forEach(function (r) {
      if (lower.indexOf(r.w.toLowerCase()) < 0) { return; }
      hits.push(r.w);
      reasons.push({ word: r.w, level: r.level, why: r.why });
      if (r.level === 'block') { level = 'block'; }
      else if (level !== 'block') { level = 'warn'; }
    });

    return { ok: level === 'ok', hits: hits, level: level, reasons: reasons };
  }

  /** 把命中的敏感词替换成 ***（用于列表预览与审核记录展示） */
  function mask(text) {
    var s = String(text === null || text === undefined ? '' : text);
    RULES.forEach(function (r) {
      s = s.replace(new RegExp(escapeReg(r.w), 'gi'), '***');
    });
    return s;
  }

  /**
   * 生成一句给用户看的提示语：说明命中了什么、为什么要拦。
   * @param {object} verdict check() 的返回值
   */
  function explain(verdict) {
    if (!verdict || verdict.level === 'ok') { return ''; }
    var head = verdict.level === 'block'
      ? PHR.t('community.explain.blocked', '内容包含平台禁止发布的表述：')
      : PHR.t('community.explain.warned', '内容中包含需要提醒的表述：');
    var first = (verdict.reasons || [])[0];
    var tail = first ? PHR.t('community.explain.why', '（{why}）', { why: first.why }) : '';
    return head + verdict.hits.slice(0, 3).join(PHR.t('community.listSep', '、')) + tail;
  }

  /* ================================================================== *
   * 三、举报记录（本地存储）
   * ================================================================== */
  var REPORT_KEY = 'community_reports';
  var AUTO_HIDE_THRESHOLD = 3;      // 同一帖子被举报达到该数量后自动隐藏待复核

  /* 举报原因（下拉候选项）。name 同样用访问器延迟取词，理由见上文词库的说明。
     key 是举报状态的内部标识，不翻译。 */
  var REPORT_REASONS = [
    { key: 'ad',      get name() { return PHR.t('community.reportReason.ad', '医疗广告 / 推销引流'); } },
    { key: 'fake',    get name() { return PHR.t('community.reportReason.fake', '虚假或误导性医疗信息'); } },
    { key: 'abuse',   get name() { return PHR.t('community.reportReason.abuse', '辱骂 / 攻击他人'); } },
    { key: 'privacy', get name() { return PHR.t('community.reportReason.privacy', '泄露他人隐私'); } },
    { key: 'other',   get name() { return PHR.t('community.reportReason.other', '其他不当内容'); } }
  ];

  function readReports() {
    try { return PHR.store.read(REPORT_KEY, []) || []; } catch (e) { return []; }
  }

  function writeReports(list) {
    try { PHR.store.write(REPORT_KEY, list); } catch (e) { PHR.warn(PHR.t('community.warn.reportWriteFail', '举报记录写入失败'), e); }
  }

  /** 举报原因候选项（供表单下拉使用） */
  function reasons() { return REPORT_REASONS.slice(); }

  /**
   * 提交一条举报。
   * 说明：举报记录先存在本地（PHR.store），便于呈现"举报—复核—处理"的闭环；
   *      同一帖子被举报达到阈值时会自动置为 hidden，等待人工复核。
   * @param {string} postId
   * @param {string} reason 举报原因 key
   * @param {object} [opt]  { note, reporterId, reporter }
   * @returns {object} 举报记录
   */
  function report(postId, reason, opt) {
    opt = opt || {};
    var list = readReports();
    var count = list.filter(function (r) { return r.postId === postId; }).length + 1;
    var row = {
      id: U.uid('RP'),
      postId: postId,
      reason: reason || 'other',
      reasonName: D.nameOf(REPORT_REASONS, reason || 'other'),
      note: String(opt.note || '').slice(0, 200),
      reporterId: opt.reporterId || '',
      reporter: opt.reporter || PHR.t('community.anonymousUser', '匿名用户'),
      handled: false,
      totalForPost: count,
      at: Date.now()
    };
    list.push(row);
    writeReports(list);

    if (count >= AUTO_HIDE_THRESHOLD) {
      setStatus(postId, 'hidden',
        PHR.t('community.moderation.autoHideReason', '被举报 {n} 次，等待人工复核', { n: count }));
    }
    return row;
  }

  /** 全部举报记录（按时间倒序） */
  function reports() {
    return U.sortBy(readReports(), 'at', true);
  }

  /* ================================================================== *
   * 四、帖子状态流转
   * ================================================================== */
  var STATUS = ['normal', 'hidden', 'removed'];

  /**
   * 把帖子标记为 normal / hidden / removed。
   * 只做数据变更，不发审计（审计由 PHR.community.service 统一写，
   * 避免同一次操作产生两条日志）。
   * @param {string} postId
   * @param {string} status
   * @param {string} [reason]
   * @returns {object|null} 更新后的帖子
   */
  function setStatus(postId, status, reason) {
    if (STATUS.indexOf(status) < 0) {
      PHR.warn(PHR.t('community.warn.unknownStatus', '未知的社群内容状态：{status}', { status: status }));
      return null;
    }
    var post = null;
    try { post = PHR.db.posts.byId(postId); } catch (e) { post = null; }
    if (!post) { return null; }
    return PHR.db.posts.update(postId, {
      status: status,
      statusReason: String(reason || '').slice(0, 120),
      statusAt: Date.now()
    });
  }

  /** 帖子当前状态（仓储不可用时按 normal 处理） */
  function statusOf(postId) {
    try {
      var p = PHR.db.posts.byId(postId);
      return p ? (p.status || 'normal') : 'normal';
    } catch (e) { return 'normal'; }
  }

  /* ================================================================== *
   * 五、挂载
   * ================================================================== */
  community.moderation = {
    rules: RULES,
    reasons: reasons,
    check: check,
    mask: mask,
    explain: explain,
    report: report,
    reports: reports,
    setStatus: setStatus,
    statusOf: statusOf,
    STATUS: STATUS,
    autoHideThreshold: AUTO_HIDE_THRESHOLD,
    /** 审核能力说明：给界面/说明书展示用的自述（访问器延迟取词，理由见上文词库说明） */
    get disclaimer() {
      return PHR.t('community.moderation.disclaimer',
        '本社群的审核采用本地关键词过滤，仅能拦截明显的医疗广告与敏感表述，' +
        '不代表内容已经过专业审核。任何健康决策请以医生的当面诊断为准。');
    }
  };

})(window.PHR);
