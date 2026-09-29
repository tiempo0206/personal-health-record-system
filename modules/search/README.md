# 模块 3 · 智能搜索（modules/search）

个人健康档案管理系统（PHR）的**快速搜索模块**：按时间、疾病分类、记录类型等条件筛选，
并支持不依赖任何第三方库的中文模糊检索。

对应需求原文：

> 「第三是快速搜索功能，用户能够按照时间、疾病分类、记录类型等条件筛选，也可以使用模糊搜索。」
> 「医生需要历史资料，所以需要精准授权。」
> 「用户可以按照时间、疾病分类、记录类型等条件筛选，也可以使用模糊搜索。」

**纯前端实现**：无 ES Module、无第三方库（没有拼音库 / lunr / fuse.js）、无 `fetch`，
双击 `index.html` 即可运行；全部算法（分词、倒排索引、编辑距离、同义词扩展）都是本目录内的纯 JS。

---

## 一、目录与文件职责

```
modules/search/
├── README.md              ← 本文件
├── fuzzy.js               ← 算法层：分词 / 编辑距离 / 子序列 / 打分 / 同义词表
├── inverted-index.js      ← 索引层：倒排表 + TF-IDF 召回 + 缓存失效
├── filters.js             ← 条件层：筛选条件的定义、候选项、过滤、描述、预设
├── history.js             ← 记忆层：搜索历史 / 常用搜索 / 热门关键词
├── search.service.js      ← 编排层：检索主流程（召回 → 精排 → 过滤 → 高亮 → 审计）
└── search.view.js         ← 表现层：注册 #/search 视图（页面骨架与交互）
```

| 文件 | 命名空间 | 职责 | 是否碰 DOM |
|---|---|---|---|
| `fuzzy.js` | `PHR.search.fuzzy` | 中文分词、编辑距离、相似度、子序列匹配、综合打分、医学术语同义词表与查询扩展、高亮片段截取 | 否 |
| `inverted-index.js` | `PHR.search.index` | 建立 `token → 记录 id` 倒排表与词频，TF-IDF 召回，缓存与自动失效，`fieldsOf()` 字段拆解 | 否 |
| `filters.js` | `PHR.search.filters` | 筛选条件的唯一口径：默认值、候选项、过滤函数、中文标签、一句话描述、8 个预设 | 否 |
| `history.js` | `PHR.search.history` | 搜索历史（最多 50 条）/ 常用搜索收藏 / 热门关键词统计，落 `PHR.store` | 否 |
| `search.service.js` | `PHR.search.service` | 检索主流程与对外 API（`run` / `runAsync` / `suggest` / `quickSearch` / `stats`），写审计与历史 | 否 |
| `search.view.js` | 视图 `search` | `#/search` 页面：搜索框、联想下拉、预设、高级筛选、条件 chip、结果列表、匹配原因、侧栏统计 | 是 |

### ⚠️ 加载顺序

`fuzzy.js` **必须是本目录第一个被加载的文件**（它负责 `PHR.search = PHR.search || {}`）。
推荐顺序即上表自上而下：

```html
<script src="modules/search/fuzzy.js"></script>
<script src="modules/search/inverted-index.js"></script>
<script src="modules/search/filters.js"></script>
<script src="modules/search/history.js"></script>
<script src="modules/search/search.service.js"></script>
<script src="modules/search/search.view.js"></script>
```

各文件彼此之间在**加载期**不互相取值（`filters.js` / `inverted-index.js` 等在被调用时才解析依赖，
且每个文件都会自行补 `PHR.search = PHR.search || {}`），因此顺序错乱也不会抛异常；
但 `fuzzy.js` 若不是第一个加载，`PHR.search` 命名空间会被其它文件先创建，功能仍然可用。

---

## 二、对外 API

界面层通常只需要 `PHR.search.run()` 与 `PHR.search.suggest()`；
其余子命名空间可按需单独使用（例如 `PHR.search.quickSearch()` 给顶栏搜索框用）。

### 2.1 `PHR.search.service`（同时平铺到 `PHR.search.*`）

| 方法 | 签名 | 说明 |
|---|---|---|
| `run` | `run(query, filter, opt) → 结果对象` | **主入口**。空查询时按条件直接列记录；有查询时用索引召回 + 打分精排 |
| `runAsync` | `runAsync(query, filter, opt) → Promise<结果对象>` | 同上，但把精排循环切成 40 条一片、片间让出主线程，适合输入框实时触发 |
| `suggest` | `suggest(prefix, limit) → {keywords, types, diseases, drugs}` | 输入联想；`prefix` 为空时返回热门关键词 |
| `quickSearch` | `quickSearch(query, limit) → [{id,title,type,typeName,dateText,score}]` | 极简入口，默认前 8 条，供顶栏全局搜索使用 |
| `stats` | `stats() → {index, history, synonyms, drugs}` | 索引统计 + 历史统计，页面右下角展示 |

`opt` 可选字段：`limit`（默认 50）、`remember`（是否写入搜索历史）、`audit`（是否写审计，默认 `true`）、`sort`。

结果对象结构：

```js
{
  items: [{                       // 命中的记录（含打分与高亮片段）
    record,                       // 原始记录对象
    score,                        // 0~1 综合相关度
    highlights: [{ field, label, text, term, hit }],  // 命中关键词附近的上下文片段
    matchedFields: ['title', 'itemName', …]           // 命中了哪些字段
  }],
  total,        // 命中总数
  shown,        // 实际返回条数（受 limit 限制）
  took,         // 耗时（毫秒）
  query, filter, sort,
  expanded,     // 是否做了同义词扩展
  terms,        // 实际使用的查询词（含同义词）
  suggestions   // 无结果时的替代关键词建议
}
```

### 2.2 其余子命名空间

| 命名空间 | 方法 |
|---|---|
| `PHR.search.fuzzy` | `tokenize(text)` `normalize(text)` `levenshtein(a,b,limit)` `similarity(a,b)` `subsequenceMatch(query,text)` `score(query,text,tokens)` `expand(query,max)` `snippet(text,term,radius)` `synonyms`(数组) `drugs`(数组) `synonymMap()` |
| `PHR.search.index` | `build()` `ensure()` `invalidate()` `search(terms) → Map(id→分数)` `keys()` `stats()` `fieldsOf(record)` `textOf(record)` `FIELD_WEIGHT` |
| `PHR.search.filters` | `default()` `options()` `apply(records,filter)` `activeChips(filter)` `describe(filter)` `presets()` `SOURCES` `SORT_OPTIONS` |
| `PHR.search.history` | `add(keyword,filter,count)` `list(limit)` `remove(id)` `clear()` `popular(limit)` `saved()` `save(name,keyword,filter)` `removeSaved(id)` `toFilter(item)` `stats()` |

### 2.3 筛选条件对象（`PHR.search.filters.default()`）

| 字段 | 类型 | 含义 |
|---|---|---|
| `keyword` | string | 关键词（与主搜索框同源） |
| `types` | string[] | 记录类型 key（14 类，见 `PHR.dict.recordTypes`） |
| `diseaseCats` | string[] | 疾病分类 key（见 `PHR.dict.diseaseCategory`） |
| `scopes` | string[] | 授权范围 key（见 `PHR.dict.consentScope`） |
| `sources` | string[] | `manual` / `sync` / `import` |
| `severities` | string[] | 严重程度 key（见 `PHR.dict.severity`） |
| `tags` | string[] | 标签（任一命中即可） |
| `from` / `to` | string | `'YYYY-MM-DD'`；`to` 会自动补到当天 23:59:59 |
| `abnormalOnly` | boolean | 只看被标记为异常的记录 |
| `sort` | string | `relevance` / `date` / `dateAsc` |

预设筛选（`presets()`，共 8 个）：近 3 个月的检验报告、所有异常结果、长期用药相关、
心血管相关全部记录、去年的体检、过敏相关、近 30 天体征指标、医院同步的数据。

---

## 三、注册的视图与路由

| 项 | 值 |
|---|---|
| 视图名 | `search` |
| 路由 | `#/search`（自动获得 `#/search/<p1>`、`#/search/<p2>`） |
| 标题 / 图标 / 分组 / 排序 | 智能检索 / 🔍 / `main` / `order: 4`（工作台 0 → 档案 2 → 时间线 3 → **检索 4** → 授权 5 → 洞察 5 → 追踪 6） |
| 所属模块 | `search`（由 `search.service.js` 调用 `PHR.registerModule('search', …)` 注册，标题「智能搜索」，`order: 3`；面包屑与审计日志会读取它） |
| 查询串 | `#/search?q=血压&preset=recent_lab&type=vital` 均被识别：`q` 预填并立即检索、`preset` 套用预设、`type` 预选记录类型 |

顶栏 `#global-search` 按 Enter 会跳到 `#/search?q=…`，本视图直接接住该参数；
结果条目点击跳 `#/records-edit/<id>` 进入档案编辑页。每条结果会先显示一句"为什么匹配"：
有关键词时列出命中的字段（如检验项目、摘要、药品名、医院名），只有筛选条件时说明
"匹配当前筛选条件"。这样用户不需要从高亮片段里猜系统为什么返回这条记录。

---

## 四、检索算法

### 4.1 中文分词（`fuzzy.tokenize`）

索引与查询使用**同一套**分词，才能保证"能搜到的"和"被索引的"一致。

| 输入片断 | 输出 token |
|---|---|
| 汉字串 `原发性高血压` | 单字 `原/发/性/高/血/压` + 二元组 `原发/发性/性高/高血/血压` + 整串（长度 ≤ 6 时才加）`原发性高血压` |
| 英文数字 `HbA1c` `7.9` `CT` | 转小写后整体作为一个词：`hba1c` `7.9` `ct` |
| 标点、空白、全角字符 | 视为分隔符；全角先转半角（`！-～`） |

- **为什么用单字 + 二元组**：中文没有空格，二元组已经能覆盖绝大多数医学词
  （`血压`/`血糖`/`红斑`），单字则保证"用户只打了一个字"时还有召回；整串 token 让完整词拿到更高权重。
- 分词**不去重**：重复出现的 token 就是词频（TF），倒排索引直接用它。
- 长词（如药名"苯磺酸氨氯地平片"，8 个字）不会被整体索引，检索时由
  `index.search()` 把它拆成二元组回退命中（见 4.3）。

### 4.2 倒排索引（`inverted-index.js`）

对每条记录调用 `fieldsOf(record)` 拆出带权重的字段，拼成可搜索文本后分词：

```
postings: { token: { 记录id: 该 token 在本记录中的出现次数 } }
docs:     { 记录id: { len: token 总数, counts: {token: 次数}, type, date } }
df:       { token: 出现在多少条记录中 }
```

- **可搜索文本包含**：标题、记录类型名与说明、疾病分类名、摘要、**全部 data 字段值**
  （`select` / `multiselect` 类值一律用 `PHR.dict.nameOf` 转成中文，否则搜"心血管内科"永远搜不到）、
  医院名、医生名、标签、数据来源名，以及一个低权重的"标识"字段
  （类型 key、疾病分类 key、`select` 原始值，让 `cardio` / `vital` / `systolic` 这类英文也能搜）。
- **结果解释**：`search.service.js` 返回 highlights；`search.view.js` 汇总高亮字段，
  渲染为"匹配到：..."，用于给用户解释结果来源。
- **缓存与失效**：索引常驻内存，订阅 `record:changed` / `auth:login` / `auth:logout` / `auth:register`
  后 `debounce(300ms)` 置脏，下次检索时自动重建；也可手动 `invalidate()`。
- `fieldsOf()` 与 `textOf()` **共用同一份字段定义**，保证"索引里能命中的内容一定能被打分函数命中"，
  不会出现"召回了却算不出分"的自相矛盾（模块自测中有该不变量的断言）。

### 4.3 召回（`index.search`）

对每个查询词按 **TF-IDF** 累加：

```
idf = ln(1 + N / (1 + df))          N = 记录总数
tf  = 该词在记录中的次数 / 记录 token 总数
得分 = Σ (tf × idf × 词权重)
```

| 情形 | 词权重 |
|---|---|
| 长度 ≥ 2 的 token（二元组、英文词、药名） | 1.0 |
| 单字 token | 0.35（区分度低） |
| 索引中没有该词，但存在以它开头的 token（前缀命中） | × 0.6 |
| 索引中没有该词，拆成二元组命中（长药名等） | × 0.5 |

最后把本次查询内的最高分归一化到 1，得到 `Map(记录id → 0~1)` 的相对分。

### 4.4 精排打分（`fuzzy.score`）

对候选记录的每个字段分别打分，四种情形**取最高分**（不叠加，避免虚高）：

| 优先级 | 情形 | 分值区间 | 理由 |
|---|---|---|---|
| ① | 精确包含（`indexOf`） | **0.85 ~ 1.00** | 最可信。位置越靠前、占文本比例越高分越高（标题开头命中 > 正文中间命中） |
| ② | 子序列命中 | **0.55 ~ 0.80** | 用户少打几个字（`低密蛋白` → `低密度脂蛋白`）；命中越集中分越高，每处断档扣 0.01 |
| ③ | bigram / 单字重合率 | **0 ~ 0.55** | 语序不同但用词一致（`血压 高` → `原发性高血压`）。二元组权重 1、单字 0.4；**故意不设保底分**，否则命中一个"不""的"就能拿 0.2，会把无关记录全捞进来 |
| ④ | 编辑距离兜底 | **0 ~ 0.35** | 仅当前三项毫无线索时才计算（省掉大量距离矩阵运算），容忍一两个错别字"糖血病"→"糖尿病"；分数刻意压低 |

字段权重（`FIELD_WEIGHT`）：

| 字段 | 权重 | 字段 | 权重 |
|---|---|---|---|
| 标题 `title` | 1.00 | 记录类型 `type` | 0.50 |
| 标签 `tags` | 0.80 | 标识 `keys`（英文 key） | 0.35 |
| 摘要 `summary` | 0.70 | 其它 data 字段 | 0.60 |
| 疾病分类 `diseaseCat` | 0.60 | 数据来源 `sourceName` | 0.55 |

单条记录的最终分：

```
字段分 = max(各字段 fuzzy.score × 字段权重)          // 字段分 < 0.15 视为未命中
最终分 = 字段分 × 0.6 + 索引召回分 × 0.4 + min(0.1, (命中字段数-1) × 0.02)
```

排序：`relevance` 按最终分降序（同分按日期倒序）；`date` / `dateAsc` 按记录发生日期。
候选集上限 800 条（按召回分截断），默认返回 50 条（视图展示 30 条）。

### 4.5 同义词扩展（`fuzzy.expand`）

内置 **50 组**医学术语同义词（`fuzzy.synonyms`），覆盖指标、疾病、药品通用名↔商品名、症状、生活方式：

```
血压 ↔ 高血压 ↔ BP ↔ 收缩压 ↔ 舒张压    血糖 ↔ 糖尿病 ↔ 糖化血红蛋白 ↔ HbA1c
血脂 ↔ 胆固醇 ↔ 低密度脂蛋白 ↔ LDL       感冒 ↔ 上呼吸道感染      心梗 ↔ 心肌梗死
脑梗 ↔ 脑梗死 ↔ 脑卒中 ↔ 中风            尿酸 ↔ 痛风             肝功能 ↔ ALT ↔ 谷丙转氨酶
肾功能 ↔ 肌酐 ↔ eGFR                     过敏 ↔ 变态反应         体重 ↔ BMI ↔ 肥胖
睡眠 ↔ 失眠                              阿司匹林 ↔ 拜阿司匹灵    氨氯地平 ↔ 络活喜
二甲双胍 ↔ 格华止                         阿托伐他汀 ↔ 立普妥 ……（共 50 组，另附 64 条药品词库）
```

`expand(query)` 先整串匹配，再按标点/空格拆段匹配（`高血压 2 级` 也能命中"高血压"组），
返回 `{terms: [原词 + 同义词], expanded: true|false}`，最多 24 个词。
命中的记录会在结果头部标注"已按同义词扩展"，审计日志里也会记下扩展出的词。

### 4.6 高亮片段（`fuzzy.snippet`）

在字段原文中定位命中词，向前后各取 30 个字符，两端加 `…`，返回
`{text, term, hit}`；`term` 是**原文中真实出现的片段**，供界面用 `PHR.util.highlight()` 包 `<mark>`。
若只是子序列命中（原文没有原样的词），`term` 取真实的那一段，保证高亮框住的是正文里存在的内容。
所有片段在插入 `innerHTML` 前都会经过 `PHR.ui.dom.esc()` / `PHR.util.highlight()` 转义。

### 4.7 空查询与兜底

- **空查询**：不做相关性计算，直接按筛选条件列出记录（`score = 1`），按日期或指定顺序排。
- **索引零召回**：退化为对全部记录做一次线性模糊扫描（`fuzzy.score ≥ 0.2`），
  保证同义词不在索引里、或索引尚未建好时仍有结果。
- **零结果**：返回 `suggestions`（同义词候选 + 热门关键词），界面渲染成可点击的 chip。
- **单字噪声**：长度 1 的 token 会被召回阶段丢弃（除非用户明确只搜一个字），
  避免 `zzzz不存在zzzz` 这类输入因为命中一个"不"字而返回一堆无关记录。

---

## 五、数据与审计

| 存储键（自动带 `phr.v1.` 前缀） | 内容 | 上限 |
|---|---|---|
| `search_history` | 搜索历史：`{id, keyword, filter, sig, count, repeat, at}` | 50 条，超出按时间淘汰 |
| `search_saved` | 常用搜索：`{id, name, keyword, filter, at}` | 30 条 |

- 相同条件的搜索**不重复堆积**：只把最近一次顶到最前，重复次数记在 `repeat` 上，
  `popular()` 用它统计真实频次（`count`），列表本身始终干净。
- 审计：每次**用户显式触发**的检索写一条 `action: 'search.run'` 日志，
  `detail` 形如 `关键词：血压　命中 7 条　条件：近 90 天 · 检验报告`。
  输入框实时联想触发的检索传 `audit:false` / `remember:false`，不写审计与历史，避免刷屏。
  调用方式为防御式：`if (PHR.audit && PHR.audit.log) { … }`。

---

## 六、与其它模块的接口

| 依赖 | 用途 |
|---|---|
| `PHR.records.service.all()` | 检索的数据源（已按当前用户过滤、按日期倒序） |
| `PHR.records.categories.scopeOf(record)` | 按授权范围筛选 |
| `PHR.dict.recordTypes` / `diseaseCategory` / `severity` / `consentScope` / `metrics` | 类型名、分类名、严重程度、授权范围、指标名（`select` 值转中文） |
| `PHR.store` | 历史与收藏的持久化 |
| `PHR.bus.on('record:changed' …)` | 数据变化后自动重建索引 |
| `PHR.audit.log` | 写 `search.run` 审计（后加载，防御式调用） |
| `PHR.ui.*` | `dom` / `empty` / `badge` / `toast` / `modal`（仅视图层使用） |

## 七、样式

界面**不新增任何 CSS 类**，全部复用 `ui/styles/views.css`「三、智能搜索」与
`ui/styles/components.css` 的既有类：

`.search-bar` `.search-input-wrap` `.filter-panel` `.filter-row` `.date-range` `.saved-search`
`.chip.clickable` `.segmented` `.list` `.list-item` `.card` `.stat` `.pager`。

需要临时定位的地方（联想下拉的浮层定位、侧栏条目的内边距）使用行内 `style`，
与 `modules/records/records.view.js` 的做法一致。

## 八、已知取舍

1. **没有拼音支持**：需求只要求模糊搜索，拼音（`xueya` → 血压）需要拼音表，属于第三方库范畴，
   按约束不引入；同义词表 + 编辑距离已经能覆盖大部分"记不清字怎么写"的场景。
2. **同义词表是人工整理的**：50 组，覆盖常见慢病与常用药，但不可能穷尽；新增只需往
   `fuzzy.synonyms` 里加一行数组。
3. **索引常驻内存**：全部记录的分词结果都留在内存里，演示规模（数百条）无压力；
   若记录量到十万级，需要改成按字段懒索引或落 IndexedDB。
4. **搜索历史不跨账号隔离**：历史与收藏存在浏览器本地、不带 `userId` 前缀，
   同一浏览器的不同账号会看到彼此的关键词（不含任何健康数据本身）。
   如需隔离，可把键名改为 `search_history.<userId>`。
