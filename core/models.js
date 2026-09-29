/**
 * ============================================================================
 * 文件：core/models.js
 * 层：核心基础设施层（数据模型）
 * 职责：定义全系统的数据集合清单（数据库表）、实体工厂与字段校验规则。
 *      - PHR.db.*          → 各集合的仓储对象（懒加载）
 *      - PHR.models.*      → 实体构造、归一化、校验
 *      - PHR.models.record → 健康记录的归一化与派生字段计算（全系统共用口径）
 * 依赖：core/namespace.js、core/utils.js、core/store.js、core/dict*.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* ================================================================== *
   * 一、数据集合清单（相当于关系型数据库的表定义）
   * ================================================================== */
  var COLLECTIONS = {
    users:      { idPrefix: 'U', event: 'auth:changed',   desc: '账号与认证信息（口令为加盐哈希）' },
    profiles:   { idPrefix: 'P', event: 'record:changed', desc: '个人基本信息（与账号 1:1）' },
    records:    { idPrefix: 'R', event: 'record:changed', desc: '全部健康记录（14 种类型统一存放）' },
    versions:   { idPrefix: 'V', event: null,             desc: '健康记录的历史版本，供回滚与追溯' },
    consents:   { idPrefix: 'C', event: 'consent:changed',desc: '医生授权（范围 / 有效期 / 状态）' },
    audits:     { idPrefix: 'L', event: 'audit:written',  desc: '审计日志：谁在何时访问了什么' },
    alerts:     { idPrefix: 'A', event: 'security:alert', desc: '异常访问与安全告警' },
    posts:      { idPrefix: 'M', event: null,             desc: '患者社群：主帖' },
    replies:    { idPrefix: 'N', event: null,             desc: '患者社群：回复' },
    prefs:      { idPrefix: 'F', event: null,             desc: '用户偏好设置' },
    syncLogs:   { idPrefix: 'S', event: null,             desc: '医院数据同步记录' },
    assessments:{ idPrefix: 'E', event: 'assessment:changed', desc: '心理测评记录（作答、得分与报告）' }
  };

  /* 懒加载仓储容器 */
  var repoCache = {};
  PHR.db = {};

  Object.keys(COLLECTIONS).forEach(function (key) {
    Object.defineProperty(PHR.db, key, {
      enumerable: true,
      get: function () {
        if (!repoCache[key]) {
          repoCache[key] = PHR.store.collection(key, COLLECTIONS[key]);
        }
        return repoCache[key];
      }
    });
  });

  /** 集合元信息（供"体验保障 → 数据完整性"与开发者说明书使用） */
  PHR.db.schema = COLLECTIONS;

  /* ================================================================== *
   * 二、通用校验工具
   * ================================================================== */

  /**
   * 解析字段的候选项：字段模式的 options 既可以是数组，也可以是函数
   * （函数形式用于与字典文件的加载顺序解耦）。
   */
  function resolveOptions(fd) {
    var o = fd && fd.options;
    if (typeof o === 'function') {
      try { o = o(); } catch (e) { o = []; }
    }
    return o || [];
  }

  /**
   * 取字段的展示标签（英文环境返回英文，未翻译时回退中文原文）。
   * 词条键由 core/dict-records.js 挂在 fields[].i18n 上。
   */
  function labelOf(fd) {
    return fd && fd.i18n ? PHR.t(fd.i18n, fd.label) : (fd ? fd.label : '');
  }

  /**
   * 依字段模式校验一份表单数据。
   * @param {Array} fields 字段模式数组（见 core/dict-records.js）
   * @param {object} values 待校验数据
   * @returns {{ok:boolean, errors:Object, list:Array}}
   */
  function validateBySchema(fields, values) {
    var errors = {};
    (fields || []).forEach(function (fd) {
      var v = values[fd.name];
      var label = labelOf(fd);
      if (fd.required && fd.type !== 'checkbox') {
        var empty = v === undefined || v === null || v === '' ||
                    (Array.isArray(v) && v.length === 0);
        if (empty) { errors[fd.name] = PHR.t('model.err.required', '请填写「{label}」', { label: label }); }
      }
      if (fd.type === 'number' && v !== '' && v !== undefined && v !== null) {
        var n = Number(v);
        if (isNaN(n)) { errors[fd.name] = PHR.t('model.err.notNumber', '「{label}」必须是数字', { label: label }); }
        else if (fd.min !== undefined && n < fd.min) {
          errors[fd.name] = PHR.t('model.err.min', '「{label}」不能小于 {min}', { label: label, min: fd.min });
        } else if (fd.max !== undefined && n > fd.max) {
          errors[fd.name] = PHR.t('model.err.max', '「{label}」不能大于 {max}', { label: label, max: fd.max });
        }
      }
      if (fd.type === 'date' || fd.type === 'datetime') {
        if (v && isNaN(U.parseDate(v))) {
          errors[fd.name] = PHR.t('model.err.dateFormat', '「{label}」日期格式不正确', { label: label });
        }
      }
    });
    return {
      ok: Object.keys(errors).length === 0,
      errors: errors,
      list: Object.keys(errors).map(function (k) { return errors[k]; })
    };
  }

  /* ================================================================== *
   * 三、实体模型
   * ================================================================== */
  var models = {};

  /* ------------------------------ 账号 ------------------------------ */
  models.user = {
    create: function (input) {
      var now = Date.now();
      var row = {
        id: input.id || null,
        username: String(input.username || '').trim(),
        displayName: input.displayName || input.username || '',
        phone: input.phone || '',
        email: input.email || '',
        role: input.role || 'patient',            // patient | doctor
        passwordHash: input.passwordHash || '',
        mfaEnabled: input.mfaEnabled !== false,
        mfaFactors: input.mfaFactors || ['sms'],  // 允许的第二因素
        faceTemplate: input.faceTemplate || null, // "人脸特征"占位
        status: input.status || 'active',         // active | locked | disabled
        failedCount: input.failedCount || 0,
        lockedUntil: input.lockedUntil || 0,
        lastLoginAt: input.lastLoginAt || 0,
        loginCount: input.loginCount || 0,
        createdAt: input.createdAt || now,
        updatedAt: now
      };
      /* 显示名（张小雨…）来自种子词条，登记后即可随语言切换 */
      var keys = applyTextKeys(row, ['displayName']);
      if (keys) { row.i18n = keys; }
      return row;
    },
    validate: function (values) {
      var errors = {};
      var name = String(values.username || '').trim();
      if (!name) { errors.username = PHR.t('model.user.err.username', '请输入账号'); }
      else if (!/^[A-Za-z0-9_@.]{3,32}$/.test(name)) {
        errors.username = PHR.t('model.user.err.usernameFormat', '账号需为 3~32 位字母、数字、下划线或邮箱');
      }
      if (!values.password) { errors.password = PHR.t('model.user.err.password', '请输入密码'); }
      else if (String(values.password).length < PHR.config.passwordMinLength) {
        errors.password = PHR.t('model.user.err.passwordLength', '密码至少 {n} 位', { n: PHR.config.passwordMinLength });
      }
      if (values.password && values.password2 !== undefined && values.password !== values.password2) {
        errors.password2 = PHR.t('model.user.err.passwordMismatch', '两次输入的密码不一致');
      }
      if (values.phone && !/^1[3-9]\d{9}$/.test(values.phone)) {
        errors.phone = PHR.t('model.err.phone', '手机号格式不正确');
      }
      return { ok: Object.keys(errors).length === 0, errors: errors,
               list: Object.keys(errors).map(function (k) { return errors[k]; }) };
    }
  };

  /* --------------------------- 个人基本信息 --------------------------- */
  models.profile = {
    create: function (input) {
      var now = Date.now();
      var row = {
        userId: input.userId || '',
        realName: input.realName || '',
        gender: input.gender || '',
        birthDate: input.birthDate || '',
        bloodType: input.bloodType || 'unknown',
        height: input.height === undefined ? null : input.height,   // cm
        weight: input.weight === undefined ? null : input.weight,   // kg
        waist: input.waist === undefined ? null : input.waist,      // cm
        maritalStatus: input.maritalStatus || '',
        idCard: input.idCard || '',
        phone: input.phone || '',
        email: input.email || '',
        emergencyContact: input.emergencyContact || '',
        emergencyPhone: input.emergencyPhone || '',
        address: input.address || '',
        occupation: input.occupation || '',
        bloodDonor: !!input.bloodDonor,
        organDonor: !!input.organDonor,
        smoking: input.smoking || 'never',      // never | former | current
        drinking: input.drinking || 'never',
        exercise: input.exercise || 'sometimes',// never | sometimes | often | daily
        updatedAt: now
      };
      /* 姓名、紧急联系人、地址、职业是种子词条 */
      var keys = applyTextKeys(row, ['realName', 'emergencyContact', 'address', 'occupation']);
      if (keys) { row.i18n = keys; }
      return row;
    },
    validate: function (v) {
      var errors = {};
      if (!String(v.realName || '').trim()) { errors.realName = PHR.t('model.profile.err.realName', '请填写姓名'); }
      if (!v.gender) { errors.gender = PHR.t('model.profile.err.gender', '请选择性别'); }
      if (!v.birthDate) { errors.birthDate = PHR.t('model.profile.err.birthDate', '请选择出生日期'); }
      else if (U.parseDate(v.birthDate) > Date.now()) {
        errors.birthDate = PHR.t('model.profile.err.birthDateFuture', '出生日期不能晚于今天');
      }
      if (v.height !== null && v.height !== '' && (v.height < 50 || v.height > 250)) {
        errors.height = PHR.t('model.profile.err.height', '身高应在 50~250 cm 之间');
      }
      if (v.weight !== null && v.weight !== '' && (v.weight < 10 || v.weight > 300)) {
        errors.weight = PHR.t('model.profile.err.weight', '体重应在 10~300 kg 之间');
      }
      if (v.phone && !/^1[3-9]\d{9}$/.test(v.phone)) {
        errors.phone = PHR.t('model.err.phone', '手机号格式不正确');
      }
      return { ok: Object.keys(errors).length === 0, errors: errors,
               list: Object.keys(errors).map(function (k) { return errors[k]; }) };
    }
  };

  /* ---------------------------- 健康记录 ---------------------------- */
  /**
   * 解析 row.i18n 里登记的一条文本来源。
   * 值可以是词条键字符串，也可以是 { key, params }（带插值参数的词条）。
   *
   * 参数值本身可能也是种子文本（如 '授权给 {name} 主任医师' 的 name 是人名），
   * 所以要**递归**解析 —— 否则英文句子里会嵌着中文人名。
   */
  function entryText(entry, fallback, depth) {
    if (!entry) { return fallback; }
    if (typeof entry === 'string') { return PHR.t(entry, fallback); }
    var params = entry.params;
    if (params && (depth || 0) < 3) {
      params = Object.assign({}, params);
      Object.keys(params).forEach(function (k) {
        var v = params[k];
        if (typeof v !== 'string' || !v) { return; }
        var e2 = (PHR.seed && PHR.seed.textKeyOf) ? PHR.seed.textKeyOf(v) : null;
        if (e2) { params[k] = entryText(e2, v, (depth || 0) + 1); }
      });
    }
    return PHR.t(entry.key, fallback, params || undefined);
  }

  /**
   * 解析"一个字段值"的词条来源。
   *
   * 优先用行上登记的键（row.i18n，本轮改造后灌的数据都有）；
   * 没有键时按**值**反查 core/seed.js 的 TEXT_KEYS ——
   * 改造之前灌的老数据靠这一步也能双语，不必清库重灌。
   * 用户自己输入的内容两边都查不到，返回 null，原样显示。
   */
  function entryFor(registered, value) {
    if (registered) { return registered; }
    if (typeof value !== 'string' || !value) { return null; }
    var textKeyOf = PHR.seed && PHR.seed.textKeyOf;
    return textKeyOf ? textKeyOf(value) : null;
  }

  /**
   * 为一行的文本字段登记词条键（**会就地规范化**）。
   *
   * 种子数据的长文本一律写成 U.t(词条键, '中文原文')。灌数据期间
   * core/seed.js 的 withTextKeys() 记下了「中文原文 → 词条键」，
   * 这里把命中的字段值换成中文原文（语言中立），并返回 { 字段: 键 } 映射
   * 供挂到 row.i18n 上；没命中任何一项时返回 null。
   *
   * @param {object} row    待处理的行（会被就地修改）
   * @param {string[]} [fields] 只处理这些字段；省略则遍历全部
   */
  function applyTextKeys(row, fields) {
    var textKeyOf = PHR.seed && PHR.seed.textKeyOf;
    if (!textKeyOf || !row) { return null; }
    var map = null;
    (fields || Object.keys(row)).forEach(function (k) {
      var v = row[k];
      if (Array.isArray(v)) {
        var arrKeys = null;
        row[k] = v.map(function (x, i) {
          var e = textKeyOf(x);
          if (!e) { return x; }
          arrKeys = arrKeys || [];
          arrKeys[i] = e.key;
          return e.source;
        });
        if (arrKeys) { map = map || {}; map[k] = arrKeys; }
        return;
      }
      var ent = textKeyOf(v);
      if (!ent) { return; }
      row[k] = ent.source;                    // 规范回中文原文
      map = map || {};
      map[k] = ent.params ? { key: ent.key, params: ent.params } : ent.key;
    });
    return map;
  }

  /**
   * 按当前语言解析一行的文本字段，返回副本（原行不动）。
   * 带词条键的行走键，老数据走按值反查；两者都没有就原样返回。
   */
  function localizeRow(row, fields) {
    if (!row) { return row; }
    var reg = row.i18n || {};
    /* 不给 fields 时遍历**全部**属性 —— 老数据没有 row.i18n，
       只有全部走一遍才能靠按值反查把种子文本翻出来。 */
    var names = fields || Object.keys(row);
    if (!names || !names.length) { return row; }
    var out = null;
    function ensure() { if (!out) { out = Object.assign({}, row); } return out; }

    names.forEach(function (k) {
      if (k === 'i18n' || k === 'data') { return; }
      var v = row[k];
      if (Array.isArray(v)) {
        var keys = Array.isArray(reg[k]) ? reg[k] : null;
        var changed = false;
        var arr = v.map(function (x, i) {
          var e = entryFor(keys ? keys[i] : null, x);
          if (!e) { return x; }
          changed = true;
          return entryText(e, x);
        });
        if (changed) { ensure()[k] = arr; }
        return;
      }
      if (typeof v !== 'string' || !v) { return; }
      var e = entryFor(reg[k], v);
      if (!e) { return; }
      ensure()[k] = entryText(e, v);
    });

    /* 记录行：文本在 row.data 里，另外 title/summary 是派生值，都要一起解析 */
    if (row.data && typeof row.data === 'object') {
      var d = models.record.resolvedData(row);
      if (Object.keys(row.data).some(function (k) { return d[k] !== row.data[k]; })) {
        ensure().data = d;
      }
      var s = models.record.summaryOf(row);
      if (s && s !== row.summary) { ensure().summary = s; }
    }
    return out || row;
  }

  models.record = {

    /**
     * 把一份"用户填写的原始字段"归一化成系统内的标准记录结构。
     *
     * 派生字段说明：
     *   title     列表 / 时间线 / 搜索结果里显示的主标题
     *   date      记录的"发生日期"（时间戳），排序与时间筛选依据
     *   scope     该记录归属的授权范围（见 core/dict.js → consentScope）
     *   diseaseCat 疾病分类（用户填写优先，否则用类型默认值）
     *   severity  严重程度（部分类型有）
     *   searchText 供倒排索引使用的可搜索文本
     */
    create: function (typeKey, values, opt) {
      opt = opt || {};
      var t = D.recordType(typeKey);
      values = values || {};

      // 1) 只保留该类型模式中声明过的字段，避免脏数据写库
      var clean = {};
      t.fields.forEach(function (fd) {
        var v = values[fd.name];
        if (v === undefined) { return; }
        if (fd.type === 'number' && v !== '' && v !== null) { v = Number(v); }
        if (fd.type === 'tags' && typeof v === 'string') {
          v = v.split(/[,，\s]+/).filter(Boolean);
        }
        clean[fd.name] = v;
      });

      // 2) 标题。兜底用中文原名（t.nameZh），保证入库数据是语言中立的 ——
      //    显示时由 displayTitle() 按当前语言重取类型名。
      var titleRaw = clean[t.titleField];
      if (Array.isArray(titleRaw)) { titleRaw = titleRaw.join('、'); }
      var title = titleRaw ? String(titleRaw) : (t.nameZh || t.name);

      // 3) 发生日期
      var dateRaw = clean[t.dateField];
      var date = dateRaw ? U.parseDate(dateRaw) : Date.now();
      if (isNaN(date)) { date = Date.now(); }

      // 4) 摘要
      var summary = models.record.buildSummary(t, clean);

      /* 5) 文本来源
         种子数据的长文本是 U.t(词条键, '中文原文') 写成的。applyTextKeys()
         会把命中的字段规范回中文原文，并返回 { 字段: 词条键 } 映射 ——
         挂到 row.i18n 上，显示时由 fieldText() 按当前语言解析。
         用户自己输入的文本不在表里，不会带键，原样显示。 */
      var i18nMap = applyTextKeys(clean);

      var row = {
        userId: opt.userId || '',
        type: typeKey,
        title: U.truncate(title, 60),
        date: date,
        dateText: U.fmtDate(date),
        summary: summary,
        scope: t.scope,
        diseaseCat: clean.diseaseCat || t.diseaseCat || 'other',
        severity: clean.severity || null,
        abnormal: !!clean.abnormal,
        data: clean,
        source: opt.source || 'manual',      // manual | sync | import
        sourceName: opt.sourceName || '',
        tags: clean.tags || [],
        version: 1,
        searchText: ''
      };
      if (i18nMap) { row.i18n = i18nMap; }
      row.searchText = models.record.buildSearchText(row, t);
      return row;
    },

    /** 生成一句话摘要，用于列表与时间线 */
    buildSummary: function (t, clean) {
      var parts = [];
      t.fields.forEach(function (fd) {
        if (fd.type === 'hidden') { return; }
        var v = clean[fd.name];
        if (v === undefined || v === null || v === '') { return; }
        var opts = resolveOptions(fd);
        if (Array.isArray(v)) {
          if (!v.length) { return; }
          v = v.map(function (x) { return D.nameOf(opts, x) || x; }).join(PHR.t('ui.listSep', '、'));
        } else if (fd.type === 'select') {
          v = D.nameOf(opts, v) || v;
        } else if (fd.type === 'checkbox') {
          if (v !== true) { return; }
          v = PHR.t('ui.yes', '是');
        } else if (fd.type === 'date' || fd.type === 'datetime') {
          v = U.fmtDate(U.parseDate(v));
        }
        if (fd.unit && typeof v === 'number') { v = v + ' ' + fd.unit; }
        parts.push(fd.label + PHR.t('ui.kvSep', '：') + v);
      });
      return U.truncate(parts.join(' · '), 160);
    },

    /** 把一条记录的全部字段值拼成可搜索文本 */
    buildSearchText: function (row, t) {
      t = t || D.recordType(row.type);
      var chunks = [row.title, models.record.displayTitle(row), t.name,
                    D.nameOf(D.diseaseCategory, row.diseaseCat)];
      /* 文本值同时收录「入库原文」与「当前语言的解析结果」——
         这样英文界面下搜 "Fasting blood glucose"、中文界面下搜「空腹血糖」
         都能命中同一条记录。 */
      var resolved = models.record.resolvedData(row);
      [row.data || {}, resolved].forEach(function (src) {
        Object.keys(src).forEach(function (k) {
          var v = src[k];
          if (v === null || v === undefined || v === '') { return; }
          if (Array.isArray(v)) {
            v.forEach(function (x) {
              chunks.push(String(D.nameOf(D.diseaseCategory, x) || D.nameOf(D.allergenType, x) || x));
            });
          } else if (typeof v === 'boolean') {
            if (v) { chunks.push(D.fieldLabel(row.type, k)); }
          } else {
            chunks.push(String(D.nameOf(D.diseaseCategory, v) || v));
          }
        });
      });
      return chunks.filter(Boolean).join(' ').toLowerCase();
    },

    /**
     * 取记录某个字段的显示值。
     *
     * 种子数据的文本是 U.t(词条键, '中文原文') 写成的，入库时把词条键挂在
     * row.i18n 上（见 create()）。这里按**当前语言**解析，所以切换语言后
     * 「空腹血糖」会变成「Fasting blood glucose」。用户自己输入的文本没有
     * 词条键，原样返回 —— 那是数据，不该被翻译。
     */
    fieldText: function (row, name) {
      var v = (row && row.data) ? row.data[name] : undefined;
      var reg = (row && row.i18n) ? row.i18n[name] : null;
      if (Array.isArray(v)) {
        var keys = Array.isArray(reg) ? reg : null;
        return v.map(function (x, i) {
          return entryText(entryFor(keys ? keys[i] : null, x), x);
        });
      }
      if (typeof v !== 'string' || !v) { return v; }
      return entryText(entryFor(reg, v), v);
    },

    /** 把 row.data 里的文本值全部按当前语言解析，得到一个可渲染的副本 */
    resolvedData: function (row) {
      if (!row) { return {}; }
      var data = row.data || {};
      var out = {};
      Object.keys(data).forEach(function (k) { out[k] = models.record.fieldText(row, k); });
      return out;
    },

    /**
     * 一句话摘要（列表 / 时间线 / 首页最近记录都用它）。
     *
     * 摘要**必须现算，不能读 row.summary**：入库的那份是灌数据时按"当时的语言"
     * 拼好的字符串，之后切换语言不会变 —— 英文界面下会出现
     * 「指标类型：收缩压（高压） · 测量时间：…」这种整条中文的摘要。
     *
     * 现算的两个输入都是语言相关的：
     *   · 字段标签 fd.label 是 i18n 访问器 → 随语言变；
     *   · 字段值走 resolvedData() → 种子文本按词条解析。
     * 老数据（没有词条键）会退化成"英文标签 + 入库原文"，重灌示例数据后即全英文。
     */
    summaryOf: function (row) {
      if (!row) { return ''; }
      return models.record.buildSummary(D.recordType(row.type), models.record.resolvedData(row));
    },

    /**
     * 记录的显示标题。
     *
     * 标题有两种来源，要分别处理：
     *   ① 记录自己的字段值（titleField，如检验的 itemName、便签的 title）
     *      —— 种子数据带回词条键，走 fieldText() 按当前语言解析；
     *         用户自己输入的没有键，原样显示。
     *   ② 该类型没有标题字段值时，create() 会用**创建那一刻的语言**下的
     *      类型名兜底并存进 row.title。存进去就是数据了，之后切换语言不会变
     *      —— 英文界面下体征记录曾一直显示中文的「体征指标」。这里把这种
     *      兜底认出来（等于中文原名或当前译文）并现场重取类型名。
     */
    displayTitle: function (row) {
      if (!row) { return ''; }
      var t = D.recordType(row.type);
      var resolved = models.record.fieldText(row, t.titleField);
      if (typeof resolved === 'string' && resolved) { return resolved; }
      var s = row.title;
      if (!s || s === t.nameZh || s === t.name) { return t.name; }
      return s;
    },

    /** 校验一份记录表单 */
    validate: function (typeKey, values) {
      var t = D.recordType(typeKey);
      var r = validateBySchema(t.fields, values || {});
      // 结束日期不得早于开始日期
      if (values && values.startDate && values.endDate &&
          U.parseDate(values.endDate) < U.parseDate(values.startDate)) {
        r.errors.endDate = PHR.t('model.record.err.endBeforeStart', '结束日期不能早于开始日期');
        r.ok = false;
        r.list = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
      }
      if (values && values.admitDate && values.dischargeDate &&
          U.parseDate(values.dischargeDate) < U.parseDate(values.admitDate)) {
        r.errors.dischargeDate = PHR.t('model.record.err.dischargeBeforeAdmit', '出院日期不能早于入院日期');
        r.ok = false;
        r.list = Object.keys(r.errors).map(function (k) { return r.errors[k]; });
      }
      return r;
    }
  };

  /* ---------------------------- 授权 ---------------------------- */
  models.consent = {
    create: function (input) {
      var now = Date.now();
      var days = input.days || 7;
      var row = {
        userId: input.userId || '',
        code: input.code || PHR.crypto.consentCode(),
        doctorName: input.doctorName || '',
        doctorTitle: input.doctorTitle || '',
        hospital: input.hospital || '',
        department: input.department || '',
        licenseNo: input.licenseNo || '',
        purpose: input.purpose || '',
        scopes: input.scopes || [],              // 授权范围 key 数组
        recordIds: input.recordIds || [],        // 指定记录（空 = 范围内全部）
        startAt: input.startAt || now,
        expireAt: input.expireAt || U.addDays(now, days),
        status: input.status || 'active',        // active | revoked | expired
        accessCount: 0,
        lastAccessAt: 0,
        revokedAt: 0,
        revokeReason: '',
        note: input.note || ''
      };
      /* 医生姓名、职称、授权用途都是种子词条 */
      var keys = applyTextKeys(row, ['doctorName', 'doctorTitle', 'purpose', 'revokeReason', 'note']);
      if (keys) { row.i18n = keys; }
      return row;
    },
    /** 运行时状态：把过期但尚未标记的授权识别出来 */
    effectiveStatus: function (c) {
      if (c.status === 'revoked') { return 'revoked'; }
      if (Date.now() > c.expireAt) { return 'expired'; }
      if (Date.now() < c.startAt) { return 'pending'; }
      return 'active';
    }
  };

  /* ---------------------------- 审计日志 ---------------------------- */
  models.audit = {
    create: function (input) {
      var row = {
        userId: input.userId || '',
        actor: input.actor || '本人',            // 操作者显示名（本人 / 医生姓名 / 系统）
        actorType: input.actorType || 'user',     // user | doctor | system
        action: input.action || 'unknown',
        targetType: input.targetType || '',
        targetId: input.targetId || '',
        targetName: input.targetName || '',
        result: input.result || 'success',        // success | fail | denied
        detail: input.detail || '',
        ip: input.ip || '',
        device: input.device || '',
        at: input.at || Date.now()
      };
      /* 操作者、目标名、详情描述都是种子词条 */
      var keys = applyTextKeys(row, ['actor', 'targetName', 'detail']);
      if (keys) { row.i18n = keys; }
      return row;
    }
  };

  /* ---------------------------- 社群 ---------------------------- */
  models.post = {
    create: function (input) {
      var row = {
        userId: input.userId || '',
        board: input.board || 'general',
        title: input.title || '',
        content: input.content || '',
        anonymous: input.anonymous !== false,
        alias: input.alias || models.post.randomAlias(),
        tags: input.tags || [],
        likes: input.likes || 0,
        replyCount: 0,
        status: input.status || 'normal',        // normal | hidden | removed
        pinned: !!input.pinned
      };
      var keys = applyTextKeys(row, ['title', 'content', 'alias', 'tags']);
      if (keys) { row.i18n = keys; }
      return row;
    },
    randomAlias: function () {
      var a = ['温暖', '安静', '勇敢', '从容', '明亮', '坚韧', '悠然', '向阳', '踏实', '笃定'];
      var b = ['小鹿', '海豚', '松树', '月亮', '灯塔', '候鸟', '溪流', '向日葵', '蒲公英', '山茶'];
      return U.pick(a) + U.pick(b) + U.intBetween(1, 99);
    }
  };

  models.reply = {
    create: function (input) {
      var row = {
        postId: input.postId || '',
        userId: input.userId || '',
        content: input.content || '',
        anonymous: input.anonymous !== false,
        alias: input.alias || models.post.randomAlias(),
        likes: input.likes || 0,
        status: input.status || 'normal',
        isAuthor: !!input.isAuthor
      };
      var keys = applyTextKeys(row, ['content', 'alias']);
      if (keys) { row.i18n = keys; }
      return row;
    }
  };

  /* ================================================================== *
   * 四、挂载
   * ================================================================== */
  models.validateBySchema = validateBySchema;
  /** 按当前语言解析一行的文本字段（见 localizeRow） */
  models.localize = localizeRow;

  PHR.models = models;

})(window.PHR);
