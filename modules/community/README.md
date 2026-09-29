# 患者社群（模块 7）

本文件夹实现 **个人健康档案管理系统（PHR）** 的第 7 个业务模块 —— **患者社群**。
它为患者（及家属）提供一个**匿名、互助、可被审核**的交流空间：按板块发帖、
回复、点赞、打标签、举报不当内容，并给出"猜你喜欢"的简单推荐。

> ⚠️ **免责声明**：社群中的全部内容都来自病友的个人经验，**不能替代医生的诊断、
> 处方与随访**。任何涉及用药、停药的表述都必须在医生指导下决定。
> 本模块的审核是**本地关键词演示级**能力，真实产品必须改为服务端审核 + 人工复核。

---

## 一、目录结构

```
modules/community/
├── README.md                 本文件：模块说明与对外契约
├── topics.js                 板块与话题工具（只读统计）
├── moderation.js             内容审核：敏感词库 / 举报 / 状态流转
├── community.service.js      业务服务：查询 + 写操作 + 审核 + 审计
└── community.view.js         视图层：注册两个页面
```

## 二、每个文件做什么

| 文件 | 挂载点 | 职责 | 是否写数据 |
| --- | --- | --- | --- |
| `topics.js` | `PHR.community.topics` | 板块清单、每板块帖子数、热门标签、猜你喜欢打分 | 否（只读） |
| `moderation.js` | `PHR.community.moderation` | 医疗广告/敏感词词库、命中检测、打码、举报记录、帖子状态流转 | 是（`PHR.store`） |
| `community.service.js` | `PHR.community.service` | 列表筛选排序、发帖/回帖/点赞/删除、审核调用、审计日志、匿名展示规则 | 是（`posts` / `replies` / `PHR.store`） |
| `community.view.js` | `PHR.registerView('community')`、`PHR.registerView('community-post')` | 页面渲染与交互 | 否（只调 service） |

另外 `community.service.js` 在加载时会执行一次
`PHR.registerModule('community', { title:'患者社群', icon:'💬', order:7 })`，
供左侧导航分组与顶部面包屑使用（已做防重复注册判断）。

## 三、对外暴露的 API

### `PHR.community.topics`

| 方法 | 说明 |
| --- | --- |
| `list()` | 返回板块清单（直接来自 `PHR.dict.communityBoard`） |
| `get(key)` | 取单个板块对象，找不到返回 `null` |
| `name(key)` | 取板块名（回退「综合交流」） |
| `stats()` | `[{ key, name, icon, count }]`，每个板块的帖子数 |
| `hotTags(limit)` | 统计全部帖子标签频次，返回前 N 个 `[{ tag, count }]` |
| `recommend(viewerUserId, limit)` | 按板块热度 + 标签重合度 + 互动量 + 新鲜度打分，返回帖子数组（附带 `recommendScore`） |

### `PHR.community.moderation`

| 方法 | 说明 |
| --- | --- |
| `check(text)` | 返回 `{ ok, hits:[命中词], level:'ok'\|'warn'\|'block', reasons:[{word,level,why}] }` |
| `mask(text)` | 把命中词替换为 `***` |
| `explain(verdict)` | 生成一句给用户看的解释（命中了什么、为什么拦） |
| `report(postId, reason, opt)` | 新增一条举报记录，返回该记录；同一帖子被举报 ≥3 次会自动置为 `hidden` |
| `reports()` | 全部举报记录（按时间倒序） |
| `reasons()` | 举报原因候选项 `[{key,name}]`（供表单下拉） |
| `setStatus(postId, status, reason)` | 标记帖子为 `normal` / `hidden` / `removed`，返回更新后的帖子 |
| `statusOf(postId)` | 读取帖子当前状态 |
| `rules` / `STATUS` / `autoHideThreshold` / `disclaimer` | 词库、状态枚举、自动隐藏阈值、审核能力自述 |

**词库分两档**（共 37 条）：
- `block`：虚假疗效承诺（包治百病、根治、永不复发…）、神药偏方推销（神药、祖传秘方、
  无效退款…）、私域引流与药品交易（加微信、私聊卖、微商、代购…）→ **直接拒绝发布**。
- `warn`：偏方、秘方、自己加大剂量、别听医生的… → **允许发布但提示用户**，留给人工复核。

拦截这些内容的理由写在 `moderation.js` 的文件头注释里，核心是：
**防止患者被虚假医疗信息误导，避免延误甚至放弃正规治疗。**

### `PHR.community.service`

| 方法 | 说明 |
| --- | --- |
| `listPosts({board, keyword, tag, sort, onlyMine, userId})` | 过滤 + 排序后的帖子数组；`sort` 支持 `latest` / `hot` / `replies`；`removed` 恒不可见，`hidden` 仅作者本人可见 |
| `getPost(id)` | 取单条帖子 |
| `getReplies(postId)` | 取某帖回复（排除已删除，按时间正序） |
| `likedIds(userId)` / `isLiked(postId, userId)` | 当前用户点赞过的帖子 |
| `authorLabel(row, viewerUserId)` | 匿名展示规则：`{ name, isMine, anonymous }` |
| `overview()` | 概览统计 `{ posts, replies, likes }` |
| `createPost(input, user)` | 发帖。返回 `{ok:false, message}` 或 `{ok:true, post, warning}` |
| `createReply(postId, content, user, opt)` | 回帖。同上（`opt.anonymous`） |
| `toggleLike(postId, userId)` | 点赞 / 取消点赞，返回 `{ok, liked, likes}` |
| `removePost(id, reason)` | 下架帖子（作者本人删除或平台复核删除） |
| `updateReplyCount(postId)` | 重算并回写回复数 |
| `currentUser()` / `normalizeTags(input)` | 便捷工具（视图层复用） |

**发帖 / 回帖的审核与匿名规则**
1. 先用 `PHR.security.sanitizeText()` 去掉标签、控制字符并截断；
2. 再调 `moderation.check()`：命中 `block` → 拒绝并返回 `{ok:false, message}`；
   命中 `warn` → 照常发布，但返回 `warning` 提示语；
3. 默认 `anonymous: true`，只显示 `alias`（如「向阳松树 27」）；作者本人浏览自己的
   帖子 / 回复时，视图层额外显示「我」标记；楼主回复自己的帖子沿用主帖别名并标「楼主」。

## 四、数据存在哪里

| 存储 | 键 / 集合 | 内容 |
| --- | --- | --- |
| `PHR.db.posts` | 集合 `posts`（前缀 `M`） | 主帖：`board / title / content / anonymous / alias / tags / likes / replyCount / status / pinned` |
| `PHR.db.replies` | 集合 `replies`（前缀 `N`） | 回复：`postId / content / anonymous / alias / isAuthor / status` |
| `PHR.store` | `community_reports` | 举报记录（`{id, postId, reason, note, reporterId, at, handled}`） |
| `PHR.store` | `community_likes_<userId>` | 该用户点赞过的帖子 id 数组（保证点赞可取消、换账号不串号） |
| `PHR.db.audits` | 集合 `audits` | `community.post` / `community.reply` / `community.remove` 三类审计日志 |

> `PHR.audit` 由 `modules/audit` 提供，脚本加载顺序不保证，因此本模块所有审计调用都写成
> `if (PHR.audit && PHR.audit.log) { PHR.audit.log({...}) }` 的防御式写法，审计模块缺失时静默跳过。

## 五、注册的视图路由

| 视图名 | 路由 | 是否出现在导航 | 页面内容 |
| --- | --- | --- | --- |
| `community` | `#/community` | 是（业务模块，`order: 7`） | 免责声明、板块切换（`.board-nav` + `.chip.clickable`）、搜索框、排序（`.segmented`）、发帖按钮、帖子列表（`.post-card`）、热门标签、猜你喜欢 |
| `community-post` | `#/community-post/<帖子id>` | 否（`nav:false`） | 帖子全文、回复列表（`.reply-item`）、回复输入框、举报 / 删除按钮、返回按钮、免责声明 |

首页支持带参进入：`#/community?board=chronic&tag=高血压&q=血压&sort=hot&onlyMine=1`。

## 六、加载顺序

1. `core/*`（`namespace.js` 必须最先）
2. `ui/components/*`、`ui/router.js`
3. `modules/community/topics.js` → `moderation.js` → `community.service.js` → `community.view.js`
4. `ui/shell.js`、启动脚本

文件之间**不依赖加载顺序**：跨文件调用（如 service 调 moderation）全部写成运行时
防御式取值，任何一个文件缺失都不会导致其它文件报错。

## 七、设计取舍（演示环境）

- **审核只做关键词**：可被绕过，仅用于演示"发布前拦截"这一交互，真实产品须走服务端。
- **别名由 `PHR.models.post.randomAlias()` 生成**：同一用户在不同帖子里的别名不同，
  这是"匿名优先"的取舍；如果要做到"匿名但可追踪同一人"，需要引入稳定匿名 id。
- **回复不做分页**：演示数据量小，直接一次性渲染；真实产品需要分页或游标加载。
- **`removed` 是软删除**：数据仍在集合里，仅界面不可见，便于审计追溯。
- **不新增任何 CSS 类**：全部复用 `views.css`「七、患者社群」与 `components.css` 中已有的
  `.board-nav / .post-card / .reply-item / .chip / .segmented / .act / .notice` 等类名，
  仅有少量 `style="min-width:220px"` 之类的行内微调。
