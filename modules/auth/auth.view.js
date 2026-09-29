/**
 * ============================================================================
 * 文件：modules/auth/auth.view.js
 * 层：业务模块层（账号安全 —— 模块 1）
 * 职责：渲染登录 / 注册 / 多因素认证三块界面。
 *      由 ui/shell.js 在未登录时调用 PHR.auth.renderAuthView(container) 渲染。
 * 依赖：modules/auth/auth.service.js、mfa.js、lockout.js、
 *      ui/components/{dom,toast,notice}.js、core/security.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  var state = { panel: 'login' };
  var refs = {};

  /* ================================================================== *
   * 一、入口
   * ================================================================== */
  function renderAuthView(root, opt) {
    opt = opt || {};
    refs.root = root;
    if (opt.formState && opt.formState.panel) {
      state.panel = opt.formState.panel;
    }
    if (PHR.mfa.pending()) {
      state.panel = 'mfa';
      drawMfa();
    } else {
      if (!opt.preservePanel || ['login', 'register'].indexOf(state.panel) < 0) {
        state.panel = 'login';
      }
      drawAuth();
    }
    restoreAuthState(opt.formState);
  }

  /**
   * 语言切换会重绘未登录外壳。先保存当前页签和表单值，避免用户在注册页
   * 切到英文后被送回登录页，或丢失已经填写的账号、手机号和验证码。
   */
  function captureAuthState() {
    var root = refs.root;
    if (!root || !document.documentElement.contains(root)) {
      return { panel: state.panel, fields: [] };
    }
    var fields = Array.prototype.map.call(
      root.querySelectorAll('input, textarea, select'),
      function (el, index) {
        var checkable = el.type === 'checkbox' || el.type === 'radio';
        return {
          id: el.id || '',
          index: index,
          value: el.value,
          checked: checkable ? el.checked : null,
          checkable: checkable
        };
      }
    );
    return { panel: state.panel, fields: fields };
  }

  function restoreAuthState(snapshot) {
    if (!snapshot || !snapshot.fields || !refs.root) { return; }
    var fields = refs.root.querySelectorAll('input, textarea, select');
    snapshot.fields.forEach(function (saved) {
      var el = saved.id ? document.getElementById(saved.id) : null;
      if (!el || !refs.root.contains(el)) { el = fields[saved.index]; }
      if (!el) { return; }
      if (saved.checkable) { el.checked = !!saved.checked; }
      else { el.value = saved.value; }
    });

    /* 注册密码强度条依赖 input 事件，恢复值后单独刷新它的展示。 */
    var pwd = document.getElementById('rg-password');
    if (pwd && pwd.value) {
      pwd.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ================================================================== *
   * 二、登录 / 注册
   * ================================================================== */
  function drawAuth() {
    var root = refs.root;
    root.innerHTML =
      '<h2 id="auth-title">' + U.t('auth.welcome', '欢迎回来') + '</h2>' +
      '<p class="sub">' + U.t('auth.subtitle',
        '登录后即可管理您的健康档案。') + '</p>' +
      '<div class="auth-tabs" role="tablist">' +
        '<button role="tab" data-panel="login" aria-selected="' + (state.panel === 'login') + '">' +
          U.t('auth.tab.login', '登录') + '</button>' +
        '<button role="tab" data-panel="register" aria-selected="' + (state.panel === 'register') + '">' +
          U.t('auth.tab.register', '注册新账号') + '</button>' +
      '</div>' +
      '<div id="auth-body"></div>';

    root.querySelector('.auth-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-panel]');
      if (!b) { return; }
      state.panel = b.getAttribute('data-panel');
      drawAuth();
    });

    /* 注意：不要在这里再挂一遍 'goto-doctor'。
       「我是医生…」按钮渲染在 #auth-body **里面**，而 #auth-body 又嵌在
       #auth-root 里；两层各挂一次委托的话，一次点击会冒泡触发两次 ——
       表现为"点一下打开两个医生验证窗口"。处理器只挂在直接父容器上就够了。 */

    if (state.panel === 'login') { drawLogin(); } else { drawRegister(); }
  }

  /* ------------------------------ 登录表单 ------------------------------ */
  function drawLogin() {
    var body = document.getElementById('auth-body');
    body.innerHTML =
      '<form id="login-form" novalidate>' +
        '<div class="field">' +
          '<label for="lg-account">' + U.t('auth.account', '账号 / 手机号') + '</label>' +
          '<input class="input" id="lg-account" name="account" autocomplete="username" ' +
            'placeholder="' + U.t('auth.accountPlaceholder', '请输入账号或手机号') + '" value="">' +
        '</div>' +
        '<div class="field">' +
          '<label for="lg-password">' + U.t('auth.password', '密码') + '</label>' +
          '<div class="input-group">' +
            '<input class="input" id="lg-password" name="password" type="password" ' +
              'autocomplete="current-password" placeholder="' + U.t('auth.passwordPlaceholder', '请输入密码') + '">' +
            '<button class="btn" type="button" data-action="toggle-pwd" aria-label="' +
              U.t('auth.showPassword', '显示密码') + '">👁</button>' +
          '</div>' +
        '</div>' +
        '<div id="login-msg"></div>' +
        '<button class="btn btn-primary btn-lg btn-block" type="submit" id="lg-submit">' +
          U.t('auth.signIn', '登 录') + '</button>' +
        '<div class="row between mt4">' +
          /* 这个勾选框同时管两件事：下次自动填上账号名，以及登录状态保持 7 天
             （存在 localStorage，重开浏览器不用再输口令）。不勾则只保留到
             关掉标签页 —— 见 modules/auth/session.js 与 core/security.js。
             它和设置页的「登录保持」开关写的是同一个键 sessionRememberDays，
             所以两处永远一致，不存在"这里开了那里还关着"的状态。 */
          '<label class="checkbox"><input type="checkbox" id="lg-remember"' +
            (PHR.session.rememberDays() > 0 ? ' checked' : '') + '>' +
            '<span>' + U.t('auth.remember', '7 天内自动登录') + '</span></label>' +
          '<a href="#" data-action="forgot">' + U.t('auth.forgot', '忘记密码？') + '</a>' +
        '</div>' +
        /* 演示账号快捷入口。说明性文字不铺在界面上，收进后面的 ⓘ 悬停提示 */
        '<div class="row mt3" style="align-items:center;gap:6px">' +
          '<button class="btn btn-sm" type="button" data-action="fill-demo">' +
            U.t('auth.demo.fill', '⚡ 一键填入演示账号') + '</button>' +
          dom.tip(demoTip(), U.t('auth.demo.tipLabel', '演示账号与验证码说明')) +
        '</div>' +
        '<div class="divider"></div>' +
        '<button class="btn btn-block" type="button" data-action="goto-doctor">' +
          U.t('auth.doctorEntry', '👨‍⚕️ 我是医生，用授权码查看患者档案') + '</button>' +
      '</form>';

    var form = document.getElementById('login-form');
    var accountInput = document.getElementById('lg-account');
    var remember = PHR.store.read('remembered_account', '');
    if (remember && accountInput) { accountInput.value = remember; }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        doLogin();
      });
    }

    dom.actions(body, {
      'toggle-pwd': function (e, el) {
        var p = document.getElementById('lg-password');
        if (!p) { return; }
        p.type = p.type === 'password' ? 'text' : 'password';
        el.textContent = p.type === 'password' ? '👁' : '🙈';
      },
      forgot: function () {
        PHR.ui.modal({
          title: U.t('auth.forgot.title', '忘记密码怎么办？'),
          body:
            PHR.ui.notice('info',
              U.t('auth.forgot.tipTitle', '请使用已绑定的手机号重置'),
              U.t('auth.forgot.tipBody',
                '登录页目前支持账号密码登录。如需重置密码，请使用注册时绑定的手机号接收验证码后重设。'),
              { icon: 'ℹ️' }) +
            '<p>' + U.t('auth.forgot.intro', '如果您无法登录，可以尝试：') + '</p>' +
            '<ol>' +
              '<li>' + U.t('auth.forgot.opt1', '检查账号与密码是否输入正确；') + '</li>' +
              '<li>' + U.t('auth.forgot.opt2', '使用已绑定的手机号通过验证码重置密码；') + '</li>' +
              '<li>' + U.t('auth.forgot.opt3', '或注册一个新账号（数据相互独立）。') + '</li>' +
            '</ol>',
          actions: [{ label: U.t('ui.gotIt', '知道了'), tone: 'primary' }]
        });
      },
      'goto-doctor': gotoDoctorEntry,
      'fill-demo': function () {
        var d = PHR.seed && PHR.seed.demo;
        if (!d) { return; }
        var a = document.getElementById('lg-account');
        var p = document.getElementById('lg-password');
        if (a) { a.value = d.username; }
        if (p) { p.value = d.password; p.focus(); }
        PHR.ui.toast.ok(U.t('auth.demo.filled', '已填入演示账号 {name}，点「登录」继续',
          { name: d.username }));
      }
    });

    setTimeout(function () {
      if (!accountInput) { return; }
      var target = accountInput.value ? document.getElementById('lg-password') : accountInput;
      if (target) { target.focus(); }
    }, 80);
  }

  /* -------------------------------------------------------------------- *
   * 演示账号与验证码说明。
   *
   * 这些内容以前是直接铺在登录页上的（账号表格 + 万能码 + 短信码说明），
   * 现在收进一个 ⓘ 的悬停提示：需要的人鼠标一放就能看到，不需要的人
   * 不会被一块表格挡住。文案里的账号与验证码全部从 PHR.seed / PHR.mfa
   * 现取，不写死 —— 改了 core/seed.js 的 ACCOUNTS，这里自动跟着变。
   * -------------------------------------------------------------------- */
  function demoTip() {
    var parts = [];
    var acc = (PHR.seed && PHR.seed.accounts) || [];
    if (acc.length) {
      parts.push(U.t('auth.demo.tipAccounts', '演示账号：{list}', {
        list: acc.map(function (x) { return x.username + ' / ' + x.password; }).join('　·　')
      }));
    }
    var code = PHR.mfa.universalCodeEnabled && PHR.mfa.universalCodeEnabled()
      ? PHR.mfa.universalCode() : null;
    if (code) {
      parts.push(U.t('auth.demo.tipCode', '万能验证码 {code}：短信验证环节输入它也能通过', { code: code }));
    }
    parts.push(U.t('auth.demo.tipSms', '演示环境没有短信网关，验证码会直接显示在验证页面上。'));
    parts.push(U.t('auth.demo.tipPwd', '口令需至少 8 位并同时包含字母与数字。'));
    return parts.join('　｜　');
  }

  function doLogin() {
    var accountEl = document.getElementById('lg-account');
    var passwordEl = document.getElementById('lg-password');
    var msg = document.getElementById('login-msg');
    var btn = document.getElementById('lg-submit');
    if (!accountEl || !passwordEl || !msg || !btn) { return; }

    var account = accountEl.value.trim();
    var password = passwordEl.value;

    msg.innerHTML = '';
    if (!account || !password) {
      msg.innerHTML = PHR.ui.notice('warn', '',
        U.t('auth.errEmpty', '请输入账号和密码'), { icon: '⚠️' });
      return;
    }

    /* 勾选框要在提交前读掉：登录成功后这个表单可能已经被换掉了。
       这个选择本身就是那个设置（sessionRememberDays），先写回存储，
       session.start() 与设置页读的都是它。 */
    var rememberEl = document.getElementById('lg-remember');
    var remember = !rememberEl || rememberEl.checked;
    PHR.store.write('sessionRememberDays', remember ? PHR.config.sessionRememberDays : 0);

    btn.disabled = true;
    btn.textContent = U.t('auth.signingIn', '登录中…');

    // 用极短的延迟模拟网络往返，让"锁定""失败"等状态有可见反馈
    setTimeout(function () {
      var r = PHR.auth.login(account, password, { remember: remember });
      btn.disabled = false;
      btn.textContent = U.t('auth.signIn', '登 录');

      if (!r.ok) {
        msg.innerHTML = PHR.ui.notice(r.locked ? 'danger' : 'warn', '',
          r.hint
            ? U.t('auth.failWithHint', '{msg}（{hint}）', { msg: r.message, hint: r.hint })
            : r.message,
          { icon: r.locked ? '🔒' : '⚠️' });
        if (r.locked) {
          startLockCountdown(btn, r.remainSeconds);
        }
        return;
      }

      setRememberedAccount(account, remember);

      if (r.needMfa) {
        /* remember 已经跟着 challenge 走进 mfa 模块了（见 auth.service.js），
           第二因素认证通过后仍然按用户的选择保持登录。 */
        state.panel = 'mfa';
        drawMfa();
        return;
      }

      // 未开启多因素，直接进入系统
      PHR.ui.toast.ok(r.message, { title: U.t('auth.loginSuccess', '登录成功') });
      PHR.shell.boot();
      PHR.router.go('/dashboard', true);
    }, 320);
  }

  /** 「7 天内自动登录」勾了就记住账号名，下次打开自动填上；没勾就清掉 */
  function setRememberedAccount(account, remember) {
    if (remember) { PHR.store.write('remembered_account', account); }
    else { PHR.store.drop('remembered_account'); }
  }

  function startLockCountdown(btn, seconds) {
    btn.disabled = true;
    var left = seconds;
    var t = setInterval(function () {
      left -= 1;
      btn.textContent = U.t('auth.lockedBtn', '锁定中 {v}', { v: PHR.lockout.describeLock(Math.max(0, left)) });
      if (left <= 0) {
        clearInterval(t);
        btn.disabled = false;
        btn.textContent = U.t('auth.signIn', '登 录');
      }
    }, 1000);
  }

  /* ------------------------------ 注册表单 ------------------------------ */
  function drawRegister() {
    var body = document.getElementById('auth-body');
    var factorOpts = PHR.mfa.factorList(['sms', 'face']);

    body.innerHTML =
      '<form id="reg-form" novalidate>' +
        '<div class="form-grid">' +
          '<div class="field">' +
            '<label for="rg-username">' + U.t('auth.register.username', '账号') + '<span class="req">*</span></label>' +
            '<input class="input" id="rg-username" name="username" autocomplete="username" placeholder="' +
              U.t('auth.register.usernamePlaceholder', '3~32 位字母、数字或下划线') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="rg-displayName">' + U.t('auth.register.displayName', '姓名 / 昵称') + '</label>' +
            '<input class="input" id="rg-displayName" name="displayName" placeholder="' +
              U.t('auth.register.displayNamePlaceholder', '用于界面问候语') + '">' +
          '</div>' +
          '<div class="field span-2">' +
            '<label for="rg-password">' + U.t('auth.password', '密码') + '<span class="req">*</span></label>' +
            '<input class="input" id="rg-password" name="password" type="password" autocomplete="new-password" placeholder="' +
              U.t('auth.register.passwordPlaceholder', '至少 {n} 位，含字母与数字', { n: PHR.config.passwordMinLength }) + '">' +
            '<div class="strength-bar" id="rg-strength" style="display:none"><i></i></div>' +
            '<div class="hint" id="rg-strength-text">' +
              U.t('auth.pwdHint', '建议使用「字母 + 数字 + 符号」的组合，不要使用生日或手机号') + '</div>' +
          '</div>' +
          '<div class="field span-2">' +
            '<label for="rg-password2">' + U.t('auth.register.password2', '确认密码') + '<span class="req">*</span></label>' +
            '<input class="input" id="rg-password2" name="password2" type="password" autocomplete="new-password" placeholder="' +
              U.t('auth.register.password2Placeholder', '请再次输入密码') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="rg-phone">' + U.t('auth.register.phone', '手机号') + '</label>' +
            '<input class="input" id="rg-phone" name="phone" inputmode="numeric" placeholder="' +
              U.t('auth.register.phonePlaceholder', '用于接收短信验证码') + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="rg-email">' + U.t('auth.register.email', '邮箱') + '</label>' +
            '<input class="input" id="rg-email" name="email" type="email" placeholder="' +
              U.t('ui.optional', '选填') + '">' +
          '</div>' +
          '<div class="field span-2">' +
            '<label>' + U.t('auth.register.mfaFactor', '多因素认证方式') + '</label>' +
            '<div class="checkbox-group">' +
              factorOpts.map(function (f) {
                return '<label class="checkbox"><input type="checkbox" name="factor" value="' + f.key + '"' +
                  (f.key === 'sms' ? ' checked' : '') + '><span>' + f.icon + ' ' + dom.esc(f.name) +
                  '<span class="dim t-xs"> · ' + dom.esc(f.desc) + '</span></span></label>';
              }).join('') +
            '</div>' +
            '<div class="hint">' +
              U.t('auth.register.mfaHint', '开启后，登录时需要额外通过一次短信验证码或人脸识别。强烈建议保持开启。') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="reg-msg"></div>' +
        '<label class="checkbox mb4"><input type="checkbox" id="rg-agreement">' +
          '<span>' + U.t('auth.register.agreement',
            '我已阅读并同意《健康数据使用与隐私说明》：健康数据仅存储于本人设备，' +
            '未经本人授权不会对外共享；我会定期备份重要数据，以防设备或浏览器数据清理造成丢失。') + '</span></label>' +
        '<button class="btn btn-primary btn-lg btn-block" type="submit" id="rg-submit">' +
          U.t('auth.register.submit', '创建账号') + '</button>' +
      '</form>';

    var pwd = document.getElementById('rg-password');
    pwd.addEventListener('input', function () {
      var s = PHR.crypto.strength(pwd.value);
      var bar = document.getElementById('rg-strength');
      var txt = document.getElementById('rg-strength-text');
      if (!pwd.value) {
        bar.style.display = 'none';
        txt.textContent = U.t('auth.pwdHintShort', '建议使用「字母 + 数字 + 符号」的组合');
        return;
      }
      bar.style.display = 'block';
      bar.className = 'strength-bar tone-' + s.tone;
      bar.querySelector('i').style.width = s.percent + '%';
      var policy = PHR.security.passwordPolicy(pwd.value);
      txt.textContent = U.t('auth.pwdStrength', '强度：{level}', { level: s.level }) +
        (policy.issues.length
          ? '　' + U.t('auth.pwdIssues', '未满足：{list}', { list: policy.issues.join(U.t('ui.listSep', '、')) })
          : '');
      txt.className = 'hint' + (policy.ok ? ' ok' : ' warn');
    });

    var regForm = document.getElementById('reg-form');
    if (regForm) {
      regForm.addEventListener('submit', function (e) {
        e.preventDefault();
        doRegister();
      });
    }
  }

  function doRegister() {
    var msg = document.getElementById('reg-msg');
    if (!msg) { return; }
    var agreementEl = document.getElementById('rg-agreement');
    var values = {
      username: (document.getElementById('rg-username') || {}).value.trim(),
      displayName: (document.getElementById('rg-displayName') || {}).value.trim(),
      password: (document.getElementById('rg-password') || {}).value,
      password2: (document.getElementById('rg-password2') || {}).value,
      phone: (document.getElementById('rg-phone') || {}).value.trim(),
      email: (document.getElementById('rg-email') || {}).value.trim(),
      mfaEnabled: true,
      mfaFactors: U.$$('input[name="factor"]:checked').map(function (c) { return c.value; }),
      agreement: agreementEl ? agreementEl.checked : false
    };

    var r = PHR.auth.register(values);
    if (!r.ok) {
      msg.innerHTML = PHR.ui.notice('danger', U.t('auth.register.failed', '注册未通过'),
        r.list.join(U.t('ui.listSep', '；')), { icon: '⚠️' });
      // 给对应字段加红框
      Object.keys(r.errors).forEach(function (k) {
        var el = document.getElementById('rg-' + k);
        if (el) { el.closest('.field').classList.add('has-error'); }
      });
      return;
    }

    msg.innerHTML = PHR.ui.notice('ok', U.t('auth.register.okTitle', '注册成功'),
      U.t('auth.register.okBody', '请使用新账号登录。'), { icon: '✅' });
    PHR.ui.toast.ok(r.message, { title: U.t('auth.register.okTitle', '注册成功') });
    state.panel = 'login';
    setTimeout(function () {
      drawAuth();
      var el = document.getElementById('lg-account');
      var pwEl = document.getElementById('lg-password');
      if (el) { el.value = values.username; }
      if (pwEl) { pwEl.focus(); }
    }, 700);
  }

  /* ================================================================== *
   * 三、多因素认证
   * ================================================================== */
  function drawMfa() {
    var ch = PHR.mfa.pending();
    var root = refs.root;
    if (!ch) {
      state.panel = 'login';
      drawAuth();
      PHR.ui.toast.warn(U.t('auth.mfa.sessionExpired', '认证会话已失效，请重新登录'));
      return;
    }

    var factors = PHR.mfa.factorList(ch.factors);
    var active = ch.activeFactor;

    root.innerHTML =
      '<h2>' + U.t('auth.mfa.title', '身份验证') + '</h2>' +
      '<p class="sub">' + U.t('auth.mfa.subtitle',
        '密码校验已通过。为保护健康数据，还需要完成一次额外验证。') + '</p>' +
      '<div class="mfa-box">' +
        '<div class="mfa-steps">' +
          '<div class="step done">' + U.t('auth.mfa.step1', '① 账号密码') + '</div>' +
          '<div class="step active">' + U.t('auth.mfa.step2', '② 身份验证') + '</div>' +
          '<div class="step">' + U.t('auth.mfa.step3', '③ 进入系统') + '</div>' +
        '</div>' +
        (factors.length > 1
          ? '<div class="segmented mb4" role="tablist">' + factors.map(function (f) {
              return '<button data-factor="' + f.key + '" aria-pressed="' + (active === f.key) + '">' +
                f.icon + ' ' + dom.esc(f.name) + '</button>';
            }).join('') + '</div>'
          : '<div class="notice tone-primary mb4"><span class="ico">' + factors[0].icon + '</span>' +
            '<div class="body">' + U.t('auth.mfa.currentFactor', '当前验证方式：') +
              '<b>' + dom.esc(factors[0].name) + '</b></div></div>') +
        '<div id="mfa-body"></div>' +
      '</div>' +
      '<div class="row between mt4">' +
        '<button class="btn btn-ghost btn-sm" data-action="cancel-mfa">' +
          U.t('auth.mfa.backToLogin', '← 返回重新登录') + '</button>' +
        '<span class="dim t-xs">' +
          U.t('auth.mfa.sessionNote', '本验证仅在当前标签页有效，关闭页面即失效') + '</span>' +
      '</div>';

    dom.actions(root, {
      'cancel-mfa': function () {
        PHR.mfa.clear();
        state.panel = 'login';
        drawAuth();
      }
    });

    var seg = root.querySelector('.segmented');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-factor]');
        if (!b) { return; }
        PHR.mfa.switchFactor(b.getAttribute('data-factor'));
        drawMfa();
      });
    }

    if (active === 'face') { drawFace(); } else { drawSms(); }
  }

  /* -------------------------------------------------------------------- *
   * 演示环境：把本次短信验证码直接显示出来。
   *
   * 本演示没有接短信网关（见 modules/auth/README.md 的「已知限制」），
   * 不显示的话演示时只能靠万能码 000000 —— 那反而更像"后门"。
   * 直接显示随机码既方便演示，也更接近真实产品的观感。
   *
   * ⚠️ 真实产品绝不能这样做：验证码只能经由短信通道下发给本人。
   * -------------------------------------------------------------------- */
  function demoCodeNote(ch) {
    if (!ch || !ch.smsCode) { return ''; }
    return PHR.ui.notice('warn',
      U.t('auth.mfa.demoTitle', '演示环境：本页直接显示验证码'),
      U.t('auth.mfa.demoBody', '本演示未接入短信网关，本次验证码为 {code}。', {
        code: '<b style="font-family:ui-monospace,Consolas,Menlo,monospace;' +
              'font-size:18px;letter-spacing:3px">' + dom.esc(ch.smsCode) + '</b>'
      }), { icon: '🧪', raw: true });
  }

  /* ------------------------------ 短信验证码 ------------------------------ */
  function drawSms() {
    var ch = PHR.mfa.pending();
    var body = document.getElementById('mfa-body');
    /* PHR.mfa.start() 建挑战时已经下发过一次，这里只在还没有验证码时补发。
       否则会撞上重发冷却，把「验证码已发送」误显示成「请等待 N 秒后重新获取」，
       验证页一打开就是一条警告，看着像坏了。 */
    var sent = ch.smsCode ? { ok: true } : PHR.mfa.sendSms(ch);

    body.innerHTML =
      (sent.ok
        ? PHR.ui.notice('info', U.t('auth.mfa.sentTitle', '验证码已发送'),
            U.t('auth.mfa.sentBody',
              '验证码已发送至 {phone}，请在下方输入 6 位数字。', { phone: dom.esc(ch.phone) }),
            { icon: '📱' })
        : PHR.ui.notice('warn', '', sent.message, { icon: '⚠️' })) +
      demoCodeNote(ch) +
      '<div class="field mt4">' +
        '<label for="mfa-code">' +
          U.t('auth.mfa.smsPrompt', '请输入发送至 {phone} 的 6 位验证码',
            { phone: '<b>' + dom.esc(ch.phone) + '</b>' }) + '</label>' +
        '<div class="code-input">' +
          '<input class="input" id="mfa-code" inputmode="numeric" maxlength="6" ' +
            'placeholder="000000" autocomplete="one-time-code">' +
        '</div>' +
        '<div class="hint" id="mfa-tip">' +
          U.t('auth.mfa.ttl', '验证码有效期 {n} 秒', { n: PHR.config.smsCodeTTL }) + '　·　' +
          '<a href="#" data-action="resend">' + U.t('auth.mfa.resend', '重新发送') + '</a></div>' +
      '</div>' +
      '<div id="mfa-msg"></div>' +
      '<button class="btn btn-primary btn-lg btn-block" data-action="verify-sms">' +
        U.t('auth.mfa.verify', '验 证') + '</button>';

    var input = document.getElementById('mfa-code');
    input.focus();
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      if (input.value.length === 6) { verifySms(); }
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { verifySms(); } });

    dom.actions(body, {
      resend: function () {
        var r = PHR.mfa.sendSms();
        if (!r.ok) { PHR.ui.toast.warn(r.message); return; }
        PHR.ui.toast.ok(U.t('auth.mfa.resent', '验证码已重新发送'));
        drawSms();
      },
      'verify-sms': verifySms
    });

    startSmsCountdown();
  }

  var smsTimer = null;
  function startSmsCountdown() {
    if (smsTimer) { clearInterval(smsTimer); }
    smsTimer = setInterval(function () {
      var ch = PHR.mfa.pending();
      if (!ch) { clearInterval(smsTimer); return; }
      var tip = document.getElementById('mfa-tip');
      if (!tip) { clearInterval(smsTimer); return; }
      var left = Math.max(0, Math.round((ch.expiresAt - Date.now()) / 1000));
      var cd = PHR.mfa.resendCooldown(ch);
      var resendLink = '<a href="#" data-action="resend">' + U.t('auth.mfa.resend', '重新发送') + '</a>';
      tip.innerHTML = left > 0
        ? (U.t('auth.mfa.ttlLeft', '验证码剩余有效期 {n} 秒', {
             n: '<b class="' + (left < 30 ? 'warn' : '') + '">' + left + '</b>'
           }) + '　·　' +
           (cd > 0 ? '<span class="dim">' + U.t('auth.mfa.resendIn', '{n} 秒后可重发', { n: cd }) + '</span>'
                   : resendLink))
        : '<span class="warn">' + U.t('auth.mfa.expired', '验证码已过期') + '</span>　·　' + resendLink;
    }, 1000);
  }

  function verifySms() {
    var input = document.getElementById('mfa-code');
    var msg = document.getElementById('mfa-msg');
    if (!input) { return; }
    var code = input.value.trim();
    if (code.length !== 6) {
      msg.innerHTML = PHR.ui.notice('warn', '',
        U.t('auth.mfa.needSix', '请输入完整的 6 位验证码'), { icon: '⚠️' });
      return;
    }
    var r = PHR.auth.verifyMfa('sms', code);
    Promise.resolve(r).then(function (res) {
      if (!res.ok) {
        msg.innerHTML = PHR.ui.notice('danger', '', res.message, { icon: '⚠️' });
        input.value = '';
        input.focus();
        return;
      }
      finish();
    });
  }

  /* ------------------------------ 人脸识别 ------------------------------ */
  function drawFace() {
    var body = document.getElementById('mfa-body');
    body.innerHTML =
      PHR.ui.notice('info', U.t('auth.mfa.faceTitle', '人脸识别'),
        U.t('auth.mfa.faceBody',
          '请正对屏幕，点击开始后保持面部在取景框内。识别通过后将自动进入系统。'),
        { icon: '🙂' }) +
      '<div class="face-stage mt4" id="face-stage">' +
        '<div class="face-scanline"></div>' +
        '<div class="face-oval">🙂</div>' +
      '</div>' +
      '<div id="face-msg"></div>' +
      '<button class="btn btn-primary btn-lg btn-block" data-action="start-face">' +
        U.t('auth.mfa.startFace', '开 始 识 别') + '</button>';

    dom.actions(body, { 'start-face': startFace });
  }

  function startFace() {
    var stage = document.getElementById('face-stage');
    var msg = document.getElementById('face-msg');
    var btn = document.querySelector('[data-action="start-face"]');
    if (!stage) { return; }

    stage.className = 'face-stage scanning';
    stage.querySelector('.face-oval').textContent = '😐';
    msg.innerHTML = '';
    btn.disabled = true;
    btn.textContent = U.t('auth.mfa.recognizing', '识别中…');

    PHR.auth.verifyMfa('face').then(function (res) {
      if (res.ok) {
        stage.className = 'face-stage success';
        stage.querySelector('.face-oval').textContent = '😊';
        msg.innerHTML = PHR.ui.notice('ok', U.t('auth.mfa.faceOkTitle', '识别成功'),
          U.t('auth.mfa.faceOkBody', '相似度 {n}%，正在进入系统…',
            { n: (res.score * 100).toFixed(1) }), { icon: '✅' });
        setTimeout(finish, 500);
      } else {
        stage.className = 'face-stage fail';
        stage.querySelector('.face-oval').textContent = '😕';
        msg.innerHTML = PHR.ui.notice('danger', '', res.message, { icon: '⚠️' });
        btn.disabled = false;
        btn.textContent = U.t('auth.mfa.faceAgain', '再 试 一 次');
      }
    });
  }

  /* ------------------------------ 收尾 ------------------------------ */
  function finish() {
    if (smsTimer) { clearInterval(smsTimer); smsTimer = null; }
    PHR.mfa.clear();
    var user = PHR.session.currentUser();
    PHR.ui.toast.ok(
      U.t('auth.welcomeBack', '欢迎回来，{name}',
        { name: user ? (user.displayName || user.username) : '' }),
      { title: U.t('auth.loginSuccess', '登录成功') });
    PHR.shell.boot();
    PHR.router.go('/dashboard', true);
  }

  /* ================================================================== *
   * 四、医生入口
   * ================================================================== */
  function gotoDoctorEntry() {
    PHR.ui.modal({
      title: U.t('auth.doctor.title', '医生身份验证'),
      size: 'normal',
      body:
        PHR.ui.notice('info', U.t('auth.doctor.whatTitle', '这里是什么？'),
          U.t('auth.doctor.whatBody',
            '如果您是医生，患者会把一串 12 位的授权码发给您。输入授权码后，' +
            '您只能查看患者明确授权给您的那些内容，并且每一次查看都会被记录。'),
          { icon: '👨‍⚕️' }) +
        '<div class="form-grid">' +
          '<div class="field"><label>' + U.t('auth.doctor.code', '授权码') +
            '<span class="req">*</span></label>' +
            '<input class="input mono" id="doc-code" placeholder="XXXX-XXXX-XXXX" autocomplete="off"></div>' +
          '<div class="field"><label>' + U.t('auth.doctor.name', '您的姓名') +
            '<span class="req">*</span></label>' +
            '<input class="input" id="doc-name" placeholder="' +
              U.t('auth.doctor.namePlaceholder', '如：李建国') + '"></div>' +
          '<div class="field"><label>' + U.t('auth.doctor.titleLabel', '职称') + '</label>' +
            '<input class="input" id="doc-title" placeholder="' +
              U.t('auth.doctor.titlePlaceholder', '如：主任医师') + '"></div>' +
          '<div class="field"><label>' + U.t('auth.doctor.license', '执业证号') + '</label>' +
            '<input class="input" id="doc-license" placeholder="' +
              U.t('auth.doctor.licensePlaceholder', '选填，用于留痕') + '"></div>' +
        '</div>' +
        '<div id="doc-msg"></div>' +
        '<p class="dim t-xs">' + U.t('auth.doctor.availableCodes', '可用授权码（点一下自动填入）：') + '</p>' +
        '<div class="tag-list">' + PHR.seed.doctorCodes().map(function (c) {
          return '<span class="chip clickable mono" data-code="' + dom.esc(c.code) + '" ' +
            'title="' + dom.esc(c.doctorName + ' · ' + c.purpose) + '">' +
            dom.esc(c.code) + '　' + dom.esc(c.doctorName) + '</span>';
        }).join('') + '</div>' +
        '<p class="dim t-xs mt2">' +
          U.t('auth.doctor.footnote',
            '注：授权码决定"能看谁、能看什么"，医生姓名由您自己填写，仅用于留痕。') + '</p>',
      onMount: function (body) {
        // 点授权码小标签 → 自动填入授权码，并带出对应的医生姓名
        body.addEventListener('click', function (e) {
          var chip = e.target.closest('[data-code]');
          if (!chip) { return; }
          var code = chip.getAttribute('data-code');
          var name = chip.textContent.trim().split('　')[1] || '';
          U.$('#doc-code', body).value = code;
          if (name) { U.$('#doc-name', body).value = name; }
          var licenses = {
            'K7M2-P9QX-3RTD': '1101001234567',
            'W3FH-8KMN-5QRT': '1101002468013',
            'D6PX-2VJC-9WYB': '1101007654321',
            'N4TK-7RMG-3HFZ': '1101009998887',
            'T3ST-PAT2-0001': '1101005556667'
          };
          if (licenses[code]) { U.$('#doc-license', body).value = licenses[code]; }
          U.html(U.$('#doc-msg', body), '');
        });
      },
      actions: [
        { label: U.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: U.t('auth.doctor.verify', '验证并进入'), tone: 'primary', close: false, action: function (v, close, body) {
            var code = U.$('#doc-code', body).value.trim().toUpperCase();
            var name = U.$('#doc-name', body).value.trim();
            var msg = U.$('#doc-msg', body);
            if (!code || !name) {
              msg.innerHTML = PHR.ui.notice('warn', '',
                U.t('auth.doctor.needCodeName', '请填写授权码和姓名'), { icon: '⚠️' });
              return false;
            }
            var r = PHR.consent.verifyCode(code, {
              name: name,
              title: U.$('#doc-title', body).value.trim(),
              licenseNo: U.$('#doc-license', body).value.trim()
            });
            if (!r.ok) {
              msg.innerHTML = PHR.ui.notice('danger', '', r.message, { icon: '⛔' });
              return false;
            }
            PHR.session.startDoctorGuest(r.doctor, r.consent);
            PHR.audit.log({
              action: 'consent.verify', targetType: 'consent', targetId: r.consent.id,
              targetName: r.doctor.name, detail: U.t('auth.doctor.auditDetail', '医生凭授权码进入受限视图'),
              result: 'success', actor: r.doctor.name, actorType: 'doctor'
            });
            close('verified');
            PHR.shell.enterDoctorMode();
            PHR.router.go('/doctor', true);
          } }
      ]
    });
  }

  PHR.auth.renderAuthView = renderAuthView;
  PHR.auth.captureAuthState = captureAuthState;

})(window.PHR);
