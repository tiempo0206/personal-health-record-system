/**
 * ============================================================================
 * 文件：modules/community/community.view.js
 * 层：业务模块层（患者社群 —— 模块 7 · 视图）
 * 职责：注册患者社群的两个页面视图：
 *      - community       社群首页：免责声明 + 板块切换 + 搜索 + 排序 + 帖子列表
 *                        + 热门标签 + 猜你喜欢
 *      - community-post  帖子详情：帖子全文 + 回复列表 + 回复输入 + 举报 / 删除
 *      本文件只做"渲染 + 收集输入 + 调用 service"，不直接读写仓储、
 *      不自行实现审核逻辑。
 * 依赖：core/namespace.js、core/dict.js、core/utils.js、
 *      ui/components/{dom,empty,modal,toast,form}.js、ui/router.js、
 *      modules/community/{topics,moderation,community.service}.js
 * 视图路由： #/community               社群首页
 *           #/community-post/<帖子id>  帖子详情
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;

  /* 排序项。name 用访问器延迟取词：本数组在脚本加载时求值，而语言探测
     （PHR.i18n.detect()）在 core/boot.js 里才跑，直接取词会把中文固化下来。
     key 是排序的内部标识，不翻译。 */
  var SORTS = [
    { key: 'latest',  get name() { return PHR.t('community.sort.latest', '最新'); } },
    { key: 'hot',     get name() { return PHR.t('community.sort.hot', '最热'); } },
    { key: 'replies', get name() { return PHR.t('community.sort.replies', '回复最多'); } }
  ];

  /* 列表页的筛选状态放在模块级，从详情页返回时能保留用户的选择 */
  var state = { board: '', keyword: '', tag: '', sort: 'latest', onlyMine: false };
  var searchTimer = null;

  function svc() { return PHR.community.service; }
  function topics() { return PHR.community.topics; }
  function moderation() { return PHR.community.moderation; }
  function meId() { var u = svc().currentUser(); return u ? u.id : ''; }
  function esc(s) { return dom.esc(s); }

  /* ================================================================== *
   * 一、公共片段
   * ================================================================== */
  function disclaimer() {
    return PHR.ui.notice('warn', PHR.t('community.disclaimer.title', '内容不替代医生建议'),
      PHR.t('community.disclaimer.body',
        '社群里的内容都是病友的个人经验，不能替代医生的诊断、处方与随访；' +
        '身体不适请及时就医。平台会对医疗广告与敏感表述做发布前拦截，' +
        '并请勿填写真实姓名、住院号、手机号等信息。'));
  }

  function avatar(name) {
    return '<span class="avatar sm" style="background:' + U.hashColor(name) + '">' +
      esc(String(name || PHR.t('community.anonInitial', '匿')).slice(0, 1)) + '</span>';
  }

  function mineTag(isMine) {
    return isMine ? '<span class="badge tone-primary">' + PHR.t('community.badge.mine', '我') + '</span>' : '';
  }

  /** 匿名身份 + 匿名/实名徽章 */
  function whoHtml(a, extra) {
    return '<span class="bold">' + esc(a.name) + '</span>' + mineTag(a.isMine) +
      (a.anonymous ? '' : '<span class="badge tone-muted">' + PHR.t('community.badge.realName', '实名') + '</span>') +
      (extra || '');
  }

  /**
   * 标签的**显示名**。
   * 标签值本身（'高血压'）同时是筛选键（data-tag 会传给 service 过滤），
   * 渲染成译文就点不动了 —— 所以值保持原样，只在显示时查词条翻译。
   */
  function tagLabel(t) {
    var e = (PHR.seed && PHR.seed.textKeyOf) ? PHR.seed.textKeyOf(t) : null;
    return e ? PHR.t(e.key, t, e.params || undefined) : t;
  }

  function tagChips(tags) {
    if (!tags || !tags.length) { return ''; }
    return '<div class="tag-list mt3">' + tags.map(function (t) {
      return '<span class="chip clickable" data-action="filter-tag" data-tag="' + esc(t) + '">#' + esc(tagLabel(t)) + '</span>';
    }).join('') + '</div>';
  }

  /** 举报弹窗（列表页与详情页共用） */
  function openReport(postId, after) {
    PHR.ui.form.dialog({
      title: PHR.t('community.report.title', '举报这条内容'),
      size: 'narrow',
      submitLabel: PHR.t('community.report.submit', '提交举报'),
      fields: [
        { name: 'reason', label: PHR.t('community.report.reason', '举报原因'), type: 'select', required: true,
          options: moderation().reasons() },
        { name: 'note', label: PHR.t('community.report.note', '补充说明（可选）'), type: 'textarea',
          placeholder: PHR.t('community.report.notePlaceholder', '例如：反复发布同一家诊所的联系方式') }
      ],
      onSubmit: function (values) {
        var me = svc().currentUser();
        moderation().report(postId, values.reason, {
          note: values.note,
          reporterId: me ? me.id : ''
        });
        PHR.ui.toast.ok(PHR.t('community.report.done', '已收到举报'),
          { detail: PHR.t('community.report.doneDetail', '平台会进行人工复核，感谢你的监督。') });
        if (after) { after(); }
      }
    });
  }

  /* ================================================================== *
   * 二、社群首页
   * ================================================================== */
  function shellHtml() {
    return '' +
      '<div class="page-head">' +
        '<div class="titles">' +
          '<h2>💬 ' + esc(PHR.t('view.community.title', '患者社群')) + '</h2>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="toggle-mine">' + esc(PHR.t('community.btn.minePosts', '👤 我的发布')) + '</button>' +
          '<button class="btn btn-primary" data-action="new-post">' + esc(PHR.t('community.btn.newPost', '✍️ 发帖')) + '</button>' +
        '</div>' +
      '</div>' +
      disclaimer() +
      '<div class="board-nav mt4" id="cm-boards"></div>' +
      '<div class="card mb4"><div class="card-body tight">' +
        '<div class="row wrap gap3">' +
          '<div class="search-input-wrap grow" style="min-width:220px">' +
            '<span class="ico">🔍</span>' +
            '<input class="input" id="cm-search" type="search" placeholder="' +
              esc(PHR.t('community.searchPlaceholder', '搜索标题、正文或标签')) + '" autocomplete="off">' +
          '</div>' +
          '<div class="segmented" id="cm-sort" role="group" aria-label="' +
            esc(PHR.t('community.sortLabel', '排序方式')) + '">' +
            SORTS.map(function (s) {
              return '<button type="button" data-action="sort" data-sort="' + s.key + '">' + esc(s.name) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div></div>' +
      '<div id="cm-list"></div>' +
      '<div class="card mt5">' +
        '<div class="card-head"><h4>' + esc(PHR.t('community.hotTags', '🔥 热门标签')) + '</h4>' +
          '<div class="actions"><button class="btn btn-sm" data-action="clear-filter">' +
            esc(PHR.t('community.clearFilter', '重置筛选')) + '</button></div></div>' +
        '<div class="card-body tight"><div class="tag-list" id="cm-tags"></div></div>' +
      '</div>' +
      '<div class="card mt4" id="cm-rec"></div>';
  }

  function paintBoards(root) {
    var host = root.querySelector('#cm-boards');
    if (!host) { return; }
    var stats = topics().stats();
    var total = U.sum(stats, 'count');
    var html = '<span class="chip clickable' + (state.board === '' ? ' active' : '') +
      '" data-action="board" data-key="">' +
      esc(PHR.t('community.board.all', '💬 全部 ({n})', { n: total })) + '</span>';
    html += stats.map(function (b) {
      return '<span class="chip clickable' + (state.board === b.key ? ' active' : '') +
        '" data-action="board" data-key="' + esc(b.key) + '">' +
        esc(b.icon + ' ' + b.name) + ' (' + b.count + ')</span>';
    }).join('');
    host.innerHTML = html;
  }

  function paintToolbar(root) {
    var search = root.querySelector('#cm-search');
    if (search && document.activeElement !== search) { search.value = state.keyword; }
    var sort = root.querySelector('#cm-sort');
    if (sort) {
      U.$$('button', sort).forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-sort') === state.sort ? 'true' : 'false');
      });
    }
    // 高亮"我的发布"：用 btn-soft 表达选中态（.btn.active 只在按钮组里有样式）
    var mineBtn = root.querySelector('[data-action="toggle-mine"]');
    if (mineBtn) { mineBtn.className = state.onlyMine ? 'btn btn-soft' : 'btn'; }
  }

  function postCard(p) {
    var me = meId();
    var a = svc().authorLabel(p, me);
    var liked = svc().isLiked(p.id, me);
    var board = topics().get(p.board) ||
      { icon: '💬', name: PHR.i18n.dictName('communityBoard', 'general', '综合交流') };
    var hidden = p.status === 'hidden';

    return '<article class="post-card mb3">' +
      (hidden ? PHR.ui.notice('warn', PHR.t('community.hidden.title', '等待人工复核'),
        PHR.t('community.hidden.body', '该内容被多次举报，目前仅你自己可见。')) : '') +
      '<div class="head">' + avatar(a.name) +
        '<div class="who">' +
          '<div class="n">' + whoHtml(a, p.pinned
            ? ' <span class="badge tone-warn">' + PHR.t('community.pinned', '📌 置顶') + '</span>' : '') + '</div>' +
          '<div class="m">' + esc(board.icon + ' ' + board.name) + ' · ' + U.fmtRelative(p.createdAt) +
            (p.anonymous === false ? '' : ' · ' + PHR.t('community.anon', '匿名')) + '</div>' +
        '</div>' +
      '</div>' +
      '<h4>' + esc(p.title) + '</h4>' +
      '<div class="content">' + esc(U.truncate(p.content, 200)) + '</div>' +
      tagChips(p.tags) +
      '<div class="foot">' +
        '<button class="act' + (liked ? ' liked' : '') + '" data-action="like" data-id="' + esc(p.id) + '">' +
          (liked ? '❤️' : '🤍') + ' ' + (p.likes || 0) + '</button>' +
        '<button class="act" data-action="open" data-id="' + esc(p.id) + '">' +
          esc(PHR.t('community.replyCount', '💬 {n} 条回复', { n: p.replyCount || 0 })) + '</button>' +
        '<span class="grow"></span>' +
        '<button class="act" data-action="report" data-id="' + esc(p.id) + '">' +
          esc(PHR.t('community.action.report', '🚩 举报')) + '</button>' +
      '</div>' +
    '</article>';
  }

  function paintList(root) {
    var host = root.querySelector('#cm-list');
    if (!host) { return; }
    var list = svc().listPosts({
      board: state.board, keyword: state.keyword, tag: state.tag,
      sort: state.sort, onlyMine: state.onlyMine, userId: meId()
    });
    if (!list.length) {
      host.innerHTML = PHR.ui.empty({
        icon: '💬',
        title: state.onlyMine
          ? PHR.t('community.empty.mineTitle', '你还没有发布过内容')
          : PHR.t('community.empty.title', '这里还很安静'),
        hint: PHR.t('community.empty.hint', '说说你的就诊经验、饮食调整或者最近的心情，病友会看到并回应你。'),
        action: { label: PHR.t('community.empty.action', '写一条'), action: 'new-post', icon: '✍️' }
      });
      return;
    }
    host.innerHTML = list.map(postCard).join('');
  }

  function paintTags(root) {
    var tags = topics().hotTags(14);
    var host = root.querySelector('#cm-tags');
    if (host) {
      host.innerHTML = tags.length
        ? '<span class="chip clickable' + (state.tag === '' ? ' active' : '') +
            '" data-action="filter-tag" data-tag="">' +
            esc(PHR.t('community.tag.all', '全部标签')) + '</span>' +
          tags.map(function (t) {
            return '<span class="chip clickable' + (state.tag === t.tag ? ' active' : '') +
              '" data-action="filter-tag" data-tag="' + esc(t.tag) + '">#' + esc(tagLabel(t.tag)) +
              ' <span class="dim">' + t.count + '</span></span>';
          }).join('')
        : '<span class="dim">' +
            esc(PHR.t('community.tag.empty', '还没有标签，发帖时可以用标签帮内容找到对的人。')) + '</span>';
    }

    var rec = root.querySelector('#cm-rec');
    if (!rec) { return; }
    var list = topics().recommend(meId(), 3);
    if (!list.length) { rec.innerHTML = ''; return; }
    rec.innerHTML = '<div class="card-head"><h4>' + esc(PHR.t('community.recommend', '🔎 猜你喜欢')) + '</h4>' +
      '<div class="sub">' + esc(PHR.t('community.recommendHint', '按板块热度与标签重合度推荐')) + '</div></div>' +
      '<div class="card-body flush"><div class="list">' + list.map(function (p) {
        var b = topics().get(p.board) ||
          { icon: '💬', name: PHR.i18n.dictName('communityBoard', 'general', '综合交流') };
        return '<div class="list-item clickable" data-action="open" data-id="' + esc(p.id) + '">' +
          '<span class="lead">' + esc(b.icon) + '</span>' +
          '<div class="body"><div class="title">' + esc(p.title) + '</div>' +
          '<div class="sub">' + esc(b.name) + ' · ' +
            esc(PHR.t('community.recStats', '{likes} 赞 · {replies} 回复',
              { likes: p.likes || 0, replies: p.replyCount || 0 })) +
            ' · ' + U.fmtRelative(p.createdAt) + '</div></div></div>';
      }).join('') + '</div></div>';
  }

  function paint(root) {
    paintBoards(root);
    paintToolbar(root);
    paintList(root);
    paintTags(root);
  }

  /** 发帖弹窗 */
  function openComposer(root) {
    var boards = topics().list();
    var body =
      '<form id="cm_form" novalidate>' +
        '<div class="field"><label for="cm_board">' + esc(PHR.t('community.compose.board', '板块')) + '</label>' +
          '<select class="select" id="cm_board" name="board">' +
            boards.map(function (b) {
              return '<option value="' + esc(b.key) + '"' +
                (b.key === (state.board || 'general') ? ' selected' : '') + '>' +
                esc(b.icon + ' ' + b.name) + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="field"><label for="cm_title">' + esc(PHR.t('community.compose.title', '标题')) +
          '<span class="req">*</span></label>' +
          '<input class="input" id="cm_title" name="title" maxlength="60" placeholder="' +
            esc(PHR.t('community.compose.titlePlaceholder', '一句话说清你想聊什么')) + '"></div>' +
        '<div class="field"><label for="cm_content">' + esc(PHR.t('community.compose.content', '正文')) +
          '<span class="req">*</span></label>' +
          '<textarea class="textarea" id="cm_content" name="content" maxlength="2000" ' +
            'placeholder="' +
            esc(PHR.t('community.compose.contentPlaceholder', '说说你的情况、做过哪些尝试、现在怎么样。请勿留下联系方式。')) +
            '"></textarea>' +
          '<div class="hint">' +
            esc(PHR.t('community.compose.hint', '平台会拦截医疗广告与敏感表述；涉及用药的内容请注明“请遵医嘱”。')) +
          '</div></div>' +
        '<div class="field"><label for="cm_tags">' + esc(PHR.t('community.compose.tags', '标签')) + '</label>' +
          '<input class="input" id="cm_tags" name="tags" placeholder="' +
            esc(PHR.t('community.compose.tagsPlaceholder', '用逗号分隔，最多 5 个，例如：高血压，饮食')) + '"></div>' +
        '<label class="checkbox"><input type="checkbox" id="cm_anon" checked>' +
          '<span>' + esc(PHR.t('community.compose.anon', '匿名发布（只显示别名，不显示账号名）')) + '</span></label>' +
        '<div id="cm_form_alert" class="mt3"></div>' +
      '</form>';

    PHR.ui.modal({
      title: PHR.t('community.compose.modalTitle', '发布帖子'),
      size: 'normal',
      body: body,
      actions: [
        { label: PHR.t('ui.cancel', '取消'), tone: 'ghost' },
        { label: PHR.t('community.compose.submit', '发布'), tone: 'primary', close: false, action: function (v, close, bodyEl) {
            function val(id) { var n = bodyEl.querySelector(id); return n ? n.value : ''; }
            var res = svc().createPost({
              board: val('#cm_board'),
              title: val('#cm_title'),
              content: val('#cm_content'),
              tags: val('#cm_tags'),
              anonymous: !!(bodyEl.querySelector('#cm_anon') || {}).checked
            }, svc().currentUser());

            var alertHost = bodyEl.querySelector('#cm_form_alert');
            if (!res.ok) {
              if (alertHost) {
                alertHost.innerHTML = PHR.ui.notice('danger', PHR.t('community.compose.fail', '无法发布'), res.message);
              }
              return false;
            }
            if (res.warning) { PHR.ui.toast.warn(res.warning, { duration: 6000 }); }
            PHR.ui.toast.ok(PHR.t('community.compose.ok', '发布成功'));
            close('submit');
            state.onlyMine = false;
            paint(root);
          } }
      ]
    });
  }

  PHR.registerView('community', {
    title: PHR.t('view.community.title', '患者社群'),
    icon: '💬',
    group: 'main',
    order: 7,
    module: 'community',

    render: function (container, params) {
      // 支持从其它页面带条件跳进来：#/community?board=chronic&tag=高血压&q=血压
      state.board = params.board || '';
      state.keyword = params.q || '';
      state.tag = params.tag || '';
      state.sort = params.sort || 'latest';
      if (params.onlyMine === '1') { state.onlyMine = true; }

      container.innerHTML = '<div id="cm-root">' + shellHtml() + '</div>';
      var root = container.querySelector('#cm-root');

      dom.actions(root, {
        board: function (e, el) { state.board = el.getAttribute('data-key') || ''; paint(root); },
        sort: function (e, el) { state.sort = el.getAttribute('data-sort') || 'latest'; paint(root); },
        'filter-tag': function (e, el) { state.tag = el.getAttribute('data-tag') || ''; paint(root); },
        'toggle-mine': function () { state.onlyMine = !state.onlyMine; paint(root); },
        'clear-filter': function () {
          state = { board: '', keyword: '', tag: '', sort: 'latest', onlyMine: false };
          paint(root);
        },
        'new-post': function () { openComposer(root); },
        open: function (e, el) { PHR.router.go('/community-post/' + el.getAttribute('data-id')); },
        like: function (e, el) {
          var res = svc().toggleLike(el.getAttribute('data-id'));
          if (res.ok) { paintList(root); } else { PHR.ui.toast.warn(res.message); }
        },
        report: function (e, el) { openReport(el.getAttribute('data-id'), function () { paint(root); }); }
      });

      var search = root.querySelector('#cm-search');
      if (search) {
        search.addEventListener('input', function () {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            state.keyword = search.value.trim();
            paintList(root);
          }, 250);
        });
      }

      paint(root);
    },

    unmount: function () { clearTimeout(searchTimer); }
  });

  /* ================================================================== *
   * 三、帖子详情
   * ================================================================== */
  function replyItem(r) {
    var a = svc().authorLabel(r, meId());
    return '<div class="reply-item">' + avatar(a.name) +
      '<div class="body">' +
        '<div class="who">' + whoHtml(a, r.isAuthor
          ? '<span class="badge tone-info">' + PHR.t('community.op', '楼主') + '</span>' : '') +
          '<span>' + U.fmtRelative(r.createdAt) + '</span></div>' +
        '<div class="content">' + esc(r.content) + '</div>' +
      '</div></div>';
  }

  function paintReplies(root, postId) {
    var list = svc().getReplies(postId);
    var host = root.querySelector('#cm-replies');
    if (host) {
      host.innerHTML = list.length
        ? list.map(replyItem).join('')
        : '<div class="dim">' + esc(PHR.t('community.reply.empty', '还没有人回复，来说两句吧。')) + '</div>';
    }
    var count = root.querySelector('#cm-reply-count');
    if (count) { count.textContent = PHR.t('community.replyUnit', '{n} 条', { n: list.length }); }
  }

  var postView = PHR.registerView('community-post', {
    title: PHR.t('view.community-post.title', '帖子详情'),
    icon: '💬',
    group: 'main',
    nav: false,
    module: 'community',

    render: function (container, params) {
      var postId = params.p1 || '';
      var me = meId();
      var post = svc().getPost(postId);

      if (!post || post.status === 'removed') {
        container.innerHTML = '<div id="cm-root">' +
          '<button class="btn btn-sm mb4" data-action="back">' +
            esc(PHR.t('community.back', '← 返回社群')) + '</button>' +
          PHR.ui.empty({ icon: '🔍', title: PHR.t('community.notFound', '帖子不存在或已被删除'),
            hint: PHR.t('community.notFoundHint', '它可能已被作者本人删除，或因违反社群规范被下架。') }) +
          '</div>';
        dom.actions(container.querySelector('#cm-root'), {
          back: function () { PHR.router.go('/community'); }
        });
        return;
      }

      var a = svc().authorLabel(post, me);
      var board = topics().get(post.board) ||
        { icon: '💬', name: PHR.i18n.dictName('communityBoard', 'general', '综合交流') };
      var liked = svc().isLiked(post.id, me);
      var isOwner = !!(post.userId && post.userId === me);

      container.innerHTML = '<div id="cm-root">' +
        '<div class="row between wrap gap2 mb4">' +
          '<button class="btn btn-sm" data-action="back">' +
            esc(PHR.t('community.back', '← 返回社群')) + '</button>' +
          '<div class="row gap2">' +
            '<button class="btn btn-sm" data-action="report">' +
              esc(PHR.t('community.action.report', '🚩 举报')) + '</button>' +
            (isOwner
              ? '<button class="btn btn-sm btn-danger" data-action="remove">' +
                  esc(PHR.t('community.action.remove', '删除帖子')) + '</button>' : '') +
          '</div>' +
        '</div>' +
        (post.status === 'hidden'
          ? PHR.ui.notice('warn', PHR.t('community.hidden.title', '等待人工复核'),
              PHR.t('community.hidden.bodyDetail', '该内容被多次举报，目前仅你自己可见，复核后将决定是否恢复。')) : '') +
        '<article class="post-card">' +
          '<div class="head">' + avatar(a.name) +
            '<div class="who">' +
              '<div class="n">' + whoHtml(a, post.pinned
                ? ' <span class="badge tone-warn">' + PHR.t('community.pinned', '📌 置顶') + '</span>' : '') + '</div>' +
              '<div class="m">' + esc(board.icon + ' ' + board.name) + ' · ' + U.fmtDateTime(post.createdAt) +
                (a.anonymous ? ' · ' + PHR.t('community.anonPost', '匿名发布') : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<h4>' + esc(post.title) + '</h4>' +
          '<div class="content">' + esc(post.content) + '</div>' +
          tagChips(post.tags) +
          '<div class="foot">' +
            '<button class="act' + (liked ? ' liked' : '') + '" data-action="like">' +
              (liked ? '❤️' : '🤍') + ' ' + (post.likes || 0) + '</button>' +
            '<span class="act">💬 <span id="cm-reply-count">' +
              esc(PHR.t('community.replyUnit', '{n} 条', { n: 0 })) + '</span></span>' +
            '<span class="grow"></span>' +
            '<span>' + esc(isOwner
              ? PHR.t('community.owner', '你是本帖作者')
              : PHR.t('community.medAdvice', '如需用药建议请咨询医生')) + '</span>' +
          '</div>' +
        '</article>' +
        '<div class="card mt4">' +
          '<div class="card-head"><h4>' + esc(PHR.t('community.replies', '全部回复')) + '</h4>' +
            '<div class="sub">' + esc(PHR.t('community.repliesHint', '回复同样匿名显示，请友善交流')) + '</div></div>' +
          '<div class="card-body" id="cm-replies"></div>' +
        '</div>' +
        '<div class="card mt4"><div class="card-body">' +
          '<div class="field"><label for="cm_reply_input">' +
            esc(PHR.t('community.reply.label', '写下你的回复')) + '</label>' +
            '<textarea class="textarea" id="cm_reply_input" maxlength="1000" ' +
              'placeholder="' +
              esc(PHR.t('community.reply.placeholder', '分享你的经验，或者只是说一句“我也一样”。')) +
              '"></textarea>' +
            '<div class="hint">' +
              esc(PHR.t('community.reply.hint', '请勿在回复中留下联系方式、推销产品或劝阻他人就医。')) + '</div></div>' +
          '<div class="row between wrap gap3">' +
            '<label class="checkbox"><input type="checkbox" id="cm_reply_anon" checked>' +
              '<span>' + esc(PHR.t('community.reply.anon', '匿名回复')) + '</span></label>' +
            '<button class="btn btn-primary" data-action="send-reply">' +
              esc(PHR.t('community.reply.send', '发送回复')) + '</button>' +
          '</div>' +
        '</div></div>' +
        '<div class="mt4">' + disclaimer() + '</div>' +
      '</div>';

      var root = container.querySelector('#cm-root');

      dom.actions(root, {
        back: function () { PHR.router.go('/community'); },
        like: function () {
          var res = svc().toggleLike(post.id);
          if (!res.ok) { PHR.ui.toast.warn(res.message); return; }
          post.likes = res.likes;
          var btn = root.querySelector('[data-action="like"]');
          if (btn) {
            btn.innerHTML = (res.liked ? '❤️' : '🤍') + ' ' + res.likes;
            btn.classList.toggle('liked', res.liked);
          }
        },
        report: function () { openReport(post.id, function () { PHR.router.reload(); }); },
        remove: function () {
          PHR.ui.confirm({
            title: PHR.t('community.action.remove', '删除帖子'),
            message: PHR.t('community.confirmDelete.message', '确定要删除《{title}》吗？',
              { title: U.truncate(post.title, 20) }),
            detail: PHR.t('community.confirmDelete.detail',
              '删除后帖子与回复将不再对其他人展示，但审计日志会保留本次操作记录。'),
            confirmLabel: PHR.t('ui.delete', '删除')
          }).then(function (ok) {
            if (!ok) { return; }
            svc().removePost(post.id, PHR.t('community.removeByAuthor', '作者本人删除'));
            PHR.ui.toast.ok(PHR.t('community.deleted', '帖子已删除'));
            PHR.router.go('/community');
          });
        },
        'send-reply': function () {
          var input = root.querySelector('#cm_reply_input');
          var anon = root.querySelector('#cm_reply_anon');
          var res = svc().createReply(post.id, input ? input.value : '',
            svc().currentUser(), { anonymous: !anon || anon.checked });
          if (!res.ok) { PHR.ui.toast.danger(res.message, { duration: 6000 }); return; }
          if (res.warning) { PHR.ui.toast.warn(res.warning, { duration: 6000 }); }
          PHR.ui.toast.ok(PHR.t('community.reply.ok', '回复已发送'));
          if (input) { input.value = ''; }
          paintReplies(root, post.id);
        }
      });

      paintReplies(root, post.id);
    }
  });

  /* 帖子详情的标题同样要随语言切换而变：registerView 会把 title 拷贝成普通字符串，
     而脚本加载时语言尚未探测，因此注册后用 getter 覆盖，使面包屑即时跟随
     （社群首页的标题走既有词条 view.community.title，无需在此重复处理）。 */
  Object.defineProperty(postView, 'title', {
    get: function () { return PHR.t('community.postView.title', '帖子详情'); },
    enumerable: true, configurable: true
  });

})(window.PHR);
