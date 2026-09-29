/**
 * ============================================================================
 * 文件：modules/search/fuzzy.js
 * 层：业务模块层（智能搜索 —— 模块 3）
 * 职责：纯算法层，不碰 DOM、不读写存储：
 *      · tokenize            中文按「单字 + 二元组」切分，英文/数字按单词切分
 *      · levenshtein         编辑距离（带提前退出优化）
 *      · similarity          基于编辑距离的 0~1 相似度
 *      · subsequenceMatch    子序列匹配（用户少打几个字也能命中）
 *      · score               综合打分 0~1（精确包含 > 子序列 > bigram 重合 > 编辑距离）
 *      · synonyms / expand   医学术语同义词表与查询扩展（血压 ↔ 高血压 ↔ BP）
 *      · snippet             命中关键词附近的上下文片段（结果列表展示用）
 *      本文件是 modules/search 中第一个被加载的文件，负责初始化 PHR.search。
 * 依赖：core/namespace.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  PHR.search = PHR.search || {};

  var fuzzy = {};

  var RE_CJK = /[㐀-䶿一-鿿]/;   // 汉字（含扩展 A 区）
  var RE_WORD = /[a-z0-9]/;                       // 英文与数字

  /* ================================================================== *
   * 一、归一化与分词
   * ================================================================== */

  /** 归一化：全角转半角 → 小写 → 去首尾空白。长度与原文一一对应（便于回定位） */
  function normalize(text) {
    if (text === null || text === undefined) { return ''; }
    return String(text)
      .replace(/[！-～]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .replace(/　/g, ' ')
      .toLowerCase()
      .trim();
  }
  fuzzy.normalize = normalize;

  /**
   * 分词。返回 token 数组（**不去重**，重复出现即代表词频，供 TF 计算）。
   *   · 汉字串：输出每个单字 + 每个相邻二元组(bigram)；
   *     若整串不超过 6 个字，再额外输出整串，让「原发性高血压」能被整体命中。
   *   · 英文/数字：按连续串切成单词（"7.8"、"hba1c"、"ct" 都保留为一个词）。
   *   · 其它字符（标点、空白）视为分隔符。
   */
  function tokenize(text) {
    var s = normalize(text);
    var out = [];
    var cjk = [];
    var word = [];

    function flushCjk() {
      if (cjk.length === 1) { out.push(cjk[0]); }
      else if (cjk.length > 1) {
        for (var i = 0; i < cjk.length; i++) { out.push(cjk[i]); }
        for (var j = 0; j + 1 < cjk.length; j++) { out.push(cjk[j] + cjk[j + 1]); }
        if (cjk.length <= 6) { out.push(cjk.join('')); }
      }
      cjk = [];
    }
    function flushWord() {
      if (word.length) { out.push(word.join('')); }
      word = [];
    }

    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (RE_CJK.test(ch)) {
        flushWord();
        cjk.push(ch);
      } else if (RE_WORD.test(ch)) {
        flushCjk();
        word.push(ch);
      } else if (ch === '.' && word.length && /[0-9]/.test(s.charAt(i - 1)) && /[0-9]/.test(s.charAt(i + 1))) {
        word.push(ch);              // 7.8 这类小数整体保留
      } else {
        flushCjk();
        flushWord();
      }
    }
    flushCjk();
    flushWord();
    return out;
  }
  fuzzy.tokenize = tokenize;

  /* ================================================================== *
   * 二、编辑距离与相似度
   * ================================================================== */

  /**
   * 编辑距离（Levenshtein）。
   * 提前退出优化：① 长度差已超过 limit 时直接放弃；② 某一行最小值已超过 limit 时放弃。
   * 放弃时返回 limit + 1，调用方只需判断 > limit 即可，无需精确值。
   */
  function levenshtein(a, b, limit) {
    a = String(a === null || a === undefined ? '' : a);
    b = String(b === null || b === undefined ? '' : b);
    if (a === b) { return 0; }
    if (!a.length) { return b.length; }
    if (!b.length) { return a.length; }
    if (limit !== undefined && Math.abs(a.length - b.length) > limit) { return limit + 1; }

    var prev = [];
    var cur = [];
    var i, j;
    for (j = 0; j <= b.length; j++) { prev[j] = j; }

    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      var rowMin = cur[0];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) { rowMin = cur[j]; }
      }
      if (limit !== undefined && rowMin > limit) { return limit + 1; }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[b.length];
  }
  fuzzy.levenshtein = levenshtein;

  /** 相似度 0~1（1 - 距离 / 较长串长度）。距离过大时直接返回 0 */
  function similarity(a, b) {
    a = normalize(a);
    b = normalize(b);
    var max = Math.max(a.length, b.length);
    if (!max) { return 0; }
    var limit = Math.floor(max * 0.8);
    var d = levenshtein(a, b, limit);
    if (d > limit) { return 0; }
    return 1 - d / max;
  }
  fuzzy.similarity = similarity;

  /**
   * 子序列匹配：query 的每个字符按顺序出现在 text 中即算命中。
   * 返回 { hit, start, end, span, gaps } 或 null。
   * span 越小说明命中的字符越集中（"糖血病"能命中"血糖偏高、糖尿病"这类文本）。
   */
  function subsequenceMatch(query, text) {
    var q = normalize(query);
    var t = normalize(text);
    if (!q || !t || q.length > t.length) { return null; }

    var direct = t.indexOf(q);
    if (direct >= 0) {
      return { hit: true, start: direct, end: direct + q.length, span: q.length, gaps: 0 };
    }

    var i = 0;
    var start = -1;
    var end = -1;
    var last = -1;
    var gaps = 0;
    for (var j = 0; j < t.length && i < q.length; j++) {
      if (t.charAt(j) === q.charAt(i)) {
        if (start < 0) { start = j; }
        else if (j - last > 1) { gaps++; }
        last = j;
        end = j;
        i++;
      }
    }
    if (i < q.length) { return null; }
    return { hit: true, start: start, end: end + 1, span: end - start + 1, gaps: gaps };
  }
  fuzzy.subsequenceMatch = subsequenceMatch;

  /* ================================================================== *
   * 三、综合打分
   * ================================================================== */
  /**
   * 综合打分 0~1。四种情形按"可信度递减"给分，取最高分（不做叠加，避免虚高）：
   *
   *   ① 精确包含 —— 0.85 ~ 1.00
   *      最可信。位置越靠前、占文本比例越高，分数越高（标题开头命中 > 正文中间命中）。
   *   ② 子序列命中 —— 0.55 ~ 0.80
   *      用户少打几个字（"糖血病"、"心梗"）也能命中，但毕竟不是原样出现，故次之。
   *      命中越集中（span 越接近 query 长度）分越高；每有一处断档（gaps）再扣 0.01。
   *   ③ bigram / 单字重合率 —— 0 ~ 0.55
   *      用于语序不同但用词一致的场景（"血压 高" 命中 "高血压"）。二元组权重 1、单字权重 0.4，
   *      因为二元组比单字有区分度得多（单字"的""是"几乎无信息量）。
   *      分数与重合率成正比（重合率 1 时取满 0.55）：故意不设保底分，
   *      否则随便命中一个"不""的"就能拿到 0.2，会把无关记录全捞进来。
   *   ④ 编辑距离兜底 —— 0 ~ 0.35
   *      只在前三项都没找到任何线索时才计算（省掉大量无谓的距离矩阵运算），
   *      用于容忍一两个错别字；分数刻意压得很低，避免把无关记录顶上来。
   *
   * @param {string} query  查询词
   * @param {string} text   被比对的文本（标题 / 某个字段 / 摘要）
   * @param {Set|Array} [tokens] text 的分词结果，传入可省一次分词
   */
  function score(query, text, tokens) {
    var q = normalize(query);
    if (!q) { return 0; }
    var t = normalize(text);
    if (!t) { return 0; }
    if (t === q) { return 1; }

    var best = 0;

    // ① 精确包含
    var pos = t.indexOf(q);
    if (pos >= 0) {
      var closeness = 1 - pos / Math.max(1, t.length);
      var coverage = q.length / Math.max(1, t.length);
      best = 0.85 + 0.10 * closeness + 0.05 * coverage;
    }

    // ② 子序列
    var sub = subsequenceMatch(q, t);
    if (sub) {
      var density = q.length / Math.max(1, sub.span);
      best = Math.max(best, 0.55 + 0.25 * density - 0.01 * sub.gaps);
    }

    // ③ bigram / 单字重合率
    var qTokens = tokenize(q);
    if (qTokens.length) {
      var set = tokens instanceof Set ? tokens : new Set(tokens || tokenize(t));
      var hitW = 0;
      var allW = 0;
      for (var i = 0; i < qTokens.length; i++) {
        var w = qTokens[i].length >= 2 ? 1 : 0.4;
        allW += w;
        if (set.has(qTokens[i])) { hitW += w; }
      }
      if (hitW > 0) { best = Math.max(best, 0.55 * (hitW / allW)); }
    }

    // ④ 编辑距离兜底（仅当前三项毫无收获时才算）
    if (best < 0.20) {
      var sim = similarity(q, t);
      if (t.length > 12) {
        var list = tokens instanceof Set ? Array.from(tokens) : tokenize(t);
        for (var k = 0; k < list.length; k++) {
          if (list[k].length > 1) { sim = Math.max(sim, similarity(q, list[k])); }
        }
      }
      best = Math.max(best, 0.35 * sim);
    }

    return Math.min(1, best);
  }
  fuzzy.score = score;

  /* ================================================================== *
   * 四、医学术语同义词表
   * ================================================================== */
  /**
   * 同义词组：同一组内的词视为等价，检索时互相扩展。
   * 覆盖指标、疾病、药品（通用名 ↔ 商品名）、症状、生活方式五类。
   */
  fuzzy.synonyms = [
    ['血压', '高血压', '血压高', 'bp', '收缩压', '舒张压', '高压', '低压', '降压'],
    ['血糖', '糖尿病', '血糖高', '空腹血糖', '餐后血糖', '糖化血红蛋白', 'hba1c', '降糖'],
    ['血脂', '高血脂', '胆固醇', '低密度脂蛋白', 'ldl', 'hdl', '甘油三酯', '降脂'],
    ['感冒', '上呼吸道感染', '上感', '流感', '着凉', '受凉'],
    ['心梗', '心肌梗死', '心肌梗塞', '冠心病', '心绞痛', 'ami'],
    ['脑梗', '脑梗死', '脑梗塞', '脑卒中', '中风', '脑血栓', '脑出血'],
    ['尿酸', '痛风', '血尿酸', '高尿酸', '尿酸高'],
    ['肝功能', 'alt', '谷丙转氨酶', '转氨酶', 'ast', '谷草转氨酶', '肝酶', '转肽酶'],
    ['肾功能', '肌酐', '血肌酐', '尿素氮', 'egfr', '肾小球滤过率', '蛋白尿'],
    ['过敏', '变态反应', '过敏性', '过敏原', '超敏反应', '过敏史'],
    ['体重', 'bmi', '肥胖', '超重', '体质指数', '减重', '瘦'],
    ['睡眠', '失眠', '入睡困难', '睡眠质量', '睡眠时长', '熬夜', '早醒'],
    ['心率', '脉搏', '静息心率', '心跳', '心动过速', '心律不齐'],
    ['血氧', '血氧饱和度', 'spo2', '氧饱和度', '低氧'],
    ['体温', '发烧', '发热', '低烧', '高热', '退烧'],
    ['腰围', '腹型肥胖', '中心性肥胖', '肚子大'],
    ['体检', '健康体检', '查体', '体检报告', '入职体检', '年度体检'],
    ['化验', '检验', '化验单', '血常规', '生化', '检查报告'],
    ['影像', 'ct', '核磁', '磁共振', 'mri', '超声', 'b超', 'x光', '拍片', 'dr'],
    ['心电图', 'ecg', '心电', '动态心电图'],
    ['胃病', '胃炎', '胃痛', '胃溃疡', '反酸', '消化不良', '幽门螺杆菌'],
    ['咳嗽', '咳痰', '干咳', '气喘', '哮喘', '支气管炎'],
    ['头痛', '头疼', '偏头痛', '头晕', '眩晕', '头昏'],
    ['关节', '关节炎', '关节痛', '风湿', '类风湿', '骨关节炎', '膝盖疼'],
    ['骨质疏松', '骨密度', '补钙', '钙片', '维生素d', '骨折'],
    ['疫苗', '接种', '预防针', '流感疫苗', '乙肝疫苗', '新冠疫苗', '加强针'],
    ['手术', '开刀', '切除', '术后', '术前', '麻醉'],
    ['住院', '入院', '出院', '病房', '床位', '留观'],
    ['甲状腺', '甲功', 'tsh', '甲亢', '甲减', '甲状腺结节', 't3', 't4'],
    ['抗生素', '抗菌药', '消炎药', '阿莫西林', '头孢', '青霉素', '左氧氟沙星'],
    ['抗过敏药', '氯雷他定', '开瑞坦', '西替利嗪', '扑尔敏', '抗组胺'],
    ['降压药', '缬沙坦', '氯沙坦', '厄贝沙坦', 'arb', 'acei', '利尿剂', '倍他乐克'],
    ['阿司匹林', '拜阿司匹灵', '乙酰水杨酸', 'aspirin', '拜阿', '抗血小板'],
    ['氨氯地平', '络活喜', '苯磺酸氨氯地平', '压氏达', '硝苯地平', 'ccb'],
    ['二甲双胍', '格华止', '美迪康', '阿卡波糖', '拜糖平', '胰岛素'],
    ['阿托伐他汀', '立普妥', '瑞舒伐他汀', '可定', '他汀', '辛伐他汀'],
    ['维生素', '维c', '维生素c', '叶酸', '复合维生素', '保健品', '钙尔奇'],
    ['吸烟', '抽烟', '戒烟', '香烟', '二手烟'],
    ['饮酒', '喝酒', '戒酒', '酒精', '酗酒'],
    ['运动', '锻炼', '散步', '跑步', '健身', '步数', '有氧运动'],
    ['家族史', '家族病史', '遗传', '遗传史', '亲属患病', '直系亲属'],
    ['尿检', '尿常规', '尿液', '尿蛋白', '尿潜血'],
    ['肺', '肺部', '胸片', '肺结节', '肺炎', '呼吸', '胸闷'],
    ['前列腺', 'psa', '前列腺增生', '前列腺炎'],
    ['贫血', '血红蛋白', '血色素', '缺铁'],
    ['肠胃', '腹泻', '拉肚子', '便秘', '腹痛', '肠炎'],
    ['抑郁', '焦虑', '情绪', '心理', '压力', '情绪低落', '心理咨询'],
    ['复诊', '随访', '复查', '回访', '定期复查'],
    ['过敏性鼻炎', '鼻炎', '打喷嚏', '流鼻涕', '鼻塞'],
    ['皮炎', '湿疹', '皮疹', '荨麻疹', '瘙痒', '皮肤过敏']
  ];

  /** 药品名词库（供输入联想与「药品」候选使用，含通用名与常见商品名） */
  fuzzy.drugs = [
    '阿司匹林', '拜阿司匹灵', '氯吡格雷', '波立维', '阿托伐他汀', '立普妥', '瑞舒伐他汀',
    '氨氯地平', '络活喜', '硝苯地平', '缬沙坦', '氯沙坦', '厄贝沙坦', '美托洛尔', '倍他乐克',
    '比索洛尔', '氢氯噻嗪', '呋塞米', '二甲双胍', '格华止', '阿卡波糖', '拜糖平', '格列美脲',
    '西格列汀', '胰岛素', '左甲状腺素', '优甲乐', '甲巯咪唑', '碳酸钙', '钙尔奇', '骨化三醇',
    '阿莫西林', '头孢呋辛', '阿奇霉素', '左氧氟沙星', '甲硝唑', '奥美拉唑', '泮托拉唑',
    '铝碳酸镁', '蒙脱石散', '双歧杆菌', '氯雷他定', '开瑞坦', '西替利嗪', '孟鲁司特',
    '布地奈德', '沙美特罗', '沙丁胺醇', '氨溴索', '对乙酰氨基酚', '布洛芬', '塞来昔布',
    '泼尼松', '甲泼尼龙', '别嘌醇', '非布司他', '秋水仙碱', '叶酸', '维生素d', '维生素c',
    '复方丹参滴丸', '速效救心丸', '硝酸甘油', '麝香保心丸'
  ];

  /** token -> 所属同义词组的索引（懒构建） */
  var synMap = null;
  function synonymMap() {
    if (synMap) { return synMap; }
    synMap = Object.create(null);
    fuzzy.synonyms.forEach(function (group, gi) {
      group.forEach(function (term) {
        var k = normalize(term);
        if (k && synMap[k] === undefined) { synMap[k] = gi; }
      });
    });
    return synMap;
  }
  fuzzy.synonymMap = synonymMap;

  /**
   * 查询扩展：返回原词 + 全部同义词。
   * @returns {{terms:string[], expanded:boolean}} expanded 为 true 表示确实做了同义扩展
   */
  function expand(query, max) {
    var q = normalize(query);
    var terms = [];
    var seen = Object.create(null);
    var cap = max || 24;

    function push(t) {
      t = normalize(t);
      if (t && !seen[t] && terms.length < cap) { seen[t] = 1; terms.push(t); }
    }

    push(q);
    if (!q) { return { terms: terms, expanded: false }; }

    var map = synonymMap();
    var expanded = false;

    // 1) 整串命中词组
    if (map[q] !== undefined) {
      fuzzy.synonyms[map[q]].forEach(push);
      expanded = true;
    }

    // 2) 按标点/空格拆开后逐段命中；长查询里包含词组时也算命中（如「高血压 2 级」含「高血压」）
    var pieces = q.split(/[\s,，、;；/|+]+/).filter(Boolean);
    pieces.forEach(function (p) {
      if (map[p] !== undefined) {
        fuzzy.synonyms[map[p]].forEach(push);
        expanded = true;
        return;
      }
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.length >= 2 && p.indexOf(k) >= 0) {
          fuzzy.synonyms[map[k]].forEach(push);
          expanded = true;
        }
      }
    });

    return { terms: terms, expanded: expanded };
  }
  fuzzy.expand = expand;

  /* ================================================================== *
   * 五、高亮片段
   * ================================================================== */
  /**
   * 截取命中词附近的上下文，供结果列表展示。
   * @returns {{text:string, term:string, hit:boolean}} term 为文本中真实出现的片段（用于高亮）
   */
  function snippet(text, term, radius) {
    var raw = String(text === null || text === undefined ? '' : text);
    var r = radius === undefined ? 28 : radius;
    var flat = raw.length === normalize(raw).length ? normalize(raw) : raw.toLowerCase();
    var q = normalize(term);

    var idx = q ? flat.indexOf(q) : -1;
    var len = q.length;

    if (idx < 0 && q) {
      // 退化为子序列：用真实文本片段作为高亮词
      var sub = subsequenceMatch(q, flat);
      if (sub) { idx = sub.start; len = Math.max(1, sub.end - sub.start); }
    }
    if (idx < 0) {
      return { text: raw.length > r * 2 ? raw.slice(0, r * 2) + '…' : raw, term: '', hit: false };
    }

    var start = Math.max(0, idx - r);
    var end = Math.min(raw.length, idx + len + r);
    return {
      text: (start > 0 ? '…' : '') + raw.slice(start, end) + (end < raw.length ? '…' : ''),
      term: raw.slice(idx, idx + len),
      hit: true
    };
  }
  fuzzy.snippet = snippet;

  PHR.search.fuzzy = fuzzy;

})(window.PHR);
