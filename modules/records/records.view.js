/**
 * ============================================================================
 * 文件：modules/records/records.view.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：注册「健康档案」主页 —— 全系统数据量最大的页面。
 *      提供：概览统计、完整度引导、多条件筛选、卡片/列表两种视图、
 *            记录详情弹窗、版本历史与回滚、医院同步入口。
 * 依赖：modules/records/{record,version,profile,sync,categories}.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var S = PHR.records.service;
  var V = PHR.records.versions;
  var C = PHR.records.categories;
  var pdfJsPromise = null;

  var state = {
    types: [], diseaseCats: [], sources: [],
    from: '', to: '', keyword: '',
    mode: 'card', sort: 'date', page: 1, pageSize: 12
  };

  PHR.registerView('records', {
    title: PHR.t('view.records.title', '健康档案'), icon: '🗂️', group: 'main', order: 2, module: 'records',
    render: render
  });

  /* ================================================================== *
   * 页面
   * ================================================================== */
  function render(root, params) {
    viewRoot = root;

    // 支持从别处带参进入：#/records?type=vital
    if (params && params.type) { state.types = [params.type]; }
    if (params && params.keyword) { state.keyword = params.keyword; }

    var stats = S.stats();
    var profile = PHR.records.profile.get();
    var comp = C.completeness(S.all(), profile);

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>' + U.t('view.records.title', '健康档案') + '</h2>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="sync">' + U.t('records.btn.sync', '🔄 从医院同步') + '</button>' +
          '<button class="btn" data-action="import-file">' + U.t('records.btn.importFile', '上传医院报告') + '</button>' +
          '<button class="btn" data-action="basic">' + U.t('records.btn.basic', '👤 个人基本信息') + '</button>' +
          '<button class="btn btn-primary" data-action="new">' + U.t('records.btn.new', '＋ 新增记录') + '</button>' +
        '</div>' +
      '</div>' +

      statRow(stats) +

      (comp.percent < 100 ? completenessBanner(comp) : '') +

      '<div class="card mb4"><div class="card-body tight">' + filterBar() + '</div></div>' +

      '<div class="card">' +
        '<div class="card-head">' +
          '<h3 id="list-title">' + U.t('records.listTitle', '记录列表') + '</h3>' +
          '<div class="sub" id="list-sub"></div>' +
          '<div class="actions">' +
            '<div class="segmented" id="mode-switch">' +
              '<button data-mode="card" aria-pressed="' + (state.mode === 'card') + '">' +
                U.t('records.mode.card', '卡片') + '</button>' +
              '<button data-mode="list" aria-pressed="' + (state.mode === 'list') + '">' +
                U.t('records.mode.list', '列表') + '</button>' +
              '<button data-mode="chart" aria-pressed="' + (state.mode === 'chart') + '">' +
                U.t('records.mode.chart', '分布') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body" id="record-area"></div>' +
      '</div>';

    bind(root);
    drawList();
  }

  /* ------------------------------ 统计行 ------------------------------ */
  function statRow(s) {
    var lastText = s.lastAt
      ? U.t('records.lastAt', '最近一条 {when}', { when: U.fmtRelative(s.lastAt) })
      : U.t('records.lastAtNone', '还没有记录');
    function tile(label, value, unit, icon, tone, sub) {
      return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span class="corner"></span>' +
        '<div class="label">' + icon + ' ' + dom.esc(label) + '</div>' +
        '<div class="value">' + dom.esc(value) + '<span class="unit">' + dom.esc(unit) + '</span></div>' +
        '<div class="delta dim">' + dom.esc(sub) + '</div></div>';
    }
    return '<div class="grid g4 mb5">' +
      tile(U.t('records.stat.total', '档案记录总数'), dom.num(s.total), U.t('records.unit.records', '条'),
           '📋', '', lastText) +
      tile(U.t('records.stat.recent30', '近 30 天新增'), dom.num(s.recent30), U.t('records.unit.records', '条'),
           '🆕', s.recent30 ? 'info' : '', U.t('records.stat.recent30.sub', '持续记录才能看出趋势')) +
      tile(U.t('records.stat.types', '覆盖记录类型'), s.types + ' / ' + D.recordTypes.length,
           U.t('records.unit.types', '类'), '🗂️', '',
           U.t('records.stat.types.sub', '类型越全，医生判断越准')) +
      tile(U.t('records.stat.versions', '版本变更次数'), dom.num(s.versioned.total), U.t('records.unit.times', '次'),
           '🕘', '', U.t('records.stat.versions.sub', '每次修改都留痕，可回滚')) +
    '</div>';
  }

  /* ------------------------------ 完整度引导 ------------------------------ */
  function completenessBanner(comp) {
    return '<div class="notice tone-primary mb4">' +
      '<span class="ico">🧩</span>' +
      '<div class="body">' +
        '<strong>' + U.t('records.comp.title', '档案完整度 {p}%', { p: comp.percent }) + '</strong>　' +
        U.t('records.comp.missing', '还缺：') +
        comp.missing.slice(0, 6).map(function (m) {
          return '<span class="chip">' + dom.esc(m.name) + '</span>';
        }).join('') +
        '<div class="t-xs dim mt2">' +
          U.t('records.comp.hint',
            '补齐这些内容后，医生在复诊时能更快了解您的整体情况；' +
            '健康洞察的趋势分析与风险评估也会更准确。') +
        '</div>' +
      '</div>' +
      '<button class="btn btn-sm btn-soft" data-action="guide">' +
        U.t('records.comp.guide', '查看录入引导') + '</button>' +
    '</div>';
  }

  /* ------------------------------ 筛选栏 ------------------------------ */
  function filterBar() {
    var typeGroups = C.byScope();
    return '<div class="filter-panel">' +
      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('records.filter.keyword', '关键词') + '</span>' +
        '<div class="search-input-wrap grow">' +
          '<span class="ico">🔍</span>' +
          '<input class="input" id="f-keyword" placeholder="' +
            U.t('records.filter.keywordPlaceholder', '搜索标题、诊断、药品、医院…（也支持高级检索）') +
            '" value="' + dom.esc(state.keyword) + '">' +
        '</div>' +
        '<button class="btn" data-action="advanced">' + U.t('records.filter.advanced', '高级检索') + '</button>' +
      '</div>' +

      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('records.filter.type', '记录类型') + '</span>' +
        '<div class="opts">' +
          '<span class="chip clickable' + (state.types.length ? '' : ' active') + '" data-type="">' +
            U.t('ui.all', '全部') + '</span>' +
          D.recordTypes.map(function (t) {
            return '<span class="chip clickable' + (state.types.indexOf(t.key) >= 0 ? ' active' : '') +
              '" data-type="' + t.key + '" title="' + dom.esc(t.desc) + '">' + t.icon + ' ' + dom.esc(t.name) + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('records.filter.diseaseCat', '疾病系统') + '</span>' +
        '<div class="opts">' +
          '<span class="chip clickable' + (state.diseaseCats.length ? '' : ' active') + '" data-cat="">' +
            U.t('ui.all', '全部') + '</span>' +
          D.diseaseCategory.map(function (c) {
            return '<span class="chip clickable' + (state.diseaseCats.indexOf(c.key) >= 0 ? ' active' : '') +
              '" data-cat="' + c.key + '">' + c.icon + ' ' + dom.esc(D.nameOf(D.diseaseCategory, c.key)) + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('records.filter.timeSource', '时间与来源') + '</span>' +
        '<div class="opts row wrap gap3">' +
          '<div class="date-range">' +
            '<input class="input" type="date" id="f-from" value="' + dom.esc(state.from) +
              '" aria-label="' + U.t('records.filter.from', '起始日期') + '">' +
            '<span class="dim">' + U.t('records.filter.to', '至') + '</span>' +
            '<input class="input" type="date" id="f-to" value="' + dom.esc(state.to) +
              '" aria-label="' + U.t('records.filter.toLabel', '结束日期') + '">' +
          '</div>' +
          '<span class="chip clickable' + (state.sources.indexOf('sync') >= 0 ? ' active' : '') +
            '" data-source="sync">' + U.t('records.source.sync', '🔄 医院同步') + '</span>' +
          '<span class="chip clickable' + (state.sources.indexOf('manual') >= 0 ? ' active' : '') +
            '" data-source="manual">' + U.t('records.source.manual', '✍️ 手动录入') + '</span>' +
          '<button class="btn btn-sm btn-ghost" data-action="reset">' +
            U.t('records.filter.reset', '重置筛选') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="filter-row" style="display:' + (isFiltering() ? '' : 'none') + '">' +
        '<span class="lbl">' + U.t('records.filter.active', '已选条件') + '</span>' +
        '<div class="opts row wrap gap2" id="active-filters"></div>' +
      '</div>' +
    '</div>';
  }

  function isFiltering() {
    return state.types.length || state.diseaseCats.length || state.sources.length ||
           state.from || state.to || state.keyword;
  }

  function activeFilterChips() {
    var out = [];
    state.types.forEach(function (t) {
      out.push('<span class="chip active">' + D.recordType(t).icon + ' ' + D.recordTypeName(t) +
        ' <span class="x" data-remove-type="' + t + '">✕</span></span>');
    });
    state.diseaseCats.forEach(function (c) {
      out.push('<span class="chip active">' + D.nameOf(D.diseaseCategory, c) +
        ' <span class="x" data-remove-cat="' + c + '">✕</span></span>');
    });
    state.sources.forEach(function (s) {
      out.push('<span class="chip active">' +
        (s === 'sync' ? U.t('records.source.syncPlain', '医院同步') : U.t('records.source.manualPlain', '手动录入')) +
        ' <span class="x" data-remove-source="' + s + '">✕</span></span>');
    });
    if (state.from) {
      out.push('<span class="chip active">' + U.t('records.chip.from', '自 {v}', { v: state.from }) +
        ' <span class="x" data-remove-from="1">✕</span></span>');
    }
    if (state.to) {
      out.push('<span class="chip active">' + U.t('records.chip.to', '至 {v}', { v: state.to }) +
        ' <span class="x" data-remove-to="1">✕</span></span>');
    }
    if (state.keyword) {
      out.push('<span class="chip active">' +
        U.t('records.chip.keyword', '关键词「{v}」', { v: dom.esc(state.keyword) }) +
        ' <span class="x" data-remove-keyword="1">✕</span></span>');
    }
    return out.join('') || '<span class="dim">—</span>';
  }

  /* ================================================================== *
   * 事件绑定
   * ================================================================== */
  function bind(root) {
    var keywordInput = U.$('#f-keyword', root);
    keywordInput.addEventListener('input', U.debounce(function () {
      state.keyword = keywordInput.value.trim();
      state.page = 1;
      drawList();
    }, 260));

    ['f-from', 'f-to'].forEach(function (id) {
      U.$('#' + id, root).addEventListener('change', function () {
        state.from = U.$('#f-from', root).value;
        state.to = U.$('#f-to', root).value;
        state.page = 1;
        drawList();
      });
    });

    dom.actions(root, {
      new: function () { PHR.router.go('/records-edit'); },
      basic: function () { PHR.router.go('/basic'); },
      sync: openSyncDialog,
      'import-file': openImportFilePicker,
      advanced: function () { PHR.router.go('/search' + (state.keyword ? '?q=' + encodeURIComponent(state.keyword) : '')); },
      guide: showGuide,
      reset: function () {
        state.types = []; state.diseaseCats = []; state.sources = [];
        state.from = ''; state.to = ''; state.keyword = ''; state.page = 1;
        PHR.router.reload();
      }
    });

    // 类型 / 分类 / 来源 的切换
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-type]');
      if (t && root.contains(t)) { toggle(state.types, t.getAttribute('data-type')); state.page = 1; return drawList(); }

      var c = e.target.closest('[data-cat]');
      if (c && root.contains(c)) { toggle(state.diseaseCats, c.getAttribute('data-cat')); state.page = 1; return drawList(); }

      var s = e.target.closest('[data-source]');
      if (s && root.contains(s)) { toggle(state.sources, s.getAttribute('data-source')); state.page = 1; return drawList(); }

      // 移除单个筛选条件
      var rm = e.target.closest('[data-remove-type],[data-remove-cat],[data-remove-source],[data-remove-from],[data-remove-to],[data-remove-keyword]');
      if (rm && root.contains(rm)) {
        if (rm.hasAttribute('data-remove-type')) { toggle(state.types, rm.getAttribute('data-remove-type')); }
        if (rm.hasAttribute('data-remove-cat')) { toggle(state.diseaseCats, rm.getAttribute('data-remove-cat')); }
        if (rm.hasAttribute('data-remove-source')) { toggle(state.sources, rm.getAttribute('data-remove-source')); }
        if (rm.hasAttribute('data-remove-from')) { state.from = ''; }
        if (rm.hasAttribute('data-remove-to')) { state.to = ''; }
        if (rm.hasAttribute('data-remove-keyword')) { state.keyword = ''; }
        state.page = 1;
        return drawList();
      }
    });

    // 视图模式
    U.$('#mode-switch', root).addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) { return; }
      state.mode = b.getAttribute('data-mode');
      U.$$('[data-mode]', root).forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      drawList();
    });
  }

  function toggle(arr, v) {
    if (!v) { arr.length = 0; return; }
    var i = arr.indexOf(v);
    if (i >= 0) { arr.splice(i, 1); } else { arr.push(v); }
  }

  /* ================================================================== *
   * 列表渲染
   * ================================================================== */
  function currentFilter() {
    var f = {
      types: state.types, diseaseCats: state.diseaseCats, sources: state.sources,
      keyword: state.keyword, sort: state.sort
    };
    if (state.from) { f.from = U.parseDate(state.from); }
    if (state.to) { f.to = U.parseDate(state.to) + 86399000; }
    return f;
  }

  /* 本视图渲染时使用的根容器。
     视图可能被渲染到 shell 的 #view-root，也可能被渲染到其它容器
     （例如自检脚本或将来做"仪表盘拖动组件"时），
     因此这里记住 render() 收到的 root，而不是每次去查 #view-root，
     避免视图与外壳耦合。 */
  var viewRoot = null;

  function drawList() {
    /* 只认 render() 时拿到的那个容器。
       shell 每次渲染都会新建一个视图专属的子节点（见 ui/shell.js 的 render），
       视图切走后该节点整体被回收 —— 因此这里不可能误拿到"别的页面"的 DOM。
       下面两行是双保险：容器没了、或本视图的标记元素不在，就直接放弃绘制，
       绝不往 null 上写 innerHTML（历史上正因为少了这道守卫而抛过
       "Cannot set properties of null"。 */
    var root = (viewRoot && document.body.contains(viewRoot))
      ? viewRoot
      : (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : null);
    if (!root) { return; }
    if (!U.$('#list-sub', root)) { return; }

    // 同步筛选栏的视觉状态
    U.$$('[data-type]', root).forEach(function (el) {
      var v = el.getAttribute('data-type');
      el.classList.toggle('active', v ? state.types.indexOf(v) >= 0 : state.types.length === 0);
    });
    U.$$('[data-cat]', root).forEach(function (el) {
      var v = el.getAttribute('data-cat');
      el.classList.toggle('active', v ? state.diseaseCats.indexOf(v) >= 0 : state.diseaseCats.length === 0);
    });
    U.$$('[data-source]', root).forEach(function (el) {
      el.classList.toggle('active', state.sources.indexOf(el.getAttribute('data-source')) >= 0);
    });
    var chips = U.$('#active-filters', root);
    if (chips) { chips.innerHTML = activeFilterChips(); }
    var rowChips = chips ? chips.closest('.filter-row') : null;
    if (rowChips) { rowChips.style.display = isFiltering() ? '' : 'none'; }

    var rows = S.list(currentFilter());
    U.$('#list-sub', root).innerHTML =
      U.t('records.listSub', '共 <b>{n}</b> 条', { n: rows.length }) +
      (isFiltering() ? U.t('records.listSub.filtered', '（已筛选）') : '');
    U.text(U.$('#list-title', root), state.mode === 'chart'
      ? U.t('records.distTitle', '记录分布')
      : U.t('records.listTitle', '记录列表'));

    var area = U.$('#record-area', root);
    if (state.mode === 'chart') { drawCharts(area, rows); return; }
    if (!rows.length) {
      area.innerHTML = PHR.ui.empty({
        icon: '📭',
        title: isFiltering()
          ? U.t('records.empty.filteredTitle', '没有符合条件的记录')
          : U.t('records.empty.title', '还没有任何健康记录'),
        hint: isFiltering()
          ? U.t('records.empty.filteredHint', '试试放宽筛选条件，或换个关键词。')
          : U.t('records.empty.hint',
              '从录入第一条记录开始，系统才能帮您管理健康。建议先补全「过敏史」与「既往病史」。'),
        action: isFiltering()
          ? { label: U.t('records.filter.reset', '重置筛选'), action: 'reset-empty' }
          : { label: U.t('records.empty.newFirst', '新增第一条记录'), action: 'new-empty' }
      });
      dom.actions(area, {
        'reset-empty': function () {
          state.types = []; state.diseaseCats = []; state.sources = [];
          state.from = ''; state.to = ''; state.keyword = '';
          PHR.router.reload();
        },
        'new-empty': function () { PHR.router.go('/records-edit'); }
      });
      return;
    }

    area.innerHTML = state.mode === 'card' ? cardView(rows) : listView(rows);

    /* 卡片/列表点击。
       ⚠️ 必须用 onclick 赋值而不是 addEventListener：
       #record-area 是视图骨架里的**同一个元素**，drawList() 每次重绘
       （翻页、切筛选、切模式）都会跑到这里。用 addEventListener 会一层层
       叠加监听器 —— 翻过 3 次页之后点一张卡片就会连开 3 个弹窗，要关 3 次。
       赋值是幂等的，重复执行只会覆盖上一次。 */
    area.onclick = function (e) {
      var more = e.target.closest('[data-more]');
      if (more) {
        e.stopPropagation();
        showRecordMenu(more.getAttribute('data-more'));
        return;
      }
      var item = e.target.closest('[data-record]');
      if (item) { showDetail(item.getAttribute('data-record')); }
    };

    // 分页
    var pages = Math.ceil(rows.length / state.pageSize);
    if (pages > 1) {
      area.insertAdjacentHTML('beforeend',
        '<div class="pager">' +
          '<span class="info">' +
            U.t('records.pager', '第 {p} / {n} 页', { p: state.page, n: pages }) + '</span>' +
          '<button data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>' +
            U.t('ui.prev', '上一页') + '</button>' +
          '<button data-page="' + (state.page + 1) + '"' + (state.page === pages ? ' disabled' : '') + '>' +
            U.t('ui.next', '下一页') + '</button>' +
        '</div>');
      area.querySelector('.pager').addEventListener('click', function (e) {
        var b = e.target.closest('[data-page]');
        if (!b || b.disabled) { return; }
        state.page = Number(b.getAttribute('data-page'));
        drawList();
      });
    }
  }

  function paged(rows) {
    var start = (state.page - 1) * state.pageSize;
    return rows.slice(start, start + state.pageSize);
  }

  /* ------------------------------ 卡片视图 ------------------------------ */
  function cardView(rows) {
    return '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--sp-4)">' +
      paged(rows).map(function (r) {
        var t = D.recordType(r.type);
        var hi = C.highlights(r, 3);
        var reasons = [];
        var all = S.all();
        var idx = all.indexOf(all.filter(function (x) { return x.id === r.id; })[0]);
        return '<article class="record-card" data-record="' + dom.esc(r.id) + '">' +
          '<span class="bar" style="background:' + t.color + '"></span>' +
          '<div class="head">' +
            '<span class="ico">' + t.icon + '</span>' +
            '<div class="t">' + dom.esc(PHR.models.record.displayTitle(r)) + '</div>' +
            '<button class="btn btn-sm btn-ghost" data-more="' + dom.esc(r.id) + '" aria-label="' +
              U.t('records.more', '更多操作') + '">⋯</button>' +
          '</div>' +
          (hi.length ? '<div class="desc">' + hi.map(function (h) {
            return '<div class="t-xs"><span class="dim">' + dom.esc(h.label) + '</span> ' + dom.esc(h.value) + '</div>';
          }).join('') + '</div>' : '<div class="desc dim">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 80)) + '</div>') +
          '<div class="foot">' +
            '<span>' + U.fmtDate(r.date) + '</span>' +
            (r.severity ? PHR.ui.badges.severity(r.severity) : '') +
            (r.abnormal ? PHR.ui.badge(U.t('records.abnormal', '异常'), 'danger') : '') +
            (r.version > 1 ? PHR.ui.badge('v' + r.version, 'muted') : '') +
            '<span class="grow"></span>' +
            PHR.ui.badges.source(r.source, r.sourceName) +
          '</div>' +
        '</article>';
      }).join('') + '</div>';
  }

  /* ------------------------------ 列表视图 ------------------------------ */
  function listView(rows) {
    return '<div class="list">' + paged(rows).map(function (r) {
      var t = D.recordType(r.type);
      return '<div class="list-item clickable" data-record="' + dom.esc(r.id) + '">' +
        '<span class="lead" style="background:' + t.color + '1f;color:' + t.color + '">' + t.icon + '</span>' +
        '<div class="body">' +
          '<div class="title">' + dom.esc(PHR.models.record.displayTitle(r)) +
            (r.severity ? PHR.ui.badges.severity(r.severity) : '') +
            (r.abnormal ? PHR.ui.badge(U.t('records.abnormal', '异常'), 'danger') : '') +
          '</div>' +
          '<div class="sub">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 110)) + '</div>' +
          '<div class="t-xs dim mt1">' + dom.esc(t.name) + '　·　' + dom.esc(D.nameOf(D.diseaseCategory, r.diseaseCat)) + '</div>' +
        '</div>' +
        '<div class="meta">' +
          '<span>' + U.fmtDate(r.date) + '</span>' +
          PHR.ui.badges.source(r.source, r.sourceName) +
          (r.version > 1
            ? '<span class="dim">' + U.t('records.modifiedTimes', '已修改 {n} 次', { n: r.version - 1 }) + '</span>'
            : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ------------------------------ 分布视图 ------------------------------ */
  function drawCharts(area, rows) {
    area.innerHTML =
      '<div class="grid g2 mb4">' +
        '<div><div class="callout-title">' + U.t('records.chart.byType', '按记录类型分布') +
          '</div><div id="ch-type"></div></div>' +
        '<div><div class="callout-title">' + U.t('records.chart.byCat', '按疾病系统分布') +
          '</div><div id="ch-cat"></div></div>' +
      '</div>' +
      '<div class="callout-title">' + U.t('records.chart.byMonth', '近 12 个月记录数量') +
        '</div><div id="ch-month"></div>';

    var chType = document.getElementById('ch-type');
    var chCat = document.getElementById('ch-cat');
    var chMonth = document.getElementById('ch-month');

    if (chType) {
      PHR.ui.chart.donut(chType, {
        items: C.countByType(rows).filter(function (t) { return t.count > 0; })
          .map(function (t) { return { label: t.name, value: t.count, color: t.color }; }),
        centerValue: rows.length, centerLabel: U.t('records.chart.centerLabel', '条记录')
      });
    }

    if (chCat) {
      PHR.ui.chart.bar(chCat, {
        items: C.countByDiseaseCat(rows).map(function (c, i) {
          return { label: c.name, value: c.count, color: 'var(--c' + ((i % 8) + 1) + ')' };
        }), yUnit: U.t('records.unit.records', '条')
      });
    }

    if (chMonth) {
      PHR.ui.chart.bar(chMonth, {
        items: S.byMonth(12).map(function (m) { return { label: m.label, value: m.value }; }),
        height: 200, horizontal: false, yUnit: U.t('records.unit.records', '条')
      });
    }
  }

  /* ================================================================== *
   * 记录详情
   * ================================================================== */
  function showDetail(id) {
    var r = S.byId(id);
    if (!r) { PHR.ui.toast.warn(U.t('rec.notFoundOrDeleted', '记录不存在或已被删除')); return; }

    var t = D.recordType(r.type);
    var verCount = V.countOf(r.id);
    var sep = U.t('ui.listSep', '、');

    var hasAttachment = !!(r.data && r.data.attachmentId && PHR.records.attachments);
    var m = PHR.ui.modal({
      title: t.icon + ' ' + t.name,
      size: 'wide',
      body:
        '<div class="row between wrap gap3 mb4">' +
          '<div><div class="t-xl bold">' + dom.esc(PHR.models.record.displayTitle(r)) + '</div>' +
            '<div class="dim t-sm">' + U.fmtDate(r.date) + '　·　' +
              dom.esc(D.nameOf(D.diseaseCategory, r.diseaseCat)) + '　·　' +
              PHR.ui.badges.source(r.source, r.sourceName).replace(/<[^>]+>/g, '') + '</div></div>' +
          '<div class="row gap2">' + (r.severity ? PHR.ui.badges.severity(r.severity) : '') +
            (r.abnormal ? PHR.ui.badge(U.t('records.abnormalResult', '结果异常'), 'danger') : '') + '</div>' +
        '</div>' +
        '<dl class="kv">' + t.fields.map(function (fd) {
          if (fd.type === 'hidden') { return ''; }
          var v = r.data[fd.name];
          if (v === undefined || v === null || v === '' || v === false) { return ''; }
          var opts = typeof fd.options === 'function' ? fd.options() : fd.options;
          var text;
          if (fd.type === 'select') { text = D.nameOf(opts || [], v); }
          else if (Array.isArray(v)) { text = v.map(function (x) { return D.nameOf(opts || [], x) || x; }).join(sep); }
          else if (fd.type === 'checkbox') { text = v ? U.t('ui.yes', '是') : U.t('ui.no', '否'); }
          else if (fd.type === 'date' || fd.type === 'datetime') { text = U.fmtDateTime(U.parseDate(v)); }
          else { text = String(v) + (fd.unit ? ' ' + fd.unit : ''); }
          return '<dt>' + dom.esc(fd.label) + '</dt><dd>' + dom.esc(text) + '</dd>';
        }).join('') + '</dl>' +
        (hasAttachment ? attachmentCard(r) : '') +
        '<div class="divider"></div>' +
        '<div class="row between wrap gap2 t-xs dim">' +
          '<span>' + U.t('records.createdAt', '创建于 {v}', { v: U.fmtDateTime(r.createdAt) }) + '</span>' +
          '<span>' + U.t('records.updatedAt', '最后修改 {when}　·　共 {n} 个版本',
            { when: U.fmtRelative(r.updatedAt), n: verCount }) + '</span>' +
        '</div>',
      actions: [
        { label: U.t('records.action.versions', '版本历史'), tone: 'ghost', close: false, action: function (v, close) { close('x'); showVersions(r.id); } },
        { label: U.t('ui.delete', '删除'), tone: 'danger', close: false, action: function (v, close) { close('x'); confirmDelete(r); } },
        { label: U.t('ui.edit', '编辑'), tone: 'primary', close: false, action: function (v, close) {
            close('x');
            PHR.router.go('/records-edit/' + r.id);
          } },
        { label: U.t('ui.close', '关闭'), tone: 'ghost' }
      ]
    });

    if (hasAttachment) {
      m.body.addEventListener('click', function (e) {
        var button = e.target.closest('[data-attachment-action]');
        if (!button) { return; }
        var action = button.getAttribute('data-attachment-action');
        if (action === 'view') { openAttachmentViewer(r); }
        if (action === 'download') { downloadAttachment(r); }
      });
    }
  }

  function attachmentCard(record) {
    var data = record.data || {};
    var A = PHR.records.attachments;
    var isPdf = data.attachmentType === 'application/pdf';
    return '<div class="record-attachment mt4">' +
      '<div class="record-attachment-icon" aria-hidden="true">' + (isPdf ? '📄' : '🖼️') + '</div>' +
      '<div class="record-attachment-info">' +
        '<div class="bold">' + dom.esc(data.attachmentName || U.t('records.attachment.unnamed', '医院报告附件')) + '</div>' +
        '<div class="t-xs dim">' + dom.esc((isPdf ? 'PDF' : U.t('records.attachment.image', '图片')) +
          ' · ' + A.formatSize(data.attachmentSize || 0)) + '</div>' +
      '</div>' +
      '<div class="row gap2 wrap">' +
        '<button class="btn btn-sm btn-primary" data-attachment-action="view">' +
          U.t('records.attachment.view', '查看附件') + '</button>' +
        '<button class="btn btn-sm" data-attachment-action="download">' +
          U.t('records.attachment.download', '下载') + '</button>' +
      '</div>' +
    '</div>';
  }

  function loadAttachment(record, callback) {
    var id = record && record.data && record.data.attachmentId;
    if (!id || !PHR.records.attachments) {
      PHR.ui.toast.warn(U.t('records.attachment.missing', '找不到这份附件'));
      return;
    }
    PHR.records.attachments.get(id).then(function (item) {
      if (!item || !item.blob) {
        PHR.ui.toast.warn(U.t('records.attachment.missing',
          '附件文件不存在。它可能来自另一台设备，或浏览器存储已被清理。'));
        return;
      }
      callback(item);
    }).catch(function (err) {
      PHR.ui.toast.danger(err && err.message
        ? err.message
        : U.t('attachment.err.read', '附件读取失败'));
    });
  }

  function openAttachmentViewer(record) {
    loadAttachment(record, function (item) {
      var image = /^image\//i.test(item.type);
      var url = image ? URL.createObjectURL(item.blob) : '';
      var pdfController = null;
      PHR.ui.modal({
        title: item.name || U.t('records.attachment.previewTitle', '报告附件'),
        size: 'wide',
        body: image
          ? '<div class="attachment-preview image"><img src="' + dom.esc(url) + '" alt="' +
              dom.esc(item.name || U.t('records.attachment.previewTitle', '报告附件')) + '"></div>'
          : pdfViewerHtml(),
        actions: [
          { label: U.t('records.attachment.download', '下载'), close: false, action: function () {
              PHR.records.attachments.download(item); return false;
            } },
          { label: U.t('ui.close', '关闭'), tone: 'primary' }
        ],
        onMount: function (body) {
          if (!image) {
            pdfController = renderPdfAttachment(item, body);
          }
        },
        onClose: function () {
          if (url) { URL.revokeObjectURL(url); }
          if (pdfController) { pdfController.destroy(); }
        }
      });
    });
  }

  function pdfViewerHtml() {
    return '<div class="attachment-preview pdf" data-pdf-viewer>' +
      '<div class="pdf-toolbar">' +
        '<button class="btn btn-sm" type="button" data-pdf-prev disabled>' +
          U.t('records.attachment.previousPage', '← 上一页') + '</button>' +
        '<span class="pdf-page-status" aria-live="polite">' +
          U.t('records.attachment.page', '第 {page} / {pages} 页', { page: '1', pages: '…' }) + '</span>' +
        '<button class="btn btn-sm" type="button" data-pdf-next disabled>' +
          U.t('records.attachment.nextPage', '下一页 →') + '</button>' +
        '<span class="pdf-toolbar-spacer"></span>' +
        '<button class="btn btn-sm" type="button" data-pdf-zoom-out aria-label="' +
          dom.esc(U.t('records.attachment.zoomOut', '缩小')) + '">−</button>' +
        '<span class="pdf-zoom-value">100%</span>' +
        '<button class="btn btn-sm" type="button" data-pdf-zoom-in aria-label="' +
          dom.esc(U.t('records.attachment.zoomIn', '放大')) + '">＋</button>' +
      '</div>' +
      '<div class="pdf-stage">' +
        '<div class="pdf-message">' + PHR.ui.loading(U.t('records.attachment.loadingPdf', '正在打开 PDF…')) + '</div>' +
        '<canvas hidden aria-label="' + dom.esc(U.t('records.attachment.pdfPage', 'PDF 页面')) + '"></canvas>' +
      '</div>' +
    '</div>';
  }

  function loadPdfJs() {
    if (!pdfJsPromise) {
      var libraryUrl = new URL('vendor/pdfjs/pdf.mjs?v=6.3.289', document.baseURI).href;
      pdfJsPromise = import(libraryUrl).then(function (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          new URL('vendor/pdfjs/pdf.worker.mjs?v=6.3.289', document.baseURI).href;
        return pdfjsLib;
      });
    }
    return pdfJsPromise;
  }

  function renderPdfAttachment(item, body) {
    var viewer = body.querySelector('[data-pdf-viewer]');
    var stage = viewer.querySelector('.pdf-stage');
    var canvas = viewer.querySelector('canvas');
    var message = viewer.querySelector('.pdf-message');
    var prev = viewer.querySelector('[data-pdf-prev]');
    var next = viewer.querySelector('[data-pdf-next]');
    var zoomOut = viewer.querySelector('[data-pdf-zoom-out]');
    var zoomIn = viewer.querySelector('[data-pdf-zoom-in]');
    var pageStatus = viewer.querySelector('.pdf-page-status');
    var zoomValue = viewer.querySelector('.pdf-zoom-value');
    var pageNo = 1;
    var zoom = 1;
    var pdfDoc = null;
    var renderTask = null;
    var disposed = false;
    var loadingTask = null;
    var controller = {
      destroy: function () {
        disposed = true;
        if (renderTask && renderTask.cancel) { renderTask.cancel(); }
        if (loadingTask && loadingTask.destroy) { loadingTask.destroy(); }
        else if (pdfDoc && pdfDoc.destroy) { pdfDoc.destroy(); }
      }
    };

    function setMessage(text, tone) {
      message.hidden = false;
      message.className = 'pdf-message' + (tone ? ' tone-' + tone : '');
      message.innerHTML = tone === 'danger'
        ? '<span aria-hidden="true">⚠️</span> ' + dom.esc(text)
        : PHR.ui.loading(text);
      canvas.hidden = true;
    }

    function updateToolbar() {
      var pages = pdfDoc ? pdfDoc.numPages : '…';
      pageStatus.textContent = U.t('records.attachment.page', '第 {page} / {pages} 页', {
        page: pageNo, pages: pages
      });
      zoomValue.textContent = Math.round(zoom * 100) + '%';
      prev.disabled = !pdfDoc || pageNo <= 1;
      next.disabled = !pdfDoc || pageNo >= pdfDoc.numPages;
      zoomOut.disabled = zoom <= 0.6;
      zoomIn.disabled = zoom >= 2.4;
    }

    function renderPage() {
      if (!pdfDoc || disposed) { return Promise.resolve(); }
      if (renderTask && renderTask.cancel) { renderTask.cancel(); }
      setMessage(U.t('records.attachment.renderingPdf', '正在渲染第 {page} 页…', { page: pageNo }));
      updateToolbar();
      return pdfDoc.getPage(pageNo).then(function (page) {
        if (disposed) { return; }
        var unscaled = page.getViewport({ scale: 1 });
        var available = Math.max(280, stage.clientWidth - 32);
        var fitScale = Math.min(1.55, available / unscaled.width);
        var viewport = page.getViewport({ scale: fitScale * zoom });
        var outputScale = Math.min(window.devicePixelRatio || 1, 2);
        var context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        canvas.hidden = false;
        message.hidden = true;
        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
        });
        return renderTask.promise.then(function () {
          renderTask = null;
          stage.scrollTop = 0;
          stage.scrollLeft = 0;
        });
      }).catch(function (err) {
        if (err && err.name === 'RenderingCancelledException') { return; }
        if (!disposed) {
          setMessage(U.t('records.attachment.renderFailed', 'PDF 预览失败，请下载后查看。'), 'danger');
        }
      });
    }

    function changePage(delta) {
      if (!pdfDoc) { return; }
      var target = Math.max(1, Math.min(pdfDoc.numPages, pageNo + delta));
      if (target === pageNo) { return; }
      pageNo = target;
      renderPage();
    }

    function changeZoom(delta) {
      var target = Math.max(0.6, Math.min(2.4, Math.round((zoom + delta) * 10) / 10));
      if (target === zoom) { return; }
      zoom = target;
      renderPage();
    }

    prev.addEventListener('click', function () { changePage(-1); });
    next.addEventListener('click', function () { changePage(1); });
    zoomOut.addEventListener('click', function () { changeZoom(-0.2); });
    zoomIn.addEventListener('click', function () { changeZoom(0.2); });
    updateToolbar();

    Promise.all([loadPdfJs(), item.blob.arrayBuffer()]).then(function (parts) {
      if (disposed) { return; }
      loadingTask = parts[0].getDocument({ data: new Uint8Array(parts[1]) });
      return loadingTask.promise.then(function (doc) {
        if (disposed) { doc.destroy(); return; }
        pdfDoc = doc;
        updateToolbar();
        return renderPage();
      });
    }).catch(function () {
      if (!disposed) {
        setMessage(U.t('records.attachment.renderFailed', 'PDF 预览失败，请下载后查看。'), 'danger');
      }
    });
    return controller;
  }

  function downloadAttachment(record) {
    loadAttachment(record, function (item) {
      if (!PHR.records.attachments.download(item)) {
        PHR.ui.toast.danger(U.t('records.attachment.downloadFailed', '附件下载失败'));
      }
    });
  }

  /** 卡片右上角的"⋯"菜单 */
  function showRecordMenu(id) {
    var r = S.byId(id);
    if (!r) { return; }
    PHR.ui.modal({
      title: U.t('records.menu.title', '记录操作'),
      size: 'narrow',
      body: '<div class="col gap2">' +
        '<button class="btn btn-block" data-action="menu-detail">' +
          U.t('records.menu.detail', '📄 查看详情') + '</button>' +
        '<button class="btn btn-block" data-action="menu-edit">' +
          U.t('records.menu.edit', '✏️ 编辑这条记录') + '</button>' +
        '<button class="btn btn-block" data-action="menu-version">' +
          U.t('records.menu.versions', '🕘 版本历史（{n} 个版本）', { n: V.countOf(id) }) + '</button>' +
        '<button class="btn btn-block" data-action="menu-tag">' +
          U.t('records.menu.tag', '🏷️ 添加标签') + '</button>' +
        '<button class="btn btn-block btn-danger" data-action="menu-delete">' +
          U.t('records.menu.delete', '🗑️ 删除') + '</button>' +
        '</div>',
      actions: [{ label: U.t('ui.cancel', '取消'), tone: 'ghost' }],
      onMount: function (body, close) {
        dom.actions(body, {
          'menu-detail': function () { close('x'); showDetail(id); },
          'menu-edit': function () { close('x'); PHR.router.go('/records-edit/' + id); },
          'menu-version': function () { close('x'); showVersions(id); },
          'menu-tag': function () { close('x'); addTag(r); },
          'menu-delete': function () { close('x'); confirmDelete(r); }
        });
      }
    });
  }

  function addTag(r) {
    var input = window.prompt(U.t('records.tag.prompt', '为该记录添加标签（多个用逗号分隔）'),
      (r.tags || []).join(U.t('ui.listSep', '、')));
    if (input === null) { return; }
    var tags = input.split(/[,，、\s]+/).filter(Boolean).map(function (t) {
      return PHR.security.sanitizeText(t, 16);
    }).filter(Boolean);
    PHR.db.records.update(r.id, { tags: tags });
    PHR.audit.log({
      action: 'record.update', targetType: 'record', targetId: r.id, targetName: PHR.models.record.displayTitle(r),
      detail: U.t('records.tag.audit', '更新标签为：{v}',
        { v: tags.join(U.t('ui.listSep', '、')) || U.t('records.tag.none', '（无）') }),
      result: 'success'
    });
    PHR.ui.toast.ok(U.t('records.tag.done', '标签已更新'));
    drawList();
  }

  function confirmDelete(r) {
    PHR.ui.confirm({
      title: U.t('records.delete.title', '删除记录'),
      message: U.t('records.delete.message', '确定删除「{title}」吗？', { title: PHR.models.record.displayTitle(r) }),
      detail: U.t('records.delete.detail',
        '删除后该记录会从列表中消失，但版本快照会被保留，可在「版本历史」中找到并恢复。'),
      confirmLabel: U.t('ui.delete', '删除'),
      tone: 'danger'
    }).then(function (ok) {
      if (!ok) { return; }
      var res = S.remove(r.id, U.t('records.delete.reason', '用户在档案列表中删除'));
      if (res.ok) { PHR.ui.toast.ok(res.message); drawList(); }
      else { PHR.ui.toast.danger(res.message); }
    });
  }

  /* ================================================================== *
   * 版本历史
   * ================================================================== */
  function showVersions(recordId) {
    var list = V.history(recordId);
    var r = S.byId(recordId);

    if (!list.length) {
      PHR.ui.modal({
        title: U.t('records.action.versions', '版本历史'), size: 'narrow',
        body: PHR.ui.empty({
          icon: '🕘',
          title: U.t('records.versions.emptyTitle', '暂无版本记录'),
          hint: U.t('records.versions.emptyHint', '该记录创建时未生成快照，或已被清理。')
        }),
        actions: [{ label: U.t('ui.close', '关闭'), tone: 'primary' }]
      });
      return;
    }

    var ACTION_NAME = {
      create: U.t('records.version.action.create', '新建'),
      update: U.t('records.version.action.update', '修改'),
      delete: U.t('records.version.action.delete', '删除'),
      rollback: U.t('records.version.action.rollback', '回滚')
    };

    var html = '<div class="notice tone-info mb4"><span class="ico">🕘</span><div class="body">' +
      U.t('records.versions.note',
        '每一次新增、修改、删除都会保留一份完整快照。回滚不会抹掉历史——回滚本身也会产生一个新版本。') +
      '</div></div>' +
      U.sortBy(list, 'version', true).map(function (v, i) {
        var isCurrent = i === 0 && v.action !== 'delete';
        return '<div class="version-item' + (isCurrent ? ' current' : '') + '">' +
          '<span class="ver">v' + v.version + '</span>' +
          '<div class="grow">' +
            '<div class="row gap2 wrap">' +
              PHR.ui.badge(ACTION_NAME[v.action] || v.action,
                { create: 'ok', update: 'info', delete: 'danger', rollback: 'warn' }[v.action] || 'muted') +
              '<span class="dim t-xs">' + U.fmtDateTime(v.at) + '　·　' + dom.esc(v.operator) + '</span>' +
              (isCurrent ? '<span class="badge tone-primary">' +
                U.t('records.version.current', '当前版本') + '</span>' : '') +
            '</div>' +
            (v.changedFields && v.changedFields.length
              ? '<div class="diff mt2">' + v.changedFields.map(function (c) {
                  return '<div class="row" style="grid-template-columns:110px 1fr 16px 1fr">' +
                    '<span class="dim">' + dom.esc(c.label) + '</span>' +
                    '<span class="old">' + dom.esc(c.from) + '</span>' +
                    '<span class="dim">→</span>' +
                    '<span class="new">' + dom.esc(c.to) + '</span></div>';
                }).join('') + '</div>'
              : '<div class="t-xs dim mt1">' +
                dom.esc(v.reason || U.t('records.version.noDiff', '无字段变化明细')) + '</div>') +
          '</div>' +
          (isCurrent ? '' :
            '<button class="btn btn-sm" data-version="' + dom.esc(v.id) + '">' +
              (v.action === 'delete'
                ? U.t('records.version.restore', '恢复这条记录')
                : U.t('records.version.rollback', '回滚到此版本')) + '</button>') +
        '</div>';
      }).join('');

    var m = PHR.ui.modal({
      title: U.t('records.version.titleOf', '版本历史 · {name}',
        { name: r ? PHR.models.record.displayTitle(r) : U.t('records.version.deletedRecord', '已删除的记录') }),
      size: 'wide',
      body: html,
      actions: [{ label: U.t('ui.close', '关闭'), tone: 'ghost' }]
    });

    dom.actions(m.body, {
      'rollback-version': null
    });
    m.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-version]');
      if (!b) { return; }
      var vid = b.getAttribute('data-version');
      var ver = PHR.db.versions.byId(vid);
      PHR.ui.confirm({
        title: ver && ver.action === 'delete'
          ? U.t('records.version.restoreTitle', '恢复记录')
          : U.t('records.version.rollbackTitle', '回滚版本'),
        message: ver && ver.action === 'delete'
          ? U.t('records.version.restoreMsg', '将把这条已删除的记录重新创建为一条新记录。')
          : U.t('records.version.rollbackMsg',
              '将把记录内容恢复到 v{n}，当前内容会作为历史保留。',
              { n: ver ? ver.version : '?' }),
        confirmLabel: U.t('ui.confirm', '确认'),
        tone: 'warn'
      }).then(function (ok) {
        if (!ok) { return; }
        var res = ver && ver.action === 'delete' ? V.restoreDeleted(vid) : V.rollback(vid);
        if (res.ok) {
          PHR.ui.toast.ok(res.message);
          PHR.ui.closeModal();
          drawList();
        } else {
          PHR.ui.toast.danger(res.message);
        }
      });
    });
  }

  /* ================================================================== *
   * 医院同步
   * ================================================================== */
  function openImportFilePicker() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,application/json,text/csv,' +
      (PHR.records.attachments ? PHR.records.attachments.accept : '.pdf,.jpg,.jpeg,.png');
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { return; }
      if (PHR.records.attachments && PHR.records.attachments.isSupported(file)) {
        showAttachmentUpload(file);
        return;
      }
      if (!/\.(json|csv)$/i.test(file.name || '') &&
          !/^(application\/json|text\/csv)$/i.test(file.type || '')) {
        PHR.ui.toast.warn(U.t('records.attachment.unsupported',
          '不支持这种文件。请选择 PDF、JPG、PNG、CSV 或 JSON。'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { showImportPreview(file.name, String(reader.result || '')); };
      reader.onerror = function () {
        PHR.ui.toast.danger(U.t('records.import.readFailed', '读取文件失败，请重试'));
      };
      reader.readAsText(file, 'utf-8');
    });
    input.click();
  }

  function showAttachmentUpload(file) {
    var A = PHR.records.attachments;
    var baseName = String(file.name || '').replace(/\.[^.]+$/, '') ||
      U.t('records.attachment.defaultTitle', '医院检查报告');
    var icon = A.kindOf(file) === 'pdf' ? '📄' : '🖼️';
    var saving = false;

    var m = PHR.ui.modal({
      title: U.t('records.attachment.uploadTitle', '上传医院报告附件'),
      size: 'normal',
      body:
        PHR.ui.notice('info', U.t('records.attachment.readyTitle', '文件已选择'),
          U.t('records.attachment.readyBody',
            '原始文件会安全保存在此浏览器中，并创建一条可查看、可下载的体检报告记录。'),
          { icon: icon }) +
        '<div class="record-attachment mt3 mb4">' +
          '<div class="record-attachment-icon" aria-hidden="true">' + icon + '</div>' +
          '<div class="record-attachment-info"><div class="bold">' + dom.esc(file.name) + '</div>' +
            '<div class="t-xs dim">' + dom.esc(A.normalizedType(file) + ' · ' + A.formatSize(file.size)) + '</div></div>' +
        '</div>' +
        '<form id="attachment-meta-form" class="form-grid" novalidate>' +
          '<div class="field"><label for="attachment-date">' +
            U.t('records.attachment.date', '报告日期') + '<span class="req">*</span></label>' +
            '<input class="input" id="attachment-date" type="date" value="' + dom.esc(U.today()) + '" required></div>' +
          '<div class="field"><label for="attachment-institution">' +
            U.t('records.attachment.institution', '医院 / 体检机构') + '<span class="req">*</span></label>' +
            '<input class="input" id="attachment-institution" type="text" maxlength="120" value="' +
              dom.esc(U.t('records.attachment.defaultInstitution', '上传的医院报告')) + '" required></div>' +
          '<div class="field span-2"><label for="attachment-title">' +
            U.t('records.attachment.reportTitle', '报告标题') + '<span class="req">*</span></label>' +
            '<input class="input" id="attachment-title" type="text" maxlength="160" value="' +
              dom.esc(baseName) + '" required></div>' +
          '<div class="field span-2"><label for="attachment-note">' +
            U.t('records.attachment.note', '备注') + '</label>' +
            '<textarea class="textarea" id="attachment-note" maxlength="500" placeholder="' +
              dom.esc(U.t('records.attachment.notePlaceholder', '可填写报告摘要或补充说明')) + '"></textarea></div>' +
          '<div class="span-2" id="attachment-upload-status"></div>' +
        '</form>',
      actions: [
        { label: U.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: U.t('records.attachment.save', '保存报告'), tone: 'primary', close: false,
          action: function (v, close, body) {
            if (saving) { return false; }
            var date = body.querySelector('#attachment-date').value;
            var institution = body.querySelector('#attachment-institution').value.trim();
            var title = body.querySelector('#attachment-title').value.trim();
            var note = body.querySelector('#attachment-note').value.trim();
            var status = body.querySelector('#attachment-upload-status');
            if (!date || !institution || !title) {
              PHR.ui.toast.warn(U.t('records.attachment.required', '请填写报告日期、医院和报告标题'));
              return false;
            }
            saving = true;
            status.innerHTML = PHR.ui.loading(U.t('records.attachment.saving', '正在保存附件…'));
            A.save(file).then(function (meta) {
              var result;
              try {
                result = S.create('checkup', {
                  checkupDate: date,
                  institution: institution.slice(0, 120),
                  checkupType: 'routine',
                  conclusion: title.slice(0, 160),
                  attachmentId: meta.id,
                  attachmentName: meta.name,
                  attachmentType: meta.type,
                  attachmentSize: meta.size,
                  note: note.slice(0, 500)
                }, {
                  source: 'import',
                  sourceName: institution.slice(0, 120),
                  reason: U.t('records.attachment.reason', '上传医院报告附件')
                });
              } catch (err) {
                result = { ok: false, message: err && err.message };
              }
              if (!result || !result.ok) {
                A.remove(meta.id).catch(function () {});
                saving = false;
                status.innerHTML = '';
                PHR.ui.toast.danger((result && result.message) ||
                  U.t('records.attachment.recordFailed', '附件已读取，但健康档案记录保存失败'));
                return;
              }
              close('saved');
              PHR.ui.toast.ok(U.t('records.attachment.saved', '医院报告已上传并写入健康档案'));
              PHR.router.reload();
            }).catch(function (err) {
              saving = false;
              status.innerHTML = '';
              PHR.ui.toast.danger(err && err.message
                ? err.message
                : U.t('attachment.err.save', '附件保存失败'));
            });
            return false;
          } }
      ]
    });

    var form = m.body.querySelector('#attachment-meta-form');
    if (form) { form.addEventListener('submit', function (e) { e.preventDefault(); }); }
  }

  function showImportPreview(fileName, text) {
    var res = PHR.records.sync.previewFile(text, fileName);
    if (!res.ok) {
      PHR.ui.toast.danger(res.message || U.t('records.import.parseFailed', '文件解析失败'));
      return;
    }

    var stats = res.stats;
    var items = res.items.slice(0, 80);
    var body =
      PHR.ui.notice(stats.importable ? 'ok' : 'warn',
        U.t('records.import.previewTitle', '文件解析完成'),
        U.t('records.import.previewBody',
          '共读取 {total} 条；可导入 {ok} 条，重复 {dup} 条，无效 {bad} 条。确认后只写入可导入记录。',
          { total: stats.total, ok: stats.importable, dup: stats.duplicate, bad: stats.invalid }),
        { icon: '📥' }) +
      '<div class="t-xs dim mt2 mb3">' +
        dom.esc(U.t('records.import.formatHint',
          '可以上传按示例模板整理的体检单、化验单或血压血糖记录；导入前会先预览，不会直接写入。')) +
      '</div>' +
      '<div class="list">' + items.map(function (it, i) {
        var status = !it.valid
          ? PHR.ui.badge(U.t('records.import.invalid', '无效'), 'danger')
          : it.duplicate
          ? PHR.ui.badge(U.t('records.sync.duplicate', '已存在，跳过'), 'muted')
          : PHR.ui.badge(U.t('records.sync.fresh', '新数据'), 'ok');
        return '<div class="list-item">' +
          '<span class="lead" style="' + (it.color ? 'background:' + it.color + '1f;color:' + it.color : '') + '">' +
            (it.icon || (i + 1)) + '</span>' +
          '<div class="body"><div class="title">' + dom.esc(it.title || U.t('records.import.unknownRecord', '未识别记录')) +
            status + '</div>' +
            '<div class="sub">' + (it.valid
              ? dom.esc(it.typeName + '　·　' + it.dateText + '　·　' + it.sourceName)
              : dom.esc(it.error || U.t('records.import.invalidDetail', '字段不完整或记录类型无法识别'))) +
            '</div></div>' +
        '</div>';
      }).join('') + '</div>' +
      (res.items.length > items.length
        ? '<div class="t-xs dim mt3">' +
          dom.esc(U.t('records.import.more', '仅预览前 {n} 条，其余会按同样规则处理。', { n: items.length })) +
          '</div>'
        : '') +
      '<div class="form-actions" id="import-actions">' +
        '<button class="btn" data-cancel>' + U.t('ui.cancel', '取消') + '</button>' +
        '<button class="btn btn-primary" data-confirm' + (stats.importable ? '' : ' disabled') + '>' +
          U.t('records.import.writeIn', '写入档案（{n} 条）', { n: stats.importable }) + '</button>' +
      '</div>';

    var m = PHR.ui.modal({
      title: U.t('records.import.title', '上传医院报告'),
      size: 'wide',
      body: body,
      actions: []
    });

    var foot = U.$('#import-actions', m.body);
    foot.querySelector('[data-cancel]').addEventListener('click', function () { m.close('cancel'); });
    foot.querySelector('[data-confirm]').addEventListener('click', function () {
      foot.innerHTML = PHR.ui.loading(U.t('records.import.writing', '正在写入…'));
      setTimeout(function () {
        var done = PHR.records.sync.importFile(text, fileName);
        m.close('done');
        if (done.ok) {
          showImportDone(done);
          PHR.router.reload();
        } else {
          PHR.ui.toast.danger(done.message || U.t('records.import.failed', '导入失败'));
        }
      }, 20);
    });
  }

  function showImportDone(done) {
    var imported = Number(done.imported || 0);
    var detail = imported
      ? U.t('records.import.doneDetailUpdated',
          '这些记录已经写入健康档案，健康趋势、风险评分和异常提醒会立即按最新数据重新计算。')
      : U.t('records.import.doneDetailNoNew',
          '这次没有写入新记录，因此健康趋势和风险评分不会发生变化。');
    var actions = [{ label: U.t('ui.close', '关闭'), tone: 'ghost' }];
    if (imported) {
      actions.push({
        label: U.t('records.import.viewInsights', '查看更新后的健康洞察'),
        tone: 'primary',
        action: function () { PHR.router.go('/insight'); }
      });
    }

    PHR.ui.modal({
      title: U.t('records.import.doneTitle', '导入完成'),
      size: 'narrow',
      body:
        PHR.ui.notice(imported ? 'ok' : 'info', done.message, detail, { icon: imported ? '✅' : 'ℹ️' }) +
        '<dl class="kv mt4">' +
          '<dt>' + dom.esc(U.t('records.import.doneImported', '新增记录')) + '</dt><dd>' + imported + '</dd>' +
          '<dt>' + dom.esc(U.t('records.import.doneDuplicate', '重复跳过')) + '</dt><dd>' + dom.esc(done.stats ? done.stats.duplicate : 0) + '</dd>' +
          '<dt>' + dom.esc(U.t('records.import.doneInvalid', '无效记录')) + '</dt><dd>' + dom.esc(done.stats ? done.stats.invalid : 0) + '</dd>' +
        '</dl>',
      actions: actions
    });
  }

  function openSyncDialog() {
    var list = PHR.records.sync.hospitals();
    PHR.ui.modal({
      title: U.t('records.sync.title', '从医院同步健康数据'),
      titleTip: U.t('records.sync.howBody',
        '选择机构后，系统会拉取该机构可共享的检查结果与诊断报告，并自动做查重（同类型 + 同日期 + 同标题视为同一条），' +
        '确认后再写入档案。整个过程会写入审计日志。'),
      size: 'wide',
      body:
        '<div class="list">' + list.map(function (h) {
          return '<div class="list-item">' +
            '<span class="lead">🏥</span>' +
            '<div class="body"><div class="title">' + dom.esc(h.name) + '</div>' +
              '<div class="sub">' + dom.esc(h.level) +
                (h.lastSyncAt
                  ? '　·　' + U.t('records.sync.lastSync', '上次同步 {when}', { when: U.fmtRelative(h.lastSyncAt) })
                  : '　·　' + U.t('records.sync.never', '尚未同步过')) + '</div></div>' +
            '<div class="meta"><button class="btn btn-sm btn-primary" data-sync="' + dom.esc(h.key) + '">' +
              U.t('records.sync.pull', '拉取数据') + '</button></div>' +
          '</div>';
        }).join('') + '</div>',
      actions: [{ label: U.t('ui.close', '关闭'), tone: 'ghost' }],
      onMount: function (body, close) {
        body.addEventListener('click', function (e) {
          var b = e.target.closest('[data-sync]');
          if (!b) { return; }
          close('x');
          runSync(b.getAttribute('data-sync'));
        });
      }
    });
  }

  function runSync(hospitalKey) {
    var m = PHR.ui.modal({
      title: U.t('records.sync.running', '正在同步…'), size: 'normal', closable: false,
      body: '<div id="sync-stage">' +
        PHR.ui.loading(U.t('records.sync.connecting', '正在连接医院数据接口…')) + '</div>',
      actions: []
    });

    PHR.records.sync.preview(hospitalKey).then(function (res) {
      var stage = U.$('#sync-stage', m.body);
      if (!stage) { return; }

      stage.innerHTML =
        PHR.ui.notice(res.stats.fresh ? 'ok' : 'warn', U.t('records.sync.pulled', '拉取完成'),
          U.t('records.sync.pulledBody',
            '共获取 {total} 条数据，其中新数据 {fresh} 条，重复 {dup} 条（重复项将被跳过）。',
            { total: res.stats.total, fresh: res.stats.fresh, dup: res.stats.duplicate }),
          { icon: '📥' }) +
        '<div class="list mt3">' + res.items.map(function (it) {
          return '<div class="list-item">' +
            '<span class="lead" style="background:' + it.color + '1f;color:' + it.color + '">' + it.icon + '</span>' +
            '<div class="body"><div class="title">' + dom.esc(PHR.models.record.displayTitle(it)) +
              (it.duplicate
                ? PHR.ui.badge(U.t('records.sync.duplicate', '已存在，跳过'), 'muted')
                : PHR.ui.badge(U.t('records.sync.fresh', '新数据'), 'ok')) + '</div>' +
              '<div class="sub">' + dom.esc(it.typeName) + '　·　' + dom.esc(it.dateText) + '</div></div>' +
          '</div>';
        }).join('') + '</div>';

      m.body.insertAdjacentHTML('beforeend',
        '<div class="form-actions" id="sync-actions">' +
          '<button class="btn" data-cancel>' + U.t('ui.cancel', '取消') + '</button>' +
          '<button class="btn btn-primary" data-confirm>' +
            U.t('records.sync.writeIn', '写入档案（{n} 条）', { n: res.stats.fresh }) + '</button>' +
        '</div>');
      var foot = U.$('#sync-actions', m.body);
      foot.querySelector('[data-cancel]').addEventListener('click', function () { m.close('cancel'); });
      foot.querySelector('[data-confirm]').addEventListener('click', function () {
        if (!res.stats.fresh) {
          PHR.ui.toast.info(U.t('records.sync.nothingNew', '没有需要写入的新数据'));
          m.close('done');
          return;
        }
        foot.innerHTML = PHR.ui.loading(U.t('records.sync.writing', '正在写入…'));
        PHR.records.sync.sync(hospitalKey).then(function (r) {
          m.close('done');
          PHR.ui.toast.ok(r.message, { title: U.t('records.sync.done', '同步完成') });
          PHR.router.reload();
        });
      });
    });
  }

  /* ================================================================== *
   * 录入引导
   * ================================================================== */
  function showGuide() {
    var order = C.recommendedOrder();
    var comp = C.completeness(S.all(), PHR.records.profile.get());
    var missing = comp.missing.map(function (m) { return m.key; });

    PHR.ui.modal({
      title: U.t('records.guide.title', '建议的录入顺序'),
      titleTip: U.t('records.guide.whyBody',
        '档案的价值不在于数量多，而在于医生需要的那几项一定在。下面这个顺序是按"临床实用度"排的，' +
        '建议按顺序补齐。'),
      size: 'wide',
      body:
        '<div class="list">' + order.map(function (o, i) {
          var done = o.key === 'basic'
            ? PHR.records.profile.exists()
            : missing.indexOf(o.key) < 0;
          return '<div class="list-item">' +
            '<span class="lead"' + (done ? ' style="background:var(--ok-soft);color:var(--ok)"' : '') + '>' +
              (done ? '✓' : (i + 1)) + '</span>' +
            '<div class="body"><div class="title">' + dom.esc(o.name) +
              (done ? PHR.ui.badge(U.t('records.guide.done', '已完成'), 'ok') : '') + '</div>' +
              '<div class="sub">' + dom.esc(o.why) + '</div></div>' +
            '<div class="meta">' + (done ? '' :
              '<button class="btn btn-sm btn-soft" data-goto="' + (o.type ? o.type : 'basic') + '">' +
                U.t('records.guide.go', '去录入') + '</button>') + '</div>' +
          '</div>';
        }).join('') + '</div>',
      actions: [{ label: U.t('ui.gotIt', '知道了'), tone: 'primary' }],
      onMount: function (body, close) {
        body.addEventListener('click', function (e) {
          var b = e.target.closest('[data-goto]');
          if (!b) { return; }
          var v = b.getAttribute('data-goto');
          close('x');
          PHR.router.go(v === 'basic' ? '/basic' : ('/records-edit?type=' + v));
        });
      }
    });
  }

})(window.PHR);
