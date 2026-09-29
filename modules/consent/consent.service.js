/**
 * ============================================================================
 * 文件：modules/consent/consent.service.js
 * 层：业务模块层（医生授权 —— 模块 5）
 * 职责：医生授权的完整生命周期 —— 创建 grant、凭码校验 verifyCode、范围与单条
 *      可见性判定 canAccess / recordAccess、延长 extend、撤销 revoke、到期回收
 *      sweepExpired、统计 stats 与活动日志 activity。患者页面与医生受限视图共用
 *      本文件，因此"能不能看"全系统只有一处判定逻辑，不可能被旁路。
 * 依赖：core/models.js、core/crypto.js、core/store.js、modules/consent/scope.js、
 *      modules/audit（防御式调用）
 * ============================================================================
 */
(function (PHR) {
  'use strict';
  var U = PHR.util, S = PHR.consent.scope, DAY = 86400000;
  var SWEEP_KEY = 'consent.swept';                                 // 已写过到期日志的授权 id
  var RANK = { active: 0, pending: 1, expired: 2, revoked: 3 };    // 列表排序：生效中永远最前
  /** 审计一律防御式调用：审计模块缺失时业务动作照常完成 */
  function audit(entry) { U.audit(entry); }
  /** 当前患者本人的授权（未登录 / 医生访客模式下返回空数组） */
  function mine() {
    var uid = PHR.session.userId();
    return uid ? PHR.db.consents.all().filter(function (c) { return c.userId === uid; }) : [];
  }
  /** 给一条授权补上运行时状态与派生字段 */
  function decorate(c) {
    var left = c.expireAt - Date.now();
    /* 医生姓名 / 职称 / 用途 / 撤销原因都是种子文本，按当前语言解析 */
    var base = PHR.models.localize(c, ['doctorName', 'doctorTitle', 'purpose', 'revokeReason', 'note']);
    return Object.assign({}, base, {
      runtimeStatus: PHR.models.consent.effectiveStatus(c),
      daysLeft: Math.max(0, Math.ceil(left / DAY)),
      hoursLeft: Math.max(0, Math.floor(left / 3600000)),
      scopeNames: (c.scopes || []).map(function (k) { return S.nameOf(k); })
    });
  }
  /** 授权列表；filter 支持 {status, keyword} */
  function list(filter) {
    filter = filter || {};
    var rows = mine().map(decorate);
    if (filter.status && filter.status !== 'all') {
      rows = rows.filter(function (r) { return r.runtimeStatus === filter.status; });
    }
    if (filter.keyword) {
      var k = String(filter.keyword).toLowerCase();
      rows = rows.filter(function (r) {
        return [r.doctorName, r.hospital, r.department, r.purpose, r.code].join(' ').toLowerCase().indexOf(k) >= 0;
      });
    }
    return rows.sort(function (a, b) {
      if (RANK[a.runtimeStatus] !== RANK[b.runtimeStatus]) { return RANK[a.runtimeStatus] - RANK[b.runtimeStatus]; }
      return b.expireAt - a.expireAt;
    });
  }
  function byId(id) { return PHR.db.consents.byId(id) || null; }
  /** 授权码归一化：去分隔符 + 转大写，医生漏输连字符或输小写都能命中 */
  function normalizeCode(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function byCode(code) {
    var key = normalizeCode(code);
    if (!key) { return null; }
    return PHR.db.consents.all().filter(function (c) { return normalizeCode(c.code) === key; })[0] || null;
  }
  /* --------------------------- 创建 / 延长 / 撤销 --------------------------- */
  /** 创建一条授权；input 的字段见 README「对外 API」 */
  function grant(input) {
    input = input || {};
    var errors = {};
    var maxDays = PHR.config.consentMaxDays;
    var scopes = S.sanitize(input.scopes);
    if (!scopes.length) { errors.scopes = PHR.t('consent.err.scopesRequired', '请至少选择一个授权范围'); }
    if (!String(input.doctorName || '').trim()) { errors.doctorName = PHR.t('consent.err.doctorNameRequired', '请填写医生姓名'); }
    var days = Number(input.days || 7), expireAt = 0;
    if (input.customExpireAt) {
      expireAt = U.parseDate(input.customExpireAt);
      if (isNaN(expireAt)) { errors.customExpireAt = PHR.t('consent.err.expireInvalid', '请选择有效的截止日期'); }
      else if (expireAt + 86399000 <= Date.now()) { errors.customExpireAt = PHR.t('consent.err.expirePast', '截止日期必须晚于今天'); }
      else if (expireAt - Date.now() > maxDays * DAY) {
        errors.customExpireAt = PHR.t('consent.err.maxDays', '有效期最长 {n} 天', { n: maxDays });
      }
      else { expireAt += 86399000; }     // 自定义日期按当天 23:59 失效，与"还剩几天"的直觉一致
    } else if (!(days >= 1 && days <= maxDays)) {
      errors.days = PHR.t('consent.err.daysRange', '有效期需在 1~{n} 天之间', { n: maxDays });
    }
    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, consent: null, message: PHR.t('consent.err.checkInput', '请检查填写内容') };
    }
    var saved = PHR.db.consents.insert(PHR.models.consent.create({
      userId: PHR.session.userId(),
      doctorName: String(input.doctorName).trim(), doctorTitle: input.doctorTitle || '',
      hospital: input.hospital || '', department: input.department || '',
      licenseNo: input.licenseNo || '', purpose: input.purpose || '',
      scopes: scopes, recordIds: input.recordIds || [], note: input.note || '',
      expireAt: expireAt || U.addDays(Date.now(), days)
    }));
    var cov = S.coverage(scopes);
    audit({
      action: 'consent.grant', targetType: 'consent', targetId: saved.id,
      targetName: PHR.t('consent.audit.grantTarget', '授权给 {name}{title}',
        { name: saved.doctorName, title: saved.doctorTitle ? ' ' + saved.doctorTitle : '' }),
      detail: PHR.t('consent.audit.grantDetail',
        '范围：{scopes}；有效期 {days} 天（至 {until}）；覆盖 {hit}/{total} 条记录；授权码 {code}',
        {
          scopes: S.describe(scopes),
          days: Math.round((saved.expireAt - saved.startAt) / DAY),
          until: U.fmtDate(saved.expireAt),
          hit: cov.records, total: cov.total,
          code: saved.code
        }),
      result: 'success'
    });
    return { ok: true, errors: {}, consent: saved, coverage: cov,
      message: PHR.t('consent.msg.granted', '授权已创建，请把授权码发给医生') };
  }
  /** 撤销：终态。医生端立刻失效，且此后不可延长 */
  function revoke(id, reason) {
    var c = byId(id);
    if (!c) { return { ok: false, message: PHR.t('consent.err.notFound', '授权不存在或已被删除') }; }
    if (c.status === 'revoked') { return { ok: false, message: PHR.t('consent.err.alreadyRevoked', '该授权已经处于撤销状态') }; }
    var saved = PHR.db.consents.update(id, {
      status: 'revoked', revokedAt: Date.now(),
      revokeReason: reason || PHR.t('consent.revoke.reasonDefault', '用户主动撤销')
    });
    audit({
      action: 'consent.revoke', targetType: 'consent', targetId: id,
      targetName: PHR.t('consent.audit.revokeTarget', '撤销对 {name} 的授权', { name: c.doctorName }),
      detail: PHR.t('consent.audit.revokeDetail', '原因：{reason}（该医生将立即无法再访问档案）',
        { reason: reason || PHR.t('consent.revoke.reasonDefault', '用户主动撤销') }),
      result: 'success'
    });
    return { ok: true, consent: saved,
      message: PHR.t('consent.msg.revoked', '已撤销，医生将立即无法访问您的档案') };
  }
  /** 延长有效期：已过期的可以拉回生效中，已撤销的不能 */
  function extend(id, days) {
    var c = byId(id);
    if (!c) { return { ok: false, message: PHR.t('consent.err.notFoundPlain', '授权不存在') }; }
    if (c.status === 'revoked') {
      return { ok: false, message: PHR.t('consent.err.revokedCannotExtend', '已撤销的授权不能延长，请重新创建一条') };
    }
    days = Number(days || 0);
    var max = PHR.config.consentMaxDays;
    if (!(days >= 1 && days <= max)) {
      return { ok: false, message: PHR.t('consent.err.extendRange', '延长天数需在 1~{n} 天之间', { n: max }) };
    }
    var expireAt = Math.max(c.expireAt, Date.now()) + days * DAY;
    var saved = PHR.db.consents.update(id, { expireAt: expireAt, status: 'active' });
    audit({
      action: 'consent.grant', targetType: 'consent', targetId: id,
      targetName: PHR.t('consent.audit.extendTarget', '延长对 {name} 的授权', { name: c.doctorName }),
      detail: PHR.t('consent.audit.extendDetail', '有效期延长 {days} 天：{from} → {to}',
        { days: days, from: U.fmtDate(c.expireAt), to: U.fmtDate(expireAt) }),
      result: 'success'
    });
    return { ok: true, consent: saved,
      message: PHR.t('consent.msg.extended', '有效期已延长至 {until}', { until: U.fmtDate(expireAt) }) };
  }
  /* --------------------------- 医生入口：校验授权码 ---------------------------
   * 返回契约被 modules/auth/auth.view.js 依赖，不可更改：
   *   { ok:boolean, message:string, consent?:object, doctor?:object }
   * doctor 必须含 { name, title, hospital, department, licenseNo }。
   * ----------------------------------------------------------------------- */
  function verifyCode(code, doctorInfo) {
    doctorInfo = doctorInfo || {};
    var c = byCode(code);
    if (!c) { return { ok: false, message: PHR.t('consent.verify.notFound', '授权码不存在，请核对后重试（注意区分字母与数字）') }; }
    var st = PHR.models.consent.effectiveStatus(c);
    if (st === 'revoked') { return { ok: false, message: PHR.t('consent.verify.revoked', '该授权已被患者撤销，无法再访问档案') }; }
    if (st === 'expired') {
      return { ok: false, message: PHR.t('consent.verify.expired', '该授权已于 {at} 过期，请让患者重新授权', { at: U.fmtDate(c.expireAt) }) };
    }
    if (st === 'pending') {
      return { ok: false, message: PHR.t('consent.verify.pending', '该授权尚未生效（生效时间 {at}）', { at: U.fmtDateTime(c.startAt) }) };
    }
    var name = String(doctorInfo.name || '').trim();
    if (!name) { return { ok: false, message: PHR.t('consent.verify.nameRequired', '请填写您的姓名，用于访问留痕') }; }
    // 机构与科室以患者授权时登记的为准；姓名 / 职称 / 执业证号允许医生自己补全
    var doctor = {
      name: name, title: doctorInfo.title || c.doctorTitle || '',
      hospital: c.hospital || '', department: c.department || '',
      licenseNo: doctorInfo.licenseNo || c.licenseNo || ''
    };
    audit({
      action: 'consent.verify', targetType: 'consent', targetId: c.id,
      userId: c.userId,                                  // 归属到患者，保证他能在访问追踪里看到
      targetName: name, actor: name, actorType: 'doctor',
      detail: PHR.t('consent.audit.verifyDetail', '医生凭授权码验证通过，进入受限视图（本次授权范围：{scopes}）',
        { scopes: S.describe(c.scopes) }),
      result: 'success'
    });
    return { ok: true, message: PHR.t('consent.verify.ok', '验证通过，您正在以受限身份查看档案'), consent: c, doctor: doctor };
  }
  /* ------------------------------- 到期回收 -------------------------------
   * 授权在库里始终是 active，由 effectiveStatus 实时判定是否过期；本方法只把
   * "已经过期"这件事写进日志，且每条授权只写一次（已处理的 id 记在 PHR.store 里，
   * core/boot.js 每次启动都会调用它）。
   * -------------------------------------------------------------------- */
  function sweepExpired() {
    var swept = PHR.store.read(SWEEP_KEY, []) || [];
    var n = 0;
    PHR.db.consents.all().forEach(function (c) {
      if (c.status !== 'active' || Date.now() <= c.expireAt) { return; }
      if (swept.indexOf(c.id) >= 0) { return; }
      swept.push(c.id);
      n++;
      audit({
        action: 'consent.expired', targetType: 'consent', targetId: c.id,
        userId: c.userId, actor: PHR.t('consent.actor.system', '系统'), actorType: 'system',
        targetName: PHR.t('consent.audit.grantTarget', '授权给 {name}{title}',
          { name: c.doctorName, title: '' }),
        detail: PHR.t('consent.audit.expiredDetail', '授权已于 {at} 到期，系统自动失效（医生端立即失去访问权限）',
          { at: U.fmtDate(c.expireAt) }),
        result: 'success'
      });
    });
    if (n) { PHR.store.write(SWEEP_KEY, swept); }
    return n;
  }
  /* --------------------------- 可见性判定与访问留痕 --------------------------- */
  /** 该授权是否覆盖某个范围 —— 医生视图与越权阻断提示都以它为准 */
  function canAccess(consent, scopeKey) {
    if (!consent || !scopeKey) { return false; }
    return (consent.scopes || []).indexOf(scopeKey) >= 0;
  }
  /** 写一条访问日志：允许 → consent.access，拒绝 → consent.denied */
  function recordAccess(consent, opt) {
    opt = opt || {};
    if (!consent) { return { ok: false, allowed: false }; }
    var allowed = opt.allowed !== false;
    var doctor = (PHR.session.currentDoctor && PHR.session.currentDoctor()) || null;
    var scopeName = S.nameOf(opt.scopeKey);
    var recordPart = opt.recordName
      ? PHR.t('consent.audit.recordPart', '：{name}', { name: opt.recordName })
      : '';
    audit({
      action: allowed ? 'consent.access' : 'consent.denied',
      targetType: 'consent', targetId: consent.id,
      userId: consent.userId,                            // 归属到患者，医生视图写的日志也要能被患者看到
      targetName: PHR.t('consent.audit.accessTarget', '授权给 {name}（{scope}）',
        { name: consent.doctorName, scope: scopeName }),
      detail: allowed
        ? PHR.t('consent.audit.accessAllowed', '查阅了「{scope}」{record}',
            { scope: scopeName, record: recordPart })
        : PHR.t('consent.audit.accessDenied', '尝试查阅未授权内容「{scope}」{record}（该范围不在授权清单内，访问已被系统阻断）',
            { scope: scopeName, record: recordPart }),
      result: allowed ? 'success' : 'denied',
      actor: (doctor && doctor.name) || consent.doctorName || PHR.t('consent.actor.doctor', '医生'),
      actorType: 'doctor'
    });
    if (allowed) {
      // 重新读一遍，避免同一批渲染里拿着旧对象反复覆盖导致计数少算
      var fresh = byId(consent.id) || consent;
      PHR.db.consents.update(consent.id, { accessCount: (fresh.accessCount || 0) + 1, lastAccessAt: Date.now() });
    }
    return { ok: true, allowed: allowed };
  }
  /* --------------------------------- 统计 --------------------------------- */
  function stats() {
    var rows = mine().map(decorate);
    var docs = {}, spanSum = 0, accessTotal = 0;
    rows.forEach(function (r) {
      docs[r.doctorName] = true;
      spanSum += Math.max(0, r.expireAt - r.startAt);
      accessTotal += r.accessCount || 0;
    });
    function count(st) { return rows.filter(function (r) { return r.runtimeStatus === st; }).length; }
    return {
      total: rows.length,
      active: count('active'), pending: count('pending'), expired: count('expired'), revoked: count('revoked'),
      doctors: Object.keys(docs).length,
      avgDays: rows.length ? Math.round(spanSum / rows.length / DAY * 10) / 10 : 0,
      accessTotal: accessTotal
    };
  }
  /**
   * 某条授权相关的审计日志（时间倒序）。早期写入的日志可能没有 targetId（例如
   * 种子数据），这种情况下按"操作者是否为该医生"归属，保证示例数据也有时间线。
   */
  function activity(consentId) {
    var c = byId(consentId);
    if (!c || !PHR.audit || !PHR.audit.all) { return []; }
    return PHR.audit.all().filter(function (e) {
      if (e.targetType !== 'consent') { return false; }
      if (c.userId && e.userId && e.userId !== c.userId) { return false; }
      return e.targetId ? e.targetId === consentId : (e.actor === c.doctorName);
    });
  }
  /* 同时挂到 PHR.consent.service 与 PHR.consent 上，使 PHR.consent.grant(...) 与
     PHR.consent.list() 都能直接调用（首页工作台与 core/boot.js 自检就是这么用的）。 */
  var api = {
    list: list, byId: byId, byCode: byCode, normalizeCode: normalizeCode,
    grant: grant, revoke: revoke, extend: extend, verifyCode: verifyCode,
    sweepExpired: sweepExpired, canAccess: canAccess, recordAccess: recordAccess,
    stats: stats, activity: activity
  };
  PHR.consent.service = api;
  Object.keys(api).forEach(function (k) { PHR.consent[k] = api[k]; });
})(window.PHR);
