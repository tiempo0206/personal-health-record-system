/**
 * ============================================================================
 * 文件：modules/assessment/report.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：把「一次作答」组装成完整的报告对象，并提供三种输出形态：
 *        build()  → 报告对象（入库、传给视图、导出都用它）
 *        html()   → 页面渲染
 *        text()   → 纯文本（打印、复制、随备份导出）
 *
 *      报告对象**自带 disclaimer 字段**，所有渲染出口都从这一个字段取，
 *      避免"三个视图各写一段免责声明、措辞还不一样"。
 *
 *  ⚠️ 中英双语：报告是**入库那一刻的快照**，直接渲染旧报告会出现中英混排。
 *     因此 html() / text() 入口都会先过一遍 localized()：把量表名、分级文案、
 *     选项标签、应对策略、危机提示按**当前语言**重新解析一遍。
 *     分数与作答是事实（不动），措辞是展示（重取）。
 *
 * 依赖：modules/assessment/{scales,scoring,coping,crisis}.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var S = PHR.assessment.scales;
  var SC = PHR.assessment.scoring;
  var CP = PHR.assessment.coping;
  var CR = PHR.assessment.crisis;

  /* ================================================================== *
   * 一、构建
   * ================================================================== */
  /**
   * 组装一份完整报告。**不落库**，落库由 assessment.service 负责。
   * @param {string} scaleKey
   * @param {object} answers
   * @param {object} opt { userId, id, at }
   */
  function build(scaleKey, answers, opt) {
    opt = opt || {};
    var scale = S.get(scaleKey);
    if (!scale) { return null; }

    var result = SC.score(scaleKey, answers);
    if (!result) { return null; }

    var coping = CP.forResult(scaleKey, result);
    var crisis = CR.detect(scaleKey, result);

    return {
      id: opt.id || null,
      userId: opt.userId || '',
      scaleKey: scaleKey,
      scaleName: scale.name,
      shortName: scale.shortName,
      icon: scale.icon,
      color: scale.color,
      topic: scale.topic,
      source: scale.source,
      noCutoff: !!scale.noCutoff,
      cutoffNote: scale.cutoffNote || '',

      total: result.total,
      max: result.max,
      percent: result.percent,
      raw: result.raw,
      transformed: result.transformed,

      level: result.level,
      dimensions: result.dimensions,
      items: result.items,
      critical: result.critical,

      recommends: SC.recommend(scaleKey, result),
      coping: coping,
      crisis: { level: crisis.level, reasons: crisis.reasons, headline: crisis.headline },

      /* 免责声明：唯一来源是 scales.js 的常量，所有出口都读这个字段 */
      disclaimer: S.DISCLAIMER,
      disclaimerShort: S.DISCLAIMER_SHORT,

      at: opt.at || Date.now()
    };
  }

  /* ================================================================== *
   * 二、摘要
   * ================================================================== */
  /**
   * 取分级在当前语言下的文案。
   * 报告是**提交那一刻的快照**，语言切换后旧报告里的分级名/说明仍是旧语言，
   * 因此展示时按 level.key 回到 scales.js 重新取一次。
   */
  function levelOf(report) {
    var sc = S.get(report && report.scaleKey);
    var key = report && report.level && report.level.key;
    var hit = (sc && key)
      ? (sc.levels || []).filter(function (l) { return l.key === key; })[0]
      : null;
    return hit || (report && report.level) || { key: 'unknown', name: '—', tone: 'muted', summary: '' };
  }

  /**
   * 把一条报告记录**按当前语言**重新解析一遍，返回可直接渲染的对象。
   *
   * 为什么需要它：报告对象是入库时的快照，里面存的是量表名、分级文案、
   * 选项标签、应对策略……如果直接渲染，用户把界面切成英文后打开一份旧报告，
   * 会看到中英混排。而这些东西全都能从 scales/scoring/coping 重新推出来 ——
   * 分数与作答是"事实"（不动），措辞是"展示"（重取）。
   */
  function localized(row) {
    if (!row || !row.scaleKey || !S.get(row.scaleKey)) { return row; }
    var sc = S.get(row.scaleKey);
    var lv = levelOf(row);
    var out = Object.assign({}, row);

    out.scaleName = S.nameOf(row.scaleKey);
    out.level = { key: lv.key, name: lv.name, tone: lv.tone, summary: lv.summary };
    out.cutoffNote = sc.cutoffNote || row.cutoffNote || '';
    out.disclaimer = S.DISCLAIMER;

    out.dimensions = (row.dimensions || []).map(function (d) {
      var def = (sc.dimensions || []).filter(function (x) { return x.key === d.key; })[0];
      if (!def) { return d; }
      var copy = Object.assign({}, d);
      copy.name = def.name;
      return copy;
    });

    out.items = (row.items || []).map(function (it) {
      var hit = S.optionsOf(row.scaleKey, it.i).filter(function (o) {
        return Number(o.value) === Number(it.value);
      })[0];
      if (!hit) { return it; }
      var copy = Object.assign({}, it);
      copy.label = hit.label;      /* "你选了哪一项"跟着语言走 */
      return copy;
    });

    /* 应对策略与后续推荐都是从分数**推出来**的，不是历史事实，
       因此按当前语言重算一遍（点数极少，性能可以忽略） */
    out.coping = CP.forResult(row.scaleKey, out);
    out.recommends = SC.recommend(row.scaleKey, out);

    /* 危机提示同理：等级与分数有关（是事实），但措辞要跟着语言走 */
    var cr = CR.detect(row.scaleKey, out);
    out.crisis = { level: cr.level, reasons: cr.reasons, headline: cr.headline };

    return out;
  }

  /** 一句话概括（列表、首页、审计日志都用它） */
  function summaryLine(report) {
    if (!report) { return ''; }
    var lv = levelOf(report);
    var prefix = report.noCutoff ? ''
      : (lv.tone === 'ok'
          ? PHR.t('assessment.report.good', '状态良好')
          : PHR.t('assessment.report.attention', '需要留意'));
    return S.nameOf(report.scaleKey) +
      PHR.t('assessment.report.summaryLine', '：{total} / {max} 分　',
        { total: report.total, max: report.max }) +
      (prefix ? prefix + PHR.t('assessment.report.comma', '，') : '') + lv.name;
  }

  /** 分级名称（当前语言）；给"要给旧报告写一行摘要"的地方用 */
  function levelNameOf(report) {
    return (levelOf(report) || {}).name || '—';
  }

  /** 分级徽章 HTML（noCutoff 量表刻意不上严重程度配色） */
  function levelBadge(report) {
    if (!report) { return ''; }
    var lv = levelOf(report);
    if (report.noCutoff) {
      return PHR.ui.badge(lv.name, 'muted');
    }
    return PHR.ui.badge(lv.name, lv.tone);
  }

  /* ================================================================== *
   * 三、HTML 渲染
   * ================================================================== */
  /**
   * 完整的报告正文（不含页面骨架与按钮）。
   * @param {object} opt { showItems:true, compact:false }
   */
  function html(report, opt) {
    opt = opt || {};
    if (!report) { return PHR.ui.empty({ icon: '📄', title: PHR.t('assessment.report.notFound', '报告不存在') }); }

    report = localized(report);
    return crisisBanner(report) +
      scoreBlock(report) +
      breakdownBlock(report) +
      copingBlock(report, opt) +
      recommendBlock(report) +
      itemsBlock(report, opt) +
      disclaimerBlock(report);
  }

  /** 危机横幅：只在触发时出现 */
  function crisisBanner(report) {
    return CR.bannerHtml(report.scaleKey, report);
  }

  /* ---------------------------- 分数区 ---------------------------- */
  function scoreBlock(report) {
    return '<div class="grid g2 mb4" style="gap:var(--sp-4)">' +
      '<div class="card"><div class="card-body">' +
        '<div class="row gap4" style="align-items:center">' +
          '<div id="report-gauge"></div>' +
          '<div class="grow" style="min-width:120px">' +
            '<div class="t-sm dim">' + dom.esc(report.scaleName) + '</div>' +
            '<div class="t-2xl bold">' + report.total +
              '<span class="unit t-sm dim">' +
                dom.esc(PHR.t('assessment.report.ofMax', ' / {max} 分', { max: report.max })) +
              '</span></div>' +
            '<div class="mt2">' + levelBadge(report) +
              (report.transformed
                ? '<span class="badge tone-muted ml2">' +
                  dom.esc(PHR.t('assessment.report.raw', '原始分 {raw}', { raw: report.raw })) + '</span>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="divider"></div>' +
        '<div class="t-sm">' + dom.esc(report.level.summary) + '</div>' +
        (report.noCutoff
          ? '<div class="t-xs dim mt2">⚠️ ' + dom.esc(report.cutoffNote) + '</div>'
          : '') +
      '</div></div>' +

      '<div class="card"><div class="card-body">' +
        '<div class="callout-title">' +
          PHR.t('assessment.report.howToRead', '📌 关于这份结果怎么读') + '</div>' +
        '<ul class="t-sm" style="margin:0;padding-left:1.2em">' +
          '<li>' + PHR.t('assessment.report.read1',
            '分数反映的是<strong>你这次作答时</strong>的状态，情绪本身是会波动的。') + '</li>' +
          '<li>' + PHR.t('assessment.report.read2',
            '筛查量表测的是「症状出现的频率」，<strong>不等于诊断</strong>。') + '</li>' +
          '<li>' + PHR.t('assessment.report.read3',
            '单项得分高，不代表你"是什么样的人"，只代表最近这段时间某些感受比较多。') + '</li>' +
          (report.noCutoff
            ? '<li>' + PHR.t('assessment.report.readNoCutoff',
                '这份量表<strong>没有公认的临床切分点</strong>，上面的档位只是便于阅读，请勿当作严重程度。') + '</li>'
            : '<li>' + PHR.t('assessment.report.readSource',
                '档位来自该量表公开发表的切分标准（{source}）。',
                { source: report.source }) + '</li>') +
        '</ul>' +
      '</div></div>' +
    '</div>';
  }

  /* ---------------------------- 维度分解 ---------------------------- */
  function breakdownBlock(report) {
    if (!report.dimensions || report.dimensions.length < 2) { return ''; }

    return '<div class="card mb4"><div class="card-head">' +
      '<h3 class="t-lg">' + PHR.t('assessment.report.breakdown', '得分分布') + '</h3>' +
      '<div class="sub">' + PHR.t('assessment.report.breakdownHint', '看哪一组条目贡献最多') + '</div>' +
    '</div><div class="card-body">' +
      report.dimensions.map(function (d) {
        var color = report.noCutoff ? 'var(--primary)'
          : (d.level === 'high' ? 'var(--danger)' : d.level === 'medium' ? 'var(--warn)' : 'var(--ok)');
        return '<div class="bar-row">' +
          '<span class="ellipsis" title="' + dom.esc(d.name) + '">' + dom.esc(d.name) + '</span>' +
          '<span class="track"><i style="width:' + Math.max(2, d.percent) + '%;background:' + color + '"></i></span>' +
          '<span class="val">' + d.score + ' / ' + d.max + '</span>' +
        '</div>';
      }).join('') +
      (report.coping.dimensionTips.length
        ? '<div class="divider"></div>' + report.coping.dimensionTips.map(function (t) {
            return '<div class="row gap2 mb2"><span>💡</span><div class="t-sm">' + dom.esc(t.text) + '</div></div>';
          }).join('')
        : '') +
    '</div></div>';
  }

  /* ---------------------------- 应对策略 ---------------------------- */
  function copingBlock(report, opt) {
    var c = report.coping;
    var severe = c.intensity === 'severe';

    return '<div class="card mb4"><div class="card-head">' +
      '<h3 class="t-lg">' + PHR.t('assessment.report.coping', '🧭 应对策略') + '</h3>' +
      '<div class="sub">' + PHR.t('assessment.report.copingHint', '按可执行的紧迫程度分三层') + '</div>' +
    '</div><div class="card-body">' +
      (c.note ? PHR.ui.notice(severe ? 'warn' : 'info', '', c.note, { icon: '💬', raw: true }) : '') +

      /* 重度时把"找专业人士"排在最前 */
      (severe ? groupBlock(PHR.t('assessment.coping.urgent', '🏥 建议尽快'), c.professional, 'danger') : '') +
      groupBlock(PHR.t('assessment.coping.now', '☀️ 今天就能做'), c.immediate, 'primary') +
      groupBlock(PHR.t('assessment.coping.week', '📅 这一周安排'), c.weekly, 'info') +
      (!severe ? groupBlock(PHR.t('assessment.coping.pro', '🏥 建议找专业人士'), c.professional, 'warn') : '') +
    '</div></div>';
  }

  function groupBlock(title, items, tone) {
    if (!items || !items.length) { return ''; }
    return '<div class="callout-title mt4">' + title + '</div>' +
      '<div style="display:grid;gap:var(--sp-3)">' +
        items.map(function (a) {
          return '<div class="notice tone-' + tone + '" style="margin:0;align-items:flex-start">' +
            '<span class="ico">•</span>' +
            '<div class="body"><div class="semibold t-sm">' +
              dom.esc(a.title).replace(/\*\*(.+?)\*\*/g, '$1') + '</div>' +
              '<div class="t-xs dim">' + dom.esc(a.detail) + '</div></div>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  /* ---------------------------- 后续推荐 ---------------------------- */
  function recommendBlock(report) {
    if (!report.recommends || !report.recommends.length) { return ''; }
    return '<div class="card mb4"><div class="card-head">' +
      '<h3 class="t-lg">' + PHR.t('assessment.report.nextTitle', '🔎 建议接着做') + '</h3>' +
      '<div class="sub">' + PHR.t('assessment.report.nextHint',
        '这份快速筛查只用了核心条目，完整量表能给出更清楚的结果') + '</div>' +
    '</div><div class="card-body"><div class="type-picker">' +
      report.recommends.map(function (r) {
        return '<button class="type-tile" data-action="take" data-scale="' + dom.esc(r.scaleKey) + '">' +
          '<span class="ico">' + r.icon + '</span>' +
          '<span class="n">' + dom.esc(r.name) + '</span>' +
          '<span class="d">' + dom.esc(r.reason) +
            dom.esc('　' + PHR.t('assessment.report.aboutMinutes', '约 {n} 分钟', { n: r.estMinutes })) +
          '</span>' +
        '</button>';
      }).join('') +
    '</div></div></div>';
  }

  /* ---------------------------- 逐题明细 ---------------------------- */
  function itemsBlock(report, opt) {
    if (opt.showItems === false) { return ''; }
    return '<div class="card mb4"><div class="card-head">' +
      '<h3 class="t-lg">' + PHR.t('assessment.report.items', '逐题明细') + '</h3>' +
      '<div class="sub">' + PHR.t('assessment.report.itemsCount', '共 {n} 题', { n: report.items.length }) + '</div>' +
    '</div><div class="card-body flush">' +
      '<div class="table-wrap" style="border:0"><table class="tbl">' +
        '<thead><tr><th style="width:44px">#</th>' +
        '<th>' + PHR.t('assessment.report.colItem', '题目') + '</th>' +
        '<th style="width:130px">' + PHR.t('assessment.report.colChoice', '你的选择') + '</th>' +
        '<th style="width:70px" class="num">' + PHR.t('assessment.report.colScore', '得分') + '</th>' +
        '</tr></thead><tbody>' +
        report.items.map(function (it) {
          var marked = report.critical.some(function (c) { return c.i === it.i; });
          return '<tr' + (marked ? ' style="background:var(--warn-soft)"' : '') + '>' +
            '<td>' + it.i + '</td>' +
            '<td>' + dom.esc(it.text) +
              (it.reverse
                ? ' <span class="badge tone-muted">' + PHR.t('assessment.report.reverse', '反向计分') + '</span>'
                : '') +
              (marked
                ? ' <span class="badge tone-warn">' + PHR.t('assessment.report.criticalItem', '关键条目') + '</span>'
                : '') + '</td>' +
            '<td>' + dom.esc(it.label) + '</td>' +
            '<td class="num">' + it.score + ' / ' + it.max + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div>' +
    '</div></div>';
  }

  /* ---------------------------- 免责声明 ---------------------------- */
  function disclaimerBlock(report) {
    return '<div class="notice" style="background:var(--surface-2);align-items:flex-start">' +
      '<span class="ico">ℹ️</span>' +
      '<div class="body t-sm">' +
        '<strong>' + PHR.t('assessment.report.disclaimer', '免责声明') + '</strong><br>' +
        dom.esc(report.disclaimer).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') +
        '<div class="t-xs dim mt2">' +
          PHR.t('assessment.report.sourceLine', '量表来源：{source}', { source: dom.esc(report.source) }) +
          PHR.t('assessment.report.timeLine', '　·　测评时间：{at}', { at: U.fmtFull(report.at) }) +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================================================================== *
   * 四、纯文本（打印 / 复制 / 导出）
   * ================================================================== */
  function text(report) {
    if (!report) { return ''; }
    report = localized(report);
    var L = [];
    var line = function (s) { L.push(s); };
    var rule = function () { L.push('─'.repeat(52)); };

    rule();
    line(PHR.t('assessment.txt.title', '心理测评报告 · {name}', { name: report.scaleName }));
    line(PHR.t('assessment.txt.at', '测评时间：{at}', { at: U.fmtFull(report.at) }));
    rule();
    line('');
    line(PHR.t('assessment.txt.total', '总分：{total} / {max}（{level}）',
      { total: report.total, max: report.max, level: report.level.name }));
    if (report.transformed) {
      line(PHR.t('assessment.txt.raw', '原始分：{raw}（已按 ×4 换算为百分制）', { raw: report.raw }));
    }
    line(report.level.summary);
    if (report.noCutoff) {
      line(PHR.t('assessment.txt.note', '注：{note}', { note: report.cutoffNote }));
    }
    line('');

    if (report.dimensions && report.dimensions.length > 1) {
      line(PHR.t('assessment.txt.breakdown', '【得分分布】'));
      report.dimensions.forEach(function (d) {
        line(PHR.t('assessment.txt.dimLine', '  {name}：{score} / {max}（{percent}%）',
          { name: d.name, score: d.score, max: d.max, percent: d.percent }));
      });
      line('');
    }

    if (report.crisis && report.crisis.level !== 'none') {
      line(PHR.t('assessment.txt.crisis', '【重要提示】'));
      report.crisis.reasons.forEach(function (r) { line('  · ' + r.text); });
      line(PHR.t('assessment.txt.channels', '  求助渠道：'));
      CR.resources().forEach(function (r) {
        if (report.crisis.level !== 'urgent' && r.tier === 'emergency') { return; }
        line(PHR.t('assessment.txt.channelLine', '    {name}：{numbers}',
          { name: r.name, numbers: r.numbers.map(function (n) { return n.number; }).join(' / ') }));
      });
      line('    ' + CR.note);
      line('');
    }

    var c = report.coping;
    var groups = [
      [PHR.t('assessment.txt.groupPro', '建议尽快'), c.professional],
      [PHR.t('assessment.txt.groupNow', '今天就能做'), c.immediate],
      [PHR.t('assessment.txt.groupWeek', '这一周安排'), c.weekly]
    ];
    line(PHR.t('assessment.txt.coping', '【应对策略】'));
    groups.forEach(function (g) {
      if (!g[1] || !g[1].length) { return; }
      line('  ▸ ' + g[0]);
      g[1].forEach(function (a) {
        line(PHR.t('assessment.txt.adviceLine', '    · {title}：{detail}',
          { title: a.title.replace(/\*\*/g, ''), detail: a.detail }));
      });
      line('');
    });

    rule();
    line(PHR.t('assessment.txt.footer1', '本测评为自评筛查工具，不是诊断工具。'));
    line(PHR.t('assessment.txt.footer2', '筛查分数偏高不等于患病，分数正常也不能排除问题。'));
    line(PHR.t('assessment.txt.footer3', '任何结论都应由具备资质的专业人员结合面谈与病史做出。'));
    line(PHR.t('assessment.txt.source', '量表来源：{source}', { source: report.source }));
    rule();

    return L.join('\n');
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.assessment.report = {
    build: build,
    html: html,
    text: text,
    summaryLine: summaryLine,
    levelBadge: levelBadge,
    levelNameOf: levelNameOf
  };

})(window.PHR);
