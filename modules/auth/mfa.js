/**
 * ============================================================================
 * 文件：modules/auth/mfa.js
 * 层：业务模块层（账号安全 —— 模块 1）
 * 职责：多因素认证（Multi-Factor Authentication）—— 密码之外的"第二把钥匙"。
 *      支持两种第二因素：
 *        · 短信验证码（sms） —— 6 位数字，有效期 PHR.config.smsCodeTTL 秒，限次重试
 *        · 人脸识别（face）   —— 纯前端模拟比对（含活体检测的交互模拟）
 *      认证挑战(challenge)只保存在当前标签页的 sessionStorage 中，
 *      关闭页面即失效，避免被复制到别处重放。
 * 依赖：core/crypto.js、core/store.js、core/dict.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  var CHALLENGE_KEY = 'mfa_challenge';
  var RESEND_KEY = 'mfa_last_send';

  /* ================================================================== *
   * 一、发起认证挑战
   * ================================================================== */
  /**
   * 密码校验通过后调用，生成一个待完成的第二因素挑战。
   * @param {object} user 通过密码校验的用户
   * @param {object} [opt] { remember: boolean } —— 用户在登录页勾没勾「7 天内自动登录」
   * @returns {object} challenge { userId, factors, activeFactor, startedAt, expiresAt,
   *                              smsCode, smsSentAt, attempts, faceTemplate, remember }
   */
  function start(user, opt) {
    opt = opt || {};
    var factors = (user.mfaFactors && user.mfaFactors.length) ? user.mfaFactors : ['sms'];
    var ch = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      phone: PHR.crypto.maskPhone(user.phone || '13800000000'),
      factors: factors,
      activeFactor: factors[0],
      startedAt: Date.now(),
      expiresAt: Date.now() + PHR.config.smsCodeTTL * 1000,
      smsCode: null,
      smsSentAt: 0,
      attempts: 0,
      maxAttempts: PHR.config.faceFailLimit + 2,
      faceTemplate: user.faceTemplate || 'face-template-sample-001',
      faceTried: 0,
      /* 带着走：密码那步勾的「7 天内自动登录」要活到 afterMfa()，
         否则开了多因素认证的账号勾了也没用。 */
      remember: opt.remember !== false
    };
    // 默认立即下发一次短信验证码，减少用户等待
    if (factors.indexOf('sms') >= 0) { sendSms(ch); }
    PHR.store.session.write(CHALLENGE_KEY, ch);
    return ch;
  }

  /** 读取当前挑战；已过期或超次数则返回 null 并清除 */
  function pending() {
    var ch = PHR.store.session.read(CHALLENGE_KEY, null);
    if (!ch) { return null; }
    if (Date.now() > ch.expiresAt + 5 * 60000) { clear(); return null; }
    if (ch.attempts >= ch.maxAttempts) { clear(); return null; }
    return ch;
  }

  function clear() { PHR.store.session.drop(CHALLENGE_KEY); }

  /* ================================================================== *
   * 二、短信验证码
   * ================================================================== */
  /** 是否处于重发冷却期 */
  function resendCooldown(ch) {
    ch = ch || pending();
    if (!ch || !ch.smsSentAt) { return 0; }
    var left = PHR.config.smsResendCooldown - Math.floor((Date.now() - ch.smsSentAt) / 1000);
    return Math.max(0, left);
  }

  /**
   * 下发验证码。
   * 当前实现没有真实短信网关，仅在内存中生成。验证码会由
   * auth.view.js 的 demoCodeNote() 直接显示在验证页上（演示需要），
   * 并同时支持万能验证码 —— 两者都会写审计日志，不会被悄悄用掉。
   */
  function sendSms(ch) {
    ch = ch || pending();
    if (!ch) { return { ok: false, message: U.t('auth.mfa.errSession', '认证会话已失效，请重新登录') }; }
    var cd = resendCooldown(ch);
    if (cd > 0) { return { ok: false, message: U.t('auth.mfa.waitResend', '请等待 {n} 秒后重新获取', { n: cd }) }; }

    ch.smsCode = PHR.crypto.randomDigits(6);
    ch.smsSentAt = Date.now();
    ch.expiresAt = Date.now() + PHR.config.smsCodeTTL * 1000;
    ch.activeFactor = 'sms';
    PHR.store.session.write(CHALLENGE_KEY, ch);
    PHR.store.session.write(RESEND_KEY, ch.smsSentAt);

    PHR.log('SMS verification code generated');
    return {
      ok: true,
      phone: ch.phone,
      ttl: PHR.config.smsCodeTTL,
      message: U.t('auth.mfa.smsSent', '验证码已发送至 {phone}', { phone: ch.phone })
    };
  }

  /** 校验短信验证码 */
  function verifySms(code) {
    var ch = pending();
    if (!ch) { return { ok: false, message: U.t('auth.mfa.errSession', '认证会话已失效，请重新登录') }; }
    if (!ch.smsCode) { return { ok: false, message: U.t('auth.mfa.getCodeFirst', '请先获取验证码') }; }
    if (Date.now() > ch.expiresAt) {
      return { ok: false, message: U.t('auth.mfa.codeExpired', '验证码已过期，请重新获取'), expired: true };
    }

    ch.attempts += 1;
    var input = String(code || '').replace(/\s/g, '');

    /* ---- 测试用万能验证码（仅在配置开启时生效） ------------------ *
     * 命中万能码时照常写入审计日志，确保可追溯。
     * ------------------------------------------------------------- */
    var demoCfg = PHR.config.demo || {};
    var universal = demoCfg.allowUniversalSmsCode && demoCfg.universalSmsCode;
    if (universal && input === String(universal)) {
      PHR.store.session.write(CHALLENGE_KEY, ch);
      U.audit({
        action: 'auth.mfa_pass', targetType: 'user', targetName: ch.username,
        detail: U.t('auth.mfa.auditUniversal',
          '⚠️ 使用了测试用万能验证码（{v}），非真实短信验证。该功能仅用于测试环境，生产环境必须关闭。',
          { v: universal }),
        result: 'success'
      });
      PHR.warn(PHR.t('auth.mfa.warn.universalCodeUsed', '使用了万能验证码登录：{username}', { username: ch.username }));
      return { ok: true, factor: 'sms', universal: true, message: U.t('auth.mfa.universalPass', '已通过测试用万能验证码') };
    }

    if (input !== ch.smsCode) {
      PHR.store.session.write(CHALLENGE_KEY, ch);
      var left = ch.maxAttempts - ch.attempts;
      U.audit({
        action: 'auth.mfa_fail', targetType: 'user', targetName: ch.username,
        detail: U.t('auth.mfa.auditWrongCode', '短信验证码错误，剩余尝试次数 {n}', { n: Math.max(0, left) }),
        result: 'fail'
      });
      return {
        ok: false,
        message: left > 0
          ? U.t('auth.mfa.wrongCode', '验证码不正确，还可尝试 {n} 次', { n: left })
          : U.t('auth.mfa.tooManyAttempts', '尝试次数过多，请重新登录'),
        remaining: Math.max(0, left)
      };
    }

    PHR.store.session.write(CHALLENGE_KEY, ch);
    return { ok: true, factor: 'sms', message: U.t('auth.mfa.smsOk', '短信验证码校验通过') };
  }

  /** 万能验证码当前是否可用（界面据此决定要不要提示） */
  function universalCodeEnabled() {
    var demoCfg = PHR.config.demo || {};
    return !!(demoCfg.allowUniversalSmsCode && demoCfg.universalSmsCode);
  }

  /** 取万能验证码（未启用时返回 null） */
  function universalCode() {
    var demoCfg = PHR.config.demo || {};
    return universalCodeEnabled() ? String(demoCfg.universalSmsCode) : null;
  }

  /* ================================================================== *
   * 三、人脸识别（模拟）
   * ================================================================== */
  /**
   * 模拟一次人脸比对。
   * 真实实现会调用摄像头 + 活体检测 + 服务端特征比对；
   * 当前用"随机成功 + 可指定必败"的方式模拟交互与失败分支。
   * @param {object} opt { forceResult: 'ok'|'fail', simulateDelay }
   * @returns {Promise<{ok:boolean, message:string, score:number}>}
   */
  function verifyFace(opt) {
    opt = opt || {};
    var ch = pending();
    if (!ch) { return Promise.resolve({ ok: false, message: U.t('auth.mfa.errSession', '认证会话已失效，请重新登录') }); }

    var delay = opt.simulateDelay === undefined ? 1600 : opt.simulateDelay;
    ch.faceTried += 1;
    PHR.store.session.write(CHALLENGE_KEY, ch);

    return new Promise(function (resolve) {
      setTimeout(function () {
        var result = opt.forceResult || (Math.random() > 0.12 ? 'ok' : 'fail');
        // 第二次尝试必定通过，保证本地体验流程不会卡住
        if (ch.faceTried >= 2 && result === 'fail') { result = 'ok'; }

        if (result === 'ok') {
          resolve({ ok: true, factor: 'face', score: 0.93 + Math.random() * 0.06, message: U.t('auth.mfa.faceOk', '人脸比对通过') });
        } else {
          var left = Math.max(0, PHR.config.faceFailLimit - ch.faceTried);
          U.audit({
            action: 'auth.mfa_fail', targetType: 'user', targetName: ch.username,
            detail: U.t('auth.mfa.auditFaceFail', '人脸识别未通过，剩余尝试次数 {n}', { n: left }), result: 'fail'
          });
          resolve({
            ok: false,
            message: left > 0
              ? U.t('auth.mfa.faceRetry', '未识别到匹配的人脸，请正对镜头再试一次（剩余 {n} 次）', { n: left })
              : U.t('auth.mfa.faceTooMany', '人脸识别失败次数过多，请改用短信验证码'),
            score: 0.42
          });
        }
      }, delay);
    });
  }

  /** 切换到另一种第二因素 */
  function switchFactor(factor) {
    var ch = pending();
    if (!ch) { return null; }
    if (ch.factors.indexOf(factor) < 0) { return ch; }
    ch.activeFactor = factor;
    if (factor === 'sms' && !ch.smsCode) { sendSms(ch); }
    PHR.store.session.write(CHALLENGE_KEY, ch);
    return ch;
  }

  /* ================================================================== *
   * 四、说明信息（界面展示用）
   * ================================================================== */
  /**
   * 第二因素的展示信息（图标 / 名称 / 说明）。
   * 名称走字典层取词（dict.authFactor.*），说明本模块自己登记词条。
   */
  function factorList(factors) {
    return (factors || []).map(function (k) {
      var d = (D.authFactor || []).filter(function (f) { return f.key === k; })[0];
      if (!d) { return { key: k, name: k, icon: '🔐', desc: '' }; }
      return {
        key: k,
        name: D.nameOf(D.authFactor, k),
        icon: d.icon,
        desc: U.t('auth.factor.' + k + '.desc', d.desc)
      };
    });
  }

  PHR.mfa = {
    start: start,
    pending: pending,
    clear: clear,
    sendSms: sendSms,
    verifySms: verifySms,
    verifyFace: verifyFace,
    switchFactor: switchFactor,
    resendCooldown: resendCooldown,
    factorList: factorList,
    universalCodeEnabled: universalCodeEnabled,
    universalCode: universalCode
  };

})(window.PHR);
