/**
 * ============================================================================
 * 文件：modules/community/community.service.js
 * 层：业务模块层（患者社群 —— 模块 7）
 * 职责：社群业务服务。把"列表筛选、发帖、回帖、点赞、删除"等写操作与
 *      审核、审计、匿名展示规则集中在本文件，视图层只负责渲染与收集输入。
 *      - 所有写操作都会先过 PHR.security.sanitizeText（去标签）
 *      - 发帖 / 回帖都会调用 PHR.community.moderation.check() 做发布前拦截
 *      - 关键动作写入审计日志（PHR.audit 由 modules/audit 提供，可能后加载，
 *        因此全部调用都写成防御式，缺失时静默跳过）
 * 依赖：core/namespace.js、core/models.js、core/store.js、core/security.js、
 *      core/dict.js、modules/community/moderation.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  var community = PHR.community = PHR.community || {};

  /* 注册模块元信息：左侧导航分组与面包屑都读这里 */
  if (PHR.registerModule && !PHR.modules.community) {
    var communityMod = PHR.registerModule('community', {
      title: '患者社群',
      icon: '💬',
      order: 7,
      description: '匿名交流就诊经验、用药体会与情绪困扰（内容不替代医生建议）',
      folder: 'modules/community'
    });
    /* 模块标题要随语言切换而变：registerModule 会把 title 拷贝成普通字符串，
       而脚本加载时语言尚未探测（PHR.i18n.detect() 在 core/boot.js 里才跑），
       因此注册后用 getter 覆盖，使面包屑即时跟随。
       description 界面没用到，保持普通字符串。 */
    Object.defineProperty(communityMod, 'title', {
      get: function () { return PHR.t('module.community.title', '患者社群'); },
      enumerable: true, configurable: true
    });
    Object.defineProperty(communityMod, 'description', {
      get: function () { return PHR.t('module.community.desc', '匿名交流就诊经验、用药体会与情绪困扰（内容不替代医生建议）'); },
      enumerable: true, configurable: true
    });
  }

  var LIKES_KEY = 'community_likes';   // 点赞记录：按用户分开存，避免"所有人共用一个赞"

  /* ================================================================== *
   * 一、内部工具
   * ================================================================== */
  function posts() {
    try {
      return (PHR.db.posts.all() || []).map(function (p) {
        /* 标题 / 正文 / 别名是种子文本，按当前语言解析。
           ⚠️ tags 不在这里解析：它同时是筛选键（见 community.view 的 tagLabel）。 */
        return PHR.models.localize(p, ['title', 'content', 'alias']);
      });
    } catch (e) { return []; }
  }

  function moderation() { return community.moderation || null; }

  /** 当前登录用户（账号模块可能未加载，故全程防御式取值） */
  function currentUser() {
    try {
      return (PHR.session && typeof PHR.session.currentUser === 'function')
        ? PHR.session.currentUser() : null;
    } catch (e) { return null; }
  }

  function userName(id) {
    if (!id) { return ''; }
    try {
      var u = PHR.db.users.byId(id);
      return u ? (u.displayName || u.username || '') : '';
    } catch (e) { return ''; }
  }

  /**
   * 写审计日志。
   * PHR.audit 由 modules/audit 提供，脚本加载顺序不保证，故必须防御式调用。
   */
  function auditLog(entry) {
    if (!PHR.audit || typeof PHR.audit.log !== 'function') { return; }
    try { PHR.audit.log(entry); } catch (e) { PHR.warn(PHR.t('community.warn.auditWriteFail', '社群审计写入失败'), e); }
  }

  /** 标签归一化：既接受 "a,b" 字符串，也接受数组；去重、限长、最多 5 个 */
  function normalizeTags(input) {
    var list = Array.isArray(input) ? input : String(input || '').split(/[,，、\s]+/);
    var out = [];
    list.forEach(function (t) {
      t = PHR.security.sanitizeText(t, 12);
      if (t && out.indexOf(t) < 0) { out.push(t); }
    });
    return out.slice(0, 5);
  }

  function verdictOf(text) {
    var m = moderation();
    if (!m || typeof m.check !== 'function') { return { level: 'ok', hits: [], reasons: [] }; }
    return m.check(text);
  }

  function likeKey(userId) { return LIKES_KEY + (userId ? '_' + userId : ''); }

  function readLikes(userId) {
    try { return PHR.store.read(likeKey(userId), []) || []; } catch (e) { return []; }
  }

  function hotScore(p) { return (p.likes || 0) * 2 + (p.replyCount || 0) * 3; }

  /* ================================================================== *
   * 二、查询
   * ================================================================== */

  /**
   * 查询帖子列表。
   * @param {object} opt {
   *   board, keyword, tag, sort:'latest'|'hot'|'replies',
   *   onlyMine, userId
   * }
   * @returns {Array} 帖子数组
   */
  function listPosts(opt) {
    opt = opt || {};
    var keyword = String(opt.keyword || '').trim().toLowerCase();
    var mine = !!(opt.onlyMine && opt.userId);

    var list = posts().filter(function (p) {
      if (!p) { return false; }
      if (p.status === 'removed') { return false; }
      // 被隐藏的内容只对作者本人可见（自己能看到"等待复核"的状态）
      var isMine = !!(opt.userId && p.userId === opt.userId);
      if (p.status === 'hidden' && !isMine) { return false; }
      if (opt.board && p.board !== opt.board) { return false; }
      if (opt.tag && (p.tags || []).indexOf(opt.tag) < 0) { return false; }
      if (mine && !isMine) { return false; }
      if (keyword) {
        var hay = [p.title || '', p.content || '', (p.tags || []).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(keyword) < 0) { return false; }
      }
      return true;
    });

    var sort = opt.sort || 'latest';
    list.sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) { return a.pinned ? -1 : 1; }   // 置顶恒在最前
      if (sort === 'hot') { return hotScore(b) - hotScore(a); }
      if (sort === 'replies') {
        return (b.replyCount || 0) - (a.replyCount || 0) ||
               (b.createdAt || 0) - (a.createdAt || 0);
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return list;
  }

  /** 取单条帖子（不过滤状态，由调用方决定如何展示） */
  function getPost(id) {
    if (!id) { return null; }
    try { return PHR.db.posts.byId(id); } catch (e) { return null; }
  }

  /** 取某帖的全部回复（已删除的回复不返回；按时间正序，便于阅读） */
  function getReplies(postId) {
    try {
      var list = PHR.db.replies.where(function (r) {
        return r && r.postId === postId && r.status !== 'removed';
      });
      return U.sortBy(list, 'createdAt', false).map(function (r) {
        return PHR.models.localize(r, ['content', 'alias']);
      });
    } catch (e) { return []; }
  }

  /** 已点赞的帖子 id 数组 */
  function likedIds(userId) {
    var uid = userId || (currentUser() || {}).id || '';
    return readLikes(uid);
  }

  function isLiked(postId, userId) { return likedIds(userId).indexOf(postId) >= 0; }

  /**
   * 匿名展示规则：默认匿名（只显示别名），作者本人浏览自己的内容时额外标记。
   * @returns {{name:string, isMine:boolean, anonymous:boolean}}
   */
  function authorLabel(row, viewerUserId) {
    row = row || {};
    var isMine = !!(row.userId && viewerUserId && row.userId === viewerUserId);
    var anon = row.anonymous !== false;
    var name = anon ? (row.alias || PHR.t('community.anonymousUser', '匿名用户'))
                    : (userName(row.userId) || row.alias || PHR.t('community.user', '用户'));
    return { name: name, isMine: isMine, anonymous: anon };
  }

  /** 社群概览：给页面顶部小统计用 */
  function overview() {
    var visible = posts().filter(function (p) { return p && p.status !== 'removed'; });
    var replyCount = 0;
    try {
      replyCount = PHR.db.replies.count(function (r) { return r && r.status !== 'removed'; });
    } catch (e) { replyCount = 0; }
    return {
      posts: visible.length,
      replies: replyCount,
      likes: U.sum(visible, 'likes')
    };
  }

  /* ================================================================== *
   * 三、写操作
   * ================================================================== */

  /**
   * 发布主帖。
   * @param {object} input { board, title, content, tags, anonymous }
   * @param {object} user  当前用户
   * @returns {{ok:boolean, post?:object, warning?:string, message?:string, hits?:Array}}
   */
  function createPost(input, user) {
    input = input || {};
    if (!user || !user.id) { return { ok: false, message: PHR.t('community.err.loginToPost', '请先登录后再发布内容') }; }

    var title = PHR.security.sanitizeText(input.title, 60);
    var content = PHR.security.sanitizeText(input.content, 2000);
    var tags = normalizeTags(input.tags);

    if (title.length < 4) { return { ok: false, message: PHR.t('community.err.titleTooShort', '标题至少 4 个字，让别人一眼看懂你想聊什么') }; }
    if (content.length < 10) { return { ok: false, message: PHR.t('community.err.contentTooShort', '正文至少 10 个字，把情况说清楚更容易得到回应') }; }

    var board = (community.topics && community.topics.get(input.board)) ? input.board : 'general';

    // 发布前审核：标题、正文、标签一起送检
    var verdict = verdictOf([title, content, tags.join(' ')].join('\n'));
    if (verdict.level === 'block') {
      return {
        ok: false,
        blocked: true,
        hits: verdict.hits,
        message: PHR.t('community.err.blockedPost',
          '内容包含平台禁止发布的医疗广告或敏感表述（{words}），请修改后再发布。如需交流治疗经验，请写明"请遵医嘱"。',
          { words: verdict.hits.slice(0, 3).join(PHR.t('community.listSep', '、')) })
      };
    }

    var saved = PHR.db.posts.insert(PHR.models.post.create({
      userId: user.id,
      board: board,
      title: title,
      content: content,
      anonymous: input.anonymous !== false,
      tags: tags
    }));

    auditLog({
      userId: user.id,
      actor: user.displayName || user.username || PHR.t('community.actorSelf', '本人'),
      actorType: 'user',
      action: 'community.post',
      targetType: 'post',
      targetId: saved.id,
      targetName: saved.title,
      result: 'success',
      detail: PHR.t('community.audit.posted', '在「{board}」板块{anon}发布内容', {
        board: D.nameOf(D.communityBoard, board),
        anon: saved.anonymous ? PHR.t('community.anonWord', '匿名') : PHR.t('community.realWord', '实名')
      })
    });

    return {
      ok: true,
      post: saved,
      warning: verdict.level === 'warn'
        ? PHR.t('community.warn.softAdvice',
            '内容中的「{words}」容易被病友当成医疗建议，已发布，但建议补充"请以医生意见为准"。',
            { words: verdict.hits.slice(0, 3).join(PHR.t('community.listSep', '、')) })
        : null
    };
  }

  /**
   * 回复某个帖子。
   * @param {string} postId
   * @param {string} content
   * @param {object} user
   * @param {object} [opt] { anonymous }
   * @returns {{ok:boolean, reply?:object, replyCount?:number, warning?:string, message?:string}}
   */
  function createReply(postId, content, user, opt) {
    opt = opt || {};
    if (!user || !user.id) { return { ok: false, message: PHR.t('community.err.loginToReply', '请先登录后再回复') }; }

    var post = getPost(postId);
    if (!post || post.status === 'removed') { return { ok: false, message: PHR.t('community.err.postMissing', '该帖子不存在或已被删除') }; }
    if (post.status === 'hidden') { return { ok: false, message: PHR.t('community.err.postUnderReview', '该帖子正在人工复核中，暂时无法回复') }; }

    var text = PHR.security.sanitizeText(content, 1000);
    if (text.length < 2) { return { ok: false, message: PHR.t('community.err.replyTooShort', '回复内容太短了') }; }

    var verdict = verdictOf(text);
    if (verdict.level === 'block') {
      return {
        ok: false,
        blocked: true,
        hits: verdict.hits,
        message: PHR.t('community.err.blockedReply',
          '回复包含平台禁止发布的医疗广告或敏感表述（{words}），请修改后再发送。',
          { words: verdict.hits.slice(0, 3).join(PHR.t('community.listSep', '、')) })
      };
    }

    // 楼主回复时沿用主帖别名，读者能看出"这是楼主在统一回复"
    var isAuthor = !!(post.userId && post.userId === user.id);
    var saved = PHR.db.replies.insert(PHR.models.reply.create({
      postId: postId,
      userId: user.id,
      content: text,
      anonymous: opt.anonymous !== false,
      alias: isAuthor ? post.alias : PHR.models.post.randomAlias(),
      isAuthor: isAuthor
    }));

    var count = updateReplyCount(postId);

    auditLog({
      userId: user.id,
      actor: user.displayName || user.username || PHR.t('community.actorSelf', '本人'),
      actorType: 'user',
      action: 'community.reply',
      targetType: 'post',
      targetId: postId,
      targetName: post.title,
      result: 'success',
      detail: PHR.t('community.audit.replied', '回复了帖子《{title}》', { title: U.truncate(post.title, 30) })
    });

    return {
      ok: true,
      reply: saved,
      replyCount: count,
      warning: verdict.level === 'warn'
        ? PHR.t('community.warn.replySoftAdvice',
            '回复中的「{words}」属于需要谨慎对待的表述，已发送。',
            { words: verdict.hits.slice(0, 3).join(PHR.t('community.listSep', '、')) })
        : null
    };
  }

  /**
   * 点赞 / 取消点赞（同一用户对同一帖子只记一次）。
   * @param {string} postId
   * @param {string} [userId] 缺省取当前登录用户
   * @returns {{ok:boolean, liked?:boolean, likes?:number, message?:string}}
   */
  function toggleLike(postId, userId) {
    var uid = userId || (currentUser() || {}).id || '';
    var post = getPost(postId);
    if (!post) { return { ok: false, message: PHR.t('community.err.postNotFound', '帖子不存在') }; }

    var list = readLikes(uid);
    var idx = list.indexOf(postId);
    var liked;
    if (idx >= 0) { list.splice(idx, 1); liked = false; }
    else { list.push(postId); liked = true; }

    try { PHR.store.write(likeKey(uid), list); } catch (e) { PHR.warn(PHR.t('community.warn.likeWriteFail', '点赞记录写入失败'), e); }

    var likes = Math.max(0, (post.likes || 0) + (liked ? 1 : -1));
    PHR.db.posts.update(postId, { likes: likes });
    return { ok: true, liked: liked, likes: likes };
  }

  /**
   * 删除（下架）帖子。作者本人删除或平台复核删除共用本方法。
   * @param {string} id
   * @param {string} [reason]
   */
  function removePost(id, reason) {
    var post = getPost(id);
    if (!post) { return { ok: false, message: PHR.t('community.err.postNotFound', '帖子不存在') }; }

    var reasonText = String(reason || PHR.t('community.removeByPublisher', '发布者本人删除'));
    var m = moderation();
    if (m && typeof m.setStatus === 'function') { m.setStatus(id, 'removed', reasonText); }
    else { PHR.db.posts.update(id, { status: 'removed', statusReason: reasonText }); }

    var user = currentUser();
    auditLog({
      userId: user ? user.id : post.userId,
      actor: user ? (user.displayName || user.username) : PHR.t('community.actorSelf', '本人'),
      actorType: 'user',
      action: 'community.remove',
      targetType: 'post',
      targetId: id,
      targetName: post.title,
      result: 'success',
      detail: reasonText
    });
    return { ok: true };
  }

  /**
   * 重算并回写某帖的回复数（回复新增 / 删除后调用）。
   * @returns {number} 最新回复数
   */
  function updateReplyCount(postId) {
    var count = getReplies(postId).length;
    try { PHR.db.posts.update(postId, { replyCount: count }); } catch (e) { /* 帖子可能已删除 */ }
    return count;
  }

  /* ================================================================== *
   * 四、挂载
   * ================================================================== */
  community.service = {
    // 查询
    listPosts: listPosts,
    getPost: getPost,
    getReplies: getReplies,
    likedIds: likedIds,
    isLiked: isLiked,
    authorLabel: authorLabel,
    overview: overview,
    // 写入
    createPost: createPost,
    createReply: createReply,
    toggleLike: toggleLike,
    removePost: removePost,
    updateReplyCount: updateReplyCount,
    // 附加小工具（视图层复用，避免各自判断登录态）
    currentUser: currentUser,
    normalizeTags: normalizeTags
  };

})(window.PHR);
