/**
 * ============================================================================
 * 文件：modules/auth/session.js
 * 层：业务模块层（账号安全 —— 模块 1）
 * 职责：会话生命周期管理 —— 建立/读取/续期/销毁登录会话。
 *      同时承载两种身份：
 *        · 患者本人（patient）—— 完整权限
 *        · 医生访客（doctor） —— 凭授权码进入，只能看被授权的档案
 *
 *     登录保持：患者会话默认存 localStorage，7 天内重开浏览器无需再输口令
 *     （见 core/security.js 的 sessionPolicy）。医生访客与 MFA 挑战仍然只留在
 *     当前标签页，那是各自刻意的设计，见下方注释。
 * 依赖：core/store.js、core/security.js、core/event-bus.js、core/models.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* 患者会话的键名。
     叫 session.persist 而不是 session，是因为它现在存在 **localStorage**
     （core/store.js 的 DEVICE_KEYS 会把这个键路由过去），登录一次能保持 7 天；
     而"只保留到关掉标签页"模式下它会退回 sessionStorage。
     两个存储用同一个键名会让人以为是同一个东西，所以刻意分开命名。 */
  var SESSION_KEY = 'session.persist';
  var GUEST_KEY = 'doctor_guest';       // 医生访客只保留在当前标签页

  var touchTimer = null;                // touch() 的持久化防抖
  var pendingTouch = null;              // 待写回的会话对象

  /* ================================================================== *
   * 一、患者会话
   * ================================================================== */

  /**
   * 写回会话。
   * 勾了「7 天内自动登录」→ localStorage（跨浏览器重启保留）；
   * 没勾 → sessionStorage（关掉标签页即失效）。
   * 两种存储只留一份，避免读到过期的那一份。
   */
  function writeSession(s) {
    if (s && s.remember) {
      PHR.store.write(SESSION_KEY, s);          // 设备键，写进 localStorage
      PHR.store.session.drop(SESSION_KEY);
    } else {
      PHR.store.session.write(SESSION_KEY, s);
      PHR.store.drop(SESSION_KEY);
    }
  }

  /** 读会话：先看持久的那份，再看本标签页的那份 */
  function readSession() {
    var s = PHR.store.read(SESSION_KEY, null);
    if (s) { return s; }
    return PHR.store.session.read(SESSION_KEY, null);
  }

  /**
   * 「7 天内自动登录」的当前设置，单位天。0 表示关闭（只保留到关掉标签页）。
   *
   * 唯一的事实来源是 localStorage 里的 sessionRememberDays：登录页的勾选框
   * 和设置页的开关写的都是它，所以两处永远一致。
   * 必须**在函数里**读，不能在脚本求值阶段读 —— 本地数据库模式下整库镜像是
   * 异步载入的，加载阶段读到的会是空的。见 core/store.js 文件头的铁律 ②。
   */
  function rememberDays() {
    var v = Number(PHR.store.read('sessionRememberDays', PHR.config.sessionRememberDays));
    return isNaN(v) ? PHR.config.sessionRememberDays : v;
  }

  /** 建立会话 */
  function start(user, opt) {
    opt = opt || {};
    var days = rememberDays();
    var remember = (opt.remember !== false) && days > 0;
    var s = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      token: PHR.crypto.token(32),
      role: user.role || 'patient',
      mfaVerified: !!opt.mfaVerified,
      remember: remember,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      /* 绝对到期时间，登录时定死。不再是"每次交互顺延"的空闲超时 ——
         原因见 core/security.js 的 sessionPolicy 注释。
         关掉「自动登录」时仍然给一个正常期限：这种会话存在 sessionStorage 里，
         关掉标签页就没了，期限只是兜底。 */
      expiresAt: Date.now() + (days > 0 ? days : PHR.config.sessionRememberDays) * 86400000
    };
    writeSession(s);
    PHR.bus.emit('auth:login', { user: user, session: s });
    PHR.log(PHR.t('auth.session.started', '会话已建立'), s.token.slice(0, 8) + '…');
    return s;
  }

  /**
   * 按新的「登录保持」选择把当前会话重新存一次。
   * 设置页关掉开关时调用，让改动立刻生效，而不是拖到下次登录。
   */
  function repersist(s, remember) {
    if (!s) { return null; }
    var copy = Object.assign({}, s, {
      remember: !!remember,
      expiresAt: Date.now() + PHR.security.sessionPolicy.trustLimit()
    });
    writeSession(copy);
    return copy;
  }

  /** 读取原始会话对象（可能已过期，调用方需自行判断） */
  function current() {
    return readSession();
  }

  /** 会话是否有效 */
  function isLoggedIn() {
    var s = current();
    if (!s) { return false; }
    if (PHR.security.sessionPolicy.isExpired(s)) {
      end('timeout');
      return false;
    }
    return true;
  }

  /** 取当前登录用户记录；未登录或用户已被删除时返回 null */
  function currentUser() {
    var s = current();
    if (!s) { return null; }
    var user = PHR.db.users.byId(s.userId);
    if (!user) { end('user_missing'); return null; }
    if (user.status === 'disabled') { end('disabled'); return null; }
    /* 显示名来自种子词条（张小雨…），按当前语言解析 */
    return PHR.models.localize(user, ['displayName']);
  }

  /** 当前用户 id（未登录返回空串） */
  function userId() {
    var s = current();
    return s ? s.userId : '';
  }

  /**
   * 续期：刷新"最近活动"时间。
   *
   * ⚠️ 只改内存里的对象，**不**每次写存储。ui/shell.js 每 15 秒就会调一次，
   * 一整天下来会往 localStorage 写几千次 —— 而 lastActiveAt 只是「账号与安全」
   * 页的展示字段，跟登录是否有效已经没关系了（过期由绝对的 expiresAt 决定）。
   * 所以改成 30 秒防抖持久化，外加离开页面时落一次。
   */
  function touch() {
    var s = readSession();
    if (!s) { return; }
    s.lastActiveAt = Date.now();
    pendingTouch = s;
    if (touchTimer) { return; }
    touchTimer = setTimeout(function () {
      touchTimer = null;
      flushTouch();
    }, 30000);
  }

  function flushTouch() {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    if (pendingTouch) { writeSession(pendingTouch); pendingTouch = null; }
  }

  /* 关标签页/切到后台时把"最近活动"补写一次，让「账号与安全」页的时间大致准确 */
  window.addEventListener('pagehide', flushTouch);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { flushTouch(); }
  });

  /** 结束会话 */
  function end(reason) {
    var s = readSession();
    PHR.store.drop(SESSION_KEY);            // 清持久的那份
    PHR.store.session.drop(SESSION_KEY);    // 也清本标签页的那份
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    pendingTouch = null;
    if (s) {
      PHR.bus.emit('auth:logout', { reason: reason || 'manual', session: s });
      PHR.log(PHR.t('auth.session.ended', '会话已结束，原因：{reason}', { reason: reason || 'manual' }));
    }
  }

  /* ================================================================== *
   * 二、空闲看门狗 —— 已删除
   * ------------------------------------------------------------------
   * 这里原本有一个 20 秒的 setInterval，空闲 30 分钟就发 auth:idle_timeout
   * 让用户登出。现在没有这个功能了：
   *   · 它与「7 天免登录」互相抵消（晚上关机、第二天早上打开就已超时）；
   *   · 纯前端应用里的"自动登出"拦不住真想看的人，只会烦到本人；
   *   · 真正在看守的是 30 秒屏保（ui/shell.js，只隐藏界面）与操作系统的锁屏。
   * 如果将来要恢复，注意同时恢复 core/security.js 的 sessionPolicy 与
   * modules/auth/auth.service.js 里对 auth:idle_timeout 的订阅。
   * ================================================================== */

  /* ================================================================== *
   * 三、医生访客会话
   *     医生不注册账号，而是凭患者给出的授权码进入一个"受限视图"。
   *     这里保存的是"医生是谁 + 凭哪条授权进来的"，权限校验在 consent 模块。
   * ================================================================== */
  function startDoctorGuest(doctor, consent) {
    var g = {
      name: doctor.name,
      title: doctor.title || '',
      hospital: doctor.hospital || '',
      department: doctor.department || '',
      licenseNo: doctor.licenseNo || '',
      consentId: consent.id,
      consentCode: consent.code,
      startedAt: Date.now(),
      lastActiveAt: Date.now()
    };
    PHR.store.session.write(GUEST_KEY, g);
    PHR.bus.emit('auth:doctor_login', { doctor: g, consent: consent });
    return g;
  }

  function isDoctorGuest() {
    var g = PHR.store.session.read(GUEST_KEY, null);
    if (!g) { return false; }
    // 授权被撤销或过期时，访客会话立即失效
    var c = PHR.db.consents.byId(g.consentId);
    if (!c) { clearDoctorGuest(); return false; }
    var st = PHR.models.consent.effectiveStatus(c);
    if (st !== 'active') { clearDoctorGuest(); return false; }
    return true;
  }

  function currentDoctor() {
    return PHR.store.session.read(GUEST_KEY, null);
  }

  /** 取医生访客当前所凭的授权记录 */
  function currentConsent() {
    var g = currentDoctor();
    if (!g) { return null; }
    return PHR.db.consents.byId(g.consentId);
  }

  function clearDoctorGuest() {
    PHR.store.session.drop(GUEST_KEY);
  }

  /* ================================================================== *
   * 四、会话统计（"账号与安全"页面展示）
   * ================================================================== */
  function info() {
    var s = current();
    var g = currentDoctor();
    var env = PHR.audit && PHR.audit.envInfo ? PHR.audit.envInfo() : { ip: '—', device: '—' };

    if (s) {
      var remain = PHR.security.sessionPolicy.remainingSeconds(s);
      return {
        identity: 'patient',
        name: s.displayName,
        token: s.token,
        startedAt: s.startedAt,
        lastActiveAt: s.lastActiveAt,
        remainSeconds: remain,
        /* 展示用：还剩几天。0 表示不足一天（或会话只保留到关掉标签页）。 */
        remainDays: Math.ceil(remain / 86400),
        remember: !!s.remember,
        rememberDays: PHR.config.sessionRememberDays,
        mfaVerified: s.mfaVerified,
        ip: env.ip,
        device: env.device
      };
    }
    if (g) {
      return {
        identity: 'doctor',
        name: g.name,
        token: g.consentCode,
        startedAt: g.startedAt,
        lastActiveAt: g.lastActiveAt,
        remainSeconds: 0,
        remainDays: 0,
        remember: false,
        rememberDays: 0,
        mfaVerified: false,
        ip: env.ip,
        device: env.device
      };
    }
    return null;
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.session = {
    start: start,
    end: end,
    current: current,
    currentUser: currentUser,
    userId: userId,
    isLoggedIn: isLoggedIn,
    touch: touch,
    info: info,
    rememberDays: rememberDays,
    repersist: repersist,

    startDoctorGuest: startDoctorGuest,
    isDoctorGuest: isDoctorGuest,
    currentDoctor: currentDoctor,
    currentConsent: currentConsent,
    clearDoctorGuest: clearDoctorGuest
  };

})(window.PHR);
