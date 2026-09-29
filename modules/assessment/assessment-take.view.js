/**
 * ============================================================================
 * 文件：modules/assessment/assessment-take.view.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：注册「填写测评」页（路由 #/assessment-take/<量表key>）—— 知情同意 →
 *      逐题作答 → 提交三步。全程只做交互与草稿管理，计分、分级、危机识别
 *      都在提交时由 assessment.service 统一完成。
 *
 *      两个刻意的设计取舍：
 *      ① **知情同意是页面内容，不是模态框。** 模态框天然带着"快点关掉"的暗示，
 *         而"这是筛查不是诊断""结果只有你自己看得到"这几句话需要被真正读到。
 *      ② **一次列出全部题目，不做分页。** 最长的量表只有 10 题，分页只会让
 *         "还剩几题"变得不可见，反而不如一条进度条 + 一屏题目来得踏实。
 *
 * 依赖：modules/assessment/{scales,scoring,crisis,assessment.service}.js
 *      ui/components/{dom,empty,toast,modal}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var dom = PHR.ui.dom;
  var S = PHR.assessment.scales;

  /**
   * 模块级作答状态。
   * 之所以不放在 DOM 上：题目重绘（点选项后刷新这一题的选中态）时，
   * 数据必须比 DOM 活得久，否则每刷新一次就会丢掉已选答案。
   */
  var draft = { scaleKey: '', answers: {} };

  /** 已确认知情同意的量表（同一次会话内不再重复询问） */
  var consented = {};

  /**
   * 自动保存草稿（防抖 500ms）。
   * 用防抖而不是每点一下就写一次：连点选项会产生大量无意义的写入。
   */
  var flushDraft = U.debounce(function () {
    if (!draft.scaleKey) { return; }
    PHR.assessment.saveDraft(draft.scaleKey, draft.answers);
    var hint = U.$('#take-draft-hint');
    if (hint) {
      hint.textContent = PHR.t('assessment.take.draftSavedAt', '草稿已自动保存 · {time}',
        { time: U.fmtFull(Date.now()).slice(-8) });
      hint.classList.remove('dim');
    }
  }, 500);

  /* ================================================================== *
   * 一、视图注册
   * ================================================================== */
  PHR.registerView('assessment-take', {
    title: PHR.t('view.assessment-take.title', '填写测评'), icon: '📝', group: 'main', order: 91, module: 'assessment',
    nav: false,
    render: render,
    /* 离开页面时把还没防抖出去的答案补写一次，避免"刚点完就切走"丢进度 */
    unmount: function () {
      if (draft.scaleKey && Object.keys(draft.answers).length) {
        PHR.assessment.saveDraft(draft.scaleKey, draft.answers);
      }
    }
  });

  /* ================================================================== *
   * 二、渲染入口
   * ================================================================== */
  function render(root, params) {
    var key = (params && params.p1) || '';
    var page = document.createElement('div');
    page.id = 'take-root';
    root.innerHTML = '';
    root.appendChild(page);

    var sc = S.get(key);
    if (!sc) {
      page.innerHTML = pageHead(PHR.t('assessment.scoring.noScale', '量表不存在'), '') +
        PHR.ui.empty({
          icon: '❓', title: PHR.t('assessment.take.noScaleTitle', '找不到这份量表'),
          hint: PHR.t('assessment.take.noScaleHint',
            '地址里的量表标识「{key}」不在本系统的量表清单里。', { key: key }),
          action: { label: PHR.t('assessment.backToCatalog', '返回心理测评'), action: 'back' }
        });
      dom.actions(page, { back: function () { PHR.router.go('/assessment'); } });
      return;
    }

    /* 切换量表时重置作答状态；同一量表重新进入则从草稿恢复 */
    if (draft.scaleKey !== sc.key) {
      draft.scaleKey = sc.key;
      var saved = PHR.assessment.draft(sc.key);
      draft.answers = (saved && saved.answers) ? saved.answers : {};
    }

    if (!consented[sc.key]) { drawConsent(page, sc); return; }
    drawForm(page, sc);
  }

  /* ================================================================== *
   * 三、第一步：知情同意
   * ================================================================== */
  function drawConsent(page, sc) {
    page.innerHTML = pageHead(sc.name, PHR.t('assessment.take.consentTitle',
      '开始之前，请先花一分钟了解下面四件事')) +
      '<div class="card mb4"><div class="card-head">' +
        '<h3 class="t-lg">' + sc.icon + ' ' + dom.esc(sc.name) + '</h3>' +
        '<div class="sub">' +
          dom.esc(PHR.t('assessment.questions', '{n} 题', { n: sc.items.length })) + ' · ' +
          dom.esc(PHR.t('assessment.report.aboutMinutes', '约 {n} 分钟', { n: sc.estMinutes })) + ' · ' +
          dom.esc(sc.source) + '</div>' +
      '</div><div class="card-body">' +
        '<ol class="t-sm" style="margin:0;padding-left:1.3em;display:grid;gap:10px">' +
          '<li>' + PHR.t('assessment.take.consent1',
            '<b>这是筛查工具，不是诊断。</b>' +
            '筛查分数偏高不等于患病，分数正常也不能排除问题；' +
            '任何结论都要由精神科医师或心理治疗师结合面谈与病史做出。') + '</li>' +
          '<li>' + PHR.t('assessment.take.consent2',
            '<b>结果只保存在这台设备上，只有你自己看得到。</b>' +
            '测评记录不会写进健康档案、不会被搜索到、也不会参与其它模块的风险评分。' +
            '但请注意：如果这台电脑是共用的，别人可能打开页面看到它。') + '</li>' +
          '<li>' + PHR.t('assessment.take.consent3',
            '<b>如实作答才有参考价值。</b>请按最近这段时间的<b>实际感受</b>选，' +
            '不要挑"看起来正常"的答案 —— 那样得到的分数对你没有任何帮助。') + '</li>' +
          '<li>' + PHR.t('assessment.take.consent4',
            '<b>如果作答中出现了伤害自己的念头，系统会给出求助渠道。</b>' +
            '那不是危言耸听，只是想让需要的人知道电话就在手边。') + '</li>' +
        '</ol>' +
        '<div class="divider"></div>' +
        '<div class="row wrap gap3">' +
          '<button class="btn btn-primary" data-action="agree">' +
            PHR.t('assessment.take.agree', '我知道了，开始作答') + '</button>' +
          '<button class="btn btn-ghost" data-action="back">' +
            PHR.t('assessment.take.backToCatalog', '返回量表目录') + '</button>' +
        '</div>' +
      '</div></div>' +
      infoCard(sc);

    dom.actions(page, {
      agree: function () { consented[sc.key] = true; drawForm(page, sc); },
      back: function () { PHR.router.go('/assessment'); }
    });
  }

  /* ================================================================== *
   * 四、第二步：逐题作答
   * ================================================================== */
  function drawForm(page, sc) {
    page.innerHTML = pageHead(sc.name, PHR.t('assessment.take.formDesc',
      '请按最近这段时间的实际情况作答')) +
      (sc.noCutoff
        ? PHR.ui.notice('warn', PHR.t('assessment.take.noCutoffTitle', '该量表没有临床切分点'),
            sc.cutoffNote || PHR.t('assessment.take.noCutoffBody',
              '本量表没有公认的临床切分点，分数只用于自我观察，不代表严重程度。'),
            { icon: '⚠️' })
        : '') +
      progressCard(sc) +
      '<div id="take-items">' + sc.items.map(function (it) {
        return questionHtml(sc, it);
      }).join('') + '</div>' +
      '<div class="row wrap gap3 mt4 mb4">' +
        '<button class="btn btn-primary" data-action="submit">' +
          PHR.t('assessment.take.submit', '✅ 提交并查看报告') + '</button>' +
        '<button class="btn" data-action="exit">' +
          PHR.t('assessment.take.exit', '💾 退出并保存草稿') + '</button>' +
        '<span class="t-xs dim grow">' + PHR.t('assessment.take.exitHint',
          '答到一半也可以先退出，答案会以草稿形式保存，回来接着答即可。') + '</span>' +
      '</div>' +
      infoCard(sc);

    dom.actions(page, {
      pick: function (e, el) { pick(page, sc, Number(el.getAttribute('data-item')), Number(el.getAttribute('data-value'))); },
      submit: function () { submit(page, sc); },
      exit: function () { exitWithDraft(sc); },
      back: function () { PHR.router.go('/assessment'); }
    });

    updateProgress(page, sc);
  }

  /** 进度条 + 草稿提示 */
  function progressCard(sc) {
    return '<div class="card mb4"><div class="card-body tight">' +
      '<div class="row between wrap gap2 mb2">' +
        '<span class="t-sm bold" id="take-progress-text">' +
          PHR.t('assessment.take.progress', '已答 {done} / {total}', { done: 0, total: sc.items.length }) +
        '</span>' +
        '<span class="t-xs dim" id="take-draft-hint">' +
          PHR.t('assessment.take.draftSaved', '草稿会自动保存') + '</span>' +
      '</div>' +
      '<div class="progress"><i id="take-progress-bar" style="width:0%"></i></div>' +
    '</div></div>';
  }

  /** 单题：题干 + 一排可点的选项 chip */
  function questionHtml(sc, it) {
    var opts = S.optionsOf(sc.key, it.i);
    var chosen = draft.answers[it.i];

    return '<div class="card mb3" id="take-q-' + it.i + '"><div class="card-body tight">' +
      '<div class="row-top gap2 mb3">' +
        '<span class="badge tone-muted">' + it.i + '</span>' +
        '<div class="grow t-sm semibold">' + dom.esc(it.text) +
          (it.reverse
            ? ' <span class="badge tone-info">' +
              PHR.t('assessment.report.reverse', '反向计分') + '</span>'
            : '') +
        '</div>' +
        (chosen === undefined
          ? '<span class="t-xs dim" data-mark="' + it.i + '">' +
            PHR.t('assessment.take.unanswered', '未答') + '</span>'
          : '<span class="t-xs ok" data-mark="' + it.i + '">' +
            PHR.t('assessment.take.answered', '已答') + '</span>') +
      '</div>' +
      '<div class="row wrap gap2" data-opts="' + it.i + '">' +
        opts.map(function (o) {
          return '<button class="chip clickable' +
            (String(chosen) === String(o.value) ? ' active' : '') +
            '" data-action="pick" data-item="' + it.i + '" data-value="' + o.value + '">' +
            dom.esc(o.label) + '</button>';
        }).join('') +
      '</div>' +
      (it.note ? '<div class="t-xs dim mt2">⚠️ ' + dom.esc(it.note) + '</div>' : '') +
    '</div></div>';
  }

  /** 选中一个选项：只重绘这一题的选中态，不整页重排（否则会丢失滚动位置） */
  function pick(page, sc, i, value) {
    draft.answers[i] = value;

    var box = U.$('[data-opts="' + i + '"]', page);
    var it = S.item(sc.key, i);
    if (box && it) {
      var opts = S.optionsOf(sc.key, i);
      box.innerHTML = opts.map(function (o) {
        return '<button class="chip clickable' +
          (String(value) === String(o.value) ? ' active' : '') +
          '" data-action="pick" data-item="' + i + '" data-value="' + o.value + '">' +
          dom.esc(o.label) + '</button>';
      }).join('');
    }
    var mark = U.$('[data-mark="' + i + '"]', page);
    if (mark) {
      mark.className = 't-xs ok';
      mark.textContent = PHR.t('assessment.take.answered', '已答');
    }

    updateProgress(page, sc);
    flushDraft();
  }

  function updateProgress(page, sc) {
    var check = PHR.assessment.scoring.validate(sc.key, draft.answers);
    var bar = U.$('#take-progress-bar', page);
    var text = U.$('#take-progress-text', page);
    if (bar) {
      bar.style.width = check.percent + '%';
      bar.parentNode.className = 'progress' + (check.ok ? ' tone-ok' : '');
    }
    if (text) {
      text.textContent = PHR.t('assessment.take.progress', '已答 {done} / {total}',
        { done: check.answered, total: check.total });
    }
  }

  /* ================================================================== *
   * 五、第三步：提交
   * ================================================================== */
  function submit(page, sc) {
    var check = PHR.assessment.scoring.validate(sc.key, draft.answers);
    if (!check.ok) {
      PHR.ui.toast.warn(PHR.t('assessment.take.missing', '还有 {n} 题没有作答', { n: check.missing.length }), {
        title: PHR.t('assessment.take.missingTitle', '先答完再提交'),
        detail: PHR.t('assessment.take.missingDetail', '已为你定位到第 {n} 题。', { n: check.missing[0] })
      });
      var node = U.$('#take-q-' + check.missing[0], page);
      if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }

    var res = PHR.assessment.submit(sc.key, draft.answers);
    if (!res || !res.ok) {
      PHR.ui.toast.warn((res && res.message) || PHR.t('assessment.take.submitFail', '提交失败，请稍后重试'));
      return;
    }

    // 服务层已经清掉了草稿；把本地状态也清空，避免 unmount 时又写回去
    draft.scaleKey = '';
    draft.answers = {};
    goReport(sc, res);
  }

  /**
   * 提交后跳转报告页。
   *
   * ⚠️ 危机提示刻意做成**可关闭的普通弹窗**（closable: true，按钮只有"我知道了"）。
   *    不做成"必须点确认才能继续"的强制流程 —— 危机干预的目标是把求助渠道
   *    递到用户手上，而不是把人锁在页面上；强制阻断只会让人急着关掉窗口，
   *    反而记不住任何一个号码。用户关掉之后照常进入自己的报告。
   */
  function goReport(sc, res) {
    var id = res.report && res.report.id;

    if (!res.crisis || !res.crisis.shouldBlock) {
      PHR.ui.toast.ok(PHR.t('assessment.take.done', '测评已完成，报告已生成'));
      PHR.router.go('/assessment-report/' + id);
      return;
    }

    PHR.ui.modal({
      title: PHR.t('crisis.headline', '请先看看这些信息'),
      size: 'normal',
      closable: true,
      body: PHR.assessment.crisis.modalBodyHtml(sc.key, res.report),
      actions: [{ label: PHR.t('assessment.take.gotIt', '我知道了'), tone: 'primary' }],
      onClose: function () { PHR.router.go('/assessment-report/' + id); }
    });
  }

  function exitWithDraft(sc) {
    PHR.assessment.saveDraft(sc.key, draft.answers);
    PHR.ui.toast.info(PHR.t('assessment.take.draftKept', '草稿已保存，下次从这里继续'));
    PHR.router.go('/assessment');
  }

  /* ================================================================== *
   * 六、零件
   * ================================================================== */
  function pageHead(title, desc) {
    return '<div class="page-head">' +
      '<div class="titles">' +
        '<h2>' + dom.esc(title) + '</h2>' +
        (desc ? '<div class="desc">' + dom.esc(desc) + '</div>' : '') +
      '</div>' +
      '<div class="actions"><button class="btn btn-ghost" data-action="back">' +
        '← ' + PHR.t('assessment.take.backToCatalog', '返回量表目录') + '</button></div>' +
    '</div>';
  }

  /** 量表说明卡（题干之外的信息都收在这里，避免打断作答） */
  function infoCard(sc) {
    return '<div class="card mb4"><div class="card-head">' +
      '<h3 class="t-lg">' + PHR.t('assessment.take.aboutScale', '关于「{name}」',
        { name: dom.esc(sc.name) }) + '</h3>' +
      '<div class="sub">' + dom.esc(sc.source) + '</div>' +
    '</div><div class="card-body">' +
      '<div class="t-sm dim mb2">' + dom.esc(sc.desc) + '</div>' +
      '<div class="t-sm">' + rich(sc.intro) + '</div>' +
      '<div class="divider"></div>' +
      '<div class="row wrap gap6">' +
        stat(PHR.t('assessment.take.statItems', '题数'),
          PHR.t('assessment.questions', '{n} 题', { n: sc.items.length })) +
        stat(PHR.t('assessment.take.statTime', '预计用时'),
          PHR.t('assessment.report.aboutMinutes', '约 {n} 分钟', { n: sc.estMinutes })) +
        stat(PHR.t('assessment.take.statTopic', '主题'), S.topicName(sc.topic)) +
        stat(PHR.t('assessment.take.statDirection', '计分方向'),
          sc.higherIsBetter
            ? PHR.t('assessment.take.higherBetter', '分数越高越好')
            : PHR.t('assessment.take.lowerBetter', '分数越低越好')) +
      '</div>' +
      (sc.noCutoff
        ? '<div class="t-xs dim mt3">⚠️ ' + dom.esc(sc.cutoffNote) + '</div>'
        : '') +
      '<div class="t-xs dim mt3">' + dom.esc(S.DISCLAIMER_SHORT) + '</div>' +
    '</div></div>';
  }

  function stat(label, value) {
    return '<div><div class="t-xs dim">' + dom.esc(label) + '</div>' +
      '<div class="semibold t-sm">' + dom.esc(value) + '</div></div>';
  }

  /** 转义后把 **粗体** 标记换成 <b> */
  function rich(text) {
    return dom.esc(text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }

})(window.PHR);
