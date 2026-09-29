/**
 * ============================================================================
 * 文件：modules/assessment/crisis.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：危机识别与干预资源。
 *
 *      这是本模块**最重要也最需要克制**的一个文件：
 *      · 一旦作答中出现自伤/自杀念头，或总分落在高危区，
 *        必须在提交后**立即、不可跳过地**把求助渠道呈现在用户面前；
 *      · 但同时不能制造恐慌 —— 筛查阳性≠有危险，措辞要准确、不夸大、不贴标签。
 *
 *      识别规则全部来自 scales.js 的声明（题目上的 critical、量表上的
 *      crisisTotalAt / lowTotalAt），本文件不写死任何量表专属阈值。
 *
 * 依赖：modules/assessment/scales.js、core/utils.js
 * ============================================================================
 *
 * ⚠️ 关于求助电话：热线号码会随时间调整，界面上必须同时注明
 *    「以官方最新公布为准」，并**优先引导 120 / 110**（这两个号码最稳定）。
 *
 * ⚠️ 中英双语：中文是源码原文（也是兜底），英文词条在
 *    core/i18n/en-US.assessment.js；号码与机构名用 id 作词条键，便于核对。
 *    英文措辞遵守同一条底线 —— 不制造恐慌、不贴标签、只说清问卷的边界。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var S = PHR.assessment.scales;

  /* ================================================================== *
   * 一、求助资源
   * ------------------------------------------------------------------
   * ⚠️ 中英双语：这里保留中文原文，英文词条在 core/i18n/en-US.assessment.js。
   *    资源名与号码说明用 id 作为词条键（id 是内部键，不翻译）。
   * ================================================================== */
  var RESOURCES = [
    {
      id: 'emergency',
      tier: 'emergency',
      name: '紧急医疗 / 报警',
      numbers: [
        { label: '急救', number: '120' },
        { label: '报警', number: '110' }
      ],
      desc: '如果你已经采取了或即将采取伤害自己的行动，或无法保证自己的安全 —— 请立即拨打。' +
            '不要犹豫，这永远是第一选择。',
      tone: 'danger'
    },
    {
      id: 'hotline_national',
      tier: 'hotline',
      name: '全国统一心理援助热线',
      numbers: [{ label: '心理援助', number: '12356' }],
      desc: '提供 24 小时心理支持与危机干预，可匿名拨打，通话免费。',
      tone: 'warn'
    },
    {
      id: 'hotline_beijing',
      tier: 'hotline',
      name: '北京心理危机研究与干预中心',
      numbers: [{ label: '热线', number: '010-82951332' }],
      desc: '国内较早开展心理危机干预的专业机构，提供 24 小时热线服务。',
      tone: 'warn'
    },
    {
      id: 'hotline_hope',
      tier: 'hotline',
      name: '希望 24 热线',
      numbers: [{ label: '生命危机干预', number: '400-161-9995' }],
      desc: '面向全国的生命危机干预热线，24 小时接听。',
      tone: 'warn'
    }
  ];

  /** 免责与提醒（与资源一起展示，避免只甩号码显得冷冰冰） */
  var RESOURCE_NOTE_ZH =
    '以上号码以官方最新公布为准。如果一时打不通，请换一个号码，或直接前往最近医院的急诊科。' +
    '求助不是软弱 —— 它和感冒了去看医生没有任何区别。';

  /* 资源名 / 号码说明 / 提醒语都换成"跟随当前语言"的取值器（见 scales.js 的说明） */
  RESOURCES.forEach(function (r) {
    S.i18nField(r, 'name', 'assessment.crisis.res.' + r.id + '.name');
    S.i18nField(r, 'desc', 'assessment.crisis.res.' + r.id + '.desc');
    (r.numbers || []).forEach(function (n, idx) {
      S.i18nField(n, 'label', 'assessment.crisis.res.' + r.id + '.num.' + idx);
    });
  });

  /** 提醒语（当前语言） */
  function resourceNote() {
    return PHR.t('crisis.note', RESOURCE_NOTE_ZH);
  }

  /* ================================================================== *
   * 二、识别
   * ================================================================== */
  /**
   * 关键条目（自伤/自杀念头）那一题的**选项文案**。
   * 报告对象是提交那一刻的快照，语言切换后要按当前语言重新解析一遍，
   * 否则旧报告里的「你选择了…」会停在当时的语言。
   */
  function criticalLabel(scaleKey, c) {
    var opts = S.optionsOf(scaleKey, c.i);
    var hit = opts.filter(function (o) { return Number(o.value) === Number(c.value); })[0];
    return hit ? hit.label : c.label;
  }

  /**
   * 判断一份测评结果是否触发危机提示。
   *
   * 三级：
   *   none   无需特别提示
   *   watch  建议关注（出现念头但频率低 / 总分落在高危区 / 幸福感极低）
   *   urgent 强烈建议立即求助（念头频繁 / 总分严重偏高）
   *
   * @returns {{
   *   level:'none'|'watch'|'urgent',
   *   reasons:[{type, text}],
   *   headline:string, message:string,
   *   shouldBlock:boolean     // true 时应弹出不可跳过的模态框
   * }}
   */
  function detect(scaleKey, result) {
    var scale = S.get(scaleKey);
    var out = { level: 'none', reasons: [], headline: '', message: '', shouldBlock: false };
    if (!scale || !result) { return out; }

    /* ---- 1) 关键条目（自伤/自杀念头）—— 优先于一切其它规则 ---- */
    (result.critical || []).forEach(function (c) {
      var reason = PHR.t('assessment.crisis.reason.critical',
        '你在「{item}」这一题选择了「{label}」。',
        { item: U.truncate(c.text, 24), label: criticalLabel(scaleKey, c) });
      if (c.value >= 2) {
        out.level = 'urgent';
        out.reasons.push({ type: 'critical_item', text: reason });
      } else if (c.value === 1 && out.level !== 'urgent') {
        out.level = 'watch';
        out.reasons.push({ type: 'critical_item', text: reason });
      }
    });

    /* ---- 2) 关键维度分（用于快速筛查这类"没有自伤条目"的量表） ----
     * 这一条是必需的：状态最差的人往往从门槛最低的快速筛查进入，
     * 如果危机提示只挂在 PHQ-9 第 9 题上，他们会得到一句"建议关注"然后被送走。 */
    (scale.crisisDimension || []).forEach(function (rule) {
      var dim = (result.dimensions || []).filter(function (d) { return d.key === rule.dimension; })[0];
      if (!dim || dim.score < rule.at) { return; }
      if (rule.level === 'urgent') {
        out.level = 'urgent';
      } else if (out.level === 'none') {
        out.level = 'watch';
      }
      out.reasons.push({
        type: 'dimension',
        text: (rule.text || PHR.t('assessment.crisis.reason.dimName', '「{name}」', { name: dim.name })) +
          PHR.t('assessment.crisis.reason.dimSuffix', '（{score} 分，达到 {at} 分阈值）。',
            { score: dim.score, at: rule.at })
      });
    });

    /* ---- 3) 总分落在高危区 ----
     * ⚠️ 这里刻意只升级到 watch，不升级到 urgent。
     * 原因是临床口径：PHQ-9 总分 ≥20 的含义是「抑郁症状负担重」，
     * 属于**严重程度**判断，不等于「当下有危险」。把它当成急性危机来处理，
     * 会给用户一个吓人且不准确的结论；反过来，若只看总分，
     * 低总分但自伤条目高分的人又会被漏掉 —— 所以两条通路必须分开。
     * 总分高 → 强提示「尽快就医」；自伤条目 → 才是危机通路。 */
    if (scale.crisisTotalAt !== null && scale.crisisTotalAt !== undefined &&
        result.total >= scale.crisisTotalAt) {
      if (out.level === 'none') { out.level = 'watch'; }
      out.reasons.push({
        type: 'total_high',
        text: PHR.t('assessment.crisis.reason.totalHigh',
          '总分 {total} 分已达到该量表的高分区（≥ {at} 分）。',
          { total: result.total, at: scale.crisisTotalAt })
      });
    }

    /* ---- 4) 正向量表得分极低（例如 WHO-5 < 28 提示进一步评估抑郁） ---- */
    if (scale.lowTotalAt !== null && scale.lowTotalAt !== undefined &&
        result.total < scale.lowTotalAt && out.level === 'none') {
      out.level = 'watch';
      out.reasons.push({
        type: 'total_low',
        text: PHR.t('assessment.crisis.reason.totalLow',
          '总分 {total} 分低于该量表的关注线（< {at} 分）。',
          { total: result.total, at: scale.lowTotalAt })
      });
    }

    if (out.level === 'urgent') {
      out.shouldBlock = true;
      /* ⚠️ 措辞刻意克制：不写"你有危险"，只说明问卷的边界与"不必独自承担" */
      out.headline = PHR.t('crisis.headline', '请先看看这些信息');
      out.message = PHR.t('assessment.crisis.message.urgent',
        '你刚才的作答里，有一些内容我们很在意。' +
        '**这份问卷无法判断你是否有危险，但你现在不需要独自承担。**' +
        '下面这些渠道随时有人接听，和他们聊一聊会有帮助。');
    } else if (out.level === 'watch') {
      out.headline = PHR.t('crisis.watchHeadline', '有一件事想提醒你');
      out.message = PHR.t('assessment.crisis.message.watch',
        '你的作答里有值得认真对待的信号。这不代表情况严重，但**早点找人聊聊，总是比硬扛着好**。' +
        '如果之后感觉更糟，请随时使用下面的渠道。');
    }

    return out;
  }

  /* ================================================================== *
   * 三、渲染
   * ================================================================== */

  /**
   * 求助资源卡片（HTML）。
   * @param {object} opt { level, compact }
   */
  function resourcesHtml(opt) {
    opt = opt || {};
    var level = opt.level || 'watch';
    var tone = level === 'urgent' ? 'danger' : 'warn';
    var icon = level === 'urgent' ? '🆘' : '💬';

    var list = level === 'urgent' ? RESOURCES : RESOURCES.filter(function (r) { return r.tier !== 'emergency'; });

    return '<div class="notice tone-' + tone + '" style="align-items:flex-start">' +
      '<span class="ico">' + icon + '</span>' +
      '<div class="body">' +
        '<strong>' + (level === 'urgent'
          ? PHR.t('assessment.crisis.res.urgentTitle', '如果你现在很难受，请立即联系下面任意一个渠道')
          : PHR.t('assessment.crisis.res.watchTitle', '这些渠道随时可以打，不用等到"撑不住"')) + '</strong>' +
        '<div class="mt3" style="display:grid;gap:8px">' +
          list.map(function (r) {
            return '<div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">' +
              '<span class="badge tone-' + r.tone + '">' + PHR.ui.dom.esc(r.name) + '</span>' +
              r.numbers.map(function (n) {
                return '<span class="mono bold" style="font-size:1.05em;letter-spacing:.04em">' +
                  PHR.ui.dom.esc(n.number) + '</span>' +
                  '<span class="t-xs dim">' + PHR.ui.dom.esc(n.label) + '</span>';
              }).join('') +
              '<div class="t-xs dim" style="flex-basis:100%">' + PHR.ui.dom.esc(r.desc) + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="t-xs dim mt3">' + PHR.ui.dom.esc(resourceNote()) + '</div>' +
      '</div>' +
    '</div>';
  }

  /**
   * 报告页顶部常驻横幅：只要这份报告触发了 watch/urgent 就一直显示。
   */
  function bannerHtml(scaleKey, result) {
    var c = detect(scaleKey, result);
    if (c.level === 'none') { return ''; }

    var urgent = c.level === 'urgent';
    return '<div class="notice tone-' + (urgent ? 'danger' : 'warn') + '" style="align-items:flex-start">' +
      '<span class="ico">' + (urgent ? '🆘' : '⚠️') + '</span>' +
      '<div class="body">' +
        '<strong>' + PHR.ui.dom.esc(c.headline) + '</strong>' +
        '<div class="t-sm mt1">' + c.reasons.map(function (r) { return PHR.ui.dom.esc(r.text); }).join(' ') + '</div>' +
        '<div class="t-sm mt1 dim">' +
          (urgent
            ? PHR.t('assessment.crisis.banner.urgent',
                '这一份问卷无法判断你是否有危险，但你现在不需要独自承担。')
            : PHR.t('assessment.crisis.banner.watch',
                '这不代表情况严重，但早点找人聊聊总是比硬扛着好。')) +
        '</div>' +
        '<div class="mt2"><button class="btn btn-sm btn-' + (urgent ? 'danger' : 'soft') +
          '" data-action="show-help">' +
          PHR.t('crisis.showHelp', '📞 查看求助渠道') + '</button></div>' +
      '</div>' +
    '</div>';
  }

  /**
   * 提交后的模态框内容（不可跳过：没有"关闭"以外的操作，但关闭按钮文字刻意平淡，
   * 避免制造压迫感 —— 目标是给到帮助，不是吓唬用户）。
   */
  function modalBodyHtml(scaleKey, result) {
    var c = detect(scaleKey, result);
    return '<div class="t-sm mb4">' + PHR.ui.dom.esc(c.message).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</div>' +
      resourcesHtml({ level: c.level }) +
      '<div class="notice tone-info mt4" style="align-items:flex-start">' +
        '<span class="ico">📄</span>' +
        '<div class="body t-sm">' +
          PHR.t('assessment.crisis.modal.saved',
            '你的测评报告已经保存好了，随时可以在「心理测评 → 我的测评记录」里重新查看。' +
            '报告里也附了同样的求助渠道。') +
        '</div>' +
      '</div>';
  }

  /* ================================================================== *
   * 四、审计
   * ================================================================== */
  /**
   * 把危机识别结果写入审计日志。
   * 目的：万一用户事后需要回溯"系统当时有没有提示我"，有据可查。
   * 去重：同一份测评只写一次。
   */
  function logDetection(scaleKey, result, crisis) {
    if (!crisis || crisis.level === 'none') { return; }
    if (!PHR.audit || !PHR.audit.log) { return; }
    PHR.audit.log({
      action: 'insight.alert',
      targetType: 'assessment',
      targetId: '',
      targetName: PHR.t('assessment.crisis.audit.target', '{name}（{total} 分）',
        { name: S.nameOf(scaleKey), total: result.total }),
      detail: PHR.t('assessment.crisis.audit.detail',
        '心理测评触发{level}级提示，已向用户展示心理援助渠道。触发原因：{reasons}', {
          level: crisis.level === 'urgent'
            ? PHR.t('assessment.crisis.audit.urgent', '紧急')
            : PHR.t('assessment.crisis.audit.watch', '关注'),
          reasons: crisis.reasons.map(function (r) { return r.text; }).join(' ')
        }),
      result: 'success'
    });
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.assessment.crisis = {
    detect: detect,
    resourcesHtml: resourcesHtml,
    bannerHtml: bannerHtml,
    modalBodyHtml: modalBodyHtml,
    logDetection: logDetection,
    resources: function () { return U.clone(RESOURCES); },

    /** 提醒语（当前语言）—— 报告导出为纯文本时也要用 */
    get note() { return resourceNote(); }
  };

})(window.PHR);
