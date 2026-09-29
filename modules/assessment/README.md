# modules/assessment —— 心理测评模块（模块 9）

## 这个文件夹实现了什么

本文件夹实现**个人健康档案管理系统**的**第 9 个业务模块：心理测评**。

对应需求原文中的那句话：

> "第九是心理健康评估，可以用标准化的心理量表做自评，给出分级结果和应对建议。"

一句话概括本模块的定位：

**档案中心负责把身体的数据存下来，健康洞察负责把这些数据讲明白，
心理测评负责把"最近状态怎么样"这件说不清的事，变成一组可以对照、可以追踪的分数。**

它只做四件事：

1. **出题**：收录 7 份**公开发表的标准化筛查量表**，按主题分组；
2. **计分**：一份零特判的计分引擎，把作答换算成分数、维度分与分级；
3. **给建议**：把分数翻译成"今天能做 / 这周能做 / 建议找专业人士"三层动作；
4. **兜底**：一旦作答中出现自伤念头或落在高危区，**立即把求助渠道递到用户面前**。

它**不做什么**：不下诊断、不给药物、不贴标签、不把分数混进健康档案。

> ⚠️ 本模块的每一句结论性文案都经过同一道审查：
> **这句话会不会让一个正在难受的人更难受？**
> 所有分级文案使用「提示 / 建议关注」措辞，刻意不使用「你有抑郁症」这类句式 ——
> 给人贴标签本身就是一种伤害。

---

## 目录结构

```
modules/assessment/
├── README.md                   本文件
├── scales.js                   题库与切分点（模块内唯一的数据来源）
├── scoring.js                  计分引擎（零特判）+ 完整性校验 + 趋势比较
├── coping.js                   应对策略引擎（强度分档 × 三个时段 + 量表专属补充）
├── crisis.js                   危机识别与求助资源（三级判定 + 横幅 / 弹窗渲染）
├── report.js                   报告组装与三种输出（对象 / HTML / 纯文本）
├── assessment.service.js       会话生命周期：草稿、提交、入库、历史、医生可见性、自检
├── assessment.view.js          视图 `assessment`（量表目录 / 我的记录 / 趋势）
├── assessment-take.view.js     视图 `assessment-take`（知情同意 → 作答 → 提交）
├── assessment-report.view.js   视图 `assessment-report`（报告正文 + 仪表 + 导出 / 打印）
└── assessment-selftest.view.js 隐藏自检页（不进导航，把 selfTest() 的结果渲染成机器可读标记）
```

| 文件 | 职责 | 对外挂载点 | 行数级别 |
| --- | --- | --- | --- |
| `scales.js` | 7 份量表的题目、选项、维度、分级、切分点；免责声明常量 | `PHR.assessment.scales` | ~520 |
| `scoring.js` | 校验完整性、反向计分、线性换算、分级、维度分、趋势比较、后续推荐 | `PHR.assessment.scoring` | ~330 |
| `coping.js` | 强度分档、通用策略池、量表专属补充、维度针对性提示 | `PHR.assessment.coping` | ~280 |
| `crisis.js` | 三级危机识别、求助资源清单、横幅 / 弹窗 HTML、审计留痕 | `PHR.assessment.crisis` | ~285 |
| `report.js` | 报告对象组装、HTML 渲染、纯文本导出、摘要与徽章 | `PHR.assessment.report` | ~355 |
| `assessment.service.js` | 草稿读写、提交入库、历史 / 趋势、医生授权可见性、运行时自检 | `PHR.assessment.service`（并平铺到 `PHR.assessment`） | ~405 |
| `assessment.view.js` | 量表目录、我的测评记录表、跨时间趋势图、免责声明 | 视图 `assessment` | ~350 |
| `assessment-take.view.js` | 知情同意、逐题作答与草稿自动保存、提交与危机弹窗 | 视图 `assessment-take` | ~340 |
| `assessment-report.view.js` | 报告页装配：得分仪表、求助渠道、导出 / 打印、审计 | 视图 `assessment-report` | ~225 |
| `assessment-selftest.view.js` | 隐藏自检页：把 `selfTest()` 的用例渲染成 `data-ok` 标记，供 headless Chrome 验收 | 视图 `assessment-selftest` | ~130 |

---

## 注册的视图与路由

| 路由 | 视图名 | 说明 | 出现在导航 |
| --- | --- | --- | --- |
| `#/assessment` | `assessment` | 量表目录 + 我的测评记录 + 趋势 | ✅ order 9 |
| `#/assessment-take/<量表key>` | `assessment-take` | 填写测评（`nav:false`，从目录卡片进入） | ❌ |
| `#/assessment-report/<记录id>` | `assessment-report` | 测评报告（`nav:false`，从记录表或提交后进入） | ❌ |

三条路由都走 `ui/router.js` 的通用规则「`#/<视图名>/<参数1>`」，
不需要注册自定义路由。

另有一个**不进导航**的隐藏自检页 `#/assessment-selftest`
（`assessment-selftest.view.js`，`nav:false` + `requiresAuth:false`），
把 `PHR.assessment.selfTest()` 的全部断言渲染出来，
并在 DOM 上写出 `data-ok="true"` / `data-total="N"`，
供 `chrome --headless=new --dump-dom` 做端到端验收 ——
本项目没有测试框架，这是唯一能自动验证"计分有没有静默算错"的手段。

---

## 7 份量表总览

| key | 名称 | 主题 | 题数 | 计分方式 | 满分 | 分级档位 | 切分点来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `quick` | 快速心理筛查 | 筛查 | 5 | 0–3 频率计分 | 15 | 0–2 / 3–6 / 7–11 / 12–15 | PHQ-2 + GAD-2（各量表 2 条目简版）+ 睡眠条目 |
| `phq9` | 抑郁情绪自评 | 情绪 | 9 | 0–3 频率计分 | 27 | 4 / 9 / 14 / 19 / 27 | PHQ-9（Kroenke 等，2001） |
| `gad7` | 焦虑水平自评 | 情绪 | 7 | 0–3 频率计分 | 21 | 4 / 9 / 14 / 21 | GAD-7（Spitzer 等，2006） |
| `isi` | 睡眠状况自评 | 睡眠 | 7 | 0–4 严重程度计分；**第 4 题使用独立选项集**（0＝非常满意） | 28 | 7 / 14 / 21 / 28 | ISI 失眠严重指数（Bastien 等，2001） |
| `pss10` | 压力感知自评 | 压力 | 10 | 0–4 频率计分；**第 4/5/7/8 题反向计分** | 40 | 13 / 26 / 40 | PSS-10（Cohen 等，1983）**无临床切分点** |
| `who5` | 主观幸福感自评 | 积极心理 | 5 | 0–5 频率计分，**原始分 ×4 换算成百分制** | 100 | 27 / 49 / 67 / 100 | WHO-5 幸福感指数（WHO 欧洲区办事处，1998） |
| `cdrisc10` | 心理韧性自评 | 积极心理 | 10 | 0–4 符合程度计分 | 40 | 19 / 29 / 40 | CD-RISC-10（Campbell-Sills & Stein，2007）**无临床切分点** |

几条与"怎么读分数"直接相关的约定：

- **`higherIsBetter`**：`who5` / `cdrisc10` 是正向量表（分越高越好），其余四份是负向（分越低越好）。
  趋势比较（`scoring.compare`）会读这个字段，所以界面上**不能简单地把"下降"画成绿色**。
- **`noCutoff`**：`pss10` / `cdrisc10` 没有公认的临床切分点。标记后：
  界面不给它们上严重程度配色（徽章一律用中性灰、仪表一律用主题色），
  应对策略的强度被**强制封顶到 mild**，报告里显式注明"这些档位只是便于阅读的分段"。
- **关键条目**：`phq9` 第 9 题（自伤/自杀念头）标了 `critical: true`；
  `quick` 没有这样的条目，因此额外用 `crisisDimension` 按维度分补了一条危机通路。
- **线性换算**：`who5` 用 `transform: { factor: 4, max: 100 }` 声明，引擎按声明执行，没有 if。

---

## 对外 API

### `PHR.assessment.scales`（`scales.js`）

| 方法 | 说明 |
| --- | --- |
| `list()` / `ALL` | 全部量表定义（副本 / 原数组） |
| `get(key)` | 取单个量表，找不到返回 `null` |
| `nameOf(key)` / `itemCount(key)` / `maxOf(key)` | 名称 / 题数 / 满分 |
| `byTopic()` | 按主题分组，用于目录页：`[{topic, scales:[]}]` |
| `topicTone(topic)` | 主题 → 语气色（`primary/info/warn/accent/ok`） |
| `itemIds(key)` / `item(key, i)` / `optionsOf(key, i)` | 题号清单 / 单题定义 / 单题选项集 |
| `DISCLAIMER` / `DISCLAIMER_SHORT` | 免责声明（界面、报告、导出三处复用同一段文字） |

### `PHR.assessment.scoring`（`scoring.js`）

| 方法 | 说明 |
| --- | --- |
| `validate(scaleKey, answers)` | 完整性校验 → `{ok, missing[], answered, total, percent, reason}` |
| `score(scaleKey, answers)` | 计分 → `{raw, total, max, percent, level, dimensions[], items[], critical[], ...}` |
| `levelOf(scale, total)` | 按总分取分级（`levels` 按 `max` 升序取第一个满足的） |
| `labelOf` / `itemScore` / `maxOptionOf` | 选项文案 / 单题得分（含反向翻转）/ 单题满分 |
| `compare(prev, curr)` | 两次结果比较 → `{delta, direction, better, text}`（变化不足满分 5% 视为持平） |
| `trend(results)` | 一组历史 → `{count, enough, points[], best, worst, avg, text}` |
| `recommend(scaleKey, result)` | 快速筛查做完后，按维度分推荐做哪份完整量表 |

### `PHR.assessment.coping`（`coping.js`）

| 方法 | 说明 |
| --- | --- |
| `forResult(scaleKey, result)` | → `{intensity, immediate[], weekly[], professional[], dimensionTips[], note, noCutoff}` |
| `intensityOf(scaleKey, result)` | 把各量表自己的 `level.key` 映射到统一的四档强度 |
| `dimensionTips(scaleKey, result)` | 得分占比最高的两个维度的针对性提示 |
| `general()` / `POOL` / `SCALE_TIPS` | 通用策略池与量表专属补充 |

### `PHR.assessment.crisis`（`crisis.js`）

| 方法 | 说明 |
| --- | --- |
| `detect(scaleKey, result)` | → `{level:'none'\|'watch'\|'urgent', reasons[], headline, message, shouldBlock}` |
| `resourcesHtml({level})` | 求助渠道卡片 HTML（`urgent` 时包含 120 / 110） |
| `bannerHtml(scaleKey, result)` | 报告页 / 目录页顶部常驻横幅 |
| `modalBodyHtml(scaleKey, result)` | 提交后的弹窗内容 |
| `resources()` / `note` | 资源清单 / 免责与提醒 |

### `PHR.assessment.report`（`report.js`）

| 方法 | 说明 |
| --- | --- |
| `build(scaleKey, answers, opt)` | 组装报告对象（**不落库**） |
| `html(report, opt)` | 报告正文 HTML：危机横幅 + 分数区 + 得分分布 + 应对策略 + 后续推荐 + 逐题明细 + 免责声明 |
| `text(report)` | 纯文本（导出与打印用） |
| `summaryLine(report)` / `levelBadge(report)` | 一句话摘要 / 分级徽章 HTML |

### `PHR.assessment.service`（`assessment.service.js`，并平铺到 `PHR.assessment`）

| 方法 | 说明 |
| --- | --- |
| `all()` | 当前用户的全部测评（时间倒序）；**无登录身份时返回空数组** |
| `byId(id)` | 按 id 取，不属于本人时返回 `null` |
| `history(scaleKey)` / `latest(scaleKey)` / `trend(scaleKey)` | 某量表的历次 / 最近一次 / 趋势摘要 |
| `overview()` | 每个量表的最近结果 + 趋势，目录页用 |
| `stats()` | 份数 / 覆盖量表数 / 触发过危机提示的份数 |
| `draft(scaleKey)` / `saveDraft(scaleKey, answers)` / `clearDraft()` | 草稿读写（作答中断不丢进度） |
| `submit(scaleKey, answers)` | 计分 → 生成报告 → 入库 → 写审计 → `{ok, message, report, crisis}` |
| `remove(id)` | 删除一份测评（同时写审计） |
| `canView(row, consent)` / `forConsent(consent)` / `countFor(userId)` | 医生授权视角的可见性判定 |
| `selfTest()` | 计分正确性与安全断言的运行时自检 |

---

## 计分引擎的"零特判"约定

**`scoring.js` 里不出现任何一处量表 key 的字面量。**

```js
// ❌ 绝对不允许出现在 scoring.js 里
if (scaleKey === 'phq9' && answers[9] >= 2) { ... }
if (scaleKey === 'pss10' && [4, 5, 7, 8].indexOf(i) >= 0) { value = 4 - value; }

// ✅ 正确的做法：差异全部声明在 scales.js 的数据里，引擎只读声明
if (itemDef.reverse) { return maxOptionOf(scaleKey, itemDef.i) - v; }
var opts = itemDef.options || scale.options;
```

量表之间的**每一处差异**都必须能在 `scales.js` 里找到对应的声明字段：

| 差异 | 声明位置 |
| --- | --- |
| 反向计分 | 题目上的 `reverse: true`（PSS-10 第 4/5/7/8 题） |
| 单题选项不同 | 题目上的 `options`（ISI 第 4 题） |
| 线性换算 | 量表上的 `transform: { factor, max }`（WHO-5 的 ×4） |
| 分级切分点 | 量表上的 `levels[]`，按 `max` 升序取第一个满足 `total <= max` 的 |
| 维度构成 | 量表上的 `dimensions[]` |
| 危机阈值 | 量表上的 `crisisTotalAt` / `lowTotalAt` / `crisisDimension[]` |
| 关键条目 | 题目上的 `critical: true` |

这条约定带来的直接好处：**新增一份量表只需要往 `scales.js` 的 `SCALES` 数组里加一项，
引擎、报告、建议、危机识别与三个视图都不用改一行。**

同样的约定适用于视图层：`assessment.view.js` 里出现任何一个量表专属的 `if`，
都意味着引擎的零特判被绕过了，应当回到 `scales.js` 补一个声明字段。

自检 `PHR.assessment.service.selfTest()` 会把这套约定**跑一遍**：
反向计分、极值不变量（每个量表全选最低分必须为 0、全选最高分必须等于满分）、
ISI 第 4 题的独立选项集、WHO-5 的 ×4 换算、分级边界、危机分级、
以及四条**安全断言**（越权路径必须被堵死）。

---

## 危机干预的设计原则

### 1. 三级，而不是"有/无"

| 级别 | 触发条件 | 界面表现 |
| --- | --- | --- |
| `none` | 没有命中任何规则 | 不出现任何提示 |
| `watch` | 自伤条目选"好几天"；或总分进入高危区；或正向量表得分极低 | 报告页常驻黄色横幅 + 「📞 查看求助渠道」按钮 |
| `urgent` | 自伤条目选"一半以上的天数"或"几乎每天"；或关键维度分拿满 | 红色横幅 + 提交后弹出可关闭的求助弹窗（`shouldBlock: true`） |

### 2. 总分高 ≠ 急性危机

这两件事必须**分开走两条通路**：

- **自伤/自杀条目**（PHQ-9 第 9 题，`critical: true`）→ 才是危机通路；
- **总分落在高危区**（PHQ-9 ≥ 20）→ 只升级到 `watch`，给出的是"尽快就医"的强提示。

原因写在 `crisis.js` 的注释里：临床口径上，PHQ-9 总分 ≥ 20 的含义是
「抑郁症状负担重」，属于**严重程度**判断，**不等于"当下有危险"**。
把它当成急性危机处理，会给用户一个吓人且不准确的结论；
反过来，若只看总分，低总分但自伤条目高分的人又会被漏掉。
所以两条通路必须同时存在，各管各的。

同理：**分数低也不能排除问题**，所以系统永远不会说"你没有问题"。

### 3. 不贴标签

- 分级名称一律是「未见明显提示 / 轻度提示 / 中度提示 / 重度提示」，
  没有"你有抑郁症""你是高危人群"这类句式；
- 逐题明细里高亮的字样是「关键条目」，不是「危险题目」；
- 应对策略**绝不出现任何药物名称、剂量或治疗方案** —— 这是红线；
- `noCutoff` 量表（PSS-10 / CD-RISC-10）连严重程度配色都不给，
  避免凭空造出一个"你的心理韧性偏低"的结论。

### 4. 提示必须可关闭

提交后弹出的求助弹窗（`crisis.modalBodyHtml`）**刻意做成可关闭的普通弹窗**：
`closable: true`，按钮只有「我知道了」，没有"必须点确认才能继续"的强制流程，
也允许点背景或按 Esc 关闭。

理由写进了 `assessment-take.view.js` 的代码注释：
**危机干预的目标是把求助渠道递到用户手上，不是把人锁在页面上。**
强制阻断只会让人急着关掉窗口，反而记不住任何一个号码 ——
那就把干预变成了骚扰。用户关掉弹窗后照常进入自己的报告。

### 5. 覆盖面

危机提示不只挂在"自伤条目"上。状态最差的人往往从门槛最低的
「快速心理筛查」进入，而这份量表只有 5 道题、没有自伤条目 ——
如果危机提示只认 PHQ-9 第 9 题，他们会得到一句"建议关注"然后被送走。
因此 `scales.js` 为 `quick` 声明了 `crisisDimension`：
PHQ-2 / GAD-2 维度分偏高时同样触发危机通路。

### 6. 求助号码

`crisis.js` 中的热线号码会随时间调整，因此界面上同时注明
「以官方最新公布为准」，并**优先引导 120 / 110**（这两个号码最稳定）。
`urgent` 级别会展示急救与报警，`watch` 级别只展示心理援助热线 ——
不制造恐慌，但也不省略。

---

## 隐私与伦理说明

### 数据独立存放：`assessments` 集合，绝不落 `records`

心理测评数据只存在 `PHR.db.assessments` 里，**不写进 `records` 集合**。原因：

`core/dict-records.js` 的 `D.recordType()` 在找不到类型时**会静默回退到 `note` 类型**，
而 `note.scope` 是 `'basic'`。一旦心理报告混进 `records`，
只被授权了「个人基本信息」的医生就能看到它 —— 授权范围白名单会被直接绕过。

`assessment.service.js` 的自检里有两条断言守着这条线：

- `records 集合里没有心理测评数据`；
- `未登录/医生访客时 all() 返回空数组`（**绝不能写成 `!uid || row.userId === uid`**，
  那样写会让任何没有身份标识的调用者拿到全部患者的心理测评结果）。

### 不进搜索索引

心理测评数据不参与 `modules/search` 的倒排索引构建。
心理报告的题目文本与作答内容一旦进了索引，全局搜索框就会变成一条
"输入关键词看谁状态不好"的通道 —— 这不是本系统的功能。

### 不参与健康洞察的风险评分

`modules/insight/risk.js` 的 9 个维度只读体征指标与档案记录，
**不读心理测评**。把心理分数折进一个"健康得分"里，
等于让用户在一个数字里同时承担身体状况与心理状态两层判断，
既说不清也无法解释 —— 而且会诱导用户把心理健康当成一个可以"刷分"的指标。

### 共用同一份可见性判定

心理测评的医生可见性**与档案记录共用同一段实现**：
`core/security.js` 的 `canViewScoped(row, consent, scopeKey)`。
`assessment.service.js` 只提供 `scopeKey = 'psych'`（**字面量，不经过
`categories.scopeOf()`** —— 那个函数正是上面那条回退漏洞的入口）。

也就是说：医生要看到心理报告，必须在授权里显式勾选 `psych` 范围，
限时限范围、全程留痕，与其它档案一致。

### 刻意不提供的出口

报告页（`assessment-report.view.js`）**只提供「导出为文本」和「打印」**，
不提供分享到社群、生成链接、一键复制到剪贴板这类"一键外发"的出口。
心理测评数据是本系统里敏感度最高的一类信息，分享按钮会让人在情绪波动时
做出事后后悔的操作；而导出文件、打印纸张都需要用户自己选择保存位置，
这个"多一步"正是让人有机会想一想的缓冲。**这是隐私设计，不是功能缺失。**

### 本地存储

所有数据（包括心理测评）都保存在浏览器的 `localStorage` 里，
**不上传、不联网、没有服务端**。这也意味着：

- 清除浏览器数据 = 数据永久丢失（用户可以走「体验保障 → 备份」导出）；
- 系统无法在用户最需要的时候主动找到他 —— 所以求助渠道必须显式地
  写在页面上，而不是"需要我们的时候再联系我们"。

---

## 已知限制

1. **本地明文存储。** 受 `file://` 协议限制，本项目没有服务端，
   `localStorage` 中的数据以明文保存（口令本身做加盐哈希，但记录内容不加密）。
   任何能打开这台电脑浏览器的人都能读到心理测评结果。
2. **共用电脑是最大的暴露面。** 系统的隐私承诺建立在"这台设备只有你使用"
   这一前提上。为此，知情同意页里明确写了这一点，而不是含糊地宣称"绝对安全"。
3. **量表是公开筛查工具，不是诊断。** 收录的题目来自公开发表的标准化量表，
   分级切分点引用的是原文献的通行口径，但：
   - 翻译版本与本土常模可能存在差异；
   - 自评量表受当时状态、作答态度、社会赞许性影响；
   - **筛查阳性 ≠ 患病，筛查阴性 ≠ 没问题。**
4. **不做临床判断。** 系统不识别共病、不区分原发与继发、不评估躯体疾病导致的心理症状，
   也不处理精神病性症状、躁狂、成瘾等超出筛查量表范围的问题。
   任何结论都应由精神科医师或心理治疗师结合面谈与病史做出。
5. **热线号码会过期。** `crisis.js` 中的号码以官方最新公布为准，
   长期不维护的部署可能给出已失效的号码。
6. **危机识别是规则引擎，不是风险评估。** 它只能识别"作答里出现了明确的信号"，
   识别不了"作答时刻意隐瞒"或"信号以别的方式出现"。
   它是一个兜底通道，不是安全网。

---

## 集成说明

本模块的脚本**必须按下面的顺序**加入 `index.html`（`scales.js` 建立命名空间，
`report.js` 依赖前四个引擎，三个视图最后加载）：

```html
<script src="modules/assessment/scales.js"></script>
<script src="modules/assessment/scoring.js"></script>
<script src="modules/assessment/coping.js"></script>
<script src="modules/assessment/crisis.js"></script>
<script src="modules/assessment/report.js"></script>
<script src="modules/assessment/assessment.service.js"></script>
<script src="modules/assessment/assessment.view.js"></script>
<script src="modules/assessment/assessment-take.view.js"></script>
<script src="modules/assessment/assessment-report.view.js"></script>
<script src="modules/assessment/assessment-selftest.view.js"></script>
```

`modules/consent/scope.js` 已经用 `try/catch` 防御式地调用了
`PHR.assessment.countFor()`，因此是否加载本模块都不会让授权页报错 ——
但只有在上面这组脚本被引入后，授权页才会显示"心理测评 N 份"的统计。
