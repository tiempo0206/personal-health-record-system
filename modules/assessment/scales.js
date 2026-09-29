/**
 * ============================================================================
 * 文件：modules/assessment/scales.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：定义全部心理测评量表的**题库与切分点**，这是本模块唯一的数据来源。
 *      计分引擎（scoring.js）、报告生成（report.js）、应对策略（coping.js）
 *      全部只读这里声明的数据，不自己写死任何题目、分数或切分点。
 *
 *      设计原则：把量表之间的差异**全部声明成数据**，让引擎零特判：
 *        · 反向计分    → 题目上的 reverse: true
 *        · 单题选项不同 → 题目级 options 覆盖量表级默认选项
 *        · 线性换算    → 量表级 transform: { factor, max }（WHO-5 的 ×4）
 *        · 分级        → 量表级 levels 数组，按 max 升序取第一个满足 total <= max
 *        · 维度        → 量表级 dimensions 数组
 *      新增一个量表只需要往 SCALES 里加一项，引擎与视图都不用改。
 *
 * 依赖：core/dict.js（复用 severity 的语气色语义）
 * ============================================================================
 *
 * ⚠️⚠️ 重要声明（请勿删除）⚠️⚠️
 * ---------------------------------------------------------------------------
 * 本文件收录的题目来自**公开发表的标准化筛查量表**，用于帮助用户了解自己
 * 近期的心理状态，属于**自评筛查工具**：
 *
 *   · 它不是诊断工具。筛查分数高**不等于**患病，分数低也**不能排除**问题。
 *   · 任何结论都必须由具备资质的专业人员（精神科医师、心理治疗师）结合
 *     面谈、病史与其它检查做出。
 *   · 本系统的分级文案一律使用「提示 / 建议关注」等措辞，刻意不使用
 *     「你有抑郁症」这类贴标签句式 —— 给人贴标签本身就是一种伤害。
 *
 * 量表来源：
 *   PHQ-9    Kroenke K, Spitzer RL, Williams JBW. J Gen Intern Med. 2001.
 *   GAD-7    Spitzer RL, Kroenke K, Williams JBW, Löwe B. Arch Intern Med. 2006.
 *   ISI      Bastien CH, Vallières A, Morin CM. Sleep Med. 2001.
 *   PSS-10   Cohen S, Kamarck T, Mermelstein R. J Health Soc Behav. 1983.
 *   WHO-5    WHO Regional Office for Europe, DepCare Project. 1998.
 *   CD-RISC-10  Campbell-Sills L, Stein MB. J Trauma Stress. 2007.
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /** 心理测评模块的命名空间（本文件是 modules/assessment 中第一个被加载的） */
  PHR.assessment = PHR.assessment || {};

  /* 模块名与描述的登记放在文件末尾（见「六、模块名」）——
     因为那两句话要跟随语言，而本文件执行时语言还没确定。 */

  /* ================================================================== *
   * 〇、中英双语的接线（本文件是全模块文案的数据源头）
   * ------------------------------------------------------------------
   * ⚠️ 为什么是「取值器」而不是就地写 PHR.t('键','中文')：
   *    本文件在 <script> 阶段执行，而语言要到 boot 阶段的
   *    PHR.i18n.detect() 才被决定 —— 加载时取词会永远拿到中文。
   *    把文案换成 getter 后，取词发生在**渲染的那一刻**，
   *    语言切换后所有页面立刻跟着变，数据里的中文一个都没动。
   *
   * ⚠️ **题目文本 items[].text 刻意不参与**：
   *    它是公开发表量表的原文，换语言等于换掉量表的效度依据，
   *    需要专业翻译与验证，不在本次范围内（见文件头的重要声明）。
   *    要翻的是：量表名/简介、分级名与说明、选项标签、维度名、免责声明。
   * ================================================================== */
  /** 把某个字段就地换成"跟随当前语言"的取值器；缺该字段或非字符串则跳过。
   *  （模块内其它文件的数据表也复用它 —— 只在渲染时取词，加载时不取词） */
  function i18nField(target, field, key) {
    var zh = target[field];
    if (typeof zh !== 'string') { return; }
    Object.defineProperty(target, field, {
      enumerable: true,
      configurable: true,
      get: function () { return PHR.t(key, zh); }
    });
  }

  /** 给一组选项打上词条前缀（词条键 = assessment.opt.<组名>.<分值>） */
  function tagOptions(setKey, opts) {
    opts.forEach(function (o) {
      i18nField(o, 'label', 'assessment.opt.' + setKey + '.' + o.value);
    });
    return opts;
  }

  /* ================================================================== *
   * 一、通用选项集
   * ================================================================== */

  /** PHQ-9 / GAD-7 / 快速筛查：最近两周的出现频率 */
  var OPT_FREQ4 = tagOptions('freq4', [
    { value: 0, label: '完全不会' },
    { value: 1, label: '好几天' },
    { value: 2, label: '一半以上的天数' },
    { value: 3, label: '几乎每天' }
  ]);

  /** ISI 严重程度 */
  var OPT_ISI5 = tagOptions('isi5', [
    { value: 0, label: '无' },
    { value: 1, label: '轻度' },
    { value: 2, label: '中度' },
    { value: 3, label: '重度' },
    { value: 4, label: '极重度' }
  ]);

  /** ISI 第 4 题：对睡眠的满意程度（注意 0 = 非常满意，方向与其它题相反） */
  var OPT_SATISFY5 = tagOptions('satisfy5', [
    { value: 0, label: '非常满意' },
    { value: 1, label: '满意' },
    { value: 2, label: '一般' },
    { value: 3, label: '不满意' },
    { value: 4, label: '非常不满意' }
  ]);

  /** PSS-10 发生频率 */
  var OPT_PSS5 = tagOptions('pss5', [
    { value: 0, label: '从来没有' },
    { value: 1, label: '几乎从来没有' },
    { value: 2, label: '有时' },
    { value: 3, label: '相当经常' },
    { value: 4, label: '非常经常' }
  ]);

  /** WHO-5 幸福感频率（5 分最好，0 分最差） */
  var OPT_WHO6 = tagOptions('who6', [
    { value: 5, label: '一直' },
    { value: 4, label: '大部分时间' },
    { value: 3, label: '超过一半时间' },
    { value: 2, label: '少于一半时间' },
    { value: 1, label: '偶尔' },
    { value: 0, label: '从来没有' }
  ]);

  /** CD-RISC-10 符合程度 */
  var OPT_CD5 = tagOptions('cd5', [
    { value: 0, label: '完全不这样' },
    { value: 1, label: '很少这样' },
    { value: 2, label: '有时这样' },
    { value: 3, label: '经常这样' },
    { value: 4, label: '几乎总是这样' }
  ]);

  /* ================================================================== *
   * 二、量表定义
   * ================================================================== */

  var SCALES = [

    /* ---------------------------------------------------------------- *
     * 1. PHQ-9 抑郁情绪
     * ---------------------------------------------------------------- */
    {
      key: 'phq9',
      name: '抑郁情绪自评',
      shortName: '抑郁',
      icon: '🌧️',
      color: '#5b6ee1',
      topic: '情绪',
      estMinutes: 3,
      desc: '过去两周内，有多少天受到以下问题困扰。',
      intro: '这份问卷询问的是**最近两周**的感受。请根据实际出现的频率作答，不要刻意选择"看起来正常"的答案 —— 只有如实作答，结果才有参考价值。',
      source: 'PHQ-9（Kroenke 等，2001）',
      higherIsBetter: false,
      options: OPT_FREQ4,
      items: [
        { i: 1, text: '做事时提不起劲或没有兴趣' },
        { i: 2, text: '感到心情低落、沮丧或绝望' },
        { i: 3, text: '入睡困难、睡不安稳，或睡眠过多' },
        { i: 4, text: '感觉疲倦或没有活力' },
        { i: 5, text: '食欲不振，或吃得太多' },
        { i: 6, text: '觉得自己很糟、很失败，或让自己和家人失望' },
        { i: 7, text: '注意力难以集中，例如看报纸或看电视时' },
        { i: 8, text: '动作或说话速度明显变慢，或相反地烦躁、坐立不安、动来动去' },
        { i: 9, text: '有「不如死掉」或「想以某种方式伤害自己」的念头', critical: true }
      ],
      dimensions: [
        { key: 'mood', name: '核心情绪', items: [1, 2] },
        { key: 'body', name: '躯体与精力', items: [3, 4, 5, 8] },
        { key: 'mind', name: '认知与自我评价', items: [6, 7] },
        { key: 'risk', name: '危险信号', items: [9] }
      ],
      levels: [
        { max: 4,  key: 'none',     name: '未见明显提示', tone: 'ok',     summary: '本次自评未提示明显的抑郁症状。' },
        { max: 9,  key: 'mild',     name: '轻度提示',     tone: 'info',   summary: '出现了一些抑郁相关的感受，程度较轻。' },
        { max: 14, key: 'moderate', name: '中度提示',     tone: 'warn',   summary: '抑郁相关的感受已经比较明显，建议认真对待。' },
        { max: 19, key: 'moderately_severe', name: '中重度提示', tone: 'danger', summary: '症状负担较重，建议尽快寻求专业评估。' },
        { max: 27, key: 'severe',   name: '重度提示',     tone: 'danger', summary: '症状负担很重，强烈建议尽快就医。' }
      ],
      crisisTotalAt: 20,
      crisisNote: '总分达到 20 分及以上时，抑郁症状通常已明显影响日常生活。'
    },

    /* ---------------------------------------------------------------- *
     * 2. GAD-7 焦虑水平
     * ---------------------------------------------------------------- */
    {
      key: 'gad7',
      name: '焦虑水平自评',
      shortName: '焦虑',
      icon: '⚡',
      color: '#e08a2e',
      topic: '情绪',
      estMinutes: 2,
      desc: '过去两周内，有多少天受到以下问题困扰。',
      intro: '同样是询问**最近两周**的感受。焦虑和担忧是每个人都会有的体验，这份问卷关注的是"程度"和"对生活的影响"，而不是"有没有"。',
      source: 'GAD-7（Spitzer 等，2006）',
      higherIsBetter: false,
      options: OPT_FREQ4,
      items: [
        { i: 1, text: '感到紧张、焦虑或急切' },
        { i: 2, text: '不能够停止或控制担忧' },
        { i: 3, text: '对各种各样的事情担忧过多' },
        { i: 4, text: '很难放松下来' },
        { i: 5, text: '由于不安而无法静坐' },
        { i: 6, text: '变得容易烦恼或急躁' },
        { i: 7, text: '感到似乎将有可怕的事情发生而害怕' }
      ],
      dimensions: [
        { key: 'tension', name: '紧张与担忧', items: [1, 2, 3] },
        { key: 'relax',   name: '放松困难与不安', items: [4, 5] },
        { key: 'irritable', name: '易激惹与恐惧', items: [6, 7] }
      ],
      levels: [
        { max: 4,  key: 'none',     name: '未见明显提示', tone: 'ok',     summary: '本次自评未提示明显的焦虑症状。' },
        { max: 9,  key: 'mild',     name: '轻度提示',     tone: 'info',   summary: '存在一些焦虑感受，程度较轻。' },
        { max: 14, key: 'moderate', name: '中度提示',     tone: 'warn',   summary: '焦虑感受已较明显，可能影响睡眠与专注。' },
        { max: 21, key: 'severe',   name: '重度提示',     tone: 'danger', summary: '焦虑程度较重，建议尽快寻求专业评估。' }
      ],
      crisisTotalAt: null
    },

    /* ---------------------------------------------------------------- *
     * 3. ISI 睡眠状况
     * ---------------------------------------------------------------- */
    {
      key: 'isi',
      name: '睡眠状况自评',
      shortName: '睡眠',
      icon: '🌙',
      color: '#4b7bec',
      topic: '睡眠',
      estMinutes: 2,
      desc: '评估最近两周的睡眠困难程度及其对生活的影响。',
      intro: '睡眠问题往往是最先出现、也最容易改善的一环。请按**最近两周**的实际情况作答。',
      source: 'ISI 失眠严重指数（Bastien 等，2001）',
      higherIsBetter: false,
      options: OPT_ISI5,
      items: [
        { i: 1, text: '入睡困难的程度' },
        { i: 2, text: '夜间醒来后难以再次入睡的程度' },
        { i: 3, text: '早上醒得过早、无法再睡的程度' },
        { i: 4, text: '对当前睡眠模式的满意程度', options: OPT_SATISFY5,
          note: '这一题的选项方向与其它题相反（越满意分数越低）' },
        { i: 5, text: '睡眠问题在多大程度上影响了白天的状态（如疲劳、注意力、情绪）' },
        { i: 6, text: '睡眠问题在多大程度上被他人注意到、或影响了生活质量' },
        { i: 7, text: '你对当前睡眠问题的担心或苦恼程度' }
      ],
      dimensions: [
        { key: 'onset',  name: '入睡与维持', items: [1, 2, 3] },
        { key: 'impact', name: '日间影响',   items: [5, 6] },
        { key: 'worry',  name: '满意度与担忧', items: [4, 7] }
      ],
      levels: [
        { max: 7,  key: 'none',        name: '未见临床意义', tone: 'ok',     summary: '睡眠状况在正常范围内，没有临床意义的失眠。' },
        { max: 14, key: 'subclinical', name: '亚临床提示',   tone: 'info',   summary: '存在轻度睡眠困扰，值得关注但通常不必过度担心。' },
        { max: 21, key: 'moderate',    name: '中度提示',     tone: 'warn',   summary: '睡眠问题已较明显，建议通过行为调整改善，必要时就诊。' },
        { max: 28, key: 'severe',      name: '重度提示',     tone: 'danger', summary: '睡眠问题严重，建议尽快到睡眠门诊或精神心理科就诊。' }
      ],
      crisisTotalAt: null
    },

    /* ---------------------------------------------------------------- *
     * 4. PSS-10 压力感知（含 4 道反向计分题）
     * ---------------------------------------------------------------- */
    {
      key: 'pss10',
      name: '压力感知自评',
      shortName: '压力',
      icon: '🌀',
      color: '#8e6fd8',
      topic: '压力',
      estMinutes: 3,
      desc: '最近一个月，你对生活中压力的主观感受。',
      intro: '这份问卷问的不是"发生了多少事"，而是"你感觉有多失控"。请按**最近一个月**的实际情况作答。',
      source: 'PSS-10 压力知觉量表（Cohen 等，1983）',
      higherIsBetter: false,
      options: OPT_PSS5,
      items: [
        { i: 1,  text: '因为发生了意料之外的事情而感到心烦' },
        { i: 2,  text: '感到无法控制生活中重要的事情' },
        { i: 3,  text: '感到紧张不安、有压力' },
        { i: 4,  text: '对自己处理个人问题的能力感到有信心', reverse: true,
          note: '反向计分题：越有信心，得分越低' },
        { i: 5,  text: '感到事情正按照自己的意愿发展', reverse: true },
        { i: 6,  text: '发现自己无法应付所有必须做的事情' },
        { i: 7,  text: '能够控制生活中令自己恼怒的事情', reverse: true },
        { i: 8,  text: '感到自己掌控了所有事情', reverse: true },
        { i: 9,  text: '因为一些无法控制的事情而生气' },
        { i: 10, text: '感到困难堆积如山，无法克服' }
      ],
      dimensions: [
        { key: 'helpless', name: '失控与无力感', items: [1, 2, 3, 6, 9, 10] },
        { key: 'mastery',  name: '掌控感（反向）', items: [4, 5, 7, 8] }
      ],
      levels: [
        { max: 13, key: 'low',      name: '压力偏低',   tone: 'ok',   summary: '你感知到的压力处于较低水平。' },
        { max: 26, key: 'moderate', name: '压力中等',   tone: 'info', summary: '存在一定压力，属于多数人的常见范围。' },
        { max: 40, key: 'high',     name: '压力偏高',   tone: 'warn', summary: '感知到的压力偏高，长期处于这个水平会消耗身心资源。' }
      ],
      /* ⚠️ PSS-10 没有公认的临床切分点。上面三档只是把 0-40 的连续分数分段
         便于阅读，**不是**临床分级，因此标记 noCutoff：
         界面不会给它上"严重程度"配色，报告里也只给分数与中性描述。 */
      noCutoff: true,
      cutoffNote: 'PSS-10 没有公认的临床切分点，上面三档只是便于阅读的分数分段，不代表临床严重程度。',
      crisisTotalAt: null
    },

    /* ---------------------------------------------------------------- *
     * 5. WHO-5 主观幸福感（需要 ×4 换算成百分制）
     * ---------------------------------------------------------------- */
    {
      key: 'who5',
      name: '主观幸福感自评',
      shortName: '幸福感',
      icon: '☀️',
      color: '#d9a441',
      topic: '积极心理',
      estMinutes: 1,
      desc: '过去两周内，你的整体状态更接近哪一档。',
      intro: '这是一份**正向**问卷，问的是"好状态"出现了多少。原始分需要乘以 4 换算成百分制。',
      source: 'WHO-5 幸福感指数（WHO 欧洲区办事处，1998）',
      higherIsBetter: true,
      options: OPT_WHO6,
      transform: { factor: 4, max: 100 },
      items: [
        { i: 1, text: '我感到心情愉快、精神振奋' },
        { i: 2, text: '我感到平静和放松' },
        { i: 3, text: '我感到精力充沛、有活力' },
        { i: 4, text: '我醒来时感到神清气爽、休息充分' },
        { i: 5, text: '我的日常生活充满了我感兴趣的事情' }
      ],
      dimensions: [
        { key: 'positive', name: '积极状态', items: [1, 2, 3, 4, 5] }
      ],
      levels: [
        { max: 27,  key: 'very_low', name: '明显偏低',   tone: 'danger', summary: '幸福感明显偏低，筛查提示可能需要评估抑郁情绪。' },
        { max: 49,  key: 'low',      name: '偏低',       tone: 'warn',   summary: '幸福感低于一般水平，值得关注。' },
        { max: 67,  key: 'medium',   name: '一般',       tone: 'info',   summary: '幸福感处于中等水平。' },
        { max: 100, key: 'good',     name: '良好',       tone: 'ok',     summary: '幸福感处于良好水平。' }
      ],
      crisisTotalAt: null,
      lowTotalAt: 28,
      crisisNote: 'WHO-5 低于 28 分（百分制）时，国际通行的做法是建议进一步进行抑郁评估。'
    },

    /* ---------------------------------------------------------------- *
     * 6. CD-RISC-10 心理韧性
     * ---------------------------------------------------------------- */
    {
      key: 'cdrisc10',
      name: '心理韧性自评',
      shortName: '韧性',
      icon: '🌱',
      color: '#3d9970',
      topic: '积极心理',
      estMinutes: 2,
      desc: '面对压力与困难时，你通常的应对状态。',
      intro: '韧性不是天生的性格，而是可以被练习的能力。这份问卷帮你看到自己**已经拥有**的资源。',
      source: 'CD-RISC-10 心理韧性量表简版（Campbell-Sills & Stein，2007）',
      higherIsBetter: true,
      options: OPT_CD5,
      items: [
        { i: 1,  text: '当事情发生变化时，我能够适应' },
        { i: 2,  text: '面对压力时，我能够集中精力并思考问题' },
        { i: 3,  text: '遇到问题时，我有时能看到事情有趣的一面' },
        { i: 4,  text: '经历困难之后，我能变得更坚强' },
        { i: 5,  text: '在生病、受伤或遭遇挫折后，我能够恢复过来' },
        { i: 6,  text: '我相信自己能够实现目标' },
        { i: 7,  text: '在压力下，我仍能保持专注和清晰的思考' },
        { i: 8,  text: '我不容易被失败击垮' },
        { i: 9,  text: '我认为自己是一个坚强的人' },
        { i: 10, text: '我能够处理不愉快的情绪' }
      ],
      dimensions: [
        { key: 'tough',  name: '坚韧',       items: [2, 4, 5, 8, 9] },
        { key: 'adapt',  name: '适应与专注', items: [1, 3, 6, 7, 10] }
      ],
      levels: [
        { max: 19, key: 'low',    name: '可调用资源偏少', tone: 'info', summary: '当前可调用的心理资源偏少，这通常和压力水平高有关，是可以通过练习改善的。' },
        { max: 29, key: 'medium', name: '资源中等',       tone: 'info', summary: '具备一定的应对资源，还有提升空间。' },
        { max: 40, key: 'high',   name: '资源较充足',     tone: 'ok',   summary: '具备较好的心理韧性，这是很重要的保护因素。' }
      ],
      /* ⚠️ CD-RISC-10 是研究用的心理韧性量表，**没有临床切分点，也不用于诊断**。
         标记 noCutoff 后界面不给它上严重程度配色，避免出现"你的心理韧性偏低"
         这种没有依据的自我评价。 */
      noCutoff: true,
      cutoffNote: 'CD-RISC-10 没有临床切分点，这里只呈现分数与描述性说明，不构成任何评价或诊断。',
      crisisTotalAt: null
    },

    /* ---------------------------------------------------------------- *
     * 7. 快速筛查（PHQ-2 + GAD-2 + 睡眠，用于决定要不要深入）
     * ---------------------------------------------------------------- */
    {
      key: 'quick',
      name: '快速心理筛查',
      shortName: '快速筛查',
      icon: '🔎',
      color: '#6b7a8f',
      topic: '筛查',
      estMinutes: 1,
      desc: '只有 5 道题，约 1 分钟。用于判断是否需要做更详细的测评。',
      intro: '如果你不确定该做哪份问卷，先从这一份开始。它是几份标准量表的**核心条目组合**，分数偏高时系统会推荐你做对应的完整测评。',
      source: 'PHQ-2 + GAD-2（各量表的 2 条目简版）+ 睡眠条目',
      higherIsBetter: false,
      options: OPT_FREQ4,
      items: [
        { i: 1, text: '做事时提不起劲或没有兴趣' },
        { i: 2, text: '感到心情低落、沮丧或绝望' },
        { i: 3, text: '感到紧张、焦虑或急切' },
        { i: 4, text: '不能够停止或控制担忧' },
        { i: 5, text: '对当前的睡眠状况不满意' }
      ],
      dimensions: [
        { key: 'dep',   name: '抑郁核心条目', items: [1, 2] },
        { key: 'anx',   name: '焦虑核心条目', items: [3, 4] },
        { key: 'sleep', name: '睡眠条目',     items: [5] }
      ],
      levels: [
        { max: 2,  key: 'none', name: '未见明显提示', tone: 'ok',     summary: '核心条目得分很低，暂时没有深入测评的必要。' },
        { max: 6,  key: 'mild', name: '建议深入测评', tone: 'info',   summary: '有个别条目得分偏高，建议做一次对应的完整量表看得更清楚。' },
        { max: 11, key: 'high', name: '建议尽快关注', tone: 'warn',   summary: '多个核心条目得分偏高，建议尽快完成完整测评并考虑咨询专业人员。' },
        { max: 15, key: 'very_high', name: '高度建议就医', tone: 'danger', summary: '核心条目得分普遍偏高，强烈建议尽快寻求专业评估。' }
      ],
      crisisTotalAt: null,
      /* 快速筛查没有 PHQ-9 第 9 题，因此不能只靠"关键条目"触发危机提示 ——
         否则状态最差的人从最低门槛的入口进来反而拿不到任何求助资源。
         这里按**维度分**补一条通路（PHQ-2 / GAD-2 各自满分 6）。 */
      crisisDimension: [
        { dimension: 'dep', at: 6, level: 'urgent', text: '抑郁核心条目（PHQ-2）拿了满分' },
        { dimension: 'dep', at: 4, level: 'watch',  text: '抑郁核心条目得分偏高' },
        { dimension: 'anx', at: 6, level: 'urgent', text: '焦虑核心条目（GAD-2）拿了满分' },
        { dimension: 'anx', at: 4, level: 'watch',  text: '焦虑核心条目得分偏高' }
      ],
      /* 快速筛查的附加产物：按维度推荐做哪份完整量表 */
      recommends: [
        { dimension: 'dep',   scale: 'phq9',   when: 2 },
        { dimension: 'anx',   scale: 'gad7',   when: 2 },
        { dimension: 'sleep', scale: 'isi',    when: 2 }
      ]
    }
  ];

  /* ================================================================== *
   * 三、索引与查询
   * ================================================================== */
  var MAP = SCALES.reduce(function (acc, s) { acc[s.key] = s; return acc; }, {});

  /* ------------------------------------------------------------------ *
   * 3.0 接线：把"要翻译的文案字段"统一换成跟随语言的取值器
   * ------------------------------------------------------------------
   * 词条键的命名规则（与 core/i18n/en-US.assessment.js 一一对应）：
   *   assessment.scale.<量表key>.name / shortName / desc / intro
   *                            / source / cutoffNote / crisisNote
   *   assessment.scale.<量表key>.level.<分级key>.name / .summary
   *   assessment.scale.<量表key>.dim.<维度key>
   *   assessment.scale.<量表key>.item.<题号>.note
   *   assessment.scale.<量表key>.crisisdim.<维度key>.<阈值>
   *   assessment.opt.<选项组>.<分值>
   * 这样新增量表时**不需要**在这里加任何一行 —— 键由数据自动推出。
   * ------------------------------------------------------------------ */
  SCALES.forEach(function (s) {
    var base = 'assessment.scale.' + s.key + '.';

    ['name', 'shortName', 'desc', 'intro', 'source', 'cutoffNote', 'crisisNote']
      .forEach(function (f) { i18nField(s, f, base + f); });

    (s.levels || []).forEach(function (lv) {
      i18nField(lv, 'name', base + 'level.' + lv.key + '.name');
      i18nField(lv, 'summary', base + 'level.' + lv.key + '.summary');
    });

    (s.dimensions || []).forEach(function (d) {
      i18nField(d, 'name', base + 'dim.' + d.key);
    });

    s.items.forEach(function (it) {
      /* ⚠️ 只处理 note（选项方向的说明），**不碰 text** —— 题目是量表原文 */
      i18nField(it, 'note', base + 'item.' + it.i + '.note');
    });

    (s.crisisDimension || []).forEach(function (r) {
      i18nField(r, 'text', base + 'crisisdim.' + r.dimension + '.' + r.at);
    });
  });

  /* 主题名：topic 本身是分组用的**内部键**（topicTone 按它查配色），
     所以只翻译"展示出来的那一份"，数据里的 key 保持原样。 */
  var TOPIC_KEYS = {
    '筛查': 'screen', '情绪': 'mood', '睡眠': 'sleep', '压力': 'stress', '积极心理': 'positive'
  };

  /** 主题的展示名（当前语言） */
  function topicName(topic) {
    var k = TOPIC_KEYS[topic];
    return k ? PHR.t('assessment.topic.' + k, topic) : topic;
  }

  /** 全部量表 */
  function list() { return SCALES.slice(); }

  /** 取单个量表，找不到返回 null */
  function get(key) { return MAP[key] || null; }

  /** 取量表名 */
  function nameOf(key) {
    var s = MAP[key];
    return s ? s.name : (key || '未知量表');
  }

  /** 量表总题数 */
  function itemCount(key) {
    var s = MAP[key];
    return s ? s.items.length : 0;
  }

  /** 满分 */
  function maxOf(key) {
    var s = MAP[key];
    if (!s) { return 0; }
    return s.items.reduce(function (sum, it) {
      var opts = it.options || s.options;
      return sum + U.max(opts, 'value');
    }, 0);
  }

  /** 按主题分组，用于目录页 */
  function byTopic() {
    var groups = [];
    var seen = {};
    SCALES.forEach(function (s) {
      if (!seen[s.topic]) {
        seen[s.topic] = { topic: s.topic, scales: [] };
        groups.push(seen[s.topic]);
      }
      seen[s.topic].scales.push(s);
    });
    return groups;
  }

  /** 取某个主题的语气色（用于卡片着色） */
  function topicTone(topic) {
    return { '筛查': 'primary', '情绪': 'warn', '睡眠': 'info', '压力': 'accent', '积极心理': 'ok' }[topic] || 'muted';
  }

  /** 某个量表的全部题号 */
  function itemIds(key) {
    var s = MAP[key];
    return s ? s.items.map(function (it) { return it.i; }) : [];
  }

  /** 取某题的定义 */
  function item(key, i) {
    var s = MAP[key];
    if (!s) { return null; }
    return s.items.filter(function (it) { return it.i === i; })[0] || null;
  }

  /** 取某题的选项集（题目级优先，其次量表级） */
  function optionsOf(key, i) {
    var s = MAP[key];
    if (!s) { return []; }
    var it = item(key, i);
    return (it && it.options) || s.options || [];
  }

  /* ================================================================== *
   * 五、免责声明（界面、报告、导出三处复用同一段文字）
   * ================================================================== */
  var DISCLAIMER_ZH =
    '本测评为**自评筛查工具**，不是诊断工具。筛查分数偏高不等于患病，分数正常也不能排除问题。' +
    '任何结论都应由具备资质的专业人员（精神科医师、心理治疗师）结合面谈与病史做出。' +
    '如果你正经历强烈的痛苦，或出现伤害自己的念头，请立即联系专业人员或拨打急救电话。';

  var DISCLAIMER_SHORT_ZH = '自评筛查工具，非诊断依据；结果不能替代专业评估。';

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.assessment.scales = {
    list: list,
    get: get,
    nameOf: nameOf,
    itemCount: itemCount,
    maxOf: maxOf,
    byTopic: byTopic,
    topicTone: topicTone,
    topicName: topicName,
    itemIds: itemIds,
    item: item,
    optionsOf: optionsOf,

    /** 数据表的中英接线工具：把某个字段换成"渲染时才取词"的取值器 */
    i18nField: i18nField,

    /* 免责声明做成取值器：语言切换后，界面/报告/导出三处一起跟着变 */
    get DISCLAIMER() { return PHR.t('assessment.disclaimer', DISCLAIMER_ZH); },
    get DISCLAIMER_SHORT() { return PHR.t('assessment.disclaimerShort', DISCLAIMER_SHORT_ZH); },

    ALL: SCALES
  };

  /* ================================================================== *
   * 六、模块名（面包屑用）
   * ------------------------------------------------------------------
   * ⚠️ registerModule 会把 meta.title **读成字符串**存下来，而本文件执行时
   *    语言还没确定（boot 的 detect() 在 DOMContentLoaded 才跑），
   *    所以启动完成时与每次切换语言时各重新登记一次 ——
   *    「外壳」在语言切换后也会重绘面包屑，而本文件的监听器注册得比它早，
   *    因此重登记一定发生在重绘之前。
   * ================================================================== */
  function registerMeta() {
    PHR.registerModule('assessment', {
      title: PHR.t('module.assessment.title', '心理测评'),
      description: PHR.t('module.assessment.desc',
        '多个主题的心理量表自评，生成分级报告与可执行的应对策略'),
      icon: '🧠',
      order: 9
    });
  }
  registerMeta();
  PHR.bus.on('app:ready', registerMeta);
  PHR.bus.on('locale:changed', registerMeta);

})(window.PHR);
