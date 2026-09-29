/**
 * ============================================================================
 * 文件：modules/assessment/assessment.view.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：注册「心理测评」主页（路由 #/assessment）—— 量表目录、我的测评记录、
 *      跨时间趋势与免责声明。
 *      本文件是**纯渲染层**：不做任何计分、分级、阈值判断。分数与级别来自
 *      scoring.js，危机提示来自 crisis.js，记录读写来自 assessment.service.js。
 *      视图里出现任何一个量表专属的 if，都意味着引擎的"零特判"约定被破坏了。
 *
 * 依赖：modules/assessment/{scales,scoring,crisis,report,assessment.service}.js
 *      ui/components/{dom,empty,badge,table,chart,toast,modal}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;
  var S = PHR.assessment.scales;
  var SC = PHR.assessment.scoring;

  /** 页面级状态：趋势图当前选中的量表（只在本次会话内有效，不入库） */
  var state = { trendScale: '' };

  PHR.registerView('assessment', {
    title: PHR.t('view.assessment.title', '心理测评'), icon: '🧠', group: 'main', order: 9, module: 'assessment',
    render: render, mount: mount
  });

  /* ================================================================== *
   * 一、渲染
   * ================================================================== */
  function render(root) {
    if (!PHR.assessment || !PHR.assessment.all) {
      root.innerHTML = PHR.ui.error(PHR.t('assessment.notLoaded',
        '心理测评模块未加载，请检查 modules/assessment 下的脚本是否被正确引入。'));
      return;
    }

    var rows = PHR.assessment.all();
    var overview = overviewMap();

    root.innerHTML = '<div id="assess-root">' +
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>' + PHR.t('view.assessment.title', '心理测评') + '</h2>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="goto-records">' +
            PHR.t('assessment.myRecords', '📋 我的测评记录') + '</button>' +
          '<button class="btn btn-primary" data-action="quick">' +
            PHR.t('assessment.quickScreen', '🔎 先做快速筛查') + '</button>' +
        '</div>' +
      '</div>' +

      /* 只要最近有触发过危机提示的测评，横幅就常驻在页面顶部 */
      crisisBanner() +

      PHR.ui.notice('primary', PHR.t('assessment.intro.title', '这是自评筛查工具，不是诊断'),
        rich(PHR.t('assessment.page.introBody',
          '本页收录 {n} 份公开发表的心理量表，' +
          '按「筛查 / 情绪 / 睡眠 / 压力 / 积极心理」五个主题分组，每份用时 1~3 分钟。' +
          '筛查分数偏高**不等于**患病，分数正常也**不能排除**问题。' +
          '所有结果**只在本地保存，只有你自己看得到** —— 它们不进档案记录、不进搜索索引、' +
          '也不参与健康洞察的风险评分。', { n: S.list().length })),
        { icon: '🧠', raw: true, action: { label: PHR.t('assessment.quickScreen', '先做快速筛查'), action: 'quick' } }) +

      '<div class="card mb4"><div class="card-head">' +
        '<h3 class="t-lg">' + PHR.t('assessment.catalog', '量表目录') + '</h3>' +
        '<div class="sub">' + PHR.t('assessment.catalogHint',
          '不清楚从哪份开始，就先做 5 道题的「快速心理筛查」') + '</div>' +
      '</div><div class="card-body">' + catalogHtml(overview) + '</div></div>' +

      '<div class="card mb4" id="assess-records-card"><div class="card-head">' +
        '<h3 class="t-lg">' + PHR.t('assessment.myRecords', '我的测评记录') + '</h3>' +
        '<div class="sub">' + PHR.t('assessment.recordsSub',
          '共 {n} 份，点任意一行查看完整报告', { n: rows.length }) + '</div>' +
      '</div><div class="card-body flush"><div id="assess-records"></div></div></div>' +

      '<div class="card mb4" id="assess-trend-card"><div class="card-head">' +
        '<h3 class="t-lg">' + PHR.t('assessment.trend', '趋势') + '</h3>' +
        '<div class="sub">' + PHR.t('assessment.trendSub',
          '同一份量表做过两次以上，才看得出变化') + '</div>' +
      '</div><div class="card-body">' +
        '<div id="assess-trend-chips" class="row wrap gap2 mb4"></div>' +
        '<div id="assess-trend-chart"></div>' +
        '<div id="assess-trend-note"></div>' +
      '</div></div>' +

      PHR.ui.notice('info', PHR.t('assessment.report.disclaimer', '免责声明'),
        rich(S.DISCLAIMER), { icon: 'ℹ️', raw: true }) +
    '</div>';
  }

  /* ================================================================== *
   * 二、挂载：填表格、画图、绑事件
   * ------------------------------------------------------------------
   * ⚠️ 事件一律绑在 #assess-root 上，而不是绑在 root 上。ui/shell.js 在
   *    整个会话里复用同一个 #view-root 元素，若把监听器挂在 root 上，
   *    每切换一次视图就会叠加一层，不同视图里同名的 data-action
   *    （例如 "take"）会互相触发。
   * ================================================================== */
  function mount(root) {
    var page = U.$('#assess-root', root);
    if (!page) { return; }

    mountTable(U.$('#assess-records', page));
    drawTrend(page);

    dom.actions(page, {
      quick: function () { PHR.router.go('/assessment-take/quick'); },
      take: function (e, el) { PHR.router.go('/assessment-take/' + el.getAttribute('data-scale')); },
      'goto-records': function () { dom.scrollTo('#assess-records-card'); },
      view: function (e, el) { PHR.router.go('/assessment-report/' + el.getAttribute('data-id')); },
      del: function (e, el) { removeRecord(el.getAttribute('data-id')); },
      'trend-scale': function (e, el) {
        state.trendScale = el.getAttribute('data-scale');
        drawTrend(page);
      },
      'show-help': function () { showHelp(); }
    });
  }

  /* ================================================================== *
   * 三、零件
   * ================================================================== */

  /** 取每个量表的最近一次结果与趋势（overview 由服务层算好，视图只负责摆） */
  function overviewMap() {
    var map = {};
    try {
      (PHR.assessment.overview() || []).forEach(function (o) { map[o.scale.key] = o; });
    } catch (e) { PHR.warn(PHR.t('assessment.warn.overviewReadFail', '读取测评总览失败'), e); }
    return map;
  }

  /** 最近一次触发过危机提示的测评（记录为时间倒序，没有则返回 null） */
  function latestCrisisRow() {
    return PHR.assessment.all().filter(function (r) {
      return r.crisis && r.crisis.level && r.crisis.level !== 'none';
    })[0] || null;
  }

  /** 顶部危机横幅：文案与按钮全部由 crisis.js 生成，视图不自己拼措辞 */
  function crisisBanner() {
    var row = latestCrisisRow();
    return row
      ? '<div id="assess-crisis">' + PHR.assessment.crisis.bannerHtml(row.scaleKey, row) + '</div>'
      : '';
  }

  /** 量表目录：按主题分组，每张卡显示题数、用时、来源与最近一次结果 */
  function catalogHtml(overview) {
    return S.byTopic().map(function (g) {
      return '<div class="mb5">' +
        '<div class="callout-title">' +
          PHR.ui.badge(S.topicName(g.topic), S.topicTone(g.topic)) +
          '<span class="t-xs dim">' +
            PHR.t('assessment.scaleCount', '{n} 份量表', { n: g.scales.length }) + '</span>' +
        '</div>' +
        '<div class="grid auto-grid">' +
          g.scales.map(function (sc) { return scaleCard(sc, overview[sc.key]); }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function scaleCard(sc, o) {
    var count = o ? o.count : 0;
    var last = o ? o.latest : null;
    var cmp = o ? o.trend : null;
    return '<div class="record-card" data-action="take" data-scale="' + dom.esc(sc.key) + '"' +
        ' style="cursor:pointer">' +
      '<span class="bar" style="background:' + dom.esc(sc.color) + '"></span>' +
      '<div class="head">' +
        '<span class="ico" aria-hidden="true">' + sc.icon + '</span>' +
        '<div class="grow">' +
          '<div class="t">' + dom.esc(sc.name) + '</div>' +
          '<div class="t-xs dim">' + dom.esc(S.topicName(sc.topic)) + ' · ' +
            dom.esc(PHR.t('assessment.questions', '{n} 题', { n: sc.items.length })) + ' · ' +
            dom.esc(PHR.t('assessment.report.aboutMinutes', '约 {n} 分钟', { n: sc.estMinutes })) +
            (sc.noCutoff ? ' · ' + dom.esc(PHR.t('assessment.noCutoff', '无临床切分点')) : '') + '</div>' +
        '</div>' +
        PHR.ui.badge(count
          ? PHR.t('assessment.doneTimes', '做过 {n} 次', { n: count })
          : PHR.t('assessment.neverDone', '未做过'), count ? 'info' : 'muted') +
      '</div>' +
      '<div class="desc">' + dom.esc(sc.desc) + '</div>' +
      (last
        ? '<div class="row wrap gap2 mt3">' +
            '<span class="t-lg bold">' + last.total +
              '<span class="t-xs dim">' +
                dom.esc(PHR.t('assessment.report.ofMax', ' / {max} 分', { max: last.max })) + '</span></span>' +
            PHR.assessment.report.levelBadge(last) +
            '<span class="t-xs dim">' + U.fmtDate(last.at) + '</span>' +
          '</div>' +
          (cmp
            ? '<div class="t-xs mt1 ' + (cmp.better === null ? 'dim' : (cmp.better ? 'ok' : 'warn')) + '">' +
              dom.esc(cmp.text) + '</div>'
            : '')
        : '') +
      '<div class="foot">' +
        '<span class="grow ellipsis" title="' + dom.esc(sc.source) + '">' + dom.esc(sc.source) + '</span>' +
        '<button class="btn btn-sm btn-primary" data-action="take" data-scale="' + dom.esc(sc.key) + '">' +
          (count ? PHR.t('assessment.retake', '再测一次') : PHR.t('assessment.start', '开始测评')) + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------------------- 3.1 我的测评记录 ---------------------------- */
  function mountTable(host) {
    if (!host) { return; }

    PHR.ui.table(host, {
      rows: PHR.assessment.all(),
      defaultSort: { key: 'at', desc: true },
      minWidth: 620,
      onRowClick: function (row) { PHR.router.go('/assessment-report/' + row.id); },
      empty: {
        icon: '📝', title: PHR.t('assessment.emptyRecords', '还没有测评记录'),
        hint: PHR.t('assessment.emptyRecordsHint',
          '从上面的量表目录里挑一份开始，做完之后会自动出现在这里。')
      },
      columns: [
        { key: 'scaleName', label: PHR.t('assessment.col.scale', '量表'), render: function (r) {
            var sc = S.get(r.scaleKey);
            return '<span class="row gap2">' + (sc ? sc.icon : '📋') +
              '<span>' + dom.esc(S.nameOf(r.scaleKey)) + '</span></span>';
        } },
        { key: 'total', label: PHR.t('assessment.col.total', '总分'), align: 'right', width: '110px', render: function (r) {
            return '<span class="bold">' + r.total + '</span><span class="dim">' +
              dom.esc(PHR.t('assessment.report.ofMax', ' / {max} 分', { max: r.max })) + '</span>';
        } },
        { key: 'level', label: PHR.t('assessment.col.level', '分级'), width: '130px', render: function (r) {
            return PHR.assessment.report.levelBadge(r);
        } },
        { key: 'at', label: PHR.t('assessment.col.time', '测评时间'), width: '150px', render: function (r) {
            return '<span class="t-xs dim">' + U.fmtFull(r.at) + '</span>';
        } },
        { key: 'ops', label: PHR.t('assessment.col.ops', '操作'), align: 'right', width: '170px', render: function (r) {
            return '<button class="btn btn-sm" data-action="view" data-id="' + dom.esc(r.id) + '">' +
                PHR.t('assessment.viewReport', '查看报告') + '</button>' +
              '<button class="btn btn-sm btn-ghost" data-action="del" data-id="' + dom.esc(r.id) + '">' +
                PHR.t('ui.delete', '删除') + '</button>';
        } }
      ]
    });
  }

  function removeRecord(id) {
    var row = PHR.assessment.byId(id);
    if (!row) {
      PHR.ui.toast.warn(PHR.t('assessment.recordGone', '记录不存在，可能已经被删除'));
      return;
    }

    PHR.ui.confirm({
      title: PHR.t('assessment.confirmDeleteTitle', '删除这份测评记录'),
      message: PHR.t('assessment.confirmDelete', '确定要删除「{name}」（{date}）吗？',
        { name: S.nameOf(row.scaleKey), date: U.fmtDate(row.at) }),
      detail: PHR.t('assessment.confirmDeleteDetail',
        '删除后无法恢复。心理测评数据只在本地保存，不会随档案一起备份，请谨慎操作。'),
      confirmLabel: PHR.t('ui.delete', '删除')
    }).then(function (ok) {
      if (!ok) { return; }
      var res = PHR.assessment.remove(id);
      if (res && res.ok) {
        PHR.ui.toast.ok(PHR.t('assessment.deleted', '已删除'));
        PHR.router.reload();
      } else {
        PHR.ui.toast.warn((res && res.message) || PHR.t('assessment.deleteFailed', '删除失败'));
      }
    });
  }

  /* ---------------------------- 3.2 趋势 ---------------------------- */
  function drawTrend(page) {
    var chipsHost = U.$('#assess-trend-chips', page);
    var chartHost = U.$('#assess-trend-chart', page);
    var noteHost = U.$('#assess-trend-note', page);
    if (!chipsHost || !chartHost) { return; }

    var used = S.list().filter(function (sc) { return PHR.assessment.history(sc.key).length > 0; });

    if (!used.length) {
      chipsHost.innerHTML = '';
      if (noteHost) { noteHost.innerHTML = ''; }
      chartHost.innerHTML = PHR.ui.empty({
        icon: '📈', title: PHR.t('assessment.trendEmpty', '还没有可以画趋势的数据'),
        hint: PHR.t('assessment.trendEmptyHint',
          '完成任意一份量表之后，这里会画出它随时间的变化。'), compact: true
      });
      return;
    }

    if (!used.some(function (sc) { return sc.key === state.trendScale; })) {
      // 默认选中"做过次数最多"的那份量表，否则用户还要先点一下才有图
      state.trendScale = used.slice().sort(function (a, b) {
        return PHR.assessment.history(b.key).length - PHR.assessment.history(a.key).length;
      })[0].key;
    }

    chipsHost.innerHTML = used.map(function (sc) {
      return '<button class="chip clickable' + (sc.key === state.trendScale ? ' active' : '') + '"' +
        ' data-action="trend-scale" data-scale="' + dom.esc(sc.key) + '">' +
        sc.icon + ' ' + dom.esc(sc.shortName) + '</button>';
    }).join('');

    var key = state.trendScale;
    var sc = S.get(key);
    var t = PHR.assessment.trend(key);
    var hist = PHR.assessment.history(key);

    if (!t.enough) {
      if (noteHost) { noteHost.innerHTML = ''; }
      chartHost.innerHTML = PHR.ui.empty({
        icon: '📈', title: PHR.t('assessment.trendNeed2', '至少完成两次，才看得出变化'),
        hint: PHR.t('assessment.trendNeed2Hint',
          '「{name}」目前只做了 {n} 次，再做一次就能画出趋势。',
          { name: sc.name, n: hist.length }),
        action: { label: PHR.t('assessment.retake', '再测一次'), action: 'take', icon: '📝' },
        compact: true
      });
      var btn = chartHost.querySelector('[data-action="take"]');
      if (btn) { btn.setAttribute('data-scale', key); }
      return;
    }

    // trend() 的 points 只有 x/y，这里按同一顺序补上每次的分级名，悬停时更有信息量
    var points = (t.points || []).map(function (p, i) {
      return { x: p.x, y: p.y, meta: hist[i] && hist[i].level ? hist[i].level.name : '' };
    });

    PHR.ui.chart.line(chartHost, {
      series: [{ name: sc.name, color: sc.color, points: points }],
      height: 230,
      yUnit: PHR.t('assessment.unit.score', '分'),
      showPoints: true,
      xFormat: function (v) { return U.fmtDate(v); },
      ariaLabel: PHR.t('assessment.trendAria', '{name}总分变化趋势', { name: sc.name }),
      emptyText: PHR.t('assessment.trendChartEmpty', '这份量表还没有可用的记录。')
    });

    /* 说明文字写在与图表**同级**的另一个容器里：
       图表在窗口缩放时会把自身容器整个重绘，写在图表容器里的文字会被抹掉。 */
    if (noteHost) {
      var cmp = SC.compare(t.first, t.last);
      noteHost.innerHTML =
        '<div class="row-top gap2 mt3"><span aria-hidden="true">' +
          (cmp && cmp.better === false ? '⚠️' : '📈') + '</span>' +
          '<div class="t-sm">' + dom.esc(t.text) + '</div></div>' +
        '<div class="t-xs dim mt2">' +
          PHR.t('assessment.trendStats',
            '共 {count} 次　最低 {best} 分　最高 {worst} 分　平均 {avg} 分（满分 {max}）',
            { count: t.count, best: t.best, worst: t.worst, avg: t.avg, max: t.last.max }) +
        '</div>' +
        (sc.noCutoff ? '<div class="t-xs dim mt2">⚠️ ' + dom.esc(sc.cutoffNote) + '</div>' : '');
    }
  }

  /* ---------------------------- 3.3 求助渠道弹窗 ---------------------------- */
  function showHelp() {
    var row = latestCrisisRow();
    var level = (row && row.crisis && row.crisis.level) || 'watch';
    PHR.ui.modal({
      title: PHR.t('crisis.helpTitle', '求助渠道'),
      size: 'normal',
      body: PHR.assessment.crisis.resourcesHtml({ level: level }),
      actions: [{ label: PHR.t('ui.close', '关闭'), tone: 'ghost' }]
    });
  }

  /* ---------------------------- 四、小工具 ---------------------------- */
  /** 转义后把 **粗体** 标记换成 <b>（模块内的说明文字统一用这种写法） */
  function rich(text) {
    return dom.esc(text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }

})(window.PHR);
