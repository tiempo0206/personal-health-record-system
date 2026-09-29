# modules/insight —— 健康洞察模块（模块 4）

## 这个文件夹实现了什么

本文件夹实现**个人健康档案管理系统**的**第 4 个业务模块：健康洞察**。

对应需求原文中的四句话：

> "第四是健康状态理解，系统需要用趋势图展示血压、血糖、心率等指标变化，并在异常时提醒用户。"

> "在指标异常时，用户不一定能理解数据变化，所以需要趋势图和解释。"

> "第三，系统要辅助健康理解，把复杂指标转化为清楚的图表、提醒和建议。"

> "第四是健康状态理解……帮助用户理解自己的身体状况，提供趋势图、异常提醒、风险识别和预防建议。"

一句话概括本模块的定位：**档案中心负责把数字存下来，健康洞察负责把这些数字讲明白**。
当前页面会明确展示数据来源：所有评分、趋势和提醒都来自健康档案，并会说明最近纳入分析的记录。
它不产生任何新的医学知识，也不定义任何阈值 —— 它只做三件事：
**看懂趋势（trend）→ 发现问题（anomaly）→ 告诉用户先做什么（risk / advice）**。

## 目录结构与每个文件的职责

```
modules/insight/
├── README.md              本文件
├── metrics.js             模块入口 + 指标语义层（把阈值翻译成人话）
├── trend.service.js       趋势分析引擎（最小二乘回归 / 转折点 / 两段对比 / 图表配置）
├── anomaly.js             异常检测与告警中心（六类规则 + 忽略管理 + 高危审计）
├── risk.js                健康风险评估（9 个维度 → 0~100 健康得分 + 改善建议）
├── advice.js              预防建议引擎（24 条数据触发的建议 + 今日计划 + 本周小结）
├── insight.view.js        注册 `insight` / `insight-detail` 两个视图 + 页面骨架与页签
├── insight.panels.js      主页五个页签的内容渲染 + 共用零件（记录一次 / 告警卡片 / 就医准备清单）
└── insight.detail.js      单指标下钻页的渲染（大图 / 统计 / 趋势 / 告警 / 历史记录表）
```

| 文件 | 职责 | 对外挂载点 | 行数级别 |
| --- | --- | --- | --- |
| `metrics.js` | 指标清单、状态、覆盖率、**把数字翻译成人话** | `PHR.insight.metrics` | ~250 |
| `trend.service.js` | 回归趋势、转折点、两段对比、`ui.chart.line` 配置 | `PHR.insight.trend` | ~370 |
| `anomaly.js` | 六类告警规则、等级分组、忽略、高危写审计 | `PHR.insight.anomaly` | ~450 |
| `risk.js` | 9 维度扣分模型、分维度得分、最容易改善的 3 件事 | `PHR.insight.risk` | ~590 |
| `advice.js` | 24 条触发式建议、今日健康计划、本周小结 | `PHR.insight.advice` | ~510 |
| `insight.view.js` | 视图注册与页面装配 | 视图 `insight` / `insight-detail` | ~165 |
| `insight.panels.js` | 总览 / 指标趋势 / 异常提醒 / 风险评估 / 预防建议 | `PHR.insight.panels` | ~655 |
| `insight.detail.js` | 指标详情页 | `PHR.insight.detailView` | ~275 |

> **关于行数**：本模块的功能边界由需求书逐条指定（9 个风险维度、6 类告警、24 条建议），
> 拆到单个文件后 `risk.js` / `anomaly.js` / `insight.panels.js` 超过 260 行。
> 已经按"职责单一"的原则把**视图**拆成了 3 个文件（注册 / 面板 / 详情），
> 剩余三个文件是"规则表 + 引擎"结构：规则表本身就是数据，再拆只会让规则散落各处、
> 难以对照维护，因此保持现状。整个仓库中同量级的文件还有 `records.view.js`(757)、
> `ux.view.js`(665)、`chart.js`(569)。

## 三级阈值模型

**本模块不定义任何医学数字。** 全部正常 / 警戒 / 危急阈值唯一来源是
`core/dict-metrics.js` 的 `PHR.dict.metrics`（16 个指标），判定函数是 `PHR.dict.judge()`。

| 落在哪里 | 等级 | 中文 | 语气色 | 含义 |
| --- | --- | --- | --- | --- |
| `normal{min,max}` 之内 | `ok` | 正常 | `ok` | 继续保持 |
| `normal` 之外、`warn` 之内 | `warning` | 需要关注 | `warn` | 复测 + 调整生活方式，不必恐慌 |
| 超出 `warn{min,max}` | `critical` | 明显异常 | `danger` | 建议尽快就医 |
| 指标无阈值（`noThreshold`，如体重） | `unknown` | — | `muted` | 只看趋势，不做单点判定 |

区间写成 `{ min, max }`，任一侧为 `null` 表示该侧不设限。
`PHR.insight.metrics.rangeText()` 把区间渲染成中文：
`90~129 mmHg` / `≤ 3.40 mmol/L` / `≥ 6000 步`。
其中 `min === 0` 视为"不设下界"（LDL、ALT、腰围等"越低越好"的指标，
写成 `0.00~3.40` 会让人误以为低于 0 才有问题）。

`metrics.explain(key, value)` 是这一层的核心，它把一次读数翻译成一句人话：

```
血糖 7.8 mmol/L，高于正常上限 6.1，属于需要关注的范围。至少空腹 8 小时后的静脉血或指尖血血糖值。
```

返回值：`{ level, levelName, tone, headline, detail, advice, compareText }`。
`advice` 直接取自字典的 `adviceNormal / adviceWarn / adviceCritical`，因此界面上每一条
分级建议与档案中心、医生视图看到的文字完全一致。

## 六类告警规则（`anomaly.js`）

每次打开洞察页或工作台都会重新扫描全部体征数据（不落库、纯计算），产出
`{ id, level, tone, metricKey, metricName, icon, value, unit, at, title, detail, advice, source, recordId }`。
体征数据来源不仅包括 `vital` 记录，也包括能被识别的 `lab` 检验项目
（如 HbA1c、LDL-C、尿酸、肌酐、ALT），这些由 `modules/records/vital.service.js`
统一映射成指标序列。

| # | 规则 | 触发条件 | 等级 | 为什么这样判 |
| --- | --- | --- | --- | --- |
| ① | **单次越界** | 最新读数落在 `warning` / `critical` | 中 / 高 | 字典已经把每次读数分成三档，最新一次就是"此刻的状态"，最直接也最好理解 |
| ② | **连续异常** | 最近 3 次读数中 ≥2 次异常 | 中（含危急则高） | 单次偏高常由情绪、睡眠、测量姿势造成；连续两次以上才更可能是真实变化 |
| ③ | **快速变化** | 相邻两次变化 ≥ 正常区间宽度的 30%，**且** 变化后数值已异常或幅度 ≥ 一档的 60% | 低（数值异常则升为中/高） | 三重条件是为了不把测量噪声当成问题；血压单独用"24 小时内 >30 mmHg" |
| ④ | **长期未测** | 超过 30 天无记录；从未记录 | 低（>90 天为中） | 没有数据就没有趋势，风险评分也会失真；但 16 个指标全报一遍会变成骚扰，所以"从未记录"只提示核心指标 |
| ⑤ | **趋势恶化** | `trend.analyze` 方向朝更差一侧、累计 ≥5%、且首尾与回归不矛盾 | 中（当前危急则高） | 单次正常但连续几个月朝坏方向走，是最容易被忽略的情况 |
| ⑥ | **多指标联合** | 代谢综合征：BMI≥24 且 收缩压均值≥130 且 LDL≥3.4；或 收缩压≥130 且 空腹血糖≥7.0 | 高 | 单独看每项只是"偏高一点"，同时出现时风险是**叠加**的，必须单独成条说明"是三件事同时出现" |

规则 ③ 与 ④ 的取舍（写在代码注释里，也在这里说明）：

- **步数被排除在规则 ③ 之外**：同一个人不同日子的日累计步数相差几千步完全正常，
  逐日比较只会制造噪音。它的真实问题由规则 ⑤（看多日均值）和规则 ① 负责。
- **血压使用 24 小时 / 30 mmHg 规则**：收缩压正常区间宽度只有 39，30% 仅约 12 mmHg，
  而这在家庭自测中属于常见噪声。
- **"从未记录"只提示 6 个核心指标**（收缩压、舒张压、血糖、心率、BMI、体重），
  其余 10 个指标记录过但断更时才提示。
- **收缩压与舒张压在同一天触发同类告警时只保留收缩压那条** —— 它们是同一次测量的
  两个数，报两条会让用户以为出了两个独立问题。

**等级与偏好过滤**：`active()` 依次应用
`PHR.config.abnormalAlert`（全局开关，关掉直接返回空）→
用户偏好 `PHR.ux.preference.get('alertThreshold')`
（`ok` 全部 / `warning` 仅警戒以上 / `critical` 仅危急）→ 已忽略列表。

**忽略机制**：`dismiss(id)` 把 id 写进 `PHR.store` 的 `insight_dismissed`，**30 天后自动失效**
（避免"忽略一次就永远看不见"）。告警 id 形如 `latest:spo2:2026-09-15`，
包含触发它的那次读数日期 —— 因此同一条读数被忽略后不会立刻弹回来，
但出现新读数时会重新提醒。

**高危写审计**：扫描到 `high` 级别告警时写 `insight.alert`，
用 `insight_alert_log`（键为 `指标@日期`）去重，**同一指标同一天只写一次**，
并自动清理 7 天前的记录。写入前一律判断 `if (PHR.audit && PHR.audit.log)`。

## 风险评分算法（`risk.js`）

```
健康得分 score = 100 - Σ(各维度扣分)，钳制到 0~100（越高越好）
风险等级 level = score ≥85 低 / ≥70 较低 / ≥55 中等 / ≥40 较高 / <40 高
```

| 维度 | 满分 | 判断依据（`evidence` 一律引用真实数据） |
| --- | --- | --- |
| 血压 | 18 | 近 30 天收缩压均值分档（≥140 扣 12、≥130 扣 8、≥120 扣 4、<100 扣 8）+ 达标率折算 |
| 血糖 | 16 | 近 90 天空腹血糖均值 + 糖化血红蛋白最新值；趋势向好可回补 1.5 分 |
| 血脂 LDL-C | 12 | 最新 LDL-C 分档（≥4.1 扣 10、≥3.4 扣 6、≥2.6 扣 2） |
| 体型 | 12 | BMI 分档 + 腰围分档 + 年龄 ≥45 合并超重的加成 |
| 生活方式 | 12 | 吸烟 / 饮酒 / 运动自评 + 近 7 天平均步数 |
| 家族史 | 10 | 复用 `history.geneticRisks()`：一级亲属、多人同病、55 岁前早发、本人已确诊 |
| 已确诊慢病 | 16 | 按疾病系统加权（心血管 5、内分泌 4.5、呼吸/泌尿 3…），活动期额外加权 |
| 用药依从性 | 10 | 经常漏服比例、偶尔漏服比例；存在高危药物相互作用再加 4 分 |
| 随访依从性 | 8 | 逾期条数（≥2 条扣 8、1 条扣 5、14 天内到期扣 2） |

- 每个维度返回 `{ name, category, weight, score, deduction, level, levelName, tone, missing, evidence, advice }`，
  其中 `score = round((1 - 扣分/满分) × 100)`，`level` 为 `ok / info / warn / danger`。
- **数据缺失的维度会带 `missing: true`**，`summaryText` 会单独说明
  "另有 N 个维度因为缺少数据无法真正评估"，避免把"没测过"说成"有问题"。
  返回值里还有 `missingCount` 与 `dataCoverage`（真正算出来的维度占比）。
- `byCategory()` 输出 `[{ label, value, level, tone }]` 供条形图使用。
- `improvements()` 按 **收益 ÷ 难度** 排序取前 3，每条给出可执行的量化预期，例如
  "把每日步数从 4500 提升到 6000 步 —— 预计 3 个月可让收缩压下降 3~5 mmHg"。
  难度取值：1 = 今天就能做，2 = 一两周形成习惯，3 = 需要长期坚持或专业帮助。

> ⚠️ **这是基于公开流行病学常识的简易规则模型，不是临床评分工具。**
> 它没有使用也没有声称等价于 Framingham 风险方程、ASCVD pooled cohort equations、
> China-PAR 等经过人群验证的评分工具，**不能用于诊断或指导治疗**。
> 它的唯一用途是帮用户看懂"我的短板在哪、先改什么最划算"。
> 模型口径以 `PHR.insight.risk.model` 的形式随数据一起返回，界面直接引用，避免各处描述不一致。

## 预防建议引擎（`advice.js`）

### 设计原则：每条建议都挂在某个数据条件上

`makeRules()` 里一共 **24 条规则**，每条规则自带 `when(条件)` 与 `item(生成的建议)`。
**没有触发条件就不输出** —— 宁可少说，也不输出"多喝水、多运动"这类与用户数据无关的空话。
界面上也会明确写出这一点（"系统里一共内置了 24 条建议规则，只有当您的数据满足触发条件时才会显示"）。

| 分组 | 部分触发条件示例 |
| --- | --- |
| 🏥 就医 | 存在 `critical` 告警；随访已逾期；检测到高危药物相互作用 |
| 📊 监测 | 收缩压均值 ≥130 → 家庭血压 7 天早晚各一次；血糖异常 → 每周 2~3 次空腹+餐后；有指标 >30 天未记录 → 补测；有 55 岁前发病的家族史 → 筛查计划 |
| 💊 用药 | 长期用药 → 每 30 天复诊评估；经常漏服 → 分装药盒 + 闹钟；补药提醒 7 天内到期 → 提前开药 |
| 🥗 饮食 | 血压偏高 → 减盐；空腹血糖 ≥6.1 → 主食换粗粮；LDL ≥3.4 → 减少饱和脂肪；尿酸 ≥420 → 限嘌呤多饮水 |
| 🏃 运动 | 近 7 天步数均值 <6000 → 分段快走；已达标 → 增加抗阻训练；血压偏高 → 每周 150 分钟有氧 |
| 🌙 生活方式 | 近 14 天多数不足 7 小时 → 作息；吸烟 → 戒烟；经常饮酒 → 限酒；静息心率 >90 → 作息与运动 |

### 今日健康计划（`dailyPlan()`）

从最紧急的信号里生成 **3~5 条今天就能做完的动作**，可勾选。
勾选状态存在 `PHR.store` 的 `insight_todo_<日期>` 下，**每天 0 点自动重置**。
条目 id 由"日期 + 规则名"构成，因此每天重新生成的计划能正确对应上昨天的勾选状态。

- `toggle(itemId)` 勾选 / 取消勾选
- `todayProgress()` 返回 `{ done, total, percent }`

### 本周小结（`weeklyReport()`）

返回 `{ range, highlights, concerns, nextWeek, text, disclaimer }`，用于工作台卡片。
幅度描述**统一使用回归斜率**（"约每月下降 0.6 mmol/L"），
避免出现"持续上升（-8.2%）"这种首尾两点与趋势打架的句子。

### 免责声明

`generate()`、`dailyPlan()`、`weeklyReport()` 的返回值**都带 `disclaimer` 字段**，
界面必须展示。`generate()` 返回的是数组，免责声明挂在数组对象的 `disclaimer` 属性上
（`Array.isArray(result) === true` 仍然成立，调用方不会踩坑）。

## 注册的页面（路由）

| 路由地址 | 视图名 | 说明 | 是否出现在左侧导航 |
| --- | --- | --- | --- |
| `#/insight` | `insight` | 健康洞察主页（数据来源说明 + 五个页签） | ✅ 是（业务模块组，第 5 位） |
| `#/insight/<metricKey>` | `insight-detail` | 单指标详情页，例如 `#/insight/systolic` | ❌ 否（`nav: false`） |
| `#/insight-detail/<metricKey>` | `insight-detail` | 视图名直连，便于调试 | ❌ 否 |

`#/insight/<metricKey>` 由 `insight.view.js` 里 `PHR.router.add('insight/:metricKey', …)`
提供的**别名路由**承接：因为 router 的通用规则会把 `#/insight/systolic` 的第一段
`insight` 解析成主页，所以必须注册一条更具体的路由让 router 优先匹配。

页面头部先显示两条用户可读说明：数据来源（纳入多少条健康档案、体征指标、检验报告、最近更新时间）
以及最近一条记录为什么可能改变趋势或评分。

页面内五个页签：

1. **总览** —— 健康得分仪表盘 + 风险等级 + 最容易改善的 3 件事 + 今日健康计划（可勾选）+ 本周小结。
2. **指标趋势** —— 时间范围 `.segmented`（近 30 天 / 90 天 / 1 年 / 全部）+ 指标筛选 chips；
   每个有数据的指标一张 `.metric-card`：大号当前值 + 单位 + 等级徽章 + `chart.scaleBar` 刻度尺 +
   折线图（`trend.chartConfig`，含正常/警戒底纹与目标参考线）+ 趋势一句话 + 正常范围 +
   「记录一次」「查看详情」「这是什么？」三个动作。
   其中**血压只出一张卡片**，图里画收缩压 + 舒张压两条线。
3. **异常提醒** —— 四个等级统计卡 + `anomaly.active()` 的告警卡片（`.alert-card` 按等级给
   `sev-high/medium/low`），每条带「去记录一次」「去就医准备」「忽略」；
   底部可一键恢复全部被忽略的提醒。
4. **风险评估** —— 得分仪表盘 + 分维度条形图（`chart.bar` 横向）+ 9 个维度的
   `evidence` 折叠展开 + 最容易改善的 3 件事 + 模型说明。
5. **预防建议** —— `advice.generate()` 的六组建议 + 今日计划 + 免责声明。

指标详情页：近 90 天大图（正常区间底纹 + 目标参考线）、六个统计卡
（最新 / 平均 / 最高最低 / 达标率 / 波动性 / 记录次数）、趋势分析（方向、速度、稳定性、
拟合优度 R²、样本量与覆盖率）、两段时间对比（最近 30 天 vs 之前 30 天）、显著转折点列表、
该指标相关告警、指标解释与分级建议、全部历史记录表格（点击任意一行进入 `#/records-edit/<id>`）。

## 对外暴露的 API

### `PHR.insight.metrics`

| 方法 | 返回 |
| --- | --- |
| `list()` / `get(key)` / `groups()` | 指标清单 / 单个指标定义 / 按 group 归并（血压合并成一组） |
| `withData(days?)` | 有数据的指标摘要数组 |
| `statusOf(key, days?)` | `{ level, levelName, tone, latest, avg, count, coverage, lastAt, summary }` |
| `coverageOf(count)` | 记录条数 → `充足`(≥10) / `偏少`(≥4) / `不足` |
| `normalRangeText(metric)` / `rangeText(range, digits)` | 区间 → 中文 |
| `explain(key, value)` | **把数字翻译成人话**：`{ level, levelName, tone, headline, detail, advice, compareText }` |
| `unitOf` / `decimalsOf` / `targetOf` / `betterOf` / `isDual` / `fmt` | 单位、精度、目标值、期望方向等小工具 |
| `DISCLAIMER` | 全模块统一的免责声明文本 |

### `PHR.insight.trend`

| 方法 | 返回 |
| --- | --- |
| `analyze(key, days?)` | `{ direction, slope, slopePerMonth, changePercent, volatility, stability, better, r2, mismatch, summaryText, points, latest, count, window, empty }` |
| `analyzeAll(days?)` | 所有有数据指标的趋势，**正在恶化的排在前面**（工作台卡片直接用） |
| `chartConfig(key, days?)` | 直接喂给 `PHR.ui.chart.line` 的配置：`series`（血压拆两条线）/ `bands` / `references` / `yUnit` / `valueDigits` / `emptyText` |
| `changePoints(key, days?)` | 显著转折点 `[{ at, from, to, delta, note }]`，"什么时候开始见效的" |
| `compare(key, periodA?, periodB?)` | `{ aAvg, bAvg, delta, deltaPercent, better, text }`，默认最近 30 天 vs 之前 30 天 |
| `linreg(xs, ys)` / `std(vals)` | 最小二乘回归与标准差（供其它模块复用） |

**为什么用最小二乘而不是首尾相减**：单次测量受情绪、时间、设备误差影响很大，
只取两点等于把全部噪声都算进斜率。回归使用每一个数据点，结论更稳健，同时给出 R²
供界面判断"这条直线到底能不能代表数据"。当回归方向与首尾变化符号相反时，
`mismatch` 为 `true`，文案会切换成"起伏较大，建议结合趋势图判断"，不会写出自相矛盾的句子。

**方向判定阈值**：`正常区间宽度 × 8% / 月`；没有区间时退回 `均值 × 3% / 月`。
**波动判定**：用"去掉趋势后的残差标准差"对比 `区间宽度 × 25%`，避免把持续上升误判为波动。

### `PHR.insight.anomaly`

| 方法 | 说明 |
| --- | --- |
| `scan(days?)` | 扫描全部指标，返回告警数组（最多 12 条，按等级与时间排序） |
| `active(opt?)` | 按全局开关 + 用户偏好 + 已忽略过滤后，真正要显示的告警 |
| `byLevel(opt?)` | `{ high, medium, low, count: { high, medium, low, total } }` |
| `dismiss(id)` / `dismissed()` / `restore(id)` / `clearDismissed()` | 忽略管理（30 天自动失效） |
| `thresholdOf()` | 当前提醒敏感度（防御式读取用户偏好，偏好模块缺失时回落到 `warning`） |
| `rules` / `disclaimer` | 六类规则的名称清单 / 告警文案的免责声明 |

### `PHR.insight.risk`

| 方法 | 说明 |
| --- | --- |
| `assess()` | `{ score, level, tone, factors, deduction, evidenceCount, missingCount, dataCoverage, summaryText, updatedAt, disclaimer }` |
| `byCategory()` | `[{ label, value, level, tone, weight }]`，供条形图 / 雷达图 |
| `improvements()` | 最容易改善的 3 件事，含 `{ title, detail, expected, priority, tone, impact, effort, metricKey }` |
| `model` | 模型口径：维度数、总分、各维度权重、免责说明 |

### `PHR.insight.advice`

| 方法 | 说明 |
| --- | --- |
| `generate()` | 六组建议 `[{ group, icon, items:[{ title, detail, priority, tone, evidence, metricKey }] }]`，数组上额外挂 `disclaimer` |
| `dailyPlan()` | `{ date, items, progress:{ done, total, percent }, disclaimer }` |
| `toggle(itemId)` / `todayProgress()` | 勾选状态读写 / 今日进度 |
| `weeklyReport()` | `{ range, highlights, concerns, nextWeek, text, disclaimer }` |
| `groups` / `ruleCount` / `disclaimer` | 分组名清单 / 规则总数 / 免责声明 |

### 视图专用的两个零件

`PHR.insight.panels.quickAdd(metricKey, onDone)` —— 弹出"记录一次"表单（调
`PHR.records.vital.add`），保存后立刻用 `explain()` 告诉用户这次读数意味着什么。
`PHR.insight.panels.alertCard(alert)` —— 渲染单条告警卡片，指标详情页也复用它。

## 与其它模块的关系

```
core/dict-metrics.js ──阈值唯一来源──► modules/insight ──► ui/components/chart.js
core/dict.js         ──枚举与文案──►        │
                                            ├─ 读：records.vital / profile / history / medication
                                            ├─ 读：PHR.ux.preference（提醒敏感度）
                                            ├─ 写：PHR.audit.log({ action:'insight.view' | 'insight.alert' })
                                            └─ 写：PHR.store（insight_dismissed / insight_alert_log / insight_todo_<日期>）
modules/ux/dashboard.view.js ──消费──► PHR.insight.{anomaly,risk,advice,trend}
```

- **上游**：只读档案中心的数据，不写任何健康记录（除了用户主动点「记录一次」）。
  数据变化通过 `record:changed` / `metric:changed` / `profile:changed` 触发当前洞察页刷新。
  上传结构化报告后，`record.service.js` 会广播记录变化；其中体征记录会广播指标变化，
  可识别检验报告会被 `vital.service.js` 纳入趋势与风险评分。
- **下游**：工作台的「指标提醒」「关键指标趋势」「健康得分」三张卡片直接消费本模块的
  `anomaly.active()` / `trend.analyzeAll(90)` / `risk.assess()` / `advice.dailyPlan()`，
  因此这几个函数的返回结构不能随意改动。
- **审计**：查看洞察页写 `insight.view`；扫描到高危告警写 `insight.alert`（同指标同天去重）。
  所有调用都是 `if (PHR.audit && PHR.audit.log) { … }` 的防御式写法。

## 实现上的取舍与已知限制

1. **全部是规则，不是模型**：没有训练、没有人群验证，只有公开的流行病学常识 + 字典阈值。
   阈值口径统一来自 `core/dict-metrics.js`，本模块一个医学数字都没有新写。
2. **没有服务端、没有 fetch**：所有分析都在浏览器里现算。数据量在演示级别（数百条记录）
   时响应无感；真实产品中趋势与风险评估应当下沉到服务端做增量计算。
3. **`explain()` 的文案是模板化的**：同一档位的读数会得到同一段建议文字。
   真正个性化的解释需要结合用药、病史与就诊记录做更复杂的推理。
4. **转折点检测只看"相邻两点超过 2 倍标准差"**：它给出的是"这里值得回头看一眼"，
   不是"这里一定发生了什么"。文案里也明确请用户回想是否换了药、开始运动等生活事件。
5. **忽略是本地状态**：存在 `localStorage` 里，换设备不同步；30 天后自动失效，
   因此不可能通过"忽略"永久屏蔽一个问题。
6. **"就医准备清单"是本地生成的文本**：它把用户自述与自测数据整理成一页，
   未经医疗机构核实，仅供就诊时向医生说明情况使用。

## 免责声明

> **本模块所有分析 —— 包括趋势判断、异常告警、风险评分与预防建议 —— 都是基于公开
> 流行病学常识的规则型科普提示，不构成医学诊断，也不能替代医生的专业判断。**
>
> - 风险评分（`PHR.insight.risk`）是**简易规则模型**，不是 Framingham / ASCVD /
>   China-PAR 等经过人群验证的临床评分工具，**不能用于诊断或指导治疗**。
> - 告警规则（`PHR.insight.anomaly`）的设计目标是在"不漏掉明显问题"与"不制造无谓焦虑"
>   之间取平衡，因此存在漏报与误报的可能；它只是提醒您"值得复测或就诊"，
>   不代表您一定有病，也不代表您一定没病。
> - 预防建议（`PHR.insight.advice`）为一般性健康生活方式建议，
>   不针对任何具体疾病，也不能替代医嘱。
> - 任何**用药、停药或治疗方案调整，请务必咨询具备执业资格的医生**；
>   若出现胸痛、呼吸困难、意识改变、血氧明显下降等急症表现，请立即拨打 120。
>
> 上述文字在代码中定义为 `PHR.insight.metrics.DISCLAIMER`，
> 并随 `generate()` / `dailyPlan()` / `weeklyReport()` / `assess()` 的返回值一起返回，
> 由界面负责展示，避免调用方忘记加上。
