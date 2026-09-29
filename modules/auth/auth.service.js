/**
 * ============================================================================
 * 文件：modules/auth/auth.service.js
 * 层：业务模块层（账号安全 —— 模块 1）
 * 职责：账号相关的全部业务逻辑 —— 注册、两步登录（密码 → 第二因素）、
 *      退出登录、修改密码、多因素开关。所有分支都会写审计日志。
 * 依赖：core/models.js、core/crypto.js、core/security.js、
 *      modules/auth/lockout.js、mfa.js、session.js、modules/audit
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  PHR.registerModule('auth', {
    title: '账号安全',
    description: '注册登录、多因素认证、会话管理与口令策略',
    icon: '🔐',
    order: 1
  });

  /* 模块名随语言切换：注册发生在语言探测之前，只能用访问器延迟取词
     （与 core/dict-records.js 处理记录类型名称的做法一致） */
  (function () {
    var m = PHR.modules.auth;
    var zhTitle = m.title, zhDesc = m.description;
    Object.defineProperty(m, 'title', {
      enumerable: true, configurable: true,
      get: function () { return U.t('module.auth.title', zhTitle); }
    });
    Object.defineProperty(m, 'description', {
      enumerable: true, configurable: true,
      get: function () { return U.t('module.auth.desc', zhDesc); }
    });
  })();

  /* ================================================================== *
   * 一、账号查找
   * ================================================================== */

  /** 支持用账号名或手机号登录 */
  function findByAccount(account) {
    var a = String(account || '').trim().toLowerCase();
    if (!a) { return null; }
    return PHR.db.users.all().filter(function (u) {
      return String(u.username).toLowerCase() === a || String(u.phone) === a;
    })[0] || null;
  }

  /* ================================================================== *
   * 二、注册
   * ================================================================== */
  /**
   * @param {object} values { username, password, password2, displayName, phone, email, mfaEnabled, mfaFactors, agreement }
   * @returns {{ok:boolean, errors:object, user:object, message:string}}
   */
  function register(values) {
    values = values || {};
    var check = PHR.models.user.validate(values);
    var errors = check.errors;

    if (!values.agreement) { errors.agreement = U.t('auth.err.agreement', '请先阅读并同意《健康数据使用与隐私说明》'); }

    if (findByAccount(values.username)) { errors.username = U.t('auth.err.usernameTaken', '该账号已被注册，请换一个'); }
    if (values.phone && PHR.db.users.all().some(function (u) { return String(u.phone) === String(values.phone); })) {
      errors.phone = U.t('auth.err.phoneTaken', '该手机号已被其他账号绑定');
    }

    var policy = PHR.security.passwordPolicy(values.password);
    if (values.password && !policy.ok) { errors.password = policy.hint; }

    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, list: Object.keys(errors).map(function (k) { return errors[k]; }),
               message: U.t('auth.err.fixForm', '请修正表单中标红的问题') };
    }

    var user = PHR.models.user.create({
      username: values.username,
      displayName: values.displayName || values.username,
      phone: values.phone || '',
      email: values.email || '',
      role: 'patient',
      passwordHash: PHR.crypto.hashPassword(values.password),
      mfaEnabled: values.mfaEnabled !== false,
      mfaFactors: (values.mfaFactors && values.mfaFactors.length) ? values.mfaFactors : ['sms'],
      faceTemplate: 'face-template-' + PHR.crypto.randomHex(6),
      status: 'active'
    });
    var saved = PHR.db.users.insert(user);

    PHR.audit.log({
      userId: saved.id, actor: saved.displayName, actorType: 'user',
      action: 'auth.register', targetType: 'user', targetId: saved.id, targetName: saved.username,
      detail: U.t('auth.audit.registered', '注册成功，多因素认证：{v}', {
        v: saved.mfaEnabled ? saved.mfaFactors.join(' + ') : U.t('auth.audit.mfaOff', '未开启')
      }),
      result: 'success'
    });

    return { ok: true, user: saved, message: U.t('auth.register.ok', '注册成功，请使用新账号登录') };
  }

  /* ================================================================== *
   * 三、登录（第一步：密码）
   * ================================================================== */
  /**
   * @param {string} account 账号名或手机号
   * @param {string} password
   * @param {object} [opt] { remember: boolean } —— false 表示"只保留到关掉标签页"
   * @returns {{ok, needMfa, challenge, user, message, locked, remainSeconds, remaining}}
   */
  function login(account, password, opt) {
    opt = opt || {};
    var lock = PHR.lockout.check(account);
    if (lock.locked) {
      PHR.audit.log({
        action: 'auth.login_fail', targetType: 'user', targetName: account,
        detail: U.t('auth.audit.lockedRemain', '账号处于锁定状态，剩余 {v}',
          { v: PHR.lockout.describeLock(lock.remainSeconds) }),
        result: 'fail', actor: account, actorType: 'system'
      });
      return {
        ok: false, locked: true, remainSeconds: lock.remainSeconds,
        message: U.t('auth.err.lockedUntil', '账号已被临时锁定，请在 {v}后重试',
          { v: PHR.lockout.describeLock(lock.remainSeconds) })
      };
    }

    var user = findByAccount(account);
    if (!user) {
      // 不区分"账号不存在"和"密码错误"，避免账号枚举
      var r0 = PHR.lockout.recordFailure(account);
      PHR.audit.log({
        action: 'auth.login_fail', targetType: 'user', targetName: account,
        detail: U.t('auth.audit.noSuchUser', '账号不存在（已计为一次失败尝试）'), result: 'fail', actor: account, actorType: 'system'
      });
      return { ok: false, message: U.t('auth.err.badCredentials', '账号或密码不正确'), remaining: r0.remaining };
    }

    if (user.status === 'disabled') {
      return { ok: false, message: U.t('auth.err.disabled', '该账号已被停用，请联系管理员') };
    }

    if (!PHR.crypto.verifyPassword(password, user.passwordHash)) {
      var r = PHR.lockout.recordFailure(account);
      PHR.audit.log({
        userId: user.id, action: 'auth.login_fail', targetType: 'user', targetName: user.username,
        detail: U.t('auth.audit.wrongPassword', '密码错误（连续第 {n} 次）', { n: r.failures }), result: 'fail',
        actor: user.displayName, actorType: 'system'
      });
      if (r.locked) {
        PHR.audit.log({
          userId: user.id, action: 'auth.locked', targetType: 'user', targetName: user.username,
          detail: U.t('auth.audit.locked', '连续 {n} 次登录失败，账号锁定 {m} 分钟',
                    { n: PHR.config.maxLoginFailures, m: r.lockMinutes }),
          result: 'fail', actor: user.displayName, actorType: 'system'
        });
        PHR.bus.emit('auth:locked', { username: user.username, until: r.until });
        return {
          ok: false, locked: true, remainSeconds: Math.ceil((r.until - Date.now()) / 1000),
          message: U.t('auth.err.lockedByFailures', '密码连续错误 {n} 次，账号已锁定 {m} 分钟',
                     { n: PHR.config.maxLoginFailures, m: r.lockMinutes })
        };
      }
      return {
        ok: false, message: U.t('auth.err.badCredentials', '账号或密码不正确'),
        remaining: r.remaining,
        hint: r.remaining <= 2
          ? U.t('auth.err.lastChances', '再失败 {n} 次账号将被锁定', { n: r.remaining })
          : ''
      };
    }

    /* --- 密码正确 --- */
    PHR.lockout.reset(user.username);

    if (user.mfaEnabled && (user.mfaFactors || []).length) {
      /* 「7 天内自动登录」的选择要跟着 challenge 走到 afterMfa()，
         否则开了多因素认证的账号勾了也没用 —— 密码这步记下了，
         第二因素那步就把 remember 丢了。 */
      var ch = PHR.mfa.start(user, { remember: opt.remember !== false });
      PHR.audit.log({
        userId: user.id, action: 'auth.login', targetType: 'user', targetName: user.username,
        detail: U.t('auth.audit.awaitMfa', '密码校验通过，等待第二因素认证（{v}）',
                  { v: mfaFactorNames(user.mfaFactors) }),
        result: 'success', actor: user.displayName, actorType: 'user'
      });
      return { ok: true, needMfa: true, challenge: ch, user: user,
               message: U.t('auth.mfa.enterSecond', '请输入第二因素完成验证') };
    }

    /* --- 未开启多因素：直接建立会话 --- */
    return finishLogin(user, { mfaVerified: false, remember: opt.remember !== false });
  }

  /* ================================================================== *
   * 四、登录（第二步：第二因素）
   * ================================================================== */
  /**
   * @param {string} factor 'sms' | 'face'
   * @param {string} payload 短信验证码
   * @returns {Promise<{ok, user, message}>}
   */
  function verifyMfa(factor, payload) {
    var ch = PHR.mfa.pending();
    if (!ch) {
      return Promise.resolve({ ok: false, message: U.t('auth.err.sessionExpired', '认证会话已失效，请重新登录') });
    }

    if (factor === 'sms') {
      var r = PHR.mfa.verifySms(payload);
      if (!r.ok) { return Promise.resolve(r); }
      return Promise.resolve(afterMfa(ch, 'sms'));
    }

    if (factor === 'face') {
      return PHR.mfa.verifyFace().then(function (r) {
        if (!r.ok) { return r; }
        return afterMfa(ch, 'face');
      });
    }

    return Promise.resolve({ ok: false, message: U.t('auth.err.unsupportedFactor', '不支持的第二因素类型：{v}', { v: factor }) });
  }

  function afterMfa(ch, factor) {
    var user = PHR.db.users.byId(ch.userId);
    if (!user) { return { ok: false, message: U.t('auth.err.userMissing', '账号不存在') }; }

    PHR.audit.log({
      userId: user.id, action: 'auth.mfa_pass', targetType: 'user', targetName: user.username,
      detail: U.t('auth.audit.mfaPass', '第二因素认证通过（{v}）', {
        v: factor === 'sms' ? U.t('auth.factorSmsName', '短信验证码') : U.t('auth.factorFaceName', '人脸识别')
      }),
      result: 'success', actor: user.displayName, actorType: 'user'
    });

    PHR.mfa.clear();
    return finishLogin(user, { mfaVerified: true, remember: ch.remember !== false });
  }

  /** 建立会话并做登录收尾 */
  function finishLogin(user, opt) {
    var s = PHR.session.start(user, opt);
    PHR.db.users.update(user.id, {
      lastLoginAt: Date.now(),
      loginCount: (user.loginCount || 0) + 1,
      status: 'active'
    });
    PHR.audit.log({
      userId: user.id, action: 'auth.login', targetType: 'user', targetName: user.username,
      detail: opt.mfaVerified
        ? U.t('auth.audit.loginMfa', '登录成功（已通过多因素认证）')
        : U.t('auth.audit.loginNoMfa', '登录成功（未开启多因素认证）'),
      result: 'success', actor: user.displayName, actorType: 'user'
    });
    return { ok: true, user: user, session: s,
             message: U.t('auth.welcomeBack', '欢迎回来，{name}', { name: user.displayName || user.username }) };
  }

  /* ================================================================== *
   * 五、退出登录
   * ================================================================== */
  function logout(reason) {
    var user = PHR.session.currentUser();
    var s = PHR.session.current();
    if (user) {
      var reasonText = {
        manual: U.t('auth.logoutReason.manual', '用户主动退出'),
        /* 'timeout' 不再是"空闲超时"，而是"7 天登录保持到期" ——
           见 core/security.js 的 sessionPolicy。 */
        timeout: U.t('auth.logoutReason.timeout', '登录保持到期'),
        disabled: U.t('auth.logoutReason.disabled', '账号被停用'),
        user_missing: U.t('auth.logoutReason.userMissing', '账号不存在')
      }[reason] || reason || U.t('auth.logoutReason.unknown', '未知原因');
      PHR.audit.log({
        userId: user.id, action: 'auth.logout', targetType: 'user', targetName: user.username,
        detail: U.t('auth.audit.logout', '退出登录（{v}）', { v: reasonText }),
        result: 'success', actor: user.displayName, actorType: 'user'
      });
    }
    PHR.session.end(reason || 'manual');
    PHR.mfa.clear();
    PHR.bus.clear();
    bindBus();                       // 事件总线被清空后重新挂上系统级订阅
    PHR.bus.emit('auth:logout', { reason: reason || 'manual', uiReset: true });
    return { ok: true };
  }

  /* ================================================================== *
   * 六、修改密码
   * ================================================================== */
  /**
   * @returns {{ok:boolean, errors:object, message:string}}
   */
  function changePassword(oldPwd, newPwd, newPwd2) {
    var user = PHR.session.currentUser();
    if (!user) { return { ok: false, message: U.t('auth.err.needLogin', '请先登录') }; }

    var errors = {};
    if (!PHR.crypto.verifyPassword(oldPwd, user.passwordHash)) { errors.oldPassword = U.t('auth.err.oldPassword', '当前密码不正确'); }
    if (!newPwd) { errors.newPassword = U.t('auth.err.newPasswordEmpty', '请输入新密码'); }
    else {
      if (PHR.crypto.verifyPassword(newPwd, user.passwordHash)) { errors.newPassword = U.t('auth.err.samePassword', '新密码不能与当前密码相同'); }
      var policy = PHR.security.passwordPolicy(newPwd);
      if (!policy.ok) { errors.newPassword = policy.hint; }
    }
    if (newPwd !== newPwd2) { errors.newPassword2 = U.t('auth.err.passwordMismatch', '两次输入的新密码不一致'); }

    if (Object.keys(errors).length) { return { ok: false, errors: errors, message: U.t('auth.err.checkForm', '请检查表单') }; }

    PHR.db.users.update(user.id, {
      passwordHash: PHR.crypto.hashPassword(newPwd),
      failedCount: 0,
      lockedUntil: 0
    });
    PHR.audit.log({
      action: 'auth.password', targetType: 'user', targetId: user.id, targetName: user.username,
      detail: U.t('auth.audit.passwordChanged', '修改登录密码成功'), result: 'success'
    });
    return { ok: true, message: U.t('auth.pwdUpdated', '密码已更新。为安全起见，建议下次登录时留意陌生设备提醒。') };
  }

  /* ================================================================== *
   * 七、多因素认证开关
   * ================================================================== */
  function setMfa(enabled, factors) {
    var user = PHR.session.currentUser();
    if (!user) { return { ok: false, message: U.t('auth.err.needLogin', '请先登录') }; }

    factors = (factors && factors.length) ? factors : (enabled ? ['sms'] : []);
    if (enabled && !factors.length) {
      return { ok: false, message: U.t('auth.err.needOneFactor', '开启多因素认证时至少需要选择一种方式') };
    }
    if (enabled && !user.phone && factors.indexOf('sms') >= 0) {
      return { ok: false, message: U.t('auth.err.needPhone', '使用短信验证码前，请先在「个人基本信息」中填写手机号') };
    }

    PHR.db.users.update(user.id, { mfaEnabled: !!enabled, mfaFactors: factors });
    PHR.audit.log({
      action: 'auth.password', targetType: 'user', targetId: user.id, targetName: user.username,
      detail: enabled
        ? U.t('auth.audit.mfaEnabled', '开启多因素认证：{v}', { v: mfaFactorNames(factors) })
        : U.t('auth.audit.mfaDisabled', '关闭多因素认证'),
      result: enabled ? 'success' : 'fail'
    });
    return {
      ok: true,
      message: enabled
        ? U.t('auth.mfaEnabledMsg', '已开启多因素认证（{v}）', { v: mfaFactorNames(factors) })
        : U.t('auth.mfaDisabledMsg', '已关闭多因素认证，账号安全性下降')
    };
  }

  function mfaFactorNames(factors) {
    return (factors || []).map(function (k) {
      return PHR.dict.nameOf(PHR.dict.authFactor, k);
    }).join(' + ');
  }

  /* ================================================================== *
   * 八、登录历史（"账号与安全"页展示）
   * ================================================================== */
  function loginHistory(limit) {
    var user = PHR.session.currentUser();
    var uid = user ? user.id : '';
    return PHR.audit.all()
      .filter(function (e) {
        return (!uid || e.userId === uid) &&
               ['auth.login', 'auth.login_fail', 'auth.logout', 'auth.locked',
                'auth.mfa_pass', 'auth.mfa_fail', 'auth.password'].indexOf(e.action) >= 0;
      })
      .slice(0, limit || 10);
  }

  /* ================================================================== *
   * 九、系统级事件订阅
   * ================================================================== */
  function bindBus() {
    /* 「空闲超时 → 自动退出」的订阅已删除。
       它原来监听 session.js 里那个 20 秒看门狗发出的 auth:idle_timeout。
       现在登录状态是绝对到期（默认 7 天），没有空闲超时这回事了。
       详见 core/security.js 的 sessionPolicy 与 modules/auth/session.js 的说明。 */

    // 账号被锁定 → 提示
    PHR.bus.on('auth:locked', function (p) {
      PHR.ui.toast.danger(U.t('auth.accountLocked', '账号「{u}」已锁定', { u: p.username }), {
        title: U.t('auth.securityAlert', '安全提醒'),
        detail: U.t('auth.accountLockedDetail', '连续多次登录失败，请在锁定时间结束后重试。')
      });
    });
  }

  bindBus();

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.auth = {
    findByAccount: findByAccount,
    register: register,
    login: login,
    verifyMfa: verifyMfa,
    logout: logout,
    changePassword: changePassword,
    setMfa: setMfa,
    mfaFactorNames: mfaFactorNames,
    loginHistory: loginHistory,
    isLoggedIn: function () { return PHR.session.isLoggedIn(); },
    currentUser: function () { return PHR.session.currentUser(); }
  };

})(window.PHR);
