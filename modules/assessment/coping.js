/**
 * ============================================================================
 * 文件：modules/assessment/coping.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：把「分数」翻译成「接下来可以做什么」。
 *
 *      设计取舍：**不按"量表 × 分级 × 时段"穷举文案**（那是 7×4×3 ≈ 80 条，
 *      既写不完也维护不动），而是：
 *        通用策略池（按强度分档 × 三个时段，约 12 条）
 *        ＋ 每个量表 2~3 条专属补充
 *      强度分档读的是量表分级，量表差异仍然只体现在数据里。
 *
 *  ⚠️ 三条硬规矩（写代码时不能破）：
 *    1. **绝不出现任何药物名称、剂量或治疗方案。** 这是红线。
 *    2. 强度为「重」时，必须**把"联系专业人员"放在第一条**，
 *       并且不再堆砌"多喝水、早睡觉"这类对重度痛苦显得轻慢的建议。
 *    3. 所有建议都是**低门槛、可执行**的动作。不写"保持积极心态"这种
 *       做不到也没法验证的空话。
 *
 *  ⚠️ 中英双语：下面的建议池里保留**中文原文**，英文词条在
 *     core/i18n/en-US.assessment.js 里，键名规则见 forResult() 前的注释。
 *     建议是在"生成报告的那一刻"才取词的，所以语言切换后立刻生效。
 *
 * 依赖：modules/assessment/{scales,scoring}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var S = PHR.assessment.scales;
  var SC = PHR.assessment.scoring;

  /* ================================================================== *
   * 一、强度分档
   * ================================================================== */
  /** 把各量表自己的 level.key 映射到统一的四档强度 */
  var INTENSITY = {
    /* PHQ-9 / GAD-7 / 快速筛查 */
    none: 'none', mild: 'mild', moderate: 'moderate',
    moderately_severe: 'severe', severe: 'severe', very_high: 'severe', high: 'moderate',
    /* ISI */
    subclinical: 'mild',
    /* PSS-10 */
    low: 'none',
    /* WHO-5 */
    good: 'none', medium: 'mild', very_low: 'severe',
    /* CD-RISC-10 */
    high: 'none'
  };

  /**
   * 取某份结果的强度档。
   * ⚠️ 对 noCutoff 量表（PSS-10 / CD-RISC-10）**强制封顶到 mild**：
   * 它们没有公认切分点，凭什么按分数给出"重度"级别的行动建议。
   */
  function intensityOf(scaleKey, result) {
    var scale = S.get(scaleKey);
    if (!scale || !result || !result.level) { return 'none'; }
    var lv = INTENSITY[result.level.key] || 'mild';
    if (scale.noCutoff && (lv === 'moderate' || lv === 'severe')) { return 'mild'; }
    return lv;
  }

  /* ================================================================== *
   * 二、通用策略池
   * ================================================================== */
  /** 不论哪个量表都适用、且确实做得到的动作 */
  var POOL = {
    none: {
      immediate: [
        { title: '保持现在的作息节奏', detail: '固定的入睡与起床时间，是心理状态最省力的保护因素。' },
        { title: '给情绪留一个出口', detail: '每周和信任的人聊一次近况，不用聊问题，聊什么都行。' }
      ],
      weekly: [
        { title: '每周三次、每次 30 分钟的快走', detail: '规律的有氧运动对情绪的改善有比较一致的证据，比"多休息"更管用。' },
        { title: '记录一件当天顺利的小事', detail: '不用写长，一句话即可。目的是让注意力不只停在问题上。' }
      ],
      professional: []
    },
    mild: {
      immediate: [
        { title: '今天就早睡 30 分钟', detail: '睡眠和情绪是互相影响的，先把睡眠往前挪一点，往往比硬扛更有效。' },
        { title: '把担心的事写下来', detail: '拿张纸分两栏：「能做的」和「做不了的」。只对第一栏安排下一步。' }
      ],
      weekly: [
        { title: '安排一件"只为放松"的活动', detail: '散步、听歌、做顿饭都行。关键是它**不为了达成什么目标**。' },
        { title: '减少睡前刷手机的时间', detail: '睡前一小时把手机放到够不着的地方，这是改善睡眠最有效的一步。' },
        { title: '试着把"我最近有点累"说出口', detail: '对家人或朋友说一句就够了，不需要展开。' }
      ],
      professional: [
        { title: '两周后复评一次', detail: '如果分数没有下降或继续升高，建议找心理咨询师聊一次。' }
      ]
    },
    moderate: {
      immediate: [
        { title: '先做一件最小的事', detail: '状态不好时"什么都做不动"很常见。挑一件 5 分钟能完成的事（洗脸、下楼走一圈），做完就算赢。' },
        { title: '把大任务拆到小得可笑', detail: '"整理房间"改成"把桌上的三个杯子放回厨房"。可完成感本身就能缓解无力感。' },
        { title: '限制反复回想的时间', detail: '给自己定"每天想 20 分钟"，时间一到就去做别的事。不是压抑，是给念头设边界。' }
      ],
      weekly: [
        { title: '开始规律作息，从起床时间入手', detail: '不要先逼自己早睡，而是先固定起床时间。生物钟会自己跟上。' },
        { title: '每周至少两次与人面对面相处', detail: '线上不算。哪怕只是一起吃顿饭。' },
        { title: '减少酒精与咖啡因', detail: '两者都会让焦虑与睡眠问题加重，尤其在晚上。' },
        { title: '每天 20 分钟中等强度运动', detail: '快走、骑车、游泳都可以。坚持两周通常能感觉到差别。' }
      ],
      professional: [
        { title: '建议预约一次心理咨询或精神心理科门诊', detail: '中度水平通过专业帮助通常改善更快，不必等到"更严重再说"。' },
        { title: '如果两周内没有改善，请尽快就诊', detail: '把这份报告带给医生，能省下不少沟通时间。' }
      ]
    },
    severe: {
      immediate: [
        { title: '**优先联系专业人员**', detail: '当前的状态靠自己调整会比较吃力。请把"约一次门诊或咨询"当作这周最重要的一件事。' },
        { title: '不要独自做重大决定', detail: '在状态低谷时做的判断往往偏悲观。换工作、分手、退学这类决定，先放一放。' },
        { title: '保证基本的安全与照顾', detail: '尽量不独处、按时吃饭、把可能伤害自己的物品收起来。这些不是小题大做。' }
      ],
      weekly: [
        { title: '让至少一个人知道你的真实状态', detail: '家人、朋友、同事都行。被具体的人知道，比"被理解"更重要。' },
        { title: '把日常要求降到最低', detail: '这周只完成"必须完成"的事，其余可以往后放。' }
      ],
      professional: [
        { title: '尽快（本周内）到精神心理科或心理门诊就诊', detail: '带上这份报告。如果需要，可以请家人或朋友陪同。' },
        { title: '如果出现伤害自己的念头，请立即联系专业人员或拨打急救电话', detail: '报告下方附有可随时拨打的求助渠道。' }
      ]
    }
  };

  /* ================================================================== *
   * 三、量表专属补充
   * ================================================================== */
  var SCALE_TIPS = {
    phq9: {
      immediate: [
        { title: '安排一件曾经让你有兴致的事', detail: '哪怕现在做起来没什么感觉 —— 抑郁的特点是"先行动，感受才会跟上"，顺序反了会一直等不到。' }
      ],
      weekly: [
        { title: '每天在同一时间出门晒 20 分钟太阳', detail: '光照对情绪与睡眠节律都有帮助，且几乎没有门槛。' }
      ]
    },
    gad7: {
      immediate: [
        { title: '试一次 4-7-8 呼吸', detail: '吸气 4 秒、屏住 7 秒、缓慢呼气 8 秒，重复 4 轮。焦虑发作时生理上的镇静往往先于想法改变。' },
        { title: '把担忧"预约"到固定时段', detail: '念头来时记一笔，告诉自己"晚上 8 点再想"。多数担忧到那时会显得没那么急。' }
      ],
      weekly: [
        { title: '每天限制一次查看工作消息的时间段', detail: '持续在线会维持"随时有事"的警觉状态，这是焦虑的常见燃料。' }
      ]
    },
    isi: {
      immediate: [
        { title: '躺下 20 分钟睡不着就先起来', detail: '离开床，做点无聊的事（比如看说明书），有困意再回床上。**不要在床上翻来覆去**，那会让床和"睡不着"绑定。' },
        { title: '把钟表转过去', detail: '夜里反复看时间会显著加重焦虑，进而更难入睡。' }
      ],
      weekly: [
        { title: '固定起床时间，周末也一样', detail: '这是失眠行为治疗里最重要的一条，比"补觉"有效得多。' },
        { title: '下午两点后不碰咖啡因', detail: '咖啡因的半衰期约 5 小时，下午的咖啡会影响夜里的入睡。' }
      ]
    },
    pss10: {
      immediate: [
        { title: '写下三件「今天做到了」的小事', detail: '压力感往往来自"什么都做不好"的错觉，把它换成具体事实。' }
      ],
      weekly: [
        { title: '找出一个可以推掉或延后的承诺', detail: '压力常常不是事情本身，而是事情同时到期。' }
      ]
    },
    who5: {
      immediate: [
        { title: '今天安排一件"期待的事"', detail: '幸福感偏低时，生活容易只剩下"该做的事"。挑一件"想做"的排进去。' }
      ],
      weekly: [
        { title: '恢复一项曾经的兴趣', detail: '不用重新拾起全部，先做一次就好。' }
      ]
    },
    cdrisc10: {
      immediate: [
        { title: '回想一次你熬过来的经历', detail: '具体到当时做了什么、谁帮了你。这是你自己的证据，比任何鼓励都实在。' }
      ],
      weekly: [
        { title: '把"求助"当成一项技能来练', detail: '韧性不等于自己扛。能准确说出"我需要什么帮助"，是韧性的一部分。' }
      ]
    },
    quick: {
      immediate: [
        { title: '先做完对应的完整测评', detail: '这份快速筛查只用了核心条目，完整量表能给出更具体的分布与建议。' }
      ],
      weekly: []
    }
  };

  /* ================================================================== *
   * 四、主入口
   * ================================================================== */
  /**
   * 把一池建议翻译成当前语言。
   * ⚠️ 为什么不在数据里直接写 PHR.t('键','中文')：本文件在 <script> 阶段执行，
   *    那时语言还没确定（见 scales.js 的说明），加载时取词会永远拿到中文。
   *    因此建议池里保留中文原文，**每次生成建议时**才按当前语言取词。
   * @param {Array} list 建议数组 [{title, detail}]
   * @param {string} base 词条键前缀，序号即数组下标
   */
  function localize(list, base) {
    return (list || []).map(function (a, idx) {
      return {
        title: PHR.t(base + '.' + idx + '.title', a.title),
        detail: PHR.t(base + '.' + idx + '.detail', a.detail)
      };
    });
  }

  /**
   * 生成一份测评的应对策略。
   * @returns {{
   *   intensity:'none'|'mild'|'moderate'|'severe',
   *   immediate:Array, weekly:Array, professional:Array,
   *   dimensionTips:Array, note:string, noCutoff:boolean
   * }}
   */
  function forResult(scaleKey, result) {
    var scale = S.get(scaleKey);
    var level = intensityOf(scaleKey, result);
    var base = POOL[level] || POOL.none;
    var extra = SCALE_TIPS[scaleKey] || {};

    var out = {
      intensity: level,
      immediate: localize(base.immediate, 'assessment.coping.pool.' + level + '.immediate')
        .concat(localize(extra.immediate, 'assessment.coping.tip.' + scaleKey + '.immediate')),
      weekly: localize(base.weekly, 'assessment.coping.pool.' + level + '.weekly')
        .concat(localize(extra.weekly, 'assessment.coping.tip.' + scaleKey + '.weekly')),
      professional: localize(base.professional, 'assessment.coping.pool.' + level + '.professional'),
      dimensionTips: dimensionTips(scaleKey, result),
      noCutoff: !!(scale && scale.noCutoff),
      note: ''
    };

    /* 重度时把"联系专业人员"提到最前，并给一句明确的话 */
    if (level === 'severe') {
      out.note = PHR.t('assessment.coping.note.severe',
        '你这次的分数落在较高的区间。下面这些建议里，**最重要的一条是尽快找专业人员**，' +
        '其余的都可以等。请把这份报告带给医生或咨询师，它能帮对方更快了解你的情况。');
    } else if (level === 'moderate') {
      out.note = PHR.t('assessment.coping.note.moderate',
        '这些建议按"今天能做 / 这周能做 / 建议找专业人士"分成三层，不用一次全做，挑一条开始就好。');
    } else if (level === 'mild') {
      out.note = PHR.t('assessment.coping.note.mild',
        '你现在的状态还存在不少可调整的空间。下面几条门槛都很低，挑一两条试试。');
    } else {
      out.note = PHR.t('assessment.coping.note.none',
        '目前的状态不错。下面这些是**保持**的建议，也适用于状态好的时候。');
    }

    if (out.noCutoff) {
      out.note += PHR.t('assessment.coping.noteCutoffSuffix', '（注：{note}）', {
        note: scale.cutoffNote || PHR.t('assessment.coping.noCutoffFallback',
          '该量表没有临床切分点，分数仅供自我观察。')
      });
    }

    return out;
  }

  /**
   * 针对得分占比最高的维度给一条针对性提示。
   * 只取前两条，避免变成又一份清单。
   */
  function dimensionTips(scaleKey, result) {
    if (!result || !result.dimensions || !result.dimensions.length) { return []; }

    var DIM_TIPS = {
      'phq9.body':   '躯体症状（睡眠、食欲、精力）往往最先改善，先把作息和吃饭稳住。',
      'phq9.mood':   '情绪低落时，"先做事、感受随后到"比"等有心情再做"更有效。',
      'phq9.mind':   '反复自责时，试着把想法当成"一个念头"而不是"一个事实"。',
      'gad7.tension': '持续的紧张会让身体一直处在警戒状态，呼吸练习是最快的"降档"手段。',
      'gad7.relax':  '放松不下来常常是因为身体没收到"安全"的信号，可以试试渐进式肌肉放松。',
      'isi.onset':   '入睡困难最有效的做法是固定起床时间，而不是提前上床。',
      'isi.impact':  '睡眠问题对白天的影响，有一部分来自"担心睡不好"本身，先把这层焦虑降下来。',
      'pss10.helpless': '失控感最强时，先把注意力收回到"今天能控制的一件小事"上。',
      'pss10.mastery':  '这一项得分低说明你很少感到掌控 —— 可以从"减少一个承诺"开始。'
    };

    return result.dimensions
      .slice()
      .sort(function (a, b) { return b.percent - a.percent; })
      .slice(0, 2)
      .filter(function (d) { return d.percent >= 40; })
      .map(function (d) {
        var k = scaleKey + '.' + d.key;
        return {
          dimension: d.name,
          percent: d.percent,
          text: (DIM_TIPS[k] ? PHR.t('assessment.coping.dim.' + k, DIM_TIPS[k]) : '') ||
                PHR.t('assessment.coping.dimFallback',
                  '「{name}」这一组条目得分占比最高（{percent}%），可以重点关注。',
                  { name: d.name, percent: d.percent })
        };
      });
  }

  /** 与具体量表无关的通用心理保健建议（帮助中心与空状态复用） */
  function general() {
    return POOL.none;
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.assessment.coping = {
    forResult: forResult,
    dimensionTips: dimensionTips,
    intensityOf: intensityOf,
    general: general,
    POOL: POOL,
    SCALE_TIPS: SCALE_TIPS
  };

})(window.PHR);
