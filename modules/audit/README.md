# modules/audit —— 访问追踪模块（模块 6）

## 这个文件夹实现了什么

本文件夹实现**个人健康档案管理系统**的**第 6 个业务模块：访问追踪**。

对应需求原文中的两句话：

> "第五和第六分别是医生授权和访问追踪，也就是用户可以把部分资料临时开放给医生，
> 同时系统记录谁在什么时候访问了哪些内容。"

> "所有访问都会写入日志，权限到期后自动失效或由用户手动撤销。"

本模块负责把"**谁、在什么时间、从哪里、访问了什么、结果如何**"完整记录下来，
并在此基础上做**异常行为识别**——这是把"隐私保护"从口号变成可验证事实的关键一环。
授权管理（modules/consent）解决"能不能看"，访问追踪解决"看了什么、看了几次、是否越界"。

## 目录结构与每个文件的职责

```
modules/audit/
├── README.md              本文件
├── audit.service.js       审计日志的唯一写入口 + 基础读取 + 环境信息(IP/设备) + 过期清理
├── audit.query.js         多条件筛选、统计聚合、CSV/JSON 导出
├── anomaly.js             异常访问检测落库、告警管理、账号风险评分
└── audit.view.js          注册「访问追踪」页面（四个页签）
```

| 文件 | 职责 | 对外挂载点 | 行数级别 |
| --- | --- | --- | --- |
| `audit.service.js` | 写日志、读日志、动作字典查询、环境信息、按保留期清理 | `PHR.audit.log` / `.all` / `.mine` / `.envInfo` | ~180 |
| `audit.query.js` | 筛选与统计：按分组/动作/天/医生/小时；导出 CSV、JSON | `PHR.audit.query` / `.stats` / `.byGroup` / `.exportFile` | ~230 |
| `anomaly.js` | 调用安全治理层的规则做检测，把新异常去重落库，维护告警状态与风险分 | `PHR.audit.scanAlerts` / `.alerts` / `.riskScore` | ~180 |
| `audit.view.js` | 页面：操作日志 / 安全告警 / 医生行为 / 统计分析 | 视图 `audit` | ~420 |

## 数据存放在哪里

| 集合 | 定义位置 | 说明 |
| --- | --- | --- |
| `audits` | `core/models.js` → `PHR.db.schema.audits` | 审计日志主表，前缀 `L` |
| `alerts` | `core/models.js` → `PHR.db.schema.alerts` | 安全告警表，前缀 `A` |

两条记录的字段结构由 `core/models.js` 的 `models.audit.create()` 统一构造，
`core/seed.js` 的 `seedAudits()` 在首次打开时会写入 21 条演示日志。
动作字典（动作名、所属模块、风险等级）唯一来源是 `core/dict.js` 的 `PHR.dict.auditAction`。

## 对外暴露的 API

### 写入

| 方法 | 说明 |
| --- | --- |
| `PHR.audit.log(input)` | **全系统唯一写入口**。任何模块做敏感动作后都应调用。`input` 支持 `action` `targetType` `targetId` `targetName` `detail` `result` `actor` `actorType` `userId` `at` `ip` `device` |
| `PHR.audit.logView(view)` | 由 `ui/shell.js` 在页面切换时自动调用，记录"浏览了哪个页面" |
| `PHR.audit.purgeExpired()` | 按 `PHR.config.auditRetentionDays`（默认 365 天）清理过期日志 |

### 读取与统计

| 方法 | 返回 |
| --- | --- |
| `PHR.audit.all()` / `.mine()` | 全量 / 当前用户的审计日志（时间倒序） |
| `PHR.audit.query(filter)` | 按时间、动作、分组、结果、身份、关键词、风险筛选 |
| `PHR.audit.stats()` | 总数 / 今日 / 近 7 天 / 越权数 / 失败数 / 医生数 |
| `PHR.audit.byGroup()` `.byAction(n)` `.byDay(n)` `.byDoctor()` `.byHour()` | 各类聚合统计 |
| `PHR.audit.toCsv(list)` / `.exportFile('csv'\|'json', list)` | 导出（CSV 带 BOM，Excel 打开不乱码） |
| `PHR.audit.actionName(k)` / `.actionGroup(k)` / `.actionRisk(k)` | 动作字典查询 |
| `PHR.audit.envInfo()` | 当前会话的伪 IP 与设备信息 |

### 异常检测与告警

| 方法 | 说明 |
| --- | --- |
| `PHR.audit.scanAlerts()` | 重新扫描日志，把新异常去重后写入告警表，返回本次新增项 |
| `PHR.audit.liveAlerts()` | 只计算不落库，用于"实时检测结果"卡片 |
| `PHR.audit.alerts()` | 已落库的告警列表 |
| `PHR.audit.countUnreadAlerts()` | 未读告警数（顶栏铃铛红点） |
| `PHR.audit.markAlertsRead()` / `.dismissAlert(id)` / `.clearAlerts()` | 告警状态管理 |
| `PHR.audit.riskScore()` | 把告警折算为 0~100 的账号风险分与等级 |

## 六条异常检测规则

规则本体写在 **`core/security.js` → `PHR.security.anomalyRules`**（安全治理层），
本模块只负责调用与落库。这样阈值只维护一处，界面、后端校验、审计口径永远一致。

| 规则 key | 名称 | 触发条件 | 等级 |
| --- | --- | --- | --- |
| `brute_force` | 疑似暴力破解 | 10 分钟内 ≥3 次登录失败 | 高 |
| `account_locked` | 账号被锁定 | 24 小时内触发过登录失败锁定 | 高 |
| `off_hours_access` | 非惯常时段访问 | 医生在 00:00—06:00 访问档案 | 中 |
| `bulk_read` | 短时批量查阅 | 单条授权 24 小时内被查阅 ≥15 次 | 中 |
| `denied_access` | 越权访问被拒绝 | 存在 `consent.denied` 日志 | 高 |
| `export_activity` | 数据导出行为 | 7 天内发生过完整数据导出 | 中 |

**去重策略**：同一条规则在同一天内只产生一条告警（`dedupeKey = 规则名@日期`），
重复触发时只更新计数与详情，避免刷屏。

## 注册的页面（路由）

| 路由地址 | 视图名 | 说明 | 是否出现在左侧导航 |
| --- | --- | --- | --- |
| `#/audit` | `audit` | 访问追踪主页 | ✅ 是（业务模块组，第 6 位） |

页面内共四个页签：

1. **操作日志** —— 可筛选（关键词 / 日期区间 / 模块 / 结果 / 只看风险动作）的审计流水表，支持排序、分页、单条详情弹窗。
2. **安全告警** —— 账号风险评分仪表盘 + 实时检测结果 + 告警卡片列表（含处置建议与"去管理授权"快捷入口）。
3. **医生行为** —— 每位医生的访问次数柱状图、24 小时时段分布、明细表（含越权被阻断次数与来源 IP）。
4. **统计分析** —— 按业务模块的环形图、最频繁操作、近 30 天趋势、结果构成。

## 与其它模块的关系

```
modules/auth        ──┐
modules/records     ──┤
modules/search      ──┼──► PHR.audit.log({...})  ──►  audits 集合
modules/consent     ──┤                                    │
modules/community   ──┤                                    ▼
modules/ux          ──┘                          PHR.audit.scanAlerts()
                                                            │
                                                            ▼
                                                     alerts 集合 ──► 顶栏铃铛
```

- **上游**：所有模块调用 `PHR.audit.log()` 留痕。
- **下游**：`ui/shell.js` 调用 `PHR.audit.countUnreadAlerts()` 渲染顶栏红点；
  `ui/shell.js` 在页面切换时调用 `PHR.audit.logView()`。
- **横向**：规则来自 `core/security.js`（安全治理层），本模块不自己定义阈值。

## 实现上的取舍与已知限制

1. **伪 IP**：纯前端环境无法获知真实内网 IP，`audit.service.js` 为每个浏览器会话生成一个
   稳定的伪 IP（存在 `sessionStorage`），用于在演示中区分"同一台设备 / 不同设备"。
   真实产品应由服务端在写日志时补齐真实来源地址。
2. **日志可被本地篡改**：审计日志同样存在浏览器 `localStorage` 中，用户理论上可以手动修改。
   生产环境的审计日志必须写入**只追加（append-only）的服务端存储**，
   并配合哈希链或数字签名，才能作为有效证据。
3. **"越权访问被拒绝"的演示来源**：`core/seed.js` 中预置了一条 `consent.denied` 演示日志，
   因为纯本地环境下没有真实的越权请求方。真实产品中该日志由服务端的权限校验中间件写入。
4. **扫描时机**：登录成功后自动扫描一次；每次打开访问追踪页时重新扫描；
   高风险的 `denied` / `auth.locked` / `ux.import` 动作会在写入后立即触发一次扫描。
