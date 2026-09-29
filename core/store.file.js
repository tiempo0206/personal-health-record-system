/**
 * ============================================================================
 * 文件：core/store.file.js
 * 层：核心基础设施层（数据持久化 —— 本地数据库文件后端）
 * 职责：只有在**通过本地服务打开**（http/https）时，本文件才介入，把整份数据库
 *      落到 data/database.json：
 *        ① 启动时一次性把整库读进内存镜像，交给 core/store.js 当普通后端用；
 *        ② 之后每次写入都由 store.js 防抖调用 push()，整库回写文件。
 *      在 file:// 双击打开时，本文件**一行代码都不执行**，行为与改造前完全一致。
 *
 * 依赖：core/namespace.js、core/utils.js、core/store.js、core/models.js
 * 加载位置：必须紧跟在 core/store.js 与 core/models.js 之后、core/boot.js 之前。
 *          （跟着 models.js 是为了 normalizeDocument 能拿到 PHR.db.schema ——
 *           它要据此区分"集合"与"散键"，见下。）
 * ============================================================================
 *
 * 为什么要镜像，而不是每次读写都发请求：
 *   core/store.js 的 read/write 是全同步的，被全项目上百处直接调用。
 *   改成异步会牵动每一个调用点。所以这里选择"开机整库读进内存、之后同步读写、
 *   写完防抖回写"—— 代价是最后几百毫秒的改动可能没落盘，见下面的说明。
 *
 * 磁盘格式（database.json）刻意做成同时是一份合法备份：
 *   { meta:{...}, data:{ 12 个集合 }, kv:{ 其余散键 } }
 *   PHR.ux.backup.validate() 会把 data 里不认识的键报成"本系统不认识的集合"，
 *   所以 .seq 计数器、点赞、检索历史、待办、草稿一律放 kv，不放 data。
 *   这样 database.json 可以直接用「数据与存储 → 导入备份」导回来。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var store = PHR.store;

  /* 只有 http(s) 才启用。file:// 下直接返回 —— 这是"双击 index.html 照旧能用"
     的全部秘密：不是降级，是本文件根本没运行。 */
  if (!/^https?:$/i.test(location.protocol)) { return; }

  var API = PHR.config.storageApiBase || 'api/db';

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */
  var revision = 0;          // 已知的服务端版本号，PUT 时 +1 带上
  var savedAt = 0;           // 最近一次成功落盘的时间
  var lastError = '';
  var degraded = false;      // 与服务的连接是否已断开
  var retryTimer = null;
  var retryDelay = 1000;

  /* 镜像还没装好之前不能让界面启动 —— core/boot.js 会等 whenReady()。
     这两行必须同步执行（在脚本求值阶段），否则 boot 会以为已经就绪。
     先把 driver 标成 'file'，是为了让 store 的状态从头到尾自洽：
     万一服务连不上，下面的 fallback() 会把它改回 'local'。 */
  store.ready = false;
  store.driver = 'file';
  store.persistent = true;

  /* ================================================================== *
   * 一、HTTP 小工具
   *     用 XMLHttpRequest 而不是 fetch：本项目的既有约定是"不引入 fetch"，
   *     而 XHR 在这里完全够用（要读响应头、要超时、不玩流式）。
   * ================================================================== */
  function request(method, url, body) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      try { xhr.open(method, url, true); } catch (e) { reject(e); return; }
      xhr.setRequestHeader('X-PHR-Client', '1');
      if (body !== null && body !== undefined) {
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
      }
      xhr.timeout = 20000;                       // 本地服务，20 秒已经非常宽裕
      xhr.onload = function () {
        resolve({
          status: xhr.status,
          text: xhr.responseText || '',
          header: function (n) { return xhr.getResponseHeader(n); }
        });
      };
      xhr.onerror = function () { reject(new Error(PHR.t('store.file.netErr', '无法连接本地服务'))); };
      xhr.ontimeout = function () { reject(new Error(PHR.t('store.file.timeout', '本地服务响应超时'))); };
      xhr.send(body === undefined ? null : body);
    });
  }

  /* ================================================================== *
   * 二、启动：读整库 → 装镜像 → 放开启动闸门
   * ================================================================== */

  /** 退回 localStorage 模式（服务不可用时）。应用照常可用，只是数据换了一份。 */
  function fallback(reason) {
    store.__fallbackToLocal();
    store.__bumpGeneration();
    PHR.warn(PHR.t('store.file.fallback', '本地数据库服务不可用（{reason}），已退回浏览器本地存储'),
      reason);
    store.__markReady();
  }

  /**
   * 把磁盘文档拆成"逻辑键名 → JSON 字符串"的扁平映射。
   * 容错优先：用户会被邀请手工编辑这个文件，所以任何奇怪的形状都要能尽量读出来，
   * 读不出来的部分记一条 warning 给界面显示，而不是整体报错。
   *
   * @returns {{map:object|null, meta:object, warnings:Array, fatal:string}}
   */
  function normalizeDocument(raw) {
    var warnings = [];

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { map: null, meta: {}, warnings: warnings, fatal: raw === null ? 'empty' : 'shape' };
    }

    var schema = (PHR.db && PHR.db.schema) ? PHR.db.schema : {};
    var map = {};
    var meta = (raw.meta && typeof raw.meta === 'object') ? raw.meta : {};

    /* 形状 A：本系统写出的 { meta, data, kv } */
    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      var kv = (raw.kv && typeof raw.kv === 'object' && !Array.isArray(raw.kv)) ? raw.kv : {};

      Object.keys(raw.data).forEach(function (k) {
        var rows = raw.data[k];
        if (!Array.isArray(rows)) {
          warnings.push(PHR.t('store.file.warn.notArray',
            '「{k}」不是数组，已按空集合处理', { k: k }));
          rows = [];
        }
        if (!schema[k]) {
          /* 不认识的集合：挪进 kv 保留，不丢数据，也不让 data 段混进脏键 */
          warnings.push(PHR.t('store.file.warn.unknown',
            '「{k}」不属于本系统的数据集合，已原样保留在 kv 段', { k: k }));
          kv[k] = rows;
          return;
        }
        map[k] = JSON.stringify(rows);
      });

      Object.keys(kv).forEach(function (k) {
        map[k] = JSON.stringify(kv[k] === undefined ? null : kv[k]);
      });

      if (!meta.storageVersion) {
        warnings.push(PHR.t('store.file.warn.noVersion',
          '该文件没有 storageVersion 标记，已尽力读取；首次保存时会自动补上'));
      }
      return { map: map, meta: meta, warnings: warnings, fatal: '' };
    }

    /* 形状 B：{ "users": [...], "records": [...] } —— 没有 meta/data 包裹的朴素格式。
       早先手写过数据库文件、或者从别处拷来一份集合数组的人会用到。 */
    var looksFlat = Object.keys(raw).every(function (k) {
      return Array.isArray(raw[k]) || (raw[k] && typeof raw[k] === 'object');
    });
    if (looksFlat && Object.keys(raw).length) {
      warnings.push(PHR.t('store.file.warn.flat',
        '该文件不是本系统生成的标准格式（缺少 meta/data 外层），已按朴素格式尽力读取'));
      Object.keys(raw).forEach(function (k) { map[k] = JSON.stringify(raw[k]); });
      return { map: map, meta: meta, warnings: warnings, fatal: '' };
    }

    return { map: null, meta: meta, warnings: warnings, fatal: 'shape' };
  }

  /**
   * 文件存在但不是合法 JSON。
   *
   * 这里刻意**不做任何自动修复**：用户可能正拿着记事本改到一半。
   * 给他两个选择 —— 备份并重建，或者本次以浏览器本地存储模式运行（不碰文件）。
   * 绝不能在用户不知情的情况下把他的文件覆盖掉。
   */
  function handleCorrupt(reason) {
    PHR.ui.confirm({
      title: PHR.t('store.file.corrupt.title', 'data/database.json 无法解析'),
      message: PHR.t('store.file.corrupt.message',
        '这个文件不是合法的 JSON，系统读不出里面的数据。文件不会被自动修改。'),
      detail: PHR.t('store.file.corrupt.detail',
        '点「备份并重建」：原文件会被改名成 database.json.corrupt-<时间戳> 保留下来' +
        '（不会删除），然后系统恢复一套示例数据并重新生成 database.json。\n' +
        '点「取消」：本次以浏览器本地存储模式运行，完全不动这个文件；' +
        '你可以用记事本改好后再刷新页面。'),
      confirmLabel: PHR.t('store.file.corrupt.confirm', '备份并重建'),
      cancelLabel: PHR.t('store.file.corrupt.cancel', '取消，我自己去修'),
      tone: 'danger'
    }).then(function (ok) {
      if (!ok) { fallback(PHR.t('store.file.corrupt.kept', '文件有问题，用户选择先手工修复')); return; }
      request('POST', API + '/backup-corrupt', '').then(function () {
        /* 镜像留空 → boot 里的 ensureSeed() 会灌示例数据 → 首次落盘重建文件 */
        store.__enterFileMode({});
        store.__bumpGeneration();
        PHR.ui.toast.ok(PHR.t('store.file.corrupt.done', '原文件已备份，示例数据已重建'));
        store.__markReady();
      }, function () {
        fallback(PHR.t('store.file.corrupt.backupFail', '原文件备份失败'));
      });
    });
  }

  function install(map, meta, warnings) {
    store.__enterFileMode(map || {});
    store.__bumpGeneration();
    revision = meta && typeof meta.revision === 'number' ? meta.revision : 0;
    store.__bindTransport({ push: push, info: info });

    if (warnings && warnings.length) {
      PHR.warn(PHR.t('store.file.warn.summary', '数据库文件有 {n} 处需要注意的地方', { n: warnings.length }));
      warnings.forEach(function (w) { PHR.warn('[db] ' + w); });
      PHR.bus.emit('store:fileWarnings', { warnings: warnings });
    }

    /* 离开页面时尽量把没落盘的改动推出去。
       ⚠️ 这是一道"尽力而为"的保险，不是保证：Chromium 已经不允许在页面卸载
       事件里发同步请求，而 keepalive 又有 64KB 上限（整库远超）。
       真正的保证是第一道防线 —— 300ms 防抖，以及设置页里的「立即保存」。 */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { store.flush(); }
    });
    window.addEventListener('pagehide', function () { store.flush(); });

    store.__markReady();
  }

  function load() {
    request('GET', API, undefined).then(function (res) {
      if (res.status === 404) {
        /* 目录被别的静态服务（比如 python -m http.server）托管，没有 api/db */
        fallback('HTTP 404');
        return;
      }
      if (res.status !== 200) { fallback('HTTP ' + res.status); return; }

      /* BOM 会让 JSON.parse 抛 "Unexpected token ﻿"，先剥掉 */
      var text = String(res.text || '').replace(/^﻿/, '');

      if (!text.trim()) {
        /* 文件不存在或为空：正常情况，boot 会灌示例数据 */
        install({}, {}, []);
        return;
      }

      /* 有些静态服务器对任何路径都回 200 + 一个 HTML 页面。那种情况下
         api/db 拿到的不是我们的接口，直接退回 localStorage，
         而不是弹一个"数据库文件损坏"的对话框去吓用户。 */
      if (text.trim().charAt(0) !== '{') { fallback('接口返回的不是 JSON'); return; }

      var raw;
      try { raw = JSON.parse(text); }
      catch (e) { handleCorrupt(e && e.message); return; }

      var norm = normalizeDocument(raw);
      if (!norm.map) { handleCorrupt(norm.fatal); return; }
      install(norm.map, norm.meta, norm.warnings);

    }, function (e) {
      /* 服务没起来 / 连接被拒：静默退回 localStorage，应用照常可用 */
      fallback(e && e.message ? e.message : 'network');
    });
  }

  /* ================================================================== *
   * 三、落盘：把内存镜像写成文档，PUT 给服务
   * ================================================================== */
  var SCHEMA_KEYS = null;    // 惰性取一次；schema 是静态元信息，不会变

  function schemaKeys() {
    if (!SCHEMA_KEYS) { SCHEMA_KEYS = Object.keys((PHR.db && PHR.db.schema) || {}); }
    return SCHEMA_KEYS;
  }

  /** 组装磁盘文档：data 段只放已知集合，其余一律进 kv */
  function buildDocument() {
    var keys = schemaKeys();
    var data = {};
    var kv = {};
    var recordCount = 0;

    /* 12 个集合即使为空也要出现，这样文件结构稳定、也才是一份完整的备份 */
    keys.forEach(function (k) { data[k] = []; });

    store.keys().forEach(function (name) {
      if (store.__isDeviceKey(name)) { return; }   // 本机偏好不进数据库文件
      var value = store.read(name, undefined);
      if (value === undefined) { return; }
      if (keys.indexOf(name) >= 0) {
        var rows = Array.isArray(value) ? value : [];
        data[name] = rows;
        recordCount += rows.length;
      } else {
        kv[name] = value;
      }
    });

    var now = Date.now();
    return {
      meta: {
        format: 'phr-database',
        storageVersion: 1,
        app: PHR.meta.appName,
        shortName: PHR.meta.shortName,
        version: PHR.meta.version,
        buildDate: PHR.meta.buildDate,
        generator: PHR.meta.appName + ' v' + PHR.meta.version,
        savedAt: now,
        savedAtText: U.fmtFull(now),
        /* exportedAt / exportedAtText / recordCount / collectionCount / encrypted
           是 PHR.ux.backup 的导入校验会读的字段 —— 带上它们，database.json
           就等于一份可以直接导入的备份，不用另写代码。 */
        exportedAt: now,
        exportedAtText: U.fmtFull(now),
        recordCount: recordCount,
        collectionCount: keys.length,
        encrypted: false,
        revision: revision + 1
      },
      data: data,
      kv: kv
    };
  }

  function setDegraded(on, why) {
    if (degraded === on) { return; }
    degraded = on;
    store.__setDegraded(on);
    PHR.bus.emit(on ? 'store:offline' : 'store:online', { error: why || '' });
  }

  function scheduleRetry() {
    if (retryTimer) { return; }
    retryTimer = setTimeout(function () {
      retryTimer = null;
      retryDelay = Math.min(retryDelay * 2, 10000);
      store.flush();
    }, retryDelay);
  }

  /**
   * 把内存镜像整份推给服务。
   * @param {number} [depth] 409 冲突后的重发层数（内部用，最多 3 次）
   */
  function push(depth) {
    depth = depth || 0;
    var body;
    try { body = JSON.stringify(buildDocument(), null, 2); }
    catch (e) { return Promise.resolve({ ok: false, error: String(e && e.message || e) }); }

    var sending = revision + 1;

    return request('PUT', API, body).then(function (res) {
      if (res.status === 200) {
        revision = sending;
        savedAt = Date.now();
        lastError = '';
        retryDelay = 1000;
        setDegraded(false);
        PHR.bus.emit('store:saved', { revision: revision, bytes: body.length });
        return { ok: true, revision: revision, bytes: body.length };
      }

      if (res.status === 409) {
        /* 另一个标签页先写了一步。策略是"后写者赢"，但**必须告诉用户** ——
           静默覆盖别人的改动是最难排查的一类数据丢失。
           采纳服务端的版本号后重发一次，让本页成为最终版本。
           带层数上限：万一服务端逻辑有问题，不能在这里转成死循环把浏览器卡死。 */
        if (depth >= 3) {
          lastError = PHR.t('store.file.conflictLoop', '反复与另一个标签页冲突，本次保存已放弃');
          setDegraded(true, lastError);
          return { ok: false, error: lastError };
        }
        var server;
        try { server = JSON.parse(res.text || '{}'); } catch (e) { server = {}; }
        if (server && typeof server.meta === 'object' && typeof server.meta.revision === 'number') {
          revision = server.meta.revision;
        }
        /* 只在第一层提示，重发时不再重复弹 —— 否则用户会连吃三个一样的提示 */
        if (depth === 0) { PHR.bus.emit('store:conflict', { revision: revision }); }
        return push(depth + 1);
      }

      if (res.status === 413) {
        lastError = PHR.t('store.file.tooLarge', '数据库文件过大，已跳过本次保存');
        return { ok: false, error: lastError, skipped: true };
      }

      lastError = 'HTTP ' + res.status;
      setDegraded(true, lastError);
      scheduleRetry();
      return { ok: false, error: lastError };
    }, function (e) {
      lastError = String(e && e.message || e);
      setDegraded(true, lastError);
      scheduleRetry();
      return { ok: false, error: lastError };
    });
  }

  function info() {
    return {
      revision: revision,
      savedAt: savedAt,
      savedAtText: savedAt ? U.fmtFull(savedAt) : '',
      degraded: degraded,
      lastError: lastError,
      file: PHR.t('store.file.path', 'data/database.json')
    };
  }

  /* ================================================================== *
   * 四、起飞
   * ================================================================== */
  /* 等 DOM 与所有脚本都就绪再发请求。两个原因，缺一不可：
     ① 本文件后面还有一堆脚本（ui/components/modal.js 等）没执行完，
        handleCorrupt 要用的 PHR.ui.confirm 那时还不存在；
     ② store.file.js 的 DOMContentLoaded 监听器必须先于 core/boot.js 的注册，
        这样 boot 跑起来时看到的 ready 一定是 false，才会乖乖等 whenReady。
        （两个监听器按注册顺序触发，而本文件在 index.html 里排在 boot 之前。） */
  function go() { load(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', go);
  } else {
    go();
  }

})(window.PHR);
