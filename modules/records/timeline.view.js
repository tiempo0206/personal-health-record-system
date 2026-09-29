/**
 * ============================================================================
 * 文件：modules/records/timeline.view.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：注册「健康时间线」页面 —— 把全部记录按时间倒序串成一条线，
 *      并按年/月分组，让"这些年身体发生了什么"一眼可见。
 *      对应需求原文："系统要形成完整记录，把个人健康信息集中管理"。
 * 依赖：modules/records/{record,categories,version}.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var S = PHR.records.service;
  var C = PHR.records.categories;

  var state = { types: [], years: [], keyword: '', showVersions: false };

  PHR.registerView('timeline', {
    title: PHR.t('view.timeline.title', '健康时间线'), icon: '🕒', group: 'main', order: 3, module: 'records',
    render: render
  });

  /* ================================================================== *
   * 页面
   * ================================================================== */
  function render(root, params) {
    if (params && params.type) { state.types = [params.type]; }

    var rows = S.all();
    var years = U.unique(rows.map(function (r) { return new Date(r.date).getFullYear(); }))
      .sort(function (a, b) { return b - a; });

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles"><h2>' + U.t('view.timeline.title', '健康时间线') + '</h2></div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="toggle-versions">' +
            (state.showVersions
              ? U.t('timeline.hideVersions', '隐藏修改记录')
              : U.t('timeline.showVersions', '显示修改记录')) + '</button>' +
          '<button class="btn btn-primary" data-action="new">' +
            U.t('records.btn.new', '＋ 新增记录') + '</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid g4 mb5" id="tl-stats"></div>' +

      '<div class="card mb4"><div class="card-body tight">' + filterBar(years) + '</div></div>' +

      '<div class="card"><div class="card-body" id="tl-area"></div></div>';

    drawStats(root);
    bind(root);
    drawTimeline();
  }

  /* ------------------------------ 统计 ------------------------------ */
  function drawStats(root) {
    var rows = S.all();
    var now = new Date();
    var first = rows.length ? rows[rows.length - 1] : null;
    var spanDays = first ? Math.round((Date.now() - first.date) / 86400000) : 0;

    var byYear = U.groupBy(rows, function (r) { return new Date(r.date).getFullYear(); });
    var thisYear = (byYear[now.getFullYear()] || []).length;

    var tiles = [
      { label: U.t('timeline.stat.span', '记录跨度'),
        value: spanDays > 365 ? (spanDays / 365).toFixed(1) : String(spanDays),
        unit: spanDays > 365 ? U.t('timeline.unit.years', '年') : U.t('timeline.unit.days', '天'), icon: '📏' },
      { label: U.t('timeline.stat.total', '记录总数'), value: dom.num(rows.length),
        unit: U.t('records.unit.records', '条'), icon: '📋' },
      { label: U.t('timeline.stat.thisYear', '今年新增'), value: String(thisYear),
        unit: U.t('records.unit.records', '条'), icon: '🗓️' },
      { label: U.t('timeline.stat.start', '起始时间'), value: first ? U.fmtDate(first.date) : '—', unit: '', icon: '🚩' }
    ];

    U.html(U.$('#tl-stats', root), tiles.map(function (t) {
      return '<div class="stat"><span class="corner"></span>' +
        '<div class="label">' + t.icon + ' ' + dom.esc(t.label) + '</div>' +
        '<div class="value">' + dom.esc(t.value) + (t.unit ? '<span class="unit">' + t.unit + '</span>' : '') + '</div>' +
      '</div>';
    }).join(''));
  }

  /* ------------------------------ 筛选 ------------------------------ */
  function filterBar(years) {
    // 只展示实际用过的类型，避免 14 个按钮全挤在一起
    var used = C.countByType(S.all()).filter(function (t) { return t.count > 0; });
    return '<div class="filter-panel">' +
      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('timeline.filter.type', '类型') + '</span>' +
        '<div class="opts">' +
          '<span class="chip clickable' + (state.types.length ? '' : ' active') + '" data-type="">' +
            U.t('ui.all', '全部') + '</span>' +
          used.map(function (t) {
            return '<span class="chip clickable' + (state.types.indexOf(t.key) >= 0 ? ' active' : '') +
              '" data-type="' + t.key + '">' + t.icon + ' ' + dom.esc(t.name) + ' ×' + t.count + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('timeline.filter.year', '年份') + '</span>' +
        '<div class="opts">' +
          '<span class="chip clickable' + (state.years.length ? '' : ' active') + '" data-year="">' +
            U.t('ui.all', '全部') + '</span>' +
          years.map(function (y) {
            return '<span class="chip clickable' + (state.years.indexOf(y) >= 0 ? ' active' : '') +
              '" data-year="' + y + '">' +
              U.t('timeline.year', '{y} 年', { y: y }) + '</span>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="filter-row">' +
        '<span class="lbl">' + U.t('records.filter.keyword', '关键词') + '</span>' +
        '<div class="search-input-wrap grow">' +
          '<span class="ico">🔍</span>' +
          '<input class="input" id="tl-keyword" placeholder="' +
            U.t('timeline.searchPlaceholder', '在时间线中搜索…') +
            '" value="' + dom.esc(state.keyword) + '">' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /**
   * 把筛选栏的选中态与 state 同步。
   *
   * 为什么必须有这个函数：点击标签只改变了 state 并重绘了时间线主体，
   * 筛选栏本身是用**渲染那一刻**的 state 生成 class 的，不重绘就永远停在
   * 旧样子 —— 表现为"点了能筛选，但标签不变色"，视觉与行为不一致。
   */
  function syncFilterBar(root) {
    root = root || (PHR.shell && PHR.shell.viewEl ? PHR.shell.viewEl() : null);
    if (!root) { return; }
    U.$$('[data-type]', root).forEach(function (el) {
      var v = el.getAttribute('data-type');
      el.classList.toggle('active', v ? state.types.indexOf(v) >= 0 : state.types.length === 0);
    });
    U.$$('[data-year]', root).forEach(function (el) {
      var v = el.getAttribute('data-year');
      el.classList.toggle('active', v ? state.years.indexOf(Number(v)) >= 0 : state.years.length === 0);
    });
  }

  function bind(root) {
    var kw = U.$('#tl-keyword', root);
    kw.addEventListener('input', U.debounce(function () {
      state.keyword = kw.value.trim();
      drawTimeline();
    }, 240));

    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-type]');
      if (t && root.contains(t)) {
        var v = t.getAttribute('data-type');
        if (!v) { state.types = []; } else { toggle(state.types, v); }
        syncFilterBar(root);
        return drawTimeline();
      }
      var y = e.target.closest('[data-year]');
      if (y && root.contains(y)) {
        var vv = y.getAttribute('data-year');
        if (!vv) { state.years = []; } else { toggle(state.years, Number(vv)); }
        syncFilterBar(root);
        return drawTimeline();
      }
    });

    dom.actions(root, {
      new: function () { PHR.router.go('/records-edit'); },
      'toggle-versions': function () {
        state.showVersions = !state.showVersions;
        PHR.router.reload();
      }
    });
  }

  function toggle(arr, v) {
    var i = arr.indexOf(v);
    if (i >= 0) { arr.splice(i, 1); } else { arr.push(v); }
  }

  /* ================================================================== *
   * 时间线渲染
   * ================================================================== */
  function drawTimeline() {
    var area = document.getElementById('tl-area');
    if (!area) { return; }

    var rows = S.list({ types: state.types, keyword: state.keyword });
    if (state.years.length) {
      rows = rows.filter(function (r) { return state.years.indexOf(new Date(r.date).getFullYear()) >= 0; });
    }

    if (!rows.length) {
      area.innerHTML = PHR.ui.empty({
        icon: '🕒',
        title: U.t('timeline.empty.title', '时间线上还没有内容'),
        hint: U.t('timeline.empty.hint', '录入第一条记录后，这里会按时间顺序把它们串起来。'),
        action: { label: U.t('timeline.empty.action', '新增记录'), action: 'new' }
      });
      dom.actions(area, { new: function () { PHR.router.go('/records-edit'); } });
      return;
    }

    // 按「年 → 月」分组
    var byYear = {};
    rows.forEach(function (r) {
      var d = new Date(r.date);
      var y = d.getFullYear(), m = d.getMonth() + 1;
      byYear[y] = byYear[y] || {};
      (byYear[y][m] = byYear[y][m] || []).push(r);
    });

    var html = storySummary(rows);
    Object.keys(byYear).sort(function (a, b) { return b - a; }).forEach(function (y) {
      var months = byYear[y];
      var yearCount = U.sum(Object.keys(months).map(function (m) { return months[m].length; }));
      html += '<div class="mb5">' +
        '<div class="row between mb3" style="border-bottom:2px solid var(--primary-soft);padding-bottom:8px">' +
          '<h3 style="margin:0">' + U.t('timeline.year', '{y} 年', { y: y }) + '</h3>' +
          '<span class="badge tone-primary">' +
            U.t('timeline.yearCount', '{n} 条记录', { n: yearCount }) + '</span>' +
        '</div>';

      Object.keys(months).sort(function (a, b) { return b - a; }).forEach(function (m) {
        html += '<div class="mb4">' +
          '<div class="t-sm bold dim mb2">' + U.t('timeline.month', '{m} 月', { m: m }) + '</div>' +
          '<div class="timeline">' + months[m].map(tlItem).join('') + '</div>' +
        '</div>';
      });

      html += '</div>';
    });

    if (state.showVersions) {
      html += versionSection(rows);
    }

    area.innerHTML = html;

    /* ⚠️ 用 onclick 赋值而不是 addEventListener：时间线区域是视图骨架里的
       同一个元素，重绘（切年份、切筛选、切换"显示修改记录"）都会跑到这里，
       addEventListener 会一层层叠加监听器。赋值是幂等的。 */
    area.onclick = function (e) {
      var item = e.target.closest('[data-record]');
      if (item) {
        PHR.router.go('/records-edit/' + item.getAttribute('data-record'));
      }
    };
  }

  function storySummary(rows) {
    var now = new Date();
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var monthRows = rows.filter(function (r) { return r.date >= monthStart; });
    var abnormal = rows.filter(function (r) { return r.abnormal || r.severity === 'critical' || r.severity === 'severe'; })[0];
    var visit = rows.filter(function (r) {
      return r.type === 'visit' || r.type === 'hospitalization' || r.type === 'checkup';
    })[0];
    var medication = rows.filter(function (r) { return r.type === 'medication' || r.type === 'prescription'; })[0];

    function titleOf(r, empty) {
      return r ? PHR.models.record.displayTitle(r) : empty;
    }
    function dateOf(r) {
      return r ? U.fmtDate(r.date) + ' · ' + D.recordTypeName(r.type) : '';
    }
    function tile(icon, label, value, sub, tone) {
      return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span class="corner"></span>' +
        '<div class="label">' + icon + ' ' + dom.esc(label) + '</div>' +
        '<div class="value" style="font-size:16px;line-height:1.25;white-space:normal;word-break:break-word">' + dom.esc(value) + '</div>' +
        '<div class="delta dim">' + dom.esc(sub || '') + '</div>' +
      '</div>';
    }

    return '<div class="mb5">' +
      '<div class="row between mb3" style="border-bottom:2px solid var(--primary-soft);padding-bottom:8px">' +
        '<h3 style="margin:0">' + dom.esc(U.t('timeline.story.title', '我的健康故事摘要')) + '</h3>' +
        '<span class="badge tone-primary">' +
          dom.esc(U.t('timeline.story.badge', '按健康事件整理')) + '</span>' +
      '</div>' +
      '<div class="grid g4">' +
        tile('🗓️', U.t('timeline.story.thisMonth', '本月新增'),
          U.t('timeline.story.thisMonthValue', '{n} 条', { n: monthRows.length }),
          U.t('timeline.story.thisMonthSub', '最近一个月写入系统的健康事件'), monthRows.length ? 'info' : '') +
        tile('⚠️', U.t('timeline.story.abnormal', '最近一次异常'),
          titleOf(abnormal, U.t('timeline.story.noneAbnormal', '暂无异常记录')),
          abnormal ? dateOf(abnormal) : U.t('timeline.story.noneAbnormalSub', '继续保持记录，系统会自动标出异常'), abnormal ? 'warn' : 'ok') +
        tile('🏥', U.t('timeline.story.visit', '最近一次就诊 / 体检'),
          titleOf(visit, U.t('timeline.story.noneVisit', '暂无就诊或体检记录')),
          visit ? dateOf(visit) : U.t('timeline.story.noneVisitSub', '上传报告或手动添加后会出现在这里'), visit ? '' : '') +
        tile('💊', U.t('timeline.story.medication', '最近一次用药变化'),
          titleOf(medication, U.t('timeline.story.noneMedication', '暂无用药记录')),
          medication ? dateOf(medication) : U.t('timeline.story.noneMedicationSub', '记录长期用药后，复诊时更容易说明情况'), medication ? 'info' : '') +
      '</div>' +
    '</div>';
  }

  function tlItem(r) {
    var t = D.recordType(r.type);
    var hi = C.highlights(r, 3);
    return '<div class="tl-item" data-record="' + dom.esc(r.id) + '">' +
      '<span class="dot" style="border-color:' + t.color + ';color:' + t.color + '">' + t.icon + '</span>' +
      '<div class="when">' + U.fmtDate(r.date) + '　·　' + dom.esc(t.name) + '</div>' +
      '<div class="what pointer">' +
        '<div class="h">' + dom.esc(PHR.models.record.displayTitle(r)) +
          (r.severity ? PHR.ui.badges.severity(r.severity) : '') +
          (r.abnormal ? PHR.ui.badge(U.t('records.abnormal', '异常'), 'danger') : '') +
          (r.source === 'sync' ? PHR.ui.badge(U.t('records.source.syncPlain', '医院同步'), 'info') : '') +
        '</div>' +
        (hi.length ? '<div class="d">' + hi.map(function (h) {
          return '<span class="mr3"><span class="dim">' + dom.esc(h.label) + '</span> ' + dom.esc(h.value) + '</span>';
        }).join('') + '</div>' : '<div class="d">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 120)) + '</div>') +
      '</div>' +
    '</div>';
  }

  /** 修改记录（版本变更）叠加在时间线上 */
  function versionSection(rows) {
    var ids = {};
    rows.forEach(function (r) { ids[r.id] = true; });
    var versions = PHR.records.versions.recent(60).filter(function (v) { return ids[v.recordId]; });
    if (!versions.length) { return ''; }

    return '<div class="mb4">' +
      '<div class="row between mb3" style="border-bottom:2px solid var(--warn-soft);padding-bottom:8px">' +
        '<h3 style="margin:0">' + U.t('timeline.version.title', '✏️ 修改记录') + '</h3>' +
        '<span class="badge tone-warn">' +
          U.t('timeline.version.count', '{n} 次变更', { n: versions.length }) + '</span>' +
      '</div>' +
      '<div class="timeline">' + versions.map(function (v) {
        var actionName = {
          create: U.t('records.version.action.create', '新建'),
          update: U.t('records.version.action.update', '修改'),
          delete: U.t('records.version.action.delete', '删除'),
          rollback: U.t('records.version.action.rollback', '回滚')
        }[v.action] || v.action;
        var tone = { create: 'ok', update: 'info', delete: 'danger', rollback: 'warn' }[v.action] || 'muted';
        return '<div class="tl-item">' +
          '<span class="dot" style="border-color:var(--text-3);color:var(--text-3)">✏️</span>' +
          '<div class="when">' + U.fmtDateTime(v.at) + '　·　' + dom.esc(v.operator) + '</div>' +
          '<div class="what">' +
            '<div class="h">' + PHR.ui.badge(actionName, tone) +
              dom.esc(v.title || U.t('timeline.version.noTitle', '（无标题）')) +
              '<span class="dim t-xs">v' + v.version + '</span></div>' +
            (v.changedFields && v.changedFields.length
              ? '<div class="d">' + v.changedFields.map(function (c) {
                  return dom.esc(c.label) + '：<span class="old">' + dom.esc(c.from) + '</span> → <span class="new">' + dom.esc(c.to) + '</span>';
                }).join(U.t('ui.listSep', '；')) + '</div>'
              : '<div class="d dim">' + dom.esc(v.reason || '') + '</div>') +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
    '</div>';
  }

})(window.PHR);
