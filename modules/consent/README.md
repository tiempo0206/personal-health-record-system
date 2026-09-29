# 模块 5 · 医生授权（consent）

> 需求原文：「第五……是医生授权……用户可以把部分资料临时开放给医生，同时系统记录谁在什么时候访问了哪些内容。」
> 「用户选择要共享的记录，设置授权范围和有效期，系统校验医生身份并生成权限，**医生只能查看被授权内容**，
> 所有访问都会写入日志，权限到期后自动失效或由用户手动撤销。」
> 「系统要支持可信共享，用户只把必要资料授权给医生，并可以设置有效期或随时撤销。」

本模块把上面这段话拆成三个可验证的能力：

| 需求 | 实现位置 | 验证方式 |
| --- | --- | --- |
| 只把必要资料临时开放 | 授权向导的「范围」步骤 + `PHR.consent.scope.comboPresets()` | 勾选范围后实时显示「覆盖 X / Y 条记录」 |
| 医生身份校验后生成权限 | `PHR.consent.verifyCode()` → `PHR.session.startDoctorGuest()` | 登录页「医生身份」入口 |
| 医生只能看被授权内容 | `PHR.records.service.forConsent()` 是**唯一**取数入口 | 医生视图底部的「未被授权的范围」演示入口 |
| 所有访问写入日志 | `PHR.consent.recordAccess()` → `PHR.audit.log()` | 授权详情弹窗的访问时间线 / 访问追踪页 |
| 到期自动失效 / 手动撤销 | `sweepExpired()` / `revoke()` | 种子数据里三条不同状态的授权 |

---

## 一、目录结构

```
modules/consent/
├── README.md              本文件：模块说明、状态机、权限判定规则
├── scope.js               【第一个加载】授权范围工具层 + 建立 PHR.consent 命名空间
├── consent.service.js     授权生命周期服务（创建 / 校验 / 判定 / 延长 / 撤销 / 回收 / 统计）
├── consent.view.js        患者侧页面 #/consent —— 授权管理 + 四步授权向导
└── doctor.view.js         医生侧页面 #/doctor  —— 凭授权码进入的受限工作台
```

加载顺序见 `index.html` 第八组：

```html
<script src="modules/consent/scope.js"></script>
<script src="modules/consent/consent.service.js"></script>
<script src="modules/consent/consent.view.js"></script>
<script src="modules/consent/doctor.view.js"></script>
```

四个文件都是 IIFE（`(function (PHR) { … })(window.PHR);`），不使用 ES Module、不引入任何第三方库、不使用 fetch，
因此在 `file://` 下双击 `index.html` 即可运行。

---

## 二、每个文件的职责

| 文件 | 挂载点 | 职责（单一，互不重叠） |
| --- | --- | --- |
| `scope.js` | `PHR.consent.scope` | **范围字典的行为层**。不重复定义范围清单（那是 `core/dict.js → PHR.dict.consentScope` 的唯一来源），只提供：范围包含哪些记录类型、当前用户在该范围下有多少条记录、一组范围覆盖了多少档案、哪些范围属于敏感数据、常用组合预设。 |
| `consent.service.js` | `PHR.consent.service`（并平铺到 `PHR.consent`） | **授权生命周期**。创建、按码校验、单条可见性判定、访问留痕、延长、撤销、到期回收、统计与活动日志。 |
| `consent.view.js` | 视图 `consent` → `#/consent` | **患者侧界面**。统计概览、授权列表、四步授权向导、授权码展示与复制、延长 / 撤销 / 访问时间线。 |
| `doctor.view.js` | 视图 `doctor` → `#/doctor` | **医生侧受限界面**。授权横幅与倒计时、被授权范围导航、按范围渲染内容、越权阻断演示。 |

> 设计取舍：`consent.service.js` 里**没有任何 DOM 代码**，`*.view.js` 里**没有任何直接写库代码**。
> 页面切换、路由跳转都不会改变权限判定逻辑，评审时只需读 `consent.service.js` 就能确认「医生只能看被授权内容」是真的。

---

## 三、注册的路由与视图

| 视图名 | 路由 | 标题 | 图标 | 导航 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `consent` | `#/consent` | 医生授权 | 🔑 | 显示（业务模块 · order 5） | 患者本人使用；需要已登录 |
| `doctor` | `#/doctor` | 医生视图 | 👨‍⚕️ | **不显示**（`nav:false`） | 医生凭授权码进入；`ui/shell.js` 在医生模式下只让导航渲染 `name === 'doctor'` 的视图，因此本页自带完整骨架 |

`#/doctor` 必须自己完整渲染，不能依赖侧边导航 —— 这是 `ui/shell.js` 中
`if (mode === 'doctor') { return v.name === 'doctor'; }` 决定的。

---

## 四、对外 API

### 4.1 `PHR.consent.scope`（工具层）

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `dict()` | `Array` | 原始范围字典（`PHR.dict.consentScope`，不做任何加工） |
| `list()` | `Array` | 全部范围，每项附加 `types`（记录类型 key 数组）、`typeNames`（中文名数组）、`recordCount`（当前用户该范围下的记录条数）、`sensitive`（是否敏感范围） |
| `get(key)` | `Object \| null` | 单个范围的完整信息 |
| `nameOf(key)` | `string` | 范围中文名，找不到时回退为 `—` |
| `descOf(key)` | `string` | 范围的一句话说明（直接来自字典的 `desc`） |
| `describe(keys)` | `string` | `describe(['vital','lab'])` → `体征指标、检验检查报告` |
| `isValid(key)` | `boolean` | 是否是合法的范围 key |
| `sanitize(keys)` | `Array` | 去掉非法与重复项，**授权写入前必须过这一层** |
| `coverage(keys)` | `{records, total, percent}` | 这组范围覆盖了多少条档案 |
| `sensitiveKeys()` | `Array` | 返回 `['basic','family','insight']` |
| `isSensitive(key)` | `boolean` | 单个范围是否敏感 |
| `sensitiveIn(keys)` | `Array` | 这组范围里的敏感项（用于向导中的额外提示） |
| `comboPresets()` | `Array` | 常用组合预设（复诊 / 只看化验 / 急诊 / 慢病随访 / 用药咨询 / 首次就诊） |
| `presetOf(key)` | `Object \| null` | 按 key 取一个预设 |

### 4.2 `PHR.consent.service`（同时平铺到 `PHR.consent` 上）

```js
PHR.consent.grant({...})            // 等价于 PHR.consent.service.grant({...})
```

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `list(filter)` | `Array` | 当前用户的授权列表，每项附加 `runtimeStatus` 与 `daysLeft` / `hoursLeft` / `scopeNames`。`filter` 支持 `{status, keyword}` |
| `byId(id)` | `Object \| null` | 按 id 查找 |
| `byCode(code)` | `Object \| null` | 按授权码查找，自动大写并忽略分隔符（`k7m2 p9qx3rtd` 同样命中） |
| `grant(input)` | `{ok, errors, consent, coverage, message}` | 创建授权。`input = {doctorName, doctorTitle, hospital, department, licenseNo, purpose, scopes[], recordIds[], days \| customExpireAt, note}` |
| `revoke(id, reason)` | `{ok, consent, message}` | 撤销授权（写 `consent.revoke`） |
| `extend(id, days)` | `{ok, consent, message}` | 延长有效期（写 `consent.grant`，detail 说明延长） |
| `verifyCode(code, doctorInfo)` | `{ok, message, consent?, doctor?}` | **医生入口**，返回值契约见下文 |
| `sweepExpired()` | `number` | 把「已过期但仍标记为 active」的授权写一次 `consent.expired`，返回处理条数 |
| `canAccess(consent, scopeKey)` | `boolean` | 该授权是否覆盖某范围 |
| `recordAccess(consent, opt)` | `{ok, allowed}` | 写访问日志。允许 → `consent.access`；拒绝 → `consent.denied`，同时累加 `accessCount` / `lastAccessAt` |
| `stats()` | `{total, active, pending, expired, revoked, doctors, avgDays, accessTotal}` | 授权统计 |
| `activity(consentId)` | `Array` | 该授权相关的审计日志（时间倒序） |

#### `verifyCode` 的返回契约（其它模块已依赖，不可更改）

`modules/auth/auth.view.js` 中这样调用（本模块不能修改它）：

```js
var r = PHR.consent.verifyCode(code, { name: name, title: title, licenseNo: licenseNo });
// r = { ok:boolean, message:string, consent?:object, doctor?:object }
if (r.ok) {
  PHR.session.startDoctorGuest(r.doctor, r.consent);   // r.doctor 含 {name, title, hospital, department, licenseNo}
  PHR.shell.enterDoctorMode();
  PHR.router.go('/doctor', true);
}
```

失败时的中文原因（逐条，便于评审对照）：

| 情况 | `message` |
| --- | --- |
| 授权码查不到 | 授权码不存在，请核对后重试 |
| 已被撤销 | 该授权已被患者撤销，无法再访问档案 |
| 已过期 | 该授权已于 YYYY-MM-DD 过期，请让患者重新授权 |
| 尚未生效 | 该授权尚未生效（生效时间 YYYY-MM-DD HH:mm） |
| 医生姓名为空 | 请填写您的姓名，用于访问留痕 |

---

## 五、授权生命周期的状态机

授权在数据库里只持久化三个值：`status ∈ {active, revoked, expired}`。
但**运行时状态**由 `PHR.models.consent.effectiveStatus()` 依据时间实时计算，共有四个：

```js
PHR.models.consent.effectiveStatus = function (c) {
  if (c.status === 'revoked') { return 'revoked'; }
  if (Date.now() > c.expireAt) { return 'expired'; }
  if (Date.now() < c.startAt)  { return 'pending'; }
  return 'active';
};
```

```
                    ┌──────────────────────────────────────────┐
                    │  grant()  创建                            │
                    │  status='active', code=XXXX-XXXX-XXXX     │
                    └───────────────────┬──────────────────────┘
                                        │
                  startAt > now         │        startAt <= now
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
      ┌─────────────┐        now >= startAt                 ┌─────────────┐
      │   pending   │ ───────────────────────────────────▶  │   active    │
      │  待生效      │                                       │  生效中      │
      └─────────────┘                                       └──┬───────┬──┘
             │                                               │       │
             │ revoke()                                      │       │ now > expireAt
             ▼                                               │       ▼
      ┌─────────────┐                                        │ ┌─────────────┐
      │  revoked 🚫 │ ◀──────────── revoke() ────────────────┘ │  expired ⌛  │
      │  已撤销      │                                          │  已过期      │
      └─────────────┘                                          └──────┬──────┘
             ▲                                                        │
             └──────────── extend() 可把 expired 拉回 active ─────────┘
                           （revoked 不可复活，只能重新创建）
```

关键规则：

1. **`expired` 与 `pending` 不落库**。数据库里始终是 `active`，由时间决定它此刻是什么状态 ——
   这样即使用户从不打开页面，授权也不会「忘记过期」。种子数据里第 3 条授权（王敏 / 糖尿病用药咨询）
   故意写成 `status: 'active'` 且 `expireAt` 在 40 天前，就是用来演示「运行时时识别过期」的。
2. **`active → expired` 的日志只写一次**：`sweepExpired()` 把已处理过的授权 id 记在
   `PHR.store` 的 `consent.swept` 键里，`core/boot.js` 每次启动调用它，重复启动不会重复写日志。
3. **`revoked` 是终态**：撤销后 `extend()` 会被拒绝，用户只能重新创建一条授权。
   （这是有意为之 —— 撤销代表「信任已经收回」，延长它会让用户误以为撤销没生效。）
4. **医生访客会话跟随授权状态**：`PHR.session.isDoctorGuest()` 每次都会重新读取授权并调用
   `effectiveStatus()`，一旦变成 `expired` 或 `revoked`，访客会话立即失效，医生视图被踢回登录页。

---

## 六、授权码的格式与安全性说明

### 格式

```
K7M2-P9QX-3RTD
└4┘ └4┘ └4┘      共 12 位有效字符 + 2 个连字符
```

由 `PHR.crypto.consentCode()` 生成：

```js
consentCode: function () {
  return [4, 4, 4].map(function (n) { return PHR.crypto.token(n); }).join('-');
}
```

字符集为 `ABCDEFGHJKMNPQRSTUVWXYZ23456789` —— **刻意剔除了 `0 / O / 1 / I / L`**，
因为授权码通常要靠电话或微信口头转述，形近字符会造成大量输入错误。
分成 `4-4-4` 三段也是为了转述时不易串行。

`byCode()` 在比对前会做归一化：

```js
String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')   // 'k7m2 p9qx3rtd' → 'K7M2P9QX3RTD'
```

因此医生漏输连字符、输入小写、多打空格都能正确命中。

### 安全性（教学演示级，务必如实理解）

| 措施 | 本系统的做法 | 真实生产应有的做法 |
| --- | --- | --- |
| 授权码随机性 | `Math.random()`（**不是密码学安全随机数**） | `crypto.getRandomValues()` 或服务端生成 |
| 授权码存储 | 明文存在本地 `localStorage` 里 | 服务端只存 `hash(授权码)`，比对时哈希比对 |
| 授权码有效期 | 绑定在授权记录上（`expireAt`），最长 `PHR.config.consentMaxDays`（90）天 | 相同，另加「首次使用后 N 小时内有效」 |
| 授权码可撤销 | `revoke()` 立即把 `status` 置为 `revoked` | 相同，并且服务端缓存/网关同步失效 |
| 医生身份核验 | 只校验「姓名非空」+ 执业证号留痕 | 对接国家医师执业注册信息库，核验执业证号与姓名是否匹配 |
| 医生能看多少 | `consent.scopes` 白名单 + `recordIds` 可选收窄 | 相同，另加字段级脱敏与访问频率限制 |
| 访问留痕 | 每次 `recordAccess()` 写一条审计日志 | 相同，且日志写服务端不可篡改存储 |
| 防暴力猜码 | **没有**（演示环境刻意不做，避免锁死演示） | 按 IP / 授权码前缀限流 + 失败计数 + 告警 |

> 一句话总结：本模块演示的是**授权模型**（范围白名单 + 有效期 + 访问留痕 + 可撤销），
> 而不是**密码学**。生产环境必须把随机数、存储、限流三件事挪到服务端。

### 演示授权码

种子数据（`core/seed.js → seedConsents()`）预置三条授权，可直接用于演示：

| 授权码 | 医生 | 状态 | 范围 |
| --- | --- | --- | --- |
| `K7M2-P9QX-3RTD` | 李建国 · 主任医师 · 市第一人民医院心血管内科 | **生效中**（还剩 9 天） | basic, history, medication, allergy, vital, visit, insight |
| `B4YN-6HWC-2FJK` | 陈刚 · 副主任医师 · 市第一人民医院外科 | 已撤销 | basic, history, lab, medication |
| `Z9QP-5WME-8LVA` | 王敏 · 副主任医师 · 市第一人民医院内分泌科 | 已过期（40 天前） | basic, lab, medication, vital |

---

## 七、医生能看什么 / 不能看什么（权限判定规则）

这是本模块最核心的一段规则，请评审时重点核对。

### 7.1 三条判定线，缺一不可

```
医生想看的记录 R，所属授权 C，请求范围 S
  │
  ├─ ① 归属：R.userId === C.userId ?
  │      否 → 拒绝（医生只能看这条授权所属患者的档案）
  │
  ├─ ② 范围：S ∈ C.scopes ?
  │      否 → 拒绝并写 consent.denied（这就是「越权阻断」）
  │
  └─ ③ 收窄：C.recordIds 非空时，R.id ∈ C.recordIds ?
         否 → 拒绝（医生只能看被逐条指定的记录）
```

三条线分别由 `modules/records/record.service.js` 的两个函数实现：

```js
PHR.records.service.forConsent(consent, {scopeKey})   // 取列表：唯一的数据入口
PHR.records.service.canView(record, consent)          // 判单条：唯一的是否可见入口
```

**授权模块自己不实现任何一条取数逻辑**，全部委托给档案中心。
这样做的价值是：只要审计 `forConsent` / `canView` 两个函数，就能确认没有旁路。

### 7.2 范围 → 内容 的对照表

| 范围 key | 名称 | 医生看到的内容 | 是否敏感（建议单独确认） |
| --- | --- | --- | --- |
| `basic` | 个人基本信息 | 脱敏后的基本信息（身份证号与紧急联系人电话打码）+ 过敏警示 + 当前用药一页摘要 | ⚠️ 是 |
| `history` | 既往病史 | 确诊疾病、手术、住院、疫苗接种的清单与摘要 | 否 |
| `family` | 家族病史 | 亲属疾病清单 + 遗传风险提示 | ⚠️ 是 |
| `medication` | 用药记录 | 当前用药、长期用药、相互作用提示 | 否 |
| `allergy` | 过敏史 | 过敏原清单，**药物过敏置顶并用危险色提示** | 否（但临床上最关键） |
| `lab` | 检验检查报告 | 化验单 / 影像 / 体检报告表格 | 否 |
| `vital` | 体征指标 | 血压双线趋势图 + 各指标的最新值 / 均值 / 区间 | 否 |
| `visit` | 就诊记录 | 门诊、急诊、复诊记录时间线 | 否 |
| `insight` | 健康洞察结论 | 风险评分、趋势结论与建议 | ⚠️ 是 |

**为什么 `basic` / `family` / `insight` 建议单独确认？**

- `basic` 里包含身份证号、住址、紧急联系人 —— 这些字段与「看病」无关，但可以被用于身份冒用，
  因此向导里对它单独提示；同时医生视角下 `PHR.security.masker.profile(p, 'doctor')`
  会把身份证号与紧急联系人电话打码，**即使授权了也只能看到打码后的值**。
- `family` 描述的是**没有同意能力的第三方**（父母、兄弟姐妹、子女）的健康信息。
  患者授权自己的档案时，顺带把亲属的病情也交出去了，这在伦理上需要一次额外的意识确认。
- `insight` 是系统基于全部数据**推断**出来的结论（含遗传风险、慢病风险评分），
  它的信息密度高于任何单条记录 —— 授权了这一项，等于把整份档案的「推论结果」交出去。

### 7.3 即使被授权，也看不到的内容

| 内容 | 原因 |
| --- | --- |
| 身份证号原文、紧急联系人电话原文 | `PHR.security.masker.profile(p, 'doctor')` 按医生视角强制脱敏 |
| 未被勾选范围的任何记录 | `forConsent` 按 `scopes` 白名单过滤 |
| 授权清单外的范围（点击即被阻断） | 医生视图的「未被授权的范围」区块会写一条 `consent.denied` 日志 |
| 其它患者的任何数据 | `forConsent` 按 `consent.userId` 过滤 |
| 账号密码、审计日志、社群内容 | 不在 `PHR.dict.consentScope` 的 9 个范围内，没有对应的授权开关 |

---

## 八、越权阻断是怎么演示的

`doctor.view.js` 底部有一块 **「🔒 未被授权的范围（演示入口）」**：

1. 列出 `PHR.dict.consentScope` 中**不**在 `consent.scopes` 里的所有范围，灰显、加锁图标；
2. 点击任意一项 → 调用
   `PHR.consent.recordAccess(consent, { scopeKey, allowed: false })`；
3. 该调用写一条 `action: 'consent.denied'`、`result: 'denied'` 的审计日志；
4. 同时 `PHR.ui.toast.danger('该范围未在授权清单内，访问已被系统阻断并记录')`；
5. 因为审计日志的 `result === 'denied'`，`modules/audit` 会**立即触发一次异常扫描**，
   这条越权尝试会立刻出现在「访问追踪 → 安全告警」里（种子数据中已有一条陈刚的同类记录）。

这条链路把「医生只能查看被授权内容」从一句承诺变成了可以当场点击验证的行为。
