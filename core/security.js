/**
 * ============================================================================
 * 文件：core/security.js
 * 层：核心基础设施层（安全治理层 —— 策略与规则中心）
 * 职责：把散落在需求文档里的安全要求沉淀成可执行的策略对象：
 *      ① 口令策略      passwordPolicy()
 *      ② 会话策略      sessionPolicy
 *      ③ 角色权限矩阵  permissions / can()
 *      ④ 数据脱敏规则  masker
 *      ⑤ 异常访问检测  anomalyRules / detectAnomalies()
 *      ⑥ 用户输入净化  sanitizeText()
 *      本层"贯穿所有环节"：任何模块做安全判断时都应调用这里的方法，
 *      而不是各自硬编码阈值，从而保证审计口径一致。
 * 依赖：core/namespace.js、core/utils.js、core/crypto.js、core/dict.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* ================================================================== *
   * 一、口令策略
   * ================================================================== */
  function passwordPolicy(pwd) {
    pwd = String(pwd || '');
    var issues = [];
    var min = PHR.config.passwordMinLength;

    if (pwd.length < min) { issues.push(PHR.t('pwd.issue.minLength', '长度至少 {n} 位', { n: min })); }
    if (!/[A-Za-z]/.test(pwd)) { issues.push(PHR.t('pwd.issue.letter', '需包含字母')); }
    if (!/\d/.test(pwd)) { issues.push(PHR.t('pwd.issue.digit', '需包含数字')); }
    if (/^(.)\1+$/.test(pwd)) { issues.push(PHR.t('pwd.issue.repeat', '不能是重复的单一字符')); }
    if (/^(?:123|abc|qwe|password|admin)/i.test(pwd)) { issues.push(PHR.t('pwd.issue.common', '不能使用常见弱口令开头')); }
    if (/^\d+$/.test(pwd)) { issues.push(PHR.t('pwd.issue.allDigits', '不能是纯数字')); }

    var s = PHR.crypto.strength(pwd);
    return {
      ok: issues.length === 0,
      issues: issues,
      strength: s,
      // 未通过策略但强度足够时仍然给出"较弱"的提示语
      hint: issues.length
        ? issues.join(PHR.t('ui.semiSep', '；'))
        : PHR.t('pwd.strengthPrefix', '密码强度：') + s.level
    };
  }

  /* ================================================================== *
   * 二、会话策略
   * ================================================================== */
  /**
   * 登录状态能保持多久。
   *
   * 这里**以前是"空闲 30 分钟自动退出"**：每次交互顺延 30 分钟，超时就登出。
   * 现在改成绝对到期：登录时把到期时间定死为 7 天
   * （PHR.config.sessionRememberDays），期间关掉浏览器再打开都不用重输口令。
   *
   * 为什么去掉空闲超时：它和"7 天免登录"互相抵消 —— 晚上关掉电脑，第二天
   * 早上打开早就超过 30 分钟，照样要重登，那 7 天免登录就形同虚设。
   * 要防止别人趁你离开时动你的电脑，靠的是 30 秒屏保（ui/shell.js，只隐藏
   * 界面，不解锁任何东西）加上操作系统自己的锁屏，而不是这个计时器 ——
   * 一个纯前端应用里的"自动登出"本来也拦不住真想看的人，只会烦到本人。
   */
  var sessionPolicy = {
    /** 登录状态的保持时长（毫秒） */
    trustLimit: function () { return PHR.config.sessionRememberDays * 86400000; },

    /**
     * 判断一个会话是否已过期。
     *
     * 改造前签发的老会话只有 lastActiveAt、没有 expiresAt，这里一律当作过期，
     * 强制重新登录一次 —— 否则一个语义已经变了的老令牌会被继续当作有效身份。
     */
    isExpired: function (session) {
      if (!session || !session.userId) { return true; }
      if (!session.expiresAt) { return true; }
      return Date.now() > session.expiresAt;
    },

    /** 距离到期还有多少秒（用于「账号与安全」页展示） */
    remainingSeconds: function (session) {
      if (!session || !session.expiresAt) { return 0; }
      return Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    }
  };

  /* ================================================================== *
   * 三、角色权限矩阵
   *     patient = 档案所有者本人；doctor = 通过授权码进入的医生视图。
   *     当前只有这两种角色，但矩阵的写法便于将来扩展管理员。
   * ================================================================== */
  var PERMISSIONS = {
    patient: [
      'profile.read', 'profile.write',
      'record.read', 'record.write', 'record.delete',
      'search.run', 'insight.read',
      'consent.read', 'consent.grant', 'consent.revoke',
      'audit.read', 'audit.export',
      'community.read', 'community.write',
      'ux.export', 'ux.import', 'ux.settings'
    ],
    doctor: [
      'record.read.consented',   // 只能读取授权范围内的记录
      'consent.verify',
      'audit.write.access'
    ]
  };

  /** 判断某角色是否拥有某权限 */
  function can(role, permission) {
    var list = PERMISSIONS[role] || [];
    if (list.indexOf(permission) >= 0) { return true; }
    // 支持通配：权限 'record.read' 可被 'record.read.*' 覆盖
    return list.some(function (p) {
      return p.slice(-2) === '.*' && permission.indexOf(p.slice(0, -1)) === 0;
    });
  }

  /* ================================================================== *
   * 四、脱敏规则
   *    different viewer 身份看到不同的脱敏粒度：
   *      self   本人  → 完整
   *      doctor 已授权医生 → 身份证与紧急联系人电话脱敏
   *      public 陌生人 → 姓名、电话、身份证全部脱敏
   * ================================================================== */
  var masker = {
    /** 按查看者身份对一份个人基本信息做脱敏 */
    profile: function (profile, viewer) {
      var p = U.clone(profile) || {};
      if (viewer === 'self') { return p; }

      if (viewer === 'doctor') {
        p.idCard = p.idCard ? PHR.crypto.maskIdCard(p.idCard) : '';
        p.emergencyPhone = p.emergencyPhone ? PHR.crypto.maskPhone(p.emergencyPhone) : '';
        return p;
      }

      // public / 其它
      p.realName = PHR.crypto.maskName(p.realName);
      p.idCard = '';
      p.phone = p.phone ? PHR.crypto.maskPhone(p.phone) : '';
      p.email = p.email ? PHR.crypto.maskEmail(p.email) : '';
      p.emergencyContact = p.emergencyContact ? PHR.crypto.maskName(p.emergencyContact) : '';
      p.emergencyPhone = '';
      p.address = p.address ? U.truncate(p.address, 3) + '***' : '';
      return p;
    },

    /** 按字段名脱敏任意文本（用于审计日志展示） */
    field: function (fieldName, value) {
      if (value === null || value === undefined) { return value; }
      switch (fieldName) {
        case 'idCard': return PHR.crypto.maskIdCard(value);
        case 'phone':
        case 'emergencyPhone': return PHR.crypto.maskPhone(value);
        case 'realName':
        case 'emergencyContact': return PHR.crypto.maskName(value);
        case 'email': return PHR.crypto.maskEmail(value);
        default: return value;
      }
    }
  };

  /* ================================================================== *
   * 五、异常访问检测
   *     规则函数签名：(entries, ctx) => 告警对象数组或 null
   *     entries = 审计日志数组（已按时间倒序或正序均可）
   * ================================================================== */
  var MINUTE = 60 * 1000;
  var HOUR = 60 * MINUTE;

  var anomalyRules = [

    {
      key: 'brute_force',
      name: '疑似暴力破解',
      tone: 'danger',
      desc: '同一账号在短时间内连续多次登录失败',
      detect: function (entries, ctx) {
        var fails = entries.filter(function (e) {
          return e.action === 'auth.login_fail' && (!ctx.userId || e.userId === ctx.userId);
        });
        var windowed = fails.filter(function (e) { return Date.now() - e.at < 10 * MINUTE; });
        if (windowed.length >= 3) {
          return {
            count: windowed.length,
            detail: say('sec.rule.brute_force.detail',
              '最近 10 分钟内出现 {n} 次登录失败，账号可能正在被尝试破解。', { n: windowed.length }),
            suggestion: say('sec.rule.brute_force.suggestion',
              '建议立即修改密码，并确认短信验证码与人脸识别已开启。')
          };
        }
        return null;
      }
    },

    {
      key: 'account_locked',
      name: '账号被锁定',
      tone: 'danger',
      desc: '触发登录失败阈值导致账号临时锁定',
      detect: function (entries, ctx) {
        var hit = entries.filter(function (e) {
          return e.action === 'auth.locked' && (!ctx.userId || e.userId === ctx.userId);
        })[0];
        if (hit && Date.now() - hit.at < 24 * HOUR) {
          return {
            count: 1,
            detail: say('sec.rule.account_locked.detail',
              '账号于 {at} 因连续登录失败被锁定。', { at: U.fmtDateTime(hit.at) }),
            suggestion: say('sec.rule.account_locked.suggestion',
              '如果不是本人操作，请修改密码并检查绑定的手机号。')
          };
        }
        return null;
      }
    },

    {
      key: 'off_hours_access',
      name: '非惯常时段访问',
      tone: 'warn',
      desc: '在凌晨 0 点至 6 点之间访问健康档案',
      detect: function (entries, ctx) {
        var hits = entries.filter(function (e) {
          if (ctx.userId && e.userId !== ctx.userId) { return false; }
          if (e.actorType !== 'doctor') { return false; }
          var h = new Date(e.at).getHours();
          return h >= 0 && h < 6 && Date.now() - e.at < 30 * 86400000;
        });
        if (hits.length) {
          return {
            count: hits.length,
            detail: say('sec.rule.off_hours_access.detail',
              '检测到 {n} 次凌晨时段的档案访问，最近一次为 {at}。',
              { n: hits.length, at: U.fmtDateTime(hits[0].at) }),
            suggestion: say('sec.rule.off_hours_access.suggestion',
              '如非急诊需要，可考虑撤销对应授权并联系该医生确认。')
          };
        }
        return null;
      }
    },

    {
      key: 'bulk_read',
      name: '短时批量查阅',
      tone: 'warn',
      desc: '单次授权在极短时间内查阅了大量记录',
      detect: function (entries, ctx) {
        var reads = entries.filter(function (e) {
          return e.action === 'consent.access' &&
                 (!ctx.userId || e.userId === ctx.userId) &&
                 Date.now() - e.at < 24 * HOUR;
        });
        var byConsent = U.groupBy(reads, 'targetId');
        var worst = null;
        Object.keys(byConsent).forEach(function (cid) {
          var list = byConsent[cid];
          if (list.length >= 15 && (!worst || list.length > worst.length)) { worst = list; }
        });
        if (worst) {
          return {
            count: worst.length,
            detail: say('sec.rule.bulk_read.detail',
              '授权 {name} 在 24 小时内被查阅 {n} 次。',
              { name: worst[0].targetName, n: worst.length }),
            suggestion: say('sec.rule.bulk_read.suggestion', '若已超出就诊需要，请及时撤销该授权。')
          };
        }
        return null;
      }
    },

    {
      key: 'denied_access',
      name: '越权访问被拒绝',
      tone: 'danger',
      desc: '医生尝试访问未被授权的数据范围',
      detect: function (entries, ctx) {
        var hits = entries.filter(function (e) {
          return e.action === 'consent.denied' && (!ctx.userId || e.userId === ctx.userId);
        });
        if (hits.length) {
          return {
            count: hits.length,
            detail: say('sec.rule.denied_access.detail',
              '共有 {n} 次访问请求因超出授权范围被系统拒绝，最近一次为 {at}。',
              { n: hits.length, at: U.fmtDateTime(hits[0].at) }),
            suggestion: say('sec.rule.denied_access.suggestion',
              '系统已自动阻断，请留意该医生的后续访问行为。')
          };
        }
        return null;
      }
    },

    {
      key: 'export_activity',
      name: '数据导出行为',
      tone: 'warn',
      desc: '发生健康数据导出，需确认是否为本人操作',
      detect: function (entries, ctx) {
        var hits = entries.filter(function (e) {
          return e.action === 'ux.export' && (!ctx.userId || e.userId === ctx.userId) &&
                 Date.now() - e.at < 7 * 86400000;
        });
        if (hits.length) {
          return {
            count: hits.length,
            detail: say('sec.rule.export_activity.detail',
              '最近 7 天内导出过 {n} 次完整健康数据。', { n: hits.length }),
            suggestion: say('sec.rule.export_activity.suggestion',
              '导出文件包含敏感信息，请妥善保管，不要通过不安全的渠道转发。')
          };
        }
        return null;
      }
    }
  ];

  /**
   * 取词并**登记词条来源**。
   *
   * 异常规则的文案会被 security-anomaly.js 写进 alerts 集合落库，
   * 存进去就是"那一刻的语言"，之后切换语言不会变 —— 用户在英文界面下
   * 会看到「越权访问被拒绝」这种整条中文的告警。
   *
   * 走 say() 之后，这段文本进入了 core/seed.js 的反查表，models 层读
   * alerts 集合时会按值反查到词条、用当前语言重取。行为与 PHR.t 完全一致。
   */
  function say(key, zh, params) {
    if (PHR.seed && PHR.seed.rememberText) { PHR.seed.rememberText(key, zh, params); }
    return PHR.t(key, zh, params);
  }

  /* ------------------------------------------------------------------ *
   * 国际化：规则名与规则说明改成读取词条的访问器
   * ------------------------------------------------------------------
   * 这里**不能**直接写 PHR.t(...) 求值 —— 本文件在 i18n 探测语言之前
   * 就加载完了，那一刻取词只能拿到中文兜底，规则名会被永久"焊死"成中文。
   * 改成访问器后，每次读取（detectAnomalies 组装告警时）都按当前语言取词。
   * 词条键：sec.rule.<规则key>.name / sec.rule.<规则key>.desc
   * ------------------------------------------------------------------ */
  anomalyRules.forEach(function (rule) {
    ['name', 'desc'].forEach(function (prop) {
      var zh = rule[prop];
      Object.defineProperty(rule, prop, {
        enumerable: true, configurable: true,
        get: function () { return say('sec.rule.' + rule.key + '.' + prop, zh); }
      });
    });
  });

  /**
   * 扫描审计日志，产出异常访问告警列表。
   * @param {Array} entries 审计日志
   * @param {object} ctx    { userId }
   */
  function detectAnomalies(entries, ctx) {
    ctx = ctx || {};
    var sorted = U.sortBy(entries || [], 'at', true);   // 时间倒序
    var alerts = [];
    anomalyRules.forEach(function (rule) {
      var hit = null;
      try { hit = rule.detect(sorted, ctx); } catch (e) { PHR.warn(PHR.t('security.warn.anomalyRuleFail', '异常检测规则失败：{rule}', { rule: rule.key }), e); }
      if (hit) {
        alerts.push({
          rule: rule.key,
          name: rule.name,
          tone: rule.tone,
          desc: rule.desc,
          count: hit.count,
          detail: hit.detail,
          suggestion: hit.suggestion,
          severity: rule.tone === 'danger' ? 'high' : 'medium'
        });
      }
    });
    return alerts;
  }

  /* ================================================================== *
   * 六、范围化可见性判定（records 与 assessments 共用同一段逻辑）
   * ------------------------------------------------------------------
   * 这是"医生只能看到被授权内容"这条承诺的**唯一判定实现**。
   *
   * 为什么抽成公共函数：如果每个数据集合各写一份 canView，安全逻辑就有了
   * 两份实现，审计时就必须记得"还有另一份"。抽到这里之后，审计口径变成：
   *   只需审计本函数 + 每个集合各自的 scopeOf()
   *
   * 判定三条线，全部满足才可见：
   *   ① 归属：记录必须属于该授权对应的那位患者
   *   ② 范围：该记录所属的范围必须在授权的 scopes 白名单里
   *   ③ 收窄：若授权额外指定了 recordIds，则只放行这些记录
   * ================================================================== */
  /**
   * @param {object} row       数据行（需含 userId、id）
   * @param {object} consent   医生授权；传 null 表示"本人查看"
   * @param {string} scopeKey  该行所属的范围 key
   * @returns {boolean}
   */
  function canViewScoped(row, consent, scopeKey) {
    if (!row) { return false; }

    if (!consent) {
      // 本人路径：必须是当前登录用户自己的数据。
      // 没有登录身份（未登录 / 医生访客）一律拒绝，绝不返回 true。
      var uid = PHR.session && PHR.session.userId ? PHR.session.userId() : '';
      return !!uid && row.userId === uid;
    }

    if (row.userId !== consent.userId) { return false; }
    if (!scopeKey) { return false; }
    if ((consent.scopes || []).indexOf(scopeKey) < 0) { return false; }
    if (consent.recordIds && consent.recordIds.length) {
      return consent.recordIds.indexOf(row.id) >= 0;
    }
    return true;
  }

  /**
   * 按范围列出对某授权可见的数据行。
   * @param {Array} rows       候选数据行
   * @param {object} consent   医生授权
   * @param {function} scopeOf 取某行范围 key 的函数
   * @param {string} scopeKey  只取某一个范围（可选）
   */
  function filterByConsent(rows, consent, scopeOf, scopeKey) {
    if (!consent) { return []; }
    var allowed = scopeKey ? [scopeKey] : (consent.scopes || []);

    return (rows || []).filter(function (r) {
      if (r.userId !== consent.userId) { return false; }
      var s = scopeOf(r);
      if (allowed.indexOf(s) < 0) { return false; }
      if (consent.recordIds && consent.recordIds.length && !scopeKey) {
        return consent.recordIds.indexOf(r.id) >= 0;
      }
      return true;
    });
  }

  /* ================================================================== *
   * 七、输入净化
   *     本项目所有渲染都经过 escapeHtml，此处再提供一层"内容级"净化，
   *     用于社群正文等允许较长文本的字段。
   * ================================================================== */
  function sanitizeText(text, maxLen) {
    var s = String(text === null || text === undefined ? '' : text);
    s = s.replace(/<\/?[^>]*>/g, '');           // 去掉全部标签
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");   // 去掉控制字符
    s = s.trim();
    return maxLen ? U.truncate(s, maxLen) : s;
  }

  /* ================================================================== *
   * 七、挂载
   * ================================================================== */
  PHR.security = {
    passwordPolicy: passwordPolicy,
    sessionPolicy: sessionPolicy,
    permissions: PERMISSIONS,
    can: can,
    masker: masker,
    anomalyRules: anomalyRules,
    detectAnomalies: detectAnomalies,
    sanitizeText: sanitizeText,
    canViewScoped: canViewScoped,
    filterByConsent: filterByConsent,

    /** 安全概览：给"安全设置"页面用的体检结论 */
    posture: function (user) {
      var items = [];
      items.push({
        name: PHR.t('sec.item.hash.name', '口令加密存储'),
        ok: true,
        detail: PHR.t('sec.item.hash.detail', '口令使用加盐 SHA-256 存储，数据库中不存在明文口令。')
      });
      items.push({
        name: PHR.t('sec.item.mfa.name', '多因素认证'),
        ok: !!(user && user.mfaEnabled),
        detail: user && user.mfaEnabled
          ? PHR.t('sec.item.mfa.on', '已开启，登录时需通过「{factors}」二次确认。', {
              factors: (user.mfaFactors || []).map(function (k) {
                return D.nameOf(D.authFactor, k);
              }).join(' + ')
            })
          : PHR.t('sec.item.mfa.off', '未开启，建议开启短信验证码或人脸识别。')
      });
      items.push({
        name: PHR.t('sec.item.remember.name', '登录保持'),
        ok: true,
        detail: PHR.t('sec.item.remember.detail',
          '登录状态保持 {n} 天，期间重新打开浏览器无需再输口令。可在「偏好与安全」中调整。',
          { n: PHR.config.sessionRememberDays })
      });
      items.push({
        name: PHR.t('sec.item.audit.name', '访问留痕'),
        ok: true,
        detail: PHR.t('sec.item.audit.detail', '全部档案读写都会写入审计日志，可在「访问追踪」中查阅。')
      });
      items.push({
        name: PHR.t('sec.item.storage.name', '存储'),
        ok: PHR.store.persistent,
        detail: PHR.store.persistent
          ? PHR.t('sec.item.storage.on', '本地存储可用，数据保存在当前设备，不会对外共享。')
          : PHR.t('sec.item.storage.off', '当前浏览器禁用了本地存储，数据仅保存在内存中，关闭页面即丢失。')
      });
      var passed = items.filter(function (i) { return i.ok; }).length;
      return {
        items: items,
        passed: passed,
        total: items.length,
        score: Math.round(passed / items.length * 100)
      };
    }
  };

})(window.PHR);
