/**
 * ============================================================================
 * 文件：modules/search/search.view.js
 * 层：业务模块层（智能搜索 —— 模块 3）
 * 职责：注册「智能检索」页面（#/search）：
 *      · 大搜索框 + 实时输入联想 + 相关度/时间排序
 *      · 预设筛选（一键常用检索）+ 展开式高级筛选面板
 *      · 已选条件 chip（可单条移除）+ 保存为常用搜索
 *      · 结果列表（类型徽章、标题高亮、命中片段、日期、来源徽章）
 *      · 搜索历史 / 常用搜索 / 热门关键词 / 索引统计
 *      样式全部复用 ui/styles/views.css「三、智能搜索」的既有类，
 *      需要临时定位的地方用行内 style，不新增 CSS 类。
 * 依赖：ui/components/{dom,empty,badge,table,toast,modal}.js、modules/search/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  PHR.search = PHR.search || {};

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  // 同目录依赖：为兼容脚本加载顺序，在 render() 时解析，而不是加载时写死
  var SVC, FL, HIST;
  function deps() {
    SVC = PHR.search.service;
    FL = PHR.search.filters;
    HIST = PHR.search.history;
  }

  var LIMIT = 30;          // 单次最多展示的结果条数
  var seq = 0;             // 检索序号：丢弃过期的异步结果

  var state = {
    q: '',
    sort: 'relevance',
    adv: false,
    filter: null,
    items: [],
    total: 0,
    shown: 0,
    took: 0,
    expanded: false,
    suggestions: [],
    suggest: null,
    suggestOpen: false
  };

  PHR.registerView('search', {
    title: PHR.t('view.search.title', '智能检索'), icon: '🔍', group: 'main', order: 4, module: 'search',
    render: render
  });

  /* ================================================================== *
   * 一、页面骨架
   * ================================================================== */
  function render(root, params) {
    deps();
    viewRoot = root;


    // 医生访客模式：本页会对"当前用户的全部记录"做检索，而医生必须按授权范围逐条校验，
    // 全量检索等于绕过授权，因此这里只给提示，把医生引回「医生视图」。
    if (isDoctorGuest()) {
      root.innerHTML = '<div class="page-head"><div class="titles"><h2>' +
          PHR.t('search.view.headTitle', '智能检索') + '</h2>' +
        '<div class="desc">' + PHR.t('search.view.doctorGuestDesc', '医生访客模式下不提供全量检索') + '</div></div></div>' +
        PHR.ui.empty({
          icon: '🔐',
          title: PHR.t('search.view.doctorGuestTitle', '医生访客模式不开放全量检索'),
          hint: PHR.t('search.view.doctorGuestHint',
            '患者的档案需要按授权范围逐条校验后才能查看，全量检索会绕过这层校验。' +
            '请回到「医生视图」，在授权范围内查看被授权的资料；需要更多内容时，请由患者扩大授权范围。'),
          action: { label: PHR.t('search.view.goDoctor', '前往医生视图'), action: 'to-doctor' }
        });
      dom.actions(root, { 'to-doctor': function () { PHR.router.go('/doctor'); } });
      return;
    }

    state.q = params && params.q ? String(params.q) : '';
    state.filter = FL.default();
    state.sort = 'relevance';
    state.items = [];
    state.total = 0;

    // 支持从别处带参进入：#/search?q=xxx&preset=recent_lab&type=vital
    if (params && params.type) { state.filter.types = [params.type]; }
    if (params && params.preset) { applyPresetFilter(params.preset); }

    root.innerHTML = pageHtml();
    bind(root);
    search(!!state.q);
  }

  function pageHtml() {
    return headHtml() + searchZoneHtml() + presetCardHtml() + advCardHtml() + resultCardHtml() + sideHtml();
  }

  /** 本视图渲染时使用的容器。rerender() 必须写回同一个容器，
      而不是重新去问 shell 要一个 —— 那会把视图和外壳重新耦合起来。 */
  var viewRoot = null;

  /** 当前会话是否为"医生访客"（凭患者授权进入的受限视图） */
  function isDoctorGuest() {
    return !!(PHR.session && PHR.session.isDoctorGuest && PHR.session.isDoctorGuest());
  }

  function headHtml() {
    return '<div class="page-head">' +
      '<div class="titles">' +
        '<h2>' + PHR.t('search.view.headTitle', '智能检索') + '</h2>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" data-action="to-records">' + PHR.t('search.view.backToRecords', '🗂️ 回档案列表') + '</button>' +
        '<button class="btn btn-soft" data-action="toggle-adv">' +
          (state.adv ? PHR.t('search.view.collapseFilter', '收起筛选') : PHR.t('search.view.advancedFilter', '⚙️ 高级筛选')) +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function searchZoneHtml() {
    var sorts = FL.SORT_OPTIONS.map(function (s) {
      return '<button data-sort="' + s.key + '" aria-pressed="' + (state.sort === s.key) + '">' +
        dom.esc(FL.sortName(s.key)) + '</button>';
    }).join('');
    return '<div class="rel mb4">' +
      '<div class="search-bar" style="margin-bottom:0">' +
        '<div class="search-input-wrap">' +
          '<span class="ico">🔍</span>' +
          '<input class="input" id="s-q" type="text" autocomplete="off" value="' + dom.esc(state.q) + '"' +
            ' placeholder="' + dom.esc(PHR.t('search.view.searchPlaceholder', '搜索标题、药品、诊断、医院、医生…（Enter 检索，/ 聚焦）')) + '"' +
            ' aria-label="' + dom.esc(PHR.t('search.view.searchAria', '搜索健康档案')) + '">' +
          '<button class="clear" data-action="clear" aria-label="' + dom.esc(PHR.t('search.view.clearInput', '清空')) + '">✕</button>' +
        '</div>' +
        '<div class="segmented" id="s-sort">' + sorts + '</div>' +
        '<button class="btn btn-primary" data-action="go">' + PHR.t('search.view.searchBtn', '搜索') + '</button>' +
      '</div>' +
      '<div class="card" id="s-suggest" style="display:none;position:absolute;left:0;right:0;' +
        'top:calc(100% + 8px);z-index:60;max-height:360px;overflow:auto;padding:var(--sp-2)"></div>' +
    '</div>';
  }

  function presetCardHtml() {
    var chips = FL.presets().map(function (p) {
      return '<span class="chip clickable" data-preset="' + p.key + '" title="' + dom.esc(p.desc) + '">' +
        p.icon + ' ' + dom.esc(p.name) + '</span>';
    }).join('');
    return '<div class="card mb4"><div class="card-body tight">' +
      '<div class="row wrap gap2 mb3"><span class="dim t-sm">' + PHR.t('search.view.presetsLabel', '预设检索') + '</span>' + chips + '</div>' +
      '<div class="row wrap gap2" id="s-chips"></div>' +
    '</div></div>';
  }

  function row(label, body) {
    return '<div class="filter-row"><span class="lbl">' + dom.esc(label) + '</span>' +
      '<div class="opts">' + body + '</div></div>';
  }

  function selectHtml(id, list, value, placeholder) {
    return '<select class="select" id="' + id + '" style="max-width:190px">' +
      '<option value="">' + dom.esc(placeholder) + '</option>' +
      list.map(function (x) {
        return '<option value="' + dom.esc(x.key) + '"' + (value === x.key ? ' selected' : '') + '>' +
          dom.esc(x.name) + '</option>';
      }).join('') + '</select>';
  }

  function advCardHtml() {
    var opt = FL.options();
    var f = state.filter;
    var typeChips = opt.types.map(function (t) {
      return '<span class="chip clickable' + (f.types.indexOf(t.key) >= 0 ? ' active' : '') +
        '" data-ftype="' + t.key + '">' + t.icon + ' ' + dom.esc(t.name) + '</span>';
    }).join('');
    var catChips = opt.diseaseCats.map(function (c) {
      return '<span class="chip clickable' + (f.diseaseCats.indexOf(c.key) >= 0 ? ' active' : '') +
        '" data-fcat="' + c.key + '">' + c.icon + ' ' + dom.esc(c.name) + '</span>';
    }).join('');
    var tagChips = opt.tags.slice(0, 14).map(function (t) {
      /* 值用原标签（筛选键），显示走 tagLabel 查词条 */
      return '<span class="chip clickable' + (f.tags.indexOf(t) >= 0 ? ' active' : '') +
        '" data-ftag="' + dom.esc(t) + '">#' + dom.esc(FL.tagLabel(t)) + '</span>';
    }).join('') || '<span class="dim t-sm">' + PHR.t('search.view.noTags', '（还没有给记录打过标签）') + '</span>';

    return '<div class="card mb4' + (state.adv ? '' : ' hidden') + '" id="s-adv">' +
      '<div class="card-head"><h3>' + PHR.t('search.view.advTitle', '高级筛选') + '</h3>' +
        '<div class="sub">' + PHR.t('search.view.advSub', '不同条件之间是「并且」的关系，同一条件内多选是「或者」') + '</div>' +
        '<div class="actions"><button class="btn btn-sm btn-ghost" data-action="reset-filter">' +
          PHR.t('search.view.resetFilter', '重置条件') + '</button></div>' +
      '</div>' +
      '<div class="card-body tight"><div class="filter-panel">' +
        row(PHR.t('search.view.rowKeyword', '关键词'),
          '<div class="search-input-wrap grow" style="max-width:420px"><span class="ico">🔍</span>' +
          '<input class="input" id="f-kw" value="' + dom.esc(state.q) + '" placeholder="' +
            dom.esc(PHR.t('search.view.rowKeywordPlaceholder', '与上方搜索框同步')) + '"></div>') +
        row(PHR.t('search.view.rowDate', '时间区间'), '<div class="date-range">' +
            '<input class="input" type="date" id="f-from" value="' + dom.esc(f.from) + '" aria-label="' +
              dom.esc(PHR.t('search.view.dateFromAria', '起始日期')) + '">' +
            '<span class="dim">' + PHR.t('search.view.dateTo', '至') + '</span>' +
            '<input class="input" type="date" id="f-to" value="' + dom.esc(f.to) + '" aria-label="' +
              dom.esc(PHR.t('search.view.dateToAria', '结束日期')) + '"></div>' +
          '<button class="btn btn-sm btn-ghost" data-range="90">' + PHR.t('search.view.range90', '近 90 天') + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-range="365">' + PHR.t('search.view.rangeYear', '近一年') + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-range="0">' + PHR.t('search.view.rangeAll', '不限') + '</button>') +
        row(PHR.t('search.view.rowType', '记录类型'), typeChips) +
        row(PHR.t('search.view.rowDiseaseCat', '疾病分类'), catChips) +
        row(PHR.t('search.view.rowSourceSeverity', '来源与程度'),
          selectHtml('f-source', opt.sources, f.sources[0] || '', PHR.t('search.view.allSources', '全部来源')) +
          selectHtml('f-sev', opt.severities, f.severities[0] || '', PHR.t('search.view.allSeverities', '全部严重程度')) +
          selectHtml('f-scope', opt.scopes, f.scopes[0] || '', PHR.t('search.view.allScopes', '全部授权范围'))) +
        row(PHR.t('search.view.rowTags', '标签'), tagChips) +
        row(PHR.t('search.view.rowOther', '其它'),
          '<label class="checkbox"><input type="checkbox" id="f-abnormal"' +
          (f.abnormalOnly ? ' checked' : '') + '><span>' +
          PHR.t('search.view.abnormalOnly', '只看被标记为异常的记录') + '</span></label>') +
      '</div></div>' +
    '</div>';
  }

  function resultCardHtml() {
    return '<div class="card mb4">' +
      '<div class="card-head"><h3>' + PHR.t('search.view.resultTitle', '检索结果') + '</h3><div class="sub" id="s-sum"></div>' +
        '<div class="actions"><span class="dim t-xs" id="s-took"></span></div></div>' +
      '<div class="card-body" id="s-area"></div>' +
    '</div>';
  }

  function sideHtml() {
    function wrap(inner) { return '<div>' + inner + '</div>'; }   // 避免 .card + .card 的相邻外边距
    return '<div class="grid g3">' +
      wrap('<div class="card"><div class="card-head"><h3>' + PHR.t('search.view.historyTitle', '搜索历史') + '</h3>' +
        '<div class="actions"><button class="btn btn-sm btn-ghost" data-action="clear-history">' +
          PHR.t('search.view.clearHistoryBtn', '清空') + '</button></div></div>' +
        '<div class="card-body tight" id="s-history"></div></div>') +
      wrap('<div class="card"><div class="card-head"><h3>' + PHR.t('search.view.savedTitle', '常用搜索') + '</h3>' +
        '<div class="sub">' + PHR.t('search.view.savedSub', '登录后一直保留') + '</div></div>' +
        '<div class="card-body tight" id="s-saved"></div></div>') +
      wrap('<div class="card"><div class="card-head"><h3>' + PHR.t('search.view.hotTitle', '热门关键词') + '</h3></div>' +
        '<div class="card-body tight" id="s-hot"></div>' +
        '<div class="card-foot t-xs dim" id="s-stats"></div></div>') +
    '</div>';
  }

  /* ================================================================== *
   * 二、交互绑定
   * ================================================================== */
  function bind(root) {
    var input = U.$('#s-q', root);
    input.addEventListener('input', U.debounce(function () {
      state.q = input.value.trim();
      loadSuggest(root);
      search(false);
    }, 240));
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); hideSuggest(root); search(true); }
      if (e.key === 'Escape') { hideSuggest(root); }
    });
    input.addEventListener('focus', function () { loadSuggest(root); });

    var kw = U.$('#f-kw', root);
    kw.addEventListener('input', U.debounce(function () {
      state.q = kw.value.trim();
      input.value = state.q;
      search(false);
    }, 260));

    ['f-from', 'f-to'].forEach(function (id) {
      U.$('#' + id, root).addEventListener('change', function () {
        state.filter.from = U.$('#f-from', root).value;
        state.filter.to = U.$('#f-to', root).value;
        rerender(false);
      });
    });

    U.$('#f-abnormal', root).addEventListener('change', function (e) {
      state.filter.abnormalOnly = e.target.checked;
      rerender(false);
    });

    var selMap = { 'f-source': 'sources', 'f-sev': 'severities', 'f-scope': 'scopes' };
    Object.keys(selMap).forEach(function (id) {
      var el = U.$('#' + id, root);
      el.addEventListener('change', function () {
        state.filter[selMap[id]] = el.value ? [el.value] : [];
        rerender(false);
      });
    });

    // 委托类监听只绑一次：rerender() 只替换 root 的 innerHTML，root 本身不变，
    // 重复绑定会导致一次点击被处理多次（勾选型 chip 会"选了又取消"）。
    if (root.__searchDelegated) { return; }
    root.__searchDelegated = true;

    /* 输入框可能因为重渲染/页面切换而不在了，一律判空后再取值 ——
       绝不让"元素不存在"变成一次未捕获异常。 */
    function qInput() { return U.$('#s-q', root); }
    function qValue() { var i = qInput(); return i ? i.value.trim() : state.q; }
    function qSet(v) { var i = qInput(); if (i) { i.value = v; } }
    function qFocus() { var i = qInput(); if (i) { i.focus(); } }

    dom.actions(root, {
      go: function () { state.q = qValue(); hideSuggest(root); search(true); },
      clear: function () {
        qSet('');
        state.q = '';
        hideSuggest(root);
        search(false);
        qFocus();
      },
      'toggle-adv': function () { state.adv = !state.adv; rerender(false); },
      'reset-filter': function () { state.filter = FL.default(); rerender(false); },
      'reset-all': function () {
        state.q = '';
        state.filter = FL.default();
        rerender(false);
      },
      'save-search': saveSearch,
      'clear-history': function () {
        PHR.ui.confirm({
          title: PHR.t('search.view.clearHistoryTitle', '清空搜索历史'),
          message: PHR.t('search.view.clearHistoryMessage', '确定要清空全部搜索历史吗？'),
          detail: PHR.t('search.view.clearHistoryDetail', '只会删除检索记录，不影响任何健康档案数据。'),
          confirmLabel: PHR.t('search.view.clearHistoryConfirm', '清空'), tone: 'warn'
        }).then(function (ok) {
          if (ok) { HIST.clear(); drawSide(root); PHR.ui.toast.ok(PHR.t('search.view.historyCleared', '搜索历史已清空')); }
        });
      },
      'to-records': function () { PHR.router.go('/records'); }
    });

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-preset],[data-ftype],[data-fcat],[data-ftag],[data-chip],' +
        '[data-range],[data-sort],[data-sug],[data-hist],[data-hdel],[data-saved],[data-sdel],[data-hot],[data-open]');
      if (!t || !root.contains(t)) { return; }

      if (t.hasAttribute('data-preset')) { applyPresetFilter(t.getAttribute('data-preset')); return rerender(false); }
      if (t.hasAttribute('data-ftype')) { toggle(state.filter.types, t.getAttribute('data-ftype')); return rerender(false); }
      if (t.hasAttribute('data-fcat')) { toggle(state.filter.diseaseCats, t.getAttribute('data-fcat')); return rerender(false); }
      if (t.hasAttribute('data-ftag')) { toggle(state.filter.tags, t.getAttribute('data-ftag')); return rerender(false); }
      if (t.hasAttribute('data-chip')) { removeChip(t.getAttribute('data-chip'), t.getAttribute('data-value')); return rerender(false); }
      if (t.hasAttribute('data-range')) { setRange(Number(t.getAttribute('data-range'))); return rerender(false); }
      if (t.hasAttribute('data-sort')) { state.sort = t.getAttribute('data-sort'); return rerender(false); }
      if (t.hasAttribute('data-sug')) { pickKeyword(t.getAttribute('data-sug')); return; }
      if (t.hasAttribute('data-hist')) { loadFrom(HIST.list().filter(function (h) { return h.id === t.getAttribute('data-hist'); })[0]); return; }
      if (t.hasAttribute('data-hdel')) { HIST.remove(t.getAttribute('data-hdel')); drawSide(root); return; }
      if (t.hasAttribute('data-saved')) { loadFrom(HIST.saved().filter(function (s) { return s.id === t.getAttribute('data-saved'); })[0]); return; }
      if (t.hasAttribute('data-sdel')) { HIST.removeSaved(t.getAttribute('data-sdel')); drawSide(root); return; }
      if (t.hasAttribute('data-hot')) { pickKeyword(t.getAttribute('data-hot')); return; }
      if (t.hasAttribute('data-open')) { PHR.router.go('/records-edit/' + t.getAttribute('data-open')); }
    });
  }

  function toggle(arr, v) {
    var i = arr.indexOf(v);
    if (i >= 0) { arr.splice(i, 1); } else { arr.push(v); }
  }

  function removeChip(field, value) {
    var f = state.filter;
    if (field === 'from' || field === 'to') { f[field] = ''; return; }
    if (field === 'abnormalOnly') { f.abnormalOnly = false; return; }
    var i = (f[field] || []).indexOf(value);
    if (i >= 0) { f[field].splice(i, 1); }
  }

  function setRange(days) {
    state.filter.from = days > 0 ? U.fmtDate(Date.now() - days * 86400000) : '';
    state.filter.to = '';
  }

  function applyPresetFilter(key) {
    var hit = FL.presets().filter(function (p) { return p.key === key; })[0];
    state.filter = FL.default();
    if (hit) { Object.keys(hit.filter).forEach(function (k) { state.filter[k] = hit.filter[k]; }); }
    state.filter.keyword = state.q;
  }

  function pickKeyword(kw) {
    var root = viewRoot || (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : null);
    state.q = kw;
    if (root) { U.$('#s-q', root).value = kw; }
    hideSuggest(root);
    search(true);
  }

  /** 从历史 / 收藏里调出一组条件（显式检索：写审计与历史） */
  function loadFrom(item) {
    if (!item) { return; }
    state.q = item.keyword || '';
    state.filter = HIST.toFilter(item);
    rerender(true);
  }

  function saveSearch() {
    var name = window.prompt(PHR.t('search.view.savePrompt', '给这个搜索起个名字，之后可在「常用搜索」里一键调用：'),
      state.q || FL.describe(state.filter));
    if (name === null) { return; }
    var res = HIST.save(name, state.q, state.filter);
    if (res.ok) { PHR.ui.toast.ok(res.message); drawSide((PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : document.getElementById('view-root'))); }
    else { PHR.ui.toast.warn(res.message); }
  }

  /* ================================================================== *
   * 三、检索与绘制
   * ================================================================== */
  function rerender(exp) {
    deps();
    var root = (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : document.getElementById('view-root'));
    if (!root) { return; }
    root.innerHTML = pageHtml();
    bind(root);
    search(exp);
  }

  function search(explicit) {
    var root = (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : document.getElementById('view-root'));
    if (!root) { return; }
    state.filter.keyword = state.q;
    state.filter.sort = state.sort;

    var area = U.$('#s-area', root);
    if (area && !state.items.length) { area.innerHTML = PHR.ui.loading(PHR.t('search.view.searching', '正在检索…')); }

    if (explicit) {
      applyResult(SVC.run(state.q, state.filter, { limit: LIMIT, remember: true }));
      return;
    }
    var token = ++seq;
    SVC.runAsync(state.q, state.filter, { limit: LIMIT, audit: false }).then(function (res) {
      if (token !== seq) { return; }      // 已有更新的检索，丢弃这次结果
      applyResult(res);
    });
  }

  function applyResult(res) {
    state.items = res.items || [];
    state.total = res.total || 0;
    state.shown = res.shown || 0;
    state.took = res.took || 0;
    state.expanded = !!res.expanded;
    state.suggestions = res.suggestions || [];
    var root = (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : document.getElementById('view-root'));
    if (!root) { return; }
    drawResults(root);
    drawChips(root);
    drawSide(root);
  }

  function drawResults(root) {
    var area = U.$('#s-area', root);
    U.html(U.$('#s-sum', root), PHR.t('search.view.sumCount', '共 <b>{n}</b> 条', { n: state.total }) +
      (state.shown < state.total ? PHR.t('search.view.sumShowing', '，显示前 {shown} 条', { shown: state.shown }) : '') +
      (state.expanded ? PHR.t('search.view.sumExpanded', '　<span class="chip">已按同义词扩展</span>') : ''));
    U.text(U.$('#s-took', root), PHR.t('search.view.sumTook', '耗时 {ms} ms', { ms: state.took }));

    if (!state.items.length) {
      var tips = state.suggestions.length
        ? '<div class="row wrap gap2 center mt3">' + state.suggestions.map(function (s) {
            return '<span class="chip clickable" data-sug="' + dom.esc(s.label) + '">' +
              (s.type === 'hot' ? '🔥 ' : '🔁 ') + dom.esc(s.label) + '</span>';
          }).join('') + '</div>'
        : '';
      if (area && document.body.contains(area)) {
        area.innerHTML = PHR.ui.empty({
          icon: '🔍',
          title: state.q
            ? PHR.t('search.view.noResultFor', '没有找到与「{q}」相关的记录', { q: U.truncate(state.q, 20) })
            : PHR.t('search.view.noResultFiltered', '还没有符合条件的记录'),
          hint: state.q
            ? PHR.t('search.view.noResultForHint', '试试更短的关键词、换个同义词（如用「血压」代替「高血压」），或放宽时间与类型条件。')
            : PHR.t('search.view.noResultFilteredHint', '当前筛选条件没有匹配到任何记录，可以点「重置条件」重新开始。'),
          action: { label: PHR.t('search.view.clearAllFilters', '清空全部条件'), action: 'reset-all' }
        }) + tips;
      }
      return;
    }

    // area 可能已经不在 DOM 里了：检索是异步的，用户完全可能在结果回来之前
    // 就切到了别的页面（或又发起了一次检索把结果区换掉）。此时直接放弃绘制，
    // 而不是往 null 上写 innerHTML 抛未捕获异常。
    if (area && document.body.contains(area)) {
      area.innerHTML = '<div class="list">' + state.items.map(itemHtml).join('') + '</div>';
    }
  }

  function itemHtml(it) {
    var r = it.record;
    var t = D.recordType(r.type);
    var reason = matchReason(it);
    var hl = (it.highlights || []).map(function (h) {
      return '<div class="t-xs"><span class="dim">' + dom.esc(h.label) + '</span> ' +
        U.highlight(h.text, h.term || state.q) + '</div>';
    }).join('');
    return '<div class="list-item clickable" data-open="' + dom.esc(r.id) + '">' +
      '<span class="lead" style="background:' + t.color + '1f;color:' + t.color + '">' + t.icon + '</span>' +
      '<div class="body">' +
        '<div class="title">' + U.highlight(PHR.models.record.displayTitle(r), state.q) +
          (r.abnormal ? PHR.ui.badge(PHR.t('search.view.abnormalBadge', '异常'), 'danger') : '') +
          (r.severity ? PHR.ui.badges.severity(r.severity) : '') +
          '<span class="dim t-xs">' +
            PHR.t('search.view.relevance', '相关度 {pct}%', { pct: Math.round((it.score || 0) * 100) }) +
          '</span>' +
        '</div>' +
        (reason ? '<div class="t-xs dim mt1">' + dom.esc(reason) + '</div>' : '') +
        (hl ? '<div class="sub">' + hl + '</div>' : '') +
        '<div class="t-xs dim mt1">' + dom.esc(t.name) + '　·　' +
          dom.esc(D.nameOf(D.diseaseCategory, r.diseaseCat)) + '</div>' +
      '</div>' +
      '<div class="meta">' +
        '<span>' + U.fmtDate(r.date) + '</span>' +
        PHR.ui.badges.source(r.source, r.sourceName) +
        (r.version > 1
          ? '<span class="dim">' + PHR.t('search.view.editedTimes', '已修改 {n} 次', { n: r.version - 1 }) + '</span>'
          : '') +
      '</div>' +
    '</div>';
  }

  function matchReason(it) {
    if (!state.q) {
      return PHR.t('search.view.matchByFilter', 'Matches the filters you selected');
    }
    var labels = U.unique((it.highlights || []).map(function (h) { return h.label; }).filter(Boolean));
    if (labels.length) {
      return PHR.t('search.view.matchReason', 'Matched: {fields}', {
        fields: labels.slice(0, 3).join(PHR.t('search.filters.listJoiner', '、'))
      });
    }
    if (state.expanded) {
      return PHR.t('search.view.matchBySynonym', 'Matched after synonym expansion');
    }
    return PHR.t('search.view.matchByContent', 'Matched by record content');
  }

  function drawChips(root) {
    var box = U.$('#s-chips', root);
    if (!box) { return; }
    var chips = FL.activeChips(state.filter).map(function (c) {
      return '<span class="chip active">' + c.icon + ' ' + dom.esc(c.label) +
        ' <span class="x" data-chip="' + dom.esc(c.field) + '" data-value="' + dom.esc(c.value) + '">✕</span></span>';
    }).join('');
    box.innerHTML =
      '<span class="dim t-sm">' + dom.esc(FL.describe(state.filter)) + '</span>' +
      (chips ? '<span class="grow"></span>' + chips : '') +
      '<button class="btn btn-sm btn-soft" data-action="save-search">' +
        PHR.t('search.view.saveSearchBtn', '⭐ 保存为常用搜索') + '</button>';
  }

  /* ================================================================== *
   * 四、联想、历史、统计
   * ================================================================== */
  function loadSuggest(root) {
    var q = state.q;
    state.suggest = q ? SVC.suggest(q, 6) : null;
    state.suggestOpen = !!q;
    drawSuggest(root);
  }

  function hideSuggest(root) {
    state.suggestOpen = false;
    var box = root ? U.$('#s-suggest', root) : null;
    if (box) { box.style.display = 'none'; }
  }

  function drawSuggest(root) {
    var box = U.$('#s-suggest', root);
    if (!box) { return; }
    var s = state.suggest;
    if (!state.suggestOpen || !s) { box.style.display = 'none'; return; }

    var groups = [
      { title: PHR.t('search.view.sugKeywords', '关键词'), icon: '🔎', items: s.keywords },
      { title: PHR.t('search.view.sugTypes', '记录类型'), icon: '🗂️', items: (s.types || []).map(function (t) { return t.name; }) },
      { title: PHR.t('search.view.sugDiseases', '疾病分类'), icon: '🩺', items: (s.diseases || []).map(function (c) { return c.name; }) },
      { title: PHR.t('search.view.sugDrugs', '药品'), icon: '💊', items: s.drugs }
    ].filter(function (g) { return g.items && g.items.length; });

    if (!groups.length) { box.style.display = 'none'; return; }

    box.innerHTML = groups.map(function (g) {
      return '<div class="t-xs dim" style="padding:6px 8px 2px">' + g.title + '</div>' +
        '<div class="list">' + g.items.slice(0, 6).map(function (label) {
          return '<div class="list-item clickable" data-sug="' + dom.esc(label) + '"' +
            ' style="padding:7px 8px;border-bottom:0;border-radius:var(--r-sm)">' +
            '<div class="body"><div class="title">' + g.icon + ' ' +
            U.highlight(label, state.q) + '</div></div></div>';
        }).join('') + '</div>';
    }).join('');
    box.style.display = '';
  }

  function drawSide(root) {
    if (!root) { return; }
    var hist = HIST.list(10);
    U.html(U.$('#s-history', root), listOrEmpty(hist.map(function (h) {
      var cond = FL.describe(HIST.toFilter(h));
      return sideItem('🕘', h.keyword || cond,
        cond + '　·　' + PHR.t('search.view.historyHits', '命中 {n} 条', { n: h.count }) + '　·　' + U.fmtRelative(h.at),
        'data-hist="' + dom.esc(h.id) + '"', 'data-hdel="' + dom.esc(h.id) + '"');
    }), PHR.t('search.view.historyEmpty', '还没有搜索记录。搜过一次之后，这里可以一键复用条件。')));

    var saved = HIST.saved();
    U.html(U.$('#s-saved', root), listOrEmpty(saved.map(function (s) {
      return sideItem('⭐', s.name, (s.keyword || '') + '　' + FL.describe(HIST.toFilter(s)),
        'data-saved="' + dom.esc(s.id) + '"', 'data-sdel="' + dom.esc(s.id) + '"');
    }), PHR.t('search.view.savedEmpty', '在结果上方点「保存为常用搜索」，就能把当前条件固定下来。')));

    var hot = HIST.popular(8);
    U.html(U.$('#s-hot', root), hot.length
      ? '<div class="row wrap gap2">' + hot.map(function (h) {
          return '<span class="chip clickable" data-hot="' + dom.esc(h.keyword) + '">🔥 ' +
            dom.esc(h.keyword) + ' <span class="dim">' + h.count + '</span></span>';
        }).join('') + '</div>'
      : '<span class="dim t-sm">' + PHR.t('search.view.hotEmpty', '常用关键词会在多次搜索后自动浮现。') + '</span>');

    var st = SVC.stats();
    U.html(U.$('#s-stats', root), PHR.t('search.view.indexStats',
      '索引 {records} 条记录 / {tokens} 个词条　·　同义词 {synonyms} 组　·　历史 {history} / {max} 条', {
        records: st.index.records,
        tokens: st.index.tokens,
        synonyms: st.synonyms,
        history: st.history.total,
        max: st.history.max
      }));
  }

  function sideItem(icon, title, sub, dataMain, dataDel) {
    return '<div class="list-item" style="padding:8px 0">' +
      '<div class="body"><div class="title pointer" ' + dataMain + '>' + icon + ' ' +
        U.highlight(title, state.q || '') + '</div>' +
        '<div class="sub t-xs">' + dom.esc(sub) + '</div></div>' +
      '<div class="meta"><span class="x pointer" ' + dataDel + ' title="' +
        dom.esc(PHR.t('search.view.deleteItem', '删除')) + '">✕</span></div>' +
    '</div>';
  }

  function listOrEmpty(html, emptyText) {
    return html.length ? '<div class="list">' + html.join('') + '</div>'
                       : '<div class="dim t-sm">' + dom.esc(emptyText) + '</div>';
  }

})(window.PHR);
