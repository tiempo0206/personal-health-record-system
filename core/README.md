# core/ —— 核心基础设施层

## 这个文件夹实现了什么

`core/` 不属于任何一个业务模块，它是**九个业务模块共同的地基**。
对应需求原文中反复强调的"分层架构"与"安全治理层贯穿所有环节"：

> "从系统架构上，可以采用分层设计。表现层包括移动端、网页端和医生端视图；
> 业务服务层包括账户服务、档案服务、搜索服务、授权服务、健康洞察服务和审计服务；
> 数据与集成层包括健康档案数据库、文件存储、医院同步接口和备份服务；
> **安全治理层则贯穿所有环节**，包括加密、多因素认证、权限控制、审计轨迹和异常检测。"

本文件夹承载其中的「**数据与集成层**」和「**安全治理层**」。
当前实现的集成入口包括模拟医院同步、CSV/JSON 结构化报告导入和备份导出/恢复。

## 目录结构与每个文件的职责

```
core/
├── README.md              本文件
├── namespace.js           全局命名空间 PHR、模块注册表、视图注册表、全局配置
├── utils.js               与业务无关的纯函数工具集
├── dict.js                数据字典 · 通用枚举（性别/血型/疾病分类/审计动作/授权范围…）
├── dict-records.js        数据字典 · 14 种健康记录类型及其表单字段模式
├── dict-metrics.js        数据字典 · 16 项体征指标及其三级阈值
├── event-bus.js           发布 / 订阅事件总线（模块间解耦通信）
├── crypto.js              口令加盐哈希、随机令牌、加解密、脱敏、口令强度
├── store.js               本地持久化 + 集合仓储(Repository)抽象
├── models.js              数据集合清单、实体工厂、字段校验
├── security.js            安全治理层：口令策略/会话策略/权限矩阵/脱敏/异常检测规则
├── seed.js                演示数据种子（首次打开自动写入）
├── boot.js                应用装配与启动 + 自检
└── i18n/                  中英双语引擎与英文词条（见 core/i18n/README.md）
```

| 文件 | 职责一句话 | 对外挂载点 |
| --- | --- | --- |
| `namespace.js` | 建立 `window.PHR`，提供 `registerModule()` 与 `registerView()` | `PHR`, `PHR.meta`, `PHR.config` |
| `utils.js` | ID、时间、字符串、数组、DOM 助手、节流防抖 | `PHR.util` |
| `dict.js` | 通用枚举的唯一来源 | `PHR.dict` |
| `dict-records.js` | 记录类型与表单 schema 的唯一来源 | `PHR.dict.recordTypes` |
| `dict-metrics.js` | 体征指标与阈值的唯一来源 | `PHR.dict.metrics` |
| `event-bus.js` | 事件订阅与广播 | `PHR.bus` |
| `crypto.js` | 哈希/令牌/加解密/脱敏 | `PHR.crypto` |
| `store.js` | 键值存储与集合仓储 | `PHR.store`, `PHR.db` |
| `models.js` | 集合清单、实体构造、校验 | `PHR.models`, `PHR.db` |
| `security.js` | 策略与规则的集中地 | `PHR.security` |
| `seed.js` | 演示数据 | `PHR.seed` |
| `boot.js` | 启动与自检 | `PHR.boot` |

## 加载顺序（不可调换）

```
namespace.js
    ↓
utils.js → dict.js → dict-records.js → dict-metrics.js
    ↓
event-bus.js → crypto.js → store.js → models.js → security.js → seed.js
    ↓
（ui/ 与 modules/ 全部加载完毕后）
    ↓
boot.js   ← 最后一个加载
```

**为什么**：
- `namespace.js` 定义 `PHR` 本身，其余文件都以 `(function (PHR) {...})(window.PHR)` 取用它；
- `models.js` 依赖 `store.js`（`PHR.db` 的 getter 会调用 `PHR.store.collection`）；
- `seed.js` 依赖 `models.js` 与 `crypto.js`；
- `boot.js` 需要所有模块的视图注册完毕才能生成导航，因此必须最后加载。

> 注意：`dict-records.js` 中"体征指标"字段的候选项写成了函数形式
> （`options: function () { return PHR.dict.metrics... }`），
> 就是为了与 `dict-metrics.js` 解耦加载顺序 —— 表单渲染时才求值。

## 三个字典文件为什么单独拆出来

需求里出现了大量"枚举"性质的数据：14 种记录类型、每种的表单字段、
血压/血糖的正常范围、10 个授权范围、36 个审计动作……

如果把这些硬编码在各个模块里，会出现三类问题：
1. **口径漂移**：录入表单允许"重度"，统计分析却只认"严重"；
2. **改一处漏一处**：新增一个记录类型要改 5 个文件；
3. **无法审计**：说不清系统到底覆盖了哪些数据类型。

因此确立原则：**字典是数据的唯一来源，模块只负责行为**。

- `dict.js` —— 通用枚举
- `dict-records.js` —— 记录类型与**表单 schema**（`ui/components/form.js` 据此自动渲染表单）
- `dict-metrics.js` —— 体征指标的**三级阈值模型**

## 三级阈值模型（dict-metrics.js）

```
        normal 区间内        →  ok        正常
   normal 之外、warn 之内     →  warning   需要关注
        超出 warn 区间        →  critical  明显异常，建议尽快就医
```

```js
{
  key: 'systolic', name: '收缩压（高压）', unit: 'mmHg',
  normal: { min: 90, max: 129 },
  warn:   { min: 80, max: 179 },
  better: 'lower',           // lower | higher | range —— 用于判断"变好还是变坏"
  target: 120,               // 目标值，画参考线用
  adviceNormal / adviceWarn / adviceCritical   // 三个等级各自对应的建议文案
}
```

判定入口只有一个：`PHR.dict.judge(metricKey, value)` → `'ok' | 'warning' | 'critical' | 'unknown'`。
录入时的实时提示、趋势图的底纹、异常告警、风险评估全部调它，因此颜色与文案永远一致。

## 数据存储抽象（store.js）

所有业务模块都**只通过 `PHR.store` 与 `PHR.db` 读写数据**，不直接接触 `localStorage`。

```
localStorage（或内存降级）
      ↑
PHR.store          键值读写 / 配额估算 / 会话级存储 / 集合仓储工厂
      ↑
PHR.db.users / .records / .consents / .audits / ...   懒加载的仓储对象
      ↑
各业务模块
```

集合仓储提供：`all()` `where(fn)` `byId(id)` `firstBy(f, v)` `count()` `insert(row)`
`insertMany(rows)` `update(id, patch)` `replace(id, row)` `remove(id)` `removeWhere(fn)`
`replaceAll(rows)` `clear()`。写操作完成后会自动通过事件总线广播
（例如 `records` 集合配置了 `event: 'record:changed'`）。

**降级策略**：隐私模式或禁用存储时自动改用内存存储，并在界面上明确告知用户
"数据仅保存在内存中，关闭页面即丢失"（见 `PHR.security.posture()`）。

**12 张数据表**（定义在 `models.js` 的 `PHR.db.schema`）：

| 集合 | 前缀 | 说明 |
| --- | --- | --- |
| `users` | U | 账号（口令为加盐哈希） |
| `profiles` | P | 个人基本信息（与账号 1:1） |
| `records` | R | 全部健康记录（14 种类型统一存放） |
| `versions` | V | 记录的历史版本 |
| `consents` | C | 医生授权 |
| `audits` | L | 审计日志 |
| `alerts` | A | 安全告警 |
| `posts` / `replies` | M / N | 患者社群 |
| `prefs` | F | 用户偏好 |
| `syncLogs` | S | 医院同步 / 报告导入记录 |
| `assessments` | E | 心理测评记录（作答、得分与报告）★模块 9 |

## 安全治理层（security.js）

把散落在需求文档里的安全要求沉淀成**可执行的策略对象**：

| 策略 | 方法 | 说明 |
| --- | --- | --- |
| 口令策略 | `passwordPolicy(pwd)` | 长度、字符种类、弱口令黑名单，返回问题清单与强度分 |
| 会话策略 | `sessionPolicy` | `trustLimit()` / `isExpired(s)` / `remainingSeconds(s)`（登录保持 7 天，绝对到期，**无空闲超时**） |
| 角色权限矩阵 | `permissions` / `can(role, perm)` | patient / doctor 两种角色的权限清单 |
| 数据脱敏 | `masker.profile(p, viewer)` / `.field(name, v)` | self 完整 / doctor 部分脱敏 / public 全部脱敏 |
| 异常检测 | `anomalyRules` / `detectAnomalies(entries, ctx)` | 6 条规则，供 modules/audit 调用 |
| 输入净化 | `sanitizeText(text, maxLen)` | 去掉标签与控制字符 |
| 安全体检 | `posture(user)` | 5 项检查 + 0~100 分，供"账号与安全"页展示 |

**规则只在这里定义一次**：`modules/audit/security-anomaly.js` 只负责调用与落库，
`modules/insight/anomaly-detector.js` 则处理健康指标层面的异常 —— 两者的阈值来源互不重叠。

## 加密能力的真实边界

| 能力 | 实现 | 强度 |
| --- | --- | --- |
| 口令存储 | 加盐 SHA-256（`sha256$盐$摘要`） | ✅ 演示可用；生产须换成 bcrypt/scrypt/Argon2 |
| 口令校验 | `verifyPassword(pwd, stored)` | ✅ 恒定比较 |
| 敏感字段脱敏 | `maskPhone` / `maskIdCard` / `maskName` / `maskEmail` | ✅ 展示层真实生效 |
| 数据导出加密 | `encrypt(obj, key)` / `decrypt(cipher, key)` | ⚠️ XOR 流 + Base64，**演示级**，生产须用 WebCrypto AES-GCM |
| 传输加密 | 无（纯前端） | ❌ 生产必须全站 HTTPS |

`crypto.js` 里的 SHA-256 是**纯 JavaScript 实现**，不依赖 `crypto.subtle`，
因此在 `file://` 协议下也能正常工作 —— 这是"双击即用"的必要条件。

## 演示数据（seed.js）

首次打开时写入，让评审不必注册和手工录入就能看到全部模块的实际效果：

| 内容 | 数量 |
| --- | --- |
| 演示账号 | 4 个：`demo`（完整数据 + 短信&人脸）、`test`（另一套数据）、`empty`（完全空白）、`nomfa`（关闭多因素） |
| 个人基本信息 | 3 份（含身份证与紧急联系人，用于演示脱敏） |
| 健康记录 | 422 条，覆盖全部 14 种类型，跨度约 3 年 |
| 体征指标 | demo 约 200 条（最近 90 天，含一条明显的治疗改善趋势与一次"熬夜导致血压升高"的异常波动）；test 另有一套 45 天不改善的对照数据 |
| 医生授权 | 7 条（5 条生效中 / 1 条已撤销 / 1 条已过期） |
| 审计日志 | 21 条（含登录失败与越权被拒绝的演示数据） |
| 社群内容 | 5 个主帖 + 3 条回复 |

> 📄 账号口令、全部授权码与万能验证码见根目录 **`测试账号与授权码.txt`**。
> 这些口令是**明文写在源码里**的（`core/seed.js` 的 `ACCOUNTS` 常量），
> 目的是让演示"双击即用"。真实产品绝不能预置任何账号 —— 见
> 《开发者说明书》第 14 章生产化清单第 0 条。

在浏览器控制台执行 `PHR.seed.run(true)` 可重建演示数据（**会清空现有数据**）。

## 启动流程（boot.js）

```
installErrorGuard()   全局错误兜底，单模块出错不白屏
      ↓
ensureSeed()          首次运行写入演示数据
      ↓
applyPreferences()    应用主题 / 字号 / 对比度 / 动效（降级：跟随系统深浅色）
      ↓
housekeeping()        清理过期审计日志、把失效授权标记为 expired
      ↓
PHR.shell.boot()      渲染登录页或主框架
      ↓
PHR.router.start()    解析 location.hash 并渲染当前视图
      ↓
移除启动遮罩 → emit('app:ready') → 控制台输出欢迎与自检指引
```

## 自检

在浏览器控制台执行：

```js
PHR.boot.selfTest()      // 逐项检查 24 个模块是否正确加载，输出表格与汇总对象
PHR.boot.debug(true)     // 打开调试日志
PHR.store.usage()        // 查看本地存储占用
PHR.bus.inspect()        // 查看当前事件订阅
```

`PHR.boot.selfTest()` 会检查：核心层 9 项、业务模块 13 项、视图注册情况，
并返回 `{ counts, checks, passed, total, ok }` 的诊断报告。
