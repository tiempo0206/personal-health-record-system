/**
 * ============================================================================
 * 文件：modules/ux/ux.view.js
 * 层：业务模块层（体验保障 —— 模块 8）· 表现层
 * 职责：注册本模块的两个视图：
 *       ① #/settings 「偏好与安全」——外观与无障碍 / 提醒设置 / 安全设置 / 数据与存储
 *       ② #/help     「使用帮助」  ——目录 + 正文 + 关键词搜索
 *      并注册 ux 模块元信息。
 *      ⚠️ 本文件**不在模块加载阶段读 store** —— 本地数据库模式下整库镜像是
 *         异步载入的，那时读到的是空的。见 core/store.js 文件头的铁律 ②。
 * 依赖：core/namespace.js、core/utils.js、core/store.js、core/models.js、
 *      core/security.js、core/dict.js、ui/components/*（dom/empty/badge/modal/
 *      toast/chart/form）、modules/ux/{preference,integrity,backup,help}.js
 * 说明：本文件不新增任何 CSS 类，全部复用 ui/styles 中已有的类名，
 *      只允许少量 style="…" 做微调（如 scroll-margin）。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var esc = dom.esc;

  /* ================================================================== *
   * 〇、模块元信息与全局设置
   * ================================================================== */
  var mod = PHR.registerModule('ux', {
    title: '体验保障',
    description: '偏好与无障碍、数据完整性自检、备份恢复与使用帮助 —— 保证系统用得下去、数据不丢、看得明白。',
    icon: '🛡️',
    folder: 'modules/ux',
    order: 8
  });

  /* 模块标题要随语言切换而变：registerModule 会把 title 拷贝成普通字符串，
     而脚本加载时语言尚未探测，因此注册后用 getter 覆盖，使面包屑即时跟随。 */
  Object.defineProperty(mod, 'title', {
    get: function () { return PHR.t('module.ux.title', '体验保障'); },
    enumerable: true, configurable: true
  });
  Object.defineProperty(mod, 'description', {
    get: function () { return PHR.t('module.ux.desc', '偏好与无障碍、数据完整性自检、备份恢复与使用帮助 —— 保证系统用得下去、数据不丢、看得明白。'); },
    enumerable: true, configurable: true
  });

  /* 「登录保持」的开关（7 天 / 仅本次会话）不在偏好清单内，单独持久化。
     ⚠️ 这里刻意**不在模块加载时**读它：core/store.file.js 在本地数据库模式下
     是异步把整库镜像读进来的，脚本求值阶段读到的是空的。登录保持的开关
     由 modules/auth/session.js 在登录时自己读（那时 boot 早已完成）。
     本项目曾经在这里（脚本求值阶段）读过 sessionIdleMinutes，那是全项目
     唯一违反"不得在加载阶段读 store"这条铁律的地方，已随本次改造删除。 */

  /* ================================================================== *
   * 一、偏好与安全（#/settings）
   * ================================================================== */
  var TABS = [
    { key: 'appearance', label: '外观与无障碍', icon: '🎨' },
    { key: 'alerts',     label: '提醒设置',     icon: '🔔' },
    { key: 'security',   label: '安全设置',     icon: '🔐' },
    { key: 'data',       label: '数据与存储',   icon: '💾' }
  ];

  /* 页签名按当前语言取词。TABS 的中文在模块加载时就求值了，那时语言尚未探测
     （core/boot.js 才调用 i18n.detect()），所以取词必须放到渲染时做。 */
  function tabLabel(key) {
    var hit = TABS.filter(function (t) { return t.key === key; })[0];
    return hit ? PHR.t('ux.tab.' + key, hit.label) : key;
  }

  var P = { page: null, body: null, tab: 'appearance' };   // 当前设置页的关键 DOM 引用

  function renderSettings(container, params) {
    var tab = String((params && (params.p1 || params.tab)) || 'appearance');
    if (!TABS.some(function (t) { return t.key === tab; })) { tab = 'appearance'; }

    container.innerHTML =
      '<div class="settings-page">' +
        '<div class="page-head"><div class="titles">' +
          '<h2>⚙️ ' + esc(PHR.t('ux.settings.headTitle', '偏好与安全')) + '</h2>' +
        '</div></div>' +
        '<div class="tabs" role="tablist">' + TABS.map(function (t) {
          return '<button type="button" role="tab" data-tab="' + t.key + '" aria-selected="' +
            (t.key === tab) + '">' + t.icon + ' ' + esc(tabLabel(t.key)) + '</button>';
        }).join('') + '</div>' +
        '<div id="settings-body"></div>' +
      '</div>';

    P.page = container.querySelector('.settings-page');
    P.body = P.page.querySelector('#settings-body');
    P.tab = tab;

    P.page.addEventListener('click', onSettingsClick);
    P.page.addEventListener('change', onSettingsChange);
    paint(tab);
  }

  function switchTab(name) {
    P.tab = name;
    U.$$('.tabs [data-tab]', P.page).forEach(function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name));
    });
    // 让页签可以直接分享；replaceState 不会触发 hashchange，视图不会被重建
    try { window.history.replaceState(null, '', '#/settings/' + name); } catch (e) { /* 忽略 */ }
    paint(name);
  }

  function paint(name) {
    if (!P.body) { return; }
    if (name === 'appearance') { paintAppearance(); }
    else if (name === 'alerts') { paintAlerts(); }
    else if (name === 'security') { paintSecurity(); }
    else { paintData(); }
  }

  /* ---------------------------- 1.1 事件 ---------------------------- */
  function onSettingsClick(e) {
    var tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { switchTab(tabBtn.getAttribute('data-tab')); return; }
    var seg = e.target.closest('.segmented[data-pref] button');
    if (seg) { applyPref(seg.closest('.segmented').getAttribute('data-pref'), seg.getAttribute('data-value')); return; }
    var act = e.target.closest('[data-act]');
    if (act) { runAction(act.getAttribute('data-act')); }
  }

  function onSettingsChange(e) {
    var sel = e.target.closest('select[data-pref]');
    if (sel) { applyPref(sel.getAttribute('data-pref'), sel.value); return; }
    var box = e.target.closest('input[type=checkbox][data-pref]');
    if (box) { applyPref(box.getAttribute('data-pref'), box.checked); }
  }

  /** 改一项偏好并就地同步控件状态（避免整块重绘导致焦点丢失） */
  function applyPref(key, rawValue) {
    var value = rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;
    if (!PHR.ux.preference.set(key, value)) {
      PHR.ui.toast.warn(PHR.t('ux.pref.unsupported', '这个取值暂不支持'));
      return;
    }
    var group = P.page.querySelector('.segmented[data-pref="' + key + '"]');
    if (group) {
      U.$$('button', group).forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === String(rawValue)));
      });
    }
    var sel = P.page.querySelector('select[data-pref="' + key + '"]');
    if (sel) { sel.value = String(rawValue); }
    PHR.ui.toast.ok(PHR.t('ux.pref.updated', '已更新「{name}」', { name: PHR.ux.preference.labelOf(key) }));
  }

  /* ---------------------------- 1.2 外观与无障碍 / 提醒设置 ---------------------------- */
  function prefField(f, value) {
    var html = '<div class="field"><label>' + esc(f.label) + '</label>' + dom.tip(f.hint);
    if (f.type === 'segmented') {
      html += '<div class="segmented" data-pref="' + esc(f.key) + '">' + (f.options || []).map(function (o) {
        return '<button type="button" data-value="' + esc(o.key) + '" aria-pressed="' +
          (value === o.key) + '">' + esc(o.name) + '</button>';
      }).join('') + '</div>';
    } else if (f.type === 'switch') {
      html += '<label class="switch"><input type="checkbox" data-pref="' + esc(f.key) + '"' +
        (value ? ' checked' : '') + '><span class="track"></span><span>' +
        esc(f.label2 || PHR.t('ux.pref.switchOn', '开启')) + '</span></label>';
    } else {
      html += '<select class="select" data-pref="' + esc(f.key) + '">' + (f.options || []).map(function (o) {
        return '<option value="' + esc(o.key) + '"' + (value === o.key ? ' selected' : '') + '>' +
          esc(o.name) + '</option>';
      }).join('') + '</select>';
    }
    return html + '</div>';
  }

  function paintPrefGroup(groupKey, title, sub, footerTone, footerTitle, footerBody) {
    var prefs = PHR.ux.preference.all();
    var fields = PHR.ux.preference.fields().filter(function (f) { return f.group === groupKey; });
    P.body.innerHTML =
      '<div class="card"><div class="card-head"><h3>' + esc(title) + '</h3>' +
        '<span class="sub">' + esc(sub) + '</span></div>' +
        '<div class="card-body">' + fields.map(function (f) { return prefField(f, prefs[f.key]); }).join('') + '</div></div>' +
      PHR.ui.notice(footerTone, footerTitle, footerBody);
  }

  function paintAppearance() {
    paintPrefGroup('appearance', tabLabel('appearance'),
      PHR.t('ux.appearance.sub', '改动立即生效，并保存在本地'), 'info',
      PHR.t('ux.appearance.whyTitle', '为什么这些选项属于「体验保障」？'),
      PHR.t('ux.appearance.whyBody',
        '字号与对比度决定低视力用户能否看清血压、血糖这类关键数字；「减少动效」可以避免前庭功能敏感的人因页面过渡产生眩晕。它们是无障碍的基本要求，而不是简单的换皮肤。'));
  }

  function paintAlerts() {
    paintPrefGroup('alerts', tabLabel('alerts'),
      PHR.t('ux.alerts.sub', '决定什么样的变化值得打断你'), 'info',
      PHR.t('ux.alerts.noteTitle', '提醒越少越安静，但可能漏掉早期变化。'),
      PHR.t('ux.alerts.noteBody',
        '刚确诊或正在调整用药的用户建议选「全部提醒」；数据已经稳定、不想被频繁打扰的用户可以选「仅危急」。'));
  }

  /* ---------------------------- 1.3 安全设置 ---------------------------- */
  function paintSecurity() {
    var user = PHR.session && PHR.session.currentUser ? PHR.session.currentUser() : null;
    var posture = PHR.security.posture(user);
    var tone = posture.score >= 80 ? 'ok' : posture.score >= 60 ? 'warn' : 'danger';

    var items = posture.items.map(function (it) {
      return '<div class="list-item"><span class="lead">' + (it.ok ? '✅' : '⚠️') + '</span>' +
        '<div class="body"><div class="title">' + esc(it.name) + ' ' +
          PHR.ui.badge(it.ok ? PHR.t('ux.security.badgeOk', '已满足') : PHR.t('ux.security.badgeTodo', '建议改进'),
            it.ok ? 'ok' : 'warn') + '</div>' +
        '<div class="sub">' + esc(it.detail) + '</div></div></div>';
    }).join('');

    P.body.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h3>' + esc(PHR.t('ux.security.cardTitle', '安全体检')) + '</h3>' +
          '<span class="sub">' + esc(PHR.t('ux.security.passed', '{passed} / {total} 项通过',
            { passed: posture.passed, total: posture.total })) + '</span>' +
          '<div class="actions"><button class="btn btn-sm" data-act="recheck">' +
            esc(PHR.t('ux.recheck', '↻ 重新体检')) + '</button></div></div>' +
        '<div class="card-body"><div class="row gap5 wrap" style="align-items:center">' +
          '<div id="posture-gauge"></div>' +
          '<div class="grow" style="min-width:240px"><div class="list">' + items + '</div></div>' +
        '</div></div>' +
        '<div class="card-foot"><span class="dim t-sm grow">' +
          esc(PHR.t('ux.security.footHint', '三个常用的安全动作')) + '</span>' +
          '<button class="btn btn-sm" data-act="pwd">' + esc(PHR.t('ux.security.changePwd', '🔑 修改密码')) + '</button>' +
          '<button class="btn btn-sm" data-act="mfa">' +
            esc(user && user.mfaEnabled ? PHR.t('ux.security.mfaOn', '🔓 多因素认证设置')
                                        : PHR.t('ux.security.mfaOff', '🔒 开启多因素认证')) + '</button>' +
          '<button class="btn btn-sm" data-act="timeout">' + esc(PHR.t('ux.security.timeout', '🔓 登录保持')) + '</button>' +
        '</div>' +
      '</div>';

    PHR.ui.chart.gauge(P.body.querySelector('#posture-gauge'), {
      percent: posture.score, value: posture.score,
      label: PHR.t('ux.security.scoreLabel', '安全评分'),
      color: tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--danger)'
    });
  }

  /* ---------------------------- 1.4 数据与存储 ---------------------------- */

  /**
   * 「数据文件」卡片 —— 只在本地数据库模式（core/store.file.js）下出现。
   *
   * 这是"我的数据到底存在哪"的诚实回答，也是落盘失败时的逃生口：
   * 连接断了就把状态标红、给一个「导出备份」的去处，而不是继续显示"已保存"。
   */
  function fileCardHtml() {
    if (PHR.store.driver !== 'file') { return ''; }
    var st = PHR.store.stats();
    var tone = st.degraded ? 'danger' : (st.savedAt ? 'ok' : 'warn');
    var text = st.degraded
      ? PHR.t('ux.data.fileOffline', '连接已断开，改动只存在于本页面')
      : (st.savedAt
          ? PHR.t('ux.data.fileSaved', '已保存 · {t} · 第 {n} 版',
              { t: st.savedAtText, n: st.revision })
          : PHR.t('ux.data.fileUnsaved', '尚未写入文件'));

    return '<div class="card mt4">' +
      '<div class="card-head"><h3>' + esc(PHR.t('ux.data.fileCardTitle', '数据文件')) + '</h3>' +
        '<span class="sub">' + esc(PHR.t('ux.data.fileCardSub',
          '数据库就存在这个文件里，可以直接打开、复制或备份')) + '</span></div>' +
      '<div class="card-body">' +
        '<div class="row between wrap gap3">' +
          '<code>' + esc(st.file || 'data/database.json') + '</code>' +
          '<span class="badge tone-' + tone + '">' + esc(text) + '</span>' +
        '</div>' +
        '<div class="row gap2 wrap mt3">' +
          '<button class="btn" data-act="save-now">' +
            esc(PHR.t('ux.data.saveNow', '💾 立即保存')) + '</button>' +
        '</div>' +
        '<div class="hint mt3">' + esc(PHR.t('ux.data.fileEditHint',
          '改动通常会自动写入；若刚才的状态显示未保存，点一下「立即保存」。' +
          '用记事本改过这个文件后请刷新页面 —— 否则界面里的下一次保存会覆盖你的修改。')) + '</div>' +
      '</div>' +
    '</div>';
  }

  /** 立即落盘（本地数据库模式下才有意义） */
  function saveNow() {
    PHR.store.flush().then(function (r) {
      if (r && r.skipped) {
        PHR.ui.toast.info(PHR.t('ux.data.notFileMode', '当前不是本地数据库模式，数据本来就直接写在存储里。'));
      } else if (r && r.ok) {
        PHR.ui.toast.ok(PHR.t('ux.data.savedNow', '已写入数据文件'));
      } else {
        PHR.ui.toast.danger(PHR.t('ux.data.saveFailed', '写入失败，请检查本地服务是否还在运行'), {
          detail: (r && r.error) || ''
        });
      }
      paint('data');
    });
  }

  function statCard(label, value, unit, sub, tone) {
    return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><div class="corner"></div>' +
      '<div class="label">' + label + '</div>' +
      '<div class="value">' + esc(value) + (unit ? '<span class="unit">' + esc(unit) + '</span>' : '') + '</div>' +
      '<div class="t-xs dim">' + sub + '</div></div>';
  }

  function paintData() {
    var usage = PHR.store.usage();
    var active = PHR.db.consents.all().filter(function (c) {
      return PHR.models.consent.effectiveStatus(c) === 'active';
    }).length;

    P.body.innerHTML =
      '<div class="grid g4">' +
        statCard('📦 ' + PHR.t('ux.data.storageUsage', '存储占用'), usage.kb, 'KB',
          PHR.t('ux.data.backendLocal', '本地存储')) +
        statCard('🗄️ ' + PHR.t('ux.data.storageBackend', '存储后端'),
          PHR.store.describe(), '',
          PHR.store.persistent ? PHR.t('ux.data.persistent', '数据可跨会话保存')
                               : PHR.t('ux.data.volatile', '关闭页面即丢失'),
          PHR.store.persistent ? 'ok' : 'warn') +
        statCard('🗂️ ' + PHR.t('ux.data.recordsLabel', '健康记录'), dom.num(PHR.db.records.count()),
          PHR.t('ux.data.unitRecords', '条'), PHR.t('ux.data.recordsSub', '覆盖 14 种记录类型')) +
        statCard('🔐 ' + PHR.t('ux.data.consentsLabel', '生效授权'), dom.num(active),
          PHR.t('ux.data.unitConsents', '条'), PHR.t('ux.data.consentsSub', '医生当前可访问的授权数量')) +
      '</div>' +
      '<div class="card mt4">' +
        '<div class="card-head"><h3>' + esc(PHR.t('ux.integrity.cardTitle', '数据完整性自检')) + '</h3>' +
          '<span class="sub">' +
            esc(PHR.t('ux.integrity.cardSub', '9 条规则扫描孤立、缺失、越界与引用失效')) + '</span>' +
          '<div class="actions"><button class="btn btn-sm" data-act="integrity">' +
            esc(PHR.t('ux.recheck', '↻ 重新体检')) + '</button></div></div>' +
        '<div class="card-body" id="integrity-body"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>' + esc(PHR.t('ux.backup.cardTitle', '备份与恢复')) + '</h3>' +
          '<span class="sub">' +
            esc(PHR.t('ux.backup.cardSub', '导出文件保存在你自己的电脑上，系统不会上传任何内容')) + '</span></div>' +
        '<div class="card-body">' +
          '<div class="row gap2 wrap">' +
            '<button class="btn" data-act="export-plain">' +
              esc(PHR.t('ux.backup.exportPlain', '📤 导出备份（明文 JSON）')) + '</button>' +
            '<button class="btn" data-act="export-enc">' +
              esc(PHR.t('ux.backup.exportEnc', '🔒 导出备份（口令加密）')) + '</button>' +
            '<button class="btn" data-act="import">' +
              esc(PHR.t('ux.backup.import', '📥 导入备份')) + '</button>' +
          '</div>' +
          '<div class="divider"></div>' +
          '<div class="row gap2 wrap">' +
            '<button class="btn" data-act="reset-sample">' +
              esc(PHR.t('ux.backup.resetDemo', '♻️ 恢复示例数据')) + '</button>' +
            '<button class="btn btn-danger" data-act="clear-all">' +
              esc(PHR.t('ux.backup.clearAll', '🗑️ 清空全部数据')) + '</button>' +
          '</div>' +
          '<div class="hint mt3">' +
            esc(PHR.t('ux.backup.dangerHint', '后两个按钮都会覆盖本地现有内容，执行前请先导出备份。')) + '</div>' +
        '</div>' +
      '</div>' +
      fileCardHtml();

    paintIntegrity(PHR.ux.integrity.check({ audit: false }));
  }

  function paintIntegrity(report) {
    var host = P.page && P.page.querySelector('#integrity-body');
    if (!host) { return; }
    var problems = report.items.filter(function (i) { return i.count > 0; });
    var tone = report.score >= 90 ? 'ok' : report.score >= 70 ? 'warn' : 'danger';

    var rows = report.items.map(function (it) {
      var icon = it.level === 'ok' ? '✅' : it.level === 'warn' ? '⚠️' : '⛔';
      var samples = (it.samples && it.samples.length)
        ? '<div class="t-xs dim">' + esc(PHR.t('ux.integrity.samples', '抽样：') +
            it.samples.join(PHR.t('ux.listSemi', '；'))) + '</div>' : '';
      return '<div class="list-item"><span class="lead">' + icon + '</span><div class="body">' +
        '<div class="title">' + esc(it.name) +
          (it.count ? ' ' + PHR.ui.badge(PHR.t('ux.integrity.count', '{n} 处', { n: it.count }),
            it.level === 'error' ? 'danger' : 'warn') : '') +
          (it.count && it.fixable ? ' ' + PHR.ui.badge(PHR.t('ux.integrity.fixable', '可自动修复'), 'info') : '') + '</div>' +
        '<div class="sub">' + esc(it.detail) + '</div>' +
        '<div class="t-xs dim mt2">' + esc(PHR.t('ux.integrity.whyLabel', '为什么检查：') + it.why) + '</div>' + samples +
      '</div></div>';
    }).join('');

    host.innerHTML =
      PHR.ui.notice(tone, PHR.t('ux.integrity.scoreNotice', '体检评分 {score} 分（{at}）',
        { score: report.score, at: report.checkedAtText }),
        problems.length
          ? PHR.t('ux.integrity.found', '发现 {kinds} 类问题、共 {n} 处，详见下方列表。',
            { kinds: problems.length, n: report.stats.totalIssues })
          : PHR.t('ux.integrity.clean', '未发现任何问题，数据结构完整。')) +
      '<div class="list">' + rows + '</div>' +
      (problems.some(function (i) { return i.fixable; })
        ? '<div class="row end mt3"><button class="btn btn-sm" data-act="repair">' +
          esc(PHR.t('ux.integrity.repairBtn', '🛠 修复可自动处理的问题')) + '</button></div>'
        : '') +
      '<div class="divider"></div>' +
      '<div class="t-xs dim">' +
        esc(PHR.t('ux.integrity.note', '体检只读取数据、不修改任何内容；修复动作会先弹窗列出「将要做什么」，确认后才执行。')) +
      '</div>';
  }

  /* ---------------------------- 1.5 安全动作 ---------------------------- */
  /** 弹出输入口令的对话框，返回 Promise<string|null> */
  function askPassword(title, message) {
    return new Promise(function (resolve) {
      var settled = false;
      var done = function (v) { if (!settled) { settled = true; resolve(v); } };
      PHR.ui.modal({
        title: title, size: 'narrow',
        body: '<p>' + esc(message) + '</p>' +
          '<div class="field"><label>' + esc(PHR.t('ux.pwd.label', '口令')) +
            '</label><input class="input" type="password" name="pwd" autocomplete="new-password"></div>' +
          '<div class="field"><label>' + esc(PHR.t('ux.pwd.confirmLabel', '确认口令')) +
            '</label><input class="input" type="password" name="pwd2" autocomplete="new-password"></div>' +
          '<div class="hint">' + esc(PHR.t('ux.pwd.minHint', '口令至少 {n} 位；忘记口令将无法恢复这份备份。',
            { n: PHR.ux.backup.PASSWORD_MIN })) + '</div>',
        actions: [
          { label: PHR.t('ui.cancel', '取消'), tone: 'ghost', action: function () { done(null); } },
          { label: PHR.t('ui.confirm', '确定'), tone: 'primary', close: false, action: function (v, close, body) {
              var a = body.querySelector('[name=pwd]').value;
              var b = body.querySelector('[name=pwd2]').value;
              if (a.length < PHR.ux.backup.PASSWORD_MIN) {
                PHR.ui.toast.warn(PHR.t('ux.pwd.tooShort', '口令至少 {n} 位', { n: PHR.ux.backup.PASSWORD_MIN }));
                return false;
              }
              if (a !== b) { PHR.ui.toast.warn(PHR.t('ux.pwd.mismatch', '两次输入的口令不一致')); return false; }
              done(a);
              close('ok');
            } }
        ],
        onClose: function () { done(null); }
      });
    });
  }

  function changePassword() {
    if (!(PHR.auth && PHR.auth.changePassword)) {
      PHR.ui.modal({ title: PHR.t('ux.pwd.changeTitle', '修改密码'), size: 'narrow',
        body: PHR.ui.notice('warn', PHR.t('ux.pwd.authMissing', '账号安全模块未加载'),
          PHR.t('ux.pwd.authMissingBody', '当前无法在此修改密码，请确认 modules/auth 下的脚本已被正确引入。')),
        actions: [{ label: PHR.t('ui.close', '关闭'), tone: 'ghost' }] });
      return;
    }
    PHR.ui.modal({
      title: PHR.t('ux.pwd.changeTitle', '修改密码'), size: 'narrow',
      body: '<div class="field"><label>' + esc(PHR.t('ux.pwd.current', '当前密码')) +
          '</label><input class="input" type="password" name="old" autocomplete="current-password"></div>' +
        '<div class="field"><label>' + esc(PHR.t('ux.pwd.new', '新密码')) +
          '</label><input class="input" type="password" name="pwd" autocomplete="new-password">' +
          '<div class="hint">' + esc(PHR.t('ux.pwd.policyHint', '至少 {n} 位，需同时包含字母与数字。',
            { n: PHR.config.passwordMinLength })) + '</div></div>' +
        '<div class="field"><label>' + esc(PHR.t('ux.pwd.confirmNew', '确认新密码')) +
          '</label><input class="input" type="password" name="pwd2" autocomplete="new-password"></div>',
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: PHR.t('ui.save', '保存'), tone: 'primary', close: false, action: function (v, close, body) {
            var val = function (n) { return body.querySelector('[name=' + n + ']').value; };
            if (!val('old')) { PHR.ui.toast.warn(PHR.t('ux.pwd.needOld', '请输入当前密码')); return false; }
            var policy = PHR.security.passwordPolicy(val('pwd'));
            if (!policy.ok) { PHR.ui.toast.warn(policy.hint); return false; }
            if (val('pwd') !== val('pwd2')) {
              PHR.ui.toast.warn(PHR.t('ux.pwd.newMismatch', '两次输入的新密码不一致'));
              return false;
            }
            var r = PHR.auth.changePassword(val('old'), val('pwd'));
            if (r && r.ok === false) {
              PHR.ui.toast.danger(r.message || PHR.t('ux.pwd.failed', '密码修改失败'));
              return false;
            }
            PHR.ui.toast.ok(PHR.t('ux.pwd.changed', '密码已修改，下次登录请使用新密码'));
            close('ok');
            paint('security');
          } }
      ]
    });
  }

  function mfaDialog() {
    var user = PHR.session && PHR.session.currentUser ? PHR.session.currentUser() : null;
    var enabled = !!(user && user.mfaEnabled);
    var chosen = (user && user.mfaFactors) || ['sms'];
    var list = (D.authFactor || []).filter(function (f) { return f.key !== 'password'; });

    PHR.ui.modal({
      title: PHR.t('ux.mfa.title', '多因素认证'), size: 'narrow',
      body: PHR.ui.notice('info', PHR.t('ux.mfa.noticeTitle', '多因素认证要求登录时再验证一次'),
          PHR.t('ux.mfa.noticeBody', '即使密码被别人知道，对方也无法在没有你手机或人脸的情况下登录。')) +
        '<label class="switch mt3"><input type="checkbox" id="mfa-on"' + (enabled ? ' checked' : '') +
          '><span class="track"></span><span>' + esc(PHR.t('ux.mfa.switch', '登录时需要二次验证')) + '</span></label>' +
        '<div class="field mt4"><label>' + esc(PHR.t('ux.mfa.factors', '允许使用的第二因素')) +
          '</label><div class="multi-select">' +
          list.map(function (f) {
            return '<label class="checkbox"><input type="checkbox" value="' + esc(f.key) + '"' +
              (chosen.indexOf(f.key) >= 0 ? ' checked' : '') + '><span>' + f.icon + ' ' + esc(f.name) + '</span></label>';
          }).join('') + '</div><div class="hint">' +
          esc(PHR.t('ux.mfa.factorsHint', '至少保留一项，否则登录时无法完成二次验证。')) + '</div></div>',
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: PHR.t('ui.save', '保存'), tone: 'primary', close: false, action: function (v, close, body) {
            var on = body.querySelector('#mfa-on').checked;
            var picked = U.$$('.multi-select input:checked', body).map(function (c) { return c.value; });
            if (on && !picked.length) {
              PHR.ui.toast.warn(PHR.t('ux.mfa.pickOne', '请至少选择一种第二因素'));
              return false;
            }
            if (!(PHR.auth && PHR.auth.setMfa)) {
              PHR.ui.toast.warn(PHR.t('ux.mfa.notSaved', '账号安全模块未加载，设置未保存'));
              close('ok');
              return true;
            }
            PHR.auth.setMfa(on, picked);
            PHR.ui.toast.ok(on ? PHR.t('ux.mfa.on', '已开启多因素认证') : PHR.t('ux.mfa.off', '已关闭多因素认证'));
            close('ok');
            paint('security');
          } }
      ]
    });
  }

  /**
   * 「登录保持」设置。
   * 这里以前是「空闲超时」下拉（5/10/15/30/60/120 分钟）。那个功能已经去掉：
   * 它与 7 天免登录互相抵消，而且纯前端的自动登出拦不住真想看的人。
   * 现在只有一个开关 —— 保持 7 天，或者只保留到关掉标签页。
   */
  function rememberDialog() {
    var on = Number(PHR.store.read('sessionRememberDays', PHR.config.sessionRememberDays)) > 0;
    PHR.ui.modal({
      title: PHR.t('ux.remember.title', '登录保持'), size: 'narrow',
      body: PHR.ui.notice('info', PHR.t('ux.remember.noticeTitle', '登录状态保持多久'),
          PHR.t('ux.remember.noticeBody',
            '开启后，登录状态会保存在这台电脑上，{n} 天内关掉浏览器再打开都不用重新输口令。' +
            '关闭则只保留到关闭标签页为止。', { n: PHR.config.sessionRememberDays })) +
        '<label class="checkbox mt3"><input type="checkbox" id="remember-on"' + (on ? ' checked' : '') + '>' +
          '<span>' + esc(PHR.t('ux.remember.label', '7 天内自动登录')) + '</span></label>' +
        '<div class="hint mt2">' +
          esc(PHR.t('ux.remember.hint',
            '共用电脑时建议关闭。系统检测到异常访问仍会照常告警，全部操作依旧留痕。')) + '</div>',
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: PHR.t('ui.save', '保存'), tone: 'primary', action: function (v, close, body) {
            var wants = body.querySelector('#remember-on').checked;
            PHR.store.write('sessionRememberDays', wants ? PHR.config.sessionRememberDays : 0);
            /* 立即生效：把当前会话按新选择重新落一次存储。
               下次登录时 session.js 会自己读这个开关。 */
            var s = PHR.session.current();
            if (s && PHR.session.repersist) { PHR.session.repersist(s, wants); }
            PHR.ui.toast.ok(wants
              ? PHR.t('ux.remember.on', '已开启：{n} 天内自动登录', { n: PHR.config.sessionRememberDays })
              : PHR.t('ux.remember.off', '已关闭：关闭浏览器后需要重新登录'));
            paint('security');
          } }
      ]
    });
  }

  /* ---------------------------- 1.6 数据动作 ---------------------------- */
  function doExport(encrypt, password) {
    var r = PHR.ux.backup.exportAll(encrypt, password);
    if (!r.ok) {
      PHR.ui.toast.warn(r.message || PHR.t('ux.export.failed', '导出失败'));
      return;
    }
    PHR.ui.toast.ok(PHR.t('ux.export.done', '已导出备份'), {
      detail: PHR.t('ux.export.detail', '{file}，共 {n} 条数据。', { file: r.filename, n: r.meta.recordCount })
    });
  }

  function doImport() {
    dom.pickFile('.json,.phr,application/json').then(function (file) {
      if (!file) { return; }
      var res = PHR.ux.backup.importAll(file.text);
      if (res.ok) { chooseImportMode(file.name, res); return; }
      if (res.needPassword) {
        askPassword(PHR.t('ux.pwd.backupTitle', '输入备份口令'),
          PHR.t('ux.pwd.backupMessage', '这份备份在导出时使用了口令加密，请输入当时的密码。')).then(function (pwd) {
          if (!pwd) { return; }
          var again = PHR.ux.backup.importAll(file.text, pwd);
          if (!again.ok) {
            PHR.ui.toast.danger(again.errors[0] || PHR.t('ux.import.checkFailed', '校验未通过'));
            return;
          }
          chooseImportMode(file.name, again);
        });
        return;
      }
      PHR.ui.toast.danger(res.errors[0] || PHR.t('ux.import.fileInvalid', '备份文件校验未通过'),
        { detail: res.errors[1] || '' });
    });
  }

  function chooseImportMode(fileName, res) {
    var s = res.summary;
    PHR.ui.modal({
      title: PHR.t('ux.import.pickTitle', '选择导入方式'), size: 'normal',
      body: '<p>' + esc(PHR.t('ux.import.fileLabel', '文件')) + ' <b>' + esc(fileName) + '</b> ' +
          esc(PHR.t('ux.import.verified', '校验通过：')) + '</p>' +
        '<dl class="kv">' +
          '<dt>' + esc(PHR.t('ux.import.exportedAt', '导出时间')) + '</dt><dd>' + esc(s.exportedAtText) + '</dd>' +
          '<dt>' + esc(PHR.t('ux.import.sourceVersion', '来源版本')) + '</dt><dd>' + esc(s.version) + '</dd>' +
          '<dt>' + esc(PHR.t('ux.import.scale', '数据规模')) + '</dt><dd>' +
            esc(PHR.t('ux.import.scaleValue', '{records} 条 / {collections} 个集合',
              { records: s.recordCount, collections: s.collectionCount })) + '</dd>' +
          '<dt>' + esc(PHR.t('ux.import.encryptedLabel', '是否加密')) + '</dt><dd>' +
            esc(s.encrypted ? PHR.t('ux.import.encryptedYes', '是（已解密）')
                            : PHR.t('ux.import.encryptedNo', '否')) + '</dd>' +
        '</dl>' +
        (res.warnings.length
          ? PHR.ui.notice('warn', PHR.t('ux.import.warningsTitle', '需要注意'),
              res.warnings.join(PHR.t('ux.listSemi', '；')))
          : '') +
        '<p class="t-sm muted">' + esc(PHR.t('ux.import.modeExplain',
          '「合并导入」按编号合并，同编号覆盖、其余新增；「覆盖导入」会先清空本地现有数据。两种方式在写入出错时都会自动整体回滚。')) + '</p>',
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: PHR.t('ux.import.merge', '合并导入'), tone: 'primary', action: function () { applyMode(res, 'merge'); } },
        { label: PHR.t('ux.import.replace', '覆盖导入'), tone: 'danger', action: function () { applyMode(res, 'replace'); } }
      ]
    });
  }

  function applyMode(res, mode) {
    var go = function () {
      var r = PHR.ux.backup.applyImport(res.payload, mode);
      if (!r.ok) {
        PHR.ui.toast.danger(r.errors[0] || PHR.t('ux.import.failed', '导入失败'));
        return;
      }
      PHR.ui.toast.ok(PHR.t('ux.import.done', '导入完成'), {
        detail: r.skipped
          ? PHR.t('ux.import.doneDetailSkip', '共写入 {n} 条数据，跳过 {k} 条无效数据。',
            { n: r.total, k: r.skipped })
          : PHR.t('ux.import.doneDetail', '共写入 {n} 条数据。', { n: r.total })
      });
      paint('data');
    };
    if (mode !== 'replace') { go(); return; }
    PHR.ui.confirm({
      title: PHR.t('ux.overwrite.title', '覆盖导入'),
      message: PHR.t('ux.overwrite.message', '覆盖导入会先清空本地现有的全部健康数据，再写入备份文件中的内容。'),
      detail: PHR.t('ux.overwrite.detail', '写入前系统会自动留一份内存快照，中途出错会整体回滚。'),
      confirmLabel: PHR.t('ux.overwrite.confirm', '继续覆盖'),
      requireText: PHR.t('ux.overwrite.requireText', '确认覆盖'), tone: 'danger'
    }).then(function (ok) { if (ok) { go(); } });
  }

  function resetDemo() {
    PHR.ui.confirm({
      title: PHR.t('ux.resetDemo.title', '恢复示例数据'),
      message: PHR.t('ux.resetDemo.message', '将清空本地现有数据，并恢复一套示例健康档案。'),
      detail: PHR.t('ux.resetDemo.detail', '此操作不可撤销，建议先导出备份。'),
      confirmLabel: PHR.t('ux.resetDemo.confirm', '恢复示例数据'), tone: 'danger'
    }).then(function (ok) {
      if (!ok) { return; }
      PHR.ux.backup.resetDemo();
      PHR.ux.preference.apply();       // 示例数据会重建偏好行，这里同步一下界面
      PHR.ui.toast.ok(PHR.t('ux.resetDemo.done', '示例数据已恢复'));
      paint('data');
    });
  }

  function clearAllData() {
    PHR.ui.confirm({
      title: PHR.t('ux.clearAll.title', '清空全部数据'),
      message: PHR.t('ux.clearAll.message', '这会删除本地保存的账号、健康档案、医生授权、社群内容与审计日志。'),
      detail: PHR.t('ux.clearAll.detail', '删除后无法撤销。确认执行后系统会重新加载页面。'),
      confirmLabel: PHR.t('ux.clearAll.confirm', '清空全部数据'),
      requireText: PHR.t('ux.clearAll.requireText', '确认清空'), tone: 'danger'
    }).then(function (ok) {
      if (!ok) { return; }
      PHR.ux.backup.clearAll();
      PHR.ui.toast.ok(PHR.t('ux.clearAll.done', '已清空本地全部数据'));
      setTimeout(function () { window.location.reload(); }, 900);
    });
  }

  function repairDialog() {
    var plan = PHR.ux.integrity.planRepair();
    if (!plan.total) { PHR.ui.toast.info(PHR.t('ux.repair.noPlan', '没有可自动修复的问题')); return; }
    PHR.ui.modal({
      title: PHR.t('ux.repair.title', '确认修复'), size: 'normal',
      body: '<p>' + esc(PHR.t('ux.repair.intro', '系统将执行以下修复动作：')) + '</p>' +
        '<div class="list">' + plan.actions.map(function (a) {
          return '<div class="list-item"><span class="lead">🛠</span><div class="body">' +
            '<div class="title">' + esc(a.name) + ' ' +
              PHR.ui.badge(PHR.t('ux.repair.itemCount', '{n} 条', { n: a.count }), 'warn') + '</div>' +
            '<div class="sub">' + esc(a.detail) + '</div></div></div>';
        }).join('') + '</div>' +
        PHR.ui.notice('warn', PHR.t('ux.repair.noteTitle', '修复前请确认'),
          PHR.t('ux.repair.noteBody', '其中"删除记录"之类的动作不可撤销，建议先在「数据与存储」里导出一份备份再执行。')),
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: PHR.t('ux.repair.confirmLabel', '执行修复'), tone: 'danger', action: function () {
            var r = PHR.ux.integrity.repair(null, true);
            PHR.ui.toast.ok(PHR.t('ux.repair.done', '修复完成'), { detail: r.message });
            paintIntegrity(PHR.ux.integrity.check({ audit: false }));
          } }
      ]
    });
  }

  function runAction(name) {
    switch (name) {
      case 'recheck':   paint('security'); PHR.ui.toast.ok(PHR.t('ux.rechecked', '已重新体检')); break;
      case 'pwd':       changePassword(); break;
      case 'mfa':       mfaDialog(); break;
      case 'timeout':   rememberDialog(); break;
      case 'integrity': paintIntegrity(PHR.ux.integrity.check()); break;
      case 'repair':    repairDialog(); break;
      case 'export-plain': doExport(false); break;
      case 'export-enc':
        askPassword(PHR.t('ux.export.encTitle', '加密导出'),
          PHR.t('ux.export.encMessage', '口令用于加密整份备份文件，请牢记 —— 忘记口令将无法恢复这份备份。'))
          .then(function (pwd) { if (pwd) { doExport(true, pwd); } });
        break;
      case 'import':    doImport(); break;
      case 'reset-sample': resetDemo(); break;
      case 'clear-all': clearAllData(); break;
      case 'save-now':  saveNow(); break;
      default: break;
    }
  }

  /* ================================================================== *
   * 二、使用帮助（#/help）
   * ================================================================== */
  function tocHtml(sections) {
    return sections.map(function (sec) {
      return '<div class="grp">' + sec.icon + ' ' + esc(sec.title) + '</div>' +
        sec.articles.map(function (a) {
          return '<a href="#help-' + sec.id + '-' + a.id + '" data-anchor="help-' + sec.id + '-' + a.id +
            '" style="padding-left:var(--sp-4)">' + esc(a.title) + '</a>';
        }).join('');
    }).join('');
  }

  function sectionHtml(sec) {
    return '<section class="help-article" id="help-' + sec.id + '">' +
      '<h3>' + sec.icon + ' ' + esc(sec.title) + '</h3>' +
      sec.articles.map(function (a) { return articleHtml(sec, a); }).join('') +
      '</section>';
  }

  /* 正文是 modules/ux/help.js 中手写的受信任 HTML，标题与问答仍然转义 */
  function articleHtml(sec, a) {
    var faq = (a.faq || []).map(function (f) {
      return '<details class="faq-item"><summary>' + esc(f.q) + '</summary>' +
        '<div class="ans">' + esc(f.a) + '</div></details>';
    }).join('');
    return '<div id="help-' + sec.id + '-' + a.id + '" style="scroll-margin-top:80px">' +
      '<h4>' + esc(a.title) + '</h4>' + a.body + faq + '</div>';
  }

  function resultsHtml(hits, keyword) {
    if (!hits.length) {
      return PHR.ui.empty({ icon: '🔍', title: PHR.t('ux.help.noResult', '没有找到相关内容'),
        hint: PHR.t('ux.help.noResultHint', '换个关键词试试，例如「密码」「授权」「备份」「趋势图」「换电脑」。'),
        compact: true });
    }
    return '<div class="card"><div class="card-head"><h3>' + esc(PHR.t('ux.help.results', '搜索结果')) + '</h3>' +
      '<span class="sub">' + esc(PHR.t('ux.help.hits', '命中 {n} 篇，点击可跳转到正文', { n: hits.length })) +
      '</span></div>' +
      '<div class="list">' + hits.map(function (h) {
        return '<div class="list-item clickable" data-goto="help-' + h.sectionId + '-' + h.articleId + '">' +
          '<span class="lead">' + (h.sectionIcon || '📄') + '</span>' +
          '<div class="body"><div class="title">' + U.highlight(h.title, keyword) + '</div>' +
          '<div class="sub">' + esc(h.sectionTitle) + ' · ' + U.highlight(h.snippet, keyword) + '</div></div></div>';
      }).join('') + '</div></div>';
  }

  function scrollToAnchor(id) { dom.scrollTo('#' + id); }

  function renderHelp(container) {
    var sections = PHR.ux.help.sections();
    var stats = PHR.ux.help.stats();

    container.innerHTML =
      '<div class="help-page">' +
        '<div class="page-head"><div class="titles">' +
          '<h2>❓ ' + esc(PHR.t('view.help.title', '使用帮助')) + '</h2>' +
          '<div class="desc">' + esc(PHR.t('ux.help.desc',
            '面向普通使用者的操作说明：{sections} 个章节、{articles} 篇文章、{faqs} 条问答。每个模块在哪里、怎么点、为什么这样设计，都在这里。',
            { sections: stats.sections, articles: stats.articles, faqs: stats.faqs })) + '</div>' +
        '</div></div>' +
        '<div class="card"><div class="card-body tight"><div class="row gap3">' +
          '<span class="ico" aria-hidden="true">🔍</span>' +
          '<input class="input grow" type="search" id="help-q" autocomplete="off" aria-label="' +
            esc(PHR.t('ux.help.searchAria', '搜索帮助内容')) + '" ' +
            'placeholder="' + esc(PHR.t('ux.help.searchPlaceholder',
              '搜索帮助内容，例如「忘记密码」「授权范围」「换电脑」「趋势图」…')) + '">' +
          '<button class="btn btn-sm" data-help="clear">' + esc(PHR.t('ui.clear', '清空')) + '</button>' +
        '</div></div></div>' +
        '<div class="help-layout mt4">' +
          '<nav class="help-toc" id="help-toc" aria-label="' +
            esc(PHR.t('ux.help.tocAria', '帮助目录')) + '">' + tocHtml(sections) + '</nav>' +
          '<div class="help-body col gap6" id="help-body">' + sections.map(sectionHtml).join('') + '</div>' +
        '</div>' +
      '</div>';

    var page = container.querySelector('.help-page');
    var input = page.querySelector('#help-q');
    var body = page.querySelector('#help-body');
    var toc = page.querySelector('#help-toc');
    var full = body.innerHTML;                 // 保留完整正文，清空搜索时还原

    input.addEventListener('input', U.debounce(function () {
      var kw = input.value.trim();
      body.innerHTML = kw ? resultsHtml(PHR.ux.help.search(kw), kw) : full;
    }, 180));

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; body.innerHTML = full; }
    });

    page.addEventListener('click', function (e) {
      if (e.target.closest('[data-help="clear"]')) {
        input.value = ''; body.innerHTML = full; input.focus(); return;
      }
      var go = e.target.closest('[data-goto]');
      if (go) {
        var target = go.getAttribute('data-goto');
        input.value = '';
        body.innerHTML = full;
        setTimeout(function () { scrollToAnchor(target); }, 30);
        return;
      }
      var a = e.target.closest('[data-anchor]');
      if (a) {
        // 本系统用 location.hash 做路由，必须阻止 <a href="#…"> 改变路由
        e.preventDefault();
        if (input.value.trim()) { input.value = ''; body.innerHTML = full; }
        U.$$('a', toc).forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        scrollToAnchor(a.getAttribute('data-anchor'));
      }
    });
  }

  /* ================================================================== *
   * 三、注册视图
   * ================================================================== */
  PHR.registerView('settings', {
    title: PHR.t('view.settings.title', '偏好与安全'), icon: '⚙️', group: 'system', order: 90, module: 'ux',
    render: renderSettings
  });

  PHR.registerView('help', {
    title: PHR.t('view.help.title', '使用帮助'), icon: '❓', group: 'system', order: 92, nav: true, module: 'ux',
    render: renderHelp
  });

  /* ================================================================== *
   * 四、本地数据库的连接状态提示
   * ------------------------------------------------------------------
   * 挂一次、全站生效。这两件事都必须让用户看见：
   *   · 连接断了却继续显示"已保存"，用户会以为数据安全，其实只在内存里；
   *   · 两个标签页互相覆盖，是最难排查的一类数据丢失，静默覆盖绝不能接受。
   * 所以宁可弹一个需要手动关掉的提示，也不默默吞掉。
   * ================================================================== */
  PHR.bus.on('store:offline', function (e) {
    PHR.ui.toast.danger(PHR.t('ux.data.offlineTitle', '与本地数据库的连接已断开'), {
      detail: PHR.t('ux.data.offlineDetail',
        '改动暂存在当前页面的内存里，请先不要关闭页面；要留存请到「数据与存储」导出备份。' +
        '（{err}）', { err: (e && e.error) || PHR.t('ux.data.offlineUnknown', '原因不明') }),
      duration: 0
    });
  });

  PHR.bus.on('store:conflict', function () {
    PHR.ui.toast.warn(PHR.t('ux.data.conflictTitle', '另一个标签页也改动了数据'), {
      detail: PHR.t('ux.data.conflictDetail',
        '本页的改动已经写入，覆盖了对方那一版。建议只开一个标签页使用本系统。')
    });
  });

})(window.PHR);
