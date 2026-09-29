/**
 * ============================================================================
 * 文件：ui/shell.js
 * 层：表现层（外壳）
 * 职责：应用外壳 —— 负责搭建整站骨架并根据登录状态与当前身份切换界面：
 *      ① 未登录    → 渲染「账号安全」模块提供的登录/注册/多因素认证界面
 *      ② 已登录    → 渲染侧边导航 + 顶栏 + 内容区的主框架
 *      ③ 医生身份  → 渲染精简导航（只能访问被授权的档案视图）
 *      同时负责：导航生成、面包屑、全局搜索框、会话倒计时、告警铃铛、
 *      主题切换、移动端抽屉、视图生命周期（mount/unmount）。
 * 依赖：core/*、ui/components/*、ui/router.js、modules/auth/*
 * 加载位置：必须放在所有业务模块之后、core/boot.js 之前
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  var refs = {};            // 关键 DOM 引用
  var currentView = null;   // 当前视图描述符
  var currentViewEl = null; // 当前视图自己的容器（每次渲染新建，见 render()）
  var clockTimer = null;
  var mode = 'patient';     // patient | doctor

  var logoutUnsub = null, alertUnsub = null;
  function bindShellHandlers() {
    if (logoutUnsub) { logoutUnsub(); }
    if (alertUnsub) { alertUnsub(); }
    logoutUnsub = PHR.bus.on('auth:logout', function (e) {
      if (!e || !e.uiReset) { return; }
      setMode('patient');
      boot();
      /* reason 'timeout' 现在表示"7 天登录保持到期"，不再是空闲超时。
         空闲自动退出这个功能已经删掉了 —— 见 core/security.js 的 sessionPolicy。 */
      if (e.reason === 'timeout') {
        PHR.ui.toast.warn(T('shell.idleLogout', '登录状态已到期，请重新登录'),
          { title: T('shell.sessionTimeout', '登录已过期') });
      }
    }, { persistent: true });
    alertUnsub = PHR.bus.on('shell:refreshAlertBadge', refreshAlertBadge, { persistent: true });
  }
  bindShellHandlers();
  /* 退出登录会清空事件总线，shell 需要在清空后重新订阅系统级事件（持久订阅） */
  PHR.bus.on('bus:cleared', bindShellHandlers, { persistent: true });

  /* 路由层通过事件总线通知 shell 渲染视图，避免 router 直接依赖 shell（持久订阅） */
  PHR.bus.on('router:view', function (e) { render(e.view, e.ctx); }, { persistent: true });

  /* 取词快捷方式：key 不存在时自动回退到第二个参数（中文原文） */
  function T(key, fallback, params) {
    return (PHR.i18n && PHR.i18n.t) ? PHR.i18n.t(key, fallback, params) : fallback;
  }
  /** 视图标题（标题词条约定为 view.<视图名>.title） */
  function viewTitle(v) {
    return T('view.' + v.name + '.title', v.title);
  }

  /* ================================================================== *
   * 一、启动
   * ================================================================== */
  function boot() {
    var app = document.getElementById('app');
    if (!app) {
      PHR.warn(PHR.t('shell.appMissing', '找不到 #app 容器，无法渲染界面。请确认页面里存在 <div id="app"></div>。'));
      return;
    }
    app.innerHTML = '';
    if (PHR.session && PHR.session.isLoggedIn()) {
      renderApp();
    } else if (mode === 'doctor' && PHR.session && PHR.session.isDoctorGuest && PHR.session.isDoctorGuest()) {
      renderApp();
    } else {
      renderAuth();
    }
  }

  /* ================================================================== *
   * 二、未登录界面
   * ================================================================== */
  function renderAuth(opt) {
    opt = opt || {};
    stopClock();
    var app = document.getElementById('app');
    var localePicker = '';
    if (PHR.i18n) {
      localePicker =
        '<div class="auth-language-row">' +
          '<span class="auth-language-label" aria-hidden="true">🌐</span>' +
          '<div class="segmented auth-language-switch" role="group" aria-label="' +
            dom.esc(T('shell.language', '界面语言')) + '">' +
            PHR.i18n.LOCALES.map(function (locale) {
              var selected = locale.key === PHR.i18n.current();
              return '<button type="button" data-auth-locale="' + dom.esc(locale.key) + '" ' +
                'aria-pressed="' + selected + '">' + dom.esc(locale.name) + '</button>';
            }).join('') +
          '</div>' +
        '</div>';
    }
    app.innerHTML =
      '<div class="auth-screen">' +
        '<section class="auth-brand">' +
          '<div class="brand-mark"><span class="logo">🩺</span><span>' + dom.esc(PHR.meta.appName) + '</span></div>' +
          '<div>' +
            '<h1>' + T('shell.brandHeadline', '把分散的<br>健康信息，<br>收进一个安全的地方') + '</h1>' +
            '<p class="lead">' + T('shell.brandLead',
              '体检报告、诊断记录、处方、用药与过敏史，往往散落在不同医院、不同时间、不同格式里。' +
              '本系统提供一个安全、集中、可搜索、能帮助理解身体状态的统一入口。') + '</p>' +
            '<ul class="brand-points">' +
              '<li><span class="dot">🔐</span><span>' +
                T('shell.point.secure', '<b>安全</b>：多因素登录、口令加盐哈希、会话自动超时') + '</span></li>' +
              '<li><span class="dot">🗂️</span><span>' +
                T('shell.point.controlled', '<b>可控</b>：14 类健康档案统一管理，每次修改保留版本') + '</span></li>' +
              '<li><span class="dot">📈</span><span>' +
                T('shell.point.understandable', '<b>可理解</b>：趋势图、异常提醒与预防建议') + '</span></li>' +
              '<li><span class="dot">👁️</span><span>' +
                T('shell.point.traceable', '<b>可追踪</b>：医生授权限时限范围，访问全程留痕') + '</span></li>' +
            '</ul>' +
          '</div>' +
          '<footer>' + dom.esc(PHR.meta.appName) + ' · v' + PHR.meta.version +
            '</footer>' +
        '</section>' +
        '<section class="auth-panel"><div class="auth-panel-inner">' +
          localePicker +
          '<div id="auth-root" class="auth-card"></div>' +
        '</div></section>' +
      '</div>';

    if (PHR.auth && PHR.auth.renderAuthView) {
      PHR.auth.renderAuthView(document.getElementById('auth-root'), {
        preservePanel: !!opt.preservePanel,
        formState: opt.formState || null
      });
    } else {
      dom.setHtml('#auth-root', PHR.ui.error(
        T('shell.authMissing', '账号安全模块未加载，请检查 modules/auth 下的脚本是否被正确引入。')));
    }

    var languageSwitch = app.querySelector('.auth-language-switch');
    if (languageSwitch) {
      languageSwitch.addEventListener('click', function (e) {
        var button = e.target.closest('[data-auth-locale]');
        if (!button || !PHR.i18n) { return; }
        var locale = button.getAttribute('data-auth-locale');
        if (locale === PHR.i18n.current()) { return; }
        PHR.i18n.setLocale(locale, { persist: true });
      });
    }
  }

  /* ================================================================== *
   * 三、主框架
   * ================================================================== */
  function renderApp() {
    var app = document.getElementById('app');
    app.innerHTML =
      '<div class="app-shell">' +
        '<aside class="sidebar" id="sidebar">' +
          /* 品牌图标。
             自定义：把图片放到 ui/assets/brand.png 即可自动替换掉默认的 🩺，
             不用改任何代码。图片不存在或加载失败时，onerror 会把它自己摘掉，
             露出下面那个 emoji 兜底 —— 所以这个位置留着图没放也不会开天窗。 */
          '<div class="sidebar-head">' +
            '<span class="logo" aria-hidden="true">' +
              '<img src="ui/assets/brand.png" alt="" onerror="this.remove()">' +
              '<span class="logo-fallback">🩺</span>' +
            '</span>' +
            '<div class="name">' + dom.esc(T('shell.appTitle', '个人健康档案')) + '</div>' +
          '</div>' +
          '<nav class="sidebar-nav" id="nav" aria-label="' + dom.esc(T('shell.mainNav', '主导航')) + '"></nav>' +
          '<div class="sidebar-foot" id="sidebar-foot"></div>' +
        '</aside>' +
        '<div class="main">' +
          '<header class="topbar">' +
            '<button class="icon-btn menu-toggle" id="btn-nav" aria-label="' +
              dom.esc(T('shell.menu', '打开导航')) + '">☰</button>' +
            '<div class="crumb" id="crumb"></div>' +
            '<div class="topbar-search">' +
              '<span class="ico">🔍</span>' +
              '<input type="search" id="global-search" placeholder="' +
                dom.esc(T('shell.searchPlaceholder', '搜索健康档案，按 Enter 进入检索  ( 按 / 聚焦 )')) +
                '" aria-label="' + dom.esc(T('shell.search', '全局搜索')) + '" autocomplete="off">' +
            '</div>' +
            '<span class="session-clock" id="session-clock" title="' +
              dom.esc(T('shell.autoLogout', '屏保倒计时')) + '"></span>' +
            '<button class="icon-btn" id="btn-alerts" aria-label="' +
              dom.esc(T('shell.alerts', '安全告警')) + '" title="' +
              dom.esc(T('shell.alerts', '安全告警')) + '">🔔' +
              '<span class="badge-dot hidden" id="alert-dot">0</span></button>' +
            '<button class="icon-btn" id="btn-lang" aria-label="' + dom.esc(T('shell.language', '界面语言')) +
              '" title="' + dom.esc(T('shell.language', '界面语言')) + '">🌐</button>' +
            '<button class="icon-btn" id="btn-theme" aria-label="' +
              dom.esc(T('shell.theme', '切换深浅色')) + '" title="' +
              dom.esc(T('shell.theme', '切换深浅色')) + '">🌓</button>' +
            '<button class="icon-btn" id="btn-logout" aria-label="' +
              dom.esc(T('shell.logout', '退出登录')) + '" title="' +
              dom.esc(T('shell.logout', '退出登录')) + '">⏻</button>' +
          '</header>' +
          '<main class="content" id="content" tabindex="-1">' +
            '<div class="content-inner" id="view-root"></div>' +
          '</main>' +
        '</div>' +
      '</div>' +
      /* 屏保层。刻意挂在 .app-shell **外面** —— 屏保生效时 .app-shell 整体隐藏，
         它必须在外面才留得下来。层本身是透明的，看到的就是 body 的整页背景图
         （可放 ui/assets/background.gif，见 ui/assets/README.md），不显示任何文字。
         想加回"点击任意处继续"的提示，在这里放一个
         `<div class="ss-hint">` + T('shell.screensaverHint', …) 即可，
         词条与样式都还留着。 */
      '<div id="screensaver"></div>';

    refs = {
      nav: document.getElementById('nav'),
      foot: document.getElementById('sidebar-foot'),
      crumb: document.getElementById('crumb'),
      content: document.getElementById('content'),
      root: document.getElementById('view-root'),
      clock: document.getElementById('session-clock'),
      alertDot: document.getElementById('alert-dot')
    };

    buildNav();
    buildUserChip();
    bindTopbar();
    startClock();
    refreshAlertBadge();

    // 路由启动（首次进入或退出登录后重新进入都会走到这里）
    PHR.router.start();
  }

  /* ---------------------------- 3.1 侧边导航 ---------------------------- */
  function buildNav() {
    if (!refs.nav) { return; }
    var groups = [
      { key: 'main', label: T('nav.group.main', '业务模块') },
      { key: 'system', label: T('nav.group.system', '系统与支持') }
    ];

    var html = '';
    groups.forEach(function (g) {
      var views = PHR.navViews(g.key).filter(function (v) {
        if (mode === 'doctor') { return v.name === 'doctor'; }
        return true;
      });
      if (!views.length) { return; }
      html += '<div class="nav-group"><div class="label">' + dom.esc(g.label) + '</div>';
      views.forEach(function (v) {
        var count = typeof v.badge === 'function' ? v.badge() : v.badge;
        html += '<a class="nav-item" href="' + PHR.router.url(v.name) + '" data-view="' + dom.esc(v.name) + '">' +
          '<span class="ico" aria-hidden="true">' + v.icon + '</span>' +
          '<span class="txt">' + dom.esc(viewTitle(v)) + '</span>' +
          (count ? '<span class="cnt' + (count > 99 ? '' : '') + '">' + (count > 99 ? '99+' : count) + '</span>' : '') +
          '</a>';
      });
      html += '</div>';
    });

    refs.nav.innerHTML = html;
    highlightNav(PHR.router.current().parts[0]);
  }

  function highlightNav(viewName) {
    if (!refs.nav) { return; }
    U.$$('.nav-item', refs.nav).forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-view') === viewName);
    });
  }

  function refreshNav() {
    buildNav();
    refreshAlertBadge();
  }

  /* ---------------------------- 3.2 用户卡片 ---------------------------- */
  function buildUserChip() {
    if (!refs.foot) { return; }
    if (mode === 'doctor') {
      var dc = PHR.session.currentDoctor && PHR.session.currentDoctor();
      refs.foot.innerHTML =
        '<div class="user-chip">' +
          '<span class="avatar" style="background:var(--info)">👨⚕️</span>' +
          '<div class="grow" style="min-width:0">' +
            '<div class="bold ellipsis">' + dom.esc(dc ? dc.name : T('shell.doctorGuest', '医生访客')) + '</div>' +
            '<div class="t-xs dim">' + dom.esc(T('shell.restricted', '受限访问模式')) + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-block mt3" data-action="exit-doctor">' +
          dom.esc(T('shell.exitDoctor', '退出医生视图')) + '</button>';
      return;
    }
    var user = PHR.session.currentUser();
    if (!user) { return; }
    var initial = (user.displayName || user.username || '?').slice(0, 1).toUpperCase();
    refs.foot.innerHTML =
      '<a class="user-chip" href="#/profile" style="text-decoration:none;color:inherit">' +
        '<span class="avatar">' + dom.esc(initial) + '</span>' +
        '<div class="grow" style="min-width:0">' +
          '<div class="bold ellipsis">' + dom.esc(user.displayName || user.username) + '</div>' +
          '<div class="t-xs dim">' + dom.esc(user.mfaEnabled
            ? T('shell.mfaOn', '🔐 已开启多因素认证')
            : T('shell.mfaOff', '⚠️ 建议开启多因素认证')) + '</div>' +
        '</div>' +
      '</a>';
  }

  /* ---------------------------- 3.3 顶栏事件 ---------------------------- */
  function bindTopbar() {
    var nav = document.getElementById('btn-nav');
    if (nav) {
      nav.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    }
    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('nav-open') &&
          !e.target.closest('#sidebar') && !e.target.closest('#btn-nav')) {
        document.body.classList.remove('nav-open');
      }
    });
    if (refs.nav) {
      refs.nav.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    }

    var search = document.getElementById('global-search');
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var q = search.value.trim();
          PHR.router.go('/search' + (q ? '?q=' + encodeURIComponent(q) : ''));
        }
      });
    }

    var alerts = document.getElementById('btn-alerts');
    if (alerts) { alerts.addEventListener('click', function () { PHR.router.go('/audit?tab=alerts'); }); }

    var theme = document.getElementById('btn-theme');
    if (theme) { theme.addEventListener('click', function () { PHR.ux && PHR.ux.toggleTheme(); }); }

    var lang = document.getElementById('btn-lang');
    if (lang) { lang.addEventListener('click', openLanguageDialog); }

    var logout = document.getElementById('btn-logout');
    if (logout) {
      logout.addEventListener('click', function () {
        if (mode === 'doctor') { exitDoctorMode(); return; }
        PHR.ui.confirm({
          title: T('shell.logout', '退出登录'),
          message: T('shell.logoutConfirm', '确定要退出当前账号吗？'),
          detail: T('shell.logoutDetail', '退出登录不会删除已保存的健康数据。'),
          confirmLabel: T('shell.logout', '退出登录'),
          tone: 'ghost'
        }).then(function (ok) { if (ok && PHR.auth) { PHR.auth.logout('manual'); } });
      });
    }

    // 侧栏底部按钮
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="exit-doctor"]')) { exitDoctorMode(); }
    });

    // 键盘快捷键：/ 聚焦搜索；g 开头组合键跳转
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) { return; }
      if (e.key === '/') {
        e.preventDefault();
        var s = document.getElementById('global-search');
        if (s) { s.focus(); s.select(); }
      }
      if (e.key === 'Escape') { document.body.classList.remove('nav-open'); }
    });
  }

  function refreshAlertBadge() {
    if (!refs.alertDot) { return; }
    var n = 0;
    try {
      if (PHR.audit && PHR.audit.countUnreadAlerts) { n = PHR.audit.countUnreadAlerts(); }
    } catch (e) { n = 0; }
    refs.alertDot.textContent = n > 99 ? '99+' : String(n);
    refs.alertDot.classList.toggle('hidden', n === 0);
  }

  /* ---------------------------- 3.3 语言切换 ---------------------------- */
  /**
   * 语言选择对话框。
   * 除了切换本身，这里还**如实展示翻译覆盖率** ——
   * 英文模式下未翻译的内容会显示中文原文，与其让用户困惑，
   * 不如直接把进度说清楚。
   */
  function openLanguageDialog() {
    if (!PHR.i18n) { return; }
    var cur = PHR.i18n.current();
    var cov = PHR.i18n.coverage();

    var body =
      PHR.ui.notice('info', T('shell.language', '界面语言'),
        T('i18n.partialNote',
          '部分内容仍在翻译中，未覆盖处会显示中文原文。'), { icon: '🌐' }) +
      '<div style="display:grid;gap:10px;margin-top:14px">' +
        PHR.i18n.LOCALES.map(function (l) {
          var on = l.key === cur;
          return '<button class="btn btn-block' + (on ? ' btn-primary' : '') + '" ' +
            'data-locale="' + dom.esc(l.key) + '" style="justify-content:flex-start;gap:10px">' +
            '<span class="badge tone-' + (on ? 'ok' : 'muted') + '">' + dom.esc(l.short) + '</span>' +
            '<span>' + dom.esc(l.name) + '</span>' +
            (on ? '<span class="ml2">✓</span>' : '') +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="row between t-sm"><span class="dim">' +
        dom.esc(T('i18n.coverage', '翻译覆盖率')) + '（' + dom.esc(T('i18n.coverageDesc', '字典词条')) + '）</span>' +
        '<b>' + cov.dictTranslated + ' / ' + cov.dictTotal + '　' + cov.dictPercent + '%</b></div>' +
      '<div class="progress mt2"><i style="width:' + cov.dictPercent + '%"></i></div>' +
      '<div class="t-xs dim mt2">' +
        T('i18n.entryNote',
          '英文词条共 {n} 条，维护在 <code>core/i18n/en-US.js</code>；' +
          '界面上看到哪句还是中文，在那里加一条即可，不需要改视图代码。',
          { n: cov.uiEntries }) +
      '</div>' +
      (cov.forced ? PHR.ui.notice('warn', '',
        T('i18n.forcedNote', '本次会话由 ?lang=en-US 启动，语言被强制指定，不会写回你的偏好设置。'),
        { icon: 'ℹ️' }) : '');

    var m = PHR.ui.modal({
      title: '🌐 ' + T('shell.language', '界面语言'),
      size: 'narrow',
      body: body,
      actions: [{ label: T('ui.close', '关闭'), tone: 'ghost' }]
    });

    m.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-locale]');
      if (!b) { return; }
      var key = b.getAttribute('data-locale');
      if (key === PHR.i18n.current()) { m.close('same'); return; }
      // 用户在界面里主动选择 → 写回偏好（与 ?lang= 的临时覆盖不同）
      PHR.i18n.setLocale(key, { persist: true });
      m.close('switched');
      PHR.router.reload();       // 重绘当前页面
    });
  }

  /** 语言变化后重建依赖文字的界面部分 */
  /**
   * 语言切换后，刷新外壳里那些"渲染时取一次词、平时不重建"的静态文案。
   *
   * renderApp() 只在启动与登录后跑，所以侧栏标题、搜索框占位、顶栏按钮的
   * aria/title 都是一次性的 —— 用户点 🌐 切语言时它们不会跟着变，
   * 表现为"左上角还写着中文"。导航与用户名片由 buildNav/buildUserChip 重建，
   * 这里补齐其余部分。
   */
  function refreshShellText() {
    var nm = document.querySelector('.sidebar-head .name');
    if (nm) { nm.textContent = T('shell.appTitle', '个人健康档案'); }

    [
      ['#nav', 'aria-label', T('shell.mainNav', '主导航')],
      ['#btn-nav', 'aria-label', T('shell.menu', '打开导航')],
      ['#global-search', 'placeholder', T('shell.searchPlaceholder', '搜索健康档案，按 Enter 进入检索  ( 按 / 聚焦 )')],
      ['#global-search', 'aria-label', T('shell.search', '全局搜索')],
      ['#session-clock', 'title', T('shell.autoLogout', '屏保倒计时')],
      ['#btn-alerts', 'aria-label', T('shell.alerts', '安全告警')],
      ['#btn-alerts', 'title', T('shell.alerts', '安全告警')],
      ['#btn-theme', 'aria-label', T('shell.theme', '切换深浅色')],
      ['#btn-theme', 'title', T('shell.theme', '切换深浅色')],
      ['#btn-lang', 'aria-label', T('shell.language', '界面语言')],
      ['#btn-lang', 'title', T('shell.language', '界面语言')],
      ['#btn-logout', 'aria-label', T('shell.logout', '退出登录')],
      ['#btn-logout', 'title', T('shell.logout', '退出登录')]
    ].forEach(function (m) {
      var el = document.querySelector(m[0]);
      if (el) { el.setAttribute(m[1], m[2]); }
    });
  }

  function onLocaleChanged() {
    var patientLoggedIn = PHR.session && PHR.session.isLoggedIn && PHR.session.isLoggedIn();
    var doctorLoggedIn = mode === 'doctor' && PHR.session && PHR.session.isDoctorGuest &&
      PHR.session.isDoctorGuest();

    /* 未登录界面没有主框架顶栏，因此语言切换器属于 auth shell 自己。
       切换后重建品牌文案与当前认证面板，同时把已输入的表单值交回 auth.view 恢复。 */
    if (!patientLoggedIn && !doctorLoggedIn) {
      var formState = PHR.auth && PHR.auth.captureAuthState
        ? PHR.auth.captureAuthState()
        : null;
      renderAuth({ preservePanel: true, formState: formState });
      return;
    }

    if (mode === 'patient' || mode === 'doctor') {
      buildNav();
      buildUserChip();
      refreshShellText();
    }
    document.title = document.title;   // 触发一次标题刷新
    var v = currentView;
    if (v) { renderCrumb(v, PHR.router.current()); document.title = viewTitle(v) + ' · ' + PHR.meta.appName; }
  }

  PHR.bus.on('locale:changed', onLocaleChanged);

  /* ---------------------------- 3.4 屏保与会话时钟 ----------------------------
   * 空闲 SCREENSAVER_SECONDS 秒后**不退出登录**，只把整个界面藏起来、露出
   * 整页背景图，像屏保一样；点一下 / 按任意键 / 移动鼠标即恢复。
   *
   * ⚠️ 这是"把画面遮起来"，不是锁屏 —— 谁点一下都能接着看。它只是观感，
   *    不承担任何安全职责。顶栏那个倒计时（#session-clock）数的就是它。
   *
   * 这里原本还有一句"真正的会话超时由 PHR.config.sessionIdleMinutes 独立把关，
   * 到点照常退出"。那个功能已经删掉了：登录状态现在是绝对到期（默认 7 天，
   * 见 core/security.js 的 sessionPolicy），没有空闲超时这回事。
   * 换句话说，SCREENSAVER_SECONDS 是现在唯一的"时间到了就做点什么"。
   */
  var SCREENSAVER_SECONDS = 30;
  var lastActiveAt = Date.now();
  var ssOn = false;

  function setScreensaver(on) {
    if (on === ssOn) { return; }
    ssOn = on;
    document.documentElement.classList.toggle('ss-on', on);
    if (refs.clock) { refs.clock.textContent = ''; }
    lastActiveAt = Date.now();          // 进出屏保都重新计时
  }

  /** 任何交互：重新计时，并把屏保收起来 */
  function onActivity() {
    lastActiveAt = Date.now();
    if (ssOn) { setScreensaver(false); }
  }

  function startClock() {
    stopClock();
    lastActiveAt = Date.now();
    clockTimer = setInterval(tickClock, 1000);
    tickClock();
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (evt) {
      document.addEventListener(evt, throttledTouch, { passive: true });
      document.addEventListener(evt, onActivity, { passive: true });
    });
  }

  var throttledTouch = U.throttle(function () {
    if (PHR.session && PHR.session.isLoggedIn()) { PHR.session.touch(); }
  }, 15000);

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    setScreensaver(false);              // 退出登录 / 回登录页时把屏保收掉
  }

  function tickClock() {
    if (!refs.clock) { return; }
    if (!PHR.session || !PHR.session.isLoggedIn()) { refs.clock.textContent = ''; return; }
    if (ssOn) { return; }
    var left = SCREENSAVER_SECONDS - Math.floor((Date.now() - lastActiveAt) / 1000);
    if (left <= 0) { setScreensaver(true); return; }
    refs.clock.textContent = '⏱ ' + Math.floor(left / 60) + ':' + U.pad2(left % 60);
    refs.clock.classList.toggle('warn', left <= 10);
  }

  /* ================================================================== *
   * 四、视图渲染
   * ================================================================== */
  function render(view, ctx) {
    if (!refs.root) { return; }

    // 卸载上一个视图
    if (currentView && typeof currentView.unmount === 'function') {
      try { currentView.unmount(); } catch (e) { PHR.warn(PHR.t('shell.unmountError', '视图卸载失败：{name}', { name: currentView.name }), e); }
    }

    // 权限守卫
    if (view.requiresAuth && !PHR.session.isLoggedIn() && !PHR.session.isDoctorGuest()) {
      renderAuth();
      return;
    }

    /* 医生访客守卫 —— 本规则只在这里写一次，全站生效。
     *
     * 医生访客是"凭授权码进入的受限身份"，他**只能**访问 doctor 视图本身。
     * 如果不设这道闸，在地址栏把 #/doctor 改成 #/records / #/timeline /
     * #/settings 就能绕过授权范围白名单，看到库里全部患者的档案 ——
     * 那样"授权只能看被授权的范围"这条承诺就形同虚设。
     *
     * 注意：此处必须放在 renderAuth 守卫之后，否则医生访客会被踢回登录页。
     */
    if (PHR.session.isDoctorGuest() && view.name !== 'doctor') {
      PHR.ui.toast.warn(T('shell.doctorBlocked', '您正在以受限身份浏览，只能查看患者授权给您的档案'), {
        title: T('shell.blockedTitle', '访问已拦截'),
        detail: T('shell.doctorBlockedDetail', '如需查看其它内容，请让患者创建对应的授权。')
      });
      PHR.router.go('/doctor', true);
      return;
    }

    currentView = view;
    highlightNav(ctx.parts[0]);
    renderCrumb(view, ctx);

    refs.root.className = 'content-inner';
    refs.root.innerHTML = '';

    /* ------------------------------------------------------------------ *
     * 每个视图渲染到一个**全新的子容器**里，而不是直接渲染进 #view-root。
     *
     * 为什么这么做（这是一个真实踩过的坑）：
     *   #view-root 是 shell 复用的同一个元素。如果视图把事件委托挂到它上面
     *   （早期的 records.view.js 就是这么写的），切到别的页面后监听器**依然存活**。
     *   而不同视图常常用相同的 data-* 属性名（例如 records 与 timeline 都用
     *   data-type 表示"记录类型"），于是时间线上的按钮会触发档案页遗留的
     *   处理器，去操作一个已经不存在于 DOM 里的 #list-sub，直接抛
     *   "Cannot set properties of null"。
     *
     *   换成每次新建 viewEl 之后，旧容器连同它身上所有监听器一起被回收，
     *   这类跨视图串扰从根上消失 —— 视图作者也不必再记得手动解绑。
     * ------------------------------------------------------------------ */
    var viewEl = document.createElement('div');
    viewEl.className = 'view-enter';
    refs.root.appendChild(viewEl);
    currentViewEl = viewEl;          // 供视图用 PHR.shell.viewEl() 重新取回自己的容器

    setTimeout(function () {
      if (viewEl && viewEl.parentNode) { viewEl.classList.remove('view-enter'); }
    }, 340);

    var params = Object.assign({}, ctx.params, ctx.query, { parts: ctx.parts, path: ctx.path });

    try {
      view.render(viewEl, params);
    } catch (e) {
      PHR.warn(PHR.t('shell.renderError', '视图渲染失败：{name}', { name: view.name }), e);
      viewEl.innerHTML = PHR.ui.error(
        T('shell.renderError', '页面渲染出错：') + (e && e.message ? e.message : e));
      return;
    }

    if (typeof view.mount === 'function') {
      try { view.mount(viewEl, params); } catch (e) { PHR.warn(PHR.t('shell.mountError', '视图挂载失败：{name}', { name: view.name }), e); }
    }

    // 记录访问（不记录自身刷新的审计页，避免自激）
    if (view.auditView !== false && view.name !== 'audit' && PHR.audit && PHR.audit.logView) {
      PHR.audit.logView(view);
    }

    if (refs.content) { refs.content.scrollTop = 0; }
    document.title = viewTitle(view) + ' · ' + PHR.meta.appName;
  }

  function renderCrumb(view, ctx) {
    if (!refs.crumb) { return; }
    var mod = view.module && PHR.modules[view.module];
    var parts = [];
    if (mod) { parts.push('<span>' + dom.esc(T('module.' + view.module + '.title', mod.title)) + '</span>'); }
    parts.push('<span class="cur">' + dom.esc(viewTitle(view)) + '</span>');
    refs.crumb.innerHTML = parts.join('<span class="sep">/</span>');
  }

  /* ================================================================== *
   * 五、医生受限模式
   * ================================================================== */
  function enterDoctorMode() {
    mode = 'doctor';
    boot();
  }

  function exitDoctorMode() {
    mode = 'patient';
    if (PHR.session && PHR.session.clearDoctorGuest) { PHR.session.clearDoctorGuest(); }
    boot();
    PHR.router.go('/dashboard');
  }

  function setMode(m) {
    mode = m === 'doctor' ? 'doctor' : 'patient';
  }

  /* ================================================================== *
   * 六、对外接口
   * ================================================================== */
  PHR.shell = {
    boot: boot,
    renderAuth: renderAuth,
    renderApp: renderApp,
    render: render,
    refreshNav: refreshNav,
    refreshAlertBadge: refreshAlertBadge,
    enterDoctorMode: enterDoctorMode,
    exitDoctorMode: exitDoctorMode,
    setMode: setMode,
    getMode: function () { return mode; },
    refs: function () { return refs; },
    currentView: function () { return currentView; },

    /**
     * 取当前视图自己的容器元素。
     *
     * 视图用它来重新定位自己 —— 不要写 document.getElementById('view-root')：
     * 那个元素是 shell 复用的外壳容器，视图内容其实渲染在它的一个子 div 里，
     * 直接往外壳里写 innerHTML 会把这个子容器（连同视图的所有事件监听器）
     * 一起冲掉，跨视图串扰就会回来。
     */
    viewEl: function () {
      return (currentViewEl && document.body.contains(currentViewEl))
        ? currentViewEl
        : refs.root;
    }
  };

})(window.PHR);
