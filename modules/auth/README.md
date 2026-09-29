# modules/auth —— 账号安全模块（模块 1）

## 这个文件夹实现了什么

本文件夹实现**个人健康档案管理系统**的**第 1 个业务模块：账号安全**。

对应需求原文：

> "第一是安全可靠的账户登录，例如密码、短信验证码和人脸识别等多因素认证，
> 并通过加密保护健康数据。"

> "对于第一版 MVP，我认为应优先完成登录安全、档案管理、搜索、医生授权和访问日志这五个基础闭环。"

本模块是整个系统的**入口闸门**：没有通过它，任何健康数据都不可见。
它解决四个问题：

1. **你是谁** —— 注册、登录、口令加盐哈希存储
2. **怎么证明是你** —— 多因素认证（密码 + 短信验证码 / 人脸识别）
3. **你能待多久** —— 会话管理与空闲自动退出
4. **有人在试你的账号吗** —— 登录失败计数、账号锁定、登录历史

它还额外承载了**医生访客身份**：医生不注册账号，而是凭患者给出的授权码进入一个受限视图
（受限视图的渲染在 `ui/shell.js`，权限校验在 `modules/consent`）。

## 目录结构与每个文件的职责

```
modules/auth/
├── README.md            本文件
├── session.js           会话生命周期：建立/读取/续期/销毁；患者会话 + 医生访客会话
├── lockout.js           登录失败计数与账号临时锁定
├── mfa.js               多因素认证：短信验证码 + 人脸识别（模拟）
├── auth.service.js      注册、两步登录、退出、改密、多因素开关、登录历史
├── auth.view.js         登录 / 注册 / 多因素认证三块界面
└── profile.view.js      「账号与安全」页面
```

| 文件 | 职责 | 对外挂载点 | 行数级别 |
| --- | --- | --- | --- |
| `session.js` | 会话对象读写、7 天登录保持（localStorage / sessionStorage 二选一）、医生访客会话 | `PHR.session.*` | ~200 |
| `lockout.js` | 失败计数、锁定判定、计数重置 | `PHR.lockout.*` | ~110 |
| `mfa.js` | 生成认证挑战、下发/校验短信码、模拟人脸比对 | `PHR.mfa.*` | ~190 |
| `auth.service.js` | 全部账号业务逻辑与审计留痕 | `PHR.auth.*` | ~330 |
| `auth.view.js` | 未登录时的界面（由 shell 调用） | `PHR.auth.renderAuthView(root)` | ~460 |
| `profile.view.js` | 视图 `profile` | 路由 `#/profile` | ~290 |

## 登录流程（两步验证）

```
用户输入 账号 + 密码
        │
        ▼
 ① 锁定检查  PHR.lockout.check()
        │        └─ 锁定中 → 拒绝，显示剩余时间倒计时
        ▼
 ② 查找账号  findByAccount()  支持「账号名」或「手机号」
        │        └─ 找不到 → 记录一次失败（提示语与密码错误完全相同，防止账号枚举）
        ▼
 ③ 校验口令  PHR.crypto.verifyPassword()
        │        └─ 不匹配 → 失败计数 +1；达到 5 次 → 锁定 5 分钟 + 写 auth.locked 日志
        ▼
 ④ 口令正确 → 清零失败计数
        │
        ├─ 未开启多因素 ─────────────────────────────► ⑥
        │
        ▼
 ⑤ 生成第二因素挑战  PHR.mfa.start()
        │   · 短信：6 位数字，120 秒有效，30 秒重发冷却，最多尝试 5 次
        │   · 人脸：模拟比对（含失败分支与重试）
        │        └─ 失败 → 写 auth.mfa_fail 日志
        ▼
 ⑥ 建立会话  PHR.session.start()  →  写 auth.login 日志  →  进入系统
```

**演示提示**：`demo / Demo@2026` 开启了短信 + 人脸两种第二因素。
短信验证码没有真实网关，会直接显示在验证页面上（真实产品绝不能这样做，见下文"已知限制"）。

### 测试账号与万能验证码

首次打开会一次性建好 4 个账号（定义在 `core/seed.js` 的 `ACCOUNTS` 常量）：

| 账号 | 密码 | 多因素 | 用途 |
| --- | --- | --- | --- |
| `demo` | `Demo@2026` | 短信 + 人脸 | 主演示，271 条完整病史 |
| `test` | `Test@2026` | 仅短信 | 验证账号间数据隔离 |
| `empty` | `Empty@2026` | 仅短信 | 验证空状态 |
| `nomfa` | `NoMfa@2026` | **未开启** | 验证免二次验证的直接登录分支 |

**万能短信验证码**（`PHR.config.universalSmsCode`，默认 `'000000'`）：
第二因素环节输入它可通过任意账号的验证，省去查看随机码的麻烦。

设计上有一条硬约束：**使用万能码时必须写一条醒目的审计日志**，在 detail 里
明确标注"使用了测试用万能验证码"。也就是说它不会被悄悄用掉 ——
登录后到「访问追踪」一眼就能看出来。测试便利不能以牺牲可追溯性为代价。

相关 API：`PHR.mfa.universalCodeEnabled()` / `PHR.mfa.universalCode()`，
登录界面据此决定要不要显示提示。

> 🔴 **生产环境必须删除**：关掉 `core/namespace.js` 里的
> `allowUniversalSmsCode`，并删掉 `mfa.js` 中对应的分支。
> 否则任何人只要知道这 6 位数字就能登录任意账号。
> 与其它演示用账号口令、授权码一起列在《开发者说明书》第 14 章生产化清单第 0 条。

## 对外暴露的 API

### 注册与登录

| 方法 | 说明 |
| --- | --- |
| `PHR.auth.register(values)` | 注册。返回 `{ok, errors, user, message}`；会校验口令策略、账号/手机号唯一性、协议勾选 |
| `PHR.auth.login(account, password)` | 登录第一步。返回 `{ok, needMfa, challenge, user, locked, remainSeconds, remaining}` |
| `PHR.auth.verifyMfa(factor, code)` | 登录第二步。`factor` 为 `'sms'` 或 `'face'`，返回 Promise |
| `PHR.auth.logout(reason)` | 退出登录（`manual` / `timeout` / `disabled`） |
| `PHR.auth.findByAccount(a)` | 按账号名或手机号查找用户 |

### 账号维护

| 方法 | 说明 |
| --- | --- |
| `PHR.auth.changePassword(old, new, new2)` | 修改密码，返回 `{ok, errors, message}` |
| `PHR.auth.setMfa(enabled, factors)` | 开关多因素认证并选择方式 |
| `PHR.auth.mfaFactorNames(factors)` | 把 `['sms','face']` 转成"短信验证码 + 人脸识别" |
| `PHR.auth.loginHistory(limit)` | 登录相关审计日志 |

### 会话

| 方法 | 说明 |
| --- | --- |
| `PHR.session.start(user, opt)` | 建立会话，会话令牌存 `sessionStorage`（刷新页面保留、关闭标签页失效） |
| `PHR.session.currentUser()` | 当前用户记录，未登录返回 `null` |
| `PHR.session.isLoggedIn()` | 会话是否有效（含超时判断） |
| `PHR.session.touch()` | 续期（由 shell 在用户交互时节流调用） |
| `PHR.session.end(reason)` | 结束会话 |
| `PHR.session.info()` | 会话摘要：令牌、剩余秒数、来源 IP、设备 |
| `PHR.session.startDoctorGuest(doctor, consent)` | 建立医生访客会话 |
| `PHR.session.isDoctorGuest()` / `.currentDoctor()` / `.currentConsent()` / `.clearDoctorGuest()` | 医生访客会话读写 |

### 锁定与多因素

| 方法 | 说明 |
| --- | --- |
| `PHR.lockout.check(account)` | `{locked, until, remainSeconds, failures}` |
| `PHR.lockout.recordFailure(account)` | 记一次失败，返回是否触发锁定 |
| `PHR.lockout.reset(account)` / `.unlock(account)` | 清零计数 / 手动解锁 |
| `PHR.mfa.start(user)` / `.pending()` / `.clear()` | 挑战的创建、读取、清除 |
| `PHR.mfa.sendSms()` / `.verifySms(code)` | 短信验证码下发与校验 |
| `PHR.mfa.verifyFace(opt)` | 模拟人脸比对，返回 Promise |
| `PHR.mfa.switchFactor('sms'\|'face')` | 切换第二因素 |

## 注册的页面（路由）

| 路由 | 视图 | 说明 | 左侧导航 |
| --- | --- | --- | --- |
| （未登录时整屏） | — | 登录 / 注册 / 多因素认证，由 `ui/shell.js` 调用 `PHR.auth.renderAuthView()` | — |
| `#/profile` | `profile` | 账号与安全 | ✅ 系统与支持组 |

「账号与安全」页面包含五块：会话信息与安全体检评分 / 修改密码 / 多因素认证开关 / 登录历史表 / 危险操作区。

## 安全策略一览

| 策略 | 取值 | 定义位置 |
| --- | --- | --- |
| 口令最小长度 | 8 位，且需含字母与数字 | `PHR.config.passwordMinLength` + `PHR.security.passwordPolicy()` |
| 口令存储 | 加盐 SHA-256，格式 `sha256$盐$摘要` | `core/crypto.js` → `hashPassword` |
| 登录失败阈值 | 5 次 | `PHR.config.maxLoginFailures` |
| 锁定时长 | 5 分钟 | `PHR.config.lockoutMinutes` |
| 登录保持 | 7 天（绝对到期） | `PHR.config.sessionRememberDays`，存储键 `sessionRememberDays` 可覆盖；0 = 关标签页即退出 |
| 短信验证码有效期 | 120 秒 | `PHR.config.smsCodeTTL` |
| 短信重发冷却 | 30 秒 | `PHR.config.smsResendCooldown` |
| 会话存储 | `sessionStorage`（关闭标签页即失效） | `modules/auth/session.js` |

**账号枚举防护**：账号不存在与密码错误返回完全相同的提示语"账号或密码不正确"。

## 与其它模块的关系

```
modules/auth ──► PHR.audit.log()          登录/失败/锁定/改密全部留痕
             ──► PHR.bus.emit(...)        auth:login / auth:logout / auth:locked
             ──► PHR.session.*            其它模块通过会话取当前用户
             ──► PHR.consent.verifyCode() 医生入口校验授权码（modules/consent 提供）
```

- `ui/shell.js` 在未登录时调用 `PHR.auth.renderAuthView(root)`；
- `ui/shell.js` 通过 `PHR.session.isLoggedIn()` 决定渲染登录页还是主框架；
- `ui/shell.js` 每秒刷新的顶栏倒计时数的是 **30 秒屏保**，与本模块**无关** ——
  它只是把界面藏起来，不碰会话。屏保倒计时一度被误认为"会话超时倒计时"，
  注释里已经纠正。

> **已删除**：过去这里还有一条"`ui/shell.js` 在 `auth:idle_timeout` 事件触发时由本模块
> 负责退出并跳回登录页"。空闲自动登出整个功能已经去掉，见 `core/security.js`
> 的 `sessionPolicy` 注释。

## 实现上的取舍与已知限制

1. **短信验证码明文展示**：演示环境没有短信网关，`PHR.mfa.sendSms()` 会把验证码
   返回给界面直接显示。真实产品中，验证码必须由服务端生成、通过运营商网关下发，
   并在服务端比对，接口绝不能返回验证码本身。
2. **人脸识别是模拟的**：`PHR.mfa.verifyFace()` 用随机数 + 延迟模拟比对过程，
   并没有真的调用摄像头。真实产品需要 `getUserMedia` 采集 + 活体检测 +
   服务端特征比对，且人脸模板必须加密存储，不能存在浏览器里。
3. **口令哈希在客户端计算**：本演示为了"双击即用"把哈希放在浏览器里做。
   真实产品必须在服务端用 bcrypt / scrypt / Argon2 加盐哈希，
   并且口令明文只能通过 HTTPS 传输。
4. **锁定计数存在 `localStorage`**：用户清空浏览器数据即可绕过。
   真实产品的失败计数须记录在服务端，并叠加 IP 维度的限流。
5. **会话令牌是自生成的随机串**：没有签名，理论上可伪造。真实产品应使用
   服务端签发的 JWT 或不可预测的会话 ID，并支持"踢下线"与"查看所有登录设备"。
