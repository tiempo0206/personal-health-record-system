/**
 * ============================================================================
 * 文件：core/seed.js
 * 层：核心基础设施层（示例数据种子）
 * 职责：首次打开网站时写入一套完整、贴近真实的示例数据，
 *      使用户不必注册、不必手工录入就能看到所有模块的实际效果
 *      —— 这是"点击即用"的关键。
 * 依赖：core/models.js、core/dict*.js、core/crypto.js、core/i18n
 * ============================================================================
 *
 * 写入内容：
 *   1 个示例账号（demo / Demo@2026）
 *   1 份个人基本信息
 *   约 60 条健康记录（覆盖全部 14 种类型，时间跨度约 18 个月）
 *   约 120 条体征指标（最近 90 天，含一条明显的改善趋势）
 *   3 条医生授权（生效中 / 已撤销 / 已过期）
 *   若干条审计日志与 1 条社群讨论
 * ============================================================================
 *
 * ⚠️ 示例内容是**要写进数据库的**，因此这里的每一句中文都通过 PHR.t() 取词：
 *    · 英文环境下首次打开 / 重建示例数据，库里存下来的就是英文内容
 *      （"Essential hypertension, grade 2" 这样的英文病历），
 *      与字典层给出的英文枚举名拼在一起，整份示例数据是自洽的。
 *    · 语言是在**播种那一刻**决定的。播种之后在界面里切换语言，不会回头
 *      改写已经入库的内容 —— 这是刻意的：病历内容的语言应当稳定，
 *      不该因为换了个界面语言就悄悄变样。要换一整套示例内容的语言，
 *      请在目标语言下执行 PHR.seed.run(true) 重建。
 *    · 个人姓名采用拼音（Zhang Xiaoyu / Li Jianguo），符合英文病历的惯例。
 *    · 枚举类取值（性别、血型、科室、疾病分类、记录类型…）是数据值，
 *      不在这里翻译，由字典层（core/dict*.js）按当前语言显示。
 *
 * 另：本文件在模块加载阶段只定义函数与中文原文；取词一律发生在 run() 之后
 *     （run() 会先确保语言已探测，见下面的 ensureLocale()）。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /**
   * 确保播种时语言已经确定。
   *
   * core/boot.js 的启动顺序是「先写示例数据、再探测语言」，若直接沿用，
   * 英文模式下播下去的仍会是中文内容。这里先探测一次 ——
   * detect() 是幂等的（只读 ?lang= / 本地偏好 / 浏览器语言），
   * boot 之后照常再调用一次不会有副作用。
   */
  function ensureLocale() {
    try { if (PHR.i18n && PHR.i18n.detect) { PHR.i18n.detect(); } } catch (e) { /* 忽略 */ }
  }

  /* ================================================================== *
   * 示例数据里的文本与语言
   * ------------------------------------------------------------------
   * 种子数据的长文本一律写成 U.t(词条键, '中文原文')。早先的做法是在**写入时**
   * 求值，于是存进库的是"灌数据那一刻的语言" —— 之后切换语言它不会变，
   * 英文界面下记录标题仍然是中文。
   *
   * 现在改成：写入一律用**中文原文**（语言中立），同时把「中文原文 → 词条键」
   * 记进 TEXT_KEYS；core/models.js 的 create() 会把它挂到记录上（row.i18n），
   * 显示时按当前语言解析。切语言、换账号都不用重灌。
   *
   * 因此无论灌数据时界面是什么语言，库里存的都是同一份中文原文。
   * ================================================================== */
  var TEXT_KEYS = {};

  /**
   * 登记一段带词条的文本，供**按值反查**（老数据、运行时生成的落库文本都靠它）。
   *
   * 同时登记两份：中文原文（语言中立的规范形式）与当前语言的译文 ——
   * 这样无论库里存的是哪一份，models 层都能反查出词条、按当前语言重取。
   *
   * @returns {string} 中文原文（有 zh 时）或当前译文
   */
  function rememberText(key, zh, params) {
    var source = (zh === undefined || zh === null) ? PHR.t(key, zh, params) : String(zh);
    if (params) {
      source = source.replace(/\{(\w+)\}/g, function (m, k) {
        return params[k] === undefined ? m : String(params[k]);
      });
    }
    if (!source) { return source; }
    var entry = { key: key, params: params || null, source: source };
    TEXT_KEYS[source] = entry;
    var localized = PHR.t(key, zh, params);
    if (localized && localized !== source) { TEXT_KEYS[localized] = entry; }
    return source;
  }

  /** 在灌数据期间替换 U.t：返回中文原文并登记词条键 */
  function withTextKeys(fn) {
    var orig = U.t;
    U.t = function (key, zh, params) { return rememberText(key, zh, params); };
    try { return fn(); } finally { U.t = orig; }
  }

  /** 取某段文本对应的词条（供 core/models.js 建 row.i18n 用） */
  function textKeyOf(value) {
    return (typeof value === 'string' && TEXT_KEYS[value]) ? TEXT_KEYS[value] : null;
  }

  /* ================================================================== *
   * 示例账号清单
   * ------------------------------------------------------------------
   * 首次打开会一次性建好这几个账号，覆盖各种测试场景：
   *   demo  完整数据 + 短信&人脸双因素   —— 主示例账号
   *   test  完整数据 + 仅短信            —— 验证「账号之间数据互相隔离」
   *   empty 无任何数据 + 仅短信          —— 验证空状态与录入引导
   *   nomfa 少量数据 + 关闭多因素认证     —— 验证「未开启 MFA 直接登录」分支
   *
   * ⚠️ 这些账号的口令是公开的，只适用于本地测试。
   *    真实产品绝不能预置任何账号。
   * ================================================================== */
  var ACCOUNTS = [
    {
      key: 'demo', username: 'demo', password: 'Demo@2026',
      displayName: '张小雨', phone: '13800138000', email: 'demo@example.com',
      mfaEnabled: true, mfaFactors: ['sms', 'face'], data: 'full',
      profile: {
        realName: '张小雨', gender: 'female', birthDate: '1985-04-16', bloodType: 'A',
        height: 163, weight: 70.5, waist: 82, maritalStatus: 'married',
        idCard: '310101198504161234',
        emergencyContact: '李伟', emergencyPhone: '13900139000',
        address: '上海市浦东新区某某路 100 号', occupation: '会计',
        bloodDonor: true, smoking: 'never', drinking: 'sometimes', exercise: 'sometimes'
      }
    },
    {
      key: 'test', username: 'test', password: 'Test@2026',
      displayName: '李伟', phone: '13900139000', email: 'test@example.com',
      mfaEnabled: true, mfaFactors: ['sms'], data: 'light',
      profile: {
        realName: '李伟', gender: 'male', birthDate: '1978-11-02', bloodType: 'O',
        height: 175, weight: 82, waist: 92, maritalStatus: 'married',
        idCard: '310101197811025678',
        emergencyContact: '张小雨', emergencyPhone: '13800138000',
        address: '上海市徐汇区某某路 200 号', occupation: '工程师',
        bloodDonor: false, smoking: 'former', drinking: 'often', exercise: 'never'
      }
    },
    {
      key: 'empty', username: 'empty', password: 'Empty@2026',
      displayName: '王小明', phone: '13700137000', email: '',
      mfaEnabled: true, mfaFactors: ['sms'], data: 'none',
      profile: null
    },
    {
      key: 'nomfa', username: 'nomfa', password: 'NoMfa@2026',
      displayName: '陈静', phone: '13600136000', email: '',
      mfaEnabled: false, mfaFactors: [], data: 'tiny',
      profile: {
        realName: '陈静', gender: 'female', birthDate: '1992-06-20', bloodType: 'B',
        height: 160, weight: 55, waist: 70, maritalStatus: 'single',
        idCard: '310101199206203456',
        emergencyContact: '陈父', emergencyPhone: '13500135000',
        address: '上海市静安区某某路 300 号', occupation: '教师',
        bloodDonor: true, smoking: 'never', drinking: 'never', exercise: 'often'
      }
    }
  ];

  /** 主示例账号（登录页与界面提示会直接引用它） */
  var DEMO = ACCOUNTS[0];

  /**
   * 账号的可读文案（姓名、联系人、地址、职业）按当前语言取一份副本。
   * 其余字段都是语言无关的数据（口令、手机号、日期、枚举 key）。
   */
  function accountView(a) {
    var p = a.profile ? Object.assign({}, a.profile, {
      realName: U.t('seed.acct.' + a.key + '.realName', a.profile.realName),
      emergencyContact: U.t('seed.acct.' + a.key + '.emergencyContact', a.profile.emergencyContact),
      address: U.t('seed.acct.' + a.key + '.address', a.profile.address),
      occupation: U.t('seed.acct.' + a.key + '.occupation', a.profile.occupation)
    }) : a.profile;
    return Object.assign({}, a, {
      displayName: U.t('seed.acct.' + a.key + '.displayName', a.displayName),
      profile: p
    });
  }

  var DAY = 86400000;
  var seededUserId = '';

  /* ------------------------------------------------------------------ *
   * 工具：往某个集合里插入一条数据
   * ------------------------------------------------------------------ */
  /* 采集模式下 put() 不写库 —— 供"数据已存在时只跑一遍文本采集"使用（见 run()） */
  var collecting = false;
  function put(repo, row) { return collecting ? row : repo.insert(row); }

  /** 生成 n 天前的 ISO 日期字符串 */
  function daysAgo(n) { return U.fmtDate(Date.now() - n * DAY); }

  /** 生成 n 天前的时间戳 */
  function tsDaysAgo(n) { return Date.now() - n * DAY; }

  /* ================================================================== *
   * 一、账号与基本信息
   * ================================================================== */
  /** 建好全部示例账号，返回 { key: userId } */
  function seedUsers() {
    var ids = {};
    ACCOUNTS.forEach(function (a) {
      var v = accountView(a);
      var user = PHR.models.user.create({
        username: a.username,
        displayName: v.displayName,
        phone: a.phone,
        email: a.email,
        role: 'patient',
        passwordHash: PHR.crypto.hashPassword(a.password),
        mfaEnabled: a.mfaEnabled,
        mfaFactors: a.mfaFactors,
        faceTemplate: a.mfaFactors.indexOf('face') >= 0 ? ('face-template-' + a.key) : null,
        lastLoginAt: tsDaysAgo(a.key === 'demo' ? 1 : 3),
        loginCount: a.key === 'demo' ? 12 : 3
      });
      ids[a.key] = put(PHR.db.users, user).id;
    });
    return ids;
  }

  /** 为「当前正在播种的账号」(seededUserId) 写入个人基本信息 */
  function seedProfile(account) {
    if (!account || !account.profile) { return; }
    var v = accountView(account);
    var p = PHR.models.profile.create(Object.assign({
      userId: seededUserId,
      phone: account.phone,
      email: account.email
    }, v.profile));
    put(PHR.db.profiles, p);
  }

  /* ================================================================== *
   * 二、健康记录
   * ================================================================== */
  function addRecord(type, values, opt) {
    opt = opt || {};
    var row = PHR.models.record.create(type, values, {
      userId: seededUserId,
      source: opt.source || 'manual',
      sourceName: opt.sourceName || ''
    });
    if (opt.daysAgo !== undefined) {
      var t = tsDaysAgo(opt.daysAgo);
      row.date = t;
      row.dateText = U.fmtDate(t);
    }
    return put(PHR.db.records, row);
  }

  function seedRecords() {

    /* 示例数据里的药名 / 规格 / 疗程 / 适应证 / 用药原因 / 不良反应 的中英对照表。
       逻辑判断仍然比中文原文（例如 r.drug.indexOf('二甲双胍')），
       只有写进数据库的那一份才取词 —— 语言切换不会影响判断条件。 */
    var SEED_DRUG_KEY = {
      '苯磺酸氨氯地平片': 'amlodipine',
      '厄贝沙坦片': 'irbesartan',
      '阿托伐他汀钙片': 'atorvastatin',
      '二甲双胍缓释片': 'metformin',
      '注射用头孢曲松钠': 'ceftriaxone',
      '布洛芬缓释胶囊': 'ibuprofen',
      '碳酸钙 D3 片': 'calciumD3',
      '氯沙坦钾片': 'losartan'
    };
    var SEED_SPEC_KEY = {
      '5mg × 7 片': 'amlodipine',
      '150mg × 7 片': 'irbesartan',
      '20mg × 7 片': 'atorvastatin',
      '0.5g × 30 片': 'metformin',
      '2g': 'ceftriaxone',
      '0.3g × 20 粒': 'ibuprofen',
      '50mg × 7 片': 'losartan'
    };
    var SEED_COURSE_KEY = { '长期': 'longTerm', '5 天': 'fiveDays', '按需': 'asNeeded' };
    var SEED_INDICATION_KEY = {
      '控制血压': 'bpControl',
      '降低低密度脂蛋白': 'ldlLowering',
      '控制血糖': 'glycemicControl',
      '阑尾炎术后抗感染': 'postOpAntibiotic',
      '术后镇痛': 'postOpAnalgesia',
      '降压': 'bpLowering',
      '降脂': 'lipidLowering',
      '降糖': 'glucoseLowering',
      '补钙': 'calciumSupplement'
    };
    var SEED_MED_SE_KEY = {
      '偶有轻微头晕，可耐受': 'dizziness',
      '服药初期有肌肉酸痛，已缓解': 'myalgia',
      '初期有轻度腹泻，2 周后适应': 'diarrhea'
    };
    var SEED_DOSE_KEY = { '1 片': 'oneTablet' };

    /* ---------- 基本信息类：确诊疾病 / 既往史 ---------- */
    addRecord('diagnosis', {
      diseaseName: U.t('seed.dx.hypertension', '原发性高血压'), diseaseCat: 'cardio', severity: 'moderate',
      diagnosedDate: daysAgo(430), status: 'control',
      hospital: 'hosp_rm', department: 'cardio', doctor: U.t('seed.doc.liJianguo', '李建国 主任医师'),
      basis: U.t('seed.dx.hypertension.basis',
        '多次门诊测量血压 ≥ 150/95 mmHg，动态血压监测确认'),
      conclusion: U.t('seed.dx.hypertension.conclusion',
        '建议长期口服降压药，低盐饮食，每月复查血压'),
      note: U.t('seed.dx.hypertension.note', '家族中父亲与祖父都有高血压')
    }, { daysAgo: 430 });

    addRecord('diagnosis', {
      diseaseName: U.t('seed.dx.t2dm', '2 型糖尿病'), diseaseCat: 'endocrine', severity: 'mild',
      diagnosedDate: daysAgo(300), status: 'control',
      hospital: 'hosp_rm', department: 'endocrine', doctor: U.t('seed.doc.wangMin', '王敏 副主任医师'),
      basis: U.t('seed.dx.t2dm.basis', '空腹血糖 8.9 mmol/L，糖化血红蛋白 7.8%'),
      conclusion: U.t('seed.dx.t2dm.conclusion',
        '二甲双胍 0.5g 每日两次，控制饮食，3 个月后复查糖化血红蛋白'),
      note: U.t('seed.dx.t2dm.note', '目前血糖控制尚可')
    }, { daysAgo: 300 });

    addRecord('diagnosis', {
      diseaseName: U.t('seed.dx.hyperlipidemia', '高脂血症'), diseaseCat: 'cardio', severity: 'mild',
      diagnosedDate: daysAgo(295), status: 'control',
      hospital: 'hosp_rm', department: 'cardio',
      basis: U.t('seed.dx.hyperlipidemia.basis', 'LDL-C 3.9 mmol/L，总胆固醇 6.1 mmol/L'),
      conclusion: U.t('seed.dx.hyperlipidemia.conclusion', '低脂饮食 + 他汀类药物')
    }, { daysAgo: 295 });

    /* ---------- 过敏史 ---------- */
    addRecord('allergy', {
      allergen: U.t('seed.alg.penicillin', '青霉素'), allergenType: 'drug', severity: 'severe',
      reactions: ['rash', 'swelling'], foundDate: daysAgo(1200),
      confirmedBy: 'test',
      handling: U.t('seed.alg.penicillin.handling',
        '立即停药，肌注肾上腺素并送医；就诊时务必主动告知医生'),
      emergencyDrug: U.t('seed.alg.penicillin.emergencyDrug', '随身携带肾上腺素笔'),
      note: U.t('seed.alg.penicillin.note', '病历首页需醒目标注')
    }, { daysAgo: 1200 });

    addRecord('allergy', {
      allergen: U.t('seed.alg.mango', '芒果'), allergenType: 'food', severity: 'mild',
      reactions: ['rash', 'itch'], foundDate: daysAgo(2000),
      confirmedBy: 'self',
      handling: U.t('seed.alg.mango.handling', '避免食用，误食后口服氯雷他定')
    }, { daysAgo: 2000 });

    addRecord('allergy', {
      allergen: U.t('seed.alg.dustMite', '尘螨'), allergenType: 'pollen', severity: 'moderate',
      reactions: ['sneeze', 'asthma'], foundDate: daysAgo(900),
      confirmedBy: 'test',
      handling: U.t('seed.alg.dustMite.handling', '勤换床品，发作时使用抗组胺药')
    }, { daysAgo: 900 });

    /* ---------- 家族病史 ---------- */
    addRecord('family', {
      relation: 'father', diseaseName: U.t('seed.fam.hypertension', '高血压'), diseaseCat: 'cardio',
      onsetAge: 52, alive: 'yes', recordDate: daysAgo(430),
      note: U.t('seed.fam.father.note', '长期服药控制，目前血压稳定')
    }, { daysAgo: 430 });

    addRecord('family', {
      relation: 'mother', diseaseName: U.t('seed.fam.t2dm', '2 型糖尿病'), diseaseCat: 'endocrine',
      onsetAge: 58, alive: 'yes', recordDate: daysAgo(430)
    }, { daysAgo: 430 });

    addRecord('family', {
      relation: 'grandfather_p', diseaseName: U.t('seed.fam.stroke', '脑卒中'), diseaseCat: 'neuro',
      onsetAge: 68, alive: 'no', recordDate: daysAgo(430),
      note: U.t('seed.fam.grandfather.note', '70 岁时因脑出血去世')
    }, { daysAgo: 430 });

    addRecord('family', {
      relation: 'sister', diseaseName: U.t('seed.fam.hypothyroidism', '甲状腺功能减退'), diseaseCat: 'endocrine',
      onsetAge: 34, alive: 'yes', recordDate: daysAgo(200)
    }, { daysAgo: 200 });

    /* ---------- 门诊就诊 ---------- */
    var visits = [
      { id: 'v1', d: 420, dep: 'cardio',    doc: U.t('seed.doc.liJianguo', '李建国 主任医师'),
        cc: '体检发现血压升高 1 周', dx: '原发性高血压 1 级',
        tx: '暂不服药，先做生活方式干预，1 个月后复查', cost: 86.5, type: 'outpatient' },
      { id: 'v2', d: 300, dep: 'endocrine', doc: U.t('seed.doc.wangMin', '王敏 副主任医师'),
        cc: '多饮多尿伴体重下降 2 个月', dx: '2 型糖尿病',
        tx: '二甲双胍 0.5g bid，控制主食摄入，3 个月复查', cost: 132.0, type: 'outpatient' },
      { id: 'v3', d: 240, dep: 'cardio',    doc: U.t('seed.doc.liJianguo', '李建国 主任医师'),
        cc: '降压药复诊', dx: '原发性高血压 2 级',
        tx: '调整为氨氯地平 5mg qd + 厄贝沙坦 150mg qd', cost: 95.0, type: 'followup' },
      { id: 'v4', d: 180, dep: 'endocrine', doc: U.t('seed.doc.wangMin', '王敏 副主任医师'),
        cc: '糖尿病复查', dx: '2 型糖尿病，血糖控制尚可',
        tx: '维持原方案，增加每周 3 次有氧运动', cost: 110.0, type: 'followup' },
      { id: 'v5', d: 150, dep: 'emerg',     doc: U.t('seed.doc.erOnCall', '急诊值班医生'),
        cc: '突发右下腹疼痛 6 小时', dx: '急性阑尾炎（后经手术证实）',
        tx: '立即收入院行急诊手术', cost: 320.0, type: 'emergency' },
      { id: 'v6', d: 90,  dep: 'cardio',    doc: U.t('seed.doc.liJianguo', '李建国 主任医师'),
        cc: '血压随访', dx: '原发性高血压，血压趋于达标',
        tx: '维持现有方案，继续家庭血压监测', cost: 78.0, type: 'followup' },
      { id: 'v7', d: 45,  dep: 'endocrine', doc: U.t('seed.doc.wangMin', '王敏 副主任医师'),
        cc: '糖尿病随访', dx: '2 型糖尿病，血糖控制良好',
        tx: '二甲双胍减量为 0.5g qd，继续监测', cost: 102.0, type: 'followup' },
      { id: 'v8', d: 12,  dep: 'cardio',    doc: U.t('seed.doc.liJianguo', '李建国 主任医师'),
        cc: '常规复诊', dx: '血压达标，继续维持',
        tx: '3 个月后复查，期间如出现头晕及时就诊', cost: 68.0, type: 'followup' }
    ];
    visits.forEach(function (v) {
      addRecord('visit', {
        visitDate: daysAgo(v.d), hospital: 'hosp_rm', department: v.dep, doctor: v.doc,
        visitType: v.type,
        chiefComplaint: U.t('seed.visit.' + v.id + '.cc', v.cc),
        diagnosis: U.t('seed.visit.' + v.id + '.dx', v.dx),
        diseaseCat: v.dep === 'cardio' ? 'cardio' : v.dep === 'endocrine' ? 'endocrine' : 'other',
        treatment: U.t('seed.visit.' + v.id + '.tx', v.tx), cost: v.cost
      }, { daysAgo: v.d });
    });

    /* ---------- 检验报告 ---------- */
    /* 检验项目名重复出现，这里用一张对照表统一取词；
       判断条件（l.item）仍用中文原文，逻辑不受语言影响。 */
    var LAB_ITEM_KEY = {
      '空腹血糖': 'glucose', '总胆固醇': 'cholesterol', '低密度脂蛋白': 'ldl',
      '糖化血红蛋白': 'hba1c', '血肌酐': 'creatinine', '谷丙转氨酶': 'alt',
      '血尿酸': 'uricAcid', '白细胞计数': 'wbc', 'C 反应蛋白': 'crp'
    };
    var LAB_IMPRESSION_ABNORMAL = '结果超出参考范围，建议结合临床判断';
    var LAB_IMPRESSION_NORMAL = '未见明显异常';

    var labs = [
      { d: 420, item: '空腹血糖', result: 5.8, unit: 'mmol/L', ref: '3.9 - 6.1', ab: false },
      { d: 420, item: '总胆固醇', result: 5.6, unit: 'mmol/L', ref: '< 5.2', ab: true },
      { d: 420, item: '低密度脂蛋白', result: 3.6, unit: 'mmol/L', ref: '< 3.4', ab: true },
      { d: 300, item: '空腹血糖', result: 8.9, unit: 'mmol/L', ref: '3.9 - 6.1', ab: true },
      { d: 300, item: '糖化血红蛋白', result: 7.8, unit: '%', ref: '4.0 - 6.0', ab: true },
      { d: 300, item: '总胆固醇', result: 6.1, unit: 'mmol/L', ref: '< 5.2', ab: true },
      { d: 300, item: '低密度脂蛋白', result: 3.9, unit: 'mmol/L', ref: '< 3.4', ab: true },
      { d: 300, item: '血肌酐', result: 72, unit: 'μmol/L', ref: '44 - 106', ab: false },
      { d: 300, item: '谷丙转氨酶', result: 32, unit: 'U/L', ref: '0 - 40', ab: false },
      { d: 240, item: '空腹血糖', result: 7.2, unit: 'mmol/L', ref: '3.9 - 6.1', ab: true },
      { d: 240, item: '低密度脂蛋白', result: 3.4, unit: 'mmol/L', ref: '< 3.4', ab: false },
      { d: 180, item: '空腹血糖', result: 6.6, unit: 'mmol/L', ref: '3.9 - 6.1', ab: true },
      { d: 180, item: '糖化血红蛋白', result: 6.9, unit: '%', ref: '4.0 - 6.0', ab: true },
      { d: 180, item: '血尿酸', result: 452, unit: 'μmol/L', ref: '150 - 420', ab: true },
      { d: 150, item: '白细胞计数', result: 13.2, unit: '10⁹/L', ref: '3.5 - 9.5', ab: true },
      { d: 150, item: 'C 反应蛋白', result: 46, unit: 'mg/L', ref: '< 8', ab: true },
      { d: 90,  item: '空腹血糖', result: 6.1, unit: 'mmol/L', ref: '3.9 - 6.1', ab: false },
      { d: 90,  item: '低密度脂蛋白', result: 3.0, unit: 'mmol/L', ref: '< 3.4', ab: false },
      { d: 90,  item: '血尿酸', result: 415, unit: 'μmol/L', ref: '150 - 420', ab: false },
      { d: 45,  item: '空腹血糖', result: 5.9, unit: 'mmol/L', ref: '3.9 - 6.1', ab: false },
      { d: 45,  item: '糖化血红蛋白', result: 6.3, unit: '%', ref: '4.0 - 6.0', ab: true },
      { d: 45,  item: '谷丙转氨酶', result: 28, unit: 'U/L', ref: '0 - 40', ab: false },
      { d: 12,  item: '空腹血糖', result: 5.7, unit: 'mmol/L', ref: '3.9 - 6.1', ab: false },
      { d: 12,  item: '低密度脂蛋白', result: 2.7, unit: 'mmol/L', ref: '< 3.4', ab: false }
    ];
    labs.forEach(function (l) {
      addRecord('lab', {
        reportDate: daysAgo(l.d), hospital: 'hosp_rm',
        department: l.item === '糖化血红蛋白' || l.item === '空腹血糖' ? 'endocrine' : 'general',
        itemName: U.t('seed.labItem.' + (LAB_ITEM_KEY[l.item] || 'other'), l.item),
        result: l.result, unit: l.unit, refRange: l.ref, abnormal: l.ab,
        diseaseCat: l.item.indexOf('血糖') >= 0 || l.item === '糖化血红蛋白' ? 'endocrine' : 'cardio',
        impression: l.ab
          ? U.t('seed.lab.impression.abnormal', LAB_IMPRESSION_ABNORMAL)
          : U.t('seed.lab.impression.normal', LAB_IMPRESSION_NORMAL)
      }, { daysAgo: l.d, source: 'sync', sourceName: D.nameOf(D.hospital, 'hosp_rm') });
    });

    /* ---------- 影像检查 ---------- */
    addRecord('imaging', {
      examDate: daysAgo(418), hospital: 'hosp_rm', department: 'cardio',
      modality: U.t('seed.img.ecg', '心电图'), bodyPart: U.t('seed.img.body.heart', '心脏'),
      findings: U.t('seed.img.ecg1.findings', '窦性心律，各波形态正常，未见明显 ST-T 改变'),
      impression: U.t('seed.img.ecg1.impression', '心电图大致正常'), severity: 'info', diseaseCat: 'cardio'
    }, { daysAgo: 418, source: 'sync', sourceName: D.nameOf(D.hospital, 'hosp_rm') });

    addRecord('imaging', {
      examDate: daysAgo(150), hospital: 'hosp_rm', department: 'general',
      modality: U.t('seed.img.us', '超声'), bodyPart: U.t('seed.img.body.abdomen', '腹部'),
      findings: U.t('seed.img.us1.findings',
        '右下腹可见阑尾增粗，直径约 11mm，周围脂肪间隙模糊，可见少量渗出'),
      impression: U.t('seed.img.us1.impression', '考虑急性阑尾炎，建议结合临床及手术'),
      severity: 'moderate', diseaseCat: 'digestive'
    }, { daysAgo: 150, source: 'sync', sourceName: D.nameOf(D.hospital, 'hosp_rm') });

    addRecord('imaging', {
      examDate: daysAgo(145), hospital: 'hosp_rm', department: 'general',
      modality: U.t('seed.img.ct', 'CT'), bodyPart: U.t('seed.img.body.abdomen', '腹部'),
      findings: U.t('seed.img.ct1.findings', '阑尾切除术后改变，术区未见明显积液'),
      impression: U.t('seed.img.ct1.impression', '术后改变，未见明显异常'), severity: 'info', diseaseCat: 'digestive'
    }, { daysAgo: 145 });

    addRecord('imaging', {
      examDate: daysAgo(30), hospital: 'hosp_rm', department: 'cardio',
      modality: U.t('seed.img.us', '超声'), bodyPart: U.t('seed.img.body.heart', '心脏'),
      findings: U.t('seed.img.us2.findings', '左室舒张功能减低，射血分数约 58%'),
      impression: U.t('seed.img.us2.impression', '左室舒张功能减低，与高血压相关，建议控制血压'),
      severity: 'mild', diseaseCat: 'cardio'
    }, { daysAgo: 30 });

    /* ---------- 处方 ---------- */
    var rx = [
      { d: 240, drug: '苯磺酸氨氯地平片', spec: '5mg × 7 片', dose: '5mg', freq: 'qd', course: '长期', qty: 4, ind: '控制血压' },
      { d: 240, drug: '厄贝沙坦片',       spec: '150mg × 7 片', dose: '150mg', freq: 'qd', course: '长期', qty: 4, ind: '控制血压' },
      { d: 240, drug: '阿托伐他汀钙片',   spec: '20mg × 7 片', dose: '20mg', freq: 'qd', course: '长期', qty: 4, ind: '降低低密度脂蛋白' },
      { d: 300, drug: '二甲双胍缓释片',   spec: '0.5g × 30 片', dose: '0.5g', freq: 'bid', course: '长期', qty: 2, ind: '控制血糖' },
      { d: 150, drug: '注射用头孢曲松钠', spec: '2g', dose: '2g', freq: 'qd', course: '5 天', qty: 1, ind: '阑尾炎术后抗感染' },
      { d: 150, drug: '布洛芬缓释胶囊',   spec: '0.3g × 20 粒', dose: '0.3g', freq: 'prn', course: '按需', qty: 1, ind: '术后镇痛' }
    ];
    rx.forEach(function (r) {
      addRecord('prescription', {
        prescribedDate: daysAgo(r.d), hospital: 'hosp_rm',
        department: r.drug.indexOf('二甲双胍') >= 0 ? 'endocrine' : 'cardio',
        doctor: r.drug.indexOf('二甲双胍') >= 0
          ? U.t('seed.doc.wangMin', '王敏 副主任医师')
          : U.t('seed.doc.liJianguo', '李建国 主任医师'),
        drugName: U.t('seed.drug.' + SEED_DRUG_KEY[r.drug], r.drug),
        spec: U.t('seed.drugSpec.' + SEED_SPEC_KEY[r.spec], r.spec),
        dose: r.dose, frequency: r.freq,
        route: 'po',
        course: U.t('seed.course.' + SEED_COURSE_KEY[r.course], r.course),
        quantity: r.qty,
        indication: U.t('seed.indication.' + SEED_INDICATION_KEY[r.ind], r.ind)
      }, { daysAgo: r.d });
    });

    /* ---------- 用药记录 ---------- */
    var meds = [
      { d: 240, drug: '苯磺酸氨氯地平片', dose: '5mg', freq: 'qd', lt: true,  reason: '降压', adh: 'good', se: '' },
      { d: 240, drug: '厄贝沙坦片',       dose: '150mg', freq: 'qd', lt: true, reason: '降压', adh: 'good', se: '偶有轻微头晕，可耐受' },
      { d: 240, drug: '阿托伐他汀钙片',   dose: '20mg', freq: 'qd', lt: true, reason: '降脂', adh: 'fair', se: '服药初期有肌肉酸痛，已缓解' },
      { d: 300, drug: '二甲双胍缓释片',   dose: '0.5g', freq: 'bid', lt: true, reason: '降糖', adh: 'good', se: '初期有轻度腹泻，2 周后适应' },
      { d: 200, drug: '碳酸钙 D3 片',     dose: '1 片', freq: 'qd', lt: true, reason: '补钙', adh: 'fair', se: '' },
      { d: 150, drug: '注射用头孢曲松钠', dose: '2g', freq: 'qd', lt: false, endD: 145, reason: '术后抗感染', adh: 'good', se: '' }
    ];
    meds.forEach(function (m) {
      addRecord('medication', {
        drugName: U.t('seed.drug.' + SEED_DRUG_KEY[m.drug], m.drug),
        dose: SEED_DOSE_KEY[m.dose] ? U.t('seed.dose.' + SEED_DOSE_KEY[m.dose], m.dose) : m.dose,
        frequency: m.freq, route: 'po',
        startDate: daysAgo(m.d), endDate: m.endD ? daysAgo(m.endD) : '',
        longTerm: m.lt, reason: U.t('seed.indication.' + SEED_INDICATION_KEY[m.reason], m.reason),
        adherence: m.adh,
        sideEffect: m.se ? U.t('seed.medSE.' + SEED_MED_SE_KEY[m.se], m.se) : ''
      }, { daysAgo: m.d });
    });

    /* ---------- 手术与住院 ---------- */
    addRecord('surgery', {
      surgeryName: U.t('seed.sx.appendectomy', '腹腔镜阑尾切除术'), surgeryDate: daysAgo(149),
      hospital: 'hosp_rm', department: 'surgery',
      anesthesia: 'general',
      reason: U.t('seed.dx.appendicitis', '急性阑尾炎'),
      outcome: U.t('seed.sx.outcome', '手术顺利，术后第 5 天出院，切口愈合良好'),
      severity: 'moderate'
    }, { daysAgo: 149 });

    addRecord('hospitalization', {
      admitDate: daysAgo(150), dischargeDate: daysAgo(145),
      hospital: 'hosp_rm', department: 'surgery',
      admitDiagnosis: U.t('seed.dx.appendicitis', '急性阑尾炎'),
      dischargeDiagnosis: U.t('seed.hz.dischargeDx', '急性化脓性阑尾炎（术后）'),
      bedNo: '32-2', attendingDoctor: U.t('seed.doc.chenGang', '陈刚 副主任医师'), cost: 12680.5,
      summary: U.t('seed.hz.summary',
        '入院后急诊行腹腔镜阑尾切除术，术后予抗感染、补液及镇痛治疗，恢复顺利。'),
      conclusion: U.t('seed.hz.conclusion',
        '出院后 1 周内避免剧烈运动，切口保持干燥，1 个月后门诊复查')
    }, { daysAgo: 145 });

    /* ---------- 疫苗接种 ---------- */
    addRecord('vaccination', {
      vaccineName: U.t('seed.vax.fluQuad', '流感疫苗（四价）'), vaccineDate: daysAgo(340), doseNo: '1',
      site: D.nameOf(D.hospital, 'hosp_jk'), batchNo: 'FLU2025A0312',
      manufacturer: U.t('seed.vax.manufacturer', '某某生物制品有限公司'),
      reaction: U.t('seed.vax.reaction.mild', '接种部位轻微酸痛，1 天后自行缓解')
    }, { daysAgo: 340 });

    addRecord('vaccination', {
      vaccineName: U.t('seed.vax.hepB', '乙肝疫苗'), vaccineDate: daysAgo(700), doseNo: '3',
      site: D.nameOf(D.hospital, 'hosp_jk'), reaction: U.t('seed.vax.reaction.none', '无明显不适')
    }, { daysAgo: 700 });

    /* ---------- 体检报告 ---------- */
    addRecord('checkup', {
      checkupDate: daysAgo(365),
      institution: U.t('seed.checkupCenter', '{name}体检中心', { name: D.nameOf(D.hospital, 'hosp_rm') }),
      checkupType: 'routine',
      conclusion: U.t('seed.checkup1.conclusion',
        '血压偏高、血脂偏高、空腹血糖偏高，建议专科就诊进一步评估'),
      abnormalItems: [
        U.t('seed.checkupItem.bp', '血压'), U.t('seed.checkupItem.cholesterol', '总胆固醇'),
        U.t('seed.checkupItem.ldl', '低密度脂蛋白'), U.t('seed.checkupItem.glucose', '空腹血糖')
      ],
      advice: U.t('seed.checkup1.advice',
        '低盐低脂饮食，每周至少 150 分钟中等强度运动，3 个月后复查'),
      nextDate: daysAgo(275)
    }, { daysAgo: 365, source: 'sync', sourceName: D.nameOf(D.hospital, 'hosp_rm') });

    addRecord('checkup', {
      checkupDate: daysAgo(60),
      institution: U.t('seed.checkupCenter', '{name}体检中心', { name: D.nameOf(D.hospital, 'hosp_rm') }),
      checkupType: 'routine',
      conclusion: U.t('seed.checkup2.conclusion',
        '血压、血脂、血糖较上次均有改善，体重下降 4.5kg，继续保持'),
      abnormalItems: [U.t('seed.checkupItem.hba1c', '糖化血红蛋白')],
      advice: U.t('seed.checkup2.advice', '维持现有治疗方案与生活方式，半年后复查'),
      nextDate: daysAgo(-120)
    }, { daysAgo: 60, source: 'sync', sourceName: D.nameOf(D.hospital, 'hosp_rm') });

    /* ---------- 健康笔记 ---------- */
    addRecord('note', {
      noteDate: daysAgo(20), title: U.t('seed.note1.title', '换季时血压容易波动'),
      content: U.t('seed.note1.content',
        '最近早晚温差大，早上测的血压比中午高 10mmHg 左右，打算把测量时间固定在起床后 30 分钟。'),
      tags: [U.t('seed.tag.bp', '血压'), U.t('seed.tag.season', '季节')]
    }, { daysAgo: 20 });

    addRecord('note', {
      noteDate: daysAgo(8), title: U.t('seed.note2.title', '下次复诊要问医生的问题'),
      content: U.t('seed.note2.content',
        '1. 二甲双胍能不能再减量？2. 他汀需要长期吃吗？3. 心脏超声的舒张功能减低要不要处理？'),
      tags: [U.t('seed.tag.followup', '复诊'), U.t('seed.tag.medication', '用药')]
    }, { daysAgo: 8 });

    addRecord('note', {
      noteDate: daysAgo(2), title: U.t('seed.note3.title', '运动记录'),
      content: U.t('seed.note3.content',
        '开始每天晚饭后快走 40 分钟，连续 5 天了，感觉睡眠质量有改善。'),
      tags: [U.t('seed.tag.exercise', '运动'), U.t('seed.tag.sleep', '睡眠')]
    }, { daysAgo: 2 });
  }

  /* ================================================================== *
   * 三、体征指标（趋势数据）
   * ================================================================== */
  /**
   * 生成体征指标趋势。
   * @param {object} opt {
   *   days:        观察窗口天数（默认 90）
   *   height:      用于计算 BMI 的身高（米）
   *   sysBase:     收缩压起始值      diaBase: 舒张压起始值
   *   glucoseBase: 空腹血糖起始值    weightBase: 体重起始值
   *   improved:    是否呈现"治疗见效、指标逐步改善"的走势
   * }
   */
  function seedVitals(opt) {
    opt = opt || {};

    /* 测量情境的中英对照（写进数据库的那份按当前语言取词） */
    var SEED_VITAL_CTX_KEY = {
      '晨起空腹安静状态': 'morningRest',
      '空腹静脉血': 'fastingVenous',
      '手环记录': 'band',
      '手机计步': 'phoneSteps'
    };

    var win = opt.days || 90;
    var heightM = opt.height || 1.63;
    var sysBase = opt.sysBase || 148;
    var diaBase = opt.diaBase || 94;
    var glucoseBase = opt.glucoseBase || 7.4;
    var weightBase = opt.weightBase || 74.2;
    var improved = opt.improved !== false;
    var rows = [];

    /** 生成一条体征记录 */
    function vital(days, metricKey, value, value2, ctx) {
      var m = D.metric(metricKey);
      rows.push({
        metricKey: metricKey,
        measuredAt: U.fmtDate(tsDaysAgo(days)) + (ctx && ctx.evening ? ' 20:30' : ' 07:15'),
        value: value,
        value2: value2 === undefined ? '' : value2,
        unit: m ? m.unit : '',
        measureWay: ctx && ctx.way ? ctx.way : 'home',
        context: ctx && ctx.context
          ? U.t('seed.vitalCtx.' + SEED_VITAL_CTX_KEY[ctx.context], ctx.context)
          : U.t('seed.vitalCtx.morningRest', '晨起空腹安静状态'),
        note: ''
      });
    }

    /** 进度：0 表示窗口开始，1 表示今天 */
    function progressAt(d) { return (win - d) / win; }

    /* 血压：每 3 天一次；improved 时由偏高逐步达标，否则维持偏高 */
    for (var d = win; d >= 0; d -= 3) {
      var p = progressAt(d);
      var drop = improved ? 20 * p : 0;
      var dropD = improved ? 12 * p : 0;
      var systolic = Math.round(sysBase - drop + U.floatBetween(-5, 5, 0));
      var diastolic = Math.round(diaBase - dropD + U.floatBetween(-4, 4, 0));
      // 窗口中部制造一次异常波动（熬夜加班）
      var mid = Math.round(win / 2);
      if (d >= mid - 3 && d <= mid + 3) { diastolic += 7; systolic += 12; }
      vital(d, 'systolic', systolic);
      vital(d, 'diastolic', diastolic);
    }

    /* 血糖：每 7 天一次 */
    for (var g = win - 6; g >= 0; g -= 7) {
      var pg = progressAt(g);
      vital(g, 'glucose', Number((glucoseBase - (improved ? 1.6 * pg : 0) + U.floatBetween(-0.4, 0.4, 1)).toFixed(1)));
    }

    /* 心率：每 5 天一次 */
    for (var h = win - 5; h >= 0; h -= 5) {
      vital(h, 'heartRate', Math.round(84 - 8 * progressAt(h) + U.floatBetween(-4, 4, 0)));
    }

    /* 体重与 BMI：每 7 天一次 */
    for (var w = win - 6; w >= 0; w -= 7) {
      var weight = Number((weightBase - (improved ? 3.7 * progressAt(w) : 0) + U.floatBetween(-0.3, 0.3, 1)).toFixed(1));
      vital(w, 'weight', weight);
      vital(w, 'bmi', Number((weight / (heightM * heightM)).toFixed(1)));
    }

    /* 腰围：每 14 天 */
    for (var wa = win - 6; wa >= 0; wa -= 14) {
      vital(wa, 'waist', Number((85 - 3 * progressAt(wa) + U.floatBetween(-1, 1, 1)).toFixed(1)));
    }

    /* 血脂 / 尿酸 / 肝功能：每月，共 4 次 */
    [84, 56, 28, 3].forEach(function (dd, i) {
      if (dd > win) { return; }
      var decay = improved ? 0.3 * i : 0;
      vital(dd, 'ldl', Number((3.9 - decay + U.floatBetween(-0.15, 0.15, 2)).toFixed(2)), undefined, { way: 'clinic', context: '空腹静脉血' });
      vital(dd, 'uricAcid', Math.round(460 - 18 * i * (improved ? 1 : 0) + U.floatBetween(-15, 15, 0)), undefined, { way: 'clinic' });
      vital(dd, 'alt', Math.round(38 - 3 * i + U.floatBetween(-5, 5, 0)), undefined, { way: 'clinic' });
      vital(dd, 'creatinine', Math.round(74 - i + U.floatBetween(-4, 4, 0)), undefined, { way: 'clinic' });
    });

    /* 睡眠与步数：每天（最多取最近 30 天，避免数据量过大） */
    for (var s = Math.min(30, win); s >= 0; s--) {
      vital(s, 'sleepHours', Number(U.floatBetween(5.8, 8.4, 1).toFixed(1)), undefined, { way: 'device', context: '手环记录' });
      vital(s, 'steps', U.intBetween(3200, 11800), undefined, { way: 'device', context: '手机计步' });
    }

    /* 把这些"字段值"包装成标准记录写入 records 集合 */
    rows.forEach(function (r) {
      var row = PHR.models.record.create('vital', r, { userId: seededUserId, source: 'manual' });
      var t = U.parseDate(String(r.measuredAt).slice(0, 10));
      // 用准确的测量时间覆盖记录日期
      var parts = String(r.measuredAt).split(' ');
      if (parts[1]) {
        var hm = parts[1].split(':');
        t = U.parseDate(parts[0]) + Number(hm[0]) * 3600000 + Number(hm[1]) * 60000;
      }
      row.date = t;
      row.dateText = U.fmtFull(t);
      put(PHR.db.records, row);
    });
  }

  /* ================================================================== *
   * 三之二、轻量数据集（给 test / nomfa 等辅助测试账号使用）
   * ------------------------------------------------------------------
   * 与 demo 的"完整病史故事"不同，这里是一套通用的、覆盖全部 14 种
   * 记录类型的精简数据，用来验证：
   *   · 账号之间的数据是否真正隔离（test 看不到 demo 的记录）
   *   · 稀疏数据下各页面是否仍能正常渲染
   * 日期字段（dateField）由 addLightRecord 自动补齐，不需要手写。
   * ================================================================== */
  var LIGHT_RECORDS = [
    { type: 'allergy', d: 900,
      i18n: { allergen: 'seed.alg.sulfa', handling: 'seed.alg.sulfa.handling' },
      data: { allergen: '磺胺类药物', allergenType: 'drug', severity: 'moderate', reactions: ['rash'], handling: '避免使用，就诊时主动告知医生' } },
    { type: 'diagnosis', d: 400,
      i18n: { diseaseName: 'seed.dx.hypertension', basis: 'seed.light.hypertension.basis', conclusion: 'seed.light.hypertension.conclusion' },
      data: { diseaseName: '原发性高血压', diseaseCat: 'cardio', severity: 'mild', status: 'control', hospital: 'hosp_rm', department: 'cardio', basis: '门诊多次测量血压 ≥ 140/90 mmHg', conclusion: '低盐饮食，规律服药，每月复查血压' } },
    { type: 'family', d: 400,
      i18n: { diseaseName: 'seed.fam.hypertension' },
      data: { relation: 'father', diseaseName: '高血压', diseaseCat: 'cardio', onsetAge: 55, alive: 'yes' } },
    { type: 'medication', d: 380,
      i18n: { drugName: 'seed.drug.losartan', reason: 'seed.indication.bpLowering' },
      data: { drugName: '氯沙坦钾片', dose: '50mg', frequency: 'qd', route: 'po', longTerm: true, reason: '降压', adherence: 'fair' } },
    { type: 'prescription', d: 120,
      i18n: { doctor: 'seed.doc.zhangWei', drugName: 'seed.drug.losartan', spec: 'seed.drugSpec.losartan', course: 'seed.course.longTerm', indication: 'seed.indication.bpLowering' },
      data: { hospital: 'hosp_rm', department: 'cardio', doctor: '张伟 主治医师', drugName: '氯沙坦钾片', dose: '50mg', frequency: 'qd', route: 'po', course: '长期', indication: '降压' } },
    { type: 'visit', d: 120,
      i18n: { doctor: 'seed.doc.zhangWei', chiefComplaint: 'seed.light.v1.cc', diagnosis: 'seed.light.v1.dx', treatment: 'seed.light.v1.tx' },
      data: { visitType: 'followup', hospital: 'hosp_rm', department: 'cardio', doctor: '张伟 主治医师', chiefComplaint: '降压药复诊', diagnosis: '血压控制尚可', diseaseCat: 'cardio', treatment: '维持原方案，继续家庭血压监测' } },
    { type: 'lab', d: 118,
      i18n: { itemName: 'seed.labItem.cholesterol', impression: 'seed.light.lab1.impression' },
      data: { hospital: 'hosp_rm', itemName: '总胆固醇', result: 5.8, unit: 'mmol/L', refRange: '< 5.2', abnormal: true, diseaseCat: 'cardio', impression: '偏高，建议低脂饮食' } },
    { type: 'lab', d: 118,
      i18n: { itemName: 'seed.labItem.glucose' },
      data: { hospital: 'hosp_rm', itemName: '空腹血糖', result: 5.4, unit: 'mmol/L', refRange: '3.9 - 6.1', abnormal: false, diseaseCat: 'endocrine' } },
    { type: 'imaging', d: 117,
      i18n: { modality: 'seed.img.ecg', bodyPart: 'seed.img.body.heart', findings: 'seed.light.ecg.findings', impression: 'seed.light.ecg.impression' },
      data: { hospital: 'hosp_rm', department: 'cardio', modality: '心电图', bodyPart: '心脏', findings: '窦性心律，未见明显 ST-T 改变', impression: '大致正常心电图', severity: 'info', diseaseCat: 'cardio' } },
    { type: 'checkup', d: 200,
      i18n: { institution: 'seed.light.cdCenter', conclusion: 'seed.light.checkup.conclusion', advice: 'seed.light.checkup.advice' },
      data: { institution: '市中心医院体检中心', checkupType: 'routine', conclusion: '血脂偏高，其余指标基本正常', abnormalItems: ['总胆固醇'], advice: '低脂饮食，3 个月后复查血脂' } },
    { type: 'vaccination', d: 300,
      i18n: { vaccineName: 'seed.vax.fluQuad', site: 'seed.site.jk', reaction: 'seed.vax.reaction.none' },
      data: { vaccineName: '流感疫苗（四价）', doseNo: '1', site: '健康社区卫生服务中心', reaction: '无明显不适' } },
    { type: 'surgery', d: 1200,
      i18n: { surgeryName: 'seed.sx.appendectomyPlain', reason: 'seed.dx.appendicitis', outcome: 'seed.light.sx.outcome' },
      data: { surgeryName: '阑尾切除术', hospital: 'hosp_cd', department: 'surgery', anesthesia: 'general', reason: '急性阑尾炎', outcome: '恢复良好，无并发症', severity: 'mild' } },
    { type: 'hospitalization', d: 1200,
      i18n: { admitDiagnosis: 'seed.dx.appendicitis', dischargeDiagnosis: 'seed.light.hz.dischargeDx', attendingDoctor: 'seed.doc.liuGang', summary: 'seed.light.hz.summary' },
      data: { hospital: 'hosp_cd', department: 'surgery', admitDiagnosis: '急性阑尾炎', dischargeDiagnosis: '急性阑尾炎（术后）', bedNo: '18-3', attendingDoctor: '刘刚 副主任医师', summary: '入院后行阑尾切除术，术后恢复顺利' } },
    { type: 'note', d: 15,
      i18n: { title: 'seed.light.note.title', content: 'seed.light.note.content' },
      data: { title: '换季血压记录', content: '早晚温差大，晨起血压比中午高 8 mmHg 左右，已把测量时间固定在起床后 30 分钟。', tags: ['血压'] } },
    { type: 'vital', d: 2,
      i18n: { context: 'seed.light.morningSelf' },
      data: { metricKey: 'systolic', value: 146, unit: 'mmHg', measureWay: 'home', context: '晨起自测' } }
  ];

  /** 数组型文本字段里的词条（体检异常项、笔记标签） */
  var SEED_ARRAY_TEXT_KEY = {
    '总胆固醇': 'seed.labItem.cholesterol',
    '血压': 'seed.tag.bp'
  };

  /**
   * 轻量记录：把自由文本字段的词条键登记到 TEXT_KEYS。
   *
   * i18n 映射表写的是**完整的词条键**。这里的 U.t() 跑在 withTextKeys() 里，
   * 所以它返回的是中文原文（不是当前语言的译文），并把「原文 → 键」登记下来；
   * 真正入库的是中文原文，切语言后由 models.fieldText() 解析。
   */
  function localizeLight(entry) {
    var data = Object.assign({}, entry.data);
    var map = entry.i18n || {};
    Object.keys(map).forEach(function (f) {
      if (typeof data[f] === 'string' && data[f]) { data[f] = U.t(map[f], data[f]); }
    });
    ['abnormalItems', 'tags'].forEach(function (f) {
      if (Array.isArray(data[f])) {
        data[f] = data[f].map(function (x) {
          return SEED_ARRAY_TEXT_KEY[x] ? U.t(SEED_ARRAY_TEXT_KEY[x], x) : x;
        });
      }
    });
    return data;
  }

  /** 写入一条轻量记录；dateField 自动按 d 天前补齐 */
  function addLightRecord(entry) {
    var t = D.recordType(entry.type);
    var date = daysAgo(entry.d);
    var data = localizeLight(entry);

    if (t.dateField && !data[t.dateField]) {
      var fd = t.fields.filter(function (f) { return f.name === t.dateField; })[0];
      data[t.dateField] = (fd && fd.type === 'datetime') ? (date + ' 08:30') : date;
    }

    var row = PHR.models.record.create(entry.type, data, {
      userId: seededUserId,
      source: entry.type === 'lab' || entry.type === 'imaging' ? 'sync' : 'manual',
      sourceName: entry.type === 'lab' || entry.type === 'imaging' ? D.nameOf(D.hospital, 'hosp_rm') : ''
    });
    return put(PHR.db.records, row);
  }

  /** 写入前 limit 条轻量记录（limit 省略则全部写入） */
  function seedLightRecords(limit) {
    LIGHT_RECORDS.slice(0, limit || LIGHT_RECORDS.length).forEach(addLightRecord);
  }

  /* ================================================================== *
   * 三之三、心理测评示例数据
   * ------------------------------------------------------------------
   * ⚠️ 刻意让**所有**种子数据的 PHQ-9 第 9 题（自伤念头）都为 0。
   *    否则首次打开报告页就弹危机干预资源，讲解节奏会被打断。
   *    要展示危机流程，请在作答页按页面提示主动把第 9 题选成「好几天」——
   *    把危机干预变成**可控的**，而不是靠随机数据意外触发。
   * ================================================================== */

  /** 心理测评的示例作答（题号 → 选项值） */
  var ASSESSMENT_SEED = [
    { scale: 'phq9', d: 90, answers: [2, 2, 2, 2, 1, 1, 1, 1, 0] },
    { scale: 'phq9', d: 45, answers: [1, 2, 1, 1, 1, 1, 1, 1, 0] },
    { scale: 'phq9', d: 10, answers: [1, 1, 1, 1, 0, 1, 0, 0, 0] },
    { scale: 'gad7', d: 30, answers: [2, 1, 1, 1, 1, 1, 1] },
    { scale: 'isi',  d: 20, answers: [2, 1, 1, 2, 2, 1, 1] },
    { scale: 'who5', d: 14, answers: [4, 3, 3, 3, 4] }
  ];

  function seedAssessments(entries) {
    if (!PHR.assessment || !PHR.assessment.report) { return 0; }
    var n = 0;

    (entries || ASSESSMENT_SEED).forEach(function (e) {
      var answers = {};
      e.answers.forEach(function (v, idx) { answers[idx + 1] = v; });

      var at = tsDaysAgo(e.d);
      var built = PHR.assessment.report.build(e.scale, answers, { userId: seededUserId, at: at });
      if (!built) { return; }

      put(PHR.db.assessments, {
        userId: seededUserId,
        scaleKey: built.scaleKey,
        scaleName: built.scaleName,
        total: built.total,
        max: built.max,
        percent: built.percent,
        raw: built.raw,
        transformed: built.transformed,
        level: built.level,
        dimensions: built.dimensions,
        items: built.items,
        critical: built.critical,
        crisis: built.crisis,
        coping: built.coping,
        recommends: built.recommends,
        noCutoff: built.noCutoff,
        source: built.source,
        disclaimer: built.disclaimer,
        at: at
      });
      n++;
    });
    return n;
  }

  /* ================================================================== *
   * 四、医生授权
   * ================================================================== */
  function seedConsents() {
    /* 1) 生效中：心血管复诊 */
    var active = PHR.models.consent.create({
      userId: seededUserId,
      code: 'K7M2-P9QX-3RTD',
      doctorName: U.t('seed.docName.liJianguo', '李建国'),
      doctorTitle: U.t('seed.docTitle.chief', '主任医师'),
      hospital: 'hosp_rm', department: 'cardio', licenseNo: '1101001234567',
      purpose: U.t('seed.consent.active.purpose', '高血压随访复诊，需查看近期血压趋势与用药情况'),
      scopes: ['basic', 'history', 'medication', 'allergy', 'vital', 'visit', 'insight'],
      startAt: tsDaysAgo(5),
      expireAt: tsDaysAgo(-9),
      status: 'active',
      accessCount: 4,
      lastAccessAt: tsDaysAgo(1),
      note: U.t('seed.consent.active.note', '仅限本次复诊使用')
    });
    put(PHR.db.consents, active);

    /* 2) 已撤销：一次急诊后主动收回 */
    var revoked = PHR.models.consent.create({
      userId: seededUserId,
      code: 'B4YN-6HWC-2FJK',
      doctorName: U.t('seed.docName.chenGang', '陈刚'),
      doctorTitle: U.t('seed.docTitle.associateChief', '副主任医师'),
      hospital: 'hosp_rm', department: 'surgery', licenseNo: '1101007654321',
      purpose: U.t('seed.consent.revoked.purpose', '阑尾炎术后随访'),
      scopes: ['basic', 'history', 'lab', 'medication'],
      startAt: tsDaysAgo(120),
      expireAt: tsDaysAgo(-30),
      status: 'revoked',
      accessCount: 7,
      lastAccessAt: tsDaysAgo(100),
      revokedAt: tsDaysAgo(95),
      revokeReason: U.t('seed.consent.revoked.reason', '随访已结束，主动收回权限')
    });
    put(PHR.db.consents, revoked);

    /* 3) 已过期：一次体检解读 */
    var expired = PHR.models.consent.create({
      userId: seededUserId,
      code: 'Z9QP-5WME-8LVA',
      doctorName: U.t('seed.docName.wangMin', '王敏'),
      doctorTitle: U.t('seed.docTitle.associateChief', '副主任医师'),
      hospital: 'hosp_rm', department: 'endocrine', licenseNo: '1101002468013',
      purpose: U.t('seed.consent.expired.purpose', '糖尿病用药方案调整咨询'),
      scopes: ['basic', 'lab', 'medication', 'vital'],
      startAt: tsDaysAgo(70),
      expireAt: tsDaysAgo(40),
      status: 'active',           // 故意不标记，用于展示"运行时识别过期"
      accessCount: 5,
      lastAccessAt: tsDaysAgo(45)
    });
    put(PHR.db.consents, expired);
  }

  /**
   * 为辅助测试账号（test）建一条可用的授权，方便用同一个授权码
   * 验证"医生的授权码只能打开对应那位患者的档案"。
   */
  function seedLightConsent() {
    put(PHR.db.consents, PHR.models.consent.create({
      userId: seededUserId,
      code: 'T3ST-PAT2-0001',
      doctorName: U.t('seed.docName.zhangWei', '张伟'),
      doctorTitle: U.t('seed.docTitle.attending', '主治医师'),
      hospital: 'hosp_rm', department: 'cardio', licenseNo: '1101005556667',
      purpose: U.t('seed.consent.light.purpose', '高血压门诊复诊（测试账号 test 的授权）'),
      scopes: ['basic', 'vital', 'medication'],
      startAt: tsDaysAgo(2),
      expireAt: tsDaysAgo(-7),
      status: 'active',
      accessCount: 1,
      lastAccessAt: tsDaysAgo(1),
      note: U.t('seed.consent.light.note', '用于验证「一条授权只能看一位患者」')
    }));
  }

  /**
   * 附加的可用授权码清单。
   * 之所以单独列一张表：这些码要写进根目录的《测试账号与授权码.txt》，
   * 集中放在一处便于核对，避免文档与代码对不上。
   */
  var EXTRA_CONSENTS = [
    {
      code: 'W3FH-8KMN-5QRT',
      doctorName: '王敏', doctorTitle: '副主任医师',
      department: 'endocrine', licenseNo: '1101002468013',
      purpose: '糖尿病随访：只看化验与用药，不需要生活隐私数据',
      scopes: ['basic', 'lab', 'medication', 'vital'],
      startDaysAgo: 3, expireInDays: 30,
      note: '示例：「只给必要范围」的最小授权'
    },
    {
      code: 'D6PX-2VJC-9WYB',
      doctorName: '陈刚', doctorTitle: '副主任医师',
      department: 'surgery', licenseNo: '1101007654321',
      purpose: '急诊会诊：需要快速了解基础病与用药',
      scopes: ['basic', 'history', 'medication', 'allergy', 'vital'],
      startDaysAgo: 0, expireInDays: 1,
      note: '示例：「最短有效期」，明天此时自动失效'
    },
    {
      code: 'N4TK-7RMG-3HFZ',
      doctorName: '刘芳', doctorTitle: '主任医师',
      department: 'general', licenseNo: '1101009998887',
      purpose: '全科慢病管理：需要完整档案（含健康洞察结论）',
      scopes: ['basic', 'history', 'family', 'medication', 'allergy', 'lab', 'vital', 'visit', 'insight'],
      startDaysAgo: 10, expireInDays: 90,
      note: '示例：「最大范围 + 最长有效期」'
    },
    {
      code: 'PSYC-REPT-2345',
      doctorName: '周敏', doctorTitle: '副主任医师',
      department: 'other', licenseNo: '1101003334445',
      purpose: '心理科门诊：需要查看既往心理量表结果',
      scopes: ['basic', 'psych'],
      startDaysAgo: 1, expireInDays: 14,
      note: '示例：「心理测评报告」范围的单独授权（敏感范围，默认不勾选）'
    }
  ];

  /** 附加授权的可读文案（在写入时按当前语言取词） */
  var EXTRA_CONSENT_I18N = {
    'W3FH-8KMN-5QRT': {
      doctorName: 'seed.docName.wangMin', doctorTitle: 'seed.docTitle.associateChief',
      purpose: 'seed.consent.extra.wangMin.purpose', note: 'seed.consent.extra.wangMin.note'
    },
    'D6PX-2VJC-9WYB': {
      doctorName: 'seed.docName.chenGang', doctorTitle: 'seed.docTitle.associateChief',
      purpose: 'seed.consent.extra.chenGang.purpose', note: 'seed.consent.extra.chenGang.note'
    },
    'N4TK-7RMG-3HFZ': {
      doctorName: 'seed.docName.liuFang', doctorTitle: 'seed.docTitle.chief',
      purpose: 'seed.consent.extra.liuFang.purpose', note: 'seed.consent.extra.liuFang.note'
    },
    'PSYC-REPT-2345': {
      doctorName: 'seed.docName.zhouMin', doctorTitle: 'seed.docTitle.associateChief',
      purpose: 'seed.consent.extra.zhouMin.purpose', note: 'seed.consent.extra.zhouMin.note'
    }
  };

  /** 写入附加授权 */
  function seedExtraConsents() {
    EXTRA_CONSENTS.forEach(function (c) {
      var k = EXTRA_CONSENT_I18N[c.code] || {};
      put(PHR.db.consents, PHR.models.consent.create({
        userId: seededUserId,
        code: c.code,
        doctorName: k.doctorName ? U.t(k.doctorName, c.doctorName) : c.doctorName,
        doctorTitle: k.doctorTitle ? U.t(k.doctorTitle, c.doctorTitle) : c.doctorTitle,
        hospital: 'hosp_rm', department: c.department, licenseNo: c.licenseNo,
        purpose: k.purpose ? U.t(k.purpose, c.purpose) : c.purpose,
        scopes: c.scopes.slice(),
        startAt: tsDaysAgo(c.startDaysAgo),
        expireAt: tsDaysAgo(-c.expireInDays),
        status: 'active',
        accessCount: 0,
        lastAccessAt: 0,
        note: k.note ? U.t(k.note, c.note) : c.note
      }));
    });
  }

  /* ================================================================== *
   * 五、审计日志
   * ================================================================== */
  function seedAudits() {
    /* 审计日志里出现的固定角色名与授权名称，先集中取词，避免同一句话写多遍 */
    var SELF = U.t('seed.actor.self', '本人');
    var SYSTEM = U.t('seed.actor.system', '系统');
    var UNKNOWN = U.t('seed.actor.unknown', '未知来源');
    var DOC_LI = U.t('seed.docName.liJianguo', '李建国');
    var DOC_CHEN = U.t('seed.docName.chenGang', '陈刚');
    var DOC_WANG = U.t('seed.docName.wangMin', '王敏');
    var CONSENT_LI = U.t('seed.audit.consentTo', '授权给 {name} 主任医师', { name: DOC_LI });
    var CONSENT_CHEN = U.t('seed.audit.consentToAssociate', '授权给 {name} 副主任医师', { name: DOC_CHEN });
    var CONSENT_CARDIO = U.t('seed.consent.active.shortName', '心血管复诊授权');
    var CONSENT_DM = U.t('seed.consent.expired.shortName', '糖尿病用药咨询授权');
    var CONSENT_POSTOP = U.t('seed.consent.revoked.shortName', '术后随访授权');

    var logs = [
      { d: 5,   actor: SELF, actorType: 'user',   action: 'consent.grant',  targetType: 'consent', targetName: CONSENT_LI, detail: U.t('seed.audit.a1.detail', '范围：基本信息、既往病史、用药记录、过敏史、体征指标、就诊记录、健康洞察；有效期 14 天'), result: 'success' },
      { d: 4,   actor: DOC_LI, actorType: 'doctor', action: 'consent.access', targetType: 'consent', targetName: CONSENT_CARDIO, detail: U.t('seed.audit.a2.detail', '查阅了「体征指标」与「用药记录」'), result: 'success' },
      { d: 3,   actor: DOC_LI, actorType: 'doctor', action: 'consent.access', targetType: 'consent', targetName: CONSENT_CARDIO, detail: U.t('seed.audit.a3.detail', '查阅了「既往病史」'), result: 'success' },
      { d: 1,   actor: DOC_LI, actorType: 'doctor', action: 'consent.access', targetType: 'consent', targetName: CONSENT_CARDIO, detail: U.t('seed.audit.a4.detail', '查阅了「过敏史」'), result: 'success' },
      { d: 1,   actor: SELF, actorType: 'user',   action: 'auth.login',     targetType: 'user',    targetName: 'demo', detail: U.t('seed.audit.a5.detail', '密码 + 短信验证码'), result: 'success', ip: '223.166.12.34', device: 'Windows · Chrome' },
      { d: 1,   actor: SELF, actorType: 'user',   action: 'record.view',    targetType: 'record',  targetName: U.t('seed.audit.a6.name', '糖化血红蛋白检验报告'), result: 'success' },
      { d: 2,   actor: SELF, actorType: 'user',   action: 'record.create',  targetType: 'record',  targetName: U.t('seed.note3.title', '运动记录'), result: 'success' },
      { d: 8,   actor: SELF, actorType: 'user',   action: 'search.run',     targetType: 'search',  targetName: U.t('seed.audit.a8.name', '关键词：血糖'), detail: U.t('seed.audit.a8.detail', '命中 12 条记录'), result: 'success' },
      { d: 12,  actor: SELF, actorType: 'user',   action: 'record.create',  targetType: 'record',  targetName: U.t('seed.audit.a9.name', '门诊就诊'), result: 'success' },
      { d: 20,  actor: SELF, actorType: 'user',   action: 'record.create',  targetType: 'record',  targetName: U.t('seed.note1.title', '换季时血压容易波动'), result: 'success' },
      { d: 45,  actor: DOC_WANG, actorType: 'doctor', action: 'consent.access', targetType: 'consent', targetName: CONSENT_DM, detail: U.t('seed.audit.a11.detail', '查阅了「检验检查报告」'), result: 'success' },
      { d: 60,  actor: SYSTEM, actorType: 'system', action: 'sync.pull',      targetType: 'sync',    targetName: D.nameOf(D.hospital, 'hosp_rm'), detail: U.t('seed.audit.a12.detail', '同步到 1 份体检报告'), result: 'success' },
      { d: 95,  actor: SELF, actorType: 'user',   action: 'consent.revoke', targetType: 'consent', targetName: CONSENT_CHEN, detail: U.t('seed.consent.revoked.reason', '随访已结束，主动收回权限'), result: 'success' },
      { d: 100, actor: DOC_CHEN, actorType: 'doctor', action: 'consent.access', targetType: 'consent', targetName: CONSENT_POSTOP, detail: U.t('seed.audit.a14.detail', '查阅了「住院记录」'), result: 'success' },
      { d: 101, actor: DOC_CHEN, actorType: 'doctor', action: 'consent.denied', targetType: 'consent', targetName: CONSENT_POSTOP, detail: U.t('seed.audit.a15.detail', '尝试查阅「健康洞察结论」，该范围未在授权清单内，已阻断'), result: 'denied' },
      { d: 120, actor: SELF, actorType: 'user',   action: 'consent.grant',  targetType: 'consent', targetName: CONSENT_CHEN, result: 'success' },
      { d: 145, actor: SYSTEM, actorType: 'system', action: 'consent.expired',targetType: 'consent', targetName: CONSENT_DM, detail: U.t('seed.audit.a17.detail', '授权到期自动失效'), result: 'success' },
      { d: 200, actor: SELF, actorType: 'user',   action: 'auth.password',  targetType: 'user',    targetName: 'demo', result: 'success' },
      { d: 210, actor: UNKNOWN, actorType: 'system', action: 'auth.login_fail', targetType: 'user', targetName: 'demo', detail: U.t('seed.audit.a19.detail', '密码错误（连续第 2 次）'), result: 'fail', ip: '45.132.88.201', device: 'Linux · Firefox' },
      { d: 210, actor: UNKNOWN, actorType: 'system', action: 'auth.login_fail', targetType: 'user', targetName: 'demo', detail: U.t('seed.audit.a20.detail', '密码错误（连续第 3 次）'), result: 'fail', ip: '45.132.88.201', device: 'Linux · Firefox' },
      { d: 300, actor: SELF, actorType: 'user',   action: 'auth.register',  targetType: 'user',    targetName: 'demo', result: 'success', ip: '223.166.12.34', device: 'Windows · Chrome' }
    ];

    logs.forEach(function (l) {
      var entry = PHR.models.audit.create({
        userId: seededUserId,
        actor: l.actor, actorType: l.actorType, action: l.action,
        targetType: l.targetType || '', targetName: l.targetName || '',
        detail: l.detail || '', result: l.result || 'success',
        ip: l.ip || '223.166.12.34',
        device: l.device || 'Windows · Chrome',
        at: tsDaysAgo(l.d)
      });
      put(PHR.db.audits, entry);
    });
  }

  /* ================================================================== *
   * 六、患者社群
   * ================================================================== */
  function seedCommunity() {
    var post1 = put(PHR.db.posts, PHR.models.post.create({
      userId: seededUserId,
      board: 'chronic',
      title: U.t('seed.post1.title', '确诊高血压两年，从 150/95 降到 128/80 的一些体会'),
      content: U.t('seed.post1.content',
        '刚确诊那会儿特别焦虑，觉得要吃一辈子药。两年下来血压基本稳定在 130/82 左右，分享几点：\n\n' +
        '1. 家庭血压计一定要买，而且要固定时间测，我固定在早上起床后 30 分钟。\n' +
        '2. 减盐比想象中重要，酱油、咸菜、外卖里的钠都很多。\n' +
        '3. 少熬夜。我每次连续熬夜几天，血压立刻上 10 个点。\n' +
        '4. 药不要自己停，我试过一次，反弹得比原来还高。\n\n' +
        '希望大家都能把血压管住。'),
      anonymous: true, alias: U.t('seed.alias.pine', '向阳松树 27'),
      tags: [U.t('seed.tag.hypertension', '高血压'), U.t('seed.tag.experience', '经验分享')], likes: 34
    }));

    put(PHR.db.replies, PHR.models.reply.create({
      postId: post1.id, anonymous: true, alias: U.t('seed.alias.dolphin', '从容海豚 08'),
      content: U.t('seed.reply1.content', '第 4 点太重要了，我爸就是自己停药进的医院，现在再也不敢了。'),
      likes: 12
    }));
    put(PHR.db.replies, PHR.models.reply.create({
      postId: post1.id, anonymous: true, alias: U.t('seed.alias.moon', '安静月亮 41'),
      content: U.t('seed.reply2.content', '请问你用的是哪种血压计？我在纠结上臂式还是腕式。'),
      likes: 5
    }));
    put(PHR.db.replies, PHR.models.reply.create({
      postId: post1.id, userId: seededUserId, anonymous: true, alias: U.t('seed.alias.pine', '向阳松树 27'),
      content: U.t('seed.reply3.content', '一定要上臂式，腕式误差大，医生也不推荐。'),
      likes: 9, isAuthor: true
    }));

    put(PHR.db.posts, PHR.models.post.create({
      userId: seededUserId,
      board: 'nutrition',
      title: U.t('seed.post2.title', '糖友早餐吃什么？我的一周菜单'),
      content: U.t('seed.post2.content',
        '确诊糖尿病以后最难的就是早餐。试验了几个月，现在固定这几样，血糖基本不飙：\n\n' +
        '周一三五：无糖豆浆 + 水煮蛋 + 半根玉米\n' +
        '周二四：杂粮粥（小半碗）+ 凉拌黄瓜 + 鸡蛋\n' +
        '周末：全麦馒头半个 + 牛奶 + 一小把坚果\n\n' +
        '关键是要有蛋白质和膳食纤维，光吃粥血糖反而高得厉害。'),
      anonymous: true, alias: U.t('seed.alias.lighthouse', '温暖灯塔 55'),
      tags: [U.t('seed.tag.diabetes', '糖尿病'), U.t('seed.tag.diet', '饮食')], likes: 28
    }));

    put(PHR.db.posts, PHR.models.post.create({
      userId: '',
      board: 'psych',
      title: U.t('seed.post3.title', '刚确诊的时候很焦虑，大家都是怎么走出来的？'),
      content: U.t('seed.post3.content',
        '上个月体检查出血糖偏高，还没确诊就已经失眠好几天了。' +
        '想问问大家刚拿到结果的时候是什么心情，后来怎么调整过来的。'),
      anonymous: true, alias: U.t('seed.alias.stream', '勇敢溪流 63'),
      tags: [U.t('seed.tag.emotion', '情绪')], likes: 17
    }));

    put(PHR.db.posts, PHR.models.post.create({
      userId: '',
      board: 'caregiver',
      title: U.t('seed.post4.title', '照顾阿尔茨海默病的妈妈，记录一下这两年的经验'),
      content: U.t('seed.post4.content',
        '妈妈确诊两年了。最实用的几条：\n\n' +
        '1. 家里所有药分装到一周七格的药盒，否则一定会漏服或重复。\n' +
        '2. 把重要信息（姓名、住址、家属电话）写成卡片放在她口袋里。\n' +
        '3. 不要跟她争论对错，顺着她的记忆走反而更平静。\n' +
        '4. 家属也要休息，我每周请一天护工，不然自己先垮了。\n\n' +
        '照顾别人之前先照顾好自己。'),
      anonymous: true, alias: U.t('seed.alias.camellia', '笃定山茶 12'),
      tags: [U.t('seed.tag.caregiving', '照护'), U.t('seed.tag.experienceShort', '经验')], likes: 51
    }));

    put(PHR.db.posts, PHR.models.post.create({
      userId: '',
      board: 'general',
      title: U.t('seed.post5.title', '体检报告上一堆箭头，哪些真的需要紧张？'),
      content: U.t('seed.post5.content',
        '每次拿到体检报告都心跳加速。后来学会了一件事：先看结论页，再看具体指标，不要一个个自己吓自己。' +
        '有疑问直接挂对应科室的号去问医生，比自己搜靠谱得多。'),
      anonymous: true, alias: U.t('seed.alias.bird', '明亮候鸟 39'),
      tags: [U.t('seed.tag.checkup', '体检')], likes: 22
    }));
  }

  /* ================================================================== *
   * 七、偏好设置
   * ================================================================== */
  function seedPreferences() {
    put(PHR.db.prefs, {
      userId: seededUserId,
      theme: 'light',
      fontSize: 'normal',
      density: 'comfortable',
      reduceMotion: false,
      highContrast: false,
      locale: PHR.i18n ? PHR.i18n.current() : 'zh-CN',
      homeView: 'dashboard',
      alertThreshold: 'warning',
      weeklyReport: true
    });
  }

  /** 写入全部示例数据。由 run() 包在 withTextKeys() 里调用。 */
  function seedAll() {
    var ids = seedUsers();

    /* ---------- demo：完整病史故事（约 270 条记录） ---------- */
    seededUserId = ids.demo;
    seedProfile(ACCOUNTS[0]);
    seedRecords();
    seedVitals({});
    seedConsents();
    seedExtraConsents();
    seedAudits();
    seedCommunity();
    seedAssessments();
    seedPreferences();

    /* ---------- test：轻量数据 + 一条授权（验证账号隔离） ---------- */
    seededUserId = ids.test;
    seedProfile(ACCOUNTS[1]);
    seedLightRecords();
    seedVitals({ days: 45, height: 1.75, sysBase: 152, diaBase: 96,
                 glucoseBase: 6.4, weightBase: 84, improved: false });
    seedLightConsent();
    seedAssessments([{ scale: 'phq9', d: 25, answers: [1, 1, 1, 0, 1, 1, 0, 0, 0] }]);
    seedPreferences();

    /* ---------- empty：完全空白，用于验证空状态与录入引导 ---------- */
    seededUserId = ids.empty;
    seedPreferences();

    /* ---------- nomfa：极少数据 + 关闭多因素认证 ---------- */
    seededUserId = ids.nomfa;
    seedProfile(ACCOUNTS[3]);
    seedLightRecords(4);
    seedPreferences();

    return ids;
  }

  /**
   * 空跑一遍生成逻辑，只为建立 TEXT_KEYS（中文原文 → 词条键）。
   *
   * 用于"数据已经灌过、但灌的时候还没记词条键"的老库：models 层在没有
   * row.i18n 时可以按值反查词条，于是不必清库重灌也能双语。
   */
  function collectTextKeys() {
    collecting = true;
    try {
      withTextKeys(seedAll);
    } catch (e) {
      PHR.warn(PHR.t('seed.collectFail', '示例文本采集失败，界面可能无法完整切换语言'), e);
    } finally {
      collecting = false;
    }
  }

  /* ================================================================== *
   * 八、对外入口
   * ================================================================== */
  PHR.seed = {

    /** 主示例账号信息 */
    demo: DEMO,

    /**
     * 取某段种子文本对应的词条（{key, params}），没登记过则返回 null。
     * core/models.js 的 create() 用它给记录挂 row.i18n，
     * 之后显示层就能按当前语言解析这些文本。
     */
    textKeyOf: textKeyOf,

    /**
     * 登记一段带词条的文本（见 rememberText）。
     * 供**运行时**生成、但会落库的文本使用 —— 目前是 core/security.js 的
     * 异常告警文案：它们扫描时取词后写进 alerts 集合，切语言就冻结了。
     */
    rememberText: rememberText,

    /** 全部示例账号（供自检核对）—— 姓名随语言切换 */
    get accounts() { return ACCOUNTS.map(accountView); },

    /** 全部可用的医生授权码（供文档核对） */
    doctorCodes: function () {
      var extra = EXTRA_CONSENTS.map(function (c) {
        var k = EXTRA_CONSENT_I18N[c.code] || {};
        return {
          code: c.code,
          doctorName: k.doctorName ? U.t(k.doctorName, c.doctorName) : c.doctorName,
          purpose: k.purpose ? U.t(k.purpose, c.purpose) : c.purpose
        };
      });
      return [{
        code: 'K7M2-P9QX-3RTD',
        doctorName: U.t('seed.docName.liJianguo', '李建国'),
        purpose: U.t('seed.consent.active.purposeShort', '高血压随访复诊')
      }]
        .concat(extra)
        .concat([{
          code: 'T3ST-PAT2-0001',
          doctorName: U.t('seed.docName.zhangWei', '张伟'),
          purpose: U.t('seed.consent.light.purposeShort', '测试账号 test 的授权')
        }]);
    },

    /** 是否已经初始化过 */
    isSeeded: function () { return PHR.store.read('seeded', false) === true; },

    /**
     * 若数据库为空则写入示例数据。
     * @param {boolean} force 传 true 可强制重建（用于「恢复示例数据」功能）
     */
    run: function (force) {
      /* 数据已存在且不是强制重建 —— 不写库，只跑一遍**文本采集**。
         本轮改造之前灌进去的数据没有 row.i18n 词条键，读出来仍是中文。
         这里把种子生成逻辑空跑一遍，让 TEXT_KEYS（中文原文 → 词条键）
         建立起来，models 层就能按值反查词条 —— 不必清库、不动用户数据。 */
      if (!force && PHR.seed.isSeeded()) {
        collectTextKeys();
        return false;
      }

      // 语言在"播种这一刻"决定：先确保语言已探测，再取词，最后写库
      ensureLocale();

      PHR.log('开始写入示例数据…');
      // 清空既有数据，保证幂等
      Object.keys(PHR.db.schema).forEach(function (k) { PHR.db[k].clear(); });

      /* 整段灌数据都跑在 withTextKeys 里：文本一律以中文原文入库，
         同时登记词条键，供 models.create() 挂到记录上（见文件上方注释）。
         因此在英文界面下灌数据，库里存的仍是同一份中文原文。 */
      withTextKeys(seedAll);

      PHR.store.write('seeded', true);
      PHR.store.write('seededAt', Date.now());
      PHR.log('示例数据写入完成：账号 ' + PHR.db.users.count() +
              ' 个，记录 ' + PHR.db.records.count() +
              ' 条，授权 ' + PHR.db.consents.count() + ' 条');
      return true;
    }
  };

})(window.PHR);
