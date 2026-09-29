/**
 * ============================================================================
 * 个人健康档案管理系统 (PHR)
 * 文件：core/namespace.js
 * 层：核心基础设施层
 * 职责：建立全局唯一命名空间 window.PHR，并提供模块注册 / 视图注册两套注册表。
 *      本文件必须最先加载，其它所有文件都依赖它。
 * 依赖：无
 * ============================================================================
 */
(function (global) {
  'use strict';

  // 防止重复加载（例如被 <script> 引用两次）
  if (global.PHR && global.PHR.__namespaceReady) { return; }

  var PHR = global.PHR || {};

  /* ------------------------------------------------------------------ *
   * 一、应用元信息
   * ------------------------------------------------------------------ */
  PHR.meta = {
    version: '1.1.0',
    buildDate: '2026-09-15'
  };

  /* appName / shortName / slogan 按当前语言取词，这样切换语言后
     控制台欢迎信息与自检报告无需额外刷新即可生效。 */
  [
    ['appName', 'app.name', '个人健康档案管理系统'],
    ['shortName', 'app.shortName', 'PHR'],
    ['slogan', 'app.slogan', '安全 · 可控 · 可理解 · 可追踪']
  ].forEach(function (item) {
    Object.defineProperty(PHR.meta, item[0], {
      enumerable: true, configurable: true,
      get: function () { return PHR.t(item[1], item[2]); }
    });
  });

  /* ------------------------------------------------------------------ *
   * 二、全局配置（可在「体验保障 → 偏好设置」中被用户覆盖）
   * ------------------------------------------------------------------ */
  PHR.config = {
    debug: false,                 // 打开后控制台输出调试日志
    storagePrefix: 'phr.v1.',     // localStorage 键名前缀

    /* 本地数据库文件（database 模式）。由 core/store.file.js 在 http(s) 下使用：
       storageApiBase 是服务端读写整库的接口，两个 flush 参数是落盘防抖 ——
       灌一次示例数据会触发近 300 次写，逐次落盘等于把整库序列化 300 遍。 */
    storageApiBase: 'api/db',
    storageFlushDebounce: 300,    // 尾部防抖（毫秒）
    storageFlushMaxWait: 1500,    // 最长等待（毫秒），防止持续写入把落盘无限推迟

    sessionRememberDays: 7,       // 登录保持天数：7 天内重开浏览器无需再输口令
    maxLoginFailures: 5,          // 连续登录失败锁定阈值
    lockoutMinutes: 5,            // 账号锁定时长（分钟）
    smsCodeTTL: 120,              // 短信验证码有效期（秒）
    smsResendCooldown: 30,        // 短信重发冷却（秒）
    faceFailLimit: 3,             // 人脸识别重试上限

    /* 测试专用配置已迁移到 core/config.demo.js，请在那里集中管理。 */

    auditRetentionDays: 365,      // 审计日志保留天数
    consentMaxDays: 90,           // 单次医生授权最长天数
    passwordMinLength: 8,         // 密码最小长度
    pageSize: 10,                 // 列表分页大小
    abnormalAlert: true           // 是否开启异常指标提醒
  };

  /* ------------------------------------------------------------------ *
   * 三、注册表
   * ------------------------------------------------------------------ */
  PHR.modules = {};   // 业务模块注册表：模块 key -> 模块元信息
  PHR.views   = {};   // 视图注册表：  视图 name -> 视图描述符
  PHR.ui      = {};   // UI 组件注册表
  PHR.util    = {};   // 通用工具集合

  /* ------------------------------------------------------------------ *
   * 四、模块注册
   * ------------------------------------------------------------------ */
  /**
   * 注册一个业务模块。
   * @param {string} key  模块标识，例如 'records'
   * @param {object} meta { title, description, icon, order, folder }
   */
  PHR.registerModule = function (key, meta) {
    meta = meta || {};
    PHR.modules[key] = {
      key: key,
      title: meta.title || key,
      description: meta.description || '',
      icon: meta.icon || '•',
      folder: meta.folder || ('modules/' + key),
      order: typeof meta.order === 'number' ? meta.order : 99
    };
    return PHR.modules[key];
  };

  /** 按 order 升序返回全部模块 */
  PHR.sortedModules = function () {
    return Object.keys(PHR.modules)
      .map(function (k) { return PHR.modules[k]; })
      .sort(function (a, b) { return a.order - b.order; });
  };

  /* ------------------------------------------------------------------ *
   * 五、视图注册
   * ------------------------------------------------------------------ */
  /**
   * 注册一个页面视图。
   * @param {string} name 视图名，路由中通过 #/name 访问
   * @param {object} d    {
   *                        title, icon, group, order, nav, module,
   *                        requiresAuth, hideWhenGuest,
   *                        render(container, params)   // 必需
   *                        mount(container, params)    // 可选，render 之后调用
   *                        unmount()                   // 可选，切换离开时调用
   *                      }
   */
  PHR.registerView = function (name, d) {
    if (!d || typeof d.render !== 'function') {
      throw new Error('[PHR] 视图 "' + name + '" 必须提供 render(container, params) 方法');
    }
    PHR.views[name] = {
      name: name,
      title: d.title || name,
      icon: d.icon || '•',
      group: d.group || 'main',        // 导航分组：main / system
      module: d.module || '',          // 所属业务模块 key
      order: typeof d.order === 'number' ? d.order : 99,
      nav: d.nav !== false,            // 是否出现在左侧导航
      requiresAuth: d.requiresAuth !== false,
      hideWhenGuest: !!d.hideWhenGuest,
      render: d.render,
      mount: d.mount || null,
      unmount: d.unmount || null
    };
    return PHR.views[name];
  };

  /** 按 order 升序返回可导航视图 */
  PHR.navViews = function (group) {
    return Object.keys(PHR.views)
      .map(function (k) { return PHR.views[k]; })
      .filter(function (v) { return v.nav && (!group || v.group === group); })
      .sort(function (a, b) { return a.order - b.order; });
  };

  /* ------------------------------------------------------------------ *
   * 六、日志
   * ------------------------------------------------------------------ */
  PHR.log = function () {
    if (!PHR.config.debug) { return; }
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[PHR]');
    if (global.console && console.log) { console.log.apply(console, args); }
  };

  PHR.warn = function () {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[PHR]');
    if (global.console && console.warn) { console.warn.apply(console, args); }
  };

  /* ------------------------------------------------------------------ *
   * 取词快捷方式
   * ------------------------------------------------------------------
   * 全站统一的国际化取词入口，任何文件都能直接用，不必自己写局部助手：
   *
   *     PHR.t('nav.records', '健康档案')
   *             ↑ 词条键      ↑ 中文兜底（源码原文，原样保留）
   *
   * 英文词条存在 → 返回英文；缺失 → 返回中文兜底。
   * 因此**没翻译的地方照常显示中文，不会空白、不会报错**。
   * 词条维护在 core/i18n/en-US*.js，详见 core/i18n/README.md。
   * ------------------------------------------------------------------ */
  PHR.t = function (key, zh, params) {
    return (PHR.i18n && PHR.i18n.t) ? PHR.i18n.t(key, zh, params) : zh;
  };

  PHR.__namespaceReady = true;
  global.PHR = PHR;

})(window);
