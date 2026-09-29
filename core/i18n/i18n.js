/**
 * ============================================================================
 * 文件：core/i18n/i18n.js
 * 层：核心基础设施层（国际化引擎）
 * 职责：提供中英双语切换能力。
 *
 *   ┌─ 核心设计：t(key, 中文兜底) ────────────────────────────────────┐
 *   │ 本项目的中文文案是**内联在代码里**的（约 7200 行、82 个文件），   │
 *   │ 一次性全部抽成词条表既不现实、风险也高。因此采用"兜底式"设计：    │
 *   │                                                                  │
 *   │     t('nav.records', '健康档案')                                 │
 *   │        ↑ 词条键        ↑ 中文兜底（原样保留）                    │
 *   │                                                                  │
 *   │ · 英文词条存在 → 显示英文                                        │
 *   │ · 英文词条缺失 → 自动显示中文兜底，**不会出现空白或 [missing]**  │
 *   │ · 因此可以**逐步翻译**：任何时候加一条 en-US 词条就多一处英文，    │
 *   │   没加的照常显示中文，系统始终可用。                             │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 *   另外，`PHR.dict` 的 13 张字典表与记录类型/体征指标的名称也走同一套词条，
 *   由本文件提供 dictName() / termName() 供字典层调用 ——
 *   这一层的杠杆最大：改一处，全站的列表、图表、徽章、筛选器、表单下拉
 *   会一起变成英文。
 *
 * 依赖：core/namespace.js、core/utils.js、core/store.js
 * ============================================================================
 *
 * 语言的决定顺序（detect）：
 *   ① URL 上的 ?lang=xx      ← index_enUS.html 用这个参数，每次启动都强制英文
 *   ② 用户上次在界面里的选择   ← 持久化在本地，切换后一直有效
 *   ③ 默认 zh-CN
 *
 * 注意 ①与②的区别：?lang= 只在**本次会话**生效、不写回偏好，
 * 这样"英文入口"永远开英文，而默认入口尊重你上次在界面里的选择。
 *
 * 【为什么第 ③ 位不再是浏览器语言】
 *   原来这里是 navigator.language。问题是它跟随的并非"区域"，而是操作系统的
 *   **显示语言**：在"显示语言 English + 区域中国"的机器上（公司统一镜像里很
 *   常见）它返回 en-US，于是默认入口打开就是英文，与英文入口毫无区别，
 *   中文入口形同虚设。
 *
 *   本项目是中文演示系统，默认入口就应当是中文。要英文请走 index_enUS.html
 *   或 启动网站_enUS.bat —— 入口与语言一一对应，不再靠机器环境猜。
 *
 *   入口对应关系：
 *     index.html        （启动网站.bat）      默认，中文
 *     index_enUS.html   （启动网站_enUS.bat） 强制英文
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /** 支持的语种 */
  var LOCALES = [
    { key: 'zh-CN', name: '简体中文', short: '中', htmlLang: 'zh-CN' },
    { key: 'en-US', name: 'English', short: 'EN', htmlLang: 'en' }
  ];
  var DEFAULT_LOCALE = 'zh-CN';
  var PREF_KEY = 'locale';

  /** 当前语言 */
  var current = DEFAULT_LOCALE;
  /** 本次会话是否被 ?lang= 强制指定 */
  var forced = null;

  /* ================================================================== *
   * 一、词条表
   * ================================================================== */
  var bundles = {};        // { 'zh-CN': {...}, 'en-US': {...} }

  function bundle(key) {
    return bundles[key || current] || {};
  }

  /** 注册一个语种的词条（由 core/i18n/*.js 调用） */
  function register(localeKey, entries) {
    bundles[localeKey] = Object.assign(bundles[localeKey] || {}, entries || {});
    return bundles[localeKey];
  }

  /* ================================================================== *
   * 二、取词
   * ================================================================== */
  /**
   * 取一条 UI 文案。
   * @param {string} key      词条键，约定形如 'nav.records' / 'btn.save'
   * @param {string} fallback 中文兜底（即源码里原本的中文，原样传进来即可）
   * @param {object} params   插值参数，词条里写 {name} 即可被替换
   * @returns {string}
   */
  function t(key, fallback, params) {
    var s = bundle()[key];
    if (s === undefined || s === null) { s = fallback; }
    if (s === undefined || s === null) { s = key; }
    return interpolate(s, params);
  }

  /**
   * 取字典项名称。字典层的唯一入口，全站列表/徽章/下拉都经过它。
   * @param {string} group   字典组名（gender / severity / recordType / metric …）
   * @param {string} key     字典项的 key
   * @param {string} fallback 中文名
   */
  function dictName(group, key, fallback) {
    if (!group || !key) { return fallback; }
    var k = 'dict.' + group + '.' + key;
    var s = bundle()[k];
    return (s === undefined || s === null || s === '') ? fallback : s;
  }

  /** 取词条表里是否存在某键（用于覆盖率统计） */
  function has(key) { return bundle()[key] !== undefined; }

  /** 简单插值：把 {name} 换成 params.name */
  function interpolate(s, params) {
    if (!params || typeof s !== 'string') { return s; }
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return params[k] === undefined ? m : String(params[k]);
    });
  }

  /* ================================================================== *
   * 三、切换语言
   * ================================================================== */
  /**
   * 切换语言并全站生效。
   * @param {string} localeKey 'zh-CN' | 'en-US'
   * @param {object} opt { persist: 是否写回用户偏好（默认 true）, silent: 不弹提示 }
   */
  function setLocale(localeKey, opt) {
    opt = opt || {};
    if (!LOCALES.some(function (l) { return l.key === localeKey; })) { return false; }
    if (localeKey === current) { return true; }

    current = localeKey;
    if (opt.persist !== false) { persist(localeKey); }
    applyToDocument();

    PHR.bus.emit('locale:changed', { locale: current });
    PHR.log(PHR.t('i18n.log.switched', '语言已切换为 {lang}', { lang: current }));

    if (!opt.silent) {
      PHR.bus.emit('toast', {
        type: 'info', icon: '🌐',
        message: current === 'en-US'
          ? PHR.t('i18n.switchedToEn', 'Language switched to English')
          : PHR.t('i18n.switchedToZh', '已切换为简体中文'),
        detail: PHR.t('i18n.partialNote', '部分内容仍在翻译中，未覆盖处会显示中文原文。')
      });
    }
    return true;
  }

  /** 在两种语言间切换 */
  function toggle() {
    setLocale(current === 'zh-CN' ? 'en-US' : 'zh-CN');
  }

  function persist(localeKey) {
    // 优先写进用户偏好（体验保障模块）；模块未加载或尚未识别 locale 项时
    // 退回通用存储。无论偏好写入是否成功，都留一份副本到通用存储，供
    // 启动早期（preference 模块加载前）读取，避免 seed.js 跑在默认中文上。
    var ok = false;
    try {
      if (PHR.ux && PHR.ux.preference && PHR.ux.preference.set) {
        ok = PHR.ux.preference.set('locale', localeKey);
      }
    } catch (e) { /* 忽略 */ }
    PHR.store.write(PREF_KEY, localeKey);
    return ok;
  }

  function readPersisted() {
    try {
      if (PHR.ux && PHR.ux.preference && PHR.ux.preference.get) {
        var v = PHR.ux.preference.get('locale');
        if (v) { return v; }
      }
    } catch (e) { /* 忽略 */ }
    return PHR.store.read(PREF_KEY, null);
  }

  /** 把语言写到 <html> 上，供 CSS 与无障碍使用 */
  function applyToDocument() {
    var loc = LOCALES.filter(function (l) { return l.key === current; })[0] || LOCALES[0];
    var el = document.documentElement;
    el.setAttribute('lang', loc.htmlLang);
    el.setAttribute('data-locale', current);
  }

  /* ================================================================== *
   * 四、语言探测
   * ================================================================== */
  /** 从 URL 取 ?lang= 参数（英文启动器用这个） */
  function fromQuery() {
    try {
      var m = String(location.search || '').match(/[?&]lang=([^&]+)/i);
      if (!m) { return null; }
      var v = decodeURIComponent(m[1]);
      // 允许 en / en-US / en_US 等写法
      if (/^en/i.test(v)) { return 'en-US'; }
      if (/^zh/i.test(v)) { return 'zh-CN'; }
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /** 决定初始语言。由 core/boot.js 在启动时调用一次。 */
  function detect() {
    var q = fromQuery();
    if (q) {
      forced = q;
      current = q;
      applyToDocument();
      return current;      // 注意：不写回偏好，保证"英文入口每次都是英文"
    }
    var p = readPersisted();
    if (p && LOCALES.some(function (l) { return l.key === p; })) {
      current = p;
    } else {
      /* 不跟随浏览器语言 —— 理由见文件头「为什么第 ③ 位不再是浏览器语言」 */
      current = DEFAULT_LOCALE;
    }
    applyToDocument();
    return current;
  }

  /* ================================================================== *
   * 五、覆盖率（诚实展示翻译进度）
   * ================================================================== */
  /**
   * 统计英文字典层词条的覆盖情况。
   * 不做"假装全部翻译好了"的事 —— 界面上直接告诉用户还有多少是中文。
   */
  function coverage() {
    var groups = ['gender', 'bloodType', 'maritalStatus', 'familyRelation', 'diseaseCategory',
                  'severity', 'allergenType', 'allergyReaction', 'medFrequency', 'medRoute',
                  'department', 'hospital', 'auditAction', 'consentScope', 'authFactor',
                  'communityBoard', 'recordType', 'metric'];
    var total = 0, done = 0;

    groups.forEach(function (g) {
      var list = dictGroup(g);
      (list || []).forEach(function (item) {
        total++;
        if (dictName(g, item.key, '') !== '') { done++; }
      });
    });

    var uiTotal = Object.keys(bundle('en-US')).length;
    return {
      locale: current,
      dictTotal: total,
      dictTranslated: current === 'zh-CN' ? total : done,
      dictPercent: total ? Math.round((current === 'zh-CN' ? total : done) / total * 100) : 0,
      uiEntries: uiTotal,
      // 中文环境下无需翻译
      isDefault: current === 'zh-CN',
      forced: forced
    };
  }

  /** 取某个字典组（供覆盖率统计用，避免在这里硬编码字典位置） */
  function dictGroup(g) {
    var D = PHR.dict;
    switch (g) {
      case 'recordType': return D.recordTypes;
      case 'metric': return D.metrics;
      default: return D[g];
    }
  }

  /* ================================================================== *
   * 六、便捷判断
   * ================================================================== */
  function isZh() { return current === 'zh-CN'; }
  function isEn() { return current === 'en-US'; }

  /** 按语言二选一：`pick('中文', 'English')` */
  function pick(zh, en) { return current === 'zh-CN' ? zh : en; }

  /* ================================================================== *
   * 六之二、尽早应用 ?lang=
   * ------------------------------------------------------------------
   * 英文启动器传的 ?lang=en-US 必须**在任何模块求值 PHR.t() 之前**生效。
   *
   * 为什么：完整的 detect() 在 core/boot.js 里跑，而 boot.js 是最后一个
   * 加载的脚本。如果某个模块在**加载阶段**（而非渲染阶段）就调用 PHR.t()
   * 并把结果存进常量，那时 current 还是默认的 zh-CN，它会永久冻结成中文，
   * 后面再切语言也不会变。
   *
   * 这里在 i18n.js 加载完的当下先把 ?lang= 应用掉，覆盖启动器场景
   * （不需要 store，也不需要偏好模块）。完整的 detect() 稍后仍会跑一次，
   * 用于覆盖"用户上次的选择"与"浏览器语言"两个来源。
   *
   * ⚠️ 写模块代码时仍须遵循：**取词一律发生在渲染/调用时，
   *    不要放进加载期求值的常量**（否则会绕过本机制）。
   * ------------------------------------------------------------------ */
  (function applyQueryLocaleEarly() {
    var q = fromQuery();
    if (!q) { return; }
    forced = q;
    current = q;
    applyToDocument();
  })();

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.i18n = {
    LOCALES: LOCALES,
    DEFAULT: DEFAULT_LOCALE,

    register: register,
    t: t,
    dictName: dictName,
    has: has,

    current: function () { return current; },
    setLocale: setLocale,
    toggle: toggle,
    detect: detect,
    applyToDocument: applyToDocument,
    fromQuery: fromQuery,

    coverage: coverage,
    isZh: isZh,
    isEn: isEn,
    pick: pick,

    /** 供调试：列出当前语种已注册的词条数 */
    stats: function () {
      return Object.keys(bundles).reduce(function (acc, k) {
        acc[k] = Object.keys(bundles[k]).length;
        return acc;
      }, {});
    }
  };

})(window.PHR);
