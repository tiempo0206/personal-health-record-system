/**
 * ============================================================================
 * 文件：modules/records/vital.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：体征指标（血压、血糖、心率、体重…）的读写与序列化。
 *      它是"档案中心"与"健康洞察"之间的桥梁：
 *      档案中心负责把这些数字**存下来**，健康洞察负责把它们**讲明白**。
 *      指标定义与阈值全部来自 core/dict-metrics.js，本文件不重复任何医学数字。
 * 依赖：core/dict-metrics.js、modules/records/record.service.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  var LAB_METRIC_ALIAS = {
    '血糖': 'glucose',
    '空腹血糖': 'glucose',
    'fastingglucose': 'glucose',
    '糖化血红蛋白': 'hba1c',
    '糖化': 'hba1c',
    'hba1c': 'hba1c',
    '低密度脂蛋白': 'ldl',
    'ldl': 'ldl',
    'ldlc': 'ldl',
    'ldl-c': 'ldl',
    '尿酸': 'uricAcid',
    '血尿酸': 'uricAcid',
    '肌酐': 'creatinine',
    '血肌酐': 'creatinine',
    '谷丙转氨酶': 'alt',
    'alt': 'alt'
  };

  function norm(v) {
    return String(v === undefined || v === null ? '' : v)
      .trim().toLowerCase()
      .replace(/[\s_\-＿－—–:：()（）]/g, '');
  }

  function metricKeyFromLab(row) {
    if (!row || row.type !== 'lab' || !row.data) { return ''; }
    var raw = row.data.metricKey || row.data.itemName || row.title || '';
    var n = norm(raw);
    if (LAB_METRIC_ALIAS[n]) { return LAB_METRIC_ALIAS[n]; }
    var hit = (D.metrics || []).filter(function (m) {
      return norm(m.key) === n || norm(m.name) === n || norm(m.shortName) === n;
    })[0];
    return hit ? hit.key : '';
  }

  function asMetricRow(row) {
    if (!row) { return null; }
    if (row.type === 'vital') { return row; }
    if (row.type !== 'lab' || !row.data) { return null; }

    var key = metricKeyFromLab(row);
    var m = key ? D.metric(key) : null;
    var value = Number(row.data.result);
    if (!m || isNaN(value)) { return null; }

    var source = row.sourceName || D.nameOf(D.hospital, row.data.hospital) || '';
    return Object.assign({}, row, {
      type: 'vital',
      data: Object.assign({}, row.data, {
        metricKey: key,
        measuredAt: row.data.reportDate || row.dateText,
        value: value,
        value2: '',
        unit: row.data.unit || m.unit,
        measureWay: 'lab',
        context: source ? PHR.t('vital.context.labSource', '检验报告：{name}', { name: source }) : PHR.t('vital.context.lab', '检验报告')
      })
    });
  }

  /* ================================================================== *
   * 一、原始读取
   * ================================================================== */
  /** 全部指标记录（按测量时间升序）。
   *  数据直接来自健康档案：既包含用户手动记录的「体征指标」，
   *  也包含能识别为指标的「检验报告」（如空腹血糖、HbA1c、LDL-C）。 */
  function rows(metricKey) {
    var list = PHR.records.service.all().map(asMetricRow).filter(Boolean);
    if (metricKey) { list = list.filter(function (r) { return r.data.metricKey === metricKey; }); }
    return U.sortBy(list, 'date');
  }

  /**
   * 序列化为折线图数据。
   * @param {string} metricKey
   * @param {object} opt { days, limit, from, to }
   * @returns [{ x:时间戳, y:数值, y2:第二数值, meta:测量情境 }]
   */
  function series(metricKey, opt) {
    opt = opt || {};
    var list = rows(metricKey);

    if (opt.days) {
      var since = Date.now() - opt.days * 86400000;
      list = list.filter(function (r) { return r.date >= since; });
    }
    if (opt.from) { list = list.filter(function (r) { return r.date >= opt.from; }); }
    if (opt.to) { list = list.filter(function (r) { return r.date <= opt.to; }); }

    var out = list.map(function (r) {
      return {
        x: r.date,
        y: Number(r.data.value),
        y2: r.data.value2 === '' || r.data.value2 === undefined ? null : Number(r.data.value2),
        meta: r.data.context || '',
        id: r.id
      };
    }).filter(function (p) { return !isNaN(p.y); });

    if (opt.limit && out.length > opt.limit) { out = out.slice(out.length - opt.limit); }
    return out;
  }

  /** 取单条体征记录 */
  function byId(id) { return PHR.records.service.byId(id); }

  /* ================================================================== *
   * 二、最新值与统计
   * ================================================================== */
  /** 某个指标的最新一次读数 */
  function latest(metricKey) {
    var s = series(metricKey);
    if (!s.length) { return null; }
    var p = s[s.length - 1];
    var m = D.metric(metricKey);
    return {
      metricKey: metricKey,
      metric: m,
      value: p.y,
      value2: p.y2,
      at: p.x,
      meta: p.meta,
      level: D.judge(metricKey, p.y),
      levelName: D.judgeName(D.judge(metricKey, p.y)),
      unit: m ? m.unit : ''
    };
  }

  /** 所有有数据的指标的最新读数 */
  function latestAll() {
    var out = {};
    U.unique(rows().map(function (r) { return r.data.metricKey; })).forEach(function (k) {
      out[k] = latest(k);
    });
    return out;
  }

  /**
   * 某个指标的统计摘要。
   * @returns {{
   *   metric, count, latest, prev, delta, min, max, avg,
   *   level, trend:'up'|'down'|'flat', better:boolean,
   *   inRangeRate:number, series
   * }}
   */
  function summary(metricKey, opt) {
    opt = opt || {};
    var m = D.metric(metricKey);
    var s = series(metricKey, { days: opt.days });
    if (!s.length) {
      return { metric: m, metricKey: metricKey, count: 0, latest: null, series: [] };
    }

    var ys = s.map(function (p) { return p.y; });
    var last = s[s.length - 1];
    var prev = s.length > 1 ? s[s.length - 2] : null;
    var delta = prev ? Number((last.y - prev.y).toFixed(m ? m.decimals : 1)) : 0;

    // 趋势用"最近 5 次与更早 5 次的均值差"判断，比单点比较稳健
    var recentN = Math.min(5, Math.floor(s.length / 2));
    var olderAvg = recentN ? U.avg(ys.slice(-2 * recentN, -recentN)) : U.avg(ys);
    var newerAvg = U.avg(ys.slice(-recentN));
    var diff = newerAvg - olderAvg;
    var threshold = m ? (m.normal.max !== null && m.normal.min !== null
      ? (m.normal.max - m.normal.min) * 0.06 : Math.abs(olderAvg) * 0.03) : 0.1;
    var trend = Math.abs(diff) < (threshold || 0.01) ? 'flat' : (diff > 0 ? 'up' : 'down');

    var better = trend === 'flat' ? true
      : (m && m.better === 'lower') ? trend === 'down'
      : (m && m.better === 'higher') ? trend === 'up'
      : true;

    var inRange = ys.filter(function (v) { return D.judge(metricKey, v) === 'ok'; }).length;

    return {
      metric: m,
      metricKey: metricKey,
      count: s.length,
      latest: {
        value: last.y, value2: last.y2, at: last.x, meta: last.meta,
        level: D.judge(metricKey, last.y),
        levelName: D.judgeName(D.judge(metricKey, last.y))
      },
      prev: prev ? { value: prev.y, value2: prev.y2, at: prev.x } : null,
      delta: delta,
      min: U.min(ys), max: U.max(ys),
      avg: Number(U.avg(ys).toFixed(m ? m.decimals : 1)),
      level: D.judge(metricKey, last.y),
      trend: trend,
      better: better,
      inRangeRate: Math.round(inRange / ys.length * 100),
      from: s[0].x,
      to: last.x,
      series: s
    };
  }

  /** 所有指标的摘要 */
  function summaryAll(opt) {
    return D.metrics.map(function (m) { return summary(m.key, opt); })
      .filter(function (s) { return s.count > 0; });
  }

  /* ================================================================== *
   * 三、写入
   * ================================================================== */
  /**
   * 快速新增一条体征读数（供健康洞察页的"记录一次"快捷入口使用）。
   */
  function add(metricKey, value, value2, measuredAt, opt) {
    opt = opt || {};
    var m = D.metric(metricKey);
    if (!m) { return { ok: false, message: PHR.t('vital.unknownMetric', '未知的指标类型') }; }

    var dt = measuredAt || (U.today() + ' ' + U.pad2(new Date().getHours()) + ':' + U.pad2(new Date().getMinutes()));
    return PHR.records.service.create('vital', {
      metricKey: metricKey,
      measuredAt: dt,
      value: value,
      value2: value2 === undefined || value2 === null ? '' : value2,
      unit: m.unit,
      measureWay: opt.way || 'home',
      context: opt.context || '',
      note: opt.note || ''
    }, { silent: opt.silent });
  }

  /* ================================================================== *
   * 四、异常与提醒
   * ================================================================== */
  /**
   * 某个指标的异常读数（warning 及以上）。
   * @returns [{ at, value, level, levelName, meta }]
   */
  function abnormal(metricKey, days) {
    var s = series(metricKey, { days: days });
    return s.filter(function (p) {
      var lv = D.judge(metricKey, p.y);
      return lv === 'warning' || lv === 'critical';
    }).map(function (p) {
      return {
        at: p.x, value: p.y, id: p.id, meta: p.meta,
        level: D.judge(metricKey, p.y),
        levelName: D.judgeName(D.judge(metricKey, p.y))
      };
    });
  }

  /** 全部指标的异常读数（按时间倒序） */
  function abnormalAll(days) {
    var out = [];
    D.metrics.forEach(function (m) {
      abnormal(m.key, days).forEach(function (a) {
        out.push(Object.assign({ metricKey: m.key, metricName: m.name, unit: m.unit }, a));
      });
    });
    return U.sortBy(out, 'at', true);
  }

  /**
   * 指标覆盖率：最近 30 天里哪些指标完全没记录过。
   * 用于提醒用户"该补测了"。
   */
  function missing(days) {
    days = days || 30;
    var since = Date.now() - days * 86400000;
    return D.metrics.filter(function (m) {
      var s = series(m.key);
      return !s.length || s[s.length - 1].x < since;
    }).map(function (m) {
      var s = series(m.key);
      return {
        metricKey: m.key,
        name: m.name,
        unit: m.unit,
        lastAt: s.length ? s[s.length - 1].x : null,
        desc: m.desc
      };
    });
  }

  /* ================================================================== *
   * 五、单位换算与输入辅助
   * ================================================================== */
  /** 血压这类双值指标的显示文本 */
  function formatReading(metricKey, value, value2) {
    var m = D.metric(metricKey);
    if (!m) { return String(value); }
    if (value2 !== null && value2 !== undefined && value2 !== '') {
      return value + '/' + value2 + ' ' + m.unit;
    }
    return value + ' ' + m.unit;
  }

  /** 该指标是否需要第二个数值（血压） */
  function isDual(metricKey) {
    return metricKey === 'systolic' || metricKey === 'diastolic';
  }

  /** 记录指标时建议的默认测量情境 */
  function defaultContext(metricKey) {
    var map = {
      systolic: '晨起安静状态下测量',
      diastolic: '晨起安静状态下测量',
      glucose: '空腹 8 小时以上',
      hba1c: '无需空腹',
      heartRate: '安静休息 5 分钟后',
      weight: '晨起空腹、排空大小便后',
      bmi: '由身高体重自动计算',
      waist: '站立自然呼吸，测量肚脐水平一周',
      temperature: '腋下测量 5 分钟',
      spo2: '静息状态下指夹测量',
      ldl: '空腹静脉血',
      uricAcid: '空腹静脉血',
      creatinine: '空腹静脉血',
      alt: '空腹静脉血',
      sleepHours: '手环或手机记录',
      steps: '手机或手环计步'
    };
    return PHR.t('vital.context.' + metricKey, map[metricKey] || '');
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.vital = {
    rows: rows,
    series: series,
    byId: byId,
    latest: latest,
    latestAll: latestAll,
    summary: summary,
    summaryAll: summaryAll,
    add: add,
    abnormal: abnormal,
    abnormalAll: abnormalAll,
    missing: missing,
    formatReading: formatReading,
    isDual: isDual,
    defaultContext: defaultContext
  };

})(window.PHR);
