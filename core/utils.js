/**
 * ============================================================================
 * 文件：core/utils.js
 * 层：核心基础设施层
 * 职责：与业务无关的纯函数工具集（ID、时间、字符串、数组、对象、DOM 小助手）。
 * 依赖：core/namespace.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ============================ 1. ID 与随机 ============================ */

  U.uid = function (prefix) {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '_' : '') + t + r;
  };

  U.seq = (function () {
    var n = 0;
    return function (prefix) { n += 1; return (prefix || 'S') + String(n).padStart(4, '0'); };
  })();

  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  U.intBetween = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  U.floatBetween = function (min, max, digits) {
    var v = Math.random() * (max - min) + min;
    return Number(v.toFixed(digits === undefined ? 1 : digits));
  };

  /* ============================ 2. 时间与日期 ============================ */

  U.now = function () { return Date.now(); };

  U.today = function () { return U.fmtDate(Date.now()); };

  U.pad2 = function (n) { return String(n).padStart(2, '0'); };

  /** 时间戳 -> 'YYYY-MM-DD' */
  U.fmtDate = function (ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };

  /** 时间戳 -> 'YYYY-MM-DD HH:mm' */
  U.fmtDateTime = function (ts) {
    var d = new Date(ts);
    return U.fmtDate(ts) + ' ' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  /** 时间戳 -> 'YYYY-MM-DD HH:mm:ss' */
  U.fmtFull = function (ts) {
    var d = new Date(ts);
    return U.fmtDateTime(ts) + ':' + U.pad2(d.getSeconds());
  };

  /** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 */
  U.fmtRelative = function (ts) {
    var diff = Date.now() - ts;
    if (diff < 60 * 1000) { return PHR.t('time.justNow', '刚刚'); }
    if (diff < 3600 * 1000) {
      return PHR.t('time.minutesAgo', '{n} 分钟前', { n: Math.floor(diff / 60000) });
    }
    if (diff < 86400 * 1000) {
      return PHR.t('time.hoursAgo', '{n} 小时前', { n: Math.floor(diff / 3600000) });
    }
    if (diff < 30 * 86400 * 1000) {
      return PHR.t('time.daysAgo', '{n} 天前', { n: Math.floor(diff / 86400000) });
    }
    return U.fmtDate(ts);
  };

  /** 'YYYY-MM-DD' -> 时间戳（本地时区） */
  U.parseDate = function (str) {
    if (!str) { return NaN; }
    if (typeof str === 'number') { return str; }
    var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) { return new Date(str).getTime(); }
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  };

  U.daysBetween = function (a, b) {
    return Math.round((U.parseDate(a) - U.parseDate(b)) / 86400000);
  };

  U.addDays = function (ts, days) { return ts + days * 86400000; };

  /** 由出生日期推算年龄 */
  U.ageFrom = function (birth) {
    if (!birth) { return null; }
    var d = new Date(U.parseDate(birth));
    var now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) { age -= 1; }
    return age;
  };

  /** 生成最近 n 天的日期数组（升序，含今天） */
  U.lastDays = function (n) {
    var out = [];
    var base = Date.now();
    for (var i = n - 1; i >= 0; i--) { out.push(U.fmtDate(base - i * 86400000)); }
    return out;
  };

  /* ============================ 3. 字符串 ============================ */

  U.escapeHtml = function (s) {
    if (s === null || s === undefined) { return ''; }
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.truncate = function (s, len) {
    s = String(s || '');
    return s.length > len ? s.slice(0, len) + '…' : s;
  };

  /** 关键字高亮（先转义再包裹 <mark>） */
  U.highlight = function (text, keyword) {
    var safe = U.escapeHtml(text);
    if (!keyword) { return safe; }
    var k = U.escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(k, 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
  };

  /** 脱敏：保留头尾，中间打码 */
  U.mask = function (value, head, tail) {
    var s = String(value || '');
    head = head === undefined ? 3 : head;
    tail = tail === undefined ? 2 : tail;
    if (s.length <= head + tail) { return s[0] + '***'; }
    return s.slice(0, head) + '****' + s.slice(-tail);
  };

  /** 中文姓名脱敏：张三 -> 张* */
  U.maskName = function (name) {
    var s = String(name || '');
    if (s.length <= 1) { return s; }
    return s[0] + '*'.repeat(s.length - 1);
  };

  U.slug = function (s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, '-');
  };

  /* ============================ 4. 数组与对象 ============================ */

  U.clone = function (o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); };

  U.groupBy = function (arr, keyFn) {
    return (arr || []).reduce(function (acc, item) {
      var k = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  };

  U.unique = function (arr) { return Array.from(new Set(arr || [])); };

  U.sortBy = function (arr, keyFn, desc) {
    return (arr || []).slice().sort(function (a, b) {
      var ka = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
      var kb = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
      if (ka === kb) { return 0; }
      var r = ka > kb ? 1 : -1;
      return desc ? -r : r;
    });
  };

  /**
   * 把"取值方式"统一成函数。
   * 允许三种写法：
   *   pickFn(function)  —— 直接当取值函数用
   *   pickFn('value')   —— 取对象的某个属性
   *   pickFn()          —— 元素本身就是数值
   * 这样 U.sum(items, 'value') 与 U.sum(nums) 都能正确工作。
   */
  function picker(keyFn) {
    if (typeof keyFn === 'function') { return keyFn; }
    if (typeof keyFn === 'string') {
      return function (x) { return (x === null || x === undefined) ? undefined : x[keyFn]; };
    }
    return function (x) { return x; };
  }

  U.sum = function (arr, keyFn) {
    var get = picker(keyFn);
    return (arr || []).reduce(function (s, x) {
      var v = get(x);
      return s + (typeof v === 'number' && !isNaN(v) ? v : 0);
    }, 0);
  };

  U.avg = function (arr, keyFn) {
    if (!arr || !arr.length) { return 0; }
    return U.sum(arr, keyFn) / arr.length;
  };

  U.min = function (arr, keyFn) {
    var get = picker(keyFn);
    return (arr || []).reduce(function (m, x) {
      var v = get(x);
      if (typeof v !== 'number' || isNaN(v)) { return m; }
      return m === null || v < m ? v : m;
    }, null);
  };

  U.max = function (arr, keyFn) {
    var get = picker(keyFn);
    return (arr || []).reduce(function (m, x) {
      var v = get(x);
      if (typeof v !== 'number' || isNaN(v)) { return m; }
      return m === null || v > m ? v : m;
    }, null);
  };

  U.picker = picker;

  U.chunk = function (arr, size) {
    var out = [];
    for (var i = 0; i < (arr || []).length; i += size) { out.push(arr.slice(i, i + size)); }
    return out;
  };

  /** 深合并（仅对象） */
  U.merge = function (base, patch) {
    var out = U.clone(base) || {};
    Object.keys(patch || {}).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) &&
          out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = U.merge(out[k], patch[k]);
      } else {
        out[k] = U.clone(patch[k]);
      }
    });
    return out;
  };

  U.isEmpty = function (o) {
    if (o === null || o === undefined) { return true; }
    if (typeof o === 'string') { return o.trim() === ''; }
    if (Array.isArray(o)) { return o.length === 0; }
    if (typeof o === 'object') { return Object.keys(o).length === 0; }
    return false;
  };

  /* ============================ 5. 函数控制 ============================ */

  U.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  };

  U.throttle = function (fn, wait) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last < (wait || 200)) { return; }
      last = now;
      return fn.apply(this, arguments);
    };
  };

  /* ============================ 6. DOM 助手 ============================ */

  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /** 由 HTML 字符串创建元素 */
  U.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };

  /** 安全写入 innerHTML */
  U.html = function (target, html) {
    var node = typeof target === 'string' ? U.$(target) : target;
    if (node) { node.innerHTML = html; }
    return node;
  };

  /**
   * 安全写入 textContent。
   * 与 U.html 一样：元素不存在时静默跳过，而不是抛
   * "Cannot set properties of null"。
   *
   * 为什么需要这两个函数：视图里的异步回调（setTimeout、Promise.then、
   * 路由切换过程中）可能在页面已经切走之后才执行，此时它想写的元素
   * 已经不在 DOM 里了。直接写 `U.$('#x').innerHTML = ...` 就会抛错，
   * 而且是**异步抛出的**，外面的 try/catch 拦不到，只会在控制台刷屏。
   * 这类"目标元素可能已消失"的写入一律走这两个函数。
   */
  U.text = function (target, text) {
    var node = typeof target === 'string' ? U.$(target) : target;
    if (node) { node.textContent = text; }
    return node;
  };

  /** 取词助手：替代各文件里重复的局部 L/T 函数 */
  U.t = function (key, zh, params) {
    return (PHR.i18n && PHR.i18n.t) ? PHR.i18n.t(key, zh, params) : zh;
  };

  /**
   * 把 "{ ok, errors }" 风格的校验结果统一转成列表。
   * errors 可以是对象、数组或字符串。
   */
  U.errorList = function (errors) {
    if (!errors) { return { ok: true, errors: {}, list: [] }; }
    var list = [];
    if (typeof errors === 'string') {
      list.push(errors);
    } else if (Array.isArray(errors)) {
      list = errors.slice();
    } else if (typeof errors === 'object') {
      Object.keys(errors).forEach(function (k) { list.push(errors[k]); });
    }
    return { ok: list.length === 0, errors: errors, list: list };
  };

  /**
   * 安全写审计日志。
   * 自动判空 PHR.audit && PHR.audit.log，避免各调用处重复守卫。
   */
  U.audit = function (entry) {
    if (PHR.audit && PHR.audit.log) {
      try { PHR.audit.log(entry); } catch (e) { PHR.warn(PHR.t('audit.warn.writeFail', '审计日志写入失败'), e); }
    }
  };

  U.on = function (target, evt, selOrFn, maybeFn) {
    var node = typeof target === 'string' ? U.$(target) : target;
    if (!node) { return; }
    if (typeof selOrFn === 'function') {
      node.addEventListener(evt, selOrFn);
    } else {
      node.addEventListener(evt, function (e) {
        var hit = e.target.closest(selOrFn);
        if (hit && node.contains(hit)) { maybeFn.call(hit, e, hit); }
      });
    }
  };

  /** 读取表单容器内所有 [name] 控件的值 */
  U.readForm = function (root) {
    var node = typeof root === 'string' ? U.$(root) : root;
    var out = {};
    if (!node) { return out; }
    U.$$('[name]', node).forEach(function (f) {
      if (f.type === 'checkbox') { out[f.name] = f.checked; }
      else if (f.type === 'radio') { if (f.checked) { out[f.name] = f.value; } }
      else if (f.multiple) {
        out[f.name] = Array.prototype.slice.call(f.selectedOptions).map(function (o) { return o.value; });
      } else { out[f.name] = f.value; }
    });
    return out;
  };

  /* ============================ 7. 颜色 ============================ */

  U.hashColor = function (str) {
    var h = 0;
    for (var i = 0; i < String(str).length; i++) {
      h = (h * 31 + String(str).charCodeAt(i)) % 360;
    }
    return 'hsl(' + h + ', 62%, 48%)';
  };

})(window.PHR);
