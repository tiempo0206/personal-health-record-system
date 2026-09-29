/**
 * ============================================================================
 * 文件：modules/search/filters.js
 * 层：业务模块层（智能搜索 —— 模块 3）
 * 职责：检索条件的唯一口径来源：
 *      · default()      默认筛选条件对象
 *      · options()      各筛选项的候选项（类型 / 疾病分类 / 授权范围 / 来源 / 严重程度 / 标签）
 *      · apply()        按条件过滤记录数组（时间区间、类型、分类、来源、严重程度、异常、标签）
 *      · activeChips()  已选条件的中文标签（界面展示 + 单条移除）
 *      · describe()     用一句话描述当前条件，供结果说明与审计日志复用
 *      · presets()      预设筛选（近 3 个月检验报告 / 所有异常结果 / 心血管相关…）
 * 依赖：core/{namespace,utils,dict,dict-records}.js、modules/records/{record.service,categories}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  PHR.search = PHR.search || {};

  var U = PHR.util;
  var D = PHR.dict;

  var SOURCES = [
    { key: 'manual', name: '手动录入', icon: '✍️' },
    { key: 'sync',   name: '医院同步', icon: '🔄' },
    { key: 'import', name: '外部导入', icon: '📥' }
  ];

  var SORT_OPTIONS = [
    { key: 'relevance', name: '相关度' },
    { key: 'date',      name: '时间最新' },
    { key: 'dateAsc',   name: '时间最早' }
  ];

  /**
   * 来源 / 排序的显示名。
   * ⚠️ 上面两张表的 name 在**模块加载时**就求值了，那时语言还没确定
   *    （core/boot.js 才调用 i18n.detect()），所以不能把 PHR.t(...) 写进数组里 ——
   *    必须在渲染 / 描述的时候按当前语言取词，切换语言才会立即生效。
   */
  function sourceName(key) {
    var hit = SOURCES.filter(function (s) { return s.key === key; })[0];
    return U.t('search.filters.source.' + key, hit ? hit.name : key);
  }
  function sortName(key) {
    var hit = SORT_OPTIONS.filter(function (s) { return s.key === key; })[0];
    return U.t('search.filters.sort.' + key, hit ? hit.name : key);
  }

  /** 列表连接符：中文「、」，英文「, 」 */
  function listJoiner() { return U.t('search.filters.listJoiner', '、'); }
  /** 分句连接符：两种语言都用「 · 」 */
  function partJoiner() { return U.t('search.filters.partJoiner', ' · '); }

  /* ================================================================== *
   * 一、条件对象
   * ================================================================== */
  /** 默认（空）筛选条件：全部字段都是"不限" */
  function defaultFilter() {
    return {
      keyword: '',          // 关键词（与主搜索框同源）
      types: [],            // 记录类型 key
      diseaseCats: [],      // 疾病分类 key
      scopes: [],           // 授权范围 key
      sources: [],          // 来源 key
      severities: [],       // 严重程度 key
      tags: [],             // 标签（任一命中即可）
      from: '',             // 起始日期 'YYYY-MM-DD'
      to: '',               // 结束日期 'YYYY-MM-DD'
      abnormalOnly: false,  // 只看被标记为异常的
      sort: 'relevance'     // relevance | date | dateAsc
    };
  }

  /** 各筛选项的候选项 */
  function options() {
    var tagMap = Object.create(null);
    safeAll().forEach(function (r) {
      (r.tags || []).forEach(function (t) { tagMap[t] = (tagMap[t] || 0) + 1; });
    });
    return {
      /* 名称一律走 D.nameOf(list, key) —— 只有它才会去查 dict.<组名>.<key> 词条。
         diseaseCategory / severity / consentScope 是普通字典表，项上的 name 只是
         中文原文；直接读 .name 会让这三组筛选器在英文界面下仍显示中文。
         （recordTypes 不同：它的 name 是读取词条的访问器，直接读即可。） */
      types: D.recordTypes.map(function (t) {
        return { key: t.key, name: t.name, icon: t.icon, color: t.color };
      }),
      diseaseCats: D.diseaseCategory.map(function (c) {
        return { key: c.key, name: D.nameOf(D.diseaseCategory, c.key), icon: c.icon };
      }),
      /* 授权范围候选项。
         ⚠️ 刻意排除 psych（心理测评报告）：它的数据存在独立集合里，
         不进倒排索引、也不进时间线 —— 这是**隐私设计**，不是遗漏。
         若把它列在这里，用户选了之后永远得到 0 条结果，反而像个 bug。 */
      scopes: (D.consentScope || [])
        .filter(function (s) { return s.key !== 'psych'; })
        .map(function (s) {
          return { key: s.key, name: D.nameOf(D.consentScope, s.key), desc: s.desc };
        }),
      sources: SOURCES.map(function (s) {
        return { key: s.key, name: sourceName(s.key), icon: s.icon };
      }),
      severities: (D.severity || []).map(function (s) {
        return { key: s.key, name: D.nameOf(D.severity, s.key), tone: s.tone, weight: s.weight };
      }),
      sorts: SORT_OPTIONS.map(function (s) {
        return { key: s.key, name: sortName(s.key) };
      }),
      tags: Object.keys(tagMap).sort(function (a, b) { return tagMap[b] - tagMap[a]; })
    };
  }

  function safeAll() {
    try {
      return (PHR.records && PHR.records.service) ? PHR.records.service.all() : [];
    } catch (e) { return []; }
  }

  /* ================================================================== *
   * 二、过滤
   * ================================================================== */
  function toTs(v) {
    if (v === null || v === undefined || v === '') { return 0; }
    if (typeof v === 'number') { return v; }
    var ts = U.parseDate(v);
    return isNaN(ts) ? 0 : ts;
  }

  function hasAny(arr) { return arr && arr.length > 0; }

  /**
   * 按条件过滤记录数组。所有条件之间是"与"的关系，同一条件内的多选是"或"。
   * 注意：from/to 传 'YYYY-MM-DD' 字符串时，to 会自动补到当天 23:59:59。
   */
  function apply(records, filter) {
    var f = filter || {};
    var rows = (records || []).slice();

    if (hasAny(f.types)) { rows = rows.filter(function (r) { return f.types.indexOf(r.type) >= 0; }); }
    if (hasAny(f.diseaseCats)) { rows = rows.filter(function (r) { return f.diseaseCats.indexOf(r.diseaseCat) >= 0; }); }
    if (hasAny(f.scopes) && PHR.records && PHR.records.categories) {
      rows = rows.filter(function (r) {
        return f.scopes.indexOf(PHR.records.categories.scopeOf(r)) >= 0;
      });
    }
    if (hasAny(f.sources)) { rows = rows.filter(function (r) { return f.sources.indexOf(r.source) >= 0; }); }
    if (hasAny(f.severities)) {
      rows = rows.filter(function (r) { return r.severity && f.severities.indexOf(r.severity) >= 0; });
    }
    if (hasAny(f.tags)) {
      rows = rows.filter(function (r) {
        return (r.tags || []).some(function (t) { return f.tags.indexOf(t) >= 0; });
      });
    }
    if (f.abnormalOnly) { rows = rows.filter(function (r) { return !!r.abnormal; }); }

    var from = toTs(f.from);
    var to = toTs(f.to);
    if (from) { rows = rows.filter(function (r) { return r.date >= from; }); }
    if (to) {
      var end = typeof f.to === 'string' ? to + 86399000 : to;   // 字符串日期补到当天最后一秒
      rows = rows.filter(function (r) { return r.date <= end; });
    }

    if (f.keyword) {
      var k = String(f.keyword).toLowerCase();
      rows = rows.filter(function (r) {
        return (r.searchText || '').indexOf(k) >= 0 ||
               String(r.title || '').toLowerCase().indexOf(k) >= 0;
      });
    }
    return rows;
  }

  /* ================================================================== *
   * 三、条件的中文表达
   * ================================================================== */
  /**
   * 已选条件 → 中文标签数组，供界面渲染成可移除的 chip。
   * @returns {Array<{field:string, value:string, label:string, icon:string}>}
   */
  function activeChips(filter) {
    var f = filter || {};
    var out = [];

    (f.types || []).forEach(function (t) {
      out.push({ field: 'types', value: t, label: D.recordTypeName(t), icon: D.recordType(t).icon });
    });
    (f.diseaseCats || []).forEach(function (c) {
      out.push({ field: 'diseaseCats', value: c, label: D.nameOf(D.diseaseCategory, c), icon: '🩺' });
    });
    (f.scopes || []).forEach(function (s) {
      out.push({ field: 'scopes', value: s, icon: '🔐',
        label: U.t('search.filters.chipScope', '授权范围：{name}', { name: D.nameOf(D.consentScope, s) }) });
    });
    (f.sources || []).forEach(function (s) {
      out.push({ field: 'sources', value: s, label: sourceName(s), icon: '📥' });
    });
    (f.severities || []).forEach(function (s) {
      out.push({ field: 'severities', value: s, label: D.nameOf(D.severity, s), icon: '⚖️' });
    });
    (f.tags || []).forEach(function (t) {
      out.push({ field: 'tags', value: t, label: '#' + tagLabel(t), icon: '🏷️' });
    });
    if (f.from) {
      out.push({ field: 'from', value: f.from, icon: '📅',
        label: U.t('search.filters.chipFrom', '自 {date}', { date: f.from }) });
    }
    if (f.to) {
      out.push({ field: 'to', value: f.to, icon: '📅',
        label: U.t('search.filters.chipTo', '至 {date}', { date: f.to }) });
    }
    if (f.abnormalOnly) {
      out.push({ field: 'abnormalOnly', value: '1', label: U.t('search.filters.chipAbnormal', '只看异常结果'), icon: '⚠️' });
    }
    return out;
  }

  /** 用一句话描述当前筛选条件，例如「2025-01-01 至 2025-06-30 · 检验报告 · 内分泌与代谢」 */
  function describe(filter) {
    var f = filter || {};
    var parts = [];

    if (f.from && f.to) { parts.push(U.t('search.filters.dateRange', '{from} 至 {to}', { from: f.from, to: f.to })); }
    else if (f.from) { parts.push(U.t('search.filters.dateFrom', '{from} 起', { from: f.from })); }
    else if (f.to) { parts.push(U.t('search.filters.dateTo', '截至 {to}', { to: f.to })); }

    if (hasAny(f.types)) {
      parts.push(f.types.length <= 3
        ? f.types.map(function (t) { return D.recordTypeName(t); }).join(listJoiner())
        : U.t('search.filters.typeCount', '{n} 类记录', { n: f.types.length }));
    }
    if (hasAny(f.diseaseCats)) {
      parts.push(D.nameOf(D.diseaseCategory, f.diseaseCats[0]) +
        (f.diseaseCats.length > 1 ? U.t('search.filters.etcSuffix', ' 等') : ''));
    }
    if (hasAny(f.scopes)) {
      parts.push(U.t('search.filters.scopePrefix', '授权范围：{name}', { name: D.nameOf(D.consentScope, f.scopes[0]) }) +
        (f.scopes.length > 1 ? U.t('search.filters.etcSuffix', ' 等') : ''));
    }
    if (hasAny(f.sources)) {
      parts.push(f.sources.map(function (s) { return sourceName(s); }).join(listJoiner()));
    }
    if (hasAny(f.severities)) {
      parts.push(f.severities.map(function (s) { return D.nameOf(D.severity, s); }).join(listJoiner()));
    }
    if (hasAny(f.tags)) {
      parts.push(U.t('search.filters.tagsPrefix', '标签：') + f.tags.map(function (t) { return '#' + tagLabel(t); }).join(' '));
    }
    if (f.abnormalOnly) { parts.push(U.t('search.filters.abnormalOnlyOnly', '仅异常结果')); }

    return parts.length ? parts.join(partJoiner()) : U.t('search.filters.allRecords', '全部记录');
  }

  /* ================================================================== *
   * 四、预设筛选
   * ================================================================== */
  function daysAgo(n) { return U.fmtDate(Date.now() - n * 86400000); }

  /**
   * 预设筛选：把"患者最常做的几类检索"一键化，降低使用门槛。
   * @returns {Array<{key,name,icon,desc,filter}>}
   */
  function presets() {
    var lastYear = new Date().getFullYear() - 1;
    return [
      { key: 'recent_lab', icon: '🧪',
        name: U.t('search.filters.preset.recent_lab.name', '近 3 个月的检验报告'),
        desc: U.t('search.filters.preset.recent_lab.desc', '最近 90 天的化验与体检，复诊时医生最常要看的一组'),
        filter: { types: ['lab', 'checkup'], from: daysAgo(90) } },

      { key: 'abnormal', icon: '⚠️',
        name: U.t('search.filters.preset.abnormal.name', '所有异常结果'),
        desc: U.t('search.filters.preset.abnormal.desc', '被标记为异常的记录，按时间倒序，便于核对复查进度'),
        filter: { abnormalOnly: true } },

      { key: 'medication', icon: '💊',
        name: U.t('search.filters.preset.medication.name', '长期用药相关'),
        desc: U.t('search.filters.preset.medication.desc', '用药记录与处方：核对是否漏服、是否与新增处方冲突'),
        filter: { types: ['medication', 'prescription'] } },

      { key: 'cardio', icon: '❤️',
        name: U.t('search.filters.preset.cardio.name', '心血管相关全部记录'),
        desc: U.t('search.filters.preset.cardio.desc', '血压、血脂、心电图、心血管用药等全部归入心血管系统的记录'),
        filter: { diseaseCats: ['cardio'] } },

      { key: 'last_year_checkup', icon: '📊',
        name: U.t('search.filters.preset.last_year_checkup.name', '去年的体检'),
        desc: U.t('search.filters.preset.last_year_checkup.desc', '{year} 年的体检报告，用于与今年结果做对比', { year: lastYear }),
        filter: { types: ['checkup'], from: lastYear + '-01-01', to: lastYear + '-12-31' } },

      { key: 'allergy', icon: '🚨',
        name: U.t('search.filters.preset.allergy.name', '过敏相关'),
        desc: U.t('search.filters.preset.allergy.desc', '过敏史记录：就医与开方前必须确认的内容'),
        filter: { types: ['allergy'] } },

      { key: 'vital_30', icon: '📈',
        name: U.t('search.filters.preset.vital_30.name', '近 30 天体征指标'),
        desc: U.t('search.filters.preset.vital_30.desc', '最近一个月的血压、血糖、体重等自测数据'),
        filter: { types: ['vital'], from: daysAgo(30) } },

      { key: 'synced', icon: '🔄',
        name: U.t('search.filters.preset.synced.name', '医院同步的数据'),
        desc: U.t('search.filters.preset.synced.desc', '来自医院机构同步的记录，可核对是否与纸质报告一致'),
        filter: { sources: ['sync'] } }
    ];
  }

  /**
   * 标签的**显示名**。
   *
   * 标签值本身（'运动'）同时是筛选键 —— 一旦渲染成译文，apply() 里的
   * `f.tags.indexOf(r.tags[i])` 就对不上库里的原值了。所以值保持原样，
   * 只在显示时查词条翻译。
   */
  function tagLabel(t) {
    var e = (PHR.seed && PHR.seed.textKeyOf) ? PHR.seed.textKeyOf(t) : null;
    return e ? PHR.t(e.key, t, e.params || undefined) : t;
  }

  PHR.search.filters = {
    default: defaultFilter,
    options: options,
    apply: apply,
    activeChips: activeChips,
    describe: describe,
    presets: presets,
    sourceName: sourceName,
    sortName: sortName,
    tagLabel: tagLabel,
    listJoiner: listJoiner,
    partJoiner: partJoiner,
    SOURCES: SOURCES,
    SORT_OPTIONS: SORT_OPTIONS
  };

})(window.PHR);
