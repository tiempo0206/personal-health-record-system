/**
 * ============================================================================
 * 文件：modules/insight/advice.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：预防建议引擎。把数据转成"今天可以做什么"。
 *      · generate()      按 就医/监测/用药/饮食/运动/生活方式 六组给出的建议
 *      · dailyPlan()     今日健康计划（3~5 条，可勾选，勾选状态当日有效）
 *      · weeklyReport()  本周小结（亮点 / 需要关注 / 下周建议）
 *
 *      ⚠️ 设计原则：**每一条建议都挂在某个具体的数据条件上**。
 *         没有触发条件就不输出 —— 宁可少说，也不输出"多喝水、多运动"这类
 *         与用户数据无关的空话。条件判断全部写在 makeRules() 里，一眼可查。
 * 依赖：core/dict*.js、core/store.js、modules/records/{vital,profile,history,medication}.service.js、
 *      modules/insight/{metrics,anomaly,risk}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var M = PHR.insight.metrics;

  var TODO_PREFIX = 'insight_todo_';

  function V() { return PHR.records.vital; }
  function H() { return PHR.records.history; }
  function MED() { return PHR.records.medication; }

  function sum(key, days) { return V().summary(key, { days: days || 30 }); }
  function days(key, n) { return V().summary(key, { days: n || 7 }); }

  /* ================================================================== *
   * 一、预防建议（generate）
   * ================================================================== */
  /* 六组的分组名。
     ⚠️ group 字段同时是规则表的**匹配键**（index[r.group]），必须保持中文不动；
     展示用的英文放在 label 里，由 groupName() 在渲染时取词。 */
  var GROUPS = [
    { group: '就医', icon: '🏥', items: [] },
    { group: '监测', icon: '📊', items: [] },
    { group: '用药', icon: '💊', items: [] },
    { group: '饮食', icon: '🥗', items: [] },
    { group: '运动', icon: '🏃', items: [] },
    { group: '生活方式', icon: '🌙', items: [] }
  ];

  var GROUP_KEY = {
    '就医': 'visit', '监测': 'monitor', '用药': 'med', '饮食': 'diet',
    '运动': 'exercise', '生活方式': 'lifestyle'
  };

  /** 分组名 / 计划条目的类别名 → 当前语言的展示文本 */
  function groupName(g) {
    return PHR.t('insight.advice.group.' + (GROUP_KEY[g] || 'visit'), g);
  }

  /** 今日计划里每一条的 kind 名（'作息' 归到睡眠组） */
  var KIND_KEY = {
    '就医': 'visit', '监测': 'monitor', '用药': 'med', '饮食': 'diet',
    '运动': 'exercise', '作息': 'sleep', '生活方式': 'lifestyle'
  };
  function kindName(k) {
    return PHR.t('insight.advice.kind.' + (KIND_KEY[k] || 'monitor'), k);
  }

  function listSep() { return PHR.t('insight.punct.listSep', '、'); }
  function clauseSep() { return PHR.t('insight.punct.clauseSep', '；'); }

  /**
   * 全部规则：每条规则自带 when 条件与目标分组。
   * 规则表写在一处，便于评审"系统到底在什么情况下会说什么话"。
   */
  function makeRules() {
    return [
      /* ---------------- 就医：只在确有需要时出现，优先级最高 ---------------- */
      { group: '就医', when: function (d) { return d.critical.length > 0; }, item: function (d) {
          var a = d.critical[0];
          return {
            title: PHR.t('insight.advice.critical.title',
              '尽快就医：「{metric}」出现明显异常', { metric: a.metricName }),
            detail: PHR.t('insight.advice.critical.detail',
              '{title}。{detail} 请携带最近的记录到相应科室就诊，不要自行调整药物。',
              { title: a.title, detail: a.detail }),
            priority: '高', tone: 'danger', metricKey: a.metricKey, evidence: a.title
          };
        } },
      { group: '就医', when: function (d) { return d.due.length > 0; }, item: function (d) {
          var f = d.due[0];
          return {
            title: PHR.t('insight.advice.overdue.title',
              '预约复诊：{disease} 随访已逾期 {days} 天',
              { disease: f.diseaseName, days: Math.abs(f.daysLeft) }),
            detail: PHR.t('insight.advice.overdue.detail',
              '{advice}。建议带上上次复查结果与最近的体征记录，医生才能判断方案是否仍然有效。',
              { advice: f.advice }),
            priority: '高', tone: 'warn', metricKey: null,
            evidence: PHR.t('insight.advice.overdue.evidence', '共 {n} 项随访已逾期',
              { n: d.due.length })
          };
        } },
      { group: '就医', when: function (d) { return d.dangerInter.length > 0; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.drugReview.title',
              '请医生或药师核对一次正在服用的全部药物'),
            detail: d.dangerInter[0].text,
            priority: '高', tone: 'danger', metricKey: null,
            evidence: PHR.t('insight.advice.drugReview.evidence',
              '检测到 {n} 组需要高度警惕的相互作用', { n: d.dangerInter.length })
          };
        } },

      /* ---------------- 监测：什么时候测、测几次 ---------------- */
      { group: '监测', when: function (d) { return d.bp.count >= 3 && d.bp.avg >= 130; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.bpMonitor.title',
              '家庭血压监测：连续 7 天，每天早晚各一次'),
            detail: PHR.t('insight.advice.bpMonitor.detail',
              '起床后 1 小时内、排尿后、服药前、安静坐 5 分钟后测量；晚上睡前再测一次。' +
              '记录时注明测量时间，7 天后取平均值交给医生。'),
            priority: '高', tone: 'warn', metricKey: 'systolic',
            evidence: PHR.t('insight.advice.bpMonitor.evidence',
              '近 30 天收缩压平均 {avg} mmHg（≥130）', { avg: d.bp.avg })
          };
        } },
      { group: '监测', when: function (d) { return d.bp.count >= 1 && d.bp.avg < 130; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.bpOk.title',
              '血压已达标：每周固定测量 2~3 次即可'),
            detail: PHR.t('insight.advice.bpOk.detail',
              '不必每天测量，但建议固定在同一时段、同一手臂，数据才有可比性。' +
              '若连续两次超过 140/90 mmHg，请复诊。'),
            priority: '低', tone: 'ok', metricKey: 'systolic',
            evidence: PHR.t('insight.advice.bpOk.evidence',
              '近 30 天收缩压平均 {avg} mmHg（<130）', { avg: d.bp.avg })
          };
        } },
      { group: '监测', when: function (d) { return d.glu.count > 0 && (d.glu.avg >= 6.1 || (d.hba1c.count && d.hba1c.latest.value >= 6.5)); }, item: function (d) {
          return {
            title: PHR.t('insight.advice.glucoseMonitor.title',
              '血糖监测：每周 2~3 次，空腹与餐后 2 小时各一次'),
            detail: PHR.t('insight.advice.glucoseMonitor.detail',
              '只测空腹会漏掉餐后高血糖。把数值与进食内容一起记录，更容易找到升高血糖的食物。'),
            priority: '高', tone: 'warn', metricKey: 'glucose',
            evidence: PHR.t('insight.advice.glucoseMonitor.evidence',
              '近 90 天空腹血糖平均 {avg} mmol/L{extra}',
              {
                avg: d.glu.avg,
                extra: d.hba1c.count
                  ? PHR.t('insight.advice.glucoseMonitor.evidenceHba1c', '，糖化血红蛋白 {value}%',
                      { value: d.hba1c.latest.value })
                  : ''
              })
          };
        } },
      { group: '监测', when: function (d) { return d.missing.length > 0; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.retest.title', '补测 {n} 项长期未记录的指标',
              { n: d.missing.length }),
            detail: PHR.t('insight.advice.retest.detail',
              '{list} 已经超过 30 天没有记录。数据断档后，趋势判断与风险评分都会失真。',
              { list: d.missing.slice(0, 5).map(function (x) { return x.name; }).join(listSep()) }),
            priority: '中', tone: 'info', metricKey: null,
            evidence: PHR.t('insight.advice.retest.evidence',
              '最近 30 天无记录的指标共 {n} 项', { n: d.missing.length })
          };
        } },
      { group: '监测', when: function (d) { return d.family.length > 0; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.familyPlan.title', '把家族史转化为具体的筛查计划'),
            detail: PHR.t('insight.advice.familyPlan.detail',
              '{list}。一级亲属有早发（<55 岁）病史时，筛查起始年龄通常需要提前 5~10 年。',
              { list: d.family.slice(0, 2).map(function (r) { return r.name + '：' + r.advice; })
                  .join(clauseSep()) }),
            priority: '中', tone: 'warn', metricKey: null,
            evidence: d.family.map(function (r) { return r.reason; }).join(clauseSep())
          };
        } },
      { group: '监测', when: function (d) { return d.sleep.count > 0 && d.sleepLow; }, item: function () {
          return {
            title: PHR.t('insight.advice.sleepApnea.title', '顺便记一记打鼾与白天嗜睡情况'),
            detail: PHR.t('insight.advice.sleepApnea.detail',
              '长期睡不够如果伴随打鼾、晨起头痛、白天犯困，可能提示睡眠呼吸暂停，' +
              '它会明显推高血压，值得做一次睡眠监测。'),
            priority: '低', tone: 'info', metricKey: 'sleepHours',
            evidence: PHR.t('insight.advice.sleepApnea.evidence', '近期多数天数睡眠不足 7 小时')
          };
        } },

      /* ---------------- 用药 ---------------- */
      { group: '用药', when: function (d) { return d.longTerm.length > 0; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.longTerm.title', '长期用药：每 30 天复诊评估一次'),
            detail: PHR.t('insight.advice.longTerm.detail',
              '系统检测到 {n} 种长期用药（{list}）。慢病用药需要定期评估剂量是否仍然合适，' +
              '不能"一成不变地吃下去"。',
              {
                n: d.longTerm.length,
                list: d.longTerm.slice(0, 3).map(function (r) { return r.data.drugName; })
                  .join(listSep())
              }),
            priority: '中', tone: 'warn', metricKey: null,
            evidence: PHR.t('insight.advice.longTerm.evidence',
              '当前在服药物 {n} 种，且标记为长期用药', { n: d.longTerm.length })
          };
        } },
      { group: '用药', when: function (d) { return d.adherence.total > 0 && (d.adherence.poor > 0 || d.fairRate >= 30); }, item: function (d) {
          return {
            title: PHR.t('insight.advice.adherence.title', '把漏服率降下来：分装药盒 + 手机闹钟'),
            detail: PHR.t('insight.advice.adherence.detail',
              '漏服是慢病控制失败最常见的原因。建议把一周的药按顿分装，' +
              '并把服药时间绑定到固定动作（如刷牙后、早餐后）。'),
            priority: '高', tone: 'warn', metricKey: null,
            evidence: PHR.t('insight.advice.adherence.evidence',
              '规律服药率仅 {rate}%（偶尔漏服 {fair} 条、经常漏服 {poor} 条）',
              { rate: d.adherence.goodRate, fair: d.adherence.fair, poor: d.adherence.poor })
          };
        } },
      { group: '用药', when: function (d) { return d.refill.length > 0; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.refill.title', '提前开药：{drug} 即将用完',
              { drug: d.refill[0].drugName }),
            detail: PHR.t('insight.advice.refill.detail',
              '{message} 建议在药用完前 3~5 天复诊或线上续方，避免断药。',
              { message: d.refill[0].message }),
            priority: '中', tone: 'info', metricKey: null,
            evidence: PHR.t('insight.advice.refill.evidence', '还有 {days} 天到期',
              { days: d.refill[0].dueInDays })
          };
        } },

      /* ---------------- 饮食 ---------------- */
      { group: '饮食', when: function (d) { return d.bp.count >= 3 && d.bp.avg >= 130; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.salt.title', '减盐：把每日食盐控制在 6 克以下'),
            detail: PHR.t('insight.advice.salt.detail',
              '减少烹饪用盐与酱油，少吃腌制品、香肠、方便面与外卖；' +
              '用醋、柠檬、香辛料替代一部分咸味。'),
            priority: '高', tone: 'warn', metricKey: 'systolic',
            evidence: PHR.t('insight.advice.salt.evidence',
              '近 30 天收缩压平均 {avg} mmHg，减盐通常可在 4~8 周后下降 3~5 mmHg',
              { avg: d.bp.avg })
          };
        } },
      { group: '饮食', when: function (d) { return d.glu.count > 0 && d.glu.avg >= 6.1; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.carbs.title',
              '主食减半换粗粮，按"先菜后饭"的顺序吃'),
            detail: PHR.t('insight.advice.carbs.detail',
              '把白米饭/面条的一半换成糙米、燕麦、杂豆；每餐先吃蔬菜和蛋白质，最后吃主食，' +
              '餐后血糖上升会更平缓。'),
            priority: '高', tone: 'warn', metricKey: 'glucose',
            evidence: PHR.t('insight.advice.carbs.evidence',
              '近 90 天空腹血糖平均 {avg} mmol/L（正常上限 6.1）', { avg: d.glu.avg })
          };
        } },
      { group: '饮食', when: function (d) { return d.ldl.count > 0 && d.ldl.latest.value >= 3.4; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.satFat.title', '减少饱和脂肪与反式脂肪'),
            detail: PHR.t('insight.advice.satFat.detail',
              '少吃动物内脏、肥肉、油炸食品与奶油点心；改用植物油，每周吃 2 次深海鱼，' +
              '每天一小把坚果。'),
            priority: '高', tone: 'warn', metricKey: 'ldl',
            evidence: PHR.t('insight.advice.satFat.evidence',
              '最近一次低密度脂蛋白 {value} mmol/L（正常上限 3.4）',
              { value: d.ldl.latest.value })
          };
        } },
      { group: '饮食', when: function (d) { return d.bmi.count > 0 && d.bmi.latest.value >= 24; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.calories.title',
              '控制总热量：用小一号的餐具，先喝汤再吃饭'),
            detail: PHR.t('insight.advice.calories.detail',
              '不必节食，但要把"吃到八分饱"变成习惯。记录三天饮食就能发现热量主要来自哪里。'),
            priority: '中', tone: 'info', metricKey: 'bmi',
            evidence: PHR.t('insight.advice.calories.evidence', 'BMI {bmi} kg/m²（正常 18.5~23.9）',
              { bmi: d.bmi.latest.value })
          };
        } },
      { group: '饮食', when: function (d) { return d.uric.count > 0 && d.uric.latest.value >= 420; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.purine.title', '限嘌呤、多饮水：每日饮水 2000 ml 以上'),
            detail: PHR.t('insight.advice.purine.detail',
              '少吃动物内脏、浓肉汤、贝类与啤酒；多喝水有助于尿酸排出。'),
            priority: '中', tone: 'warn', metricKey: 'uricAcid',
            evidence: PHR.t('insight.advice.purine.evidence',
              '最近一次血尿酸 {value} μmol/L（正常上限 420）', { value: d.uric.latest.value })
          };
        } },

      /* ---------------- 运动 ---------------- */
      { group: '运动', when: function (d) { return d.steps.count > 0 && d.steps.avg < 6000; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.stepsLow.title', '把每日步数从 {from} 提升到 {to} 步', {
              from: Math.round(d.steps.avg),
              to: (d.steps.avg < 4000 ? 6000 : 8000)
            }),
            detail: PHR.t('insight.advice.stepsLow.detail',
              '拆成三段各 10~15 分钟的快走更容易坚持：通勤提前一站下车、午饭后绕楼一圈、晚饭后散步。'),
            priority: '高', tone: 'warn', metricKey: 'steps',
            evidence: PHR.t('insight.advice.stepsLow.evidence',
              '最近 {n} 天平均每天 {steps} 步（建议 ≥6000）',
              { n: d.steps.count, steps: Math.round(d.steps.avg) })
          };
        } },
      { group: '运动', when: function (d) { return d.steps.count > 0 && d.steps.avg >= 6000; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.stepsOk.title', '活动量已达标，再加一点抗阻训练'),
            detail: PHR.t('insight.advice.stepsOk.detail',
              '每周 2 次、每次 20 分钟的弹力带或自重训练（深蹲、靠墙俯卧撑），' +
              '有助于提高基础代谢、改善胰岛素敏感性。'),
            priority: '低', tone: 'ok', metricKey: 'steps',
            evidence: PHR.t('insight.advice.stepsOk.evidence', '最近 {n} 天平均每天 {steps} 步',
              { n: d.steps.count, steps: Math.round(d.steps.avg) })
          };
        } },
      { group: '运动', when: function (d) { return d.bp.count >= 3 && d.bp.avg >= 130; }, item: function () {
          return {
            title: PHR.t('insight.advice.aerobic.title', '每周 150 分钟中等强度有氧运动'),
            detail: PHR.t('insight.advice.aerobic.detail',
              '快走、游泳、骑车都可以，"能说话但不能唱歌"的强度最合适。' +
              '血压较高时避免憋气用力的动作（如大重量举重）。'),
            priority: '中', tone: 'info', metricKey: 'systolic',
            evidence: PHR.t('insight.advice.aerobic.evidence', '规律有氧运动可让收缩压下降 4~9 mmHg')
          };
        } },

      /* ---------------- 生活方式 ---------------- */
      { group: '生活方式', when: function (d) { return d.sleep.count > 0 && d.sleepLow; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.sleep.title', '把睡眠补到 7 小时以上'),
            detail: PHR.t('insight.advice.sleep.detail',
              '固定起床时间比固定入睡时间更有效；睡前一小时远离屏幕，下午后不再摄入咖啡因。' +
              '长期睡眠不足会推高血压、血糖并影响情绪。'),
            priority: '高', tone: 'warn', metricKey: 'sleepHours',
            evidence: PHR.t('insight.advice.sleep.evidence',
              '最近 {n} 天平均睡眠 {avg} 小时，其中 {low} 天不足 7 小时',
              { n: d.sleep.count, avg: d.sleep.avg, low: d.sleepLowCount })
          };
        } },
      { group: '生活方式', when: function (d) { return d.smoking === 'current'; }, item: function () {
          return {
            title: PHR.t('insight.advice.smoking.title', '戒烟是所有干预里收益最大的一项'),
            detail: PHR.t('insight.advice.smoking.detail',
              '戒烟 1 年后冠心病风险约降低一半。可以到戒烟门诊寻求药物与行为支持，' +
              '设定一个具体的戒烟日开始，比"慢慢减量"成功率更高。'),
            priority: '高', tone: 'danger', metricKey: null,
            evidence: PHR.t('insight.advice.smoking.evidence', '个人基本信息中登记为"目前吸烟"')
          };
        } },
      { group: '生活方式', when: function (d) { return d.drinking === 'often'; }, item: function () {
          return {
            title: PHR.t('insight.advice.drinking.title', '限制饮酒量'),
            detail: PHR.t('insight.advice.drinking.detail',
              '男性每日酒精不超过 25 g（约啤酒 750 ml）、女性不超过 15 g，每周至少 2 天不饮酒。'),
            priority: '中', tone: 'warn', metricKey: 'uricAcid',
            evidence: PHR.t('insight.advice.drinking.evidence', '个人基本信息中登记为"经常饮酒"')
          };
        } },
      { group: '生活方式', when: function (d) { return d.hr.count > 0 && d.hr.avg > 90; }, item: function (d) {
          return {
            title: PHR.t('insight.advice.heartRate.title', '静息心率偏快：先从作息与运动入手'),
            detail: PHR.t('insight.advice.heartRate.detail',
              '规律有氧运动、保证睡眠、减少咖啡因，通常能让静息心率下降 3~8 次/分。' +
              '若安静时也持续超过 100 次/分，建议到心内科查一次心电图。'),
            priority: '中', tone: 'warn', metricKey: 'heartRate',
            evidence: PHR.t('insight.advice.heartRate.evidence',
              '近 30 天静息心率平均 {avg} 次/分（正常 60~100）', { avg: d.hr.avg })
          };
        } }
    ];
  }

  /** 收集所有规则需要的数据条件（只算一次） */
  function conditions() {
    var ps = PHR.records.profile.summary();
    var sleep = days('sleepHours', 14);
    var lowDays = sleep.count
      ? sleep.series.filter(function (p) { return p.y < 7; }).length : 0;
    var anomalies = PHR.insight.anomaly.byLevel();
    var adh = MED().adherenceStats();

    return {
      ps: ps,
      smoking: ps ? ps.profile.smoking : '',
      drinking: ps ? ps.profile.drinking : '',
      bp: sum('systolic', 30),
      glu: sum('glucose', 90),
      hba1c: sum('hba1c', 365),
      ldl: sum('ldl', 365),
      bmi: sum('bmi', 365),
      waist: sum('waist', 365),
      uric: sum('uricAcid', 365),
      hr: sum('heartRate', 30),
      sleep: sleep,
      sleepLow: sleep.count > 0 && lowDays > sleep.count / 2,
      sleepLowCount: lowDays,
      steps: days('steps', 7),
      critical: anomalies.count.high ? anomalies.high : [],
      due: H().followUpDue().filter(function (f) { return f.overdue; }),
      missing: V().missing(30),
      family: H().geneticRisks(),
      longTerm: MED().current().filter(function (r) { return r.data.longTerm; }),
      adherence: adh,
      fairRate: adh.total ? Math.round(adh.fair / adh.total * 100) : 0,
      refill: MED().refillReminders().filter(function (r) { return r.dueInDays <= 7; }),
      dangerInter: MED().interactions().filter(function (x) { return x.level === 'danger'; })
    };
  }

  /**
   * 生成分组建议。
   * @returns {Array<{group, icon, items:[{title, detail, priority, tone, evidence, metricKey}]}>}
   *   返回的数组上额外挂了 `disclaimer` 字段（免责声明必须随数据一起返回，
   *   由界面负责展示，避免调用方忘记加）。
   */
  function generate() {
    var d = conditions();
    var rules = makeRules();

    // 重置分组容器（GROUPS 是模块级常量，这里按值复制一份避免累积）
    var groups = GROUPS.map(function (g) {
      return { group: g.group, icon: g.icon, label: groupName(g.group), items: [] };
    });
    var index = {};
    groups.forEach(function (g) { index[g.group] = g; });

    rules.forEach(function (r) {
      var hit;
      try { hit = r.when(d); } catch (e) { hit = false; }
      if (!hit) { return; }
      var g = index[r.group];
      if (g) { g.items.push(r.item(d)); }
    });

    var out = groups.filter(function (g) { return g.items.length; });
    out.disclaimer = M.DISCLAIMER;
    return out;
  }

  /* ================================================================== *
   * 二、今日健康计划（dailyPlan）
   * ================================================================== */
  function todayKey() { return TODO_PREFIX + U.today(); }

  function readTodo() {
    try { return PHR.store.read(todayKey(), {}) || {}; } catch (e) { return {}; }
  }

  function writeTodo(map) {
    try { PHR.store.write(todayKey(), map); } catch (e) { PHR.warn(PHR.t('insight.advice.warn.todoSaveFail', '今日计划保存失败'), e); }
    return map;
  }

  /** 生成 3~5 条"今天就能做完"的动作 */
  function planItems() {
    var d = conditions();
    var plan = [];
    var date = U.today();

    /* kind 保留中文（它是分组口径），展示名由 kindName() 在渲染时取词 */
    if (d.critical.length) {
      plan.push({
        id: date + '_doctor', kind: '就医', icon: '🏥', tone: 'danger',
        text: PHR.t('insight.plan.doctor', '预约就诊：「{metric}」需要医生评估',
          { metric: d.critical[0].metricName }),
        metricKey: d.critical[0].metricKey
      });
    }
    if (d.adherence.total && (d.adherence.poor > 0 || d.fairRate >= 30)) {
      plan.push({ id: date + '_med', kind: '用药', icon: '💊', tone: 'warn',
        text: PHR.t('insight.plan.medMissed', '按时服药：今天的三餐后用药不要漏服'),
        metricKey: null });
    } else if (d.longTerm.length) {
      plan.push({ id: date + '_med', kind: '用药', icon: '💊', tone: 'info',
        text: PHR.t('insight.plan.medLongTerm', '按时服用 {drug} 等长期用药',
          { drug: d.longTerm[0].data.drugName }),
        metricKey: null });
    }
    if (d.steps.count && d.steps.avg < 6000) {
      plan.push({ id: date + '_walk', kind: '运动', icon: '🏃', tone: 'warn',
        text: PHR.t('insight.plan.walk', '快走 30 分钟（约 3000 步），可分三次完成'),
        metricKey: 'steps' });
    }
    if (d.sleepLow) {
      plan.push({ id: date + '_sleep', kind: '作息', icon: '🌙', tone: 'warn',
        text: PHR.t('insight.plan.sleep', '23:00 前放下手机，今晚睡够 7 小时'),
        metricKey: 'sleepHours' });
    }
    if (d.bp.count >= 3 && d.bp.avg >= 130) {
      plan.push({ id: date + '_bp', kind: '监测', icon: '🩺', tone: 'warn',
        text: PHR.t('insight.plan.bp', '早晚各测一次血压并记录（安静坐 5 分钟后）'),
        metricKey: 'systolic' });
    }
    if (d.glu.count && d.glu.avg >= 6.1) {
      plan.push({ id: date + '_glu', kind: '监测', icon: '🩸', tone: 'info',
        text: PHR.t('insight.plan.glucose', '记录一次空腹血糖，并写下前一天晚餐内容'),
        metricKey: 'glucose' });
    }
    if (d.smoking === 'current') {
      plan.push({ id: date + '_smoke', kind: '生活方式', icon: '🚭', tone: 'danger',
        text: PHR.t('insight.plan.smoke', '今天比昨天少抽一支烟，并记下想抽烟的场合'),
        metricKey: null });
    }
    if (!plan.length) {
      plan.push({ id: date + '_record', kind: '监测', icon: '📝', tone: 'ok',
        text: PHR.t('insight.plan.fallback', '记录一次今天的体重或血压，保持数据连续'),
        metricKey: null });
    }
    return plan.slice(0, 5);
  }

  /**
   * 今日健康计划。
   * @returns {{date, items, progress:{done,total,percent}, disclaimer}}
   *   items[].id 是稳定 id，勾选状态存在 PHR.store 的 insight_todo_<日期> 下。
   */
  function dailyPlan() {
    var saved = readTodo();
    var items = planItems().map(function (it) {
      it.done = !!saved[it.id];
      return it;
    });
    var done = items.filter(function (i) { return i.done; }).length;
    return {
      date: U.today(),
      items: items,
      progress: {
        done: done, total: items.length,
        percent: items.length ? Math.round(done / items.length * 100) : 0
      },
      disclaimer: M.DISCLAIMER
    };
  }

  /** 勾选 / 取消勾选一项，返回勾选后的状态 */
  function toggle(itemId) {
    if (!itemId) { return false; }
    var map = readTodo();
    map[itemId] = !map[itemId];
    writeTodo(map);
    return map[itemId];
  }

  /** 今日完成进度 */
  function todayProgress() { return dailyPlan().progress; }

  /* ================================================================== *
   * 三、本周小结（weeklyReport）
   * ================================================================== */
  /** 本周小结：用于首页卡片与"每周健康小结"偏好项 */
  function weeklyReport() {
    var now = Date.now();
    var from = now - 7 * 86400000;
    var records = PHR.records.service.list({ from: from });
    var highlights = [];
    var concerns = [];
    var nextWeek = [];

    /* ---- 亮点：本周新增记录、指标改善 ---- */
    if (records.length) {
      highlights.push(PHR.t('insight.weekly.hlRecords',
        '本周新增 {n} 条健康记录，覆盖 {types} 类档案。',
        {
          n: records.length,
          types: U.unique(records.map(function (r) { return D.recordTypeName(r.type); })).length
        }));
    } else {
      concerns.push(PHR.t('insight.weekly.hlNone',
        '本周没有新增任何记录 —— 数据断档会让趋势判断失去依据。'));
    }

    var trends = PHR.insight.trend.analyzeAll(90);
    trends.forEach(function (t) {
      if (t.empty || t.count < 3 || t.direction === '平稳') { return; }
      // 统一用回归斜率描述幅度，避免出现"持续上升（-8.2%）"这种首尾与趋势打架的句子
      var mag = PHR.t(
        t.slopePerMonth > 0 ? 'insight.trend.monthlyUp' : 'insight.trend.monthlyDown',
        t.slopePerMonth > 0 ? '约每月上升 {value} {unit}' : '约每月下降 {value} {unit}',
        { value: M.fmt(Math.abs(t.slopePerMonth), t.metric.decimals), unit: t.metric.unit });
      var dir = PHR.insight.trend.dirName(t.direction);
      if (t.mismatch) {
        concerns.push(PHR.t('insight.weekly.trendMismatch',
          '{metric}近 90 天起伏较大，{mag}，建议结合趋势图判断。',
          { metric: t.metric.shortName, mag: mag }));
      } else if (t.better) {
        highlights.push(PHR.t('insight.weekly.trendGood',
          '{metric}近 90 天整体{direction}（{mag}），方向正确。',
          { metric: t.metric.shortName, direction: dir, mag: mag }));
      } else {
        concerns.push(PHR.t('insight.weekly.trendBad',
          '{metric}近 90 天整体{direction}（{mag}），需要关注。',
          { metric: t.metric.shortName, direction: dir, mag: mag }));
      }
    });

    /* ---- 需要关注：高危告警与逾期随访 ---- */
    var high = PHR.insight.anomaly.byLevel().high;
    high.slice(0, 3).forEach(function (a) { concerns.push(a.title + '：' + a.detail); });

    var overdue = H().followUpDue().filter(function (f) { return f.overdue; });
    if (overdue.length) {
      concerns.push(PHR.t('insight.weekly.overdue', '有 {n} 项随访已逾期：{list}。',
        {
          n: overdue.length,
          list: overdue.map(function (f) { return f.diseaseName; }).join(listSep())
        }));
    }

    /* ---- 下周建议：取最容易改善的前 2 条 + 补测提醒 ---- */
    PHR.insight.risk.improvements().slice(0, 2).forEach(function (i) {
      nextWeek.push(i.title + ' —— ' + i.expected);
    });
    var missing = V().missing(30);
    if (missing.length) {
      nextWeek.push(PHR.t('insight.weekly.nextRetest', '补测：{list}。',
        { list: missing.slice(0, 3).map(function (m) { return m.name; }).join(listSep()) }));
    }
    if (!nextWeek.length) {
      nextWeek.push(PHR.t('insight.weekly.nextKeep',
        '保持现在的记录频率，继续按固定时间测量。'));
    }

    var plan = dailyPlan();
    var text = PHR.t('insight.weekly.text',
      '本周（{from} ~ {to}）共记录 {n} 条健康数据，今日计划完成 {done}/{total} 项。{high}{concerns}',
      {
        from: U.fmtDate(from), to: U.fmtDate(now), n: records.length,
        done: plan.progress.done, total: plan.progress.total,
        high: high.length
          ? PHR.t('insight.weekly.textHigh', '有 {n} 项指标需要优先处理。', { n: high.length })
          : PHR.t('insight.weekly.textCalm', '各项指标总体平稳。'),
        concerns: concerns.length
          ? PHR.t('insight.weekly.textConcerns', '详见下方「需要关注」。')
          : ''
      });

    return {
      range: { from: from, to: now, text: U.fmtDate(from) + ' ~ ' + U.fmtDate(now) },
      highlights: highlights.slice(0, 4),
      concerns: concerns.slice(0, 4),
      nextWeek: nextWeek.slice(0, 3),
      text: text,
      disclaimer: M.DISCLAIMER
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.insight.advice = {
    generate: generate,
    dailyPlan: dailyPlan,
    toggle: toggle,
    todayProgress: todayProgress,
    weeklyReport: weeklyReport,
    groupName: groupName,
    kindName: kindName,
    ruleCount: makeRules().length
  };

  /* groups / disclaimer 用 getter：加载本文件时语言还没定下来
     （detect 在 boot 阶段才跑），直接取值会永远停在中文。 */
  Object.defineProperty(PHR.insight.advice, 'groups', {
    enumerable: true,
    get: function () { return GROUPS.map(function (g) { return g.group; }); }
  });
  Object.defineProperty(PHR.insight.advice, 'disclaimer', {
    enumerable: true,
    get: function () { return M.DISCLAIMER; }
  });

})(window.PHR);
