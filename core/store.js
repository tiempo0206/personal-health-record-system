/**
 * ============================================================================
 * 文件：core/store.js
 * 层：核心基础设施层（数据持久化）
 * 职责：为全系统提供统一的键值持久化能力，以及面向"集合"的仓储(Repository)
 *      抽象。所有业务模块都只通过 store 读写数据，不直接接触 localStorage，
 *      因此将来把存储后端换成 IndexedDB 或真实服务端时，只需要替换本文件。
 * 依赖：core/namespace.js、core/utils.js、core/event-bus.js
 * ============================================================================
 *
 * 三种后端（driver）：
 *   'file'   —— data/database.json。由 core/store.file.js 在 http(s) 模式下装配：
 *               整份数据库先一次性读进内存镜像，之后所有读写都在镜像上同步进行，
 *               再由 store.file.js 防抖回写文件。**本文件不碰网络**。
 *   'local'  —— localStorage（file:// 双击打开时的默认后端）。
 *   'memory' —— 内存，隐私模式或浏览器禁用存储时的降级（关闭页面即丢失）。
 *
 * 降级策略：
 *   1) http(s) 模式下优先使用服务端数据库文件；
 *   2) 没有服务（file:// 或服务没起来）时用 localStorage；
 *   3) 浏览器禁用存储时降级为内存存储（本次会话有效）；
 *   4) 写入超出配额时抛出可识别的错误，由调用方提示用户导出并清理。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 两条必须遵守的约定，改动本文件或使用 store 时都要记住：
 *
 * ①【内存镜像里存的是"字符串"，不是对象】
 *   镜像的形状与 localStorage 完全一致，是扁平键空间
 *   { "phr.v1.users": "[{\"id\":...}]" }。read() 每次都 JSON.parse 出**全新对象**，
 *   所以调用方可以随意修改读到的结果 —— collection.update() 里就有
 *   `list[idx] = …`。如果镜像里存的是解析后的对象，那一行会直接改写镜像、
 *   静默污染整个数据库。序列化只在"载入 / 落盘"两个边界各做一次。
 *
 * ②【任何模块都不得在脚本求值阶段读 store / db】
 *   file 模式下镜像是**异步**载入的，脚本全部求值完毕时它可能还是空的。
 *   所有读取都必须发生在函数里、且发生在 core/boot.js 的 start() 之后
 *   （boot 会等 store.whenReady() 再启动）。现在全项目都守这条规矩。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ================================================================== *
   * 一、底层驱动选择
   * ================================================================== */
  var memory = {};          // 内存容器：'memory' 模式下的唯一存储，'file' 模式下是整库镜像
  var driver = null;        // localStorage 对象；'file' 与 'memory' 模式下为 null
  var driverName = 'memory';// 'file' | 'local' | 'memory'

  (function detect() {
    try {
      var probe = '__phr_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      driver = window.localStorage;
      driverName = 'local';
    } catch (e) {
      driver = null;
      driverName = 'memory';
      PHR.warn(PHR.t('store.driver.fallback', 'localStorage 不可用，已降级为内存存储（关闭页面后数据会丢失）'));
    }
  })();

  /** 配额超限错误，业务层可据此给出"请先导出备份"的提示 */
  function QuotaError(message) {
    var e = new Error(message || '本地存储空间不足');
    e.name = 'QuotaExceededError';
    e.phrQuota = true;
    return e;
  }

  /* ================================================================== *
   * 一之二、设备级设置与内存镜像
   * ================================================================== */

  /**
   * 设备级设置的键名。
   *
   * 这些是"这台机器上的这个浏览器"的偏好，不是健康数据：界面语言、
   * 调试开关、记住的账号、"7 天免登录"的开关与会话本身。
   * 它们**任何模式下都写在 localStorage 里**，理由是：
   *   · 不会被写进 data/database.json，导出的备份里不会混进本机偏好；
   *   · 「清空全部数据」「重置数据库」不会把用户的语言和登录状态一起清掉
   *     （否则重置完还得重新选语言，很别扭）；
   *   · file 模式下 database.json 是"数据"，语言这类设置跟数据无关。
   *
   * 注意：'session.persist' 也在里面 —— 登录会话故意不放进数据库文件，
   * 这样服务重启、重置数据都不会把人踢下线。
   */
  var DEVICE_KEYS = [
    'locale', 'debug_mode', 'remembered_account',
    'sessionRememberDays', 'session.persist'
  ];

  function isDeviceKey(name) { return DEVICE_KEYS.indexOf(name) >= 0; }

  /** 取 localStorage 原始对象；隐私模式下可能抛错，取不到就返回 null */
  function deviceDriver() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  /** 某个键该走哪个后端：设备键永远走 localStorage，其余走当前驱动 */
  function backendFor(name) {
    if (isDeviceKey(name)) { return deviceDriver(); }
    return driver;
  }

  /**
   * 集合仓储的缓存代数。
   *
   * 镜像是在脚本求值之后才装进来的，如果某个仓储在那之前就读过一次并缓存了
   * 空数组，镜像装好后它会一直返回空 —— 这类"集合莫名是空的"故障极难排查。
   * 装镜像时把代数 +1，仓储下次 load() 就会发现代数对不上并重新读取。
   * 五行代码，消掉一整类问题。
   */
  var generation = 0;

  /* ================================================================== *
   * 一之三、异步镜像的载入握手
   *     file 模式下镜像是异步读进来的，boot 必须等它就绪再启动界面。
   *     local / memory 模式下 ready 恒为 true，whenReady 同步回调，
   *     行为与改造前完全一致。
   * ================================================================== */
  var readyCbs = [];

  function markReady() {
    if (store.ready) { return; }
    store.ready = true;
    var list = readyCbs;
    readyCbs = [];
    list.forEach(function (fn) {
      try { fn(); } catch (e) { PHR.warn(PHR.t('store.ready.cbFail', '启动回调执行失败'), e); }
    });
  }

  /* ================================================================== *
   * 一之四、落盘调度（只有 file 模式会用到）
   *     transport 由 core/store.file.js 注入；在 local / memory 模式下它恒为
   *     null，下面所有函数都退化成空操作 —— 所以这些代码对原有模式零影响。
   *
   *     为什么要防抖：灌一次示例数据会触发近 300 次 write，逐次落盘等于把
   *     整份数据库序列化 300 遍、发 300 个请求。300ms 尾部防抖把它们合并成
   *     一次，1500ms 最长等待则保证持续写入时也不会被无限推迟。
   * ================================================================== */
  var transport = null;      // { push(): Promise, info(): object }
  var debounceTimer = null;
  var maxWaitTimer = null;
  var inFlight = false;      // 同一时刻只允许一个请求在飞
  var dirtyAgain = false;    // 飞行期间又有写入 → 落盘后立刻再发一次
  var waiters = [];          // 调用 store.flush() 时排队等结果的人

  function clearFlushTimers() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
  }

  function settleWaiters(result) {
    var list = waiters;
    waiters = [];
    list.forEach(function (fn) { fn(result); });
  }

  function runFlush() {
    clearFlushTimers();
    if (!transport || inFlight) { return; }
    inFlight = true;
    var p;
    try { p = transport.push(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function (r) {
      inFlight = false;
      if (dirtyAgain) { dirtyAgain = false; scheduleFlush(); }
      settleWaiters(r);
    }, function (e) {
      inFlight = false;
      if (dirtyAgain) { dirtyAgain = false; scheduleFlush(); }
      settleWaiters({ ok: false, error: e });
    });
  }

  /** 有写入时调用：合并短时间内的连续写入，再统一落盘一次 */
  function scheduleFlush() {
    if (!transport) { return; }
    if (debounceTimer) { clearTimeout(debounceTimer); }
    else if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(runFlush, PHR.config.storageFlushMaxWait);
    }
    debounceTimer = setTimeout(runFlush, PHR.config.storageFlushDebounce);
  }

  /* ================================================================== *
   * 二、键值存储
   * ================================================================== */
  var store = {

    /** 存储后端类型：'file' | 'local' | 'memory' */
    driver: driverName,

    /** 存储是否可跨会话保存（'file' 与 'local' 都是） */
    persistent: driverName !== 'memory',

    /**
     * 存储是否已经可用。
     * file 模式下镜像是异步载入的，载入完成前为 false —— core/boot.js 会等
     * whenReady() 再启动界面。local / memory 模式下恒为 true。
     */
    ready: true,

    /**
     * 与本地服务的连接是否已断开（只有 file 模式会变 true）。
     * 断开后改动仍然留在内存镜像里，但界面必须明确告诉用户"没写进文件"，
     * 而不是假装已保存。
     */
    degraded: false,

    /** 镜像就绪后回调；已就绪时同步回调 */
    whenReady: function (cb) {
      if (store.ready) { cb(); return; }
      readyCbs.push(cb);
    },

    /** 拼接带前缀的完整键名 */
    key: function (name) { return PHR.config.storagePrefix + name; },

    /**
     * 读取并反序列化。
     * @param {string} name 逻辑键名（不含前缀）
     * @param {*} def 不存在或解析失败时的默认值
     */
    read: function (name, def) {
      var k = store.key(name);
      try {
        var b = backendFor(name);
        var raw = b ? b.getItem(k) : (k in memory ? memory[k] : null);
        if (raw === null || raw === undefined) { return def; }
        return JSON.parse(raw);
      } catch (e) {
        PHR.warn(PHR.t('store.read.fail', '读取失败：{name}', { name: name }), e);
        return def;
      }
    },

    /** 序列化并写入 */
    write: function (name, value) {
      var k = store.key(name);
      var raw = JSON.stringify(value === undefined ? null : value);
      var b = backendFor(name);
      try {
        if (b) { b.setItem(k, raw); } else { memory[k] = raw; }
        if (driverName === 'file' && !isDeviceKey(name)) { scheduleFlush(); }
        return true;
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
          throw QuotaError(PHR.t('store.write.quota', '存储空间不足，请在「体验保障 → 数据备份」中导出并清理历史数据'));
        }
        throw e;
      }
    },

    /** 删除一个键 */
    drop: function (name) {
      var k = store.key(name);
      var b = backendFor(name);
      try {
        if (b) { b.removeItem(k); } else { delete memory[k]; }
        if (driverName === 'file' && !isDeviceKey(name)) { scheduleFlush(); }
      } catch (e) { PHR.warn(PHR.t('store.drop.fail', '删除失败：{name}', { name: name }), e); }
    },

    /**
     * 列出所有属于本应用的逻辑键名（不含前缀）。
     * file 模式下镜像里没有设备键（它们躺在 localStorage 里），但对外仍要
     * 报出来 —— 用量统计、自检、备份的"已知集合"判断都依赖这个列表。
     */
    keys: function () {
      var prefix = PHR.config.storagePrefix;
      var out = [];
      var seen = {};
      function take(k) {
        if (!k || k.indexOf(prefix) !== 0) { return; }
        var n = k.slice(prefix.length);
        if (seen[n]) { return; }
        seen[n] = true;
        out.push(n);
      }
      var b = driver;
      if (b) {
        for (var i = 0; i < b.length; i++) { take(b.key(i)); }
      } else {
        Object.keys(memory).forEach(take);
      }
      var dd = deviceDriver();
      if (dd) {
        for (var j = 0; j < dd.length; j++) { take(dd.key(j)); }
      }
      return out;
    },

    /** 估算已占用的字节数（粗略值，用于设置页展示） */
    usage: function () {
      var total = 0;
      store.keys().forEach(function (name) {
        var k = store.key(name);
        var b = backendFor(name);
        var raw = b ? b.getItem(k) : memory[k];
        total += (raw ? raw.length : 0) * 2; // UTF-16
      });
      return { bytes: total, kb: Math.round(total / 102.4) / 10 };
    },

    /**
     * 清空本应用的全部数据（危险操作，调用方必须二次确认）。
     * 设备级设置（界面语言、登录状态…）刻意保留：清数据不该把人踢下线，
     * 也不该让用户重新选一遍语言。详见 DEVICE_KEYS 的注释。
     */
    clearAll: function () {
      store.keys().forEach(function (name) {
        if (isDeviceKey(name)) { return; }
        store.drop(name);
      });
      /* 集合被整个删掉了，仓储的内存缓存还留着旧数组，必须作废。
         （这条以前没人踩到，是因为调用方清完就 reload 页面；现在 file 模式下
           也可能不 reload，就不能再赌这件事了。） */
      generation += 1;
    },

    /** 当前后端的可读描述（i18n）—— 界面上不要再去比较 driver 字符串 */
    describe: function () {
      if (driverName === 'file') { return PHR.t('store.driver.file', '本地数据库文件（data/database.json）'); }
      if (driverName === 'local') { return PHR.t('store.driver.local', '浏览器本地存储（localStorage）'); }
      return PHR.t('store.driver.memory', '内存（关闭页面即丢失）');
    },

    /** 存储概况，供设置页与自检使用 */
    stats: function () {
      var info = (transport && transport.info) ? transport.info() : {};
      return Object.assign({
        driver: driverName,
        persistent: store.persistent,
        ready: store.ready,
        degraded: store.degraded,
        kb: store.usage().kb
      }, info);
    },

    /**
     * 立即落盘（不等防抖），返回 Promise<{ok}>。
     * local / memory 模式下本来就没有"落盘"这回事，直接 resolve。
     */
    flush: function () {
      if (!transport) { return Promise.resolve({ ok: true, skipped: true }); }
      return new Promise(function (resolve) {
        waiters.push(resolve);
        clearFlushTimers();
        if (inFlight) { dirtyAgain = true; return; }
        runFlush();
      });
    },

    /* ---------------------------------------------------------------- *
     * 会话级存储（关闭标签页即失效，用于验证码、临时令牌）
     * ---------------------------------------------------------------- */
    session: {
      read: function (name, def) {
        try {
          var raw = window.sessionStorage.getItem(store.key(name));
          return raw === null ? def : JSON.parse(raw);
        } catch (e) { return def; }
      },
      write: function (name, value) {
        try { window.sessionStorage.setItem(store.key(name), JSON.stringify(value)); } catch (e) { /* 忽略 */ }
      },
      drop: function (name) {
        try { window.sessionStorage.removeItem(store.key(name)); } catch (e) { /* 忽略 */ }
      }
    },

    /* ---------------------------------------------------------------- *
     * 集合仓储
     * ---------------------------------------------------------------- */

    /**
     * 创建一个集合仓储。
     * @param {string} name 集合名（同时作为 localStorage 键名）
     * @param {object} opt  { idPrefix: 'R', event: 'record:changed' }
     * @returns {object} 仓储对象
     *
     * 仓储约定：
     *   每条数据自动获得 id / createdAt / updatedAt 三个字段；
     *   所有写操作完成后，若配置了 event，会通过事件总线广播一次。
     */
    collection: function (name, opt) {
      opt = opt || {};
      var idPrefix = opt.idPrefix || 'X';
      var evt = opt.event || null;
      var counterName = name + '.seq';

      /* 内存缓存：避免每次读写都重新 JSON.parse（示例数据量大时效果明显）。
         cacheGen 是"缓存代数"：镜像晚于本仓储载入时（代数变了），
         上一次缓存的空数组必须作废，否则集合会一直读到空。 */
      var cache = null, cacheGen = -1;
      function load() {
        if (cache === null || cacheGen !== generation) {
          cache = store.read(name, []);
          cacheGen = generation;
        }
        return cache;
      }
      function save(list) {
        store.write(name, list);
        cache = list;
        return list;
      }

      function nextId() {
        var n = store.read(counterName, 0) + 1;
        store.write(counterName, n);
        return idPrefix + String(n).padStart(6, '0');
      }

      function notify(action, payload) {
        if (evt) { PHR.bus.emit(evt, Object.assign({ action: action, collection: name }, payload || {})); }
      }

      /**
       * 出参按当前语言解析文本。
       *
       * 集合是所有读取的公共出口，在这里统一解析，下游（病史摘要、健康洞察、
       * 首页待办、检索索引…）就不必各自记得调用 —— 它们大多直接读 row.data。
       * 实现见 core/models.js 的 localize：带词条键的行走键，老数据按值反查；
       * 用户自己输入的文本两边都查不到，原样返回。
       *
       * 这里返回的本来就是 U.clone 出来的副本，所以解析不会影响库里的数据。
       */
      function localizeOut(row) {
        return (PHR.models && PHR.models.localize) ? PHR.models.localize(row) : row;
      }

      return {
        /** 集合名 */
        name: name,

        /** 全部数据（副本） */
        all: function () { return U.clone(load()).map(localizeOut); },

        /** 原始数组引用（内部使用，外部请勿直接修改） */
        raw: load,

        /** 条件查询 */
        where: function (fn) { return U.clone(load().filter(fn)).map(localizeOut); },

        /** 按 id 查找 */
        byId: function (id) {
          var hit = load().filter(function (x) { return x.id === id; })[0];
          return hit ? localizeOut(U.clone(hit)) : null;
        },

        /** 按某字段取值查找（返回第一条） */
        firstBy: function (field, value) {
          var hit = load().filter(function (x) { return x[field] === value; })[0];
          return hit ? localizeOut(U.clone(hit)) : null;
        },

        /** 条数 */
        count: function (fn) { return fn ? load().filter(fn).length : load().length; },

        /** 新增，自动补 id 与时间戳 */
        insert: function (data) {
          var list = load();
          var now = Date.now();
          var row = Object.assign({}, U.clone(data), {
            id: data.id || nextId(),
            createdAt: data.createdAt || now,
            updatedAt: now
          });
          list.push(row);
          save(list);
          notify('insert', { id: row.id, row: U.clone(row) });
          return U.clone(row);
        },

        /** 批量新增 */
        insertMany: function (rows) {
          return (rows || []).map(function (r) { return this.insert(r); }, this);
        },

        /** 局部更新 */
        update: function (id, patch) {
          var list = load();
          var idx = -1;
          for (var i = 0; i < list.length; i++) { if (list[i].id === id) { idx = i; break; } }
          if (idx < 0) { return null; }
          list[idx] = Object.assign({}, list[idx], U.clone(patch), { id: id, updatedAt: Date.now() });
          save(list);
          notify('update', { id: id, row: U.clone(list[idx]) });
          return U.clone(list[idx]);
        },

        /** 整体替换一条（保留 id 与 createdAt） */
        replace: function (id, row) {
          var list = load();
          for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) {
              var merged = Object.assign({}, U.clone(row), {
                id: id,
                createdAt: list[i].createdAt,
                updatedAt: Date.now()
              });
              list[i] = merged;
              save(list);
              notify('update', { id: id, row: U.clone(merged) });
              return U.clone(merged);
            }
          }
          return null;
        },

        /** 删除 */
        remove: function (id) {
          var list = load();
          var kept = list.filter(function (x) { return x.id !== id; });
          var removed = list.length !== kept.length;
          if (removed) { save(kept); notify('remove', { id: id }); }
          return removed;
        },

        /** 条件删除，返回删除条数 */
        removeWhere: function (fn) {
          var list = load();
          var kept = list.filter(function (x) { return !fn(x); });
          var n = list.length - kept.length;
          if (n) { save(kept); notify('remove', { count: n }); }
          return n;
        },

        /** 覆盖整个集合 */
        replaceAll: function (rows) {
          save(U.clone(rows || []));
          notify('replaceAll', { count: (rows || []).length });
          return store.collection(name, opt);
        },

        /** 清空集合 */
        clear: function () {
          save([]);
          store.drop(counterName);
          notify('clear', {});
        }
      };
    },

    /* ---------------------------------------------------------------- *
     * 内部接口 —— 仅供 core/store.file.js 使用，业务代码不要调用。
     * 全部以 __ 开头，表示"这里动的是驱动本身，不是在读写数据"。
     * ---------------------------------------------------------------- */

    __DEVICE_KEYS: DEVICE_KEYS,
    __isDeviceKey: isDeviceKey,

    /**
     * 切换为 file 后端并装入整库镜像。
     * @param {object} mirrorMap 形如 { "users": "<json 字符串>", … } 的**逻辑键名**
     *        （不含前缀）到 JSON 字符串的映射。必须是字符串 —— 原因见文件头 ①。
     */
    __enterFileMode: function (mirrorMap) {
      var prefixed = {};
      Object.keys(mirrorMap || {}).forEach(function (k) {
        prefixed[PHR.config.storagePrefix + k] = mirrorMap[k];
      });
      memory = prefixed;
      driver = null;
      driverName = 'file';
      store.driver = 'file';
      store.persistent = true;
      generation += 1;
    },

    /**
     * 服务不可用时的退路：退回 localStorage。
     * 镜像里可能已经有半份数据，直接丢弃 —— 两边的数据混在一起比"看见旧数据"
     * 糟糕得多，用户至少能看懂"现在是浏览器本地存储里的那份"。
     */
    __fallbackToLocal: function () {
      var dd = deviceDriver();
      driver = dd;
      driverName = dd ? 'local' : 'memory';
      memory = {};
      store.driver = driverName;
      store.persistent = driverName === 'local';
      generation += 1;
    },

    /** 注入落盘通道 { push(): Promise, info(): object } */
    __bindTransport: function (t) { transport = t; },

    /** 声明镜像已就绪，唤醒所有 whenReady 回调 */
    __markReady: markReady,

    /** 让所有集合仓储的缓存作废（镜像被整体替换后调用） */
    __bumpGeneration: function () { generation += 1; },

    /** 标记与服务的连接状态 */
    __setDegraded: function (b) { store.degraded = !!b; },

    /** 供上层构造配额错误 */
    QuotaError: QuotaError
  };

  PHR.store = store;

})(window.PHR);
