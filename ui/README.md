# ui/ —— 表现层

## 这个文件夹实现了什么

`ui/` 是实现需求中「**表现层**」的文件夹：

> "表现层包括移动端、网页端和医生端视图；业务服务层包括账户服务、档案服务、
> 搜索服务、授权服务、健康洞察服务和审计服务。"

它由三部分组成：

| 子目录 / 文件 | 职责 |
| --- | --- |
| `ui/styles/` | 设计令牌、基础样式、外壳布局、组件样式、各视图局部样式 |
| `ui/components/` | 8 个通用 UI 组件（DOM 助手、徽章、空状态、提示条、弹窗、图表、表格、表单） |
| `ui/router.js` | 基于 `location.hash` 的前端路由 |
| `ui/shell.js` | 应用外壳：登录页 / 主框架 / 医生受限模式的切换与装配 |

**业务模块不直接操作 DOM 细节**：它们调用 `PHR.ui.*` 组件生成界面片段，
调用 `PHR.router.go()` 跳转，调用 `PHR.registerView()` 注册页面 ——
这样界面风格才能保持统一。

## 目录结构

```
ui/
├── README.md              本文件
├── router.js              前端路由（哈希路由 + 路径参数 + 查询串）
├── shell.js               应用外壳（导航 / 顶栏 / 内容区 / 会话倒计时 / 医生模式）
├── components/
│   ├── dom.js             DOM 与字符串助手（转义、属性、事件委托、下载、复制）
│   ├── badge.js           各类徽章：严重程度、记录类型、授权状态、审计结果…
│   ├── empty.js           空状态 / 加载中 / 骨架屏 / 内联通知条
│   ├── toast.js           右上角浮层提示
│   ├── modal.js           模态框、二次确认、详情弹窗
│   ├── chart.js           纯 SVG 图表引擎（折线/柱状/环形/迷你线/仪表/刻度尺）
│   ├── table.js           带排序、分页的数据表格
│   └── form.js            schema 驱动的表单渲染与读取
└── styles/
    ├── theme.css          设计令牌：颜色、圆角、阴影、间距、字号 + 深色/无障碍覆盖
    ├── base.css           样式重置、全局排版、工具类
    ├── layout.css         应用外壳布局（登录页 / 侧边栏 / 顶栏 / 内容区 / 响应式）
    ├── components.css     通用组件样式
    └── views.css          各业务视图的局部样式
```

## 样式分层与设计令牌

**唯一的颜色来源是 `theme.css` 的 CSS 变量**。业务视图从不写死颜色值。

```
:root {                       /* 浅色（默认） */
  --primary: #0e7490;   --primary-soft: #e0f2f6;
  --ok / --warn / --danger / --info (+ 各自的 -soft 与 -border)
  --c1 … --c8                 图表调色板
  --bg / --surface / --border / --text / --text-2 / --text-3
  --r-xs … --r-xl --r-pill    圆角
  --sh-xs … --sh-lg           阴影
  --sp-1 … --sp-10            间距
  --fs-xs … --fs-3xl          字号
  --sidebar-w / --topbar-h / --content-max
}

:root[data-theme="dark"]            { … }   深色主题
:root[data-fontsize="large"]        { … }   大字号（无障碍）
:root[data-fontsize="xlarge"]       { … }   特大字号
:root[data-contrast="high"]         { … }   高对比度（无障碍）
:root[data-motion="reduced"]        { … }   减少动效（前庭敏感人群）
```

后四组属性由「体验保障 → 偏好设置」写入 `<html>` 的 `data-*` 属性触发，
**改一处样式变量的值，全站同步生效**。

响应式断点：1080px（栅格降列）、1000px（侧栏改为抽屉）、760px（单列）、640px（隐藏搜索框）。

## 组件清单

| 组件 | 主要接口 | 说明 |
| --- | --- | --- |
| `dom` | `esc` `attr` `cls` `el` `setHtml` `delegate` `actions` `num` `or` `chips` `copy` `download` `pickFile` | 所有组件的基础。`actions(root, map)` 按 `data-action` 统一绑事件，视图层因此少写大量 `addEventListener` |
| `badge` | `badge(text, tone)` `badges.severity/recordType/consentStatus/actionRisk/auditResult/source/delta` | 把所有"颜色语义"集中在一处，避免各视图各写一套 |
| `empty` | `empty(cfg)` `loading(text)` `skeleton(n)` `error(msg)` `notice(tone, title, body)` | 保证每个列表页都有友好的零数据提示 |
| `toast` | `toast(msg, type)` / `.ok` `.warn` `.danger` `.info` | 也订阅全局 `'toast'` 事件，业务模块可 `PHR.bus.emit('toast', {...})` 而无需依赖 UI 层 |
| `modal` | `modal(cfg)` `confirm(cfg)→Promise<boolean>` `detailModal(cfg)` `closeModal()` | `confirm` 支持 `requireText`（要求用户输入指定文字才能执行危险操作） |
| `chart` | `line(box, cfg)` `bar` `donut` `sparkline` `gauge` `scaleBar` | **纯 SVG 手写，零依赖**。`line` 支持正常区间底纹 `bands`、目标参考线 `references`、多系列、悬停提示；窗口缩放时自动重绘 |
| `table` | `table(box, cfg)` → `{refresh, getRows, goPage, setSort}` | 列定义支持 `render(row)` 自定义单元格、`sortable`、`align`；内置分页与空状态 |
| `form` | `render(fields, values, errors)` `read(box, fields)` `enhance` `showErrors` `dialog(cfg)` | **schema 驱动**：字段模式来自 `core/dict-records.js`，新增字段无需改视图 |

## 图表引擎为什么不引入 ECharts / Chart.js

需求要求"点击即用"。一旦引入第三方库，就只能通过 CDN 加载，
而 `file://` 协议下既不能 `fetch` 也无法保证联网 —— 评审老师双击打开就会白屏。

因此 `chart.js` 用约 500 行纯 SVG 手写实现，覆盖本项目需要的全部图表类型：

| 方法 | 用途 | 用在哪 |
| --- | --- | --- |
| `line` | 折线图（可带正常区间底纹、目标参考线、多条线、悬停提示） | 健康洞察趋势图、医生视图 |
| `bar` | 柱状图（横向/纵向自适应） | 审计统计、分布图、时段分布 |
| `donut` | 环形图（带图例与中心数值） | 记录类型分布、结果构成 |
| `sparkline` | 迷你趋势线（返回 HTML 字符串） | 首页统计卡片、指标卡片 |
| `gauge` | 环形仪表盘 | 安全评分、风险评分 |
| `scaleBar` | 三级阈值刻度尺 | 指标卡片上显示"当前值落在哪一段" |

## 路由约定

`ui/router.js` 使用 `location.hash`，规则：

```
#/<视图名>                  → 渲染 PHR.views.<视图名>
#/<视图名>/<参数1>/<参数2>   → params.p1 / params.p2
#/<视图名>?k=v&k2=v2        → params 中直接可用（会与 p1/p2 合并）
```

模块也可以注册更复杂的路径：

```js
PHR.router.add('records/edit/:id', function (ctx) {
  // ctx = { path, parts, params:{id}, query }
});
```

更具体的路径优先匹配（按模式段数倒序）。找不到视图时自动回退到 `dashboard`。

**视图描述符**（`PHR.registerView` 的第二个参数）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `title` | 视图名 | 页面标题、导航文字、面包屑 |
| `icon` | `•` | 导航图标（emoji） |
| `group` | `main` | 导航分组：`main`（业务模块）/ `system`（系统与支持） |
| `module` | `''` | 所属业务模块 key，用于面包屑 |
| `order` | 99 | 导航排序 |
| `nav` | `true` | 是否出现在左侧导航 |
| `requiresAuth` | `true` | 是否需要登录 |
| `render(container, params)` | **必需** | 渲染页面内容 |
| `mount(container, params)` | — | render 之后调用（绑图表、起定时器） |
| `unmount()` | — | 离开视图时调用（清理定时器与订阅） |
| `auditView` | `true` | 为 `false` 时不写"浏览页面"的审计日志（首页与审计页用） |

## 应用外壳（shell.js）

`shell.js` 根据状态渲染三种界面之一：

```
未登录          → .auth-screen（左侧品牌区 + 右侧登录/注册/多因素认证）
已登录 · 患者    → .app-shell（侧边导航 + 顶栏 + 内容区）
已登录 · 医生    → .app-shell，但导航只保留「医生视图」一个入口
```

**顶栏**包含：移动端菜单按钮、面包屑、全局搜索框（回车进入检索页，`/` 键聚焦）、
会话空闲倒计时、安全告警铃铛（未读数红点）、深浅色切换、退出登录。

**会话保活**：shell 监听 `click / keydown / mousemove / touchstart / scroll`，
节流 15 秒调用一次 `PHR.session.touch()`，只刷新"最近活动"时间。
（过去这里写的是"排序超时后由 `auth:idle_timeout` 退出登录"—— 空闲自动登出
已经删除，登录状态改为绝对到期 7 天，见 `core/security.js` 的 `sessionPolicy`。）

**键盘无障碍**：`/` 聚焦搜索框、`Esc` 关闭抽屉与最上层弹窗、
`skip-link` 跳过导航直达主内容、所有交互元素都有可见焦点环。

## 加载顺序（不可调换）

```
dom.js                      ← 其它组件都依赖它
badge.js → empty.js         ← empty 被 chart 在运行时调用
toast.js → modal.js
chart.js → table.js → form.js
router.js
        ↓
（modules/ 全部加载完毕）
        ↓
shell.js                    ← 需要所有视图注册完毕才能生成导航
```

## 已知限制

1. **没有虚拟滚动**：记录数超过约 2000 条时，档案列表的卡片视图会变慢
   （表格视图有分页，不受影响）。真实产品应改为窗口化列表。
2. **图表无导出**：`PHR.ui.chart` 生成的是内联 SVG，没有提供"导出 PNG"按钮。
   需要时可以序列化 SVG 后用 Canvas 转 PNG。
3. **打印样式较简单**：只做了「隐藏导航与按钮、避免卡片跨页断裂」的基础处理，
   急救卡的打印效果可以进一步优化。
4. **深色主题的图表底纹**：正常/警戒区间的透明度是按浅色调的，
   深色下对比度略低，可在 `theme.css` 中单独覆盖 `--ok-soft` 等变量改善。
