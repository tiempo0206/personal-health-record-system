# modules/ux —— 体验保障（模块 8）

本目录实现 **个人健康档案管理系统 (PHR)** 的第 8 个业务模块：**体验保障**。

它不承载具体的医学业务，而是回答三个「用得下去」的问题：

| 问题 | 由谁回答 |
| --- | --- |
| 看得清、不眩晕吗？（可读性与无障碍） | `preference.js` + `settings` 视图 |
| 数据还完整吗？会不会丢？ | `integrity.js` + `backup.js` |
| 用户知道怎么用吗？ | `help.js` + `help` 视图 |

---

## 一、文件职责与对外 API

| 文件 | 挂载点 | 对外 API | 说明 |
| --- | --- | --- | --- |
| `preference.js` | `PHR.ux.preference`（另暴露 `PHR.ux.toggleTheme`） | `get(key)` / `set(key,value)` / `all()` / `reset([key])` / `apply()` / `toggleTheme()` / `fields()` / `labelOf(key)` / `valueName(key,value)` / `defaults` | 偏好设置的唯一读写出口。持久化到 `PHR.db.prefs`，并把结果写到 `<html>` 的 `data-theme` / `data-fontsize` / `data-contrast` / `data-motion` / `data-density` 上，由 `ui/styles/theme.css` 的 CSS 变量覆盖生效。 |
| `integrity.js` | `PHR.ux.integrity` | `check([opt])` / `planRepair([kinds])` / `repair(kinds, confirmed)` / `RULES` / `FIXABLE` | 数据完整性自检（9 条规则）与三类可自动修复问题的修复。 |
| `backup.js` | `PHR.ux.backup` | `exportAll(encrypt, password)` / `importAll(fileText, password)` / `applyImport(payload, mode)` / `snapshot()` / `restore(snap)` / `resetDemo()` / `clearAll()` / `filename()` | 全量导出（明文 / 口令加密）、导入（校验 + 合并 / 覆盖）、演示数据重建与彻底清空。 |
| `help.js` | `PHR.ux.help` | `sections()` / `search(keyword)` / `article(sectionId, articleId)` / `stats()` / `plain(html)` | 帮助中心的全部文案（纯数据）与关键词检索。 |
| `ux.view.js` | `PHR.registerModule` + 视图注册表 | 注册 `ux` 模块元信息与 `settings`、`help` 两个视图 | 两个页面视图的实现，复用 `ui/components/*` 的既有类名，不新增 CSS。 |
| `dashboard.view.js` | 视图注册表 | 注册 `dashboard` 视图 | **工作台首页视图**（登录后的默认落地页，由另一位成员实现，本目录只负责明确它属于「体验保障」的入口）。 |

所有文件都是 **IIFE + 全局命名空间** 写法，没有 `import` / `export`，不依赖任何第三方库与网络请求，因此 `file://` 双击 `index.html` 即可运行。

---

## 二、视图路由

| 路由 | 视图标题 | 分组 | order | 说明 |
| --- | --- | --- | --- | --- |
| `#/dashboard` | 工作台 | main | —— | 登录后的默认落地页（`dashboard.view.js`，非本模块文件清单） |
| `#/settings` | ⚙️ 偏好与安全 | system | 90 | 四个页签：外观与无障碍 / 提醒设置 / 安全设置 / 数据与存储 |
| `#/settings/appearance` | 同上 | system | 90 | 直接落到「外观与无障碍」页签（`#/settings/alerts`、`#/settings/security`、`#/settings/data` 同理） |
| `#/help` | ❓ 使用帮助 | system | 92 | 左侧目录 + 右侧正文 + 顶部关键词搜索 |

用户登录后的落地页可在「偏好与安全 → 外观与无障碍」中改为上述任意一个可导航视图（`preference.set('homeView', ...)`）。

---

## 三、目录树

```
modules/ux/
├── README.md            本文档
├── preference.js        偏好设置（可读性 / 无障碍 / 提醒敏感度 / 默认落地页）
├── integrity.js         数据完整性自检与可自动修复项
├── backup.js            数据备份、恢复、演示数据重建与清空
├── help.js              帮助中心文案与检索
├── ux.view.js           settings（偏好与安全）、help（使用帮助）两个视图
└── dashboard.view.js    工作台首页视图（由另一位成员实现）
```

---

## 四、关键约定与取舍

1. **偏好的存储位置**：一个用户一行记录写在 `PHR.db.prefs`（集合定义见 `core/models.js`）。
   未登录时（登录页、医生访客视图）读取 `PHR.store` 中的 `prefs.mirror` 镜像，
   避免「登录前浅色、登录后突然变深色」的观感跳变。
   同时兼容早期演示数据里的布尔字段 `reduceMotion` / `highContrast`。
2. **`homeView` 不硬编码**：候选项来自 `PHR.navViews()`，因此新增模块后无需修改本模块。
3. **信息密度（`density`）**：`ui/styles/theme.css` 没有对应变量，`preference.apply()` 在
   `<html>` 上设置 `data-density`，并直接收紧 `--sp-3 ~ --sp-6` 四个间距令牌（不新增任何 CSS 类）。
4. **审计**：所有对外动作都通过 `PHR.audit && PHR.audit.log(...)` 防御式写入
   `ux.settings` / `ux.integrity` / `ux.export` / `ux.import` 四类动作（字典见 `core/dict.js`）。
   审计模块可能后加载，缺失时静默跳过。
5. **不可自动修复的问题只报告不改动**：`integrity.repair()` 只处理
   `orphan` / `date_out_of_range` / `invalid_type` 三类，且必须先返回「将要做什么」，
   由调用方（界面）弹二次确认后再以 `repair(kinds, true)` 执行。
6. **导入安全性**：`applyImport()` 在写入前一定会留一份内存快照，写入异常自动整体回滚；
   导入完成后会把各集合的 id 计数器推到已导入的最大序号之后，避免后续新增产生重复 id。
7. **清空数据后防止自动回灌**：`clearAll()` 会显式写入 `seeded = true`，
   否则下次打开页面时「首次运行写入演示数据」的逻辑会把数据又装回来。
