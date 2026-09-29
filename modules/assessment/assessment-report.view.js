/**
 * ============================================================================
 * 文件：modules/assessment/assessment-report.view.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：注册「测评报告」页（路由 #/assessment-report/<记录id>）—— 取一条测评
 *      记录，把报告正文交给 report.js 渲染，并补齐三件视图层才能做的事：
 *      画得分仪表、绑定求助渠道 / 再做一次等动作、写审计日志、导出与打印。
 *
 *      报告正文（危机横幅 / 分数区 / 得分分布 / 应对策略 / 后续推荐 / 逐题明细 /
 *      免责声明）全部由 PHR.assessment.report.html() 生成，本文件不重复拼任何
 *      一句结论性文案 —— 否则三个出口（页面 / 文本 / 打印）迟早会不一致。
 *
 * 依赖：modules/assessment/{report,crisis,assessment.service}.js
 *      ui/components/{dom,empty,chart,modal,toast}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;

  /* ================================================================== *
   * 一、视图注册
   * ================================================================== */
  PHR.registerView('assessment-report', {
    title: PHR.t('view.assessment-report.title', '测评报告'), icon: '📄', group: 'main', order: 92, module: 'assessment',
    nav: false,
    render: render,
    mount: mount
  });

  /* ================================================================== *
   * 二、渲染
   * ================================================================== */
  function render(root, params) {
    var row = fetchRow(params);

    if (!row) {
      root.innerHTML = '<div id="report-root">' +
        PHR.ui.empty({
          icon: '📄', title: PHR.t('assessment.report.notFound', '这份报告不存在'),
          hint: PHR.t('assessment.report.notFoundHint',
            '它可能已经被删除，或者这个地址不属于当前登录的账号。'),
          action: { label: PHR.t('assessment.backToCatalog', '返回心理测评'), action: 'back' }
        }) + '</div>';
      return;
    }

    root.innerHTML = '<div id="report-root">' +
      head(row) +
      '<div id="report-body">' + PHR.assessment.report.html(row) + '</div>' +
      foot(row) +
    '</div>';
  }

  function mount(root, params) {
    var page = U.$('#report-root', root);
    if (!page) { return; }
    var row = fetchRow(params);

    dom.actions(page, {
      back: function () { PHR.router.go('/assessment'); },
      retake: function () { if (row) { PHR.router.go('/assessment-take/' + row.scaleKey); } },
      del: function () { if (row) { removeRecord(row); } },

      /* 危机横幅里的「📞 查看求助渠道」按钮 */
      'show-help': function () {
        var level = (row && row.crisis && row.crisis.level) || 'watch';
        PHR.ui.modal({
          title: PHR.t('crisis.helpTitle', '求助渠道'),
          size: 'normal',
          body: PHR.assessment.crisis.resourcesHtml({ level: level }),
          actions: [{ label: PHR.t('ui.close', '关闭'), tone: 'ghost' }]
        });
      },

      /* 报告里「建议接着做」的卡片（快速筛查做完后推荐完整量表） */
      take: function (e, el) { PHR.router.go('/assessment-take/' + el.getAttribute('data-scale')); },

      'export-text': function () { if (row) { exportText(row); } },
      'print': function () { window.print(); }
    });

    if (!row) { return; }

    drawGauge(page, row);
    audit(row);
  }

  /* ================================================================== *
   * 三、头部与底部
   * ================================================================== */
  function head(row) {
    /* 量表名与来源都从 scales.js 现取（报告是入库时的快照，语言切换后要跟着变） */
    var sc = (PHR.assessment.scales && row.scaleKey) ? PHR.assessment.scales.get(row.scaleKey) : null;
    var scaleName = sc ? sc.name : row.scaleName;
    var source = sc ? sc.source : row.source;
    return '<div class="page-head">' +
      '<div class="titles">' +
        '<h2>' + (row.icon || '📄') + ' ' + dom.esc(scaleName) + '</h2>' +
        '<div class="desc">' + PHR.t('assessment.report.headMeta',
          '测评时间：{at}　·　{source}　·　共 {n} 题', {
            at: U.fmtFull(row.at),
            source: dom.esc(source),
            n: row.items ? row.items.length : 0
          }) + '</div>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" data-action="back">← ' +
          PHR.t('assessment.backToCatalog', '返回心理测评') + '</button>' +
        '<button class="btn" data-action="retake">🔁 ' +
          PHR.t('assessment.retake', '再测一次') + '</button>' +
        '<button class="btn btn-ghost" data-action="del">' +
          PHR.t('ui.delete', '删除') + '</button>' +
      '</div>' +
    '</div>';
  }

  /**
   * 底部出口。
   *
   * ⚠️ 这里**刻意只提供「导出为文本」和「打印」**，不提供分享到社群、
   *    生成链接、一键复制到剪贴板这类"一键外发"的出口。
   *    心理测评数据是本系统里敏感度最高的一类信息，分享按钮会让人在
   *    情绪波动时做出事后后悔的操作；而导出成文件、或打印成纸张，
   *    都需要用户自己选择保存位置 / 走到打印机前，这个"多一步"正是
   *    让人有机会想一想的缓冲。这是隐私设计，不是功能缺失。
   */
  function foot(row) {
    return '<div class="card mb4"><div class="card-body tight">' +
      '<div class="row wrap gap3">' +
        '<button class="btn" data-action="export-text">' +
          PHR.t('assessment.report.exportTxt', '↓ 导出为文本') + '</button>' +
        '<button class="btn" data-action="print">' + PHR.t('ui.print', '🖨️ 打印') + '</button>' +
        '<span class="t-xs dim grow">' + PHR.t('assessment.report.exportHint',
          '导出的文件保存在你自己的电脑上，系统不会上传任何内容。' +
          '报告里的结论是筛查提示，不是诊断。') + '</span>' +
      '</div>' +
    '</div></div>';
  }

  /* ================================================================== *
   * 四、得分仪表
   * ================================================================== */
  /**
   * 报告正文里的 `#report-gauge` 是留白的占位容器，由视图层在这里补上仪表。
   * 颜色规则：
   *   · noCutoff 量表（PSS-10 / CD-RISC-10）一律用主题色 —— 它们没有临床切分点，
   *     给分数上"红/黄"配色等于凭空造出一个严重程度判断。
   *   · 其余量表按 level.tone 映射到既有的语义色变量。
   */
  function drawGauge(page, row) {
    var host = U.$('#report-gauge', page);
    if (!host) { return; }
    PHR.ui.chart.gauge(host, {
      percent: row.percent,
      value: row.total,
      label: '/ ' + row.max + U.t('assessment.report.scoreUnit', ' 分'),
      color: gaugeColor(row),
      size: 132,
      thickness: 12
    });
  }

  function gaugeColor(row) {
    if (row.noCutoff) { return 'var(--primary)'; }
    var tone = row.level && row.level.tone;
    if (tone === 'ok') { return 'var(--ok)'; }
    if (tone === 'warn') { return 'var(--warn)'; }
    if (tone === 'danger') { return 'var(--danger)'; }
    return 'var(--primary)';     /* info 等中性档：不上严重程度配色 */
  }

  /* ================================================================== *
   * 五、动作
   * ================================================================== */
  function removeRecord(row) {
    var sc = (PHR.assessment.scales && row.scaleKey) ? PHR.assessment.scales.get(row.scaleKey) : null;
    PHR.ui.confirm({
      title: PHR.t('assessment.report.deleteConfirm', '删除这份测评报告'),
      message: PHR.t('assessment.confirmDelete', '确定要删除「{name}」（{date}）吗？',
        { name: sc ? sc.name : row.scaleName, date: U.fmtDate(row.at) }),
      detail: PHR.t('assessment.report.deleteDetail',
        '删除后无法恢复。这份报告只在本地保存，删除后不会留下副本。'),
      confirmLabel: PHR.t('ui.delete', '删除')
    }).then(function (ok) {
      if (!ok) { return; }
      var res = PHR.assessment.remove(row.id);
      if (res && res.ok) {
        PHR.ui.toast.ok(PHR.t('assessment.deleted', '已删除'));
        PHR.router.go('/assessment');
      } else {
        PHR.ui.toast.warn((res && res.message) || PHR.t('assessment.deleteFailed', '删除失败'));
      }
    });
  }

  /** 导出为纯文本：文件名形如 心理测评报告_PHQ9_20260914.txt */
  function exportText(row) {
    var day = U.fmtDate(row.at).replace(/-/g, '');
    var name = PHR.t('assessment.txt.filePrefix', '心理测评报告_') +
      String(row.scaleKey || 'scale').toUpperCase() + '_' + day + '.txt';
    var ok = PHR.ui.dom.download(name, PHR.assessment.report.text(row), 'text/plain;charset=utf-8');
    if (ok) { PHR.ui.toast.ok(PHR.t('assessment.exported', '已导出：{name}', { name: name })); }
    else { PHR.ui.toast.warn(PHR.t('assessment.exportFailed', '导出失败，请检查浏览器是否拦截了下载')); }
  }

  /* ================================================================== *
   * 六、审计
   * ================================================================== */
  /**
   * 「谁在什么时候看过这份心理报告」必须可回溯。
   * 注意 shell.js 已经为每次页面访问写过一条通用的 record.view，
   * 这里额外写一条 assessment.view，是为了让审计日志按"心理测评"这个
   * 动作分组时也能看到，而不必去猜 record.view 的目标是不是心理数据。
   */
  function audit(row) {
    if (!PHR.audit || !PHR.audit.log) { return; }
    var S = PHR.assessment.scales;
    PHR.audit.log({
      action: 'assessment.view',
      targetType: 'assessment',
      targetId: row.id,
      targetName: S ? S.nameOf(row.scaleKey) : row.scaleName,
      detail: PHR.t('assessment.report.auditView',
        '查看了心理测评报告（{total} / {max} 分，{level}）', {
          total: row.total,
          max: row.max,
          level: PHR.assessment.report.levelNameOf(row)
        }),
      result: 'success'
    });
  }

  /* ================================================================== *
   * 七、数据
   * ================================================================== */
  /** 按记录 id 取测评（服务层会校验归属：不属于当前账号时返回 null） */
  function fetchRow(params) {
    var id = (params && params.p1) || '';
    if (!id || !PHR.assessment || !PHR.assessment.byId) { return null; }
    return PHR.assessment.byId(id);
  }

})(window.PHR);
