# 个人健康档案管理系统 —— UML 设计图

> 本文档使用 **Mermaid** 语法描述系统设计。在 VS Code（安装 Markdown Preview Mermaid 插件）、
> Typora、Obsidian 或 GitHub 上打开本文件即可看到渲染后的图形；
> 若使用不支持的编辑器，也可以直接阅读源码 —— Mermaid 是纯文本，语义自明。
>
> 全部图形与源码实现保持一致，如有改动请同步更新本文件与 `模块总览.md`。

---

## 目录

1. [用例图（Use Case Diagram）](#一用例图)
2. [系统分层架构图（Component Diagram）](#二系统分层架构图)
3. [模块依赖图（Package Diagram）](#三模块依赖图)
4. [核心类图（Class Diagram）](#四核心类图)
5. [实体关系图（ER Diagram）](#五实体关系图)
6. [时序图 · 多因素登录](#六时序图--多因素登录)
7. [时序图 · 医生授权访问档案](#七时序图--医生授权访问档案)
8. [时序图 · 录入记录与异常提醒](#八时序图--录入记录与异常提醒)
9. [状态图 · 医生授权生命周期](#九状态图--医生授权生命周期)
10. [状态图 · 账号与会话](#十状态图--账号与会话)
11. [活动图 · 健康档案生命周期](#十一活动图--健康档案生命周期)
12. [活动图 · 异常检测闭环](#十二活动图--异常检测闭环)
13. [部署图（Deployment Diagram）](#十三部署图)

---

## 一、用例图

### 1.1 总体用例

```mermaid
graph TB
    subgraph actors["参与者"]
        U(["👤 患者<br/>（档案所有者）"])
        D(["👨‍⚕️ 医生<br/>（持授权码访问）"])
        S(["🤖 系统<br/>（自动任务）"])
    end

    subgraph system["个人健康档案管理系统"]
        direction TB

        subgraph m1["模块1 账号安全"]
            UC11["注册账号"]
            UC12["密码登录"]
            UC13["多因素认证<br/>（短信 / 人脸）"]
            UC14["管理会话与密码"]
        end

        subgraph m2["模块2 档案中心"]
            UC21["录入健康记录<br/>（14 种类型）"]
            UC22["同步医院数据"]
            UC25["上传医院报告<br/>（CSV / JSON）"]
            UC23["管理个人基本信息"]
            UC24["查看 / 回滚版本历史"]
        end

        subgraph m3["模块3 智能搜索"]
            UC31["关键词 / 模糊检索"]
            UC32["按时间·类型·疾病分类筛选"]
        end

        subgraph m4["模块4 健康洞察"]
            UC41["查看指标趋势图"]
            UC42["接收异常提醒"]
            UC43["查看风险评分与预防建议"]
        end

        subgraph m5["模块5 医生授权"]
            UC51["创建授权<br/>（范围 + 有效期）"]
            UC52["延长 / 撤销授权"]
            UC53["凭授权码查看档案"]
        end

        subgraph m6["模块6 访问追踪"]
            UC61["查看审计日志"]
            UC62["接收异常访问告警"]
        end

        subgraph m7["模块7 患者社群"]
            UC71["匿名发帖 / 回复"]
            UC72["举报违规内容"]
        end

        subgraph m8["模块8 体验保障"]
            UC81["调整主题与无障碍设置"]
            UC82["导出 / 导入备份"]
            UC83["数据完整性自检"]
            UC84["查阅使用帮助"]
        end
    end

    U --> UC11
    U --> UC12 --> UC13
    U --> UC14
    U --> UC21
    U --> UC22
    U --> UC25
    U --> UC23
    U --> UC24
    U --> UC31
    U --> UC32
    U --> UC41
    U --> UC43
    U --> UC51
    U --> UC52
    U --> UC61
    U --> UC71
    U --> UC72
    U --> UC81
    U --> UC82
    U --> UC83
    U --> UC84

    D --> UC53

    S --> UC42
    S --> UC62
    S -.->|授权到期| UC52

    UC13 -.->|«include»| UC12
    UC51 -.->|«include»| UC52
    UC41 -.->|«extend»| UC42
    UC53 -.->|«include»| UC61
```

### 1.2 医生的受限用例（细化）

```mermaid
graph LR
    D(["👨‍⚕️ 医生"])

    subgraph doctor["医生可见范围（严格由授权 scopes 决定）"]
        A["查看脱敏后的基本信息"]
        B["查看既往病史 / 家族史"]
        C["查看用药与过敏史"]
        D1["查看检验检查报告"]
        E["查看体征指标趋势"]
        F["查看就诊记录"]
        G["查看健康洞察结论"]
    end

    subgraph denied["医生不可见（越权尝试会被阻断并留痕）"]
        X1["未被授权的数据范围"]
        X2["患者身份证号（脱敏）"]
        X3["患者紧急联系人电话（脱敏）"]
        X4["审计日志"]
        X5["其他患者的任何数据"]
    end

    D --> A & B & C & D1 & E & F & G
    D -.->|尝试访问| X1
    D -.->|尝试访问| X4
    D -.->|尝试访问| X5

    X1 -.->|"写入 consent.denied 审计"| BLOCK["⛔ 系统阻断"]
    X4 -.-> BLOCK
    X5 -.-> BLOCK
```

---

## 二、系统分层架构图

对应需求原文的"表现层 / 业务服务层 / 数据与集成层 / 安全治理层"四层设计。

```mermaid
graph TB
    subgraph L1["🎨 表现层 ui/"]
        direction LR
        P1["应用外壳<br/>ui/shell.js"]
        P2["前端路由<br/>ui/router.js"]
        P3["UI 组件<br/>ui/components/ (8 个)"]
        P4["设计令牌与样式<br/>ui/styles/ (5 个)"]
    end

    subgraph L2["⚙️ 业务服务层 modules/"]
        direction LR
        subgraph B1["账号安全"]
            S11["auth.service"]
            S12["mfa / lockout / session"]
        end
        subgraph B2["档案中心"]
            S21["record.service"]
            S22["vital / medication"]
            S23["history / profile"]
            S24["version / sync / import"]
        end
        subgraph B3["智能搜索"]
            S31["search.service"]
            S32["fuzzy / inverted-index"]
        end
        subgraph B4["健康洞察"]
            S41["trend.service"]
            S42["anomaly / risk / advice"]
        end
        subgraph B5["医生授权"]
            S51["consent.service"]
            S52["scope / doctor.view"]
        end
        subgraph B6["访问追踪"]
            S61["audit.service"]
            S62["audit.query / anomaly"]
        end
        subgraph B7["患者社群"]
            S71["community.service"]
            S72["moderation / topics"]
        end
        subgraph B8["体验保障"]
            S81["preference / integrity"]
            S82["backup / help"]
        end
    end

    subgraph L3["🗄️ 数据与集成层 core/"]
        direction LR
        D1["存储抽象<br/>store.js"]
        D2["数据模型<br/>models.js"]
        D3["数据字典<br/>dict*.js (3 个)"]
        D4["事件总线<br/>event-bus.js"]
        D5["演示数据<br/>seed.js"]
        D6["医院同步 / 报告导入<br/>records/sync.service.js"]
    end

    subgraph L4["🛡️ 安全治理层 core/security.js + core/crypto.js"]
        direction LR
        G1["加密与哈希"]
        G2["多因素认证策略"]
        G3["权限矩阵与脱敏"]
        G4["审计轨迹"]
        G5["异常检测规则"]
    end

    L1 --> L2
    L2 --> L3
    L4 -.->|贯穿所有环节| L1
    L4 -.->|贯穿所有环节| L2
    L4 -.->|贯穿所有环节| L3

    style L4 fill:#fee2e2,stroke:#b91c1c,stroke-width:2px
    style L1 fill:#e0f2f6,stroke:#0e7490
    style L2 fill:#eef3f8,stroke:#48586e
    style L3 fill:#f7fafc,stroke:#8496ab
```

---

## 三、模块依赖图

依赖方向**严格单向**，不允许出现循环依赖。箭头表示"调用/读取"。

```mermaid
graph LR
    subgraph core["core/ 核心基础设施"]
        C1["dict*.js<br/>数据字典"]
        C2["store.js + models.js<br/>存储与模型"]
        C3["crypto.js"]
        C4["security.js<br/>安全治理"]
        C5["event-bus.js"]
    end

    AUTH["modules/auth<br/>模块1 账号安全"]
    REC["modules/records<br/>模块2 档案中心"]
    SRCH["modules/search<br/>模块3 智能搜索"]
    INS["modules/insight<br/>模块4 健康洞察"]
    CON["modules/consent<br/>模块5 医生授权"]
    AUD["modules/audit<br/>模块6 访问追踪"]
    COM["modules/community<br/>模块7 患者社群"]
    UX["modules/ux<br/>模块8 体验保障"]

    AUTH --> C2
    AUTH --> C3
    AUTH --> C4
    AUTH --> AUD

    REC --> C1
    REC --> C2
    REC --> AUD

    SRCH --> REC
    SRCH --> C1

    INS --> REC
    INS --> C1
    INS --> AUD

    CON --> REC
    CON --> AUTH
    CON --> AUD

    AUD --> C4
    AUD --> C2

    COM --> AUD
    COM --> C4

    UX --> REC
    UX --> INS
    UX --> CON
    UX --> AUD
    UX --> C3

    SRCH -.->|"只读"| REC
    INS -.->|"只读"| REC
    CON -.->|"只读+过滤"| REC
    COM -.->|"不依赖任何业务模块"| C5

    style AUD fill:#fff3e0,stroke:#b45309
    style REC fill:#e0f2f6,stroke:#0e7490,stroke-width:2px
```

**关键设计**：
- `modules/audit` 被所有模块依赖，但自己**不依赖任何业务模块** —— 所以它最先加载。
- `modules/records` 是数据主体，被 search / insight / consent / ux 读取，但**不反向依赖**它们。
- 模块之间通过 `PHR.bus` 事件与 `PHR.db` 数据解耦，不直接引用对方的内部函数。

---

## 四、核心类图

### 4.1 领域实体

```mermaid
classDiagram
    class User {
        +String id
        +String username
        +String displayName
        +String phone
        +String passwordHash
        +Boolean mfaEnabled
        +String[] mfaFactors
        +String status
        +Number failedCount
        +Number lockedUntil
        +Number lastLoginAt
        +Number loginCount
        +String[] roles
        +register()
        +login(password)
        +changePassword(old, new)
    }

    class Profile {
        +String userId
        +String realName
        +String gender
        +String birthDate
        +String bloodType
        +Number height
        +Number weight
        +Number waist
        +String idCard
        +String emergencyContact
        +String emergencyPhone
        +String smoking
        +String drinking
        +String exercise
        +computeBmi() Number
        +summary() Object
        +emergencyCard() Object
    }

    class HealthRecord {
        +String id
        +String userId
        +String type
        +String title
        +Number date
        +String dateText
        +String summary
        +String scope
        +String diseaseCat
        +String severity
        +Boolean abnormal
        +Object data
        +String source
        +String sourceName
        +String[] tags
        +Number version
        +String searchText
        +create(type, values)
        +update(id, values)
        +remove(id)
    }

    class RecordVersion {
        +String id
        +String recordId
        +Number version
        +String action
        +Object snapshot
        +Object[] changedFields
        +String operator
        +String reason
        +Number at
        +diff(before, after)
        +rollback(versionId)
    }

    class Consent {
        +String id
        +String userId
        +String code
        +String doctorName
        +String doctorTitle
        +String hospital
        +String department
        +String licenseNo
        +String purpose
        +String[] scopes
        +String[] recordIds
        +Number startAt
        +Number expireAt
        +String status
        +Number accessCount
        +Number lastAccessAt
        +effectiveStatus() String
        +grant(input)
        +revoke(reason)
        +verifyCode(code)
    }

    class AuditLog {
        +String id
        +String userId
        +String actor
        +String actorType
        +String action
        +String targetType
        +String targetId
        +String targetName
        +String result
        +String detail
        +String ip
        +String device
        +Number at
        +log(input)
        +query(filter)
    }

    class SecurityAlert {
        +String id
        +String userId
        +String rule
        +String name
        +String tone
        +String severity
        +String detail
        +String suggestion
        +Number count
        +Boolean read
        +Boolean dismissed
        +Number at
        +scanAlerts()
        +dismiss(id)
    }

    class Metric {
        +String key
        +String name
        +String unit
        +String category
        +Object normal
        +Object warn
        +String better
        +Number target
        +judge(key, value) String
    }

    class CommunityPost {
        +String id
        +String userId
        +String board
        +String title
        +String content
        +Boolean anonymous
        +String alias
        +String[] tags
        +Number likes
        +Number replyCount
        +String status
        +createPost(input)
        +toggleLike(postId)
    }

    User "1" --> "1" Profile : 拥有
    User "1" --> "0..*" HealthRecord : 拥有
    User "1" --> "0..*" Consent : 授予
    User "1" --> "0..*" AuditLog : 产生
    User "1" --> "0..*" CommunityPost : 发布
    HealthRecord "1" --> "1..*" RecordVersion : 版本历史
    Consent "1" --> "0..*" AuditLog : 访问留痕
    HealthRecord ..> Metric : 「vital 类型」引用
    AuditLog "0..*" --> "0..*" SecurityAlert : 检测产出
```

### 4.2 服务层类图

```mermaid
classDiagram
    class AuthService {
        <<service>>
        +register(values) Result
        +login(account, password) Result
        +verifyMfa(factor, code) Promise
        +logout(reason)
        +changePassword(old, new, new2) Result
        +setMfa(enabled, factors) Result
    }
    class SessionManager {
        <<service>>
        +start(user, opt) Session
        +current() Session
        +currentUser() User
        +isLoggedIn() Boolean
        +touch()
        +end(reason)
    }
    class LockoutPolicy {
        <<policy>>
        +check(account) LockState
        +recordFailure(account) LockState
        +reset(account)
    }
    class MfaProvider {
        <<service>>
        +start(user) Challenge
        +sendSms() Result
        +verifySms(code) Result
        +verifyFace() Promise
    }

    class RecordService {
        <<service>>
        +all() HealthRecord[]
        +list(filter) HealthRecord[]
        +create(type, values) Result
        +update(id, values) Result
        +remove(id, reason) Result
        +forConsent(consent) HealthRecord[]
        +canView(record, consent) Boolean
    }
    class VersionService {
        <<service>>
        +snapshot(record, action) Version
        +rollback(versionId) Result
        +history(recordId) Version[]
    }
    class VitalService {
        <<service>>
        +series(key, opt) Point[]
        +summary(key, opt) Summary
        +add(key, value, value2) Result
        +abnormal(key, days) Abnormal[]
    }
    class SyncService {
        <<service>>
        +hospitals() Hospital[]
        +preview(key) Promise
        +sync(key) Promise
        +previewFile(text, fileName) ImportPreview
        +importFile(text, fileName) ImportResult
    }

    class SearchService {
        <<service>>
        +run(query, filter) Result
        +suggest(prefix) Suggest
        +quickSearch(query) Item[]
    }
    class FuzzyMatcher {
        <<algorithm>>
        +tokenize(text) String[]
        +score(query, text) Number
        +expand(query) Terms
        +levenshtein(a, b) Number
    }
    class InvertedIndex {
        <<structure>>
        +build()
        +search(terms) Map
        +invalidate()
    }

    class TrendAnalyzer {
        <<service>>
        +analyze(key, days) Trend
        +chartConfig(key, days) ChartCfg
        +changePoints(key, days) Point[]
    }
    class InsightAnomaly {
        <<service>>
        +scan(days) Alert[]
        +active() Alert[]
    }
    class RiskAssessor {
        <<service>>
        +assess() Risk
        +improvements() Advice[]
    }
    class AdviceEngine {
        <<service>>
        +generate() AdviceGroup[]
        +dailyPlan() Plan
    }

    class ConsentService {
        <<service>>
        +grant(input) Result
        +revoke(id, reason) Result
        +extend(id, days) Result
        +verifyCode(code, doctor) Result
        +recordAccess(consent, ctx)
        +sweepExpired() Number
    }

    class AuditService {
        <<service>>
        +log(input) AuditLog
        +query(filter) AuditLog[]
        +scanAlerts() Alert[]
        +riskScore() Risk
    }

    class SecurityPolicy {
        <<policy>>
        +passwordPolicy(pwd) Policy
        +sessionPolicy
        +can(role, perm) Boolean
        +detectAnomalies(entries) Alert[]
        +posture(user) Posture
    }
    class CryptoProvider {
        <<utility>>
        +hashPassword(pwd) String
        +verifyPassword(pwd, hash) Boolean
        +encrypt(obj, key) String
        +decrypt(cipher, key) Object
        +consentCode() String
    }

    AuthService --> SessionManager
    AuthService --> LockoutPolicy
    AuthService --> MfaProvider
    AuthService ..> SecurityPolicy
    AuthService ..> CryptoProvider
    AuthService ..> AuditService

    RecordService --> VersionService
    RecordService ..> VitalService
    RecordService ..> AuditService
    SyncService --> RecordService

    SearchService --> FuzzyMatcher
    SearchService --> InvertedIndex
    SearchService ..> RecordService

    TrendAnalyzer ..> VitalService
    InsightAnomaly ..> TrendAnalyzer
    RiskAssessor ..> TrendAnalyzer
    AdviceEngine ..> RiskAssessor

    ConsentService ..> RecordService
    ConsentService ..> AuditService
    ConsentService ..> SessionManager

    AuditService ..> SecurityPolicy
    SecurityPolicy ..> CryptoProvider
```

---

## 五、实体关系图

10 张数据表的完整关系（对应 `core/models.js` 的 `PHR.db.schema`）。

```mermaid
erDiagram
    USERS ||--o| PROFILES : "1:1 个人基本信息"
    USERS ||--o{ RECORDS : "1:N 健康记录"
    USERS ||--o{ CONSENTS : "1:N 医生授权"
    USERS ||--o{ AUDITS : "1:N 审计日志"
    USERS ||--o{ ALERTS : "1:N 安全告警"
    USERS ||--o{ POSTS : "1:N 社群主帖"
    USERS ||--o| PREFS : "1:1 偏好设置"
    USERS ||--o{ SYNCLOGS : "1:N 同步记录"

    RECORDS ||--o{ VERSIONS : "1:N 版本快照"
    POSTS ||--o{ REPLIES : "1:N 回复"
    AUDITS }o--o{ ALERTS : "检测产出"
    CONSENTS ||--o{ AUDITS : "访问留痕"

    USERS {
        string id PK "U000001"
        string username UK
        string displayName
        string phone UK
        string passwordHash "sha256$salt$digest"
        boolean mfaEnabled
        string mfaFactors "sms|face"
        string status "active|locked|disabled"
        int failedCount
        int lockedUntil
        int lastLoginAt
        int createdAt
    }

    PROFILES {
        string id PK "P000001"
        string userId FK
        string realName
        string gender
        string birthDate
        string bloodType
        float height
        float weight
        float waist
        string idCard "展示时脱敏"
        string emergencyContact
        string emergencyPhone
        string smoking
        string drinking
        string exercise
    }

    RECORDS {
        string id PK "R000123"
        string userId FK
        string type "14 种类型之一"
        string title "由 titleField 派生"
        int date "由 dateField 派生"
        string summary "自动生成"
        string scope FK "→ consentScope"
        string diseaseCat FK "→ diseaseCategory"
        string severity
        boolean abnormal
        json data "该类型的全部字段值"
        string source "manual|sync|import"
        string sourceName
        string tags
        int version
        string searchText "供倒排索引"
        int createdAt
        int updatedAt
    }

    VERSIONS {
        string id PK "V000001"
        string recordId FK
        string userId FK
        int version
        string action "create|update|delete|rollback"
        json snapshot "完整记录快照"
        json changedFields "字段级差异"
        string operator
        string reason
        int at
    }

    CONSENTS {
        string id PK "C000001"
        string userId FK
        string code UK "XXXX-XXXX-XXXX"
        string doctorName
        string doctorTitle
        string hospital FK
        string department FK
        string licenseNo
        string purpose
        string scopes "授权范围 key 数组"
        string recordIds "可选：指定记录"
        int startAt
        int expireAt
        string status "active|revoked|expired"
        int accessCount
        int lastAccessAt
        int revokedAt
        string revokeReason
    }

    AUDITS {
        string id PK "L000001"
        string userId FK
        string actor "显示名"
        string actorType "user|doctor|system"
        string action FK "→ auditAction 32 项"
        string targetType
        string targetId
        string targetName
        string result "success|fail|denied"
        string detail
        string ip
        string device
        int at
    }

    ALERTS {
        string id PK "A000001"
        string userId FK
        string rule "6 条规则之一"
        string name
        string tone
        string severity
        string detail
        string suggestion
        int count
        string dedupeKey "规则@日期"
        boolean read
        boolean dismissed
        int at
    }

    POSTS {
        string id PK "M000001"
        string userId FK
        string board FK "→ communityBoard"
        string title
        string content
        boolean anonymous
        string alias "匿名昵称"
        string tags
        int likes
        int replyCount
        string status "normal|hidden|removed"
    }

    REPLIES {
        string id PK "N000001"
        string postId FK
        string userId FK
        string content
        boolean anonymous
        string alias
        int likes
        string status
    }

    PREFS {
        string id PK "F000001"
        string userId FK
        string theme "light|dark|auto"
        string fontSize "normal|large|xlarge"
        string contrast "normal|high"
        string motion "normal|reduced"
        string homeView
        string alertThreshold
        boolean weeklyReport
    }

    SYNCLOGS {
        string id PK "S000001"
        string userId FK
        string hospital FK
        string hospitalName
        int imported
        int skipped
        int total
        int at
    }
```

---

## 六、时序图 · 多因素登录

```mermaid
sequenceDiagram
    autonumber
    actor U as 患者
    participant V as auth.view.js
    participant A as auth.service.js
    participant L as lockout.js
    participant C as crypto.js
    participant M as mfa.js
    participant S as session.js
    participant AU as audit.service.js

    U->>V: 输入账号 + 密码，点击登录
    V->>A: login(account, password)

    A->>L: check(account)
    alt 账号已锁定
        L-->>A: {locked:true, remainSeconds}
        A->>AU: log(auth.login_fail)
        A-->>V: {ok:false, locked:true}
        V-->>U: 显示锁定倒计时，按钮禁用
    else 未锁定
        L-->>A: {locked:false}

        A->>A: findByAccount(account)
        alt 账号不存在
            A->>L: recordFailure(account)
            A->>AU: log(auth.login_fail)
            A-->>V: {ok:false, "账号或密码不正确"}
            Note over A,V: 提示语与"密码错误"完全一致<br/>防止账号枚举
        else 账号存在
            A->>C: verifyPassword(password, user.passwordHash)
            alt 密码错误
                C-->>A: false
                A->>L: recordFailure(account)
                alt 达到 5 次阈值
                    L-->>A: {locked:true, until}
                    A->>AU: log(auth.locked)
                    A-->>V: {ok:false, locked:true}
                else 未达阈值
                    A->>AU: log(auth.login_fail)
                    A-->>V: {ok:false, remaining}
                end
            else 密码正确
                C-->>A: true
                A->>L: reset(username)

                alt 已开启多因素认证
                    A->>M: start(user)
                    M->>M: 生成 6 位验证码（有效期 120 秒）
                    M-->>A: challenge
                    A->>AU: log(auth.login, "等待第二因素")
                    A-->>V: {ok:true, needMfa:true, challenge}
                    V-->>U: 显示验证码输入界面

                    loop 最多 5 次尝试
                        U->>V: 输入 6 位验证码
                        V->>A: verifyMfa('sms', code)
                        A->>M: verifySms(code)
                        alt 验证码正确且未过期
                            M-->>A: {ok:true}
                            A->>AU: log(auth.mfa_pass)
                            A->>S: start(user, {mfaVerified:true})
                            S-->>A: session{token}
                            A->>AU: log(auth.login, "登录成功")
                            A-->>V: {ok:true, user}
                            V->>V: PHR.shell.boot() → 渲染主框架
                        else 验证码错误
                            M-->>A: {ok:false, remaining}
                            A->>AU: log(auth.mfa_fail)
                            A-->>V: {ok:false, remaining}
                            V-->>U: 提示剩余尝试次数
                        end
                    end
                else 未开启多因素
                    A->>S: start(user, {mfaVerified:false})
                    S-->>A: session
                    A->>AU: log(auth.login)
                    A-->>V: {ok:true, user}
                end
            end
        end
    end

    Note over S: 勾了「7 天内自动登录」时会话存 localStorage<br/>（重开浏览器不用再输密码）；<br/>没勾则存 sessionStorage，关标签页即失效

    Note over S,AU: 空闲自动登出已删除。<br/>登录状态是绝对到期（默认 7 天），<br/>没有"一段时间不操作就退出"这回事。<br/>30 秒屏保只隐藏界面，不解锁任何东西。
```

---

## 七、时序图 · 医生授权访问档案

这张图是本系统最核心的业务流程 —— 需求中"可信共享"的完整实现。

```mermaid
sequenceDiagram
    autonumber
    actor P as 患者
    actor D as 医生
    participant CV as consent.view.js
    participant CS as consent.service.js
    participant DV as doctor.view.js
    participant RS as record.service.js
    participant SESS as session.js
    participant AU as audit.service.js

    rect rgb(224, 242, 246)
    Note over P,CS: 阶段一：患者创建授权
    P->>CV: 点击「＋ 新建授权」
    CV->>CS: scope.list()
    CS-->>CV: 9 个授权范围 + 每个范围包含的记录类型与记录数
    CV-->>P: 向导第 1 步：填写医生信息
    P->>CV: 姓名/职称/机构/科室/就诊目的
    CV-->>P: 向导第 2 步：勾选授权范围
    P->>CV: 勾选 basic/history/medication/allergy/vital/visit/insight
    CV-->>P: 向导第 3 步：选择有效期（1/3/7/14/30 天 或 自定义）
    P->>CV: 选择 14 天
    CV-->>P: 向导第 4 步：确认摘要（覆盖 47 条记录）
    P->>CV: 确认
    CV->>CS: grant({doctorName, scopes, days:14, ...})
    CS->>CS: 生成授权码 crypto.consentCode() → "K7M2-P9QX-3RTD"
    CS->>AU: log(consent.grant, "范围：基本信息、既往病史…；有效期 14 天")
    CS-->>CV: {ok:true, consent}
    CV-->>P: 显示授权码 + 「复制」按钮
    P->>D: 通过短信/微信把授权码告知医生
    end

    rect rgb(254, 243, 199)
    Note over D,SESS: 阶段二：医生凭授权码进入
    D->>CV: 在登录页点击「我是医生，用授权码查看」
    D->>CV: 输入授权码 + 姓名 + 职称 + 执业证号
    CV->>CS: verifyCode(code, doctorInfo)
    CS->>CS: byCode(code) → 找到授权记录
    CS->>CS: models.consent.effectiveStatus(consent)
    alt 授权有效（active）
        CS->>AU: log(consent.verify, "医生凭授权码进入受限视图")
        CS-->>CV: {ok:true, consent, doctor}
        CV->>SESS: startDoctorGuest(doctor, consent)
        CV->>CV: PHR.shell.enterDoctorMode()
        Note over CV: 外壳重建，导航只保留「医生视图」
        CV->>D: 跳转 #/doctor
    else 已撤销 / 已过期 / 不存在
        CS-->>CV: {ok:false, message:"授权已过期"}
        CV-->>D: ⛔ 拒绝进入，显示原因
    end
    end

    rect rgb(220, 252, 231)
    Note over D,AU: 阶段三：医生查看授权范围内的内容
    D->>DV: 打开医生视图
    DV->>SESS: currentConsent() / currentDoctor()
    SESS-->>DV: consent + doctor
    DV->>CS: scope.list() 过滤出已授权的范围
    CS-->>DV: 7 个已授权范围

    loop 医生点击每个授权范围
        D->>DV: 点击「体征指标」
        DV->>RS: forConsent(consent, {scopeKey:'vital'})
        Note over RS: 唯一判定入口：<br/>按 scope 过滤 + 校验 recordIds + 校验 userId
        RS-->>DV: 该范围内的记录数组
        DV->>CS: recordAccess(consent, {scopeKey, recordId, allowed:true})
        CS->>AU: log(consent.access, "查阅了「体征指标」")
        CS->>CS: accessCount++ , lastAccessAt = now
        DV-->>D: 渲染趋势图与统计
    end
    end

    rect rgb(254, 226, 226)
    Note over D,AU: 阶段四：越权尝试被阻断并留痕
    D->>DV: 点击「审计日志」（未授权范围）
    DV->>CS: recordAccess(consent, {scopeKey:'audit', allowed:false})
    CS->>AU: log(consent.denied, result:'denied', "该范围未在授权清单内，已阻断")
    CS-->>DV: 已记录
    DV-->>D: ⛔ toast："访问已被系统阻断并记录"
    Note over P: 患者下次打开「访问追踪」时<br/>会看到「越权访问被拒绝」告警
    end

    rect rgb(238, 243, 248)
    Note over P,CS: 阶段五：授权到期或被撤销
    alt 自然到期
        CS->>CS: sweepExpired() 检测 expireAt < now
        CS->>AU: log(consent.expired, "授权到期自动失效")
        SESS->>SESS: isDoctorGuest() 返回 false
        Note over SESS: 医生刷新页面即被踢出
    else 患者主动撤销
        P->>CV: 点击「撤销」并填写原因
        CV->>CS: revoke(id, reason)
        CS->>CS: status = 'revoked'
        CS->>AU: log(consent.revoke, "随访已结束，主动收回权限")
        CS-->>P: 撤销成功
    end
    end
```

---

## 八、时序图 · 录入记录与异常提醒

```mermaid
sequenceDiagram
    autonumber
    actor U as 患者
    participant EV as record-editor.view.js
    participant F as ui/form.js
    participant RS as record.service.js
    participant MD as models.record
    participant DB as db.records
    participant VS as version.service.js
    participant AU as audit.service.js
    participant BUS as event-bus.js
    participant IA as insight/anomaly-detector.js

    U->>EV: 打开 #/records-edit?type=vital
    EV->>F: render(dict.recordType('vital').fields, values)
    Note over F: 表单完全由字段模式自动生成
    F-->>U: 渲染表单（指标类型/测量时间/数值/单位…）

    U->>F: 选择「收缩压」并输入 158
    F->>EV: onFieldChange()
    EV->>EV: dict.judge('systolic', 158) → 'warning'
    EV-->>U: ⚠️ 实时提示"数值偏离正常范围，参考范围 90~129 mmHg"

    U->>EV: 点击「保存记录」
    EV->>F: read(formEl, fields)
    F-->>EV: values{metricKey:'systolic', value:158, ...}
    EV->>RS: create('vital', values)

    RS->>MD: validate('vital', values)
    MD-->>RS: {ok:true}
    RS->>MD: record.create('vital', values, {userId})
    Note over MD: 归一化：<br/>派生 title/date/summary/scope/searchText
    MD-->>RS: 标准记录对象

    RS->>DB: insert(row)
    DB-->>RS: saved{id:'R000124'}

    RS->>VS: snapshot(saved, 'create')
    VS->>VS: 写版本 v1
    VS-->>RS: version

    RS->>AU: log(record.create, "新增「体征指标」：收缩压")
    RS->>BUS: emit('record:changed') / emit('metric:changed')

    par 智能搜索
        BUS-)IA: 索引失效
        Note over IA: 下次搜索时重建倒排索引
    and 健康洞察
        BUS-)IA: metric:changed
        IA->>IA: scan() 重新扫描异常
        alt 检出 critical 级别
            IA->>AU: log(insight.alert, "收缩压 158 超出安全范围")
            IA-)U: toast.danger("指标异常提醒")
        end
    and 界面
        BUS-)EV: record:changed
        EV-->>U: toast.ok("已保存") → 跳回 #/records
    end
```

---

## 九、状态图 · 医生授权生命周期

```mermaid
stateDiagram-v2
    [*] --> 未创建

    未创建 --> 待生效 : grant()<br/>startAt > now
    未创建 --> 生效中 : grant()<br/>startAt ≤ now

    待生效 --> 生效中 : 到达 startAt<br/>（effectiveStatus 运行时判定）

    生效中 --> 已过期 : 到达 expireAt<br/>sweepExpired() 写 consent.expired 日志
    生效中 --> 已撤销 : revoke(reason)<br/>写 consent.revoke 日志

    已过期 --> 生效中 : extend(id, days)<br/>仅当状态未被 revoke
    已撤销 --> [*] : 不可恢复<br/>需重新创建授权

    已过期 --> [*]

    生效中 --> 生效中 : 医生每次访问<br/>accessCount++ / lastAccessAt 更新<br/>写 consent.access 日志
    生效中 --> 生效中 : 医生越权尝试<br/>写 consent.denied 日志（状态不变）

    note right of 生效中
        医生可凭授权码进入
        仅能查看 scopes 覆盖的范围
        每一次访问都会留痕
    end note

    note right of 已过期
        医生刷新页面即被踢出
        session.isDoctorGuest() 返回 false
        历史访问记录仍然保留
    end note
```

---

## 十、状态图 · 账号与会话

### 10.1 账号锁定状态

```mermaid
stateDiagram-v2
    [*] --> 正常 : register()

    正常 --> 正常 : 登录成功<br/>failedCount = 0
    正常 --> 失败计数中 : 密码错误<br/>failedCount++
    失败计数中 --> 失败计数中 : 继续失败<br/>（未达 5 次）
    失败计数中 --> 正常 : 登录成功<br/>lockout.reset()
    失败计数中 --> 已锁定 : failedCount ≥ 5<br/>写 auth.locked 日志<br/>锁定 5 分钟

    已锁定 --> 正常 : 锁定时间结束<br/>或 lockout.unlock()
    已锁定 --> 已锁定 : 锁定期间任何登录尝试<br/>均被拒绝并记录

    正常 --> 已停用 : 管理员停用
    已停用 --> [*]

    note right of 已锁定
        remainSeconds 倒计时
        界面按钮禁用并显示剩余时间
    end note
```

### 10.2 会话状态

```mermaid
stateDiagram-v2
    [*] --> 未登录

    未登录 --> 密码已通过 : login() 密码校验成功
    密码已通过 --> 未登录 : 取消 / 关闭页面
    密码已通过 --> 已登录 : verifyMfa() 通过<br/>（或未开启多因素直接进入）
    密码已通过 --> 未登录 : MFA 尝试次数超限

    已登录 --> 已登录 : 用户交互<br/>session.touch() 续期
    已登录 --> 已登出 : 用户主动退出<br/>写 auth.logout
    已登录 --> 已登出 : 空闲 30 分钟<br/>写 auth.logout（timeout）

    已登出 --> [*]

    state 已登录 {
        [*] --> 患者身份
        患者身份 --> 医生访客身份 : startDoctorGuest()<br/>在另一场景下进入
    }

    note right of 已登录
        会话存于 sessionStorage
        刷新页面(F5)保留
        关闭标签页即失效
    end note
```

---

## 十一、活动图 · 健康档案生命周期

对应需求原文："第一条是健康档案生命周期：用户输入、上传结构化报告或医院同步数据后，
系统自动分类，随后用于搜索、查看趋势和生成提醒，同时所有修改都保留版本记录。"

```mermaid
flowchart TD
    START([开始]) --> SOURCE{数据从哪来？}

    SOURCE -->|手动录入| MANUAL["用户在 #/records-edit 填表<br/>表单由字段模式自动生成"]
    SOURCE -->|医院同步| SYNC["用户在 #/records 点击「从医院同步」<br/>选择机构"]
    SOURCE -->|上传报告| IMPORT["用户在 #/records 点击「上传医院报告」<br/>选择 CSV / JSON"]

    SYNC --> PULL["sync.preview(hospitalKey)<br/>拉取远端数据（模拟）"]
    IMPORT --> PARSE["sync.previewFile(text, fileName)<br/>解析并预览可导入/重复/无效记录"]
    PULL --> DEDUP{"查重：<br/>同类型 + 同日期 + 同标题？"}
    PARSE --> DEDUP
    DEDUP -->|重复| SKIP["跳过该条"]
    DEDUP -->|新数据| CONFIRM["用户确认后写入"]
    SKIP --> CONFIRM

    MANUAL --> VALIDATE
    CONFIRM --> VALIDATE

    VALIDATE{"字段校验<br/>models.record.validate()"}
    VALIDATE -->|不通过| ERROR["界面标红字段并给出中文提示"]
    ERROR --> MANUAL
    VALIDATE -->|通过| NORMALIZE

    NORMALIZE["归一化 models.record.create()"]
    NORMALIZE --> DERIVE["自动派生：<br/>• title（由 titleField）<br/>• date（由 dateField）<br/>• summary（一句话摘要）<br/>• scope（归属授权范围）<br/>• searchText（可搜索文本）"]
    DERIVE --> PERSIST["写入 records 集合<br/>PHR.db.records.insert()"]

    PERSIST --> VERSION["写版本快照 v1<br/>version.service.snapshot()"]
    PERSIST --> AUDIT["写审计日志<br/>record.create"]
    PERSIST --> EVENTS["广播事件<br/>record:changed / metric:changed"]

    EVENTS --> SEARCHABLE["智能搜索：倒排索引失效<br/>下次检索时重建"]
    EVENTS --> TREND["健康洞察：趋势重新计算"]
    EVENTS --> ALERT["健康洞察：异常扫描"]
    EVENTS --> TIMELINE["时间线：自动出现新条目"]

    TREND --> CHART["趋势图更新"]
    ALERT --> HASABN{"检出异常？"}
    HASABN -->|是| NOTIFY["弹窗提醒用户<br/>写 insight.alert 日志"]
    HASABN -->|否| DONE

    SEARCHABLE --> USED["数据被使用"]
    CHART --> USED
    NOTIFY --> USED

    USED --> SHARE{"是否共享给医生？"}
    SHARE -->|是| CONSENT["创建授权<br/>选择范围与有效期"]
    CONSENT --> DOCTOR["医生凭授权码查阅<br/>每次访问留痕"]
    SHARE -->|否| DONE

    DOCTOR --> DONE
    DONE --> MODIFY{"是否修改？"}
    MODIFY -->|是| EDIT["编辑记录"]
    EDIT --> DIFF["version.diff() 计算字段级差异"]
    DIFF --> NEWVER["写新版本 v2, v3..."]
    NEWVER --> AUDIT2["写审计日志 record.update"]
    AUDIT2 --> EVENTS2["再次广播事件"]
    EVENTS2 --> USED

    MODIFY -->|否| ROLLBACK{"是否需要回滚？"}
    ROLLBACK -->|是| RB["versions.rollback(versionId)<br/>回滚本身也产生新版本"]
    RB --> USED
    ROLLBACK -->|否| END([结束])

    style PERSIST fill:#e0f2f6,stroke:#0e7490,stroke-width:2px
    style VERSION fill:#fff3e0,stroke:#b45309
    style AUDIT fill:#fee2e2,stroke:#b91c1c
```

---

## 十二、活动图 · 异常检测闭环

```mermaid
flowchart TD
    A([触发时机]) --> T1["登录成功后自动扫描"]
    A --> T2["用户打开「访问追踪」页"]
    A --> T3["写入高风险日志时实时触发<br/>（denied / locked / import）"]

    T1 --> LOAD
    T2 --> LOAD
    T3 --> LOAD

    LOAD["读取审计日志<br/>PHR.audit.mine()"] --> RULES

    subgraph RULES["安全治理层规则集（core/security.js，唯一定义处）"]
        R1["brute_force<br/>10 分钟内 ≥3 次登录失败"]
        R2["account_locked<br/>24 小时内触发过锁定"]
        R3["off_hours_access<br/>医生在 00:00-06:00 访问"]
        R4["bulk_read<br/>单条授权 24h 内被查 ≥15 次"]
        R5["denied_access<br/>存在越权被拒绝记录"]
        R6["export_activity<br/>7 天内发生过数据导出"]
    end

    LOAD --> R1 & R2 & R3 & R4 & R5 & R6

    R1 & R2 & R3 & R4 & R5 & R6 --> DETECT["detectAnomalies()<br/>产出告警对象数组"]

    DETECT --> DEDUP{"去重检查<br/>dedupeKey = 规则名@日期"}
    DEDUP -->|当天已存在| UPDATE["只更新计数与详情<br/>不重复插入"]
    DEDUP -->|新告警| INSERT["写入 alerts 集合"]

    INSERT --> EMIT["广播 security:alert 事件"]
    EMIT --> BADGE["顶栏铃铛红点 +1"]
    INSERT --> LOG["写审计 security.alert"]

    UPDATE --> RENDER
    BADGE --> RENDER["渲染到「访问追踪 → 安全告警」页签"]

    RENDER --> RISK["计算账号风险评分<br/>riskScore() → 0~100"]
    RISK --> USER{用户如何处置？}

    USER -->|标记已读| READ["read = true，红点消失"]
    USER -->|忽略| DISMISS["dismissed = true，从列表隐藏"]
    USER -->|去管理授权| GOTO["跳转 #/consent 撤销可疑授权"]
    USER -->|修改密码| PWD["跳转 #/profile 修改密码"]

    READ --> END([闭环完成])
    DISMISS --> END
    GOTO --> END
    PWD --> END

    style RULES fill:#fee2e2,stroke:#b91c1c
    style DEDUP fill:#fff3e0,stroke:#b45309
```

---

## 十三、部署图

本项目是**纯前端零依赖**应用，部署形态非常简单。

```mermaid
graph TB
    subgraph device["用户设备（PC / 手机 / 平板）"]
        subgraph browser["浏览器（Chrome / Edge / Firefox / Safari）"]
            subgraph app["应用运行时"]
                HTML["index.html<br/>入口页面"]
                JS["11 组脚本顺序加载<br/>core/ → ui/ → modules/"]
                DOM["DOM 渲染<br/>ui/shell.js 构建外壳"]
            end
            subgraph storage["浏览器本地存储"]
                LS["localStorage<br/>10 张数据表（持久）"]
                SS["sessionStorage<br/>会话令牌 / MFA 挑战 / 医生访客"]
            end
        end
    end

    FILE["📁 文件系统<br/>D:\\AAA_School_HomeWork\\"] -->|"file:// 双击打开"| HTML
    HTML --> JS --> DOM
    JS -->|"PHR.store 读写"| LS
    JS -->|"PHR.session 读写"| SS

    EXT["（真实产品才需要）<br/>医院 HIS/LIS 系统<br/>HL7 FHIR 接口<br/>服务端 + 数据库"]

    style EXT fill:#f1f5f9,stroke:#8496ab,stroke-dasharray: 5 5
    style LS fill:#dcfce7,stroke:#15803d
    style SS fill:#dbeafe,stroke:#1d4ed8
```

### 13.1 本演示环境 vs 真实生产环境

| 维度 | 本演示（当前实现） | 真实生产环境应有的形态 |
| --- | --- | --- |
| 运行位置 | 浏览器本地，`file://` 协议 | HTTPS 网站，前后端分离 |
| 数据存储 | `localStorage`（单机） | 服务端数据库（PostgreSQL / MongoDB）+ 对象存储 |
| 认证 | 客户端哈希校验 | 服务端校验，JWT / Session + OAuth2 |
| 口令哈希 | 纯 JS SHA-256 + 盐 | bcrypt / scrypt / Argon2 |
| 数据加密 | 导出文件 XOR 加密（演示级） | 传输 TLS 1.3 + 存储 AES-256-GCM，密钥由 KMS 托管 |
| 审计日志 | 本地数组，用户可改 | 只追加(append-only)存储 + 哈希链/签名，防篡改 |
| 医院同步 / 报告导入 | 内置模拟数据源 + CSV/JSON 结构化导入 | HL7 FHIR 接口 + 机构间数据共享协议；PDF/图片需 OCR 或检验结构化解析 |
| 人脸识别 | 随机数模拟 | 活体检测 + 服务端特征比对，模板加密存储 |
| 部署 | 复制文件夹即可 | 容器化 + CDN + 数据库主从 + 异地备份 |

---

## 附：图形与源码对应表

| 图形 | 对应源码位置 |
| --- | --- |
| 用例图 | 各模块 `README.md` 的"这个文件夹实现了什么"章节 |
| 分层架构图 | `core/README.md`、`ui/README.md`、各模块 README |
| 模块依赖图 | `index.html` 的 11 组脚本加载顺序注释 |
| 类图 | `core/models.js`（实体）、各 `*.service.js`（服务）、`core/security.js`（策略） |
| ER 图 | `core/models.js` 的 `PHR.db.schema`（10 张表定义） |
| 登录时序图 | `modules/auth/auth.service.js` + `mfa.js` + `session.js` + `lockout.js` |
| 授权时序图 | `modules/consent/consent.service.js` + `modules/records/record.service.js` 的 `forConsent/canView` |
| 录入时序图 | `modules/records/record-editor.view.js` + `record.service.js` + `version.service.js` |
| 授权状态图 | `PHR.models.consent.effectiveStatus()` + `consent.service.sweepExpired()` |
| 账号状态图 | `modules/auth/lockout.js` + `session.js` |
| 档案生命周期活动图 | `modules/records/` 全部服务 + `core/models.js` 的派生逻辑 |
| 异常检测活动图 | `core/security.js` 的 `anomalyRules` + `modules/audit/security-anomaly.js` |
| 部署图 | `index.html` 的加载方式说明 + `core/README.md` 的"加密能力的真实边界" |
