/**
 * ============================================================================
 * 文件：modules/records/record.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：健康记录的统一读写服务 —— 这是整个系统数据量的主体。
 *      · 新增 / 修改 / 删除（自动写版本快照与审计日志）
 *      · 多条件查询（类型、时间、疾病分类、来源、关键词）
 *      · 授权范围过滤（医生视图与"这条记录会不会给医生看"提示都靠它）
 *      · 统计汇总（首页卡片、体检报告式概览）
 * 依赖：core/models.js、core/dict*.js、modules/records/{categories,version.service}.js、modules/audit
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var V = PHR.records.versions;

  function notifyChanged(action, record, before) {
    PHR.bus.emit('record:changed', { action: action, record: record || null, before: before || null });

    var keys = [];
    if (record && record.type === 'vital' && record.data) { keys.push(record.data.metricKey); }
    if (before && before.type === 'vital' && before.data) { keys.push(before.data.metricKey); }
    U.unique(keys.filter(Boolean)).forEach(function (key) {
      PHR.bus.emit('metric:changed', { metricKey: key, action: action, record: record || null, before: before || null });
    });
  }

  /* ================================================================== *
   * 一、读取
   * ================================================================== */

  /**
   * 当前用户的全部记录（时间倒序）。
   *
   * ⚠️ 安全约束：没有登录身份时**必须返回空数组**，绝不能返回全库数据。
   * 这里曾经写作 `!uid || r.userId === uid` —— 那是一个真实的越权漏洞：
   * 医生访客的 session.userId() 返回空串，于是 `!uid` 成立，
   * 任何没有 userId 的调用者都能拿到库里**所有患者**的记录。
   * 授权的作用是「只能看被授权的范围」，不是「换一个入口就能看全部」。
   * 修改此处前请先阅读 ui/shell.js 的医生访客守卫。
   */
  /**
   * 把一条记录转成"按当前语言渲染"的副本。
   *
   * 种子数据的长文本以中文原文入库，词条键挂在 row.i18n 上（见 core/models.js）。
   * 直接读 row.data 会在英文界面下冒出中文。这里在**读取路径**统一解析，
   * 于是下游（列表、时间线、检索、首页待办、基本信息的过敏/用药摘要…）全跟着变，
   * 不必逐个改调用点。
   *
   * ⚠️ 只解析 data 与 summary，**不动 title 与 tags**：
   *   · title   —— sync.service 的查重拿它与新建记录的 title 比对，两边都得是规范值；
   *                 显示标题请用 PHR.models.record.displayTitle(row)。
   *   · tags    —— 同时充当筛选器的取值，一旦变成译文就对不上库里的原值了。
   *
   * 只做浅拷贝：写入路径走 PHR.db.records，与这里无关。表单即使拿到解析后的
   * 英文值，models.record.create() 也会按词条把它规范回中文原文。
   */
  function localized(row) {
    if (!row || !row.i18n) { return row; }
    var out = Object.assign({}, row);
    out.data = PHR.models.record.resolvedData(row);
    out.summary = PHR.models.record.summaryOf(row);
    return out;
  }

  function all() {
    var uid = PHR.session.userId();
    if (!uid) { return []; }
    return U.sortBy(
      PHR.db.records.all().filter(function (r) { return r.userId === uid; }),
      'date', true
    ).map(localized);
  }

  /** 按 id 取单条；无登录身份或不属于本人时返回 null（同样不允许旁路） */
  function byId(id) {
    var r = PHR.db.records.byId(id);
    if (!r) { return null; }
    var uid = PHR.session.userId();
    if (!uid || r.userId !== uid) { return null; }
    return localized(r);
  }

  /**
   * 多条件查询。
   * @param {object} f {
   *   types:[]        记录类型
   *   diseaseCats:[]  疾病分类
   *   scopes:[]       授权范围
   *   sources:[]      manual | sync | import
   *   from, to        时间戳区间（按记录的发生日期）
   *   keyword         简单关键词（高级检索见 modules/search）
   *   abnormalOnly    只看被标记为异常的
   *   sort            'date'(默认,倒序) | 'dateAsc' | 'created' | 'type' | 'severity'
   *   limit
   * }
   */
  function list(f) {
    f = f || {};
    var rows = all();

    if (f.types && f.types.length) { rows = rows.filter(function (r) { return f.types.indexOf(r.type) >= 0; }); }
    if (f.diseaseCats && f.diseaseCats.length) { rows = rows.filter(function (r) { return f.diseaseCats.indexOf(r.diseaseCat) >= 0; }); }
    if (f.scopes && f.scopes.length) {
      rows = rows.filter(function (r) { return f.scopes.indexOf(PHR.records.categories.scopeOf(r)) >= 0; });
    }
    if (f.sources && f.sources.length) { rows = rows.filter(function (r) { return f.sources.indexOf(r.source) >= 0; }); }
    if (f.from) { rows = rows.filter(function (r) { return r.date >= f.from; }); }
    if (f.to) { rows = rows.filter(function (r) { return r.date <= f.to; }); }
    if (f.abnormalOnly) { rows = rows.filter(function (r) { return r.abnormal; }); }
    if (f.hasSeverity) { rows = rows.filter(function (r) { return !!r.severity; }); }

    if (f.keyword) {
      var k = String(f.keyword).toLowerCase();
      rows = rows.filter(function (r) {
        return (r.searchText || '').indexOf(k) >= 0 ||
               String(r.title).toLowerCase().indexOf(k) >= 0;
      });
    }

    switch (f.sort) {
      case 'dateAsc': rows = U.sortBy(rows, 'date'); break;
      case 'created': rows = U.sortBy(rows, 'createdAt', true); break;
      case 'type':    rows = U.sortBy(rows, 'type'); break;
      case 'severity':
        rows = U.sortBy(rows, function (r) {
          var s = (D.severity || []).filter(function (x) { return x.key === r.severity; })[0];
          return s ? s.weight : -1;
        }, true);
        break;
      default: rows = U.sortBy(rows, 'date', true);
    }

    return f.limit ? rows.slice(0, f.limit) : rows;
  }

  /** 按类型取 */
  function byType(type) { return list({ types: [type] }); }

  /** 最近 N 条 */
  function recent(limit) { return list({ limit: limit || 8 }); }

  /* ================================================================== *
   * 二、写入
   * ================================================================== */
  /**
   * 新增一条记录。
   * @param {string} type 记录类型 key
   * @param {object} values 表单值
   * @param {object} opt { source, sourceName, silent }
   */
  function create(type, values, opt) {
    opt = opt || {};

    var check = PHR.models.record.validate(type, values);
    if (!check.ok) {
      return { ok: false, errors: check.errors, message: check.list.join(U.t('ui.listSep', '；')) };
    }

    var uid = PHR.session.userId();
    var row = PHR.models.record.create(type, values, {
      userId: uid,
      source: opt.source || 'manual',
      sourceName: opt.sourceName || ''
    });

    var saved = PHR.db.records.insert(row);
    V.snapshot(saved, 'create', { reason: opt.reason || U.t('ver.reason.create', '新建记录') });

    if (!opt.silent) {
      PHR.audit.log({
        action: 'record.create', targetType: 'record', targetId: saved.id, targetName: saved.title,
        detail: U.t('rec.audit.create', '新增「{type}」：{title}',
                  { type: D.recordTypeName(type), title: saved.title }),
        result: 'success'
      });
    }
    notifyChanged('create', saved);
    return { ok: true, record: saved, message: U.t('rec.saved', '已保存') };
  }

  /**
   * 修改一条记录。
   * @param {object} opt { reason, silent }
   */
  function update(id, values, opt) {
    opt = opt || {};
    var before = PHR.db.records.byId(id);
    if (!before) { return { ok: false, message: U.t('rec.notFoundOrDeleted', '记录不存在或已被删除') }; }

    var check = PHR.models.record.validate(before.type, values);
    if (!check.ok) {
      return { ok: false, errors: check.errors, message: check.list.join(U.t('ui.listSep', '；')) };
    }

    var rebuilt = PHR.models.record.create(before.type, values, {
      userId: before.userId,
      source: before.source,
      sourceName: before.sourceName
    });
    rebuilt.id = before.id;

    var saved = PHR.db.records.replace(id, rebuilt);
    if (!saved) { return { ok: false, message: U.t('rec.saveFailed', '保存失败，请重试') }; }

    var ver = V.snapshot(saved, 'update', { before: before, reason: opt.reason });

    if (!opt.silent) {
      PHR.audit.log({
        action: 'record.update', targetType: 'record', targetId: saved.id, targetName: saved.title,
        detail: ver && ver.changedFields.length
          ? U.t('rec.audit.changed', '修改了 {list}', {
              list: ver.changedFields.map(function (c) { return c.label; }).join(U.t('ui.listSep', '、'))
            })
          : U.t('rec.audit.noChange', '保存记录（内容未变化）'),
        result: 'success'
      });
    }
    notifyChanged('update', saved, before);
    return {
      ok: true, record: saved, version: ver,
      message: ver
        ? U.t('rec.savedVersion', '已保存，产生第 {n} 版', { n: ver.version })
        : U.t('rec.savedNoChange', '已保存（内容未变化，未产生新版本）')
    };
  }

  /**
   * 删除一条记录（保留版本快照，可恢复）。
   */
  function remove(id, reason, opt) {
    opt = opt || {};
    var row = PHR.db.records.byId(id);
    if (!row) { return { ok: false, message: U.t('rec.notFound', '记录不存在') }; }

    V.snapshot(row, 'delete', { reason: reason || U.t('ver.reason.delete', '删除记录') });
    PHR.db.records.remove(id);

    PHR.audit.log({
      action: 'record.delete', targetType: 'record', targetId: id, targetName: row.title,
      detail: U.t('rec.audit.delete', '删除「{type}」：{title}{reason}（版本快照已保留，可在版本历史中恢复）', {
        type: D.recordTypeName(row.type),
        title: row.title,
        reason: reason ? U.t('rec.audit.deleteReason', '　原因：{v}', { v: reason }) : ''
      }),
      result: 'success'
    });
    notifyChanged('delete', null, row);

    return { ok: true, message: U.t('rec.deleted', '已删除，可在版本历史中找回'), version: V.latest(id) };
  }

  /* ================================================================== *
   * 三、授权范围过滤
   * ================================================================== */
  /**
   * 取一条授权所覆盖的记录。
   * 这是"医生只能看到被授权内容"的**唯一判定入口**：
   *   · 授权范围 scopes 决定能看到哪些数据类型
   *   · 若授权额外指定了 recordIds，则只返回这些记录
   * @param {object} consent
   * @param {object} opt { scopeKey } 只取某一个范围的内容
   */
  function forConsent(consent, opt) {
    opt = opt || {};
    if (!consent) { return []; }
    // 过滤规则同样在 core/security.js（与心理测评共用），本函数只提供数据源与 scopeOf
    var rows = PHR.security.filterByConsent(
      PHR.db.records.all(),
      consent,
      PHR.records.categories.scopeOf,
      opt.scopeKey
    );
    return U.sortBy(rows, 'date', true);
  }

  /**
   * 判断某一条记录对某个查看者是否可见。
   *
   * 判定逻辑本身在 core/security.js 的 canViewScoped 里（与心理测评共用同一份实现），
   * 本函数只负责"取这条记录属于哪个范围"这一件记录集合特有的事。
   * 这样"医生只能看到被授权内容"的判定实现全项目只有一处。
   *
   * @param {object} record
   * @param {object} consent 医生访客所凭授权；本人查看时传 null
   * @returns {boolean}
   */
  function canView(record, consent) {
    if (!record) { return false; }
    return PHR.security.canViewScoped(record, consent, PHR.records.categories.scopeOf(record));
  }

  /** 按授权范围把记录分组，供医生视图使用 */
  function groupByScope(records) {
    var map = {};
    (records || []).forEach(function (r) {
      var s = PHR.records.categories.scopeOf(r);
      (map[s] = map[s] || []).push(r);
    });
    return (D.consentScope || []).map(function (s) {
      return {
        key: s.key,
        name: D.nameOf(D.consentScope, s.key),
        desc: U.t('cat.scope.' + s.key + '.desc', s.desc),
        records: map[s.key] || [],
        count: (map[s.key] || []).length
      };
    }).filter(function (g) { return g.count > 0; });
  }

  /* ================================================================== *
   * 四、统计
   * ================================================================== */
  function stats() {
    var rows = all();
    var now = Date.now();
    var recent30 = rows.filter(function (r) { return now - r.date <= 30 * 86400000; });

    return {
      total: rows.length,
      recent30: recent30.length,
      types: U.unique(rows.map(function (r) { return r.type; })).length,
      byType: PHR.records.categories.countByType(rows),
      byDisease: PHR.records.categories.countByDiseaseCat(rows),
      abnormal: rows.filter(function (r) { return r.abnormal; }).length,
      synced: rows.filter(function (r) { return r.source === 'sync'; }).length,
      versioned: PHR.records.versions.stats(),
      firstAt: rows.length ? U.min(rows, 'date') : null,
      lastAt: rows.length ? U.max(rows, 'date') : null
    };
  }

  /** 按月统计记录数，用于时间线的密度图 */
  function byMonth(months) {
    var rows = all();
    var out = [];
    var d = new Date();
    d.setDate(1);
    for (var i = (months || 12) - 1; i >= 0; i--) {
      var dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
      var start = dd.getTime();
      var end = new Date(dd.getFullYear(), dd.getMonth() + 1, 1).getTime();
      out.push({
        label: U.t('rec.monthLabel', '{m}月', { m: dd.getMonth() + 1 }),
        fullLabel: U.t('rec.monthFull', '{y} 年 {m} 月', { y: dd.getFullYear(), m: dd.getMonth() + 1 }),
        value: rows.filter(function (r) { return r.date >= start && r.date < end; }).length,
        year: dd.getFullYear(),
        month: dd.getMonth() + 1
      });
    }
    return out;
  }

  /* ================================================================== *
   * 五、批量操作
   * ================================================================== */
  /** 批量删除 */
  function removeMany(ids, reason) {
    var n = 0;
    (ids || []).forEach(function (id) { if (remove(id, reason).ok) { n++; } });
    return { ok: true, count: n, message: U.t('rec.removedN', '已删除 {n} 条记录', { n: n }) };
  }

  /** 批量打标签 */
  function tagMany(ids, tags) {
    var n = 0;
    (ids || []).forEach(function (id) {
      var r = PHR.db.records.byId(id);
      if (!r) { return; }
      var merged = U.unique((r.tags || []).concat(tags || []));
      var saved = PHR.db.records.update(id, { tags: merged });
      if (saved) {
        notifyChanged('tag', saved, r);
        n++;
      }
    });
    return { ok: true, count: n };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.service = {
    all: all,
    byId: byId,
    list: list,
    byType: byType,
    recent: recent,
    create: create,
    update: update,
    remove: remove,
    removeMany: removeMany,
    tagMany: tagMany,
    forConsent: forConsent,
    canView: canView,
    groupByScope: groupByScope,
    stats: stats,
    byMonth: byMonth
  };

})(window.PHR);
