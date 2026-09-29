/**
 * ============================================================================
 * 文件：core/i18n/en-US.search.js
 * 层：核心基础设施层（国际化 · 英文词条 · 智能搜索模块）
 * 职责：注册「智能搜索」（模块 3）的英文词条。
 *
 *      覆盖范围：modules/search/ 下的全部界面文案 ——
 *        search.view.*      页面骨架、筛选面板、结果列表、联想抽屉、侧栏卡片
 *        search.filters.*   预设检索、来源 / 排序标签、已选条件 chip、条件描述
 *        search.service.*   模块元信息、审计日志 detail、失败提示
 *        search.index.*     命中片段的字段标签（结果列表里「摘要」这类前缀）
 *        search.history.*   搜索历史 / 常用搜索的提示与校验信息
 *
 *      ⚠️ 词条里的「{n}」「{name}」等占位符由 core/i18n/i18n.js 的 t() 插值，
 *         占位符名必须与源码中传进来的 params 键名完全一致。
 *
 * 依赖：core/i18n/i18n.js（register）
 * ============================================================================
 *
 * 翻译原则（医疗与健康语境）：
 *   · 用通行的英文医学表达，不暗示诊断（abnormal → 「flagged as abnormal」而非「you have X」）
 *   · 医生访客的免责语义必须保留：逐条按授权范围校验 → 全量检索会绕过授权
 *   · 界面空间紧的地方优先短句，不逐字直译
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    /* ================================================================== *
     * 一、检索条件（modules/search/filters.js）
     * ================================================================== */

    /* ---------- 来源 ---------- */
    'search.filters.source.manual': 'Manual entry',
    'search.filters.source.sync': 'Hospital sync',
    'search.filters.source.import': 'External import',

    /* ---------- 排序 ---------- */
    'search.filters.sort.relevance': 'Relevance',
    'search.filters.sort.date': 'Newest first',
    'search.filters.sort.dateAsc': 'Oldest first',

    /* ---------- 连接符（中文用「、」，英文用「, 」；分句两种语言都用「 · 」） ---------- */
    'search.filters.listJoiner': ', ',
    'search.filters.partJoiner': ' · ',

    /* ---------- 已选条件 chip ---------- */
    'search.filters.chipScope': 'Scope: {name}',
    'search.filters.chipFrom': 'From {date}',
    'search.filters.chipTo': 'To {date}',
    'search.filters.chipAbnormal': 'Abnormal only',

    /* ---------- 条件的一句话描述（结果说明与审计日志共用） ---------- */
    'search.filters.dateRange': '{from} – {to}',
    'search.filters.dateFrom': 'From {from}',
    'search.filters.dateTo': 'Up to {to}',
    'search.filters.typeCount': '{n} record types',
    'search.filters.etcSuffix': ' and others',
    'search.filters.scopePrefix': 'Scope: {name}',
    'search.filters.tagsPrefix': 'Tags: ',
    'search.filters.abnormalOnlyOnly': 'Abnormal results only',
    'search.filters.allRecords': 'All records',

    /* ---------- 预设检索：名称 + 说明（说明同时用作 title 提示） ---------- */
    'search.filters.preset.recent_lab.name': 'Lab reports — last 3 months',
    'search.filters.preset.recent_lab.desc': 'Labs and check-ups from the last 90 days — the set doctors ask for most at a follow-up.',
    'search.filters.preset.abnormal.name': 'All abnormal results',
    'search.filters.preset.abnormal.desc': 'Records flagged as abnormal, newest first, so you can track what still needs a follow-up.',
    'search.filters.preset.medication.name': 'Long-term medications',
    'search.filters.preset.medication.desc': 'Medication and prescription records — check for missed doses or clashes with a new prescription.',
    'search.filters.preset.cardio.name': 'Everything cardiovascular',
    'search.filters.preset.cardio.desc': 'Blood pressure, lipids, ECG and cardiovascular medication — every record filed under the cardiovascular system.',
    'search.filters.preset.last_year_checkup.name': 'Last year’s check-up',
    'search.filters.preset.last_year_checkup.desc': '{year} check-up reports, for comparing against this year’s results.',
    'search.filters.preset.allergy.name': 'Allergy-related',
    'search.filters.preset.allergy.desc': 'Allergy history — the one thing to confirm before any visit or new prescription.',
    'search.filters.preset.vital_30.name': 'Vitals — last 30 days',
    'search.filters.preset.vital_30.desc': 'A month of self-measured blood pressure, glucose, weight and more.',
    'search.filters.preset.synced.name': 'Synced from hospitals',
    'search.filters.preset.synced.desc': 'Records synced from hospitals — use them to check against your paper reports.',

    /* ================================================================== *
     * 二、页面与交互（modules/search/search.view.js）
     * ================================================================== */

    /* ---------- 标题与说明 ---------- */
    'search.view.headTitle': 'Smart search',
    'search.view.headDesc': 'Filter by date, condition category or record type — or just type a phrase the way you would say it (for example “high blood pressure” or “statin”). The system handles word segmentation, synonym expansion and typo tolerance for you.',
    'search.view.backToRecords': '🗂️ Back to records',
    'search.view.collapseFilter': 'Hide filters',
    'search.view.advancedFilter': '⚙️ Advanced filters',

    /* ---------- 医生访客模式：不提供全量检索（授权范围必须逐条校验） ---------- */
    'search.view.doctorGuestDesc': 'Full-corpus search is not available in doctor guest mode',
    'search.view.doctorGuestTitle': 'Full search is not available in doctor guest mode',
    'search.view.doctorGuestHint': 'A patient’s records can only be viewed after each one has been checked against the consent scope, and a full-corpus search would bypass that check. Go back to Doctor View to see what has been shared with you; if you need more, ask the patient to widen the consent scope.',
    'search.view.goDoctor': 'Go to Doctor View',

    /* ---------- 搜索框 ---------- */
    'search.view.searchPlaceholder': 'Search titles, medications, diagnoses, hospitals, doctors… (Enter to search, / to focus)',
    'search.view.searchAria': 'Search health records',
    'search.view.clearInput': 'Clear',
    'search.view.searchBtn': 'Search',
    'search.view.searching': 'Searching…',
    'search.view.presetsLabel': 'Quick searches',

    /* ---------- 高级筛选面板 ---------- */
    'search.view.advTitle': 'Advanced filters',
    'search.view.advSub': 'Different filters are combined with AND; multiple choices inside one filter are combined with OR.',
    'search.view.resetFilter': 'Reset filters',
    'search.view.rowKeyword': 'Keyword',
    'search.view.rowKeywordPlaceholder': 'Synced with the search box above',
    'search.view.rowDate': 'Date range',
    'search.view.dateFromAria': 'Start date',
    'search.view.dateTo': 'to',
    'search.view.dateToAria': 'End date',
    'search.view.range90': 'Last 90 days',
    'search.view.rangeYear': 'Last year',
    'search.view.rangeAll': 'Any time',
    'search.view.rowType': 'Record type',
    'search.view.rowDiseaseCat': 'Condition category',
    'search.view.rowSourceSeverity': 'Source & severity',
    'search.view.allSources': 'All sources',
    'search.view.allSeverities': 'All severities',
    'search.view.allScopes': 'All consent scopes',
    'search.view.rowTags': 'Tags',
    'search.view.rowOther': 'Other',
    'search.view.abnormalOnly': 'Only records flagged as abnormal',
    'search.view.noTags': '(No records tagged yet)',

    /* ---------- 结果列表 ---------- */
    'search.view.resultTitle': 'Results',
    'search.view.sumCount': '<b>{n}</b> results',
    'search.view.sumShowing': ', showing the first {shown}',
    'search.view.sumExpanded': ' <span class="chip">Expanded with synonyms</span>',
    'search.view.sumTook': '{ms} ms',
    'search.view.relevance': '{pct}% match',
    'search.view.matchByFilter': 'Matches the filters you selected',
    'search.view.matchReason': 'Matched: {fields}',
    'search.view.matchBySynonym': 'Matched after synonym expansion',
    'search.view.matchByContent': 'Matched by record content',
    'search.view.abnormalBadge': 'Abnormal',
    'search.view.editedTimes': 'Edited {n}×',
    'search.view.saveSearchBtn': '⭐ Save this search',
    'search.view.noResultFor': 'No records found for “{q}”',
    'search.view.noResultFiltered': 'No records match yet',
    'search.view.noResultForHint': 'Try a shorter keyword, a different synonym (search “blood pressure” instead of “hypertension”), or loosen the date and type filters.',
    'search.view.noResultFilteredHint': 'Nothing matches the current filters. Hit “Reset filters” to start over.',
    'search.view.clearAllFilters': 'Clear all filters',
    'search.view.deleteItem': 'Delete',

    /* ---------- 输入联想抽屉 ---------- */
    'search.view.sugKeywords': 'Keywords',
    'search.view.sugTypes': 'Record types',
    'search.view.sugDiseases': 'Conditions',
    'search.view.sugDrugs': 'Medications',

    /* ---------- 侧栏：搜索历史 / 常用搜索 / 热门关键词 ---------- */
    'search.view.historyTitle': 'Search history',
    'search.view.clearHistoryBtn': 'Clear',
    'search.view.historyHits': '{n} results',
    'search.view.historyEmpty': 'No searches yet. Once you search, you can reuse the conditions from here in one click.',
    'search.view.savedTitle': 'Saved searches',
    'search.view.savedSub': 'Kept as long as you are signed in',
    'search.view.savedEmpty': 'Hit “Save this search” above the results to pin the current conditions.',
    'search.view.hotTitle': 'Popular keywords',
    'search.view.hotEmpty': 'Your most-used keywords appear here after a few searches.',
    'search.view.indexStats': '{records} records / {tokens} terms indexed · {synonyms} synonym groups · {history} / {max} in history',

    /* ---------- 对话框与提示 ---------- */
    'search.view.savePrompt': 'Name this search so you can run it again from Saved searches:',
    'search.view.clearHistoryTitle': 'Clear search history',
    'search.view.clearHistoryMessage': 'Clear your entire search history?',
    'search.view.clearHistoryDetail': 'This only removes search records — no health data is affected.',
    'search.view.clearHistoryConfirm': 'Clear',
    'search.view.historyCleared': 'Search history cleared',

    /* ================================================================== *
     * 三、检索主流程（modules/search/search.service.js）
     * ================================================================== */
    'module.search.title': 'Smart Search',
    'module.search.desc': 'Filter by date, condition category or record type, with fuzzy matching and synonym expansion.',
    'search.warn.indexReadFail': 'Failed to read records while building search index',
    'search.warn.prepareFail': 'Search preparation failed',
    'search.service.searchFailed': 'Search failed',

    /* ---------- 审计日志（访问追踪里逐条可读） ---------- */
    'search.service.auditConditionalQuery': '(filter-only search)',
    'search.service.auditEmptyKeyword': '(empty — filters only)',
    'search.service.auditDetail': 'Keyword: {kw} · {n} results{cond}{expanded}',
    'search.service.auditCondSuffix': ' · Filters: {cond}',
    'search.service.auditExpandedSuffix': ' · Synonym expansion: {terms}',

    /* ================================================================== *
     * 四、命中片段的字段标签（modules/search/inverted-index.js）
     *     结果列表里高亮片段前面的那行小字，同时也被 search.service.js 复用
     * ================================================================== */
    'search.index.field.title': 'Title',
    'search.index.field.diseaseCat': 'Condition category',
    'search.index.field.type': 'Record type',
    'search.index.field.summary': 'Summary',
    'search.index.field.tags': 'Tags',
    'search.index.field.sourceName': 'Source',
    'search.index.field.keys': 'Category keys',

    /* ================================================================== *
     * 五、搜索历史与常用搜索（modules/search/history.js）
     * ================================================================== */
    'search.history.nameRequired': 'Please give this search a name',
    'search.history.savedToast': 'Saved as “{name}”'
  });

})(window.PHR);
