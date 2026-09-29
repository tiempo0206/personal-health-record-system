/**
 * ============================================================================
 * 文件：ui/components/table.js
 * 层：表现层（组件）
 * 职责：带排序、分页、行选择、行操作的数据表格。
 *      用法：PHR.ui.table(container, { columns, rows, pageSize, onRowClick, ... })
 *      返回一个控制器，可调用 refresh(rows) 局部刷新。
 * 依赖：core/namespace.js、core/utils.js、ui/components/dom.js、ui/components/empty.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;

  /**
   * @param {Element} container 目标容器
   * @param {object} cfg {
   *   columns: [{
   *     key, label, width, align:'left'|'right'|'center',
   *     sortable:boolean, sortValue(row), render(row, index) -> HTML,
   *     hideOnMobile:boolean
   *   }],
   *   rows: Array,
   *   pageSize: number,            分页大小，0 表示不分页
   *   defaultSort: { key, desc },
   *   onRowClick(row, index),      行点击回调
   *   rowClass(row),               额外行样式
   *   empty: { icon, title, hint, action },
   *   renderEmpty(el)              自定义空状态
   *   minWidth: number             表格最小宽度（移动端横向滚动）
   * }
   * @returns {{refresh:Function, getRows:Function, getPage:Function, goPage:Function}}
   */
  function table(container, cfg) {
    if (!container) { return null; }
    cfg = cfg || {};
    var columns = cfg.columns || [];
    var allRows = cfg.rows || [];
    var pageSize = cfg.pageSize === undefined ? PHR.config.pageSize : cfg.pageSize;
    var page = 1;
    var sort = cfg.defaultSort ? { key: cfg.defaultSort.key, desc: !!cfg.defaultSort.desc } : null;

    function sortedRows() {
      if (!sort) { return allRows; }
      var col = columns.filter(function (c) { return c.key === sort.key; })[0];
      if (!col) { return allRows; }
      var val = col.sortValue || function (r) { return r[col.key]; };
      return U.sortBy(allRows, val, sort.desc);
    }

    function pageRows() {
      var rows = sortedRows();
      if (!pageSize || pageSize <= 0) { return rows; }
      var start = (page - 1) * pageSize;
      return rows.slice(start, start + pageSize);
    }

    function render() {
      var total = allRows.length;
      if (!total) {
        container.innerHTML = typeof cfg.renderEmpty === 'function'
          ? cfg.renderEmpty(container)
          : PHR.ui.empty(Object.assign({
              icon: '📭',
              title: PHR.t('ui.noData', '暂无数据'),
              hint: PHR.t('ui.tableEmptyHint', '换个筛选条件试试，或新增一条记录。')
            }, cfg.empty || {}));
        return;
      }

      var rows = pageRows();
      var html = '<div class="table-wrap"><table class="tbl"' +
        (cfg.minWidth ? ' style="min-width:' + cfg.minWidth + 'px"' : '') + '><thead><tr>';

      columns.forEach(function (c) {
        var isSorted = sort && sort.key === c.key;
        html += '<th' +
          (c.width ? ' style="width:' + c.width + '"' : '') +
          (c.align ? ' class="' + (c.align === 'right' ? 'num' : c.align === 'center' ? 'tc' : '') + '"' : '') +
          (c.sortable ? ' class="sortable" data-sort="' + dom.esc(c.key) + '"' : '') +
          '>' + dom.esc(c.label) +
          (isSorted ? '<span class="arrow">' + (sort.desc ? '▼' : '▲') + '</span>' : '') +
          '</th>';
      });
      html += '</tr></thead><tbody>';

      rows.forEach(function (row, i) {
        var globalIndex = pageSize > 0 ? (page - 1) * pageSize + i : i;
        html += '<tr' +
          (cfg.onRowClick ? ' class="clickable' + (cfg.rowClass ? ' ' + cfg.rowClass(row) : '') + '" data-row="' + globalIndex + '"' : '') +
          '>';
        columns.forEach(function (c) {
          var content = typeof c.render === 'function' ? c.render(row, globalIndex) : dom.esc(dom.or(row[c.key]));
          html += '<td' + (c.align === 'right' ? ' class="num"' : c.align === 'center' ? ' class="tc"' : '') + '>' +
            content + '</td>';
        });
        html += '</tr>';
      });

      html += '</tbody></table></div>';

      // 分页
      if (pageSize > 0 && total > pageSize) {
        var pages = Math.ceil(total / pageSize);
        html += '<div class="pager">';
        html += '<span class="info">' + dom.esc(PHR.t('ui.pagerInfo',
          '共 {total} 条，第 {page} / {pages} 页', { total: total, page: page, pages: pages })) + '</span>';
        html += '<button data-page="1"' + (page === 1 ? ' disabled' : '') + '>' +
          dom.esc(PHR.t('ui.first', '首页')) + '</button>';
        html += '<button data-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>' +
          dom.esc(PHR.t('ui.prev', '上一页')) + '</button>';

        var from = Math.max(1, page - 2), to = Math.min(pages, from + 4);
        from = Math.max(1, to - 4);
        for (var p = from; p <= to; p++) {
          html += '<button data-page="' + p + '"' + (p === page ? ' aria-current="page"' : '') + '>' + p + '</button>';
        }

        html += '<button data-page="' + (page + 1) + '"' + (page === pages ? ' disabled' : '') + '>' +
          dom.esc(PHR.t('ui.next', '下一页')) + '</button>';
        html += '<button data-page="' + pages + '"' + (page === pages ? ' disabled' : '') + '>' +
          dom.esc(PHR.t('ui.last', '末页')) + '</button>';
        html += '</div>';
      }

      container.innerHTML = html;
    }

    /* 事件委托 */
    container.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-sort]');
      if (th && container.contains(th)) {
        var key = th.getAttribute('data-sort');
        if (sort && sort.key === key) { sort.desc = !sort.desc; } else { sort = { key: key, desc: false }; }
        page = 1;
        render();
        return;
      }
      var pg = e.target.closest('[data-page]');
      if (pg && container.contains(pg)) {
        var target = Number(pg.getAttribute('data-page'));
        var pages = pageSize > 0 ? Math.ceil(allRows.length / pageSize) : 1;
        if (target >= 1 && target <= pages) { page = target; render(); }
        return;
      }
      var tr = e.target.closest('tr[data-row]');
      if (tr && container.contains(tr) && cfg.onRowClick) {
        if (e.target.closest('button, a, input, [data-stop]')) { return; }
        cfg.onRowClick(allRows[Number(tr.getAttribute('data-row'))], Number(tr.getAttribute('data-row')));
      }
    });

    render();

    return {
      /** 用新数据刷新（保持当前页与排序） */
      refresh: function (rows) {
        allRows = rows || [];
        var pages = pageSize > 0 ? Math.max(1, Math.ceil(allRows.length / pageSize)) : 1;
        if (page > pages) { page = pages; }
        render();
        return this;
      },
      getRows: function () { return allRows; },
      getPage: function () { return page; },
      goPage: function (p) { page = p; render(); },
      setSort: function (key, desc) { sort = key ? { key: key, desc: !!desc } : null; page = 1; render(); }
    };
  }

  PHR.ui.table = table;

})(window.PHR);
