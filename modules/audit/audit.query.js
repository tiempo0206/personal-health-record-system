/**
 * ============================================================================
 * 文件：modules/audit/audit.query.js
 * 层：业务模块层（访问追踪 —— 模块 6）
 * 职责：审计日志的高级查询、统计与导出。
 *      - 多条件筛选（时间 / 动作 / 分组 / 结果 / 操作者 / 关键词）
 *      - 统计聚合（按动作、按结果、按天、按医生）
 *      - 导出 CSV / JSON（导出动作本身也会留痕）
 * 依赖：modules/audit/audit.service.js、core/dict.js、core/utils.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* ================================================================== *
   * 一、多条件筛选
   * ================================================================== */
  /**
   * @param {object} f {
   *   from, to         时间戳
   *   actions: []      动作 key 数组
   *   groups: []       动作分组（中文名）数组
   *   results: []      success / fail / denied
   *   actorType        user / doctor / system
   *   actor            操作者名字（模糊匹配）
   *   keyword          在动作名、目标名、详情中模糊匹配
   *   onlyRisk         只看 warn 以上
   * }
   */
  function query(f) {
    f = f || {};
    var list = PHR.audit.mine();

    return list.filter(function (e) {
      if (f.from && e.at < f.from) { return false; }
      if (f.to && e.at > f.to) { return false; }

      if (f.actions && f.actions.length && f.actions.indexOf(e.action) < 0) { return false; }
      if (f.groups && f.groups.length && f.groups.indexOf(PHR.audit.actionGroup(e.action)) < 0) { return false; }
      if (f.results && f.results.length && f.results.indexOf(e.result) < 0) { return false; }
      if (f.actorType && e.actorType !== f.actorType) { return false; }
      if (f.actor && String(e.actor).indexOf(f.actor) < 0) { return false; }
      if (f.onlyRisk) {
        var risk = PHR.audit.actionRisk(e.action);
        if (risk !== 'warn' && risk !== 'danger' && e.result === 'success') { return false; }
      }
      if (f.keyword) {
        var hay = [PHR.audit.actionName(e.action), e.targetName, e.detail, e.actor, e.targetType]
          .join(' ').toLowerCase();
        if (hay.indexOf(String(f.keyword).toLowerCase()) < 0) { return false; }
      }
      return true;
    });
  }

  /* ================================================================== *
   * 二、统计聚合
   * ================================================================== */

  /** 总览统计 */
  function stats() {
    var list = PHR.audit.mine();
    var today = U.today();
    var weekAgo = Date.now() - 7 * 86400000;

    return {
      total: list.length,
      today: list.filter(function (e) { return U.fmtDate(e.at) === today; }).length,
      week: list.filter(function (e) { return e.at >= weekAgo; }).length,
      denied: list.filter(function (e) { return e.result === 'denied'; }).length,
      failed: list.filter(function (e) { return e.result === 'fail'; }).length,
      doctors: U.unique(list.filter(function (e) { return e.actorType === 'doctor'; })
        .map(function (e) { return e.actor; })).length,
      firstAt: list.length ? list[list.length - 1].at : null,
      lastAt: list.length ? list[0].at : null
    };
  }

  /** 按动作分组统计 */
  function byGroup() {
    var list = PHR.audit.mine();
    var map = {};
    list.forEach(function (e) {
      var g = PHR.audit.actionGroup(e.action);
      map[g] = (map[g] || 0) + 1;
    });
    return Object.keys(map).map(function (k) { return { label: PHR.audit.actionGroupLabel(k), value: map[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
  }

  /** 按动作统计（取前 N） */
  function byAction(limit) {
    var list = PHR.audit.mine();
    var map = {};
    list.forEach(function (e) {
      var n = PHR.audit.actionName(e.action);
      map[n] = (map[n] || 0) + 1;
    });
    return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, limit || 8);
  }

  /** 按天统计（近 n 天） */
  function byDay(days) {
    days = days || 30;
    var list = PHR.audit.mine();
    var labels = U.lastDays(days);
    var map = {};
    labels.forEach(function (d) { map[d] = 0; });
    list.forEach(function (e) {
      var d = U.fmtDate(e.at);
      if (map[d] !== undefined) { map[d]++; }
    });
    return labels.map(function (d) {
      return { x: U.parseDate(d), y: map[d], label: d.slice(5) };
    });
  }

  /** 医生访问行为统计：谁看了多少次、最近一次什么时候 */
  function byDoctor() {
    var list = PHR.audit.mine().filter(function (e) { return e.actorType === 'doctor'; });
    var map = {};
    list.forEach(function (e) {
      var k = e.actor;
      if (!map[k]) {
        map[k] = { name: k, count: 0, lastAt: 0, denied: 0, scopes: {}, ip: e.ip, device: e.device };
      }
      map[k].count++;
      if (e.at > map[k].lastAt) { map[k].lastAt = e.at; }
      if (e.result === 'denied') { map[k].denied++; }
      if (e.targetName) { map[k].scopes[e.targetName] = (map[k].scopes[e.targetName] || 0) + 1; }
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  /** 异常时段分布：24 小时直方图（用于识别"凌晨访问"） */
  function byHour() {
    var list = PHR.audit.mine().filter(function (e) { return e.actorType === 'doctor'; });
    var hours = [];
    for (var h = 0; h < 24; h++) {
      hours.push({
        label: PHR.t('audit.hourLabel', '{h}时', { h: h }),
        value: list.filter(function (e) { return new Date(e.at).getHours() === h; }).length
      });
    }
    return hours;
  }

  /* ================================================================== *
   * 三、导出
   * ================================================================== */

  /**
   * 审计结果的展示名（与结果徽章共用同一套词条，保证表格与导出用词一致）
   * @param {string} r success / fail / denied
   */
  function resultName(r) {
    if (r === 'success') { return PHR.t('badge.result.success', '成功'); }
    if (r === 'fail') { return PHR.t('badge.result.fail', '失败'); }
    if (r === 'denied') { return PHR.t('badge.result.denied', '已阻断'); }
    return r;
  }

  /**
   * 操作者身份的展示名（审计详情与导出共用）
   * @param {string} type user / doctor / system
   */
  function actorTypeName(type) {
    if (type === 'user') { return PHR.t('audit.actorType.user', '本人'); }
    if (type === 'doctor') { return PHR.t('audit.actorType.doctor', '医生'); }
    if (type === 'system') { return PHR.t('audit.actorType.system', '系统'); }
    return type;
  }

  /** 导出为 CSV 文本 */
  function toCsv(list) {
    list = list || PHR.audit.mine();
    var cols = [
      [PHR.t('audit.col.time', '时间'), function (e) { return U.fmtFull(e.at); }],
      [PHR.t('audit.col.actor', '操作者'), function (e) { return e.actor; }],
      [PHR.t('audit.col.identity', '身份'), function (e) {
        return PHR.audit.actorTypeName(e.actorType);
      }],
      [PHR.t('audit.col.action', '动作'), function (e) { return PHR.audit.actionName(e.action); }],
      [PHR.t('audit.col.targetType', '对象类型'), function (e) { return e.targetType; }],
      [PHR.t('audit.col.target', '对象'), function (e) { return e.targetName; }],
      [PHR.t('audit.col.result', '结果'), function (e) { return resultName(e.result); }],
      [PHR.t('audit.col.detail', '详情'), function (e) { return e.detail; }],
      ['IP', function (e) { return e.ip; }],
      [PHR.t('audit.col.device', '设备'), function (e) { return e.device; }]
    ];

    var esc = function (v) {
      var s = String(v === null || v === undefined ? '' : v).replace(/"/g, '""');
      return '"' + s + '"';
    };

    var lines = [cols.map(function (c) { return esc(c[0]); }).join(',')];
    list.forEach(function (e) {
      lines.push(cols.map(function (c) { return esc(c[1](e)); }).join(','));
    });
    // 加 BOM，保证 Excel 打开中文不乱码
    return '﻿' + lines.join('\r\n');
  }

  /** 导出并下载 */
  function exportFile(format, list) {
    list = list || PHR.audit.mine();
    var stamp = U.fmtDate(Date.now()).replace(/-/g, '') + '_' +
      new Date().getHours() + U.pad2(new Date().getMinutes());

    var ok;
    if (format === 'csv') {
      ok = PHR.ui.dom.download(PHR.t('audit.export.filePrefix', '访问追踪日志_') + stamp + '.csv',
        toCsv(list), 'text/csv;charset=utf-8');
    } else {
      ok = PHR.ui.dom.download(PHR.t('audit.export.filePrefix', '访问追踪日志_') + stamp + '.json',
        JSON.stringify({ exportedAt: Date.now(), count: list.length, entries: list }, null, 2));
    }

    if (ok) {
      PHR.audit.log({
        action: 'ux.export',
        targetType: 'audit',
        targetName: PHR.t('audit.export.targetName', '访问追踪日志（{format}）', { format: format.toUpperCase() }),
        detail: PHR.t('audit.export.detail', '导出 {n} 条审计记录', { n: list.length }),
        result: 'success'
      });
    }
    return ok;
  }

  /* ================================================================== *
   * 四、挂载
   * ================================================================== */
  PHR.audit.query = query;
  PHR.audit.stats = stats;
  PHR.audit.byGroup = byGroup;
  PHR.audit.byAction = byAction;
  PHR.audit.byDay = byDay;
  PHR.audit.byDoctor = byDoctor;
  PHR.audit.byHour = byHour;
  PHR.audit.toCsv = toCsv;
  PHR.audit.exportFile = exportFile;
  PHR.audit.actorTypeName = actorTypeName;

  /** 供界面下拉使用的筛选选项 */
  PHR.audit.filterOptions = function () {
    var groups = U.unique(D.auditAction.map(function (a) { return a.group; }));
    return {
      groups: groups,
      actions: D.auditAction.map(function (a) { return { key: a.key, name: PHR.audit.actionName(a.key), group: a.group }; }),
      results: [
        { key: 'success', name: resultName('success') },
        { key: 'fail', name: resultName('fail') },
        { key: 'denied', name: resultName('denied') }
      ]
    };
  };

})(window.PHR);
