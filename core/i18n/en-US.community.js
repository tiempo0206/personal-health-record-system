/**
 * 文件：core/i18n/en-US.community.js
 * 层：核心基础设施层（国际化 · 英文词条 · 患者社群模块）
 * 职责：登记患者社群模块中文文案对应的英文词条（社群主页与帖子详情、发帖回帖
 *      校验提示、内容审核拦截与举报、免责声明、板块与话题展示文案）。
 * 依赖：core/i18n/i18n.js
 *
 * 口径说明：
 *   · 病友口吻。这里是患者之间说话的地方，不是客服工单系统 ——
 *     "Anonymous" 而不是 "The user has chosen to remain anonymous"。
 *   · 免责声明与举报文案克制、准确、不弱化："不能替代医生建议"
 *     译作 "Not a substitute for medical advice"，不做软化处理。
 *   · 拦截提示说清"为什么被拦"，不指责用户。
 *   · 板块 key（general / chronic …）与审核词库的关键词、状态值
 *     （normal / hidden / removed）是内部标识，**不在此登记**。
 *   · 板块名走既有词条 dict.communityBoard.*（见 core/i18n/en-US.js）。
 */
(function (PHR) {
  'use strict';
  if (!PHR.i18n) { return; }
  PHR.i18n.register('en-US', {

    /* ---------- 模块标题（面包屑 / 导航用，须随语言切换） ---------- */
    'module.community.title': 'Community',
    'module.community.desc': 'Anonymously share visit experiences, medication notes and emotional support.',

    /* ---------- 社群主页 ---------- */
    'community.head.desc': 'Share your visits, your medication experiences and the hard days — anonymously, and cheer each other on.',
    'community.searchPlaceholder': 'Search titles, posts or tags',
    'community.sortLabel': 'Sort by',
    'community.sort.latest': 'Newest',
    'community.sort.hot': 'Most liked',
    'community.sort.replies': 'Most replies',
    'community.btn.minePosts': '👤 My posts',
    'community.btn.newPost': '✍️ New post',
    'community.board.all': '💬 All ({n})',
    'community.hotTags': '🔥 Popular tags',
    'community.clearFilter': 'Reset filters',
    'community.tag.all': 'All tags',
    'community.tag.empty': 'No tags yet. Add a couple when you post so the right people find it.',

    /* ---------- 猜你喜欢 ---------- */
    'community.recommend': '🔎 You might like',
    'community.recommendHint': 'Picked from busy boards and the tags you use',
    'community.recStats': '{likes} likes · {replies} replies',
    'community.replyCount': '💬 {n} replies',

    /* ---------- 免责声明 ---------- */
    'community.disclaimer.title': 'Not a substitute for medical advice',
    'community.disclaimer.body': 'Everything here is one patient\'s own experience — it cannot replace a doctor\'s diagnosis, prescription or follow-up. If you feel unwell, see a doctor. We screen medical advertising and risky wording before posting, and please don\'t share real names, admission numbers or phone numbers.',
    'community.moderation.disclaimer': 'Moderation here uses local keyword filtering: it only catches obvious medical advertising and risky wording, and does not mean the content has been professionally reviewed. For any health decision, go by your doctor\'s in-person diagnosis.',

    /* ---------- 帖子卡片 ---------- */
    'community.pinned': '📌 Pinned',
    'community.anon': 'Anonymous',
    'community.anonPost': 'Posted anonymously',
    'community.anonymousUser': 'Anonymous',
    'community.anonInitial': 'A',
    'community.user': 'User',
    'community.badge.mine': 'You',
    'community.badge.realName': 'Real name',
    'community.op': 'Original poster',
    'community.action.report': '🚩 Report',
    'community.action.remove': 'Delete post',
    'community.hidden.title': 'Awaiting review',
    'community.hidden.body': 'This post was reported several times and is only visible to you right now.',
    'community.hidden.bodyDetail': 'This post was reported several times and is only visible to you. A moderator will decide whether to restore it.',

    /* ---------- 空状态 ---------- */
    'community.empty.title': 'It\'s quiet here',
    'community.empty.mineTitle': 'You haven\'t posted anything yet',
    'community.empty.hint': 'Talk about a visit, a change to your diet, or just how you have been feeling — others will see it and reply.',
    'community.empty.action': 'Write a post',

    /* ---------- 帖子详情 ---------- */
    'community.postView.title': 'Post',
    'community.back': '← Back to community',
    'community.notFound': 'This post does not exist or has been deleted',
    'community.notFoundHint': 'The author may have deleted it, or it was taken down for breaking community rules.',
    'community.owner': 'You wrote this post',
    'community.medAdvice': 'Ask your doctor for medication advice',
    'community.replies': 'All replies',
    'community.repliesHint': 'Replies are anonymous too — please be kind',
    'community.reply.label': 'Write a reply',
    'community.reply.placeholder': 'Share your experience, or just say "same here".',
    'community.reply.hint': 'Please don\'t leave contact details, promote products, or talk anyone out of seeing a doctor.',
    'community.reply.anon': 'Reply anonymously',
    'community.reply.send': 'Send reply',
    'community.reply.ok': 'Reply sent',
    'community.reply.empty': 'No replies yet — say something.',
    'community.replyUnit': '{n} replies',

    /* ---------- 发帖弹窗 ---------- */
    'community.compose.modalTitle': 'New post',
    'community.compose.board': 'Board',
    'community.compose.title': 'Title',
    'community.compose.titlePlaceholder': 'Sum up what you want to talk about',
    'community.compose.content': 'Post',
    'community.compose.contentPlaceholder': 'Tell us what\'s going on, what you\'ve tried and how things are now. Please don\'t leave contact details.',
    'community.compose.hint': 'We screen medical advertising and risky wording; if your post mentions medication, please add "follow your doctor\'s advice".',
    'community.compose.tags': 'Tags',
    'community.compose.tagsPlaceholder': 'Comma-separated, up to 5 — for example: hypertension, diet',
    'community.compose.anon': 'Post anonymously (only your alias shows, not your account name)',
    'community.compose.submit': 'Post',
    'community.compose.fail': 'Couldn\'t post',
    'community.compose.ok': 'Posted',

    /* ---------- 删除帖子 ---------- */
    'community.confirmDelete.message': 'Delete "{title}"?',
    'community.confirmDelete.detail': 'The post and its replies will no longer be visible to others, but the access log keeps a record of this action.',
    'community.deleted': 'Post deleted',
    'community.removeByAuthor': 'Deleted by the author',
    'community.removeByPublisher': 'Deleted by the author',

    /* ---------- 发帖 / 回帖的校验提示 ---------- */
    'community.err.loginToPost': 'Please sign in before posting',
    'community.err.loginToReply': 'Please sign in before replying',
    'community.err.titleTooShort': 'Titles need at least 4 characters, so people can tell at a glance what this is about',
    'community.err.contentTooShort': 'The post needs at least 10 characters — a clear story gets more replies',
    'community.err.replyTooShort': 'That reply is too short',
    'community.err.postNotFound': 'This post does not exist',
    'community.err.postMissing': 'This post does not exist or has been deleted',
    'community.err.postUnderReview': 'This post is under review and cannot be replied to right now',
    'community.err.blockedPost': 'Your post contains medical advertising or risky wording that we do not allow ({words}). Please revise it and post again. If you are sharing treatment experience, add "follow your doctor\'s advice".',
    'community.err.blockedReply': 'Your reply contains medical advertising or risky wording that we do not allow ({words}). Please revise it and send again.',
    'community.warn.softAdvice': 'Other patients may read “{words}” as medical advice. Your post is live, but consider adding "follow your doctor\'s advice".',
    'community.warn.replySoftAdvice': 'Your reply contains “{words}”, which patients should treat with care. It has been sent.',
    'community.listSep': ', ',

    /* ---------- 举报 ---------- */
    'community.report.title': 'Report this post',
    'community.report.reason': 'Reason',
    'community.report.note': 'Anything to add (optional)',
    'community.report.notePlaceholder': 'For example: keeps posting the same clinic\'s contact details',
    'community.report.submit': 'Submit report',
    'community.report.done': 'Report received',
    'community.report.doneDetail': 'A moderator will review it. Thanks for looking out for the community.',
    'community.reportReason.ad': 'Medical advertising / promotion',
    'community.reportReason.fake': 'False or misleading medical information',
    'community.reportReason.abuse': 'Insults / attacks on others',
    'community.reportReason.privacy': 'Sharing someone else\'s private information',
    'community.reportReason.other': 'Something else',

    /* ---------- 审核拦截：说明与自动隐藏 ---------- */
    'community.explain.blocked': 'This content contains wording the platform does not allow: ',
    'community.explain.warned': 'This content contains wording that needs a caution: ',
    'community.explain.why': ' ({why})',
    'community.moderation.autoHideReason': 'Reported {n} times — awaiting review',

    /* ---------- 审核拦截：命中原因（与 moderation.js 的 RULES 一一对应） ---------- */
    'community.rule.packageCure': 'Promising to cure everything is false advertising',
    'community.rule.radicalCure': 'Almost no condition can be "cured for good" — wording like this misleads other patients',
    'community.rule.totalCure': 'Only a doctor can call a condition cured, based on test results',
    'community.rule.instantCure': 'False promise of a cure',
    'community.rule.neverRelapse': 'False promise of a cure',
    'community.rule.stopMeds': 'Telling someone to stop their medication is seriously unsafe',
    'community.rule.skipHospital': 'Talking someone out of proper medical care is seriously unsafe',
    'community.rule.hospitalScam': 'Smearing legitimate hospitals can delay someone\'s treatment',
    'community.rule.cureRateFull': 'False promise of a cure',
    'community.rule.alwaysEffective': 'False promise of a cure',
    'community.rule.onePill': 'Exaggerated advertising pitch',
    'community.rule.miracleDrug': 'Pushing a "miracle drug" is classic fake medical advertising',
    'community.rule.specialDrug': 'Prescription drugs must not be recommended or traded privately',
    'community.rule.ancestralRecipe': 'Unapproved "secret recipes" cannot be guaranteed safe',
    'community.rule.folkCure': 'Replacing proper treatment with folk remedies is risky',
    'community.rule.cancerFormula': 'Cancer treatment must be guided by a doctor',
    'community.rule.noSideEffect': '"No side effects" is false advertising — every drug can cause adverse reactions',
    'community.rule.supplementCure': 'Supplements cannot replace medicine or treatment',
    'community.rule.refundPitch': 'A "money-back guarantee" is a sales pitch',
    'community.rule.worksFirstTry': 'Exaggerated advertising pitch',
    'community.rule.addWechat': 'Driving people to a private chat to trade medicine is not allowed here',
    'community.rule.addMyWechat': 'Driving people to a private chat to trade medicine is not allowed here',
    'community.rule.dmSell': 'Buying and selling medicine is not allowed here',
    'community.rule.dmBuy': 'Buying and selling medicine is not allowed here',
    'community.rule.wechatSeller': 'No reseller promotion',
    'community.rule.drugSourcing': 'No sourcing medicine or overseas prescription drugs for others',
    'community.rule.cheapDrugs': 'No reselling medicine',
    'community.rule.qrBuy': 'No purchase links or QR codes',
    'community.rule.contactToBuy': 'No contact details for sales',
    'community.rule.folkRemedy': 'Folk remedies are unproven — please also add "follow your doctor\'s advice"',
    'community.rule.secretRemedy': 'Secret recipes are unapproved and their origin cannot be verified',
    'community.rule.homeRemedy': 'Home remedies are unproven — please be careful',
    'community.rule.selfIncreaseDose': 'Raising your dose on your own is risky',
    'community.rule.selfReduceDose': 'Dose changes should be decided by a doctor',
    'community.rule.saidOnline': 'Information from an unknown source needs checking',
    'community.rule.heardItCures': 'Information from an unknown source needs checking',
    'community.rule.ignoreDoctor': 'You should not lead others to go against medical advice',

    /* ---------- 模块内部警告 ---------- */
    'community.warn.reportWriteFail': 'Failed to save report',
    'community.warn.unknownStatus': 'Unknown community content status: {status}',
    'community.warn.auditWriteFail': 'Failed to write community audit log',
    'community.warn.likeWriteFail': 'Failed to save like',

    /* ---------- 审计日志（社群动作的 detail / actor 文案） ---------- */
    'community.audit.posted': 'Posted {anon} in “{board}”',
    'community.audit.replied': 'Replied to “{title}”',
    'community.anonWord': 'anonymously',
    'community.realWord': 'under a real name',
    'community.actorSelf': 'You'

  });
})(window.PHR);
