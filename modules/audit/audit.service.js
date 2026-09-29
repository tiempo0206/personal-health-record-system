/**
 * ============================================================================
 * 文件：modules/audit/audit.service.js
 * 层：业务模块层（访问追踪 —— 模块 6）
 * 职责：审计日志的唯一写入口与基础读取接口。
 *      "记录谁在什么时候、从哪里、访问了什么、结果如何"是本系统的
 *      核心承诺之一，因此所有模块的敏感动作都必须调用 PHR.audit.log()。
 * 依赖：core/models.js、core/store.js、core/event-bus.js、core/security.js、core/dict.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  var mod = PHR.registerModule('audit', {
    title: '访问追踪',
    description: '记录并审计每一次对健康档案的访问与修改，发现异常行为',
    icon: '👁️',
    order: 6
  });

  /* 模块标题要随语言切换而变：registerModule 会把 title 拷贝成普通字符串，
     而脚本加载时语言尚未探测，因此注册后用 getter 覆盖，使面包屑即时跟随。 */
  Object.defineProperty(mod, 'title', {
    get: function () { return PHR.t('module.audit.title', '访问追踪'); },
    enumerable: true, configurable: true
  });
  Object.defineProperty(mod, 'description', {
    get: function () { return PHR.t('module.audit.desc', '记录并审计每一次对健康档案的访问与修改，发现异常行为'); },
    enumerable: true, configurable: true
  });

  /* ================================================================== *
   * 一、环境信息（IP / 设备）
   *     纯前端环境拿不到真实内网 IP，这里用"会话级伪标识"模拟，
   *     真实产品应由服务端在写日志时补齐。
   * ================================================================== */
  var envCache = null;

  function env() {
    if (envCache) { return envCache; }
    var ua = navigator.userAgent || '';
    var os = /Windows/.test(ua) ? 'Windows'
           : /Mac OS X/.test(ua) ? 'macOS'
           : /Android/.test(ua) ? 'Android'
           : /iPhone|iPad/.test(ua) ? 'iOS'
           : /Linux/.test(ua) ? 'Linux' : PHR.t('audit.env.unknownOs', '未知系统');
    var browser = /Edg\//.test(ua) ? 'Edge'
                : /Chrome\//.test(ua) ? 'Chrome'
                : /Firefox\//.test(ua) ? 'Firefox'
                : /Safari\//.test(ua) ? 'Safari' : PHR.t('audit.env.unknownBrowser', '未知浏览器');

    var ip = PHR.store.session.read('pseudo_ip', null);
    if (!ip) {
      ip = [223, U.intBetween(1, 254), U.intBetween(1, 254), U.intBetween(2, 253)].join('.');
      PHR.store.session.write('pseudo_ip', ip);
    }

    envCache = { ip: ip, device: os + ' · ' + browser, ua: ua };
    return envCache;
  }

  /* ================================================================== *
   * 二、写日志
   * ================================================================== */
  /**
   * 写入一条审计日志。
   * @param {object} input {
   *   action,                      必需，见 PHR.dict.auditAction
   *   targetType, targetId, targetName,
   *   detail, result:'success'|'fail'|'denied',
   *   actor, actorType:'user'|'doctor'|'system',
   *   userId, at, ip, device
   * }
   * @returns {object} 写入的日志条目
   */
  function log(input) {
    input = input || {};
    var session = PHR.session || null;
    var user = session && session.currentUser ? session.currentUser() : null;
    var doctor = session && session.currentDoctor ? session.currentDoctor() : null;
    var e = env();

    var actor = input.actor
      || (doctor ? doctor.name : null)
      || (user ? (user.displayName || user.username) : PHR.t('audit.actor.guest', '访客'));

    var row = PHR.models.audit.create({
      userId: input.userId !== undefined ? input.userId : (user ? user.id : ''),
      actor: actor,
      actorType: input.actorType || (doctor ? 'doctor' : (user ? 'user' : 'system')),
      action: input.action || 'unknown',
      targetType: input.targetType || '',
      targetId: input.targetId || '',
      targetName: input.targetName || '',
      result: input.result || 'success',
      detail: PHR.security.sanitizeText(input.detail || '', 400),
      ip: input.ip || e.ip,
      device: input.device || e.device,
      at: input.at || Date.now()
    });

    try {
      PHR.db.audits.insert(row);
    } catch (err) {
      // 写日志失败绝不能影响业务动作本身
      PHR.warn(PHR.t('audit.warn.writeFail', '审计日志写入失败'), err);
      return row;
    }

    PHR.bus.emit('audit:written', { entry: row });
    PHR.log('audit', row.action, row.targetName || row.targetId || '');

    // 高危动作实时触发一次异常扫描，让"越权访问"能立刻出现在告警里
    if (row.result === 'denied' || row.action === 'auth.locked' || row.action === 'ux.import') {
      setTimeout(function () { try { scan(); } catch (e) { /* 忽略 */ } }, 0);
    }
    return row;
  }

  /** 记录一次"查看页面"级别的访问（由 ui/shell.js 自动调用） */
  function logView(view) {
    if (!view || view.name === 'audit') { return null; }   // 避免看审计页时自我递归
    // view.title 在 registerView 时被求值为静态字符串，切换语言后不会自动刷新，
    // 因此审计日志里按当前语言再查一次 view.<name>.title。
    var viewTitle = PHR.t('view.' + view.name + '.title', view.title || view.name);
    return log({
      action: 'record.view',
      targetType: 'view',
      targetId: view.name,
      targetName: viewTitle,
      detail: PHR.t('audit.logViewDetail', '浏览了「{module} → {view}」', {
        module: PHR.modules[view.module] ? PHR.modules[view.module].title : PHR.t('audit.systemModule', '系统'),
        view: viewTitle
      })
    });
  }

  /* ================================================================== *
   * 三、基础读取
   * ================================================================== */
  /** 全部日志（时间倒序） */
  function all() {
    return U.sortBy(PHR.db.audits.all(), 'at', true).map(function (e) {
      /* 操作者 / 目标名 / 详情描述都是种子文本，按当前语言解析 */
      return PHR.models.localize(e, ['actor', 'targetName', 'detail']);
    });
  }

  /** 当前用户的日志 */
  function mine() {
    var user = PHR.session && PHR.session.currentUser ? PHR.session.currentUser() : null;
    var uid = user ? user.id : '';
    return all().filter(function (e) { return !uid || e.userId === uid || e.actorType === 'system'; });
  }

  /** 取动作的展示名（走字典层词条，随语言切换） */
  function actionName(key) { return D.nameOf(D.auditAction, key); }

  /** 取动作所属分组（返回字典里的分组原值，供筛选比较；展示请用 actionGroupLabel） */
  function actionGroup(key) {
    var hit = (D.auditAction || []).filter(function (a) { return a.key === key; })[0];
    return hit ? hit.group : '其他';
  }

  /* 动作分组的中文名 -> 词条键。分组名是字典里的数据（core/dict.js，含 actionGroup
     找不到动作时的兜底 '其他'），同时被用作筛选条件的取值，所以筛选逻辑始终拿中文
     原值比较，只有**展示**才经过 actionGroupLabel。 */
  var GROUP_KEYS = {
    '账号安全': 'audit.group.auth',
    '档案中心': 'audit.group.records',
    '智能搜索': 'audit.group.search',
    '健康洞察': 'audit.group.insight',
    '授权管理': 'audit.group.consent',
    '患者社群': 'audit.group.community',
    '心理测评': 'audit.group.assessment',
    '体验保障': 'audit.group.ux',
    '安全治理': 'audit.group.security',
    '其他': 'audit.group.other'
  };

  /** 取动作分组的展示名（随语言切换，对未登记的分组原样返回） */
  function actionGroupLabel(group) {
    var key = GROUP_KEYS[group];
    return key ? PHR.t(key, group) : group;
  }

  /** 取动作的风险等级 */
  function actionRisk(key) {
    var hit = (D.auditAction || []).filter(function (a) { return a.key === key; })[0];
    return hit ? hit.risk : 'info';
  }

  /* ================================================================== *
   * 四、清理
   * ================================================================== */
  /** 按保留期清理过期日志 */
  function purgeExpired() {
    var limit = Date.now() - PHR.config.auditRetentionDays * 86400000;
    var n = PHR.db.audits.removeWhere(function (e) { return e.at < limit; });
    if (n) { PHR.log(PHR.t('audit.purged', '清理过期审计日志 {n} 条', { n: n })); }
    return n;
  }

  /* ================================================================== *
   * 五、环境信息对外暴露
   * ================================================================== */
  function envInfo() { return U.clone(env()); }

  /* scan 的具体实现在 modules/audit/security-anomaly.js 中，这里做延迟引用 */
  function scan() {
    return PHR.audit.scanAlerts ? PHR.audit.scanAlerts() : [];
  }

  PHR.audit = {
    log: log,
    logView: logView,
    all: all,
    mine: mine,
    actionName: actionName,
    actionGroup: actionGroup,
    actionGroupLabel: actionGroupLabel,
    actionRisk: actionRisk,
    purgeExpired: purgeExpired,
    envInfo: envInfo
  };

})(window.PHR);
