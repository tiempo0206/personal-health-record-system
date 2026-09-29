/**
 * ============================================================================
 * 文件：modules/auth/lockout.js
 * 层：业务模块层（账号安全 —— 模块 1）
 * 职责：登录失败计数与账号临时锁定。
 *      连续失败达到 PHR.config.maxLoginFailures 次后锁定 PHR.config.lockoutMinutes 分钟，
 *      在锁定期间即使密码正确也拒绝登录 —— 这是抵御暴力破解的第一道闸门。
 *      失败次数会同时写入账号记录，因此换浏览器也依然生效（针对同一份本地数据）。
 * 依赖：core/models.js、core/dict.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /** 内存中的尝试记录：key = 用户名小写 */
  var attempts = {};

  function keyOf(username) { return String(username || '').trim().toLowerCase(); }

  /* ================================================================== *
   * 一、查询
   * ================================================================== */
  /**
   * 判断某账号当前是否处于锁定状态。
   * @returns {{locked:boolean, until:number, remainSeconds:number, failures:number}}
   */
  function check(username) {
    var k = keyOf(username);
    var mem = attempts[k] || { failures: 0, until: 0 };
    var user = findByUsername(username);

    // 账号记录里的锁定信息优先级更高（跨浏览器生效）
    var until = Math.max(mem.until, (user && user.lockedUntil) || 0);
    var failures = Math.max(mem.failures, (user && user.failedCount) || 0);

    var locked = until > Date.now();
    var remain = locked ? Math.ceil((until - Date.now()) / 1000) : 0;

    return { locked: locked, until: until, remainSeconds: remain, failures: failures };
  }

  /* ================================================================== *
   * 二、记录失败
   * ================================================================== */
  /**
   * 记录一次登录失败。
   * @returns {{failures:number, remaining:number, locked:boolean, until:number, lockMinutes:number}}
   */
  function recordFailure(username) {
    var k = keyOf(username);
    var mem = attempts[k] || { failures: 0, until: 0 };
    mem.failures += 1;
    attempts[k] = mem;

    var max = PHR.config.maxLoginFailures;
    var lockMinutes = PHR.config.lockoutMinutes;
    var locked = false;

    if (mem.failures >= max) {
      mem.until = Date.now() + lockMinutes * 60000;
      mem.failures = 0;                    // 锁定后计数归零，解锁后重新计
      locked = true;
    }

    // 同步写入账号记录
    var user = findByUsername(username);
    if (user) {
      PHR.db.users.update(user.id, {
        failedCount: locked ? 0 : mem.failures,
        lockedUntil: mem.until,
        status: locked ? 'locked' : user.status
      });
    }

    return {
      failures: locked ? max : mem.failures,
      remaining: locked ? 0 : Math.max(0, max - mem.failures),
      locked: locked,
      until: mem.until,
      lockMinutes: lockMinutes
    };
  }

  /* ================================================================== *
   * 三、重置
   * ================================================================== */
  /** 登录成功或密码重置后清零计数 */
  function reset(username) {
    var k = keyOf(username);
    delete attempts[k];
    var user = findByUsername(username);
    if (user) {
      PHR.db.users.update(user.id, { failedCount: 0, lockedUntil: 0, status: 'active' });
    }
  }

  /** 管理员/用户本人手动解锁 */
  function unlock(username) { reset(username); }

  /* ================================================================== *
   * 四、辅助
   * ================================================================== */
  function findByUsername(username) {
    var k = keyOf(username);
    return PHR.db.users.all().filter(function (u) {
      return String(u.username).toLowerCase() === k || String(u.phone) === String(username);
    })[0] || null;
  }

  /** 剩余锁定秒数格式化（随语言切换） */
  function describeLock(seconds) {
    if (seconds <= 0) { return ''; }
    var m = Math.floor(seconds / 60), s = seconds % 60;
    return m > 0
      ? U.t('auth.lock.minSec', '{m} 分 {s} 秒', { m: m, s: s })
      : U.t('auth.lock.sec', '{s} 秒', { s: s });
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.lockout = {
    check: check,
    recordFailure: recordFailure,
    reset: reset,
    unlock: unlock,
    findByUsername: findByUsername,
    describeLock: describeLock
  };

})(window.PHR);
