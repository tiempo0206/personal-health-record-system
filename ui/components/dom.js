/**
 * ============================================================================
 * 文件：ui/components/dom.js
 * 层：表现层（组件）
 * 职责：组件层共用的 DOM / 字符串工具，避免每个组件重复写转义与拼接逻辑。
 * 依赖：core/namespace.js、core/utils.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  var dom = {

    /** 安全取元素：找不到时返回 null，不会抛错 */
    byId: function (id) { return document.getElementById(id); },

    /** HTML 转义（所有插入 innerHTML 的用户数据都必须经过它） */
    esc: U.escapeHtml,

    /** 属性值转义并拼成 `name="value"`；值为 null/undefined/false 时返回空串 */
    attr: function (name, value) {
      if (value === null || value === undefined || value === false) { return ''; }
      if (value === true) { return ' ' + name; }
      return ' ' + name + '="' + U.escapeHtml(value) + '"';
    },

    /** 按条件拼接 class 名 */
    cls: function () {
      var out = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (!a) { continue; }
        if (typeof a === 'string') { out.push(a); }
        else if (typeof a === 'object') {
          Object.keys(a).forEach(function (k) { if (a[k]) { out.push(k); } });
        }
      }
      return out.join(' ');
    },

    /**
     * 由 HTML 字符串创建元素。
     * @param {string} html
     * @param {object} [data] 元素上要绑定的数据，便于事件委托时取用
     */
    el: function (html, data) {
      var node = U.el(html);
      if (node && data) { node.__data = data; }
      return node;
    },

    /** 安全写入 innerHTML */
    setHtml: U.html,

    /** 清空容器 */
    clear: function (target) {
      var node = typeof target === 'string' ? U.$(target) : target;
      if (node) { node.innerHTML = ''; }
      return node;
    },

    /** 事件委托绑定 */
    delegate: function (root, evt, selector, handler) {
      U.on(root, evt, selector, handler);
    },

    /**
     * 收集容器内所有带 [data-action] 的元素，按 action 名绑定点击事件。
     * 这样视图层可以少写很多 addEventListener。
     * @param {Element} root
     * @param {object} map  { actionName: function(e, el, data) }
     */
    /**
     * 给容器挂事件委托：点带 data-action 的元素时调用 map[action]。
     *
     * ⚠️ 同一个容器可以**反复调用** —— 后一次的 map 会并入前一次的，
     *    而底层的委托监听器只挂一次。
     *
     *    这一点很关键：视图局部重绘时常常对同一个元素再次调用
     *    （modules/auth/auth.view.js 的 #auth-root、records.view.js 的
     *    #record-area、timeline.view.js 的时间线区……）。早先每调用一次就
     *    addEventListener 一次，监听器层层叠加 —— 点一下触发 N 次，
     *    表现为"弹窗叠了好几层、要关好几次"、"点一次跳两次页面"。
     */
    actions: function (root, map) {
      if (!root) { return; }
      root.__actionsMap = Object.assign({}, root.__actionsMap, map);
      if (root.__actionsBound) { return; }
      root.__actionsBound = true;
      root.addEventListener('click', function (e) {
        var hit = e.target.closest('[data-action]');
        if (!hit || !root.contains(hit)) { return; }
        var fn = (root.__actionsMap || {})[hit.getAttribute('data-action')];
        if (typeof fn === 'function') {
          e.preventDefault();
          fn.call(hit, e, hit, hit.__data);
        }
      });
    },

    /** 生成一个 DOM id */
    uid: function (prefix) { return (prefix || 'el') + '_' + Math.random().toString(36).slice(2, 8); },

    /** 数字千分位 */
    num: function (v, digits) {
      if (v === null || v === undefined || isNaN(v)) { return '—'; }
      var n = Number(v);
      var s = digits === undefined ? String(n) : n.toFixed(digits);
      var parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    },

    /** 空值占位 */
    or: function (v, placeholder) {
      return (v === null || v === undefined || v === '' || v === false)
        ? (placeholder === undefined ? '—' : placeholder)
        : v;
    },

    /** 把 ['a','b'] 渲染成一串 chip */
    chips: function (list, tone) {
      if (!list || !list.length) { return '<span class="dim">—</span>'; }
      return list.map(function (t) {
        return '<span class="chip' + (tone ? ' tone-' + tone : '') + '">' + U.escapeHtml(t) + '</span>';
      }).join('');
    },

    /**
     * 生成一个「ⓘ」悬停提示标记。
     *
     * 说明性文字不再直接铺在界面上（那是写给开发者看的），
     * 而是收进 title，鼠标移上去才显示 —— 需要的用户看得到，不需要的不被打扰。
     *
     * @param {string} text 提示内容；为空时返回空串，调用处不必判断
     * @param {string} label 无障碍读屏用的说明，默认用 text
     */
    tip: function (text, label) {
      if (!text) { return ''; }
      var t = U.escapeHtml(text);
      return '<span class="tip-mark" title="' + t + '" aria-label="' +
        U.escapeHtml(label || text) + '" role="note">ⓘ</span>';
    },

    /** 滚动到某个元素（用于目录跳转） */
    scrollTo: function (selector) {
      var node = U.$(selector);
      if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    },

    /** 复制文本到剪贴板（带降级方案） */
    copy: function (text) {
      return new Promise(function (resolve) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); },
                                                    function () { resolve(fallback()); });
        } else { resolve(fallback()); }

        function fallback() {
          try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
          } catch (e) { return false; }
        }
      });
    },

    /** 触发浏览器下载（用于导出备份） */
    download: function (filename, content, mime) {
      try {
        var blob = new Blob([content], { type: mime || 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        return true;
      } catch (e) {
        PHR.warn(PHR.t('ui.dom.downloadFail', '下载失败'), e);
        return false;
      }
    },

    /** 让用户选择一个本地文件并读取为文本 */
    pickFile: function (accept) {
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        if (accept) { input.accept = accept; }
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', function () {
          var f = input.files && input.files[0];
          if (!f) { document.body.removeChild(input); resolve(null); return; }
          var reader = new FileReader();
          reader.onload = function () { document.body.removeChild(input); resolve({ name: f.name, text: String(reader.result) }); };
          reader.onerror = function () { document.body.removeChild(input); resolve(null); };
          reader.readAsText(f, 'utf-8');
        });
        input.click();
      });
    }
  };

  PHR.ui.dom = dom;

})(window.PHR);
