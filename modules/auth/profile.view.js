/**
 * ============================================================================
 * 文件：modules/auth/profile.view.js
 * 层：业务模块层（账号安全 —— 模块 1）
 * 职责：注册「账号与安全」页面，集中管理：
 *      ① 会话信息（当前会话令牌、登录保持还剩多久、来源 IP 与设备）
 *      ② 修改密码（含口令策略实时校验）
 *      ③ 多因素认证开关与方式选择
 *      ④ 登录历史（成功/失败/锁定，一眼看出有没有别人在试你的账号）
 *      ⑤ 危险操作（清除本地数据）
 * 依赖：modules/auth/auth.service.js、session.js、lockout.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  /* 安全体检的条目由 core/security.js 生成（该文件不在本次翻译范围内），
     这里按条目名称做一次映射，让「账号与安全」页整页可读。
     映射失败时原样显示中文，不会空白。 */
  var POSTURE_KEY = {
    '口令加密存储': 'passwordHash',
    '多因素认证': 'mfa',
    /* 键必须与 core/security.js 里 posture() 用的条目名一致 ——
       原来是「会话超时」，改成「登录保持」后这里也要跟着改，否则对不上。 */
    '登录保持': 'session',
    '访问留痕': 'audit',
    '存储': 'storage'
  };

  function postureItem(i) {
    var k = POSTURE_KEY[i.name];
    if (!k) { return { name: i.name, detail: i.detail }; }
    // 多因素与本地存储的文案分"已开启/未开启"两支，按 i.ok 选词条
    var detailKey = (k === 'mfa') ? (i.ok ? 'mfaOn' : 'mfaOff')
                  : (k === 'storage') ? (i.ok ? 'storageOn' : 'storageOff')
                  : k;
    return {
      name: U.t('security.posture.' + k + '.name', i.name),
      detail: U.t('security.posture.' + detailKey + '.detail', i.detail)
    };
  }

  /** 会话倒计时定时器；由 unmount 负责清理 */
  var sessTimer = null;

  PHR.registerView('profile', {
    title: PHR.t('view.profile.title', '账号与安全'), icon: '👤', group: 'system', order: 91, module: 'auth',
    render: render,
    // 离开本页时清掉倒计时；shell 在切换视图时会调用它
    unmount: function () { if (sessTimer) { clearInterval(sessTimer); sessTimer = null; } }
  });

  /* ================================================================== *
   * 页面
   * ================================================================== */
  function render(root) {
    var user = PHR.session.currentUser();
    if (!user) {
      root.innerHTML = PHR.ui.empty({
        icon: '🔒',
        title: U.t('profile.needLogin', '请先登录'),
        hint: U.t('profile.needLoginHint', '登录后才能查看账号与安全设置。')
      });
      return;
    }

    var post = PHR.security.posture(user);
    var s = PHR.session.info();

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>' + U.t('view.profile.title', '账号与安全') + '</h2>' +
        '</div>' +
      '</div>' +

      /* ---------- 概览 ---------- */
      '<div class="grid g2 mb5">' +
        '<div class="card"><div class="card-body">' +
          '<div class="row gap4">' +
            '<span class="avatar lg">' + dom.esc((user.displayName || user.username).slice(0, 1).toUpperCase()) + '</span>' +
            '<div class="grow">' +
              '<div class="t-xl bold">' + dom.esc(user.displayName || user.username) + '</div>' +
              '<div class="dim t-sm">' + U.t('profile.account', '账号 {u}', { u: dom.esc(user.username) }) +
                (user.phone ? '　·　' + dom.esc(PHR.crypto.maskPhone(user.phone)) : '') + '</div>' +
              '<div class="t-xs dim mt1">' +
                U.t('profile.registeredAt', '注册于 {d}', { d: U.fmtDate(user.createdAt) }) + '　·　' +
                U.t('profile.loginCount', '累计登录 {n} 次', { n: (user.loginCount || 0) }) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="divider"></div>' +
          '<dl class="kv">' +
            '<dt>' + U.t('profile.lastLogin', '上次登录') + '</dt><dd>' +
              (user.lastLoginAt ? U.fmtDateTime(user.lastLoginAt) : '—') + '</dd>' +
            '<dt>' + U.t('profile.currentSession', '当前会话') + '</dt><dd class="mono t-xs">' +
              dom.esc(s ? s.token.slice(0, 16) + '…' : '—') + '</dd>' +
            '<dt>' + U.t('profile.sessionLeft', '登录保持') + '</dt><dd id="sess-left">' +
              U.t('profile.calculating', '计算中…') + '</dd>' +
            '<dt>' + U.t('profile.source', '来源') + '</dt><dd class="t-xs">' +
              dom.esc(s ? s.ip : '—') + '　' + dom.esc(s ? s.device : '') + '</dd>' +
          '</dl>' +
        '</div></div>' +

        '<div class="card"><div class="card-body">' +
          '<div class="callout-title">' + U.t('profile.posture.title', '🛡️ 安全体检') + '</div>' +
          '<div class="row gap5 wrap" style="align-items:center">' +
            '<div id="posture-gauge"></div>' +
            '<div class="grow" style="min-width:200px">' +
              post.items.map(function (i) {
                var pt = postureItem(i);
                return '<div class="row gap2 mb2"><span>' + (i.ok ? '✅' : '⚠️') + '</span>' +
                  '<div><div class="semibold t-sm">' + dom.esc(pt.name) + '</div>' +
                  '<div class="t-xs dim">' + dom.esc(pt.detail) + '</div></div></div>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div></div>' +
      '</div>' +

      /* ---------- 密码与多因素 ---------- */
      '<div class="grid g2 mb5">' +
        '<div class="card">' +
          '<div class="card-head"><h3>' + U.t('profile.pwd.title', '🔑 修改密码') + '</h3></div>' +
          '<div class="card-body">' +
            '<div class="field"><label for="pw-old">' + U.t('profile.pwd.old', '当前密码') + '</label>' +
              '<input class="input" id="pw-old" type="password" autocomplete="current-password"></div>' +
            '<div class="field"><label for="pw-new">' + U.t('profile.pwd.new', '新密码') + '</label>' +
              '<input class="input" id="pw-new" type="password" autocomplete="new-password" ' +
                'placeholder="' +
                U.t('auth.register.passwordPlaceholder', '至少 {n} 位，含字母与数字', { n: PHR.config.passwordMinLength }) + '">' +
              '<div class="strength-bar" id="pw-bar" style="display:none"><i></i></div>' +
              '<div class="hint" id="pw-hint">' +
                U.t('profile.pwd.sessionNote', '修改成功后当前会话仍然有效') + '</div></div>' +
            '<div class="field"><label for="pw-new2">' + U.t('profile.pwd.new2', '确认新密码') + '</label>' +
              '<input class="input" id="pw-new2" type="password" autocomplete="new-password"></div>' +
            '<div id="pw-msg"></div>' +
            '<button class="btn btn-primary btn-block" data-action="change-pwd">' +
              U.t('profile.pwd.save', '保存新密码') + '</button>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head"><h3>' + U.t('profile.mfa.title', '📱 多因素认证') + '</h3>' +
            '<div class="actions">' + (user.mfaEnabled
              ? PHR.ui.badge(U.t('profile.mfa.on', '已开启'), 'ok', { icon: '🔐' })
              : PHR.ui.badge(U.t('profile.mfa.off', '未开启'), 'danger', { icon: '⚠️' })) + '</div>' +
          '</div>' +
          '<div class="card-body">' +
            (user.mfaEnabled ? '' : PHR.ui.notice('warn', U.t('profile.mfa.adviceTitle', '建议立即开启'),
              U.t('profile.mfa.adviceBody',
                '只靠密码保护的账号，一旦密码泄露，健康档案就会被他人看到。开启多因素认证后，' +
                '即使密码泄露，攻击者仍然过不了第二关。'), { icon: '⚠️' })) +
            '<label class="switch mb4"><input type="checkbox" id="mfa-enabled"' +
              (user.mfaEnabled ? ' checked' : '') + '><span class="track"></span>' +
              '<span>' + U.t('profile.mfa.require', '登录时要求第二因素验证') + '</span></label>' +
            '<div class="field"><label>' + U.t('profile.mfa.available', '可用的第二因素') + '</label>' +
              '<div class="checkbox-group vertical" id="mfa-factors">' +
                PHR.mfa.factorList(['sms', 'face']).map(function (f) {
                  var on = (user.mfaFactors || []).indexOf(f.key) >= 0;
                  return '<label class="checkbox"><input type="checkbox" value="' + f.key + '"' +
                    (on ? ' checked' : '') + '><span>' + f.icon + ' <b>' + dom.esc(f.name) + '</b>' +
                    '<div class="t-xs dim">' + dom.esc(f.desc) + '</div></span></label>';
                }).join('') +
              '</div>' +
              '<div class="hint">' +
                U.t('profile.mfa.phoneHint', '短信验证码需要先在「档案中心 → 个人基本信息」中填写手机号。') +
              '</div>' +
            '</div>' +
            '<div id="mfa-msg"></div>' +
            '<button class="btn btn-primary btn-block" data-action="save-mfa">' +
              U.t('profile.mfa.save', '保存多因素设置') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      /* ---------- 登录历史 ---------- */
      '<div class="card mb5">' +
        '<div class="card-head"><h3>' + U.t('profile.history.title', '🕘 登录历史') + '</h3>' +
          '<div class="sub">' +
            U.t('profile.history.sub', '如果出现您不认识的时间或设备，请立即修改密码') + '</div>' +
          '<div class="actions"><button class="btn btn-sm" data-action="goto-audit">' +
            U.t('profile.history.viewAll', '查看完整日志') + '</button></div>' +
        '</div>' +
        '<div class="card-body flush" id="login-history"></div>' +
      '</div>' +

      /* ---------- 危险区 ---------- */
      '<div class="card">' +
        '<div class="card-head"><h3>' + U.t('profile.danger.title', '⚠️ 危险操作') + '</h3></div>' +
        '<div class="card-body">' +
          PHR.ui.notice('danger', U.t('profile.danger.wipeTitle', '清除全部本地数据'),
            U.t('profile.danger.wipeBody',
              '这会删除本地保存的全部账号、健康档案、授权与日志，且无法恢复。' +
              '如果只是想换个账号，请直接退出登录。执行前请务必先导出备份。'), { icon: '🗑️' }) +
          '<button class="btn btn-danger" data-action="wipe">' +
            U.t('profile.danger.wipeBtn', '清除全部本地数据') + '</button>' +
        '</div>' +
      '</div>';

    /* --- 仪表盘 --- */
    PHR.ui.chart.gauge(document.getElementById('posture-gauge'), {
      percent: post.score, value: post.score + '', label: U.t('profile.posture.score', '安全分'),
      color: post.score >= 80 ? 'var(--ok)' : post.score >= 60 ? 'var(--warn)' : 'var(--danger)'
    });

    /* --- 登录保持剩余时间 ---
       这里以前是"X 分 Y 秒后自动退出"的秒级倒计时，对应的是"空闲 30 分钟
       自动登出"。那个功能已经删掉了（见 core/security.js 的 sessionPolicy），
       现在登录状态是绝对到期、默认 7 天，所以改成按天显示，
       而且没必要每秒刷一次 —— 30 秒一次足够了。 */
    var leftEl = document.getElementById('sess-left');
    function tick() {
      if (!leftEl || !document.body.contains(leftEl)) { clearInterval(t); return; }
      var ss = PHR.session.info();
      if (!ss) { leftEl.textContent = '—'; return; }
      if (!ss.remember) {
        leftEl.textContent = U.t('profile.sessionTabOnly', '仅本次会话（关闭标签页即退出）');
        return;
      }
      var days = ss.remainDays, hours = Math.floor((ss.remainSeconds % 86400) / 3600);
      leftEl.textContent = days >= 1
        ? U.t('profile.autoLogoutInDays', '{d} 天 {h} 小时后需要重新登录', { d: days, h: hours })
        : U.t('profile.autoLogoutInHours', '{h} 小时后需要重新登录', { h: hours });
    }
    var t = setInterval(tick, 30000);
    tick();
    sessTimer = t;   // 交给 unmount 清理（不要用 PHR.router.onChange：
                     // 那是在 render 里注册全局监听，每渲染一次就多挂一个，永远不会解绑）

    /* --- 登录历史 --- */
    PHR.ui.table(document.getElementById('login-history'), {
      pageSize: 8,
      rows: PHR.auth.loginHistory(40),
      empty: { icon: '🕘', title: U.t('profile.history.empty', '暂无登录记录') },
      columns: [
        { key: 'at', label: U.t('profile.history.col.time', '时间'), width: '160px', sortable: true,
          render: function (e) { return U.fmtDateTime(e.at); } },
        { key: 'action', label: U.t('profile.history.col.action', '事件'), width: '140px',
          render: function (e) { return PHR.ui.badges.actionRisk(e.action); } },
        { key: 'detail', label: U.t('profile.history.col.detail', '说明'),
          render: function (e) { return dom.esc(e.detail || '—'); } },
        { key: 'result', label: U.t('profile.history.col.result', '结果'), width: '90px', align: 'center',
          render: function (e) { return PHR.ui.badges.auditResult(e.result); } },
        { key: 'env', label: U.t('profile.history.col.env', '来源'), width: '180px',
          render: function (e) {
            return '<div class="t-xs mono">' + dom.esc(e.ip) + '</div><div class="t-xs dim">' + dom.esc(e.device) + '</div>';
          } }
      ]
    });

    /* --- 密码强度实时提示 --- */
    var pwNew = document.getElementById('pw-new');
    pwNew.addEventListener('input', function () {
      var bar = document.getElementById('pw-bar');
      var hint = document.getElementById('pw-hint');
      if (!pwNew.value) {
        bar.style.display = 'none';
        hint.textContent = U.t('profile.pwd.sessionNote', '修改成功后当前会话仍然有效');
        return;
      }
      var st = PHR.crypto.strength(pwNew.value);
      var pol = PHR.security.passwordPolicy(pwNew.value);
      bar.style.display = 'block';
      bar.className = 'strength-bar tone-' + st.tone;
      bar.querySelector('i').style.width = st.percent + '%';
      hint.innerHTML = U.t('auth.pwdStrength', '强度：{level}', { level: '<b>' + st.level + '</b>' }) +
        (pol.issues.length
          ? '　<span class="warn">' +
            U.t('auth.pwdIssues', '未满足：{list}', { list: dom.esc(pol.issues.join(U.t('ui.listSep', '、'))) }) +
            '</span>'
          : '　<span class="ok">' + U.t('profile.pwd.policyOk', '符合安全策略') + '</span>');
    });

    /* --- 事件 --- */
    dom.actions(root, {
      'change-pwd': changePwd,
      'save-mfa': saveMfa,
      'goto-audit': function () { PHR.router.go('/audit'); },
      wipe: wipe
    });
  }

  /* ================================================================== *
   * 修改密码
   * ================================================================== */
  function changePwd() {
    var msg = document.getElementById('pw-msg');
    var oldEl = document.getElementById('pw-old');
    var newEl = document.getElementById('pw-new');
    var new2El = document.getElementById('pw-new2');
    var barEl = document.getElementById('pw-bar');
    if (!oldEl || !newEl || !new2El) { return; }

    var oldP = oldEl.value;
    var newP = newEl.value;
    var newP2 = new2El.value;

    var r = PHR.auth.changePassword(oldP, newP, newP2);
    if (!r.ok) {
      if (msg) {
        msg.innerHTML = PHR.ui.notice('danger', U.t('profile.pwd.failed', '修改失败'),
          Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(U.t('ui.listSep', '；')),
          { icon: '⚠️' });
      }
      return;
    }
    if (msg) {
      msg.innerHTML = PHR.ui.notice('ok', U.t('profile.pwd.ok', '修改成功'), r.message, { icon: '✅' });
    }
    PHR.ui.toast.ok(r.message, { title: U.t('auth.pwdUpdatedTitle', '密码已更新') });
    oldEl.value = '';
    newEl.value = '';
    new2El.value = '';
    if (barEl) { barEl.style.display = 'none'; }
  }

  /* ================================================================== *
   * 多因素设置
   * ================================================================== */
  function saveMfa() {
    var enabledEl = document.getElementById('mfa-enabled');
    var enabled = enabledEl ? enabledEl.checked : false;
    var factors = U.$$('#mfa-factors input:checked').map(function (c) { return c.value; });
    var msg = document.getElementById('mfa-msg');
    if (!msg) { return; }

    var r = PHR.auth.setMfa(enabled, factors);
    if (!r.ok) {
      msg.innerHTML = PHR.ui.notice('danger', '', r.message, { icon: '⚠️' });
      return;
    }
    msg.innerHTML = PHR.ui.notice(enabled ? 'ok' : 'warn', U.t('profile.mfa.saved', '已保存'),
      r.message, { icon: enabled ? '✅' : '⚠️' });
    PHR.ui.toast[enabled ? 'ok' : 'warn'](r.message);
    PHR.shell.refreshNav();
    setTimeout(function () { PHR.router.reload(); }, 900);
  }

  /* ================================================================== *
   * 清除本地数据
   * ================================================================== */
  function wipe() {
    PHR.ui.confirm({
      title: U.t('profile.danger.wipeTitle', '清除全部本地数据'),
      message: U.t('profile.danger.confirmMsg', '此操作会删除本地保存的全部数据，且无法撤销。'),
      detail: U.t('profile.danger.confirmDetail',
        '包括：账号、健康档案、医生授权、审计日志、社群内容。建议先到「偏好与安全 → 数据与存储」导出备份。'),
      confirmLabel: U.t('profile.danger.confirmLabel', '我已备份，确认清除'),
      requireText: U.t('profile.danger.requireText', '确认清空'),
      tone: 'danger'
    }).then(function (ok) {
      if (!ok) { return; }
      PHR.store.clearAll();
      PHR.ui.toast.warn(U.t('profile.danger.cleared', '已清除全部本地数据，即将重新载入'));
      setTimeout(function () { location.reload(); }, 900);
    });
  }

})(window.PHR);
