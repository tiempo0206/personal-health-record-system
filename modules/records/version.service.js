/**
 * ============================================================================
 * 文件：modules/records/version.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：健康记录的版本历史 —— 每次新增、修改、删除都保留一份快照，
 *      支持查看"改了什么"（字段级差异）与"回滚到某个版本"。
 *      对应需求原文："所有修改都保留版本记录"、"系统要形成完整记录"。
 * 依赖：core/models.js（PHR.db.versions）、core/utils.js
 * ============================================================================
 *
 * 版本记录结构：
 *   { recordId, version, type, snapshot:{...记录快照...}, action:'create'|'update'|'delete'|'rollback',
 *     changedFields:[{name,label,from,to}], operator, reason, at }
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  function notifyChanged(action, record, before) {
    PHR.bus.emit('record:changed', { action: action, record: record || null, before: before || null });
    [record, before].forEach(function (r) {
      if (r && r.type === 'vital' && r.data && r.data.metricKey) {
        PHR.bus.emit('metric:changed', { metricKey: r.data.metricKey, action: action, record: record || null, before: before || null });
      }
    });
  }

  /* ================================================================== *
   * 一、写入快照
   * ================================================================== */
  /**
   * 记录一个版本。
   * @param {object} record  变更后的记录（删除时传删除前的完整记录）
   * @param {string} action  create | update | delete | rollback
   * @param {object} opt     { before: 变更前的记录, reason, operator }
   */
  function snapshot(record, action, opt) {
    opt = opt || {};
    if (!record) { return null; }

    var changed = [];
    if (opt.before && action === 'update') {
      changed = diff(opt.before, record);
      // 只有标题、字段值确实发生变化时才记版本，避免"打开又保存"产生噪声
      if (!changed.length) { return null; }
    }

    var prev = PHR.db.versions.where(function (v) { return v.recordId === record.id; });
    var version = prev.length ? (U.max(prev, 'version') + 1) : 1;

    var row = PHR.db.versions.insert({
      recordId: record.id,
      userId: record.userId || '',
      version: version,
      type: record.type,
      title: record.title,
      action: action,
      snapshot: U.clone(record),
      changedFields: changed,
      operator: opt.operator || U.t('ver.self', '本人'),
      reason: PHR.security.sanitizeText(opt.reason || '', 200),
      at: Date.now()
    });

    // 同步记录自身的版本号
    if (action !== 'delete') {
      PHR.db.records.update(record.id, { version: version });
    }
    return row;
  }

  /* ================================================================== *
   * 二、字段级差异
   * ================================================================== */
  /**
   * 比较两条记录，返回变化了的字段。
   * @returns [{ name, label, from, to }]
   */
  function diff(before, after) {
    var t = D.recordType(after.type);
    var out = [];

    function fmt(fd, v) {
      if (v === undefined || v === null || v === '') { return U.t('ver.empty', '（空）'); }
      var opts = typeof fd.options === 'function' ? fd.options() : fd.options;
      if (fd.type === 'select') { return D.nameOf(opts || [], v); }
      if (Array.isArray(v)) { return v.map(function (x) { return D.nameOf(opts || [], x) || x; }).join(U.t('ui.listSep', '、')); }
      if (fd.type === 'checkbox') { return v ? U.t('ui.yes', '是') : U.t('ui.no', '否'); }
      if (fd.type === 'date' || fd.type === 'datetime') { return U.fmtDate(U.parseDate(v)); }
      return String(v) + (fd.unit ? ' ' + fd.unit : '');
    }

    t.fields.forEach(function (fd) {
      if (fd.type === 'hidden') { return; }
      var a = before.data ? before.data[fd.name] : undefined;
      var b = after.data ? after.data[fd.name] : undefined;
      var sa = JSON.stringify(a === undefined ? null : a);
      var sb = JSON.stringify(b === undefined ? null : b);
      if (sa === sb) { return; }
      out.push({ name: fd.name, label: fd.label, from: fmt(fd, a), to: fmt(fd, b) });
    });

    // 记录类型允许修改时也要能看出差异
    if (before.type !== after.type) {
      out.unshift({ name: 'type', label: U.t('ver.fieldType', '记录类型'), from: D.recordTypeName(before.type), to: D.recordTypeName(after.type) });
    }
    return out;
  }

  /* ================================================================== *
   * 三、查询
   * ================================================================== */
  /** 某条记录的全部版本（版本号升序） */
  function history(recordId) {
    return U.sortBy(
      PHR.db.versions.where(function (v) { return v.recordId === recordId; }),
      'version'
    );
  }

  /** 某条记录的最近一次变更 */
  function latest(recordId) {
    var list = history(recordId);
    return list.length ? list[list.length - 1] : null;
  }

  /** 最近的 N 条变更（跨所有记录，用于时间线与首页动态） */
  function recent(limit) {
    var list = U.sortBy(PHR.db.versions.all(), 'at', true);
    return limit ? list.slice(0, limit) : list;
  }

  /** 某条记录的变更次数 */
  function countOf(recordId) {
    return PHR.db.versions.where(function (v) { return v.recordId === recordId; }).length;
  }

  /** 统计概览 */
  function stats() {
    var all = PHR.db.versions.all();
    return {
      total: all.length,
      creates: all.filter(function (v) { return v.action === 'create'; }).length,
      updates: all.filter(function (v) { return v.action === 'update'; }).length,
      deletes: all.filter(function (v) { return v.action === 'delete'; }).length,
      rollbacks: all.filter(function (v) { return v.action === 'rollback'; }).length,
      records: U.unique(all.map(function (v) { return v.recordId; })).length
    };
  }

  /* ================================================================== *
   * 四、回滚
   * ================================================================== */
  /**
   * 把记录恢复到指定版本。
   * 注意：回滚本身也会产生一个新版本（action='rollback'），历史不会被抹掉。
   * @param {string} versionId 目标版本记录 id
   * @param {object} opt { reason }
   */
  function rollback(versionId, opt) {
    opt = opt || {};
    var ver = PHR.db.versions.byId(versionId);
    if (!ver) { return { ok: false, message: U.t('ver.notFound', '找不到该版本') }; }

    var current = PHR.db.records.byId(ver.recordId);
    if (!current) {
      return { ok: false, message: U.t('ver.deletedCannotRollback',
        '该记录已被删除，无法回滚。如需恢复，请使用「重新创建」功能。') };
    }

    var restored = U.clone(ver.snapshot);
    restored.id = current.id;
    var saved = PHR.db.records.replace(current.id, restored);
    if (saved) {
      // 用回滚后的内容重建派生字段，保证索引与展示一致
      var normalized = PHR.models.record.create(saved.type, saved.data, {
        userId: saved.userId, source: saved.source, sourceName: saved.sourceName
      });
      saved = PHR.db.records.replace(saved.id, Object.assign(normalized, {
        id: saved.id, createdAt: saved.createdAt, version: saved.version
      }));
    }

    var row = snapshot(saved, 'rollback', {
      before: current,
      reason: opt.reason || U.t('ver.reason.rollback', '回滚到第 {n} 版', { n: ver.version }),
      operator: opt.operator
    });

    notifyChanged('rollback', saved, current);
    return { ok: true, record: saved, version: row,
             message: U.t('ver.rolledBack', '已回滚到第 {n} 版', { n: ver.version }) };
  }

  /**
   * 从历史版本中"复活"一条已被删除的记录。
   */
  function restoreDeleted(versionId) {
    var ver = PHR.db.versions.byId(versionId);
    if (!ver) { return { ok: false, message: U.t('ver.notFound', '找不到该版本') }; }
    if (PHR.db.records.byId(ver.recordId)) {
      return { ok: false, message: U.t('ver.stillExists', '该记录仍然存在，无需恢复') };
    }

    var src = U.clone(ver.snapshot);
    delete src.id;
    delete src.createdAt;
    delete src.updatedAt;
    var created = PHR.db.records.insert(src);
    snapshot(created, 'create', { reason: U.t('ver.reason.restore', '从历史版本恢复被删除的记录') });
    notifyChanged('restore', created);
    return { ok: true, record: created, message: U.t('ver.restored', '已恢复该记录') };
  }

  /* ================================================================== *
   * 五、清理
   * ================================================================== */
  /** 记录被彻底删除时，一并清理它的版本（仅在用户明确要求时调用） */
  function purge(recordId) {
    return PHR.db.versions.removeWhere(function (v) { return v.recordId === recordId; });
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.versions = {
    snapshot: snapshot,
    diff: diff,
    history: history,
    latest: latest,
    recent: recent,
    countOf: countOf,
    stats: stats,
    rollback: rollback,
    restoreDeleted: restoreDeleted,
    purge: purge
  };

})(window.PHR);
