/**
 * ============================================================================
 * 文件：modules/consent/consent.view.js
 * 层：业务模块层（医生授权 —— 模块 5）
 * 职责：注册「医生授权」页（#/consent）—— 患者侧授权管理界面：统计概览、授权
 *      列表、四步授权向导（医生信息 → 授权范围 → 有效期 → 确认）、授权码展示与
 *      复制、延长 / 撤销 / 访问记录时间线。
 * 依赖：modules/consent/{scope,consent.service}.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';
  var U = PHR.util, D = PHR.dict, dom = PHR.ui.dom;
  var S = PHR.consent.scope, CS = PHR.consent.service;
  var state = { filter: 'all' };
  /* 状态值本身是内部 key，不翻译；这里只登记展示文案，统计卡与筛选项共用一份。
     中文原文留在 STATUS_ZH 里，英文见 core/i18n/en-US.consent.js。 */
  var FILTERS = ['all', 'active', 'pending', 'expired', 'revoked'];
  var STATUS_ZH = { all: '全部', active: '生效中', pending: '待生效', expired: '已过期', revoked: '已撤销' };
  function statusText(st) {
    return st === 'all' ? PHR.t('ui.all', '全部') : PHR.t('consent.status.' + st, STATUS_ZH[st]);
  }
  /* 向导第 1 步的字段模式：复用统一表单组件，直接获得校验与错误定位能力。
     label / placeholder 要随语言切换，因此在读取时取词（脚本加载时语言尚未探测）。 */
  function f1() {
    return [
      { name: 'doctorName', label: PHR.t('consent.f1.doctorName', '医生姓名'), type: 'text', required: true,
        placeholder: PHR.t('consent.f1.doctorNamePh', '如：李建国') },
      { name: 'doctorTitle', label: PHR.t('consent.f1.doctorTitle', '职称'), type: 'text',
        placeholder: PHR.t('consent.f1.doctorTitlePh', '如：主任医师') },
      { name: 'hospital', label: PHR.t('consent.f1.hospital', '所属机构'), type: 'select', required: true,
        options: function () { return D.hospital; } },
      { name: 'department', label: PHR.t('consent.f1.department', '科室'), type: 'select',
        options: function () { return D.department; } },
      { name: 'licenseNo', label: PHR.t('consent.f1.licenseNo', '执业证号'), type: 'text',
        placeholder: PHR.t('consent.f1.licenseNoPh', '选填，用于留痕') },
      { name: 'purpose', label: PHR.t('consent.f1.purpose', '就诊目的'), type: 'textarea', span: 2,
        placeholder: PHR.t('consent.f1.purposePh', '如：高血压随访复诊，需查看近期血压趋势与用药情况') }
    ];
  }

  PHR.registerView('consent', {
    title: PHR.t('view.consent.title', '医生授权'), icon: '🔑', group: 'main', order: 5, module: 'consent', render: render
  });

  /* ================================================================== *
   * 一、页面骨架：统计卡 → 说明条 → 授权列表 → 安全提示
   * ================================================================== */
  function render(root) {
    var s = CS.stats();
    root.innerHTML =
      '<div id="consent-page">' +
        '<div class="page-head"><div class="titles"><h2>' + PHR.t('view.consent.title', '医生授权') + '</h2></div>' +
          '<div class="actions"><button class="btn btn-primary" data-action="new">' + PHR.t('consent.btn.new', '＋ 新建授权') + '</button></div></div>' +
        '<div class="grid mb5" style="grid-template-columns:repeat(auto-fit,minmax(158px,1fr))">' +
          tile(statusText('active'), s.active, PHR.t('consent.unit.consent', '条'), '✅', s.active ? 'ok' : '',
            PHR.t('consent.tile.activeSub', '医生此刻可以查看')) +
          tile(statusText('pending'), s.pending, PHR.t('consent.unit.consent', '条'), '⏳', 'info',
            PHR.t('consent.tile.pendingSub', '尚未到生效时间')) +
          tile(statusText('expired'), s.expired, PHR.t('consent.unit.consent', '条'), '⌛', '',
            PHR.t('consent.tile.expiredSub', '到期后自动失效')) +
          tile(statusText('revoked'), s.revoked, PHR.t('consent.unit.consent', '条'), '🚫', '',
            PHR.t('consent.tile.revokedSub', '由本人主动收回')) +
          tile(PHR.t('consent.tile.accessTotal', '累计被访问'), dom.num(s.accessTotal), PHR.t('consent.unit.times', '次'),
            '👁️', s.accessTotal ? 'warn' : '', PHR.t('consent.tile.accessSub', '每一次都有日志')) +
        '</div>' +
        PHR.ui.notice('primary', PHR.t('consent.notice.howTitle', '授权是怎么保证"医生只看该看的"？'),
          PHR.t('consent.notice.howBody',
            '① 只有您在清单里勾选的范围，医生才看得到；② 授权码只对一条授权有效，有效期最长 {n} 天；' +
            '③ 医生每次查看都会写入访问日志，可在「访问追踪」中核对；④ 到期自动失效，也可以随时撤销。',
            { n: PHR.config.consentMaxDays }), { icon: '🔐' }) +
        '<div class="card mt4"><div class="card-head"><h3>' + PHR.t('consent.list.title', '我的授权') +
          '</h3><div class="sub" id="c-sub"></div>' +
          '<div class="actions"><div class="segmented" id="c-filter">' + FILTERS.map(function (st) {
            return '<button data-f="' + st + '"' + (state.filter === st ? ' aria-pressed="true"' : '') + '>' + statusText(st) + '</button>';
          }).join('') + '</div></div></div><div class="card-body" id="c-list"></div></div>' +
        '<div class="mt5">' + PHR.ui.notice('info', PHR.t('consent.notice.detailsTitle', '两个安全细节'),
          PHR.t('consent.notice.detailsBody',
            '① 授权到期后系统会自动把它标记为失效，医生端立刻失去访问权限；② 医生已经看过的内容，' +
            '其查看记录会永久保留在访问日志里，删除不掉。'), { icon: '🛡️' }) + '</div>' +
      '</div>';

    var page = U.$('#consent-page', root);
    dom.actions(page, {
      new: openWizard,
      detail: function (e, el) { showDetail(el.getAttribute('data-id')); },
      extend: function (e, el) { askChange(el.getAttribute('data-id'), 'extend'); },
      revoke: function (e, el) { askChange(el.getAttribute('data-id'), 'revoke'); },
      copy: function (e, el) { copyCode(el.getAttribute('data-code')); }
    });
    U.$('#c-filter', page).addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) { return; }
      state.filter = b.getAttribute('data-f');
      U.$$('[data-f]', page).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      drawList();
    });
    drawList();
  }

  function tile(label, value, unit, icon, tone, sub) {
    return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span class="corner"></span>' +
      '<div class="label">' + icon + ' ' + dom.esc(label) + '</div>' +
      '<div class="value">' + dom.esc(value) + '<span class="unit">' + dom.esc(unit) + '</span></div>' +
      '<div class="delta dim">' + dom.esc(sub) + '</div></div>';
  }

  /* ================================================================== *
   * 二、授权列表
   * ================================================================== */
  function drawList() {
    var box = U.$('#c-list');
    if (!box) { return; }
    var rows = CS.list({ status: state.filter });
    U.html(U.$('#c-sub'), PHR.t('consent.list.summary', '共 <b>{total}</b> 条授权　·　当前筛选 {shown} 条',
      { total: CS.list().length, shown: rows.length }));
    box.innerHTML = rows.length
      ? '<div class="col gap4">' + rows.map(consentCard).join('') + '</div>'
      : PHR.ui.empty({
          icon: '🔑',
          title: state.filter === 'all'
            ? PHR.t('consent.empty.none', '还没有创建过授权')
            : PHR.t('consent.empty.filtered', '这个状态下没有授权'),
          hint: PHR.t('consent.empty.hint',
            '当您需要把档案给医生看时，创建一个授权并把 12 位授权码发给医生即可 —— 医生只能看到您勾选的范围。'),
          action: { label: PHR.t('consent.btn.newShort', '新建授权'), action: 'new' }
        });
  }

  function consentCard(c) {
    var live = c.runtimeStatus === 'active' || c.runtimeStatus === 'pending';
    var id = dom.esc(c.id);
    var btn = function (action, text, cls) {
      return '<button class="btn btn-sm' + (cls ? ' ' + cls : '') + '" data-action="' + action + '" data-id="' + id + '">' + text + '</button>';
    };
    return '<article class="consent-card status-' + c.runtimeStatus + '" data-action="detail" data-id="' + id + '">' +
      '<div class="head"><div class="who">' +
        '<div class="n">' + dom.esc(c.doctorName) + (c.doctorTitle ? ' <span class="dim t-sm">' + dom.esc(c.doctorTitle) + '</span>' : '') + '</div>' +
        '<div class="m">' + dom.esc(D.nameOf(D.hospital, c.hospital)) + PHR.t('consent.sep.dot', '　·　') +
          dom.esc(D.nameOf(D.department, c.department)) + PHR.t('consent.sep.dot', '　·　') +
          (c.licenseNo
            ? PHR.t('consent.card.license', '执业证号 {no}', { no: dom.esc(U.mask(c.licenseNo, 4, 2)) })
            : PHR.t('consent.card.licenseNone', '未填写执业证号')) + '</div></div>' +
        '<div class="row gap2 wrap">' + PHR.ui.badges.consentStatus(c.runtimeStatus) +
          (c.runtimeStatus === 'active' && c.daysLeft <= 2
            ? PHR.ui.badge(PHR.t('consent.badge.expiringSoon', '即将到期'), 'warn') : '') + '</div></div>' +
      (c.purpose
        ? '<div class="t-sm mt2">' + PHR.t('consent.card.purpose', '就诊目的：{text}', { text: dom.esc(c.purpose) }) + '</div>'
        : '') +
      '<div class="tag-list mt3">' + c.scopes.map(function (k) {
        return '<span class="chip">' + dom.esc(S.nameOf(k)) + '</span>'; }).join('') + '</div>' +
      '<div class="row wrap gap4 mt3 t-xs dim"><span>' +
          PHR.t('consent.card.period', '有效期 {from} → {to}', { from: U.fmtDate(c.startAt), to: U.fmtDate(c.expireAt) }) + '</span>' +
        '<span>' + dom.esc(timeLeftText(c)) + '</span><span>' +
          PHR.t('consent.card.coverage', '覆盖 {n} 条记录', { n: S.coverage(c.scopes).records }) + '</span>' +
        '<span>' + PHR.t('consent.card.accessCount', '被访问 {n} 次', { n: c.accessCount || 0 }) + '</span>' +
        '<span>' + PHR.t('consent.card.lastAccess', '最近访问 {when}',
          { when: c.lastAccessAt ? U.fmtRelative(c.lastAccessAt) : PHR.t('consent.none.yet', '尚无') }) + '</span></div>' +
      '<div class="divider"></div><div class="row wrap gap2">' +
        btn('detail', PHR.t('consent.btn.detail', '查看详情与访问记录')) +
        (live ? btn('extend', PHR.t('consent.btn.extend', '延长有效期')) : '') +
        '<button class="btn btn-sm" data-action="copy" data-code="' + dom.esc(c.code) + '">' +
          PHR.t('consent.btn.copy', '📋 复制授权码') + '</button>' +
        '<span class="grow"></span>' +
        (live ? btn('revoke', PHR.t('consent.btn.revoke', '撤销授权'), 'btn-danger') : '') + '</div>' +
      '<div class="t-xs dim mt3 mono">' +
        PHR.t('consent.card.code', '授权码　{code}', { code: dom.esc(c.code) }) + '</div></article>';
  }

  function timeLeftText(c) {
    if (c.runtimeStatus === 'revoked') {
      return PHR.t('consent.time.revoked', '已于 {at} 撤销', { at: U.fmtDate(c.revokedAt) });
    }
    if (c.runtimeStatus === 'expired') {
      return PHR.t('consent.time.expired', '已于 {at} 自动失效', { at: U.fmtDate(c.expireAt) });
    }
    if (c.runtimeStatus === 'pending') {
      return PHR.t('consent.time.pending', '{at} 起生效', { at: U.fmtDateTime(c.startAt) });
    }
    return PHR.t('consent.time.left', '剩余 {n} 天（{at} 自动失效）',
      { n: c.daysLeft, at: U.fmtDate(c.expireAt) });
  }

  function copyCode(code) {
    dom.copy(code).then(function (ok) {
      if (ok) {
        PHR.ui.toast.ok(PHR.t('consent.toast.copied', '授权码已复制：{code}', { code: code }),
          { detail: PHR.t('consent.toast.copiedDetail', '请通过当面、电话或医院官方渠道发给医生。') });
      } else {
        PHR.ui.toast.warn(PHR.t('consent.toast.copyFail', '复制失败，请手动记录：{code}', { code: code }));
      }
    });
  }

  /* ================================================================== *
   * 三、授权详情与访问时间线
   * ================================================================== */
  function showDetail(id) {
    var c = CS.byId(id);
    if (!c) { PHR.ui.toast.warn(PHR.t('consent.err.notFoundPlain', '授权不存在')); return; }
    var cov = S.coverage(c.scopes);
    var kv = [
      [PHR.t('consent.kv.code', '授权码'), '<span class="mono bold">' + dom.esc(c.code) + '</span>'],
      [PHR.t('consent.kv.purpose', '就诊目的'), dom.esc(c.purpose || '—')],
      [PHR.t('consent.kv.license', '执业证号'), dom.esc(c.licenseNo || '—')],
      [PHR.t('consent.kv.scopes', '授权范围'),
        c.scopes.map(function (k) { return '<span class="chip">' + dom.esc(S.nameOf(k)) + '</span>'; }).join('') +
        '<div class="t-xs dim mt1">' + PHR.t('consent.detail.coverage', '覆盖 {hit} / {total} 条记录（{percent}%）',
          { hit: cov.records, total: cov.total, percent: cov.percent }) + '</div>'],
      [PHR.t('consent.kv.period', '有效期'),
        dom.esc(PHR.t('consent.detail.periodValue', '{range}　{left}', {
          range: U.fmtDateTime(c.startAt) + ' → ' + U.fmtDateTime(c.expireAt),
          left: timeLeftText(c)
        }))],
      [PHR.t('consent.kv.accessStats', '访问统计'),
        PHR.t('consent.detail.accessStats', '共 {n} 次，最近一次 {when}', {
          n: c.accessCount || 0,
          when: c.lastAccessAt ? U.fmtFull(c.lastAccessAt) : PHR.t('consent.none.yet', '尚无')
        })],
      [PHR.t('consent.kv.note', '备注'), dom.esc(c.note || '—')]
    ];
    if (c.revokedAt) {
      kv.push([PHR.t('consent.kv.revokeRecord', '撤销记录'),
        dom.esc(PHR.t('consent.detail.revokeRecord', '{at}　原因：{reason}',
          { at: U.fmtDateTime(c.revokedAt), reason: c.revokeReason || '—' }))]);
    }

    PHR.ui.modal({
      title: PHR.t('consent.modal.detailTitle', '授权详情 · {name}', { name: c.doctorName }), size: 'wide',
      body: '<div class="row between wrap gap3 mb4"><div>' +
          '<div class="t-xl bold">' + dom.esc(c.doctorName) + ' ' + dom.esc(c.doctorTitle || '') + '</div>' +
          '<div class="dim t-sm">' + dom.esc(D.nameOf(D.hospital, c.hospital)) + PHR.t('consent.sep.dot', '　·　') +
            dom.esc(D.nameOf(D.department, c.department)) + '</div></div>' +
          PHR.ui.badges.consentStatus(c.runtimeStatus) + '</div>' +
        '<dl class="kv">' + kv.map(kvRow).join('') + '</dl>' +
        '<div class="divider"></div><div class="callout-title">' + PHR.t('consent.detail.timeline', '访问记录时间线') + '</div>' +
        (CS.activity(id).length
          ? '<div class="timeline mt3">' + CS.activity(id).map(activityItem).join('') + '</div>'
          : '<div class="dim t-sm mt2">' + PHR.t('consent.detail.noActivity', '这位医生还没有访问过您的档案。医生每一次查看都会出现在这里。') + '</div>'),
      actions: [{ label: PHR.t('ui.close', '关闭'), tone: 'ghost' }]
    });
  }

  function kvRow(p) { return '<dt>' + dom.esc(p[0]) + '</dt><dd>' + p[1] + '</dd>'; }

  /** 访问时间线里的一条：医生的动作 + 详情 + 来源环境；越权被阻断的会标红 */
  function activityItem(e) {
    var denied = e.result === 'denied';
    return '<div class="tl-item"><span class="dot"' + (denied ? ' style="background:var(--danger)"' : '') + '></span>' +
      '<div class="when">' + U.fmtDateTime(e.at) + PHR.t('consent.sep.wide', '　') +
        '<span class="dim">' + U.fmtRelative(e.at) + '</span></div>' +
      '<div class="what"><div class="h">' + PHR.ui.badges.actionRisk(e.action) + ' ' +
        dom.esc(PHR.audit ? PHR.audit.actionName(e.action) : e.action) + '</div>' +
        '<div class="d">' + dom.esc(e.detail || '—') + '</div>' +
        '<div class="t-xs dim">' + dom.esc(e.actor) + PHR.t('consent.sep.dot', '　·　') + dom.esc(e.ip) +
          PHR.t('consent.sep.dot', '　·　') + dom.esc(e.device) + '</div></div></div>';
  }

  /* ================================================================== *
   * 四、延长与撤销
   * ================================================================== */
  function askChange(id, kind) {
    var c = CS.byId(id);
    if (!c) { PHR.ui.toast.warn(PHR.t('consent.err.notFoundPlain', '授权不存在')); return; }

    if (kind === 'extend') {
      return PHR.ui.modal({
        title: PHR.t('consent.modal.extendTitle', '延长授权有效期'), size: 'narrow',
        body: '<p class="t-sm">' + PHR.t('consent.extend.body', '为「{name}」的授权延长有效期，当前截止 {at}。',
            { name: dom.esc(c.doctorName), at: U.fmtDate(c.expireAt) }) + '</p>' +
          '<div class="duration-picks mt3">' + [1, 3, 7, 14, 30].map(function (n) {
            return '<button class="btn btn-sm" data-days="' + n + '">' +
              PHR.t('consent.daysPlus', '+{n} 天', { n: n }) + '</button>'; }).join('') + '</div>',
        actions: [{ label: PHR.t('ui.cancel', '取消'), tone: 'ghost' }],
        onMount: function (box) {
          box.addEventListener('click', function (e) {
            var b = e.target.closest('[data-days]');
            if (!b) { return; }
            var r = CS.extend(id, Number(b.getAttribute('data-days')));
            if (r.ok) { PHR.ui.toast.ok(r.message); PHR.ui.closeModal(); PHR.router.reload(); }
            else { PHR.ui.toast.danger(r.message); }
          });
        }
      });
    }

    // 撤销：先二次确认，再填写原因（原因会写进审计日志的 detail）
    PHR.ui.confirm({
      title: PHR.t('consent.btn.revoke', '撤销授权'),
      message: PHR.t('consent.revoke.confirm', '确定撤销「{name}」的授权吗？', { name: c.doctorName }),
      detail: PHR.t('consent.revoke.confirmDetail',
        '撤销后医生立即无法再打开您的档案；已经查看过的记录仍会保留在访问日志中。此操作不可撤销。'),
      confirmLabel: PHR.t('consent.revoke.continue', '继续撤销'), tone: 'danger'
    }).then(function (ok) {
      if (!ok) { return; }
      PHR.ui.modal({
        title: PHR.t('consent.revoke.reasonTitle', '填写撤销原因'), size: 'narrow',
        body: '<div class="field"><label>' + PHR.t('consent.revoke.reasonLabel', '撤销原因（选填，仅自己可见）') + '</label>' +
          '<input class="input" id="rv-reason" placeholder="' +
            PHR.t('consent.revoke.reasonPlaceholder', '如：本次复诊已结束') + '"></div>',
        actions: [{ label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
          { label: PHR.t('consent.revoke.confirmBtn', '确认撤销'), tone: 'danger', action: function (v, close, box) {
              var r = CS.revoke(id, U.$('#rv-reason', box).value.trim() || PHR.t('consent.revoke.reasonDefault', '用户主动撤销'));
              if (r.ok) { PHR.ui.toast.ok(r.message); PHR.router.reload(); } else { PHR.ui.toast.danger(r.message); }
            } }]
      });
    });
  }

  /* ================================================================== *
   * 五、四步授权向导
   * ================================================================== */
  function openWizard() {
    var w = {
      step: 1, consent: null,
      d: { doctorName: '', doctorTitle: '', hospital: '', department: '', licenseNo: '', purpose: '', scopes: [], days: 7, expireDate: '' }
    };
    PHR.ui.modal({
      title: PHR.t('consent.wizard.title', '新建医生授权'), size: 'wide',
      body: '<div id="wiz"></div><div class="form-actions" id="wiz-foot"></div>',
      actions: [{ label: PHR.t('ui.close', '关闭'), tone: 'ghost' }],
      onMount: function (box) {
        box.addEventListener('click', function (e) {
          var b = e.target.closest('[data-w]');
          if (b) { return wizardAction(b.getAttribute('data-w'), box, w); }
          var preset = e.target.closest('[data-preset]');
          if (preset) {
            var p = S.presetOf(preset.getAttribute('data-preset'));
            w.d.scopes = p ? p.scopes.slice() : [];
            return drawWizard(box, w);
          }
          var dur = e.target.closest('[data-days]');
          if (dur) { w.d.days = Number(dur.getAttribute('data-days')); w.d.expireDate = ''; return drawWizard(box, w); }
        });
        box.addEventListener('change', function (e) {
          if (e.target.closest('.scope-tile')) {
            w.d.scopes = U.$$('.scope-tile input:checked', box).map(function (i) { return i.value; });
            return drawWizard(box, w);
          }
          if (e.target.id === 'w-expire') { w.d.expireDate = e.target.value; drawWizard(box, w); }
        });
        drawWizard(box, w);
      }
    });
  }

  function drawWizard(box, w) {
    U.html(U.$('#wiz', box), w.step === 5 ? resultHtml(w) : stepHtml(w));
    U.$('#wiz-foot', box).innerHTML =
      (w.step > 1 && w.step < 5 ? '<button class="btn" data-w="prev">' + PHR.t('consent.wizard.prev', '← 上一步') + '</button>' : '') +
      '<span class="grow"></span>' +
      (w.step < 4 ? '<button class="btn btn-primary" data-w="next">' + PHR.t('consent.wizard.next', '下一步 →') + '</button>' : '') +
      (w.step === 4 ? '<button class="btn btn-primary" data-w="grant">' + PHR.t('consent.wizard.grant', '✓ 生成授权码') + '</button>' : '') +
      (w.step === 5 ? '<button class="btn btn-primary" data-w="done">' + PHR.t('consent.wizard.done', '完成') + '</button>' : '');
  }

  function stepHtml(w) {
    var d = w.d;
    var head = '<div class="callout-title">' + PHR.t('consent.wizard.stepOf', '第 {n} 步 / 4 · ', { n: w.step });
    if (w.step === 1) {
      return head + PHR.t('consent.step.doctor', '医生信息') + '</div>' +
        '<p class="t-sm dim">' + PHR.t('consent.step.doctorHint',
          '这些信息会写进访问日志，便于日后核对"是谁、什么时候看了我的档案"。') + '</p>' +
        '<div class="mt4">' + PHR.ui.form.render(f1(), d) + '</div>';
    }
    if (w.step === 2) {
      var sens = S.sensitiveIn(d.scopes);
      return head + PHR.t('consent.step.scopes', '授权范围') + '</div>' +
        '<p class="t-sm dim">' + PHR.t('consent.step.scopesHint',
          '只勾选本次就诊真正需要的资料 —— 授权范围越小，暴露面越小。') + '</p>' +
        '<div class="row wrap gap2 mt3">' + S.comboPresets().map(function (p) {
          return '<span class="chip clickable" data-preset="' + p.key + '" title="' + dom.esc(p.desc) + '">' + dom.esc(p.name) + '</span>';
        }).join('') + '<span class="chip clickable" data-preset="__none">' +
          PHR.t('consent.wizard.clearPresets', '清空') + '</span></div>' +
        '<div class="scope-grid mt4">' + S.list().map(function (s) {
          var on = d.scopes.indexOf(s.key) >= 0;
          return '<label class="scope-tile' + (on ? ' checked' : '') + '"><input type="checkbox" value="' + s.key + '"' + (on ? ' checked' : '') + '>' +
            '<div class="grow"><div class="n">' + dom.esc(s.name) +
              (s.sensitive ? ' ' + PHR.ui.badge(PHR.t('consent.badge.sensitive', '建议单独确认'), 'warn') : '') + '</div>' +
            '<div class="d">' + dom.esc(s.desc) + '</div>' +
            '<div class="d">' + PHR.t('consent.scope.includes', '包含：{types}　·　当前 {n} 条记录', {
              types: dom.esc(s.typeNames.join(PHR.t('consent.sep.list', '、')) || '—'),
              n: s.recordCount
            }) + '</div></div></label>';
        }).join('') + '</div><div class="t-xs dim mt3">' + coverageText(d) + '</div>' +
        (sens.length ? '<div class="mt3">' + PHR.ui.notice('warn', PHR.t('consent.sensitive.title', '这几个范围建议单独确认'),
          PHR.t('consent.sensitive.body', '{scopes}　——　{descs}', {
            scopes: S.describe(sens),
            descs: sens.map(function (k) { return S.descOf(k); }).join(PHR.t('consent.sep.semicolon', '；'))
          }), { icon: '⚠️' }) + '</div>' : '');
    }
    if (w.step === 3) {
      return head + PHR.t('consent.step.period', '有效期') + '</div>' +
        '<p class="t-sm dim">' + PHR.t('consent.step.periodHint',
          '有效期越短越安全。到期后医生立即失去访问权限，不需要您手动操作。') + '</p>' +
        '<div class="field mt4"><label>' + PHR.t('consent.step.quickPick', '快捷选择') +
          '</label><div class="duration-picks">' + [1, 3, 7, 14, 30].map(function (n) {
          return '<button class="btn btn-sm' + (!d.expireDate && d.days === n ? ' btn-primary' : '') + '" data-days="' + n + '">' +
            PHR.t('consent.daysShort', '{n} 天', { n: n }) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field mt3"><label>' + PHR.t('consent.step.customDate', '或指定截止日期') + '</label>' +
          '<input class="input" type="date" id="w-expire" min="' + U.today() + '" value="' + dom.esc(d.expireDate) + '"></div>' +
        PHR.ui.notice('info', '', PHR.t('consent.step.expireNote', '该授权将于 <b>{at}</b> 自动失效{suffix}。', {
          at: dom.esc(expirePreview(d)),
          suffix: d.expireDate
            ? PHR.t('consent.step.expireCustom', '（自定义截止日按当天 23:59 计算）')
            : PHR.t('consent.step.expireFrom', '（自现在起 {n} 天）', { n: d.days })
        }), { icon: '⏰', raw: true });
    }
    var cov = S.coverage(d.scopes);
    return head + PHR.t('consent.step.confirm', '确认授权') + '</div>' +
      '<p class="t-sm dim">' + PHR.t('consent.step.confirmHint', '确认后系统会生成一串 12 位授权码，请把它发给医生。') + '</p>' +
      '<dl class="kv mt3">' + [
        [PHR.t('consent.kv.doctor', '医生'), dom.esc(d.doctorName + ' ' + (d.doctorTitle || ''))],
        [PHR.t('consent.kv.org', '机构科室'), dom.esc(D.nameOf(D.hospital, d.hospital) + ' · ' + D.nameOf(D.department, d.department))],
        [PHR.t('consent.kv.purpose', '就诊目的'), dom.esc(d.purpose || '—')],
        [PHR.t('consent.kv.scopes', '授权范围'), d.scopes.map(function (k) { return '<span class="chip">' + dom.esc(S.nameOf(k)) + '</span>'; }).join('')],
        [PHR.t('consent.kv.period', '有效期'), dom.esc(U.today() + ' → ' + expirePreview(d))],
        [PHR.t('consent.kv.visible', '可见记录'), PHR.t('consent.confirm.visible', '共 <b>{hit}</b> 条 / 全部 {total} 条（{percent}%）',
          { hit: cov.records, total: cov.total, percent: cov.percent })]
      ].map(kvRow).join('') + '</dl>' +
      PHR.ui.notice('warn', PHR.t('consent.confirm.noticeTitle', '确认前请再看一眼'),
        PHR.t('consent.confirm.noticeBody',
          '授权一旦生成，医生立刻就能用这串授权码进入。范围勾多了虽然可以马上撤销，但更稳妥的做法是现在改回去。'), { icon: '🔍' });
  }

  function resultHtml(w) {
    var c = w.consent;
    return '<div class="callout-title">' + PHR.t('consent.result.title', '✅ 授权已生成') + '</div>' +
      '<p class="t-sm dim">' + PHR.t('consent.result.hint',
        '请把这串授权码通过安全渠道发给医生。它只对这一次授权有效，过期或被撤销后立即作废。') + '</p>' +
      '<div class="code-display mt3">' + dom.esc(c.code) + '</div>' +
      '<div class="row center mt3"><button class="btn" data-w="copy">' +
        PHR.t('consent.btn.copy', '📋 复制授权码') + '</button></div>' +
      '<div class="mt4">' + PHR.ui.notice('ok', PHR.t('consent.result.nextTitle', '接下来会发生什么'),
        PHR.t('consent.result.nextBody',
          '医生在登录页选择「医生身份」并输入这串授权码后，只能看到您勾选的 {n} 个范围（约 {records} 条记录）；' +
          '他每一次查看都会记录在案，您可以在「访问追踪」中核对。',
          { n: c.scopes.length, records: S.coverage(c.scopes).records }), { icon: '📨' }) + '</div>';
  }

  function wizardAction(a, box, w) {
    if (a === 'prev') { w.step -= 1; return drawWizard(box, w); }
    if (a === 'copy') { return copyCode(w.consent.code); }
    if (a === 'done') { PHR.ui.closeModal(); return PHR.router.reload(); }
    if (a === 'grant') {
      var r = CS.grant(Object.assign({}, w.d, { customExpireAt: w.d.expireDate || '' }));
      if (!r.ok) { return PHR.ui.toast.danger(r.message); }
      w.consent = r.consent;
      w.step = 5;
      PHR.ui.toast.ok(PHR.t('consent.toast.granted', '授权已创建'));
      return drawWizard(box, w);
    }
    // 逐步校验：每一步只校验本步骤的输入，避免用户在四步之间来回跳时被后面的错误打断
    if (w.step === 1) {
      var fields = f1();
      var v = PHR.ui.form.read(box, fields);
      var chk = PHR.models.validateBySchema(fields, v);
      if (!chk.ok) { PHR.ui.form.showErrors(box, fields, chk.errors); return; }
      Object.assign(w.d, v);
    } else if (w.step === 2) {
      if (!w.d.scopes.length) { return PHR.ui.toast.warn(PHR.t('consent.err.scopesRequiredPick', '请至少勾选一个授权范围')); }
    } else if (w.step === 3 && w.d.expireDate) {
      var ts = U.parseDate(w.d.expireDate);
      if (isNaN(ts) || ts + 86399000 <= Date.now()) {
        return PHR.ui.toast.warn(PHR.t('consent.err.expireMustBeFuture', '请选择一个晚于今天的截止日期'));
      }
    }
    w.step += 1;
    drawWizard(box, w);
  }

  function coverageText(d) {
    var cov = S.coverage(d.scopes);
    return PHR.t('consent.wizard.coverage', '已选 {n} 个范围，覆盖 {hit} / {total} 条记录（{percent}%）',
      { n: d.scopes.length, hit: cov.records, total: cov.total, percent: cov.percent });
  }

  function expirePreview(d) { return d.expireDate || U.fmtDate(U.addDays(Date.now(), d.days)); }

})(window.PHR);
