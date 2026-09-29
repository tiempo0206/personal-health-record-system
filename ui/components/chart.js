/**
 * ============================================================================
 * 文件：ui/components/chart.js
 * 层：表现层（组件）
 * 职责：纯 SVG 手写图表引擎（不依赖任何第三方库，保证 file:// 双击可用）。
 *      提供：折线图（含正常区间底纹与交互提示）、柱状图、环形图、
 *            迷你趋势线、仪表盘、横向条形对比。
 * 依赖：core/namespace.js、core/utils.js、ui/components/dom.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;

  /* 需要在窗口尺寸变化时重绘的图表登记表 */
  var registry = [];
  var resizeBound = false;

  function bindResize() {
    if (resizeBound) { return; }
    resizeBound = true;
    window.addEventListener('resize', U.debounce(function () {
      registry.forEach(function (entry) {
        if (!entry.node || !document.body.contains(entry.node)) { return; }
        try { entry.fn(); } catch (e) { PHR.warn(PHR.t('chart.renderWarn', '图表重绘失败'), e); }
      });
    }, 220));
  }

  /** 注册一个可重绘的图表 */
  function register(node, fn) {
    registry = registry.filter(function (x) { return x.node !== node && document.body.contains(x.node); });
    registry.push({ node: node, fn: fn });
    bindResize();
  }

  /* ================================================================== *
   * 通用工具
   * ================================================================== */

  /** 取容器可用宽度 */
  function widthOf(container, fallback) {
    var w = container.clientWidth;
    return w && w > 40 ? w : (fallback || 640);
  }

  /** 生成"好看"的刻度范围 */
  function niceScale(min, max, ticks) {
    ticks = ticks || 4;
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log(span / ticks) / Math.LN10));
    var err = (span / ticks) / step;
    if (err >= 7.5) { step *= 10; } else if (err >= 3.5) { step *= 5; } else if (err >= 1.5) { step *= 2; }
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step / 1000; v += step) { out.push(Number(v.toFixed(10))); }
    return { min: lo, max: hi, step: step, ticks: out };
  }

  /** 折线路径（可选平滑） */
  function linePath(pts, smooth) {
    if (!pts.length) { return ''; }
    if (pts.length === 1) { return 'M' + pts[0].x + ',' + pts[0].y; }
    if (!smooth) {
      return pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ',' + p.y; }).join(' ');
    }
    var d = 'M' + pts[0].x + ',' + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i], p1 = pts[i + 1];
      var cx = (p0.x + p1.x) / 2;
      d += ' C' + cx + ',' + p0.y + ' ' + cx + ',' + p1.y + ' ' + p1.x + ',' + p1.y;
    }
    return d;
  }

  /* ================================================================== *
   * 一、折线图
   * ================================================================== */
  /**
   * 渲染折线图。
   * @param {Element} container 目标容器（会被清空）
   * @param {object} cfg {
   *   series: [{ name, color, points: [{x:时间戳或索引, y:数值, label?, meta?}] }],
   *   height, valueFormat, yUnit, xFormat, xTicks,
   *   bands: [{ min, max, level }],         // 正常/警戒区间底纹
   *   references: [{ value, label }],       // 参考线（目标值等）
   *   showPoints, smooth, legend, emptyText
   * }
   */
  function line(container, cfg) {
    if (!container) { return; }
    cfg = cfg || {};
    var render = function () { drawLine(container, cfg); };
    render();
    register(container, render);
  }

  function drawLine(container, cfg) {
    var series = (cfg.series || []).filter(function (s) { return s && s.points && s.points.length; });
    if (!series.length) {
      container.innerHTML = PHR.ui.empty({
        icon: '📉', title: PHR.t('chart.empty.title', '暂无数据'),
        hint: cfg.emptyText || PHR.t('chart.empty.hint', '还没有可用于绘制趋势的记录。'), compact: true
      });
      return;
    }

    var W = widthOf(container, cfg.width);
    var H = cfg.height || 220;
    var pad = { top: 16, right: 18, bottom: 30, left: 48 };
    var innerW = Math.max(10, W - pad.left - pad.right);
    var innerH = Math.max(10, H - pad.top - pad.bottom);

    /* ---- 1. 计算值域 ---- */
    var allY = [], allX = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (typeof p.y === 'number' && !isNaN(p.y)) { allY.push(p.y); }
        allX.push(p.x);
      });
    });
    if (cfg.bands) {
      cfg.bands.forEach(function (b) {
        if (b.min !== null && b.min !== undefined) { allY.push(b.min); }
        if (b.max !== null && b.max !== undefined) { allY.push(b.max); }
      });
    }
    if (cfg.references) {
      cfg.references.forEach(function (r) { if (typeof r.value === 'number') { allY.push(r.value); } });
    }

    if (!allY.length || !allX.length) {
      container.innerHTML = PHR.ui.empty({
        icon: '📉', title: PHR.t('chart.empty.title', '暂无数据'),
        hint: cfg.emptyText || PHR.t('chart.empty.hint', '还没有可用于绘制趋势的记录。'), compact: true
      });
      return;
    }
    var yScale = niceScale(U.min(allY, function (v) { return v; }), U.max(allY, function (v) { return v; }), 4);
    var xMin = U.min(allX), xMax = U.max(allX);
    if (xMin === xMax) { xMin -= 86400000; xMax += 86400000; }

    // 留出上下 6% 的呼吸空间
    var yPad = (yScale.max - yScale.min) * 0.06;
    var y0 = yScale.min - yPad, y1 = yScale.max + yPad;
    var yOf = function (v) { return pad.top + innerH - (v - y0) / (y1 - y0) * innerH; };
    var xOf = function (v) { return pad.left + (v - xMin) / (xMax - xMin) * innerW; };

    /* ---- 2. 组装 SVG ---- */
    var s = [];
    s.push('<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H +
           '" role="img" aria-label="' + dom.esc(cfg.ariaLabel || PHR.t('chart.ariaLabel', '趋势图')) + '">');

    // 底纹（正常区间 / 警戒区间）
    (cfg.bands || []).forEach(function (b) {
      var top = yOf(b.max === null || b.max === undefined ? y1 : b.max);
      var bottom = yOf(b.min === null || b.min === undefined ? y0 : b.min);
      var yy = Math.min(top, bottom), hh = Math.abs(bottom - top);
      if (hh <= 0.5) { return; }
      s.push('<rect class="band-' + (b.level || 'ok') + '" x="' + pad.left + '" y="' + yy.toFixed(1) +
             '" width="' + innerW + '" height="' + hh.toFixed(1) + '" rx="3"/>');
      if (b.label) {
        s.push('<text class="axis-text" x="' + (pad.left + 6) + '" y="' + (yy + 11) + '">' + dom.esc(b.label) + '</text>');
      }
    });

    // 横向网格与 Y 轴刻度
    yScale.ticks.forEach(function (t) {
      if (t < y0 - 0.001 || t > y1 + 0.001) { return; }
      var y = yOf(t);
      s.push('<line class="grid-line" x1="' + pad.left + '" y1="' + y.toFixed(1) +
             '" x2="' + (pad.left + innerW) + '" y2="' + y.toFixed(1) + '"/>');
      s.push('<text class="axis-text" x="' + (pad.left - 8) + '" y="' + (y + 3.5).toFixed(1) +
             '" text-anchor="end">' + dom.esc(formatNum(t, cfg.valueDigits)) + '</text>');
    });

    // 参考线
    (cfg.references || []).forEach(function (r) {
      if (typeof r.value !== 'number') { return; }
      var y = yOf(r.value);
      s.push('<line class="reference" x1="' + pad.left + '" y1="' + y.toFixed(1) +
             '" x2="' + (pad.left + innerW) + '" y2="' + y.toFixed(1) + '"/>');
      s.push('<text class="axis-text" x="' + (pad.left + innerW - 4) + '" y="' + (y - 4).toFixed(1) +
             '" text-anchor="end">' + dom.esc(r.label || '') + '</text>');
    });

    // X 轴刻度
    var xLabels = cfg.xLabels || buildXLabels(xMin, xMax, cfg.xTicks || 5, cfg.xFormat);
    xLabels.forEach(function (t, i) {
      var x = xOf(t.value);
      if (x < pad.left - 1 || x > pad.left + innerW + 1) { return; }
      s.push('<text class="axis-text" x="' + x.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="' +
             (i === 0 ? 'start' : (i === xLabels.length - 1 ? 'end' : 'middle')) + '">' +
             dom.esc(t.label) + '</text>');
    });

    // 数据系列
    series.forEach(function (se, si) {
      var color = se.color || ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'][si % 4];
      var pts = se.points.filter(function (p) { return typeof p.y === 'number' && !isNaN(p.y); })
        .map(function (p) { return { x: xOf(p.x), y: yOf(p.y), raw: p }; });
      if (!pts.length) { return; }

      if (cfg.area !== false && series.length === 1) {
        var areaD = linePath(pts, cfg.smooth) +
          ' L' + pts[pts.length - 1].x + ',' + (pad.top + innerH) +
          ' L' + pts[0].x + ',' + (pad.top + innerH) + ' Z';
        s.push('<path class="area" d="' + areaD + '" fill="' + color + '"/>');
      }

      s.push('<path class="line" d="' + linePath(pts, cfg.smooth) + '" stroke="' + color + '"/>');

      if (cfg.showPoints !== false && pts.length <= 90) {
        pts.forEach(function (p) {
          s.push('<circle class="point" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) +
                 '" r="2.8" fill="' + color + '"/>');
        });
      }
      // 末端强调点
      var last = pts[pts.length - 1];
      s.push('<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) +
             '" r="4.2" fill="' + color + '" stroke="var(--surface)" stroke-width="2"/>');
    });

    // 交互层
    s.push('<line class="crosshair" x1="0" y1="' + pad.top + '" x2="0" y2="' + (pad.top + innerH) +
           '" style="opacity:0"/>');
    var markId = dom.uid('marks');
    s.push('<g id="' + markId + '" style="opacity:0"></g>');
    var hitId = dom.uid('hit');
    s.push('<rect id="' + hitId + '" x="' + pad.left + '" y="' + pad.top + '" width="' + innerW +
           '" height="' + innerH + '" fill="transparent" style="cursor:crosshair"/>');
    s.push('</svg>');

    // 图例
    var legendHtml = '';
    if (cfg.legend !== false && series.length > 1) {
      legendHtml = '<div class="chart-legend">' + series.map(function (se, si) {
        var color = se.color || ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'][si % 4];
        return '<span class="item"><i class="swatch" style="background:' + color + '"></i>' +
               dom.esc(se.name || PHR.t('chart.series', '系列 {n}', { n: si + 1 })) + '</span>';
      }).join('') + '</div>';
    }

    container.innerHTML = '<div class="chart-box">' + s.join('') +
      '<div class="chart-tip" role="status"></div></div>' + legendHtml;

    /* ---- 3. 交互：悬停显示数值 ---- */
    var box = container.querySelector('.chart-box');
    var tip = box.querySelector('.chart-tip');
    var svg = box.querySelector('svg');
    var cross = svg.querySelector('.crosshair');
    var marks = svg.querySelector('#' + markId);
    var hit = svg.querySelector('#' + hitId);

    // 所有系列的 x 值合并后去重排序，用于定位最近的数据点
    var xs = U.unique(allX).sort(function (a, b) { return a - b; });

    function onMove(e) {
      var rect = svg.getBoundingClientRect();
      var scale = W / rect.width;
      var px = (e.clientX - rect.left) * scale;
      var dataX = xMin + (px - pad.left) / innerW * (xMax - xMin);

      var nearest = xs[0], best = Infinity;
      xs.forEach(function (v) {
        var d = Math.abs(v - dataX);
        if (d < best) { best = d; nearest = v; }
      });

      var cx = xOf(nearest);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.style.opacity = 1;

      var rows = [];
      marks.innerHTML = '';
      series.forEach(function (se, si) {
        var p = null;
        se.points.forEach(function (q) { if (q.x === nearest) { p = q; } });
        if (!p || typeof p.y !== 'number') { return; }
        var color = se.color || ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'][si % 4];
        marks.innerHTML += '<circle cx="' + cx.toFixed(1) + '" cy="' + yOf(p.y).toFixed(1) +
          '" r="4.5" fill="' + color + '" stroke="var(--surface)" stroke-width="2"/>';
        rows.push('<div><i class="dot-indicator" style="color:' + color +
          ';display:inline-block;margin-right:5px"></i>' +
          (series.length > 1 ? dom.esc(se.name || '') + ' ' : '') +
          '<span class="v">' + dom.esc(formatNum(p.y, cfg.valueDigits)) + '</span>' +
          (cfg.yUnit ? ' ' + dom.esc(cfg.yUnit) : '') +
          (p.meta ? ' <span class="dim">' + dom.esc(p.meta) + '</span>' : '') + '</div>');
      });
      marks.style.opacity = 1;

      if (!rows.length) { tip.classList.remove('show'); return; }
      tip.innerHTML = '<div class="dim" style="margin-bottom:2px">' +
        dom.esc((cfg.xFormat || defaultXFormat)(nearest)) + '</div>' + rows.join('');
      tip.style.left = (cx / W * 100) + '%';
      var topY = Math.min.apply(null, series.map(function (se) {
        var p = null; se.points.forEach(function (q) { if (q.x === nearest) { p = q; } });
        return p && typeof p.y === 'number' ? yOf(p.y) : innerH;
      }));
      tip.style.top = (topY / H * 100) + '%';
      tip.classList.add('show');
    }

    function onLeave() {
      cross.style.opacity = 0;
      marks.style.opacity = 0;
      tip.classList.remove('show');
    }

    hit.addEventListener('mousemove', onMove);
    hit.addEventListener('mouseleave', onLeave);
    svg.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches[0]) { onMove(e.touches[0]); }
    }, { passive: true });
    svg.addEventListener('touchend', onLeave);
  }

  /** 默认 X 轴标签：按时间戳等分 */
  function buildXLabels(min, max, count, fmt) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var v = min + (max - min) * i / (count - 1);
      out.push({ value: v, label: (fmt || defaultXFormat)(v) });
    }
    return out;
  }

  function defaultXFormat(v) {
    if (typeof v !== 'number') { return String(v); }
    // 时间戳量级 → 按日期显示
    if (v > 100000000000) { return U.fmtDate(v).slice(5); }
    return String(v);
  }

  function formatNum(v, digits) {
    if (v === null || v === undefined) { return ''; }
    if (typeof v !== 'number') { return String(v); }
    if (digits === 0 || Number.isInteger(v) && Math.abs(v) >= 100) { return String(Math.round(v)); }
    return String(Number(v.toFixed(digits === undefined ? 1 : digits)));
  }

  /* ================================================================== *
   * 二、柱状图
   * ================================================================== */
  /**
   * @param {object} cfg { items:[{label, value, color?, meta?}], height, yUnit, valueFormat, horizontal }
   */
  function bar(container, cfg) {
    if (!container) { return; }
    cfg = cfg || {};
    var render = function () { drawBar(container, cfg); };
    render();
    register(container, render);
  }

  function drawBar(container, cfg) {
    var items = (cfg.items || []).filter(function (i) { return i && i.value !== undefined && i.value !== null; });
    if (!items.length) {
      container.innerHTML = PHR.ui.empty({ icon: '📊', title: PHR.t('chart.empty.title', '暂无数据'), compact: true });
      return;
    }

    if (cfg.horizontal !== false && items.length > 6) {
      container.innerHTML = items.map(function (it, i) {
        var max = U.max(items, 'value') || 1;
        var pct = Math.max(2, Math.round(it.value / max * 100));
        var color = it.color || ('var(--c' + ((i % 8) + 1) + ')');
        return '<div class="bar-row"><span class="ellipsis" title="' + dom.esc(it.label) + '">' +
          dom.esc(it.label) + '</span><span class="track"><i style="width:' + pct + '%;background:' + color +
          '"></i></span><span class="val">' + dom.esc(dom.num(it.value, cfg.valueDigits)) +
          (cfg.yUnit ? ' ' + dom.esc(cfg.yUnit) : '') + '</span></div>';
      }).join('');
      return;
    }

    var W = widthOf(container, cfg.width);
    var H = cfg.height || 200;
    var pad = { top: 16, right: 12, bottom: 34, left: 44 };
    var innerW = W - pad.left - pad.right;
    var innerH = H - pad.top - pad.bottom;
    var max = U.max(items, 'value');
    var sc = niceScale(0, max, 4);
    var yOf = function (v) { return pad.top + innerH - v / sc.max * innerH; };
    var slot = innerW / items.length;
    var bw = Math.max(6, Math.min(38, slot * 0.58));

    var s = ['<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '">'];
    sc.ticks.forEach(function (t) {
      var y = yOf(t);
      s.push('<line class="grid-line" x1="' + pad.left + '" y1="' + y.toFixed(1) + '" x2="' + (pad.left + innerW) + '" y2="' + y.toFixed(1) + '"/>');
      s.push('<text class="axis-text" x="' + (pad.left - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + formatNum(t, 0) + '</text>');
    });
    items.forEach(function (it, i) {
      var x = pad.left + slot * i + (slot - bw) / 2;
      var h = Math.max(1, (pad.top + innerH) - yOf(it.value));
      var color = it.color || ('var(--c' + ((i % 8) + 1) + ')');
      s.push('<rect x="' + x.toFixed(1) + '" y="' + yOf(it.value).toFixed(1) + '" width="' + bw.toFixed(1) +
             '" height="' + h.toFixed(1) + '" rx="4" fill="' + color + '"><title>' +
             dom.esc(it.label + '：' + dom.num(it.value, cfg.valueDigits)) + '</title></rect>');
      s.push('<text class="axis-text" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) +
             '" text-anchor="middle">' + dom.esc(U.truncate(it.label, 6)) + '</text>');
    });
    s.push('</svg>');
    container.innerHTML = s.join('');
  }

  /* ================================================================== *
   * 三、环形图
   * ================================================================== */
  /**
   * @param {object} cfg { items:[{label, value, color?}], size, thickness, centerLabel, centerValue }
   */
  function donut(container, cfg) {
    if (!container) { return; }
    cfg = cfg || {};
    var items = (cfg.items || []).filter(function (i) { return i && i.value > 0; });
    if (!items.length) {
      container.innerHTML = PHR.ui.empty({ icon: '🍩', title: PHR.t('chart.empty.title', '暂无数据'), compact: true });
      return;
    }
    var size = cfg.size || 168;
    var th = cfg.thickness || 20;
    var r = (size - th) / 2;
    var c = size / 2;
    var total = U.sum(items, 'value');
    var circ = 2 * Math.PI * r;
    var offset = 0;

    var s = ['<svg class="chart" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" style="max-width:100%">'];
    s.push('<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="' + th + '"/>');
    items.forEach(function (it, i) {
      var frac = it.value / total;
      var len = frac * circ;
      var color = it.color || ('var(--c' + ((i % 8) + 1) + ')');
      s.push('<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="' + color +
             '" stroke-width="' + th + '" stroke-dasharray="' + (len - 2).toFixed(2) + ' ' + (circ - len + 2).toFixed(2) +
             '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + c + ' ' + c + ')">' +
             '<title>' + dom.esc(it.label + '：' + it.value + '（' + Math.round(frac * 100) + '%）') + '</title></circle>');
      offset += len;
    });
    if (cfg.centerValue !== undefined) {
      s.push('<text x="' + c + '" y="' + (c + 2) + '" text-anchor="middle" font-size="' + (size * 0.17) +
             '" font-weight="700" fill="var(--text)">' + dom.esc(cfg.centerValue) + '</text>');
      s.push('<text x="' + c + '" y="' + (c + size * 0.14) + '" text-anchor="middle" font-size="11" fill="var(--text-3)">' +
             dom.esc(cfg.centerLabel || '') + '</text>');
    }
    s.push('</svg>');

    var legend = '<div class="chart-legend" style="flex-direction:column;gap:6px;margin-top:0">' +
      items.map(function (it, i) {
        var color = it.color || ('var(--c' + ((i % 8) + 1) + ')');
        return '<span class="item" style="width:100%"><i class="swatch block" style="background:' + color +
          '"></i><span class="grow">' + dom.esc(it.label) + '</span><span class="dim">' + it.value +
          '（' + Math.round(it.value / total * 100) + '%）</span></span>';
      }).join('') + '</div>';

    container.innerHTML = '<div class="row gap5 wrap" style="align-items:center">' +
      '<div>' + s.join('') + '</div><div class="grow" style="min-width:150px">' + legend + '</div></div>';
  }

  /* ================================================================== *
   * 四、迷你趋势线（返回 HTML 字符串，用于统计卡片）
   * ================================================================== */
  function sparkline(values, opt) {
    opt = opt || {};
    var vals = (values || []).filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    if (vals.length < 2) { return ''; }
    var W = opt.width || 120, H = opt.height || 30;
    var min = U.min(vals), max = U.max(vals);
    var span = (max - min) || 1;
    var color = opt.color || 'var(--primary)';
    var pts = vals.map(function (v, i) {
      return {
        x: i / (vals.length - 1) * (W - 2) + 1,
        y: H - 2 - (v - min) / span * (H - 4)
      };
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var area = d + ' L' + W + ',' + H + ' L0,' + H + ' Z';
    return '<svg class="sparkline" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" preserveAspectRatio="none"><path d="' + area + '" fill="' + color + '" opacity="0.13"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  /* ================================================================== *
   * 五、环形仪表（评分 / 达标率）
   * ================================================================== */
  function gauge(container, cfg) {
    if (!container) { return; }
    cfg = cfg || {};
    var size = cfg.size || 132;
    var th = cfg.thickness || 12;
    var r = (size - th) / 2 - 2;
    var c = size / 2;
    var pct = Math.max(0, Math.min(100, cfg.percent || 0));
    var circ = 2 * Math.PI * r;
    var color = cfg.color || 'var(--primary)';

    container.innerHTML =
      '<svg class="ring" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" style="max-width:100%">' +
        '<circle class="bg" cx="' + c + '" cy="' + c + '" r="' + r + '" stroke-width="' + th + '"/>' +
        '<circle class="fg" cx="' + c + '" cy="' + c + '" r="' + r + '" stroke="' + color + '" stroke-width="' + th +
          '" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' +
          (circ * (1 - pct / 100)).toFixed(1) + '"/>' +
        '<g transform="rotate(90 ' + c + ' ' + c + ')">' +
          '<text x="' + c + '" y="' + (c + 2) + '" text-anchor="middle" font-size="' + (size * 0.22) +
            '" font-weight="700" fill="var(--text)">' + dom.esc(String(cfg.value !== undefined ? cfg.value : pct)) + '</text>' +
          '<text x="' + c + '" y="' + (c + size * 0.17) + '" text-anchor="middle" font-size="11" fill="var(--text-3)">' +
            dom.esc(cfg.label || '') + '</text>' +
        '</g>' +
      '</svg>';
  }

  /* ================================================================== *
   * 六、等级刻度尺（显示当前值落在正常/警戒/危急的哪一段）
   * ================================================================== */
  function scaleBar(value, metric) {
    if (!metric || metric.noThreshold) { return ''; }
    var lo = Math.min(
      metric.normal.min !== null ? metric.normal.min : metric.warn.min,
      metric.warn.min !== null ? metric.warn.min : 0
    );
    var hi = Math.max(
      metric.normal.max !== null ? metric.normal.max : metric.warn.max,
      metric.warn.max !== null ? metric.warn.max : 100
    );
    var pad = (hi - lo) * 0.12 || 1;
    lo -= pad; hi += pad;
    var pos = Math.max(0, Math.min(100, (value - lo) / (hi - lo) * 100));
    var level = PHR.dict.judge(metric.key, value);
    return '<div class="scale" aria-hidden="true">' +
        '<span style="background:var(--danger-soft)"></span>' +
        '<span style="background:var(--warn-soft)"></span>' +
        '<span style="background:var(--ok-soft)"></span>' +
        '<span style="background:var(--warn-soft)"></span>' +
        '<span style="background:var(--danger-soft)"></span>' +
      '</div>' +
      '<div class="scale-marks"><span>' + lo.toFixed(metric.decimals) + '</span>' +
        '<span>' + dom.esc(PHR.t('chart.scale.ref', '参考 {range}', { range: fmtRange(metric.normal, metric.decimals) })) + '</span>' +
        '<span>' + hi.toFixed(metric.decimals) + '</span></div>' +
      '<div class="rel" style="height:0"><div style="position:absolute;left:' + pos.toFixed(1) +
        '%;transform:translateX(-50%);margin-top:-22px" title="' +
        dom.esc(PHR.t('chart.scale.current', '当前值 {value}', { value: value })) + '">' +
        '<span class="badge tone-' + PHR.dict.judgeTone(level) + '">' + dom.esc(dom.num(value, metric.decimals)) + '</span>' +
      '</div></div>';
  }

  function fmtRange(range, digits) {
    if (!range) { return '—'; }
    var a = range.min, b = range.max;
    if (a === null || a === undefined) { return '≤ ' + Number(b).toFixed(digits); }
    if (b === null || b === undefined) { return '≥ ' + Number(a).toFixed(digits); }
    return Number(a).toFixed(digits) + '~' + Number(b).toFixed(digits);
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.ui.chart = {
    line: line,
    bar: bar,
    donut: donut,
    sparkline: sparkline,
    gauge: gauge,
    scaleBar: scaleBar,
    niceScale: niceScale,

    /** 供其它组件复用：给一组数值生成内联 sparkline HTML */
    spark: function (values, opt) { return sparkline(values, opt); }
  };

})(window.PHR);
