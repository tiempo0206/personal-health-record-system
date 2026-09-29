/**
 * ============================================================================
 * 文件：ui/router.js
 * 层：表现层（路由）
 * 职责：基于 location.hash 的前端路由，支持路径参数与查询串。
 *      约定：所有业务视图通过 PHR.registerView() 注册后会自动获得
 *            #/<视图名>、#/<视图名>/<参数1>、#/<视图名>/<参数1>/<参数2> 三条路由。
 *      需要更复杂路径的模块可以调用 PHR.router.add(模式, 处理器)。
 * 依赖：core/namespace.js、core/event-bus.js
 * ============================================================================
 *
 * 路径示例：
 *   #/dashboard                      工作台
 *   #/records                        档案列表
 *   #/records/edit/R000123           编辑某条记录
 *   #/insight/glucose                查看血糖指标详情
 *   #/consent/grant?scope=vital      带查询串
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var routes = [];          // { pattern, segments, handler }
  var current = { path: '', parts: [], view: null, params: {}, query: {} };
  var started = false;
  var listeners = [];

  /* ================================================================== *
   * 一、匹配
   * ================================================================== */
  function parseHash() {
    var raw = String(location.hash || '').replace(/^#/, '');
    if (!raw) { return { path: '', query: {} }; }
    var qIdx = raw.indexOf('?');
    var path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    var queryStr = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
    var query = {};
    queryStr.split('&').forEach(function (kv) {
      if (!kv) { return; }
      var i = kv.indexOf('=');
      var k = i >= 0 ? kv.slice(0, i) : kv;
      var v = i >= 0 ? kv.slice(i + 1) : '';
      try { query[decodeURIComponent(k)] = decodeURIComponent(v); }
      catch (e) { query[k] = v; }
    });
    return { path: path.replace(/^\/+|\/+$/g, ''), query: query };
  }

  function match(pattern, path) {
    var ps = pattern.split('/').filter(Boolean);
    var xs = path.split('/').filter(Boolean);
    if (xs.length < ps.length) { return null; }
    var params = {};
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].charAt(0) === ':') {
        params[ps[i].slice(1)] = xs[i];
      } else if (ps[i] !== xs[i]) {
        return null;
      }
    }
    return { params: params, extra: xs.slice(ps.length) };
  }

  /* ================================================================== *
   * 二、注册
   * ================================================================== */
  /**
   * 注册一条路由。
   * @param {string} pattern 例如 'records/edit/:id'
   * @param {Function} handler (ctx) => void，ctx = { params, query, path, parts }
   */
  function add(pattern, handler) {
    routes.push({
      pattern: pattern.replace(/^\/+|\/+$/g, ''),
      handler: handler,
      order: pattern.split('/').length
    });
    // 更具体的路由优先匹配
    routes.sort(function (a, b) { return b.order - a.order; });
  }

  /* ================================================================== *
   * 三、跳转
   * ================================================================== */
  function go(path, replace) {
    var target = '#' + (String(path || '').charAt(0) === '/' ? path : '/' + path);
    if (location.hash === target) { resolve(); return; }
    if (replace) {
      history.replaceState(null, '', target);
      resolve();
    } else {
      location.hash = target;
    }
  }

  /** 返回上一页（没有历史时回到工作台） */
  function back(fallback) {
    if (history.length > 1) { history.back(); }
    else { go(fallback || '/dashboard', true); }
  }

  /* ================================================================== *
   * 四、解析与派发
   * ================================================================== */
  function resolve() {
    var parsed = parseHash();
    var path = parsed.path || 'dashboard';

    current = { path: path, parts: path.split('/').filter(Boolean), query: parsed.query, view: null, params: {} };

    // 1) 先试自定义路由
    for (var i = 0; i < routes.length; i++) {
      var m = match(routes[i].pattern, path);
      if (m) {
        current.params = m.params;
        current.view = routes[i].pattern;
        routes[i].handler(current);
        emitChange();
        return;
      }
    }

    // 2) 回退到视图路由：#/<viewName>/<p1>/<p2>
    var name = current.parts[0] || 'dashboard';
    var view = PHR.views[name];
    if (!view) {
      var fallback = PHR.views['dashboard'] ? 'dashboard' : Object.keys(PHR.views)[0];
      if (!fallback) { return; }
      current.parts = [fallback];
      current.path = fallback;
      current.view = fallback;
      go('/' + fallback, true);
      return;
    }
    current.view = name;
    current.params = { p1: current.parts[1] || '', p2: current.parts[2] || '' };
    PHR.bus.emit('router:view', { view: view, ctx: current });
    emitChange();
  }

  function emitChange() {
    PHR.bus.emit('route:changed', { path: current.path, view: current.view, params: current.params, query: current.query });
    listeners.forEach(function (fn) {
      try { fn(current); } catch (e) { PHR.warn(PHR.t('router.listenerFail', '路由监听器失败'), e); }
    });
  }

  /* ================================================================== *
   * 五、启动
   * ================================================================== */
  function start() {
    if (started) { return; }
    started = true;
    window.addEventListener('hashchange', resolve);
    resolve();
  }

  /** 强制重新解析当前地址（数据变化后刷新页面用） */
  function reload() { resolve(); }

  /** 订阅路由变化 */
  function onChange(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }

  PHR.router = {
    add: add,
    go: go,
    back: back,
    start: start,
    reload: reload,
    onChange: onChange,
    current: function () { return current; },
    /** 当前是否处于某个视图 */
    is: function (name) { return current.view === name || (current.parts[0] === name); },
    /** 生成一个视图地址 */
    url: function (name, p1, p2) {
      return '#' + [name, p1, p2].filter(Boolean).join('/');
    }
  };

})(window.PHR);
