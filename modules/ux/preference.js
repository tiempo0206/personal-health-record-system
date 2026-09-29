/**
 * ============================================================================
 * 文件：modules/ux/preference.js
 * 层：业务模块层（体验保障 —— 模块 8）
 * 职责：集中管理"看得清、看得舒服、不眩晕"的个人偏好设置，并把结果写到
 *      <html> 的 data-* 属性上，由 ui/styles/theme.css 里已有的 CSS 变量覆盖生效。
 * 依赖：core/namespace.js、core/utils.js、core/store.js、core/models.js、
 *      core/event-bus.js、core/dict.js、PHR.audit（可选）、PHR.session（可选）
 * ============================================================================
 *
 * 为什么这些设置属于「体验保障」而不是简单的"皮肤"：
 *   ① 可读性：字号与对比度直接决定低视力用户能否看清血压、血糖这类关键数字；
 *   ② 无障碍：字号可调、对比度可调是 WCAG 明确要求"由用户控制"的两项；
 *   ③ 减少动效：前庭功能敏感人群会因页面过渡与动画产生眩晕、恶心，
 *      "减少动态效果"是操作系统级无障碍选项在 Web 中的对应实现；
 *   ④ 提醒敏感度与默认落地页决定用户能否长期坚持记录 —— 属于"用得下去"
 *      的保障手段，而不是装饰性选项。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ================================================================== *
   * 一、默认值与合法取值
   * ================================================================== */
  var DEFAULTS = {
    theme: 'light',            // light | dark | auto
    fontSize: 'normal',        // normal | large | xlarge
    density: 'comfortable',    // comfortable | compact
    contrast: 'normal',        // normal | high
    motion: 'normal',          // normal | reduced
    homeView: 'dashboard',     // 登录后默认落地页（任意已注册视图名）
    alertThreshold: 'warning', // ok | warning | critical，健康洞察提醒的敏感度
    weeklyReport: true,        // 是否在站内展示每周健康小结
    locale: null               // zh-CN | en-US | null（未指定时由浏览器语言决定）
  };

  var HOME_FALLBACK = 'dashboard';

  var ALLOWED = {
    theme: ['light', 'dark', 'auto'],
    fontSize: ['normal', 'large', 'xlarge'],
    density: ['comfortable', 'compact'],
    contrast: ['normal', 'high'],
    motion: ['normal', 'reduced'],
    alertThreshold: ['ok', 'warning', 'critical'],
    weeklyReport: [true, false],
    locale: ['zh-CN', 'en-US', null]
  };

  /* 字段描述表：界面按 group 分组渲染，因此新增偏好项只需改这一处 */
  var FIELDS = [
    { key: 'theme', label: '主题外观', group: 'appearance', type: 'segmented',
      options: [{ key: 'light', name: '浅色' }, { key: 'dark', name: '深色' }, { key: 'auto', name: '跟随系统' }],
      hint: '「跟随系统」会实时匹配操作系统的深浅色设置，适合白天夜间自动切换设备主题的用户。' },
    { key: 'fontSize', label: '界面字号', group: 'appearance', type: 'segmented',
      options: [{ key: 'normal', name: '标准' }, { key: 'large', name: '大' }, { key: 'xlarge', name: '特大' }],
      hint: '字号会同时放大正文、表格与图表坐标轴，视力不佳或使用大屏远距离阅读时建议调大。' },
    { key: 'density', label: '信息密度', group: 'appearance', type: 'segmented',
      options: [{ key: 'comfortable', name: '宽松' }, { key: 'compact', name: '紧凑' }],
      hint: '紧凑模式收窄行高与留白，一屏能看到更多记录，适合需要频繁翻阅长列表的场景。' },
    { key: 'contrast', label: '对比度', group: 'appearance', type: 'segmented',
      options: [{ key: 'normal', name: '标准' }, { key: 'high', name: '高对比' }],
      hint: '高对比模式加深边框与次要文字颜色，弱视、老花或强光环境下更容易分辨。' },
    { key: 'motion', label: '动效强度', group: 'appearance', type: 'segmented',
      options: [{ key: 'normal', name: '标准' }, { key: 'reduced', name: '减少动效' }],
      hint: '减少动效会关闭页面切换、图表与弹窗的过渡动画，可避免前庭功能敏感人群产生眩晕。' },
    { key: 'homeView', label: '登录后默认落地页', group: 'appearance', type: 'select',
      options: [], hint: '登录成功后自动打开的页面，候选项来自系统当前已注册的全部视图。' },
    { key: 'alertThreshold', label: '提醒敏感度', group: 'alerts', type: 'segmented',
      options: [{ key: 'ok', name: '全部提醒' }, { key: 'warning', name: '仅警戒以上' }, { key: 'critical', name: '仅危急' }],
      hint: '决定健康洞察在什么级别才提醒你：全部提醒最细致，仅危急最安静。' },
    { key: 'weeklyReport', label: '每周健康小结', group: 'alerts', type: 'switch',
      label2: '在每周首次打开时用站内提醒展示上周的变化与建议', hint: '' }
  ];

  var LABELS = FIELDS.reduce(function (m, f) { m[f.key] = f.label; return m; }, {});

  /* ================================================================== *
   * 二、存取：一个用户一行记录，写在 PHR.db.prefs
   * ================================================================== */
  function currentUserId() {
    var u = PHR.session && PHR.session.currentUser ? PHR.session.currentUser() : null;
    return u && u.id ? u.id : '';
  }

  function rowOf(uid) {
    var rows = PHR.db.prefs.raw();
    for (var i = 0; i < rows.length; i++) { if (rows[i].userId === uid) { return rows[i]; } }
    return null;
  }

  /** 把一行存储记录归一化成完整的偏好对象（补默认值、兼容旧字段、丢弃非法值） */
  function normalize(row) {
    row = row || {};
    var out = U.merge(DEFAULTS, {});
    Object.keys(DEFAULTS).forEach(function (k) {
      if (row[k] !== undefined && row[k] !== null) { out[k] = row[k]; }
    });
    // 兼容早期示例数据里的布尔字段：reduceMotion / highContrast
    if (row.contrast === undefined) { out.contrast = row.highContrast ? 'high' : 'normal'; }
    if (row.motion === undefined) { out.motion = row.reduceMotion ? 'reduced' : 'normal'; }
    if (!isValid('homeView', out.homeView)) { out.homeView = HOME_FALLBACK; }
    Object.keys(ALLOWED).forEach(function (k) {
      if (ALLOWED[k].indexOf(out[k]) < 0) { out[k] = DEFAULTS[k]; }
    });
    return out;
  }

  /** 登录后默认落地页的候选项：直接取当前已注册且可导航的视图，新增模块无需改本文件 */
  function homeOptions() {
    var list = (PHR.navViews ? PHR.navViews() : []).filter(function (v) { return v.name !== 'doctor'; })
      // 视图名沿用外壳的约定 view.<视图名>.title，语言切换后下拉项跟着变
      .map(function (v) { return { key: v.name, name: v.icon + ' ' + PHR.t('view.' + v.name + '.title', v.title) }; });
    return list.length ? list : [{ key: HOME_FALLBACK, name: '📊 ' + PHR.t('view.dashboard.title', '工作台') }];
  }

  /**
   * 带动态候选项的完整字段表（label / hint / 选项显示名按当前语言取词）。
   * ⚠️ FIELDS 里的中文在**模块加载时**求值，那时语言尚未探测（core/boot.js 才调用
   *    i18n.detect()），所以取词必须放到这里按当前语言做，切换语言才会立即生效。
   *    存储 key 与取值（light/dark/normal/…）一律原样透传，不做任何翻译。
   */
  function fields() {
    var out = FIELDS.map(function (f) {
      var item = U.clone(f);
      item.label = PHR.t('pref.' + f.key + '.label', f.label);
      if (f.label2) { item.label2 = PHR.t('pref.' + f.key + '.label2', f.label2); }
      if (f.hint) { item.hint = PHR.t('pref.' + f.key + '.hint', f.hint); }
      item.options = (f.options || []).map(function (o) {
        var opt = U.clone(o);
        opt.name = PHR.t('pref.' + f.key + '.opt.' + o.key, o.name);
        return opt;
      });
      return item;
    });
    return out.map(function (item) {
      return item.key === 'homeView' ? U.merge(item, { options: homeOptions() }) : item;
    });
  }

  function isValid(key, value) {
    if (key === 'homeView') {
      return typeof value === 'string' && value !== '' &&
        (value === HOME_FALLBACK || !!(PHR.views && PHR.views[value]));
    }
    var list = ALLOWED[key];
    return !!list && list.indexOf(value) >= 0;
  }

  /* ================================================================== *
   * 三、对外读写
   * ================================================================== */

  /** 全部偏好（副本） */
  function all() {
    var uid = currentUserId();
    var row = rowOf(uid);
    // 未登录（登录页 / 医生访客）时沿用上一位用户留下的偏好镜像，避免观感跳变
    if (!row && !uid) { row = PHR.store.read('prefs.mirror', null); }
    return normalize(row);
  }

  /** 读取单项；不传 key 时等价于 all() */
  function get(key) {
    var p = all();
    return key ? p[key] : p;
  }

  function persist(patch) {
    var uid = currentUserId();
    var row = rowOf(uid);
    if (row) { PHR.db.prefs.update(row.id, patch); }
    // 未登录时不建"空 userId"的行，只更新镜像，避免账号表与偏好表出现无主记录
    else if (uid) { PHR.db.prefs.insert(Object.assign({ userId: uid }, patch)); }
    // 镜像：登录页与医生访客视图读它，保证登录前后观感一致
    PHR.store.write('prefs.mirror', normalize(Object.assign({}, all(), patch)));
  }

  /**
   * 修改一项偏好并立即生效。
   * @param {string} key
   * @param {*} value
   * @param {object} [opt] { silent:true 时不写审计日志，用于内部降级场景 }
   * @returns {boolean} 是否写入成功（取值非法时返回 false）
   */
  function set(key, value, opt) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
      PHR.warn(PHR.t('ux.pref.warn.unknown', '未知偏好项：{key}', { key: key }));
      return false;
    }
    if (!isValid(key, value)) {
      PHR.warn(PHR.t('ux.pref.warn.invalid', '偏好项取值非法：{key} = {value}', { key: key, value: value }));
      return false;
    }
    var before = get(key);
    var patch = {};
    patch[key] = value;
    persist(patch);
    apply();
    if (before !== value && !(opt && opt.silent)) {
      audit(PHR.t('pref.audit.changed', '修改「{label}」：{from} → {to}',
        { label: labelOf(key), from: valueName(key, before), to: valueName(key, value) }), key);
    }
    return true;
  }

  /** 恢复默认值；传 key 只恢复该项 */
  function reset(key) {
    if (key) { return set(key, DEFAULTS[key]); }
    persist(U.clone(DEFAULTS));
    apply();
    audit(PHR.t('pref.audit.resetAll', '恢复全部偏好设置为默认值'), '*');
    return true;
  }

  /* ================================================================== *
   * 四、生效：写到 <html> 的 data-* 属性上
   * ================================================================== */
  var mq = null;
  var DENSITY_TOKENS = { '--sp-3': '10px', '--sp-4': '12px', '--sp-5': '14px', '--sp-6': '18px' };

  function systemPrefersDark() {
    if (!mq) {
      try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { mq = null; }
    }
    return !!(mq && mq.matches);
  }

  /**
   * 把当前偏好落到文档根元素。
   * theme 为 auto 时按操作系统设置解析成 light / dark 后再写入，
   * 其余属性直接写，theme.css 中已有对应的变量覆盖规则。
   */
  function apply() {
    var p = all();
    var root = document.documentElement;
    var resolved = p.theme === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : p.theme;

    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-fontsize', p.fontSize);
    root.setAttribute('data-contrast', p.contrast);
    root.setAttribute('data-motion', p.motion);
    root.setAttribute('data-density', p.density);

    // 行密度：theme.css 未提供对应令牌，这里直接收紧间距变量（不新增任何 CSS 类）
    Object.keys(DENSITY_TOKENS).forEach(function (token) {
      if (p.density === 'compact') { root.style.setProperty(token, DENSITY_TOKENS[token]); }
      else { root.style.removeProperty(token); }
    });

    PHR.bus.emit('pref:applied', { prefs: p, theme: resolved });
    return p;
  }

  /** 在浅色 / 深色之间切换（顶栏的 🌓 按钮直接调用） */
  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    set('theme', next);
    return next;
  }

  /** theme 为 auto 时跟随系统设置实时切换 */
  function watchSystemTheme() {
    if (!mq) { return; }
    var handler = function () { if (get('theme') === 'auto') { apply(); } };
    if (mq.addEventListener) { mq.addEventListener('change', handler); }
    else if (mq.addListener) { mq.addListener(handler); }
  }

  /* ================================================================== *
   * 五、文案与审计
   * ================================================================== */
  /** 偏好的显示名（按当前语言取词，存储 key 本身不翻译） */
  function labelOf(key) { return LABELS[key] ? PHR.t('pref.' + key + '.label', LABELS[key]) : key; }

  function valueName(key, value) {
    var f = fields().filter(function (x) { return x.key === key; })[0];
    if (f) {
      var hit = (f.options || []).filter(function (o) { return o.key === value; })[0];
      if (hit) { return hit.name; }
    }
    if (value === true) { return PHR.t('pref.value.on', '开启'); }
    if (value === false) { return PHR.t('pref.value.off', '关闭'); }
    return String(value);
  }

  function audit(detail, key) {
    U.audit({
      action: 'ux.settings', result: 'success', targetType: 'pref',
      targetId: key || '', targetName: PHR.t('pref.auditTarget', '偏好设置'), detail: detail
    });
  }

  /* ================================================================== *
   * 六、挂载
   * ================================================================== */
  PHR.ux = PHR.ux || {};
  PHR.ux.preference = {
    defaults: U.clone(DEFAULTS),
    fields: fields,
    get: get,
    set: set,
    all: all,
    reset: reset,
    apply: apply,
    toggleTheme: toggleTheme,
    labelOf: labelOf,
    valueName: valueName,
    systemPrefersDark: systemPrefersDark
  };

  /* ui/shell.js 顶栏的 🌓 按钮直接调用 PHR.ux.toggleTheme() */
  PHR.ux.toggleTheme = toggleTheme;

  // 模块加载即生效，避免刷新后短暂闪回默认外观
  apply();
  watchSystemTheme();

})(window.PHR);
