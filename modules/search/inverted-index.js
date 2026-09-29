/**
 * ============================================================================
 * 文件：modules/search/inverted-index.js
 * 层：业务模块层（智能搜索 —— 模块 3）
 * 职责：为当前用户的全部健康记录建立**倒排索引**，并提供 TF-IDF 候选召回：
 *      · build()      遍历记录 → 拼可搜索文本 → 分词 → token -> {记录 id: 词频}
 *      · search(terms) 按 TF-IDF 加权求和，返回 Map(记录 id -> 0~1 相对分)
 *      · fieldsOf()   把一条记录拆成"带权重的可检索字段"，供索引与界面高亮共用
 *      · invalidate() 使缓存失效；订阅 record:changed / auth:login / auth:logout
 *                     自动重建（debounce 合并短时间内的多次写入）
 * 依赖：core/{namespace,utils,dict,dict-records}.js、modules/search/fuzzy.js、
 *      modules/records/record.service.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  PHR.search = PHR.search || {};

  var U = PHR.util;
  var D = PHR.dict;

  /** 依赖 fuzzy.js。为兼容脚本加载顺序，使用前重新解析一次，而不是在加载时写死 */
  function F() { return PHR.search.fuzzy; }

  /** 字段权重：标题最重要，其次是标签与摘要，正文数据字段再次，类型/来源最后 */
  var FIELD_WEIGHT = {
    title: 1.00, tags: 0.80, summary: 0.70, diseaseCat: 0.60,
    type: 0.50, sourceName: 0.55
  };
  var DEFAULT_WEIGHT = 0.60;

  /** 多值字段的列表连接符：中文「、」，英文「, 」 */
  function listJoiner() { return U.t('search.filters.listJoiner', '、'); }

  var cache = null;      // 索引缓存
  var dirty = true;      // 是否需要重建

  /* ================================================================== *
   * 一、记录 → 可检索字段
   * ================================================================== */
  /**
   * 把一条记录拆成若干「字段」，每个字段带权重。索引建立与结果高亮都基于它，
   * 保证"能搜到的内容"和"界面上展示的片段"完全一致。
   * @returns {Array<{field,label,text,weight}>}
   */
  function fieldsOf(record) {
    var out = [];
    if (!record) { return out; }
    var t = D.recordType(record.type);

    out.push({ field: 'title', label: U.t('search.index.field.title', '标题'),
      text: record.title || '', weight: FIELD_WEIGHT.title });
    out.push({ field: 'diseaseCat', label: U.t('search.index.field.diseaseCat', '疾病分类'),
      text: D.nameOf(D.diseaseCategory, record.diseaseCat), weight: FIELD_WEIGHT.diseaseCat });

    // 记录类型名（含说明，便于"体检""化验"这类类型词命中）
    out.push({ field: 'type', label: U.t('search.index.field.type', '记录类型'),
      text: t.name + ' ' + (t.desc || ''), weight: FIELD_WEIGHT.type });
    if (record.summary) {
      out.push({ field: 'summary', label: U.t('search.index.field.summary', '摘要'),
        text: record.summary, weight: FIELD_WEIGHT.summary });
    }

    // 逐字段展开 data（select 类必须转成中文名，否则用户搜"心血管内科"永远搜不到）
    (t.fields || []).forEach(function (fd) {
      var v = record.data ? record.data[fd.name] : undefined;
      if (v === undefined || v === null || v === '' || v === false) { return; }
      var opts = typeof fd.options === 'function' ? fd.options() : (fd.options || []);
      var text;
      if (Array.isArray(v)) {
        text = v.map(function (x) { return D.nameOf(opts, x) || x; }).join(listJoiner());
      } else if (fd.type === 'select') {
        text = D.nameOf(opts, v);
      } else if (fd.type === 'checkbox') {
        text = fd.label;
      } else if (fd.type === 'date' || fd.type === 'datetime') {
        text = U.fmtDate(U.parseDate(v));
      } else {
        text = String(v) + (fd.unit ? ' ' + fd.unit : '');
      }
      out.push({
        field: fd.name, label: fd.label, text: text,
        weight: FIELD_WEIGHT[fd.name] || DEFAULT_WEIGHT
      });
    });

    if (record.tags && record.tags.length) {
      out.push({ field: 'tags', label: U.t('search.index.field.tags', '标签'),
        text: record.tags.join(listJoiner()), weight: FIELD_WEIGHT.tags });
    }
    if (record.sourceName) {
      out.push({ field: 'sourceName', label: U.t('search.index.field.sourceName', '数据来源'),
        text: record.sourceName, weight: FIELD_WEIGHT.sourceName });
    }

    // 低权重的"标识"字段：类型 key、疾病分类 key 与 select 字段的原始值（cardio / vital / systolic…）。
    // 有了它，索引里能命中的东西一定能被打分函数命中，不会出现"召回了却算不出分"的自相矛盾。
    var keys = [record.type, record.diseaseCat];
    (t.fields || []).forEach(function (fd) {
      if (fd.type !== 'select') { return; }
      var v = record.data ? record.data[fd.name] : null;
      if (v) { keys.push(v); }
    });
    out.push({ field: 'keys', label: U.t('search.index.field.keys', '分类标识'),
      text: keys.filter(Boolean).join(' '), weight: 0.35 });

    return out;
  }

  /**
   * 一条记录的完整可搜索文本（= 各字段文本的拼接，保证与 fieldsOf 完全一致）。
   */
  function textOf(record) {
    if (!record) { return ''; }
    return fieldsOf(record).map(function (fd) { return fd.text; }).filter(Boolean).join(' ');
  }

  /* ================================================================== *
   * 二、建立索引
   * ================================================================== */
  function allRecords() {
    try {
      return (PHR.records && PHR.records.service) ? PHR.records.service.all() : [];
    } catch (e) {
      PHR.warn(PHR.t('search.warn.indexReadFail', '建立搜索索引时读取记录失败'), e);
      return [];
    }
  }

  function build() {
    var t0 = Date.now();
    var records = allRecords();
    var idx = {
      postings: Object.create(null),   // token -> { recordId: 词频 }
      docs: Object.create(null),       // recordId -> { len, counts, type, date }
      df: Object.create(null),         // token -> 出现在多少条记录里
      total: records.length,
      tokenCount: 0,
      builtAt: Date.now()
    };

    records.forEach(function (r) {
      var tokens = F().tokenize(textOf(r));
      var counts = Object.create(null);
      for (var i = 0; i < tokens.length; i++) {
        counts[tokens[i]] = (counts[tokens[i]] || 0) + 1;
      }
      idx.docs[r.id] = { len: tokens.length || 1, counts: counts, type: r.type, date: r.date };
      Object.keys(counts).forEach(function (tk) {
        (idx.postings[tk] || (idx.postings[tk] = Object.create(null)))[r.id] = counts[tk];
      });
    });

    var keys = Object.keys(idx.postings);
    idx.tokenCount = keys.length;
    keys.forEach(function (tk) { idx.df[tk] = Object.keys(idx.postings[tk]).length; });

    cache = idx;
    dirty = false;
    PHR.log('搜索索引已重建：' + idx.total + ' 条记录 / ' + idx.tokenCount + ' 个 token，' +
            (Date.now() - t0) + 'ms');
    return cache;
  }

  /** 取索引（必要时重建） */
  function ensure() {
    if (!cache || dirty) { build(); }
    return cache;
  }

  /** 使索引失效（下一次检索时重建） */
  function invalidate() { dirty = true; }

  /* ================================================================== *
   * 三、检索
   * ================================================================== */
  /** 前缀补全：token 没建过索引时，找以它开头的 token（用户只打了半个词） */
  function prefixKeys(idx, term, cap) {
    var out = [];
    var keys = Object.keys(idx.postings);
    for (var i = 0; i < keys.length && out.length < cap; i++) {
      if (keys[i].length > term.length && keys[i].indexOf(term) === 0) { out.push(keys[i]); }
    }
    return out;
  }

  /** 把长词拆成二元组：索引里只有单字与二元组，长词（如药名"氨氯地平"）靠它召回 */
  function bigramsOf(term) {
    var out = [];
    for (var i = 0; i + 1 < term.length; i++) { out.push(term.substr(i, 2)); }
    return out;
  }

  /**
   * 按 TF-IDF 召回。
   * @param {Array<string>} terms 查询词（已由 fuzzy.expand 扩展过）
   * @returns {Map<string, number>} 记录 id -> 0~1 的相对分（本次查询内归一化）
   */
  function search(terms) {
    var idx = ensure();
    var out = new Map();
    if (!idx.total || !terms || !terms.length) { return out; }

    var N = idx.total;
    var rawMax = 0;
    var seen = Object.create(null);

    terms.forEach(function (term) {
      var t = F().normalize(term);
      if (!t || seen[t]) { return; }
      seen[t] = 1;

      // 二元组比单字更有区分度，权重更高
      var baseWeight = t.length >= 2 ? 1 : 0.35;
      var keys = [t];
      var weight = baseWeight;

      if (!idx.postings[t]) {
        // ① 前缀命中（用户只打了半个词）→ ② 拆成二元组（索引里只有单字与二元组，
        //    像"氨氯地平"这种没被整体索引过的长词，靠二元组依然能召回）
        var prefixed = prefixKeys(idx, t, 40);
        if (prefixed.length) {
          keys = prefixed;
          weight = baseWeight * 0.6;      // 前缀命中不如整词可靠，降权
        } else if (t.length >= 3) {
          keys = bigramsOf(t).filter(function (k) { return !!idx.postings[k]; });
          if (!keys.length) { return; }
          weight = baseWeight * 0.5;
        } else {
          return;
        }
      }

      keys.forEach(function (k) {
        var df = idx.df[k] || 1;
        var idf = Math.log(1 + N / (1 + df));
        var post = idx.postings[k];
        var w = k === t ? weight : weight * 0.8;
        Object.keys(post).forEach(function (id) {
          var doc = idx.docs[id];
          if (!doc) { return; }
          var tf = post[id] / doc.len;
          var add = tf * idf * w;
          var cur = (out.get(id) || 0) + add;
          out.set(id, cur);
          if (cur > rawMax) { rawMax = cur; }
        });
      });
    });

    // 归一化到 0~1，方便与 fuzzy.score 混合排序
    if (rawMax > 0) {
      out.forEach(function (v, id) { out.set(id, Math.min(1, v / rawMax)); });
    }
    return out;
  }

  /** 索引里出现过的全部 token（输入联想用） */
  function keys() { return Object.keys(ensure().postings); }

  function stats() {
    var idx = ensure();
    return {
      records: idx.total,
      tokens: idx.tokenCount,
      avgTokens: idx.total ? Math.round(U.sum(Object.keys(idx.docs).map(function (id) {
        return idx.docs[id].len;
      })) / idx.total) : 0,
      builtAt: idx.builtAt,
      stale: dirty
    };
  }

  /* ================================================================== *
   * 四、自动失效
   * ================================================================== */
  var lazyInvalidate = U.debounce(function () { invalidate(); }, 300);
  if (PHR.bus) {
    ['record:changed', 'auth:login', 'auth:logout', 'auth:register'].forEach(function (evt) {
      PHR.bus.on(evt, lazyInvalidate);
    });
  }

  PHR.search.index = {
    build: build,
    ensure: ensure,
    invalidate: invalidate,
    search: search,
    keys: keys,
    stats: stats,
    fieldsOf: fieldsOf,
    textOf: textOf,
    FIELD_WEIGHT: FIELD_WEIGHT
  };

})(window.PHR);
