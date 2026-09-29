/**
 * ============================================================================
 * 文件：modules/ux/backup.js
 * 层：业务模块层（体验保障 —— 模块 8）
 * 职责：本地数据的"出口与入口"——全量导出（明文 / 口令加密）、导入前校验、
 *      合并或覆盖写入（失败自动回滚）、重建示例数据与彻底清空。
 *      数据是用户自己的，因此本模块只做"搬运与校验"，不做任何上传。
 * 依赖：core/namespace.js、core/utils.js、core/store.js、core/models.js、
 *      core/crypto.js、core/seed.js、ui/components/dom.js（下载）、PHR.audit（可选）
 * ============================================================================
 *
 * 备份文件结构：
 *   明文：{ meta:{app, version, exportedAt, recordCount, encrypted:false}, data:{集合名:数组} }
 *   加密：{ meta:{…, encrypted:true, algorithm}, payload:'enc.v1.…' }   ← meta 保持明文，
 *         这样导入时无需口令即可判断"这份备份是加密的"。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;

  var MAX_ROWS_PER_COLLECTION = 200000;   // 单集合条数上限，超出视为文件异常
  var PASSWORD_MIN = 6;

  function keys() { return Object.keys(PHR.db.schema); }

  /* ================================================================== *
   * 一、导出
   * ================================================================== */
  function buildPayload() {
    var data = {};
    var count = 0;
    keys().forEach(function (k) {
      var rows = PHR.store.read(k, []);
      if (!Array.isArray(rows)) { rows = []; }
      data[k] = rows;
      count += rows.length;
    });
    return {
      meta: {
        app: PHR.meta.appName,
        shortName: PHR.meta.shortName,
        version: PHR.meta.version,
        buildDate: PHR.meta.buildDate,
        exportedAt: Date.now(),
        exportedAtText: U.fmtFull(Date.now()),
        recordCount: count,
        collectionCount: keys().length,
        encrypted: false,
        generator: PHR.meta.appName + ' v' + PHR.meta.version
      },
      data: data
    };
  }

  /** 文件名时间戳：20260914_1530 */
  function stamp(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + U.pad2(d.getMonth() + 1) + U.pad2(d.getDate()) +
      '_' + U.pad2(d.getHours()) + U.pad2(d.getMinutes());
  }

  function filename(encrypted, ts) {
    /* 文件名会出现在下载目录与导入对话框里，因此跟随界面语言；.phr / .json 后缀不变 */
    return PHR.t('backup.filePrefix', 'PHR备份_') + stamp(ts) + (encrypted ? '.phr' : '.json');
  }

  /**
   * 导出全部数据并触发浏览器下载。
   * @param {boolean} encrypt 是否口令加密
   * @param {string} [password] encrypt 为 true 时必填
   * @returns {{ok, filename, bytes, meta, encrypted, message}}
   */
  function exportAll(encrypt, password) {
    var payload = buildPayload();
    var text, name;

    if (encrypt) {
      if (!password || String(password).length < PASSWORD_MIN) {
        return { ok: false, message: PHR.t('backup.encryptTooShort', '加密口令至少 {n} 位，请重新设置。', { n: PASSWORD_MIN }) };
      }
      var wrapped = {
        meta: Object.assign({}, payload.meta, {
          encrypted: true,
          algorithm: 'enc.v1（XOR 流 + Base64，教学用途强度，生产环境应使用 AES-GCM）'
        }),
        payload: PHR.crypto.encrypt(payload, password)
      };
      text = JSON.stringify(wrapped);
      name = filename(true, payload.meta.exportedAt);
    } else {
      text = JSON.stringify(payload);
      name = filename(false, payload.meta.exportedAt);
    }

    var ok = dom.download(name, text, encrypt ? 'application/octet-stream' : 'application/json;charset=utf-8');
    audit('ux.export', PHR.t('backup.audit.export', '导出健康数据：{n} 条记录，{mode}，文件名 {file}', {
      n: payload.meta.recordCount,
      mode: encrypt ? PHR.t('backup.mode.encrypted', '口令加密') : PHR.t('backup.mode.plain', '明文 JSON'),
      file: name
    }));

    return {
      ok: ok, filename: name, bytes: text.length, meta: payload.meta, encrypted: !!encrypt,
      message: ok ? PHR.t('backup.exported', '已导出 {file}', { file: name })
                  : PHR.t('backup.downloadBlocked', '下载未能触发，请检查浏览器是否拦截了下载。')
    };
  }

  /* ================================================================== *
   * 二、导入：解析 + 校验
   * ================================================================== */
  function compatible(version) {
    if (!version) { return true; }                 // 老文件没有版本号时按兼容处理
    return String(version).split('.')[0] === String(PHR.meta.version).split('.')[0];
  }

  /** 校验备份内容，返回 { errors:[致命], warnings:[提示], summary } */
  function validate(payload) {
    var errors = [];
    var warnings = [];
    var data = payload && payload.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { errors: [PHR.t('backup.err.noData', '备份文件里没有 data 段，无法导入。')], warnings: warnings, summary: null };
    }

    var unknown = Object.keys(data).filter(function (k) { return keys().indexOf(k) < 0; });
    if (unknown.length) {
      warnings.push(PHR.t('backup.warn.unknownCollections', '备份包含本系统不认识的集合：{list}，导入时会被忽略。',
        { list: unknown.join(PHR.t('ux.listSep', '、')) }));
    }

    var byCollection = {};
    var total = 0;
    var matched = 0;
    keys().forEach(function (k) {
      var rows = data[k];
      if (rows === undefined) { return; }
      matched++;
      if (!Array.isArray(rows)) {
        errors.push(PHR.t('backup.err.notArray', '集合 {name} 的内容不是数组。', { name: k }));
        return;
      }
      if (rows.length > MAX_ROWS_PER_COLLECTION) {
        errors.push(PHR.t('backup.err.tooMany', '集合 {name} 的条数（{n}）超出合理范围，文件可能已损坏。',
          { name: k, n: rows.length }));
        return;
      }
      var bad = rows.filter(function (r) { return !r || typeof r !== 'object' || !r.id; });
      if (bad.length) {
        warnings.push(PHR.t('backup.warn.missingId', '集合 {name} 中有 {n} 条数据缺少 id，导入时会被跳过。',
          { name: k, n: bad.length }));
      }
      byCollection[k] = rows.length;
      total += rows.length;
    });

    if (!matched) { errors.push(PHR.t('backup.err.noKnownCollection', '备份文件中没有任何本系统已知的集合数据。')); }

    return {
      errors: errors,
      warnings: warnings,
      summary: {
        version: payload.meta ? payload.meta.version : PHR.t('backup.unknown', '未知'),
        exportedAt: payload.meta ? payload.meta.exportedAt : 0,
        exportedAtText: payload.meta
          ? (payload.meta.exportedAtText || U.fmtFull(payload.meta.exportedAt || Date.now()))
          : PHR.t('backup.unknownTime', '未知时间'),
        encrypted: !!(payload.meta && payload.meta.encrypted),
        collectionCount: matched,
        recordCount: total,
        byCollection: byCollection,
        warnings: warnings
      }
    };
  }

  /**
   * 解析并校验一份备份文件。
   * @param {string} fileText 文件内容
   * @param {string} [password] 加密备份需要的口令
   * @returns {{ok, errors, warnings, summary, payload, needPassword}}
   */
  function importAll(fileText, password) {
    var raw;
    try { raw = JSON.parse(String(fileText || '')); }
    catch (e) {
      return { ok: false,
        errors: [PHR.t('backup.err.badJson', '文件不是合法的 JSON，可能不是本系统导出的备份。')], warnings: [] };
    }
    if (!raw || typeof raw !== 'object' || !raw.meta) {
      return { ok: false,
        errors: [PHR.t('backup.err.noMeta', '备份文件缺少 meta 信息，无法确认来源与版本。')], warnings: [] };
    }
    if (!compatible(raw.meta.version)) {
      return { ok: false, warnings: [],
        errors: [PHR.t('backup.err.versionMismatch',
          '备份文件版本（{file}）与当前系统版本（{app}）的主版本号不一致，为避免字段错位已拒绝导入。',
          { file: raw.meta.version, app: PHR.meta.version })] };
    }

    var payload = raw;
    if (raw.meta.encrypted) {
      if (!password) {
        return { ok: false, needPassword: true, warnings: [],
          errors: [PHR.t('backup.err.needPassword', '该备份已加密，请输入导出时设置的口令。')] };
      }
      payload = PHR.crypto.decrypt(raw.payload, password);
      if (!payload || !payload.meta) {
        return { ok: false, needPassword: true, warnings: [],
          errors: [PHR.t('backup.err.badPassword', '口令不正确，或文件内容已损坏。')] };
      }
      payload.meta.encrypted = true;
    }

    var check = validate(payload);
    if (check.errors.length) {
      return { ok: false, errors: check.errors, warnings: check.warnings, summary: check.summary };
    }
    return { ok: true, errors: [], warnings: check.warnings, summary: check.summary, payload: payload };
  }

  /* ================================================================== *
   * 三、导入：写入与回滚
   * ================================================================== */

  /** 把全部集合深拷贝到内存，用于导入失败时回滚 */
  function snapshot() {
    var snap = { at: Date.now(), data: {}, seq: {} };
    keys().forEach(function (k) {
      snap.data[k] = U.clone(PHR.store.read(k, []));
      snap.seq[k] = PHR.store.read(k + '.seq', 0);
    });
    return snap;
  }

  function restore(snap) {
    if (!snap || !snap.data) { return false; }
    keys().forEach(function (k) {
      PHR.store.write(k, snap.data[k] || []);
      PHR.store.write(k + '.seq', snap.seq[k] || 0);
    });
    PHR.bus.emit('record:changed', { action: 'import.rollback' });
    return true;
  }

  /** 导入的数据可能带更大的 id 序号，把计数器推到最大值之后，避免后续新增出现重复 id */
  function bumpCounters() {
    keys().forEach(function (k) {
      var max = 0;
      PHR.store.read(k, []).forEach(function (r) {
        var m = String((r && r.id) || '').match(/(\d+)$/);
        if (m) { max = Math.max(max, Number(m[1])); }
      });
      if (max > PHR.store.read(k + '.seq', 0)) { PHR.store.write(k + '.seq', max); }
    });
  }

  /**
   * 写入导入数据。
   * @param {object} payload importAll 返回的 payload
   * @param {string} mode 'merge'（按 id 合并，同 id 覆盖）| 'replace'（清空后写入）
   */
  function applyImport(payload, mode) {
    mode = mode === 'replace' ? 'replace' : 'merge';
    if (!payload || !payload.data) {
      return { ok: false, mode: mode,
        errors: [PHR.t('backup.err.nothingToImport', '没有可导入的数据，请先调用 importAll() 校验文件。')] };
    }

    var snap = snapshot();   // 必须先留一份快照，写入失败才能整体回滚
    var applied = {};
    var skipped = 0;

    try {
      keys().forEach(function (k) {
        var rows = payload.data[k];
        if (!Array.isArray(rows) || !rows.length) { return; }
        var repo = PHR.db[k];
        var existing = {};
        if (mode === 'replace') { repo.clear(); }
        else { repo.all().forEach(function (r) { existing[r.id] = true; }); }

        var n = 0;
        rows.forEach(function (row) {
          if (!row || typeof row !== 'object' || !row.id) { skipped++; return; }
          if (mode === 'merge' && existing[row.id]) { repo.replace(row.id, row); }
          else { repo.insert(row); existing[row.id] = true; }
          n++;
        });
        applied[k] = n;
      });
      bumpCounters();
    } catch (e) {
      restore(snap);
      audit('ux.import', PHR.t('backup.audit.importFail', '导入健康数据失败并已回滚：{msg}',
        { msg: (e && e.message ? e.message : e) }), 'fail');
      return { ok: false, mode: mode, rolledBack: true,
        errors: [PHR.t('backup.err.rolledBack', '导入过程中出错，已自动回滚到导入前的数据：{msg}',
          { msg: (e && e.message ? e.message : e) })] };
    }

    var total = U.sum(Object.keys(applied).map(function (k) { return applied[k]; }));
    audit('ux.import', PHR.t('backup.audit.import', '导入健康数据（{mode}）：写入 {n} 条，跳过 {k} 条', {
      mode: mode === 'replace' ? PHR.t('backup.mode.replace', '覆盖导入') : PHR.t('backup.mode.merge', '合并导入'),
      n: total, k: skipped
    }));
    return { ok: true, mode: mode, applied: applied, total: total, skipped: skipped };
  }

  /* ================================================================== *
   * 四、重建与清空
   * ================================================================== */

  /* 重置时**不**清掉的键：设备级设置。
     清数据不该把人踢下线，也不该让人重新选一遍界面语言。
     与 core/store.js 的 DEVICE_KEYS 保持一致，另加两个播种标记。 */
  var RESET_KEEP = ['locale', 'debug_mode', 'remembered_account',
                    'sessionRememberDays', 'session.persist', 'seeded', 'seededAt'];

  /**
   * 重建一套完整的示例数据（会清空用户新增的数据）。
   *
   * ⚠️ 不能只调 PHR.seed.run(true)。它只清 PHR.db.schema 里的 12 个集合，
   * 而点赞（community_likes_*）、检索历史、每日待办、测评草稿、以及各集合的
   * .seq 计数器都是散键，不在 schema 里 —— 不一起清就会出现"重置完点赞还在"
   * 这种半脏状态，用户看到会觉得重置没生效。
   */
  function resetDemo() {
    PHR.store.keys().forEach(function (k) {
      if (RESET_KEEP.indexOf(k) >= 0) { return; }
      PHR.store.drop(k);
    });
    /* 上面刚把集合整个删掉，集合仓储的内存缓存还留着旧数组。
       把代数 +1，让所有仓储下次 load() 重新读。 */
    PHR.store.__bumpGeneration();

    var ok = PHR.seed.run(true);
    audit('ux.import', PHR.t('backup.audit.resetDemo', '恢复示例数据：{n} 条健康记录',
      { n: PHR.db.records.count() }));
    return { ok: !!ok, message: ok ? PHR.t('backup.resetDone', '示例数据已恢复。')
                                  : PHR.t('backup.resetSkipped', '示例数据恢复未执行。') };
  }

  /**
   * 清空本地保存的全部数据（危险操作，调用方负责二次确认）。
   * 注意：清空后会写入 seeded=true，否则下次打开页面时"首次运行写入示例数据"
   *      的逻辑会把整套示例数据又装回来，导致"清空"看起来没生效。
   */

  function clearAll() {
    PHR.store.clearAll();
    PHR.store.write('seeded', true);
    audit('ux.import', PHR.t('backup.audit.clear', '清空本地全部健康数据'), 'success');
    return { ok: true, message: PHR.t('backup.cleared', '已清空本地保存的全部数据。') };
  }

  /* ================================================================== *
   * 五、审计与挂载
   * ================================================================== */
  /**
   * 写一节审计日志。action 取 core/dict.js → auditAction 中的键：
   * 导出用 ux.export，导入 / 重建 / 清空这类"写入方向"的高危动作统一用 ux.import。
   */
  function audit(action, detail, result) {
    U.audit({
      action: action, result: result || 'success', targetType: 'backup',
      targetName: PHR.t('backup.targetName', '数据备份与恢复'), detail: detail
    });
  }

  PHR.ux = PHR.ux || {};
  PHR.ux.backup = {
    PASSWORD_MIN: PASSWORD_MIN,
    filename: filename,
    exportAll: exportAll,
    importAll: importAll,
    applyImport: applyImport,
    snapshot: snapshot,
    restore: restore,
    resetDemo: resetDemo,
    clearAll: clearAll
  };

})(window.PHR);
