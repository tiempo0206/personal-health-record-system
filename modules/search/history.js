/**
 * ============================================================================
 * 文件：modules/search/history.js
 * 层：业务模块层（智能搜索 —— 模块 3）
 * 职责：搜索行为的本地记忆，让"搜过的条件"可以一键复用：
 *      · 历史记录    add / list / remove / clear（最多 50 条，超出按时间淘汰）
 *      · 常用搜索    saved / save / removeSaved（用户主动收藏，不受 50 条限制）
 *      · 热门关键词  popular() 从历史里按出现频次取前 8 个
 *      · stats()     供界面底部的"搜索统计"卡片使用
 *      持久化统一走 PHR.store，键名 search_history / search_saved。
 * 依赖：core/{namespace,utils,store}.js、modules/search/filters.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  PHR.search = PHR.search || {};

  var U = PHR.util;

  var KEY_HISTORY = 'search_history';
  var KEY_SAVED = 'search_saved';
  var MAX_HISTORY = 50;
  var MAX_SAVED = 30;

  /* ================================================================== *
   * 一、底层读写
   * ================================================================== */
  function readList(key) {
    var v = PHR.store.read(key, []);
    return Array.isArray(v) ? v : [];
  }

  /** 生成条件指纹：关键词 + 归一化后的条件，用于判重（同条件的搜索只留最近一次） */
  function signature(keyword, filter) {
    var f = filter || {};
    var pick = {
      types: (f.types || []).slice().sort(),
      diseaseCats: (f.diseaseCats || []).slice().sort(),
      scopes: (f.scopes || []).slice().sort(),
      sources: (f.sources || []).slice().sort(),
      severities: (f.severities || []).slice().sort(),
      tags: (f.tags || []).slice().sort(),
      from: f.from || '',
      to: f.to || '',
      abnormalOnly: !!f.abnormalOnly
    };
    return U.slug(String(keyword || '')) + '|' + JSON.stringify(pick);
  }

  /** 只保留有检索意义的字段，避免把整个 filter 对象（含 UI 状态）写进存储 */
  function slimFilter(filter) {
    var f = filter || {};
    var out = {};
    ['types', 'diseaseCats', 'scopes', 'sources', 'severities', 'tags'].forEach(function (k) {
      if (f[k] && f[k].length) { out[k] = f[k].slice(0, 20); }
    });
    if (f.from) { out.from = f.from; }
    if (f.to) { out.to = f.to; }
    if (f.abnormalOnly) { out.abnormalOnly = true; }
    return out;
  }

  /* ================================================================== *
   * 二、搜索历史
   * ================================================================== */
  /**
   * 记录一次搜索。相同条件的旧记录会被顶到最前面而不是重复堆积，
   * 但重复次数记在 repeat 上 —— 这样列表保持干净，popular() 又能统计真实频次。
   * @param {string} keyword
   * @param {object} filter
   * @param {number} resultCount 命中条数
   */
  function add(keyword, filter, resultCount) {
    var kw = String(keyword || '').trim();
    var slim = slimFilter(filter);
    if (!kw && !Object.keys(slim).length) { return null; }   // 空条件不记

    var sig = signature(kw, filter);
    var all = readList(KEY_HISTORY);
    var prev = null;
    all.forEach(function (x) { if (x.sig === sig) { prev = x; } });
    var list = all.filter(function (x) { return x.sig !== sig; });

    var item = {
      id: U.uid('sh'),
      keyword: kw,
      filter: slim,
      sig: sig,
      count: resultCount || 0,
      repeat: prev ? (prev.repeat || 1) + 1 : 1,
      at: Date.now()
    };
    list.unshift(item);
    if (list.length > MAX_HISTORY) { list = list.slice(0, MAX_HISTORY); }
    PHR.store.write(KEY_HISTORY, list);
    return item;
  }

  /** 最近的历史（默认全部），已按时间倒序 */
  function list(limit) {
    var rows = readList(KEY_HISTORY);
    return limit ? rows.slice(0, limit) : rows;
  }

  function remove(id) {
    var before = readList(KEY_HISTORY);
    var after = before.filter(function (x) { return x.id !== id; });
    PHR.store.write(KEY_HISTORY, after);
    return { ok: after.length !== before.length, count: after.length };
  }

  function clear() {
    PHR.store.write(KEY_HISTORY, []);
    return { ok: true };
  }

  /**
   * 热门关键词：按出现次数（含重复搜索）排序，取前 N 个。
   * @returns {Array<{keyword, count, hits, lastAt}>}
   */
  function popular(limit) {
    var map = Object.create(null);
    readList(KEY_HISTORY).forEach(function (h) {
      var k = h.keyword;
      if (!k) { return; }
      var cur = map[k] || (map[k] = { keyword: k, count: 0, hits: 0, lastAt: 0 });
      cur.count += (h.repeat || 1);
      cur.hits += h.count || 0;
      cur.lastAt = Math.max(cur.lastAt, h.at || 0);
    });
    return U.sortBy(Object.keys(map).map(function (k) { return map[k]; }), 'count', true)
      .slice(0, limit || 8);
  }

  /* ================================================================== *
   * 三、常用搜索（收藏）
   * ================================================================== */
  function saved() { return readList(KEY_SAVED); }

  /**
   * 收藏一个搜索。
   * @param {string} name 用户起的名字
   * @param {string} keyword
   * @param {object} filter
   */
  function save(name, keyword, filter) {
    var nm = String(name || '').trim();
    if (!nm) { return { ok: false, message: PHR.t('search.history.nameRequired', '请给这个搜索起个名字') }; }

    var list = readList(KEY_SAVED).filter(function (x) { return x.name !== nm; });
    if (list.length >= MAX_SAVED) { list = list.slice(0, MAX_SAVED - 1); }

    list.unshift({
      id: U.uid('ss'),
      name: nm,
      keyword: String(keyword || '').trim(),
      filter: slimFilter(filter),
      at: Date.now()
    });
    PHR.store.write(KEY_SAVED, list);
    return { ok: true, item: list[0],
             message: PHR.t('search.history.savedToast', '已保存为常用搜索「{name}」', { name: nm }) };
  }

  function removeSaved(id) {
    var before = readList(KEY_SAVED);
    var after = before.filter(function (x) { return x.id !== id; });
    PHR.store.write(KEY_SAVED, after);
    return { ok: after.length !== before.length };
  }

  /** 把收藏项还原成一份完整的筛选条件对象（补齐默认值，防止老数据缺字段） */
  function toFilter(item) {
    // 依赖 filters.js：此处按需解析，兼容脚本加载顺序
    var base = (PHR.search.filters || { default: defaultFilter }).default();
    var f = (item && item.filter) || {};
    Object.keys(f).forEach(function (k) { base[k] = Array.isArray(f[k]) ? f[k].slice() : f[k]; });
    return base;
  }

  /** filters.js 缺失时的兜底条件对象 */
  function defaultFilter() {
    return { keyword: '', types: [], diseaseCats: [], scopes: [], sources: [],
             severities: [], tags: [], from: '', to: '', abnormalOnly: false, sort: 'relevance' };
  }

  /* ================================================================== *
   * 四、统计
   * ================================================================== */
  function stats() {
    var rows = readList(KEY_HISTORY);
    return {
      total: rows.length,
      saved: readList(KEY_SAVED).length,
      keywords: popular(8),
      lastAt: rows.length ? rows[0].at : 0,
      max: MAX_HISTORY
    };
  }

  PHR.search.history = {
    add: add,
    list: list,
    remove: remove,
    clear: clear,
    popular: popular,
    saved: saved,
    save: save,
    removeSaved: removeSaved,
    toFilter: toFilter,
    stats: stats,
    signature: signature
  };

})(window.PHR);
