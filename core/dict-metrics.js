/**
 * ============================================================================
 * 文件：core/dict-metrics.js
 * 层：核心基础设施层（数据字典 · 第三部分：体征指标与阈值）
 * 职责：定义"体征指标"这一记录类型的全部可量化指标，以及每个指标的
 *      正常 / 警戒 / 危急三级阈值。健康洞察模块只负责"用"这些阈值，
 *      不自己书写任何医学数字，保证阈值口径全局唯一。
 * 依赖：core/dict.js
 * ============================================================================
 *
 * 阈值模型（三级）：
 *   normal 区间内         → ok       正常
 *   normal 之外、warn 之内 → warning  需要关注
 *   超出 warn 区间         → critical 明显异常，建议尽快就医
 *
 * 每个区间写成 { min, max }，任一侧为 null 表示该侧不设限。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var D = PHR.dict;

  /** 构造一个区间 */
  function r(min, max) { return { min: min, max: max }; }

  D.metrics = [

    /* ------------------------------ 血压 ------------------------------ */
    {
      key: 'systolic', name: '收缩压（高压）', shortName: '收缩压',
      unit: 'mmHg', category: 'cardio', decimals: 0, group: 'bp', order: 1,
      normal: r(90, 129), warn: r(80, 179), better: 'lower', target: 120,
      desc: '心脏收缩时动脉内的最高压力。家庭自测建议连续测量 7 天取平均值。',
      adviceNormal: '血压处于理想区间，继续保持低盐饮食与规律作息。',
      adviceWarn: '血压偏离理想区间，建议减少钠盐摄入、控制体重，并连续监测一周。',
      adviceCritical: '血压已达到需要干预的水平，请尽快到心血管内科就诊，不要自行调整降压药。'
    },
    {
      key: 'diastolic', name: '舒张压（低压）', shortName: '舒张压',
      unit: 'mmHg', category: 'cardio', decimals: 0, group: 'bp', order: 2,
      normal: r(60, 84), warn: r(50, 109), better: 'lower', target: 80,
      desc: '心脏舒张时动脉内的最低压力。',
      adviceNormal: '舒张压正常。',
      adviceWarn: '舒张压偏离理想区间，请关注睡眠质量与情绪压力。',
      adviceCritical: '舒张压明显异常，请尽快就医评估。'
    },

    /* ------------------------------ 血糖 ------------------------------ */
    {
      key: 'glucose', name: '空腹血糖', shortName: '血糖',
      unit: 'mmol/L', category: 'endocrine', decimals: 1, group: null, order: 3,
      normal: r(3.9, 6.1), warn: r(3.0, 11.1), better: 'range', target: 5.6,
      desc: '至少空腹 8 小时后的静脉血或指尖血血糖值。',
      adviceNormal: '空腹血糖正常，注意控制精制碳水摄入。',
      adviceWarn: '空腹血糖偏高或偏低，建议复查糖化血红蛋白，并记录餐后血糖。',
      adviceCritical: '血糖显著异常，存在急性并发症风险，请立即就医。'
    },
    {
      key: 'hba1c', name: '糖化血红蛋白', shortName: 'HbA1c',
      unit: '%', category: 'endocrine', decimals: 1, group: null, order: 4,
      normal: r(4.0, 6.0), warn: r(4.0, 8.0), better: 'lower', target: 6.5,
      desc: '反映过去 2~3 个月的平均血糖水平，通常每 3 个月复查一次。',
      adviceNormal: '近三个月血糖控制良好。',
      adviceWarn: '血糖长期控制欠佳，建议与内分泌科医生讨论用药方案。',
      adviceCritical: '糖化血红蛋白显著升高，需要尽快调整治疗方案。'
    },

    /* ------------------------------ 心血管 ------------------------------ */
    {
      key: 'heartRate', name: '静息心率', shortName: '心率',
      unit: '次/分', category: 'cardio', decimals: 0, group: null, order: 5,
      normal: r(60, 100), warn: r(50, 120), better: 'lower', target: 72,
      desc: '安静状态下每分钟心跳次数，建议晨起未起身时测量。',
      adviceNormal: '静息心率正常。',
      adviceWarn: '心率偏离正常范围，注意是否有咖啡因摄入、发热或情绪波动影响。',
      adviceCritical: '心率明显异常，若伴随胸闷、晕厥请立即就医。'
    },

    /* ------------------------------ 体型 ------------------------------ */
    {
      key: 'weight', name: '体重', shortName: '体重',
      unit: 'kg', category: 'endocrine', decimals: 1, group: null, order: 6,
      normal: r(null, null), warn: r(null, null), better: 'range', target: null,
      noThreshold: true,
      desc: '体重本身没有绝对正常值，系统关注的是变化趋势与 BMI。',
      adviceNormal: '建议每周固定时间、空腹、同一着装测量并记录。',
      adviceWarn: '体重变化较快时建议关注饮食与水肿情况。',
      adviceCritical: '短期内体重明显变化，建议就医排查原因。'
    },
    {
      key: 'bmi', name: '体质指数 BMI', shortName: 'BMI',
      unit: 'kg/m²', category: 'endocrine', decimals: 1, group: null, order: 7,
      normal: r(18.5, 23.9), warn: r(17.0, 27.9), better: 'range', target: 22,
      autoCompute: 'bmi',
      desc: 'BMI = 体重(kg) ÷ 身高(m)²，中国成人标准 18.5~23.9 为正常。',
      adviceNormal: '体重处于健康区间。',
      adviceWarn: '体重偏轻或超重，建议通过饮食与运动逐步调整，避免快速减重。',
      adviceCritical: 'BMI 处于肥胖或消瘦区间，建议到营养科或内分泌科评估。'
    },
    {
      key: 'waist', name: '腰围', shortName: '腰围',
      unit: 'cm', category: 'endocrine', decimals: 1, group: null, order: 8,
      normal: r(0, 85), warn: r(0, 90), better: 'lower', target: 80,
      desc: '中国成人男性 ≥90cm、女性 ≥85cm 提示中心性肥胖。此处按通用阈值给出。',
      adviceNormal: '腰围在合理范围。',
      adviceWarn: '腰围偏大，内脏脂肪风险升高，建议增加有氧运动。',
      adviceCritical: '腰围显著超标，代谢综合征风险较高，建议就医评估。'
    },

    /* ------------------------------ 其他 ------------------------------ */
    {
      key: 'temperature', name: '体温', shortName: '体温',
      unit: '°C', category: 'infectious', decimals: 1, group: null, order: 9,
      normal: r(36.0, 37.2), warn: r(35.0, 38.5), better: 'range', target: 36.5,
      desc: '腋下体温 36.0~37.2°C 为正常。',
      adviceNormal: '体温正常。',
      adviceWarn: '存在低热或体温偏低，注意休息并多饮水，持续 3 天请就诊。',
      adviceCritical: '高热或体温过低，请立即就医。'
    },
    {
      key: 'spo2', name: '血氧饱和度', shortName: '血氧',
      unit: '%', category: 'respiratory', decimals: 0, group: null, order: 10,
      normal: r(95, 100), warn: r(90, 100), better: 'higher', target: 98,
      desc: '指夹式血氧仪测得的动脉血氧饱和度。',
      adviceNormal: '血氧正常。',
      adviceWarn: '血氧偏低，若伴随咳嗽、气促请尽快就诊呼吸内科。',
      adviceCritical: '血氧明显下降，属于急症信号，请立即就医或呼叫急救。'
    },
    {
      key: 'ldl', name: '低密度脂蛋白', shortName: 'LDL-C',
      unit: 'mmol/L', category: 'cardio', decimals: 2, group: null, order: 11,
      normal: r(0, 3.4), warn: r(0, 4.1), better: 'lower', target: 2.6,
      desc: '俗称"坏胆固醇"，是动脉粥样硬化的主要危险因素。',
      adviceNormal: '血脂控制良好。',
      adviceWarn: 'LDL-C 偏高，建议减少饱和脂肪摄入并增加运动。',
      adviceCritical: 'LDL-C 显著升高，建议心内科评估是否需要他汀类药物治疗。'
    },
    {
      key: 'uricAcid', name: '血尿酸', shortName: '尿酸',
      unit: 'μmol/L', category: 'urinary', decimals: 0, group: null, order: 12,
      normal: r(150, 420), warn: r(100, 540), better: 'lower', target: 360,
      desc: '尿酸升高与痛风、肾结石相关。',
      adviceNormal: '尿酸正常。',
      adviceWarn: '尿酸偏高，建议限制高嘌呤食物与酒精，多饮水。',
      adviceCritical: '尿酸显著升高，建议风湿免疫科就诊并评估用药。'
    },
    {
      key: 'creatinine', name: '血肌酐', shortName: '肌酐',
      unit: 'μmol/L', category: 'urinary', decimals: 0, group: null, order: 13,
      normal: r(44, 106), warn: r(30, 150), better: 'lower', target: 80,
      desc: '反映肾功能的基础指标。',
      adviceNormal: '肾功能指标正常。',
      adviceWarn: '肌酐偏离参考范围，注意避免肾毒性药物并复查。',
      adviceCritical: '肌酐明显异常，请尽快到肾内科就诊。'
    },
    {
      key: 'alt', name: '谷丙转氨酶', shortName: 'ALT',
      unit: 'U/L', category: 'digestive', decimals: 0, group: null, order: 14,
      normal: r(0, 40), warn: r(0, 120), better: 'lower', target: 25,
      desc: '反映肝细胞损伤的常用指标。',
      adviceNormal: '肝功能指标正常。',
      adviceWarn: 'ALT 轻度升高，建议戒酒、规律作息，2~4 周后复查。',
      adviceCritical: 'ALT 显著升高，请尽快到消化内科或肝病科就诊。'
    },
    {
      key: 'sleepHours', name: '睡眠时长', shortName: '睡眠',
      unit: '小时', category: 'mental', decimals: 1, group: null, order: 15,
      normal: r(7, 9), warn: r(5, 12), better: 'range', target: 8,
      desc: '前一晚的实际睡眠小时数。',
      adviceNormal: '睡眠时长合适。',
      adviceWarn: '睡眠不足或过多，长期会影响血压与血糖，建议固定作息。',
      adviceCritical: '睡眠时长严重偏离，若伴随情绪问题建议到睡眠门诊咨询。'
    },
    {
      key: 'steps', name: '每日步数', shortName: '步数',
      unit: '步', category: 'musculo', decimals: 0, group: null, order: 16,
      normal: r(6000, null), warn: r(3000, null), better: 'higher', target: 8000,
      desc: '每日累计步数，来自手机或手环。',
      adviceNormal: '活动量达标。',
      adviceWarn: '活动量偏低，建议每天增加 20 分钟快走。',
      adviceCritical: '长期久坐会显著增加慢病风险，请逐步增加日常活动量。'
    }
  ];

  /* ------------------------------------------------------------------ *
   * 国际化：把 name / shortName 改成读取词条的访问器
   * 这样 `D.metric('bmi').name` 这类**直接属性访问**（全站有几十处）
   * 也会随语言切换，无需改动任何调用点。
   * ------------------------------------------------------------------ */
  D.metrics.forEach(function (m) {
    var zhName = m.name, zhShort = m.shortName;
    Object.defineProperty(m, 'name', {
      enumerable: true, configurable: true,
      get: function () {
        return PHR.i18n ? PHR.i18n.dictName('metric', m.key, zhName) : zhName;
      }
    });
    Object.defineProperty(m, 'shortName', {
      enumerable: true, configurable: true,
      get: function () {
        return PHR.i18n ? PHR.i18n.dictName('metricShort', m.key, zhShort) : zhShort;
      }
    });
  });

  /* ------------------------------------------------------------------ *
   * 国际化：指标的展示文案
   * ------------------------------------------------------------------
   * 词条键约定（每个指标一套）：
   *   dict.metric.<key>.desc            指标是什么
   *   dict.metric.<key>.adviceNormal    正常档的建议
   *   dict.metric.<key>.adviceWarn      需关注档的建议
   *   dict.metric.<key>.adviceCritical  明显异常档的建议
   *   dict.metricUnit.<key>             单位
   *
   * 这些字段在健康洞察里被直接读取（m.desc / m.adviceNormal / m.unit …），
   * 改成访问器后：指标详情、趋势说明、异常提醒、正常范围文本
   * （例如「90~129 mmHg」）会一起变成英文，无需改动 insight 模块。
   *
   * 单位只给**中文单位**（次/分、小时、步）登记词条；
   * mmHg / mmol/L / % / kg 等本就是国际写法，词条缺失即原样显示。
   * ------------------------------------------------------------------ */
  /** 把 obj[prop] 换成读词条的访问器（词条缺失时原样回退到中文原文） */
  function i18nAccessor(obj, prop, key) {
    var d = Object.getOwnPropertyDescriptor(obj, prop);
    if (!d || d.get || d.value === undefined) { return; }
    var zh = d.value;
    Object.defineProperty(obj, prop, {
      enumerable: true, configurable: true,
      get: function () { return PHR.t(key, zh); }
    });
  }

  D.metrics.forEach(function (m) {
    i18nAccessor(m, 'desc', 'dict.metric.' + m.key + '.desc');
    i18nAccessor(m, 'adviceNormal', 'dict.metric.' + m.key + '.adviceNormal');
    i18nAccessor(m, 'adviceWarn', 'dict.metric.' + m.key + '.adviceWarn');
    i18nAccessor(m, 'adviceCritical', 'dict.metric.' + m.key + '.adviceCritical');
    i18nAccessor(m, 'unit', 'dict.metricUnit.' + m.key);
  });

  /* ------------------------------------------------------------------ *
   * 便捷索引与查询
   * ------------------------------------------------------------------ */
  D.metricMap = D.index(D.metrics);

  /** 取指标定义，找不到返回 undefined */
  D.metric = function (key) { return D.metricMap[key]; };

  /** 取指标中文名，找不到回退到 key */
  D.metricName = function (key) {
    var m = D.metricMap[key];
    return m ? m.name : (key || '未知指标');
  };

  /**
   * 按 group 归并指标，用于"一张卡片画多条曲线"（例如血压的收缩压 + 舒张压）。
   * 返回 [{ key, name, unit, members: [metric, ...] }]
   */
  D.metricGroups = function () {
    var groups = {};
    D.metrics.forEach(function (m) {
      var g = m.group || m.key;
      if (!groups[g]) { groups[g] = { key: g, name: m.group ? g : m.name, unit: m.unit, members: [] }; }
      groups[g].members.push(m);
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      if (g.members.length > 1) {
        g.name = g.members.map(function (m) { return m.shortName || m.name; }).join(' / ');
      }
      g.members.sort(function (a, b) { return a.order - b.order; });
      return g;
    }).sort(function (a, b) { return a.members[0].order - b.members[0].order; });
  };

  /**
   * 判定一个数值的等级。
   * @returns {'ok'|'warning'|'critical'|'unknown'}
   */
  D.judge = function (metricKey, value) {
    var m = D.metricMap[metricKey];
    if (!m || m.noThreshold || value === null || value === undefined || isNaN(value)) { return 'unknown'; }
    var v = Number(value);
    var inRange = function (range) {
      if (!range) { return true; }
      if (range.min !== null && range.min !== undefined && v < range.min) { return false; }
      if (range.max !== null && range.max !== undefined && v > range.max) { return false; }
      return true;
    };
    if (inRange(m.normal)) { return 'ok'; }
    if (inRange(m.warn)) { return 'warning'; }
    return 'critical';
  };

  /** 等级中文名 */
  D.judgeName = function (level) {
    var zh = { ok: '正常', warning: '需要关注', critical: '明显异常', unknown: '—' }[level] || '—';
    return PHR.i18n ? PHR.i18n.t('dict.judge.' + level, zh) : zh;
  };

  /** 等级对应的提示语气色（与 ui/components/badge.js 的 tone 保持一致） */
  D.judgeTone = function (level) {
    return { ok: 'ok', warning: 'warn', critical: 'danger', unknown: 'muted' }[level] || 'muted';
  };

})(window.PHR);
