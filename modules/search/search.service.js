/**
 * ============================================================================
 * 文件：modules/search/search.service.js
 * 层：业务模块层（智能搜索 —— 模块 3）
 * 职责：检索主流程的编排者，界面层只跟它打交道：
 *      · run()        主入口：召回 → 精排 → 过滤 → 生成高亮片段 → 写审计与历史
 *      · runAsync()   分片执行版本，避免大数据量时阻塞输入
 *      · suggest()    输入联想（关键词 / 记录类型 / 疾病分类 / 药品）
 *      · quickSearch()顶栏极简入口，只返回前 8 条
 *      · stats()      索引统计 + 历史统计
 * 依赖：core/{namespace,utils,dict,dict-records}.js、modules/search/{fuzzy,inverted-index,
 *      filters,history}.js、modules/records/record.service.js、modules/audit（后加载，防御式调用）
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  PHR.search = PHR.search || {};

  var U = PHR.util;
  var D = PHR.dict;

  // 同目录依赖：为兼容脚本加载顺序，在每次调用入口统一解析，而不是加载时写死
  var F, IDX, FL, HIST;
  function deps() {
    F = PHR.search.fuzzy;
    IDX = PHR.search.index;
    FL = PHR.search.filters;
    HIST = PHR.search.history;
  }
  deps();

  /* 模块元信息：面包屑（ui/shell.js）与审计日志（audit.logView）会读取它。
     ⚠️ title / description 会直接渲染在面包屑上，而模块注册**只在脚本加载时执行一次**，
     那时 core/boot.js 还没做语言探测（detect()）—— 写死 PHR.t(...) 会永远停在中文。
     因此这里保留中文原文注册，再把它改成按当前语言取词的 getter，
     这样每一次渲染都能拿到正确语种的标题，切换语言也无需额外刷新。 */
  PHR.registerModule('search', {
    title: '智能搜索',
    description: '按时间、疾病分类、记录类型筛选，并支持中文模糊检索与同义词扩展',
    icon: '🔍',
    order: 3
  });

  (function installModuleI18n() {
    var mod = PHR.modules && PHR.modules.search;
    if (!mod || !Object.defineProperty) { return; }
    Object.defineProperty(mod, 'title', {
      configurable: true,
      get: function () { return PHR.t('module.search.title', '智能搜索'); }
    });
    Object.defineProperty(mod, 'description', {
      configurable: true,
      get: function () {
        return PHR.t('module.search.desc', '按时间、疾病分类、记录类型筛选，并支持中文模糊检索与同义词扩展');
      }
    });
  })();

  var MAX_CANDIDATES = 800;   // 精排阶段最多处理的候选数，防止极端情况卡顿
  var CHUNK = 40;             // runAsync 的分片大小

  function allRecords() {
    try {
      return (PHR.records && PHR.records.service) ? PHR.records.service.all() : [];
    } catch (e) { return []; }
  }

  /* ================================================================== *
   * 一、准备阶段：确定条件与候选集
   * ================================================================== */
  function prepare(query, filter, opt) {
    var f = FL.default();
    var patch = filter || {};
    Object.keys(patch).forEach(function (k) {
      if (patch[k] !== undefined && patch[k] !== null) { f[k] = patch[k]; }
    });

    var q = String(query === undefined || query === null ? '' : query).trim();
    if (!q) { q = String(f.keyword || '').trim(); }
    f.keyword = q;
    // 排序也可以从 opt 传（run(q, filter, { sort:'date' }) 这种写法更顺手）
    if (opt && (opt.sort === 'date' || opt.sort === 'dateAsc' || opt.sort === 'relevance')) { f.sort = opt.sort; }

    var all = allRecords();
    var ctx = { q: q, f: f, all: all, opt: opt || {}, exp: null, candidates: [] };

    // ① 空查询：不做相关性排序，直接按条件列出记录
    if (!q) {
      ctx.candidates = FL.apply(all, f).map(function (r) { return { record: r, idx: 1 }; });
      return ctx;
    }

    // ② 有查询：先用倒排索引召回候选，再用 fuzzy.score 精排
    var exp = F.expand(q);
    ctx.exp = exp;
    // 单字 token（"不""在""的"）几乎无区分度，会把无关记录全捞进来，故一律丢弃；
    // 只有用户明确只搜一个字时才保留。二元组、英文词、药名等照常参与召回。
    var terms = exp.terms.concat(F.tokenize(q)).filter(function (t) {
      return t.length >= 2 || q.length === 1;
    });

    var idxScores = IDX.search(terms);
    var byId = Object.create(null);
    all.forEach(function (r) { byId[r.id] = r; });

    var cands = [];
    idxScores.forEach(function (s, id) {
      if (byId[id]) { cands.push({ record: byId[id], idx: s }); }
    });

    // 索引没召回时（错别字、同义词不在索引里）退化为线性模糊扫描
    if (!cands.length) {
      all.forEach(function (r) {
        var s = F.score(q, IDX.textOf(r));
        if (s >= 0.2) { cands.push({ record: r, idx: s }); }
      });
    }

    // ③ 应用筛选条件（在候选集上做，代价可控）
    //    注意：这里必须去掉 keyword 再过滤 —— 模糊匹配命中的记录未必原样包含查询词
    //    （例如搜"血压高"命中了只写"高血压"的记录），用子串条件会把正确结果误杀。
    var fNoKeyword = Object.assign({}, f, { keyword: '' });
    var allowed = Object.create(null);
    FL.apply(cands.map(function (c) { return c.record; }), fNoKeyword).forEach(function (r) { allowed[r.id] = 1; });

    ctx.candidates = cands.filter(function (c) { return allowed[c.record.id]; });
    if (ctx.candidates.length > MAX_CANDIDATES) {
      ctx.candidates = U.sortBy(ctx.candidates, 'idx', true).slice(0, MAX_CANDIDATES);
    }
    return ctx;
  }

  /* ================================================================== *
   * 二、单条打分 + 高亮片段
   * ================================================================== */
  function scoreOne(c, ctx) {
    var r = c.record;

    // 空查询：分数恒定，只按时间/类型排序
    if (!ctx.q) {
      return { record: r, score: 1, highlights: fallbackHighlight(r), matchedFields: [] };
    }

    var fields = IDX.fieldsOf(r);
    var terms = ctx.exp && ctx.exp.expanded ? [ctx.q].concat(ctx.exp.terms.slice(1)) : [ctx.q];
    var bestWeighted = 0;
    var hits = [];
    var matchedFields = [];

    fields.forEach(function (fd) {
      if (!fd.text) { return; }
      var fieldScore = 0;
      var fieldTerm = ctx.q;
      for (var i = 0; i < terms.length; i++) {
        var s = F.score(terms[i], fd.text);
        if (s > fieldScore) { fieldScore = s; fieldTerm = terms[i]; }
      }
      if (fieldScore <= 0.15) { return; }
      var weighted = fieldScore * fd.weight;
      if (weighted > bestWeighted) { bestWeighted = weighted; }
      matchedFields.push(fd.field);
      hits.push({ fd: fd, score: fieldScore, term: fieldTerm });
    });

    if (!hits.length) { return null; }

    // 最终分 = 字段精排分 × 0.6 + 索引召回分 × 0.4，多字段命中再给一点加成
    var score = bestWeighted * 0.6 + Math.min(1, c.idx) * 0.4;
    score = Math.min(1, score + Math.min(0.1, (hits.length - 1) * 0.02));

    var highlights = U.sortBy(hits, 'score', true).slice(0, 3).map(function (h) {
      var sn = F.snippet(h.fd.text, h.term, 30);
      return { field: h.fd.field, label: h.fd.label, text: sn.text, term: sn.term, hit: sn.hit };
    }).filter(function (h) { return h.hit; });

    if (!highlights.length) { highlights = fallbackHighlight(r); }

    return { record: r, score: score, highlights: highlights, matchedFields: matchedFields };
  }

  /** 没有命中片段时，退而展示摘要，避免结果条目只有标题 */
  function fallbackHighlight(r) {
    var text = r.summary || '';
    return text ? [{ field: 'summary', label: PHR.t('search.index.field.summary', '摘要'),
                     text: U.truncate(text, 90), term: '', hit: false }] : [];
  }

  /* ================================================================== *
   * 三、收尾：排序、审计、历史
   * ================================================================== */
  function finalize(ctx, scored, t0) {
    var f = ctx.f;
    var rows = scored;

    rows.sort(function (a, b) {
      if (f.sort === 'dateAsc') { return a.record.date - b.record.date; }
      if (f.sort === 'date') { return b.record.date - a.record.date; }
      if (b.score !== a.score) { return b.score - a.score; }
      return b.record.date - a.record.date;      // 相关度相同时新的在前
    });

    var total = rows.length;
    var limit = ctx.opt.limit || 50;
    var items = rows.slice(0, limit);

    var res = {
      items: items,
      total: total,
      shown: items.length,
      took: Date.now() - t0,
      query: ctx.q,
      filter: f,
      sort: f.sort,
      expanded: !!(ctx.exp && ctx.exp.expanded),
      terms: ctx.exp ? ctx.exp.terms : [],
      suggestions: total ? [] : suggestionsFor(ctx)
    };

    // 无条件命中的时候给出"换个词试试"的建议
    if (ctx.opt.audit !== false) { writeAudit(res); }
    if (ctx.opt.remember === true) { HIST.add(ctx.q, f, total); }

    return res;
  }

  function writeAudit(res) {
    var cond = FL.describe(res.filter);
    U.audit({
      action: 'search.run',
      targetType: 'search',
      targetId: '',
      targetName: res.query || PHR.t('search.service.auditConditionalQuery', '（条件检索）'),
      detail: PHR.t('search.service.auditDetail', '关键词：{kw}　命中 {n} 条{cond}{expanded}', {
        kw: res.query || PHR.t('search.service.auditEmptyKeyword', '（空，仅按条件筛选）'),
        n: res.total,
        cond: cond ? PHR.t('search.service.auditCondSuffix', '　条件：{cond}', { cond: cond }) : '',
        expanded: res.expanded
          ? PHR.t('search.service.auditExpandedSuffix', '　同义词扩展：{terms}',
                  { terms: res.terms.slice(1, 4).join(PHR.t('search.filters.listJoiner', '、')) })
          : ''
      }),
      result: 'success'
    });
  }

  function suggestionsFor(ctx) {
    var out = [];
    var terms = (ctx.exp && ctx.exp.terms) || [];
    terms.slice(1, 4).forEach(function (t) { out.push({ type: 'synonym', label: t }); });
    HIST.popular(4).forEach(function (p) {
      if (p.keyword && p.keyword !== ctx.q) { out.push({ type: 'hot', label: p.keyword }); }
    });
    return out.slice(0, 6);
  }

  /* ================================================================== *
   * 四、对外方法
   * ================================================================== */
  /**
   * 执行一次检索。
   * @param {string} query 关键词
   * @param {object} filter 筛选条件（见 filters.default()）
   * @param {object} opt { limit, remember, audit }
   * @returns {{items:Array, total:number, shown:number, took:number, query:string,
   *            filter:object, sort:string, expanded:boolean, terms:Array, suggestions:Array}}
   */
  function run(query, filter, opt) {
    deps();
    var t0 = Date.now();
    var ctx = prepare(query, filter, opt);
    var scored = [];
    for (var i = 0; i < ctx.candidates.length; i++) {
      var it = scoreOne(ctx.candidates[i], ctx);
      if (it) { scored.push(it); }
    }
    return finalize(ctx, scored, t0);
  }

  /** 分片遍历：每片之间让出主线程，避免长任务冻结输入框 */
  function chunkedEach(list, size, worker, done) {
    var i = 0;
    (function next() {
      var end = Math.min(list.length, i + size);
      for (; i < end; i++) { worker(list[i]); }
      if (i < list.length) { setTimeout(next, 0); } else { done(); }
    })();
  }

  /**
   * run() 的异步版本，返回 Promise。适合在输入框里实时触发。
   */
  function runAsync(query, filter, opt) {
    deps();
    var t0 = Date.now();
    return new Promise(function (resolve) {
      setTimeout(function () {
        var ctx;
        try {
          ctx = prepare(query, filter, opt);
        } catch (e) {
          PHR.warn(PHR.t('search.warn.prepareFail', '检索准备失败'), e);
          resolve({ items: [], total: 0, shown: 0, took: Date.now() - t0,
                    query: String(query || ''), filter: FL.default(), suggestions: [],
                    error: PHR.t('search.service.searchFailed', '检索失败') });
          return;
        }
        var scored = [];
        chunkedEach(ctx.candidates, CHUNK, function (c) {
          var it = scoreOne(c, ctx);
          if (it) { scored.push(it); }
        }, function () {
          resolve(finalize(ctx, scored, t0));
        });
      }, 0);
    });
  }

  /**
   * 输入联想。
   * @param {string} prefix
   * @returns {{keywords:string[], types:Array, diseases:Array, drugs:string[]}}
   */
  function suggest(prefix, limit) {
    deps();
    limit = limit || 8;
    var p = F.normalize(prefix);
    var out = { keywords: [], types: [], diseases: [], drugs: [] };

    if (!p) {
      out.keywords = HIST.popular(limit).map(function (x) { return x.keyword; });
      return out;
    }

    // 关键词：优先"以它开头"的索引 token，其次"包含它"的
    var starts = [];
    var contains = [];
    IDX.keys().forEach(function (k) {
      if (k.length < 2 || /^[0-9.]+$/.test(k)) { return; }
      if (k.indexOf(p) === 0) { starts.push(k); }
      else if (k.indexOf(p) > 0) { contains.push(k); }
    });
    starts.sort(byLength);
    contains.sort(byLength);
    out.keywords = starts.concat(contains).slice(0, limit);

    var opt = FL.options();
    out.types = opt.types.filter(function (t) {
      return t.name.indexOf(p) >= 0 || p.indexOf(t.name) >= 0;
    }).slice(0, limit);

    out.diseases = opt.diseaseCats.filter(function (c) {
      return c.name.indexOf(p) >= 0 || p.indexOf(c.name) >= 0;
    }).slice(0, limit);

    out.drugs = drugs().filter(function (d) {
      var n = F.normalize(d);
      return n.indexOf(p) >= 0 || p.indexOf(n) >= 0 || F.similarity(p, n) >= 0.5;
    }).slice(0, limit);

    return out;
  }

  function byLength(a, b) { return a.length - b.length; }

  var poolCache = null;
  /** 药品候选 = 内置药品词库 + 本人在服的处方/用药记录标题 */
  function drugPool() {
    var list = F.drugs.slice();
    allRecords().forEach(function (r) {
      if (r.type === 'prescription' || r.type === 'medication') { list.push(r.title); }
    });
    poolCache = U.unique(list);
    return poolCache;
  }
  /** 药品候选（带缓存，记录变化时由 record:changed 清空） */
  function drugs() {
    if (!poolCache) { drugPool(); }
    return poolCache;
  }
  if (PHR.bus) { PHR.bus.on('record:changed', function () { poolCache = null; }); }

  /** 顶栏全局搜索用的极简入口 */
  function quickSearch(query, limit) {
    var res = run(query, null, { limit: limit || 8, remember: false, audit: false });
    return res.items.map(function (it) {
      return {
        id: it.record.id,
        title: PHR.models.record.displayTitle(it.record),
        type: it.record.type,
        typeName: D.recordTypeName(it.record.type),
        dateText: it.record.dateText || U.fmtDate(it.record.date),
        score: it.score
      };
    });
  }

  function stats() {
    deps();
    return {
      index: IDX.stats(),
      history: HIST.stats(),
      synonyms: F.synonyms.length,
      drugs: F.drugs.length
    };
  }

  /* ================================================================== *
   * 挂载（同时平铺到 PHR.search 上，方便 PHR.search.run(...)）
   * ================================================================== */
  var service = {
    run: run,
    runAsync: runAsync,
    suggest: suggest,
    quickSearch: quickSearch,
    stats: stats
  };

  PHR.search.service = service;
  Object.keys(service).forEach(function (k) {
    if (PHR.search[k] === undefined) { PHR.search[k] = service[k]; }
  });

})(window.PHR);
