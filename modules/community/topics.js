/**
 * ============================================================================
 * 文件：modules/community/topics.js
 * 层：业务模块层（患者社群 —— 模块 7）
 * 职责：板块与话题工具。把"社群有哪些板块、每个板块有多少内容、大家在聊什么
 *      标签、给当前用户推荐哪些帖子"这类只读统计逻辑集中在一处，
 *      避免视图层和业务服务各自算一遍口径不一致。
 * 依赖：core/namespace.js、core/dict.js（PHR.dict.communityBoard）、core/utils.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  var community = PHR.community = PHR.community || {};

  /** 取出全部帖子（仓储不可用时退化为空数组，保证页面不白屏） */
  function allPosts() {
    try {
      /* 标题 / 正文 / 别名是种子文本，按当前语言解析。
         ⚠️ tags 不解析：它同时是筛选键（见 community.view 的 tagLabel）。 */
      return (PHR.db.posts.all() || []).map(function (p) {
        return PHR.models.localize(p, ['title', 'content', 'alias']);
      });
    } catch (e) { return []; }
  }

  /** 参与统计的帖子：被删除或被隐藏的内容不计入热度 */
  function countable(p) {
    return !!p && p.status !== 'removed' && p.status !== 'hidden';
  }

  /**
   * 板块展示名：走字典词条（core/i18n/en-US.js 的 dict.communityBoard.*）。
   * 板块的中文名直接写在 core/dict.js 里，若原样取用则在英文界面仍是中文，
   * 因此统一经 PHR.i18n.dictName 取名 —— 英文词条存在用英文，缺失回退中文原文。
   * 注意：板块 key（'general' 等）是内部标识，绝不翻译。
   */
  function boardName(b) {
    return (PHR.i18n && PHR.i18n.dictName)
      ? PHR.i18n.dictName('communityBoard', b.key, b.name)
      : b.name;
  }

  /** 板块对象的浅拷贝（只把 name 换成当前语言的展示名，key/icon/desc 原样保留） */
  function localized(b) {
    return { key: b.key, name: boardName(b), icon: b.icon, desc: b.desc };
  }

  var topics = {

    /** 板块清单（唯一来源：core/dict.js → PHR.dict.communityBoard） */
    list: function () {
      return (D.communityBoard || []).map(localized);
    },

    /** 取单个板块，找不到返回 null */
    get: function (key) {
      var b = (D.communityBoard || []).filter(function (x) { return x.key === key; })[0] || null;
      return b ? localized(b) : null;
    },

    /** 板块名（找不到时回退到「综合交流」，保证界面不出现空白标题） */
    name: function (key) {
      var b = topics.get(key);
      return b ? b.name : D.nameOf(D.communityBoard, 'general');
    },

    /**
     * 每个板块的帖子数。
     * @returns {Array<{key,name,icon,count}>}
     */
    stats: function () {
      var posts = allPosts().filter(countable);
      return topics.list().map(function (b) {
        return {
          key: b.key,
          name: b.name,
          icon: b.icon,
          count: posts.filter(function (p) { return p.board === b.key; }).length
        };
      });
    },

    /**
     * 统计全部帖子的标签出现频次，返回前 N 个热门标签。
     * @param {number} [limit=12]
     * @returns {Array<{tag,count}>} 按次数倒序
     */
    hotTags: function (limit) {
      var counter = {};
      allPosts().filter(countable).forEach(function (p) {
        (p.tags || []).forEach(function (t) {
          t = String(t || '').trim();
          if (t) { counter[t] = (counter[t] || 0) + 1; }
        });
      });
      return Object.keys(counter)
        .map(function (t) { return { tag: t, count: counter[t] }; })
        .sort(function (a, b) {
          return b.count - a.count || (a.tag < b.tag ? -1 : 1);
        })
        .slice(0, limit || 12);
    },

    /**
     * 简单的"猜你喜欢"：给帖子打分后取前 N 条。
     * 打分口径：
     *   板块热度（该板块帖子数 × 0.6）
     * + 标签重合度（与本人历史发帖标签的重合个数 × 4，重合一词权重最高）
     * + 互动量（点赞 × 0.15 + 回复 × 0.3）
     * + 新鲜度（7 天内每天 +1，越新分越高）
     * "未读"在本模块中定义为"不是本人发布的帖子"，并降权处理已点过赞的内容。
     * @param {string} viewerUserId 当前浏览者
     * @param {number} [limit=5]
     * @returns {Array} 帖子数组（附带 recommendScore 字段）
     */
    recommend: function (viewerUserId, limit) {
      var posts = allPosts().filter(countable);
      var byBoard = U.groupBy(posts, 'board');
      var myTags = {};
      posts.filter(function (p) {
        return viewerUserId && p.userId === viewerUserId;
      }).forEach(function (p) {
        (p.tags || []).forEach(function (t) { myTags[t] = (myTags[t] || 0) + 1; });
      });

      var scored = posts
        .filter(function (p) { return !(viewerUserId && p.userId === viewerUserId); })
        .map(function (p) {
          var boardHeat = (byBoard[p.board] || []).length;
          var overlap = (p.tags || []).filter(function (t) { return myTags[t]; }).length;
          var fresh = Math.max(0, 7 - Math.floor((Date.now() - (p.createdAt || 0)) / 86400000));
          var score = boardHeat * 0.6 + overlap * 4 +
                      (p.likes || 0) * 0.15 + (p.replyCount || 0) * 0.3 + fresh;
          return { post: p, score: score };
        })
        .sort(function (a, b) { return b.score - a.score; });

      return scored.slice(0, limit || 5).map(function (x) {
        x.post.recommendScore = Math.round(x.score * 10) / 10;
        return x.post;
      });
    }
  };

  community.topics = topics;

})(window.PHR);
