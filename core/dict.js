/**
 * ============================================================================
 * 文件：core/dict.js
 * 层：核心基础设施层（数据字典 · 第一部分：通用枚举）
 * 职责：全系统共享的枚举常量与分类字典的唯一来源（Single Source of Truth）。
 *      本文件只放"数据"，不放逻辑，避免各模块各自硬编码。
 * 依赖：core/namespace.js
 * 说明：本文件最先初始化 PHR.dict，随后 core/dict-records.js 与
 *      core/dict-metrics.js 会向 PHR.dict 挂载 recordTypes / metrics。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var D = PHR.dict = {};

  /* ------------------------------------------------------------------ *
   * 通用工具：把 [{key,name,...}] 形式的字典转成 key -> item 的索引
   * ------------------------------------------------------------------ */
  D.index = function (list) {
    return (list || []).reduce(function (acc, it) { acc[it.key] = it; return acc; }, {});
  };

  /**
   * 取字典项的名称，找不到时回退为原 key。
   *
   * 这里是**全站字典取名的唯一入口**（列表、图表、徽章、筛选器、表单下拉
   * 都经过它），因此在切语言时只需在这里查一次词条，
   * 就能让 13 张字典表同时变成英文 —— 这是国际化里杠杆最大的一处。
   * 每个字典数组用 __i18n 标记自己属于哪一组（见文件末尾的 tagDict）。
   */
  D.nameOf = function (list, key) {
    var hit = (list || []).filter(function (x) { return x.key === key; })[0];
    if (!hit) { return key || '—'; }
    var group = list && list.__i18n;
    if (group && PHR.i18n) { return PHR.i18n.dictName(group, key, hit.name); }
    return hit.name;
  };

  /** 给一个字典数组打上组名标记，供 nameOf 查词条 */
  D.tagDict = function (list, group) {
    if (list) { list.__i18n = group; }
    return list;
  };

  /* ================================================================== *
   * 1. 人口学信息
   * ================================================================== */

  D.gender = [
    { key: 'male',   name: '男' },
    { key: 'female', name: '女' },
    { key: 'other',  name: '其他 / 不愿透露' }
  ];

  D.bloodType = [
    { key: 'A',    name: 'A 型' },
    { key: 'B',    name: 'B 型' },
    { key: 'O',    name: 'O 型' },
    { key: 'AB',   name: 'AB 型' },
    { key: 'Rh-',  name: 'Rh 阴性' },
    { key: 'unknown', name: '未知' }
  ];

  D.maritalStatus = [
    { key: 'single',  name: '未婚' },
    { key: 'married', name: '已婚' },
    { key: 'divorced', name: '离异' },
    { key: 'widowed', name: '丧偶' }
  ];

  /* ================================================================== *
   * 2. 家族关系（家族病史用）
   * ================================================================== */

  D.familyRelation = [
    { key: 'father',      name: '父亲' },
    { key: 'mother',      name: '母亲' },
    { key: 'brother',     name: '兄弟' },
    { key: 'sister',      name: '姐妹' },
    { key: 'son',         name: '子女' },
    { key: 'grandfather_p', name: '祖父' },
    { key: 'grandmother_p', name: '祖母' },
    { key: 'grandfather_m', name: '外祖父' },
    { key: 'grandmother_m', name: '外祖母' },
    { key: 'uncle',       name: '叔伯 / 舅舅' },
    { key: 'aunt',        name: '姑姨' },
    { key: 'cousin',      name: '堂 / 表亲' },
    { key: 'other',       name: '其他亲属' }
  ];

  /* ================================================================== *
   * 3. 疾病分类（搜索筛选 / 统计 / 风险评估共用）
   * ================================================================== */

  D.diseaseCategory = [
    { key: 'cardio',      name: '心血管系统',  icon: '❤️' },
    { key: 'endocrine',   name: '内分泌与代谢', icon: '🧪' },
    { key: 'respiratory', name: '呼吸系统',    icon: '🫁' },
    { key: 'digestive',   name: '消化系统',    icon: '🍽️' },
    { key: 'neuro',       name: '神经系统',    icon: '🧠' },
    { key: 'urinary',     name: '泌尿系统',    icon: '💧' },
    { key: 'musculo',     name: '骨骼与肌肉',  icon: '🦴' },
    { key: 'immune',      name: '免疫与风湿',  icon: '🛡️' },
    { key: 'oncology',    name: '肿瘤相关',    icon: '🎗️' },
    { key: 'infectious',  name: '感染性疾病',  icon: '🦠' },
    { key: 'mental',      name: '精神与心理',  icon: '🧘' },
    { key: 'eye',         name: '眼科',        icon: '👁️' },
    { key: 'skin',        name: '皮肤科',      icon: '🧴' },
    { key: 'ent',         name: '耳鼻喉',      icon: '👂' },
    { key: 'obgyn',       name: '妇科 / 产科',  icon: '🌸' },
    { key: 'pediatric',   name: '儿科相关',    icon: '🧒' },
    { key: 'other',       name: '其他',        icon: '📌' }
  ];

  /* ================================================================== *
   * 4. 严重程度 / 优先级（记录、告警、风险共用）
   * ================================================================== */

  D.severity = [
    { key: 'info',     name: '提示', tone: 'info',    weight: 0 },
    { key: 'mild',     name: '轻度', tone: 'ok',      weight: 1 },
    { key: 'moderate', name: '中度', tone: 'warn',    weight: 2 },
    { key: 'severe',   name: '重度', tone: 'danger',  weight: 3 },
    { key: 'critical', name: '危重', tone: 'danger',  weight: 4 }
  ];

  /* ================================================================== *
   * 5. 过敏相关
   * ================================================================== */

  D.allergenType = [
    { key: 'drug',     name: '药物过敏' },
    { key: 'food',     name: '食物过敏' },
    { key: 'pollen',   name: '花粉 / 尘螨' },
    { key: 'contact',  name: '接触性过敏' },
    { key: 'insect',   name: '昆虫叮咬' },
    { key: 'other',    name: '其他' }
  ];

  D.allergyReaction = [
    { key: 'rash',      name: '皮疹 / 荨麻疹' },
    { key: 'itch',      name: '瘙痒' },
    { key: 'sneeze',    name: '打喷嚏 / 流涕' },
    { key: 'asthma',    name: '哮喘发作' },
    { key: 'vomit',     name: '恶心呕吐' },
    { key: 'diarrhea',  name: '腹泻' },
    { key: 'swelling',  name: '面部 / 喉头水肿' },
    { key: 'shock',     name: '过敏性休克' },
    { key: 'other',     name: '其他' }
  ];

  /* ================================================================== *
   * 6. 用药相关
   * ================================================================== */

  D.medFrequency = [
    { key: 'qd',   name: '每日 1 次' },
    { key: 'bid',  name: '每日 2 次' },
    { key: 'tid',  name: '每日 3 次' },
    { key: 'qid',  name: '每日 4 次' },
    { key: 'qod',  name: '隔日 1 次' },
    { key: 'qw',   name: '每周 1 次' },
    { key: 'prn',  name: '按需服用' },
    { key: 'st',   name: '一次性' }
  ];

  D.medRoute = [
    { key: 'po',   name: '口服' },
    { key: 'iv',   name: '静脉注射' },
    { key: 'im',   name: '肌肉注射' },
    { key: 'sc',   name: '皮下注射' },
    { key: 'top',  name: '外用' },
    { key: 'inh',  name: '吸入' },
    { key: 'other', name: '其他' }
  ];

  /* ================================================================== *
   * 7. 医疗机构与科室（同步与录入共用）
   * ================================================================== */

  D.department = [
    { key: 'general',   name: '全科 / 内科' },
    { key: 'cardio',    name: '心血管内科' },
    { key: 'endocrine', name: '内分泌科' },
    { key: 'resp',      name: '呼吸内科' },
    { key: 'gastro',    name: '消化内科' },
    { key: 'neuro',     name: '神经内科' },
    { key: 'surgery',   name: '外科' },
    { key: 'ortho',     name: '骨科' },
    { key: 'derm',      name: '皮肤科' },
    { key: 'eye',       name: '眼科' },
    { key: 'ent',       name: '耳鼻喉科' },
    { key: 'obgyn',     name: '妇产科' },
    { key: 'peds',      name: '儿科' },
    { key: 'emerg',     name: '急诊科' },
    { key: 'other',     name: '其他科室' }
  ];

  /** 可"同步"的医疗机构清单 */
  D.hospital = [
    { key: 'hosp_rm',  name: '市第一人民医院',  level: '三级甲等' },
    { key: 'hosp_cd',  name: '市中心医院',      level: '三级甲等' },
    { key: 'hosp_jk',  name: '健康社区卫生服务中心', level: '一级' },
    { key: 'hosp_zl',  name: '市肿瘤专科医院',  level: '三级专科' },
    { key: 'hosp_ey',  name: '市儿童医院',      level: '三级专科' }
  ];

  /* ================================================================== *
   * 8. 审计动作字典（审计日志模块使用）
   * ================================================================== */

  D.auditAction = [
    { key: 'auth.register',    name: '账号注册',      group: '账号安全', risk: 'info' },
    { key: 'auth.login',       name: '登录成功',      group: '账号安全', risk: 'info' },
    { key: 'auth.login_fail',  name: '登录失败',      group: '账号安全', risk: 'warn' },
    { key: 'auth.logout',      name: '退出登录',      group: '账号安全', risk: 'info' },
    { key: 'auth.mfa_pass',    name: '多因素认证通过', group: '账号安全', risk: 'info' },
    { key: 'auth.mfa_fail',    name: '多因素认证失败', group: '账号安全', risk: 'warn' },
    { key: 'auth.locked',      name: '账号被锁定',    group: '账号安全', risk: 'danger' },
    { key: 'auth.password',    name: '修改密码',      group: '账号安全', risk: 'warn' },
    { key: 'profile.update',   name: '更新基本信息',  group: '档案中心', risk: 'info' },
    { key: 'record.create',    name: '新增健康记录',  group: '档案中心', risk: 'info' },
    { key: 'record.update',    name: '修改健康记录',  group: '档案中心', risk: 'info' },
    { key: 'record.delete',    name: '删除健康记录',  group: '档案中心', risk: 'warn' },
    { key: 'record.view',      name: '查看健康记录',  group: '档案中心', risk: 'info' },
    { key: 'record.rollback',  name: '回滚记录版本',  group: '档案中心', risk: 'warn' },
    { key: 'record.import',    name: '导入健康记录',  group: '档案中心', risk: 'info' },
    { key: 'sync.pull',        name: '同步医院数据',  group: '档案中心', risk: 'info' },
    { key: 'search.run',       name: '执行检索',      group: '智能搜索', risk: 'info' },
    { key: 'insight.view',     name: '查看健康洞察',  group: '健康洞察', risk: 'info' },
    { key: 'insight.alert',    name: '指标异常告警',  group: '健康洞察', risk: 'warn' },
    { key: 'consent.grant',    name: '授予医生权限',  group: '授权管理', risk: 'warn' },
    { key: 'consent.revoke',   name: '撤销医生权限',  group: '授权管理', risk: 'warn' },
    { key: 'consent.expired',  name: '授权自动过期',  group: '授权管理', risk: 'info' },
    { key: 'consent.access',   name: '医生访问档案',  group: '授权管理', risk: 'warn' },
    { key: 'consent.denied',   name: '越权访问被拒绝', group: '授权管理', risk: 'danger' },
    { key: 'consent.verify',   name: '校验授权码',    group: '授权管理', risk: 'info' },
    { key: 'community.post',   name: '发布社群内容',  group: '患者社群', risk: 'info' },
    { key: 'community.reply',  name: '回复社群内容',  group: '患者社群', risk: 'info' },
    { key: 'community.remove', name: '删除社群内容',  group: '患者社群', risk: 'warn' },
    { key: 'assessment.submit', name: '提交心理测评', group: '心理测评', risk: 'info' },
    { key: 'assessment.view',   name: '查看测评报告', group: '心理测评', risk: 'info' },
    { key: 'assessment.grant',  name: '授权心理报告', group: '心理测评', risk: 'warn' },
    { key: 'ux.export',        name: '导出健康数据',  group: '体验保障', risk: 'warn' },
    { key: 'ux.import',        name: '导入健康数据',  group: '体验保障', risk: 'danger' },
    { key: 'ux.integrity',     name: '完整性自检',    group: '体验保障', risk: 'info' },
    { key: 'ux.settings',      name: '修改偏好设置',  group: '体验保障', risk: 'info' },
    { key: 'security.alert',   name: '安全告警',      group: '安全治理', risk: 'danger' }
  ];

  /* ================================================================== *
   * 9. 授权范围字典
   *    说明：modules/consent/scope.js 会在此基础上补充行为逻辑，
   *          但"可被授权的数据类别"清单以本表为准，保证用户界面、
   *          权限校验与医生视图三处使用同一份定义。
   * ================================================================== */

  D.consentScope = [
    { key: 'basic',       name: '个人基本信息',   desc: '姓名、性别、出生日期、血型、身高体重' },
    { key: 'history',     name: '既往病史',       desc: '已确诊疾病、手术史、住院史' },
    { key: 'family',      name: '家族病史',       desc: '直系与旁系亲属的疾病情况' },
    { key: 'medication',  name: '用药记录',       desc: '当前与历史用药、处方' },
    { key: 'allergy',     name: '过敏史',         desc: '过敏原、反应类型与严重程度' },
    { key: 'lab',         name: '检验检查报告',   desc: '化验单、影像与体检报告' },
    { key: 'vital',       name: '体征指标',       desc: '血压、血糖、心率、体重等随时间变化的数值' },
    { key: 'visit',       name: '就诊记录',       desc: '门诊、急诊与复诊记录' },
    { key: 'insight',     name: '健康洞察结论',   desc: '趋势分析、风险评估与系统建议' },
    { key: 'psych',       name: '心理测评报告',   desc: '抑郁、焦虑、睡眠、压力等心理量表的得分、分级与建议' }
  ];

  /* ================================================================== *
   * 10. 会话 / 认证方式
   * ================================================================== */

  D.authFactor = [
    { key: 'password', name: '密码验证',   icon: '🔑', desc: '第一因素：账号密码' },
    { key: 'sms',      name: '短信验证码', icon: '📱', desc: '第二因素：绑定手机号接收 6 位验证码' },
    { key: 'face',     name: '人脸识别',   icon: '🙂', desc: '第二因素：本地模拟人脸比对' }
  ];

  /* ================================================================== *
   * 11. 社群板块
   * ================================================================== */

  D.communityBoard = [
    { key: 'general',    name: '综合交流',     icon: '💬', desc: '任何与健康管理有关的话题' },
    { key: 'chronic',    name: '慢病互助',     icon: '🫀', desc: '高血压、糖尿病等长期管理经验' },
    { key: 'nutrition',  name: '饮食与运动',   icon: '🥗', desc: '生活方式调整的真实分享' },
    { key: 'psych',      name: '心理支持',     icon: '🌱', desc: '情绪与压力，互相打气' },
    { key: 'caregiver',  name: '家属照护',     icon: '🤝', desc: '照顾家人的经验与困惑' }
  ];

  /* ================================================================== *
   * 12. 国际化：给每张字典表打上组名标记
   *     打完标记后，D.nameOf() 就会去查对应语种的词条 ——
   *     全站的字典显示随语言切换一起变化，无需改动任何调用点。
   * ================================================================== */
  ['gender', 'bloodType', 'maritalStatus', 'familyRelation', 'diseaseCategory',
   'severity', 'allergenType', 'allergyReaction', 'medFrequency', 'medRoute',
   'department', 'hospital', 'auditAction', 'consentScope', 'authFactor',
   'communityBoard'].forEach(function (g) { D.tagDict(D[g], g); });

  /* ------------------------------------------------------------------ *
   * 13. 国际化：把字典项上的 desc 换成读取词条的访问器
   *     这三张表的每一项都带一句说明（授权范围、第二因素、社群板块），
   *     词条键约定为 dict.<组名>.<key>.desc，
   *     改访问器后：授权勾选列表、社群板块介绍等处一并变成英文。
   * ------------------------------------------------------------------ */
  ['consentScope', 'authFactor', 'communityBoard'].forEach(function (g) {
    (D[g] || []).forEach(function (item) {
      var zhDesc = item.desc;
      if (zhDesc === undefined) { return; }
      Object.defineProperty(item, 'desc', {
        enumerable: true, configurable: true,
        get: function () { return PHR.t('dict.' + g + '.' + item.key + '.desc', zhDesc); }
      });
    });
  });

})(window.PHR);
