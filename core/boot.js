/**
 * ============================================================================
 * 文件：core/boot.js
 * 层：核心基础设施层（应用引导）
 * 职责：应用装配与启动 —— 这是整个系统**最后一个被加载**的脚本。
 *      它按固定顺序完成：
 *        ① 全局错误兜底
 *        ② 首次运行写入示例数据
 *        ③ 应用用户偏好（主题 / 字号 / 对比度 / 动效）
 *        ④ 清理过期数据（审计日志、失效授权）
 *        ⑤ 构建界面外壳并启动路由
 *        ⑥ 自检并输出诊断报告
 * 依赖：core/* 全部、ui/* 全部、modules/* 全部
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ================================================================== *
   * 一、全局错误兜底
   *     任何一个模块抛错都不应该让整个页面白屏。
   * ================================================================== */
  function installErrorGuard() {
    window.addEventListener('error', function (e) {
      PHR.warn(PHR.t('boot.error.uncaught', '未捕获的错误'), e.error || e.message);
      // 只在已经渲染出内容时提示，避免启动阶段的错误刷屏
      if (document.getElementById('app') && document.getElementById('app').children.length) {
        try {
          PHR.ui.toast.danger(PHR.t('boot.error.toast', '页面出现了一个错误，操作可能未生效'), {
            title: PHR.t('boot.error.title', '系统提示'),
            detail: String((e.error && e.error.message) || e.message || '').slice(0, 120),
            duration: 6000
          });
        } catch (err) { /* 忽略 */ }
      }
    });

    window.addEventListener('unhandledrejection', function (e) {
      PHR.warn(PHR.t('boot.error.promise', '未处理的 Promise 拒绝'), e.reason);
    });
  }

  /* ================================================================== *
   * 二、示例数据
   * ================================================================== */
  function ensureSeed() {
    try {
      var created = PHR.seed.run(false);
      if (created) { PHR.log(PHR.t('boot.seed.firstRun', '首次运行：已写入示例数据')); }
    } catch (e) {
      PHR.warn(PHR.t('boot.seed.fail', '示例数据写入失败'), e);
      try {
        PHR.ui.toast.warn(PHR.t('boot.seed.toast', '数据初始化失败，您可以手动注册账号使用'), { duration: 6000 });
      } catch (err) { /* 忽略 */ }
    }
  }

  /* ================================================================== *
   * 三、语言
   *     必须在 shell 渲染之前决定，否则导航与页面标题会先渲染成中文。
   *     决定顺序见 core/i18n/i18n.js 的 detect()：
   *       ?lang= 参数 → 用户上次的选择 → 浏览器语言 → 默认中文
   * ================================================================== */
  /** 翻译 index.html 里带有 data-i18n 的静态元素（启动遮罩、title、meta、app aria-label） */
  function translateStatic() {
    if (!PHR.i18n) { return; }
    var nodes = document.querySelectorAll && document.querySelectorAll('[data-i18n]');
    if (!nodes || !nodes.length) { return; }
    Array.prototype.forEach.call(nodes, function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) { return; }
      var fallback = el.textContent || el.getAttribute('content') || el.getAttribute('aria-label') || '';
      var translated = PHR.t(key, fallback);
      if (el.tagName === 'TITLE') { el.textContent = translated; }
      else if (el.tagName === 'META' && el.hasAttribute('content')) { el.setAttribute('content', translated); }
      else if (el.hasAttribute('aria-label')) { el.setAttribute('aria-label', translated); }
      else { el.textContent = translated; }
      el.removeAttribute('data-i18n');
    });
  }

  function applyLocale() {
    try {
      if (!PHR.i18n) { return; }
      var loc = PHR.i18n.detect();
      translateStatic();
      PHR.log(PHR.t('boot.locale.applied', '界面语言：{lang}', { lang: loc }) +
              (PHR.i18n.fromQuery() ? PHR.t('boot.locale.forced', '（由 ?lang= 参数指定）') : ''));
    } catch (e) {
      PHR.warn(PHR.t('boot.locale.fail', '语言初始化失败'), e);
    }
  }

  /* ================================================================== *
   * 四、偏好应用
   * ================================================================== */
  function applyPreferences() {
    try {
      if (PHR.ux && PHR.ux.preference && PHR.ux.preference.apply) {
        PHR.ux.preference.apply();
      } else {
        // 体验保障模块未加载时的降级：跟随系统深浅色
        var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      }
    } catch (e) {
      PHR.warn(PHR.t('boot.pref.fail', '偏好应用失败'), e);
    }
  }

  /* ================================================================== *
   * 四、过期数据清理
   * ================================================================== */
  function housekeeping() {
    try {
      if (PHR.audit && PHR.audit.purgeExpired) { PHR.audit.purgeExpired(); }
      if (PHR.consent && PHR.consent.sweepExpired) { PHR.consent.sweepExpired(); }
    } catch (e) {
      PHR.warn(PHR.t('boot.housekeeping.fail', '清理任务失败'), e);
    }
  }

  /* ================================================================== *
   * 五、启动
   * ================================================================== */
  function start() {
    var t0 = Date.now();

    /* 重置数据库的入口：由「重置数据库.bat」以 ?reset=1 打开本页。
       必须在这里、在一切之前取出来 —— 再晚一点 router.go(path, true) 的
       replaceState(null,'','#/…') 会把查询串整体丢掉（登录成功后就会调它）。
       见下面 takeResetFlag 的注释。 */
    var resetRequested = takeResetFlag();

    installErrorGuard();
    // 语言必须在播种示例数据之前决定，否则 seed.js 里的 U.t() 会按默认中文入库，
    // 导致英文启动器下社群帖子、病历内容等仍显示中文。
    applyLocale();
    ensureSeed();
    applyPreferences();
    housekeeping();

    // 构建界面
    PHR.shell.boot();
    PHR.router.start();

    // 关闭启动遮罩
    var boot = document.getElementById('boot-screen');
    if (boot) {
      boot.classList.add('is-done');
      setTimeout(function () { if (boot.parentNode) { boot.parentNode.removeChild(boot); } }, 420);
    }

    PHR.config.debug = PHR.store.read('debug_mode', false) === true;
    PHR.log(PHR.t('boot.startup.done', '启动完成，耗时 {ms} ms', { ms: Date.now() - t0 }));

    PHR.bus.emit('app:ready', { took: Date.now() - t0 });

    // 控制台欢迎信息（方便评审与维护人员排查）
    if (window.console && console.info) {
      console.info(
        '%c' + PHR.meta.appName + ' v' + PHR.meta.version,
        'font-size:15px;font-weight:700;color:#0e7490',
        '\n' + PHR.t('boot.console.demoAccount', '示例账号：{username} / {password}',
          { username: PHR.seed.demo.username, password: PHR.seed.demo.password }) +
        '\n' + PHR.t('boot.console.selfTest', '自检：PHR.boot.selfTest()') + '　' +
        PHR.t('boot.console.debug', '打开调试日志：PHR.boot.debug(true)') +
        '\n' + PHR.t('boot.console.seed', '重建示例数据：PHR.seed.run(true)（会清空现有数据）')
      );
    }

    /* 放在最后：此时语言已定、界面已渲染、示例数据已就绪 ——
       用户就算点"取消"，留下的也是一个完全正常的应用。 */
    if (resetRequested) { resetFromQuery(); }
  }

  /* ================================================================== *
   * 五之二、?reset=1 —— 重置数据库
   * ================================================================== */
  var RESET_MARK = 'phr.reset.handled';
  var RESET_MARK_TTL = 10000;   // 10 秒内不重复处理同一个重置请求

  /**
   * 取出并消费地址栏里的 ?reset=1。
   *
   * 双重保险：既尽量把参数从地址栏抹掉，又用 sessionStorage 记一个时间戳
   * 防止同一个请求被处理两次。为什么不能只靠抹地址栏：
   * file:// 下 history.replaceState 会抛 SecurityError
   * （ui/router.js 与 modules/ux/ux.view.js 里已有同样的 try/catch）。
   *
   * 标记带 10 秒有效期，而不是"整个标签页只用一次" ——
   * 否则用户取消之后想再来一次，就得关掉标签页重开，太别扭。
   */
  function takeResetFlag() {
    if (!/[?&]reset=1\b/.test(String(location.search || ''))) { return false; }
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* file:// 下忽略 */ }
    try {
      var last = Number(window.sessionStorage.getItem(RESET_MARK) || 0);
      if (last && (Date.now() - last) < RESET_MARK_TTL) { return false; }
    } catch (e) { /* 取不到 sessionStorage 就只靠地址栏抹除 */ }
    return true;
  }

  function markResetHandled() {
    try { window.sessionStorage.setItem(RESET_MARK, String(Date.now())); } catch (e) { /* 忽略 */ }
  }

  /**
   * 弹二次确认，确认后恢复内置示例数据。
   * 走的是设置页那个现成的 PHR.ux.backup.resetDemo()，不另写一份实现 ——
   * 审计日志、提示文案、清理范围都和界面里点按钮完全一致。
   */
  function resetFromQuery() {
    PHR.ui.confirm({
      title: PHR.t('ux.resetDemo.title', '恢复示例数据'),
      message: PHR.t('ux.resetDemo.message', '将清空本地现有数据，并恢复一套示例健康档案。'),
      detail: PHR.t('ux.resetDemo.fileDetail',
        '本次由「重置数据库.bat」发起：你新增的记录、帖子、注册的账号会被清空，' +
        '内置示例数据（张小雨的档案、已有的社群帖子等）会重新写入。此操作不可撤销。'),
      confirmLabel: PHR.t('ux.resetDemo.confirm', '恢复示例数据'),
      requireText: PHR.t('ux.resetDemo.requireText', '确认恢复'),
      tone: 'danger'
    }).then(function (ok) {
      if (!ok) {
        PHR.ui.toast.info(PHR.t('ux.resetDemo.cancelled', '已取消，数据保持不变'));
        return;
      }
      PHR.ux.backup.resetDemo();
      if (PHR.ux.preference && PHR.ux.preference.apply) { PHR.ux.preference.apply(); }
      markResetHandled();
      PHR.ui.toast.ok(PHR.t('ux.resetDemo.done', '示例数据已恢复'));

      /* 必须等真正落盘再报"已写入"：数据库模式下重置完就关窗口的话，
         没落盘的改动会连同重置一起丢掉，用户下次打开会发现白重置了。 */
      PHR.store.flush().then(function (r) {
        if (r && r.ok && !r.skipped) {
          PHR.ui.toast.ok(PHR.t('ux.resetDemo.flushed', '已写入 data/database.json'));
        }
        try { PHR.router.reload(); } catch (e) { /* 登录页下没有可重载的视图 */ }
      });
    });
  }

  /* ================================================================== *
   * 六、自检
   * ================================================================== */
  /**
   * 检查各模块是否正确加载、数据是否可读。
   * 在浏览器控制台执行 PHR.boot.selfTest() 即可得到一份诊断报告，
   * 也可以访问  #/help  页面中的「系统自检」查看。
   */
  function selfTest() {
    var checks = [];

    function check(name, fn, expect) {
      var value, ok = false, note = '';
      try {
        value = fn();
        ok = expect ? !!expect(value) : !!value;
        if (typeof value === 'object' && value !== null && value.count !== undefined) {
          note = PHR.t('boot.selfTest.count', '{count} 项', { count: value.count });
        }
      } catch (e) {
        note = PHR.t('boot.selfTest.exception', '异常：{msg}', { msg: e && e.message ? e.message : e });
      }
      checks.push({ name: name, ok: ok, note: note, value: typeof value === 'object' ? undefined : value });
      return ok;
    }

    // 核心层
    check(PHR.t('boot.selfTest.core.namespace', '核心 · 命名空间'), function () { return PHR.meta && PHR.meta.version; });
    check(PHR.t('boot.selfTest.core.dict', '核心 · 数据字典'), function () { return PHR.dict.recordTypes; }, function (v) { return v && v.length === 14; });
    check(PHR.t('boot.selfTest.core.metrics', '核心 · 指标字典'), function () { return PHR.dict.metrics; }, function (v) { return v && v.length >= 10; });
    check(PHR.t('boot.selfTest.core.store', '核心 · 存储引擎'), function () { return PHR.store.driver; });
    check(PHR.t('boot.selfTest.core.crypto', '核心 · 口令哈希'), function () {
      var h = PHR.crypto.hashPassword('Test@1234');
      return PHR.crypto.verifyPassword('Test@1234', h) && !PHR.crypto.verifyPassword('wrong', h);
    });
    check(PHR.t('boot.selfTest.core.encrypt', '核心 · 加解密往返'), function () {
      var enc = PHR.crypto.encrypt({ a: 1, b: '中文' }, 'key');
      var dec = PHR.crypto.decrypt(enc, 'key');
      return dec && dec.b === '中文';
    });
    check(PHR.t('boot.selfTest.core.collections', '核心 · 数据集合'), function () { return PHR.db.schema; }, function (v) { return Object.keys(v).length >= 10; });
    check(PHR.t('boot.selfTest.core.seed', '核心 · 示例数据'), function () { return PHR.db.records.count(); }, function (v) { return v > 0; });
    check(PHR.t('boot.selfTest.core.security', '核心 · 安全治理层'), function () { return PHR.security.anomalyRules; }, function (v) { return v.length >= 5; });

    // 业务模块
    check(PHR.t('boot.selfTest.mod1.auth', '模块1 · 账号安全'), function () { return PHR.auth && PHR.session && PHR.mfa && PHR.lockout; });
    check(PHR.t('boot.selfTest.mod2.records', '模块2 · 档案中心'), function () { return PHR.records && PHR.records.service && PHR.records.profile; });
    check(PHR.t('boot.selfTest.mod2.vital', '模块2 · 体征指标'), function () { return PHR.records.vital; });
    check(PHR.t('boot.selfTest.mod2.versions', '模块2 · 版本历史'), function () { return PHR.records.versions; }, function (v) { return v && v.snapshot; });
    check(PHR.t('boot.selfTest.mod2.sync', '模块2 · 医院同步'), function () { return PHR.records.sync; });
    check(PHR.t('boot.selfTest.mod3.search', '模块3 · 智能搜索'), function () { return PHR.search && PHR.search.service; });
    check(PHR.t('boot.selfTest.mod3.fuzzy', '模块3 · 模糊算法'), function () { return PHR.search && PHR.search.fuzzy; });
    check(PHR.t('boot.selfTest.mod4.insight', '模块4 · 健康洞察'), function () { return PHR.insight && PHR.insight.trend; });
    check(PHR.t('boot.selfTest.mod4.risk', '模块4 · 风险评估'), function () { return PHR.insight && PHR.insight.risk; });
    check(PHR.t('boot.selfTest.mod5.consent', '模块5 · 医生授权'), function () { return PHR.consent && PHR.consent.grant && PHR.consent.verifyCode; });
    check(PHR.t('boot.selfTest.mod6.audit', '模块6 · 访问追踪'), function () { return PHR.audit && PHR.audit.log && PHR.audit.scanAlerts; });
    check(PHR.t('boot.selfTest.mod7.community', '模块7 · 患者社群'), function () { return PHR.community && PHR.community.service && PHR.community.moderation; });
    check(PHR.t('boot.selfTest.mod8.ux', '模块8 · 体验保障'), function () { return PHR.ux && PHR.ux.preference && PHR.ux.backup; });
    check(PHR.t('boot.selfTest.mod9.assessment', '模块9 · 心理测评'), function () { return PHR.assessment && PHR.assessment.scales && PHR.assessment.submit; });
    check(PHR.t('boot.selfTest.mod9.scoring', '模块9 · 计分与分级'), function () {
      var r = PHR.assessment.scoring.score('phq9', { 1:1,2:1,3:1,4:1,5:1,6:1,7:1,8:1,9:0 });
      return r && r.total === 8 && r.level.key === 'mild';
    });
    check(PHR.t('boot.selfTest.mod9.reverse', '模块9 · 反向计分生效'), function () {
      var a = {}; for (var i = 1; i <= 10; i++) { a[i] = 4; }
      return PHR.assessment.scoring.score('pss10', a).total === 24;
    });
    check(PHR.t('boot.selfTest.mod9.scoped', '模块9 · 越权判定'), function () {
      var row = { id: 'E1', userId: 'U1' };
      return PHR.security.canViewScoped(row, { userId: 'U1', scopes: ['basic'], recordIds: [] }, 'psych') === false &&
             PHR.security.canViewScoped(row, { userId: 'U1', scopes: ['psych'], recordIds: [] }, 'psych') === true;
    });

    // 视图
    var required = ['dashboard', 'records', 'records-edit', 'timeline', 'search', 'insight',
                    'consent', 'audit', 'community', 'settings', 'help', 'profile', 'basic',
                    'assessment', 'assessment-take', 'assessment-report'];
    var missing = required.filter(function (v) { return !PHR.views[v]; });
    checks.push({
      name: PHR.t('boot.selfTest.views', '视图 · 已注册页面'), ok: missing.length === 0,
      note: PHR.t('boot.selfTest.views.note', '{count} 个页面', { count: Object.keys(PHR.views).length }) +
            (missing.length ? PHR.t('boot.selfTest.views.missing', '，缺少：{list}', { list: missing.join('、') }) : ''),
      value: missing
    });

    var passed = checks.filter(function (c) { return c.ok; }).length;
    var report = {
      app: PHR.meta.appName,
      version: PHR.meta.version,
      time: U.fmtFull(Date.now()),
      storage: PHR.store.describe() + (PHR.store.persistent
        ? PHR.t('boot.selfTest.storage.persistent', '（可持久保存）')
        : PHR.t('boot.selfTest.storage.memory', '（关闭页面即丢失）')),
      /* 数据表计数：遍历 schema 自动收集，新增集合时不必再改这里 */
      counts: Object.keys(PHR.db.schema).reduce(function (acc, k) {
        try { acc[k] = PHR.db[k].count(); } catch (e) { acc[k] = -1; }
        return acc;
      }, {}),
      modules: PHR.sortedModules().length,
      views: Object.keys(PHR.views).length,
      checks: checks,
      passed: passed,
      total: checks.length,
      ok: passed === checks.length,
      missingViews: missing
    };

    if (window.console && console.table) {
      console.table(checks.map(function (c) {
        var row = {};
        row[PHR.t('boot.selfTest.col.name', '检查项')] = c.name;
        row[PHR.t('boot.selfTest.col.result', '结果')] = c.ok ? PHR.t('boot.selfTest.pass', '✅ 通过') : PHR.t('boot.selfTest.fail', '❌ 失败');
        row[PHR.t('boot.selfTest.col.note', '说明')] = c.note;
        return row;
      }));
    }
    return report;
  }

  /** 开关调试日志 */
  function debug(on) {
    PHR.config.debug = on !== false;
    PHR.store.write('debug_mode', PHR.config.debug);
    PHR.log(PHR.t('boot.debug.' + (PHR.config.debug ? 'on' : 'off'), '调试日志已' + (PHR.config.debug ? '开启' : '关闭')));
    return PHR.config.debug;
  }

  /* ================================================================== *
   * 七、装配
   * ================================================================== */
  PHR.boot = {
    start: start,
    selfTest: selfTest,
    debug: debug,
    ensureSeed: ensureSeed,
    housekeeping: housekeeping
  };

  /* DOM 就绪后启动。
     —— 为什么要分两段 ——
     通过本地服务打开时（core/store.file.js），整库镜像是**异步**读进来的：
     镜像没装好就读数据库，会读到一片空白，然后"首次运行"逻辑会把示例数据
     灌进去、覆盖掉用户的真实数据。所以 file 模式下必须先等 store.whenReady()。
     双击 index.html（file://）时 store.ready 恒为 true，走上面的同步分支，
     行为与改造前逐字节一致。 */
  function bootstrap() {
    if (PHR.store && PHR.store.ready === false) {
      PHR.store.whenReady(start);
      return;
    }
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})(window.PHR);
