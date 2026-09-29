# modules/records —— 档案中心模块（模块 2）

## 这个文件夹实现了什么

本文件夹实现**个人健康档案管理系统**的**第 2 个业务模块：档案中心**，它是整个系统数据量的主体。

对应需求原文：

> "第二是完整的健康档案管理，用户可以录入基本信息、既往病史、家族病史、用药和过敏史，
> 也可以从医院或诊所同步检查结果和诊断报告。"

> "第一条是健康档案生命周期：用户输入或医院同步数据后，系统自动分类，
> 随后用于搜索、查看趋势和生成提醒，同时所有修改都保留版本记录。"

> "其中档案中心是核心，负责数据录入、同步、分类和版本管理。"

本模块负责把散落在不同医院、不同时间、不同格式的健康信息**收进一个统一结构里**，
并保证每一处修改都可追溯。它向上支撑三个模块：智能搜索（要索引它）、
健康洞察（要读它的体征数值与可识别检验项）、医生授权（要按范围过滤它）。

## 目录结构与每个文件的职责

```
modules/records/
├── README.md                本文件
├── categories.js              分类与统计：按授权范围/疾病系统归并、完整度计算、推荐录入顺序
├── version.service.js         版本历史：快照、字段级差异、回滚、恢复已删除记录
├── record.service.js          【核心】14 类记录的统一读写、查询、授权范围过滤、统计
├── profile.service.js         个人基本信息：读写、BMI 计算、急救信息卡
├── vital.service.js           体征指标：序列化、最新值、统计摘要、异常读数、补测提醒、检验项映射
├── medication.service.js      用药与过敏：当前用药、过敏原索引、相互作用、补药提醒
├── history.service.js         既往病史：确诊/手术/住院/疫苗/家族史聚合、随访提醒、遗传风险
├── sync.service.js            医院同步 + 结构化报告导入：预览、查重、入库、同步/导入日志
├── records.view.js            【页面】健康档案主页
├── record-editor.view.js      【页面】录入 / 编辑记录（表单由字段模式自动生成）
├── timeline.view.js           【页面】健康时间线
└── basic.view.js              【页面】个人基本信息 + 急救卡
```

| 文件 | 职责一句话 | 对外挂载点 | 行数级别 |
| --- | --- | --- | --- |
| `categories.js` | 在类型字典之上做归类、统计与完整度 | `PHR.records.categories` | ~200 |
| `version.service.js` | 每次变更留快照，支持字段级差异与回滚 | `PHR.records.versions` | ~230 |
| `record.service.js` | 记录 CRUD + 查询 + 授权过滤 + 统计 | `PHR.records.service`（并平铺到 `PHR.records.*`） | ~320 |
| `profile.service.js` | 基本信息 + BMI + 急救卡 | `PHR.records.profile` | ~210 |
| `vital.service.js` | 体征序列与统计（洞察模块的数据源；也会把可识别检验报告映射成指标点） | `PHR.records.vital` | ~300 |
| `medication.service.js` | 用药/过敏聚合与安全提示 | `PHR.records.medication` | ~280 |
| `history.service.js` | 病史聚合、随访提醒、遗传风险 | `PHR.records.history` | ~300 |
| `sync.service.js` | 模拟医院同步 + CSV/JSON 健康记录导入 | `PHR.records.sync` | ~560 |
| `records.view.js` | 档案列表（卡片/列表/分布三视图） | 视图 `records` | ~560 |
| `record-editor.view.js` | schema 驱动的录入表单 + 血压/血糖/化验单等常用入口 | 视图 `records-edit` | ~400 |
| `timeline.view.js` | 我的健康故事摘要 + 按年/月分组的时间线 | 视图 `timeline` | ~340 |
| `basic.view.js` | 基本信息表单 + 急救卡 | 视图 `basic` | ~300 |

## 14 种记录类型

所有类型及其表单字段定义在 **`core/dict-records.js`**（唯一来源）。
新增一种记录类型只需改那个文件，**本文件夹的视图代码一行都不用动** ——
录入表单、详情弹窗、摘要生成、搜索索引、时间线展示全部自动适配。

| # | 类型 key | 名称 | 归属授权范围 | 标题字段 | 日期字段 |
| --- | --- | --- | --- | --- | --- |
| 1 | `visit` | 门诊就诊 | `visit` | 主诉 | 就诊日期 |
| 2 | `diagnosis` | 确诊疾病 | `history` | 疾病名称 | 确诊日期 |
| 3 | `lab` | 检验报告 | `lab` | 检验项目 | 报告日期 |
| 4 | `imaging` | 影像检查 | `lab` | 检查方式 | 检查日期 |
| 5 | `prescription` | 处方 | `medication` | 药品名称 | 开方日期 |
| 6 | `medication` | 用药记录 | `medication` | 药品名称 | 开始日期 |
| 7 | `allergy` | 过敏史 | `allergy` | 过敏原 | 首次发现日期 |
| 8 | `surgery` | 手术记录 | `history` | 手术名称 | 手术日期 |
| 9 | `hospitalization` | 住院记录 | `history` | 入院诊断 | 入院日期 |
| 10 | `vaccination` | 疫苗接种 | `history` | 疫苗名称 | 接种日期 |
| 11 | `checkup` | 体检报告 | `lab` | 体检结论 | 体检日期 |
| 12 | `family` | 家族病史 | `family` | 疾病名称 | 记录日期 |
| 13 | `vital` | 体征指标 | `vital` | 指标名称 | 测量时间 |
| 14 | `note` | 健康笔记 | `basic` | 标题 | 日期 |

## 记录对象的统一结构

所有 14 种类型在数据库里是**同一种结构**（存在 `records` 集合中），
由 `core/models.js` 的 `models.record.create(type, values, opt)` 归一化产生：

```js
{
  id: 'R000123',            // 主键
  userId: 'U000001',        // 归属用户
  type: 'lab',              // 记录类型
  title: '糖化血红蛋白',      // 由 titleField 派生 —— 列表/时间线/搜索结果的标题
  date: 1757000000000,      // 由 dateField 派生 —— 排序与时间筛选的依据
  dateText: '2026-09-15',
  summary: '检验项目：糖化血红蛋白 · 检验结果：6.1 % · ...',   // 自动生成的一句话摘要
  scope: 'lab',             // 归属授权范围（医生授权据此过滤）
  diseaseCat: 'endocrine',  // 疾病分类（搜索筛选与统计的依据）
  severity: 'mild',         // 严重程度（部分类型有）
  abnormal: true,           // 是否被标记为异常结果
  data: { ... },            // 该类型模式中声明的全部字段值
  source: 'sync',           // manual | sync | import
  sourceName: '市第一人民医院',
  tags: [],                 // 用户自定义标签
  version: 3,               // 当前版本号
  searchText: '...',        // 展平后的可搜索文本（供智能搜索建倒排索引）
  createdAt: 1757000000000,
  updatedAt: 1757000000000
}
```

**这个设计的好处**：搜索只需要扫一张表；时间线只需要按 `date` 排序；
医生授权只需要按 `scope` 过滤；统计只需要 `groupBy`。新增类型不会牵动任何查询逻辑。

## 对外暴露的 API

### 记录读写（`PHR.records.service`，同时平铺为 `PHR.records.*`）

| 方法 | 说明 |
| --- | --- |
| `all()` | 当前用户全部记录（按发生日期倒序） |
| `list(filter)` | 多条件查询：`types / diseaseCats / scopes / sources / from / to / keyword / abnormalOnly / sort / limit` |
| `byId(id)` / `byType(type)` / `recent(n)` | 单条 / 按类型 / 最近 N 条 |
| `create(type, values, opt)` | 新增，自动校验 + 归一化 + 写版本 + 写审计 |
| `update(id, values, opt)` | 修改，自动计算字段级差异并写新版本 |
| `remove(id, reason)` | 删除，**保留版本快照可恢复** |
| `removeMany(ids, reason)` / `tagMany(ids, tags)` | 批量删除 / 批量打标签 |
| `forConsent(consent, {scopeKey})` | **医生可见记录的唯一判定入口** |
| `canView(record, consent)` | 单条记录对某查看者是否可见 |
| `groupByScope(records)` | 按授权范围分组（医生视图用） |
| `stats()` / `byMonth(n)` | 统计汇总 / 按月分布 |

### 版本历史（`PHR.records.versions`）

| 方法 | 说明 |
| --- | --- |
| `snapshot(record, action, opt)` | 写一份快照（`create`/`update`/`delete`/`rollback`） |
| `diff(before, after)` | 字段级差异 `[{name, label, from, to}]` |
| `history(id)` / `latest(id)` / `recent(n)` / `countOf(id)` | 版本查询 |
| `rollback(versionId)` | 回滚（回滚本身也产生新版本，历史不会被抹掉） |
| `restoreDeleted(versionId)` | 从历史中"复活"已删除的记录 |

### 基本信息与体征

| 方法 | 说明 |
| --- | --- |
| `PHR.records.profile.get()` / `.getOrDefault()` / `.getMasked(viewer)` / `.exists()` / `.save(v)` | 基本信息读写 |
| `PHR.records.profile.summary()` | 派生摘要：年龄、BMI、风险因素 |
| `PHR.records.profile.emergencyCard()` | 急救信息卡数据 |
| `PHR.records.profile.computeBmi(w, h)` | BMI 计算 |
| `PHR.records.vital.series(key, opt)` | 折线图数据 `[{x, y, y2, meta}]` |
| `PHR.records.vital.summary(key, opt)` | 统计摘要（含最小二乘趋势方向判断） |
| `PHR.records.vital.latest(key)` / `.latestAll()` / `.summaryAll()` | 最新读数 |
| `PHR.records.vital.abnormal(key, days)` / `.abnormalAll(days)` | 异常读数 |
| `PHR.records.vital.missing(days)` | 超过 N 天未记录的指标 |
| `PHR.records.vital.add(key, value, value2, at, opt)` | 快速录入一条读数 |

### 用药、病史与同步

| 方法 | 说明 |
| --- | --- |
| `PHR.records.medication.current()` / `.past()` / `.byDrug()` / `.prescriptions()` | 用药清单 |
| `PHR.records.medication.allergiesBySeverity()` / `.allergenIndex()` | 过敏清单与索引 |
| `PHR.records.medication.checkDrug(name)` | **药品名与已知过敏原冲突检查** |
| `PHR.records.medication.interactions(list)` | 药物相互作用提示 |
| `PHR.records.medication.refillReminders()` | 补药 / 复诊提醒 |
| `PHR.records.medication.doctorSummary()` | 给医生看的一页用药摘要 |
| `PHR.records.history.activeConditions()` / `.chronicConditions()` / `.byDiseaseCategory()` | 病史清单 |
| `PHR.records.history.summary()` / `.followUpDue()` | 病史摘要 / 随访提醒 |
| `PHR.records.history.geneticRisks()` | 基于家族史的科普级风险提示 |
| `PHR.records.history.vaccineSuggestions()` | 疫苗到期建议 |
| `PHR.records.history.bundle()` | 一次性取全部病史（医生视图与导出用） |
| `PHR.records.sync.hospitals()` / `.preview(key)` / `.sync(key)` / `.logs()` | 医院同步 |
| `PHR.records.sync.previewFile(text, fileName)` / `.importFile(text, fileName)` | 上传结构化报告：支持 JSON 数组、备份片段、带表头 CSV；预览后写入 |

## 注册的页面（路由）

| 路由 | 视图 | 说明 | 左侧导航 |
| --- | --- | --- | --- |
| `#/records` | `records` | 健康档案主页（卡片 / 列表 / 分布三视图切换） | ✅ 业务模块组，第 2 位 |
| `#/timeline` | `timeline` | 健康时间线（顶部健康故事摘要 + 年/月分组，可叠加显示修改记录） | ✅ 业务模块组，第 3 位 |
| `#/records-edit` | `records-edit` | 先选常用记录或专业类型，再填表 | ❌ 隐藏（从各处跳入） |
| `#/records-edit?type=lab` | `records-edit` | 直接进入某类型的表单 | ❌ |
| `#/records-edit/<记录id>` | `records-edit` | 编辑已有记录 | ❌ |
| `#/basic` | `basic` | 个人基本信息 + 急救信息卡 | ❌（从档案页进入） |

也支持带参进入档案页，例如 `#/records?type=vital` 只显示体征指标。

## 核心设计决策

### 1. 为什么 14 种类型共用一张表？
如果把每种类型建成独立的表，搜索、时间线、统计、授权过滤都要写 14 遍。
统一结构 + `type` 字段 + 自动派生的 `title`/`date`/`summary`/`scope`/`searchText`，
让所有跨类型操作都只需一份代码。

### 2. 表单为什么是"自动生成"的？
字段模式定义在 `core/dict-records.js`，`ui/components/form.js` 根据模式渲染控件。
好处：新增字段只改字典；校验规则与表单字段永远一致（都来自同一份 schema）；
医生视图的"这条记录有哪些内容"也从同一份 schema 读，不会出现"录入了但看不到"。

### 3. 版本历史为什么连删除也要记？
需求说"所有修改都保留版本记录"。如果删除不留痕，用户误删后数据就永久丢失了。
现在删除只是把记录移出主表，快照仍在 `versions` 集合里，
在「版本历史」中可以直接"恢复这条记录"。

### 4. 医生授权的过滤口径为什么只有一处？
`record.service.forConsent()` 与 `canView()` 是**唯一**判定入口。
所有界面（医生视图、导出、统计）都必须经过它，避免出现"某个页面忘了过滤"导致越权。

### 5. 为什么药物相互作用与遗传风险都要写明"演示级"？
因为它们是教学演示用的极小规则样本，不是临床工具。
在代码注释、README、界面提示三处都写明了免责声明 ——
这是健康类产品的基本职业操守。

## 与其它模块的关系

```
modules/records
   ├── 被 modules/search 索引（用 searchText 与 data 字段）
   ├── 被 modules/insight 读取（vital.service 是趋势图的数据源）
   ├── 被 modules/consent 过滤（forConsent / canView）
   ├── 向 modules/audit 写日志（record.create/update/delete/view、sync.pull）
   └── 向 PHR.bus 广播 record:changed / metric:changed
```

## 实现上的取舍与已知限制

1. **结构化导入不是原始附件上传**：已支持 CSV/JSON 上传写入健康记录，并能带动洞察刷新；但影像、PDF、图片等原始附件仍只存报告编号或存放位置文本。
   真实产品需要对象存储 + 分片上传 + 病毒扫描 + 访问签名 URL。
2. **医院同步是模拟的**：`sync.service.js` 用固定模板 + 相对日期生成数据。
   真实对接需要 HL7 FHIR 或机构专有接口，并要有用户授权书与机构间数据共享协议。
3. **药物相互作用库极小**：只有 8 条演示规则。真实产品必须接入权威药学数据库。
4. **遗传风险是科普级的**：只按"一级亲属人数 + 早发年龄"做简单加权，
   不是多基因风险评分（PRS），不能用于临床决策。
5. **BMI 使用通用阈值**：实际应按年龄与人群调整（儿童需用百分位曲线）。
   合并糖尿病时腰围标准也应更严格。
6. **全部数据在浏览器本地**：换电脑、清缓存、换浏览器都会导致数据不可见。
   真实产品必须有服务端存储与多端同步；当前版本靠「体验保障 → 导出备份」缓解。
