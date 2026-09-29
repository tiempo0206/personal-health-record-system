/**
 * ============================================================================
 * 文件：core/i18n/en-US.insight.js
 * 层：核心基础设施层（国际化 · 英文词条 · 健康洞察模块）
 * 职责：注册「健康洞察」模块（模块 4）的英文词条 —— 页面骨架、五个页签、
 *      指标详情、指标语义层（explain / 覆盖率）、趋势结论、六类告警、
 *      9 个风险维度与 24 条预防建议。
 *
 *      与 en-US.js 的关系：同一个语种、同一张词条表，只是按模块拆成多个文件，
 *      由 register() 合并。因此这里可以直接引用 en-US.js 里已有的键
 *      （如 dict.metric.*），也可以补充它没有的键（如 view.insight-detail.title）。
 *
 * 依赖：core/i18n/i18n.js（register）
 * ============================================================================
 *
 * ⚠️ 翻译口径（与 en-US.js 一致，并针对本模块补充）：
 *   · 医疗术语用国际通行表达：systolic blood pressure / HbA1c / LDL cholesterol
 *   · **分级措辞只描述区间，绝不暗示诊断**：
 *       写 "falls in the range that needs attention"，
 *       不写 "you have high blood pressure" / "you have depression"
 *   · 凡涉及免责声明的地方（不构成诊断、不能替代医生判断）一律译出，
 *     不做"为了句子短一点就删掉"的处理
 *   · 建议保持原文的具体度：原文写"每日食盐 <6 g"，英文也写具体数字，
 *     不泛化成 "eat healthy"
 *   · 指标名、判定等级、字典项已经由 dict 层译好（走 dict.metric.* /
 *     dict.judge.*），本文件不重复翻译，只在拼接句里作为参数传入
 *
 * ⚠️ 关于拼接句与插值：
 *   本模块大量结论是**动态拼接**出来的（"近 30 天收缩压平均 132 mmHg，
 *   有 8 次读数超出正常范围"）。这类句子统一改成"整句词条 + 插值"，
 *   参数名与源码里的变量一一对应，便于对照排查。
 *   有几处英文词条**故意以空格结尾**（如 summary.concern / summary.missing），
 *   因为中文用标点直接相连、英文需要在句间留一个空格。这类词条已逐条标注。
 *
 * ⚠️ 关于"内部值"：
 *   trend.direction（'上升'/'下降'/'平稳'）与 trend.stability（'稳定'/'波动'）
 *   是**被多处 === 比较的内部枚举**（advice / anomaly / risk / 工作台都拿它做判断），
 *   因此源码里保持中文不动，只在**展示**时经 insight.trend.dir.* /
 *   insight.trend.stability.* 取词。同理，advice 的 group 名、指标的
 *   systolic 等 key、CSS 类名、data-action 值都不翻译。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    /* ================================================================== *
     * 一、标点与分隔符
     *    中文用「、」「；」「。」，英文对应 ", " / ". " / "."。
     *    单独成条，避免在拼接处硬编码中文标点。
     * ================================================================== */
    'insight.punct.end': '.',
    'insight.punct.listSep': ', ',
    'insight.punct.clauseSep': '. ',
    'insight.sep.dot': ' · ',
    'insight.sep.wide': ' · ',

    /* ================================================================== *
     * 二、模块注册与页面骨架（insight.view.js / metrics.js）
     * ================================================================== */
    'module.insight.title': 'Health Insight',
    'module.insight.desc': 'Trend analysis, alerts, risk assessment and prevention advice — turning complicated numbers into plain language.',

    /* ---------- 模块内部警告 ---------- */
    'insight.warn.dedupWriteFail': 'Failed to save alert de-duplication log',
    'insight.warn.dismissFail': 'Failed to dismiss alert',
    'insight.warn.clearDismissFail': 'Failed to clear dismissed alerts',
    'insight.advice.warn.todoSaveFail': 'Failed to save today\'s plan',

    'view.insight-detail.title': 'Metric detail',

    'insight.view.title': 'Health Insight',
    'insight.view.desc': 'Turns blood pressure, glucose, heart rate and other readings into trends, alerts and advice you can actually read. Every conclusion here is rule-based health education, not a diagnosis.',
    'insight.view.gotoRecords': '🗂️ Go to records',
    'insight.view.addRecord': '＋ Add a reading',
    'insight.view.auditDetail': 'Viewed the Health Insight page ({tab})',
    'insight.view.sourceTitle': 'Data source: Health Records',
    'insight.view.sourceBody': 'Scores, trends and alerts are recalculated from Health Records in real time. The current analysis includes {records} record(s), including {vitals} vital reading(s) and {labs} lab report(s). Last updated: {when}.',
    'insight.view.sourceEmpty': 'Trends, alerts and scores will be generated from vital readings, lab reports and basic profile data in Health Records. Add or upload records and the results update automatically.',
    'insight.view.reasonTitle': 'Why did the result change?',
    'insight.view.reasonVital': 'The latest item included in the analysis is {metric}: {value}. If a trend or score changed, it is usually because this reading is now included in the calculation.',
    'insight.view.reasonLab': 'The latest item included in the analysis is the lab report “{title}”. Recognised lab items are used in trends and risk scoring.',
    'insight.view.reasonRecord': 'The latest item included in the analysis is “{title}” ({type}). When Health Records change, this page recalculates the related conclusions.',

    'insight.tab.overview': 'Overview',
    'insight.tab.trend': 'Metric trends',
    'insight.tab.alerts': 'Alerts',
    'insight.tab.risk': 'Risk assessment',
    'insight.tab.advice': 'Prevention advice',

    'insight.detail.title': 'Metric detail',
    'insight.detail.notFoundDesc': 'That metric could not be found.',
    'insight.detail.back': '← Back to Health Insight',
    'insight.detail.unknownMetric': 'Unknown metric',
    'insight.detail.unknownMetricHint': 'Open a metric card from Health Insight → Metric trends.',
    'insight.detail.backToInsight': 'Back to Health Insight',

    /* 数据覆盖率分级（metrics.coverageOf）：只作展示，不参与判断 */
    'insight.coverage.abundant': 'good',
    'insight.coverage.sparse': 'limited',
    'insight.coverage.insufficient': 'too few',

    /* 全模块统一的免责声明 —— 由 metrics.js 以 getter 暴露，随语言切换 */
    'insight.disclaimer': 'Everything on this page (trends, alerts, risk score and prevention advice) is rule-based health education built on publicly available epidemiology. It is not a medical diagnosis and cannot replace a doctor\'s professional judgement. Always talk to a licensed doctor before starting, stopping or changing any medication or treatment plan. If you have chest pain, trouble breathing, a change in consciousness or another emergency sign, call 120 immediately.',

    /* ================================================================== *
     * 三、指标语义层（metrics.js）
     * ================================================================== */
    'insight.metric.noLimit': 'No limit',
    'insight.metric.noAbsoluteNormal': 'This metric has no absolute normal value',
    'insight.metric.unknown': 'Unknown metric',

    /* explain()：一次读数的解释。整句取词 + 插值，避免中文语序残留。 */
    'insight.explain.headlineNormal': '{name} {value} {unit} — within the normal range',
    'insight.explain.headlineHigh': '{name} {value} {unit} — above the normal upper limit of {bound}',
    'insight.explain.headlineLow': '{name} {value} {unit} — below the normal lower limit of {bound}',
    'insight.explain.detailPlain': '{headline}. {desc}',
    'insight.explain.detail': '{headline}, {scope}. {desc}',
    'insight.explain.rangeNormal': 'Normal range: {range}.',
    'insight.explain.compareHigh': '{diff} {unit} above the normal upper limit (normal range: {range}).',
    'insight.explain.compareLow': '{diff} {unit} below the normal lower limit (normal range: {range}).',
    'insight.explain.noThresholdCompare': 'This metric has no absolute normal value, so we look at how it changes over time instead.',
    'insight.explain.scope.ok': 'this is where it should be',
    'insight.explain.scope.warning': 'this falls in the range that needs attention',
    'insight.explain.scope.critical': 'this falls clearly outside the normal range, so please see a doctor soon',

    /* ================================================================== *
     * 四、趋势分析（trend.service.js）
     * ================================================================== */
    /* 内部枚举值的展示名（源码里的值是中文，见文件头说明） */
    'insight.trend.dir.up': 'upward',
    'insight.trend.dir.down': 'downward',
    'insight.trend.dir.flat': 'steady',
    'insight.trend.stability.stable': 'stable',
    'insight.trend.stability.volatile': 'fluctuating',

    /* 「约每月上升 2.3 mmHg」这一小句的两种形态 */
    'insight.trend.monthlyUp': 'up about {value} {unit} per month',
    'insight.trend.monthlyDown': 'down about {value} {unit} per month',
    'insight.trend.perMonthUp': 'That is about {value} {unit} up per month.',
    'insight.trend.perMonthDown': 'That is about {value} {unit} down per month.',

    'insight.trend.empty': 'There are no “{metric}” readings yet. Record one and the system can start analysing the trend.',
    'insight.trend.single': 'There is only one “{label}” reading so far ({value} {unit}). At least 3 are needed before a trend means anything.',

    'insight.trend.summary.flat': 'Over the past {days} days {label} has been steady, averaging {avg} {unit} and ranging from {min} to {max} {unit}.',
    'insight.trend.summary.flatVolatile': ' A few readings jump around — try to keep the measuring conditions identical each time.',
    'insight.trend.summary.mismatch': '{days}-day {label} is fairly erratic: first-to-last it moved from {first} to {last} {unit} ({sign}{pct}%), but a least-squares fit across every point says it is overall {direction}. {perMonth} The first and last points are easily skewed by one bad reading, so read this together with the chart.',
    'insight.trend.summary.normal': 'Over the past {days} days {label} has been trending {direction}, from {first} {unit} to {last} {unit} ({sign}{pct}%). {perMonth}',
    'insight.trend.summary.good': ' That is the right direction — keep it up.',
    'insight.trend.summary.bad': ' That is not the direction we want. See the prevention advice below for what to adjust.',

    /* 血压拆成两条线时的图例名 */
    'insight.trend.bp.systolic': 'Systolic (upper)',
    'insight.trend.bp.diastolic': 'Diastolic (lower)',

    /* 折线图 */
    'insight.trend.chart.aria': '{metric} trend chart',
    'insight.trend.chart.empty': 'There are no “{metric}” readings yet. Tap “Add a reading” to start building up data.',
    'insight.trend.chart.normalBand': 'Normal range',
    'insight.trend.chart.target': 'Target {value} {unit}',
    'insight.trend.chart.targetByName': '{name} target {value}',

    /* 显著转折点 */
    'insight.trend.changePoint.noteUp': 'Up {value} {unit} since the previous reading ({from} → {to}) — more than 2 standard deviations, which counts as a significant change.',
    'insight.trend.changePoint.noteDown': 'Down {value} {unit} since the previous reading ({from} → {to}) — more than 2 standard deviations, which counts as a significant change.',

    /* 两段时间对比 */
    'insight.trend.compare.missing': 'One of the two periods has no “{metric}” readings, so they cannot be compared.',
    'insight.trend.compare.lead': 'The most recent period averages {a} {unit}; the one before it averaged {b} {unit}. ',
    'insight.trend.compare.flat': 'The two are about the same.',
    'insight.trend.compare.up': 'It is up {delta} {unit} ({sign}{pct}%), which is the right direction.',
    'insight.trend.compare.upBad': 'It is up {delta} {unit} ({sign}{pct}%) — this change is not the direction we want.',
    'insight.trend.compare.down': 'It is down {delta} {unit} ({sign}{pct}%), which is the right direction.',
    'insight.trend.compare.downBad': 'It is down {delta} {unit} ({sign}{pct}%) — this change is not the direction we want.',

    /* ================================================================== *
     * 五、异常提醒（anomaly.js）—— 六类规则全覆盖
     * ================================================================== */
    'insight.anomaly.rule.latest': 'Single out-of-range reading',
    'insight.anomaly.rule.consecutive': 'Repeated abnormal readings',
    'insight.anomaly.rule.fastChange': 'Rapid change',
    'insight.anomaly.rule.stale': 'No recent readings',
    'insight.anomaly.rule.trendWorse': 'Worsening trend',
    'insight.anomaly.rule.combo': 'Several metrics together',

    'insight.anomaly.disclaimer': 'These rules are built on publicly available epidemiology and on the thresholds in the metric dictionary. They are meant to help you notice readings worth re-measuring or mentioning to a doctor. They are not a diagnosis.',
    'insight.anomaly.auditDetail': '{title}: {detail}',

    /* ① 单次越界 */
    'insight.anomaly.latest.title': '“{metric}” — latest reading is {level}',
    'insight.anomaly.latest.detail': '{detail} (measured on {at})',

    /* ② 连续异常 */
    'insight.anomaly.readingAt': '{value} ({date})',
    'insight.anomaly.consecutive.title': '“{metric}” — several abnormal readings in a row',
    'insight.anomaly.consecutive.detail': '{n} of the last 3 readings fall outside the normal range: {list}. The normal range is {range}.',
    'insight.anomaly.consecutive.advice': 'A run of abnormal readings matters more than a single blip. Re-measure 2–3 times under the same conditions (same time of day, same posture). If it is still abnormal, take these readings with you when you see a doctor.',

    /* ③ 快速变化 */
    'insight.anomaly.fast.title': '“{metric}” — changed quickly over a short time',
    'insight.anomaly.fast.detailUp': 'On {from} it read {fromVal}; on {to} it read {toVal} — up {delta} {unit} (threshold {threshold} {unit}). {note}',
    'insight.anomaly.fast.detailDown': 'On {from} it read {fromVal}; on {to} it read {toVal} — down {delta} {unit} (threshold {threshold} {unit}). {note}',
    'insight.anomaly.fast.bpNote': 'In home blood-pressure monitoring, a swing of more than 30 mmHg within 24 hours is worth confirming with a re-measurement.',
    'insight.anomaly.fast.advice': 'First check whether the two measurements were taken under the same conditions (time of day, posture, whether you had just exercised or taken medication). If they were not, trust the repeat measurement. If it comes out the same again, ask a doctor.',

    /* ④ 长期未测 / 从未记录 */
    'insight.anomaly.stale.titleEver': 'No “{metric}” reading for {days} days',
    'insight.anomaly.stale.titleNever': '“{metric}” has never been recorded',
    'insight.anomaly.stale.detailEver': 'The last reading was on {date}, {days} days ago. Once the data stops, both trend analysis and the risk score lose accuracy.',
    'insight.anomaly.stale.detailNever': 'There is no “{metric}” reading in the system, so we cannot tell how it is changing. {desc}',
    'insight.anomaly.stale.adviceEver': 'Take one reading soon and record it, then keep to a fixed schedule (once a month, for example).',
    'insight.anomaly.stale.adviceNever': 'Record one reading to establish a baseline. {desc}',

    /* ⑤ 趋势恶化 */
    'insight.anomaly.trend.title': '“{metric}” has been trending {direction} for 90 days — the wrong direction',
    'insight.anomaly.trend.detail': '{summary} (least-squares regression over {n} readings, goodness of fit R²={r2})',
    'insight.anomaly.trend.advice': 'A trend matters more than any single reading. Look first at diet, activity and sleep, then gather this period\'s records and let your doctor judge them at the next visit.',

    /* ⑥ 多指标联合 */
    'insight.anomaly.combo.metabolic.metricName': 'Metabolic metrics (combined)',
    'insight.anomaly.combo.metabolic.title': 'Metabolic risk: three metrics are high at the same time',
    'insight.anomaly.combo.metabolic.detail': '“BMI {bmi} kg/m² (≥24)”, “30-day average systolic {sys} mmHg (≥130)” and “LDL cholesterol {ldl} mmol/L (≥3.4)” all appear together. Each one on its own is only slightly high, but when the three occur together the risks compound — something you cannot see by reading the alerts one by one.',
    'insight.anomaly.combo.metabolic.advice': 'Consider a systematic work-up in endocrinology or cardiology (fasting glucose, full lipid panel, liver and kidney function), and bring your blood-pressure and weight records for the past 90 days with you.',
    'insight.anomaly.combo.cardio.metricName': 'Blood pressure and glucose (combined)',
    'insight.anomaly.combo.cardio.title': 'Blood pressure and glucose are both high — cardiovascular risk compounds',
    'insight.anomaly.combo.cardio.detail': 'A 30-day average systolic of {sys} mmHg and a latest fasting glucose of {glu} mmol/L are both high. High blood pressure and high glucose each make the other\'s damage to blood vessels worse.',
    'insight.anomaly.combo.cardio.advice': 'See an endocrinologist soon to work out whether blood pressure and glucose need managing together — do not treat only one of them.',

    /* ================================================================== *
     * 六、风险评估（risk.js）—— 9 个维度：名称 / evidence / advice 全覆盖
     * ================================================================== */
    /* 维度得分的等级名（factor.levelName） */
    'insight.risk.factorLevel.ok': 'Good',
    'insight.risk.factorLevel.info': 'Fair',
    'insight.risk.factorLevel.warn': 'Needs attention',
    'insight.risk.factorLevel.danger': 'Clearly off target',

    /* 综合风险等级（assess().levelName）—— 描述性措辞，不做诊断 */
    'insight.risk.level.low': 'Low',
    'insight.risk.level.fairlyLow': 'Fairly low',
    'insight.risk.level.moderate': 'Moderate',
    'insight.risk.level.fairlyHigh': 'Fairly high',
    'insight.risk.level.high': 'High',

    /* 优先级的三种写法：单独的「高」、后缀「优先」、后缀「优先级」 */
    'insight.priority.high': 'High',
    'insight.priority.medium': 'Medium',
    'insight.priority.low': 'Low',
    'insight.panel.prioritySuffix': ' priority',
    'insight.panel.prioritySuffixAdvice': ' priority',

    /* 综合结论整句 */
    'insight.risk.summary': 'Across {n} dimensions your health score is {score}, which falls in the “{level}” risk band. {concern}{missing}To raise the score, start with the “3 easiest things to improve” below.',
    'insight.risk.summary.concern': 'What most needs attention right now: {list}. ',
    'insight.risk.summary.allGood': 'Every dimension looks good — keep it up. ',
    'insight.risk.summary.concernItem': '{name} ({level})',
    'insight.risk.summary.missing': 'A further {n} dimensions ({list}) have too little data to assess properly and are currently counted as missing information — fill those records in and the conclusion becomes noticeably more accurate. ',

    /* ① 血压 */
    'insight.risk.bp.name': 'Blood pressure',
    'insight.risk.bp.category': 'Cardiovascular',
    'insight.risk.bp.missing.evidence': 'There are no blood-pressure readings in the system, so this dimension is treated as missing information (half deduction).',
    'insight.risk.bp.missing.advice': 'Measure your blood pressure morning and evening for 7 days and record it — that is the most basic first step in assessing cardiovascular risk.',
    'insight.risk.bp.band.high140': 'at the threshold where high blood pressure needs treatment',
    'insight.risk.bp.band.high130': 'above the 130 mmHg ideal ceiling for home measurement',
    'insight.risk.bp.band.high120': 'in the “high-normal” band',
    'insight.risk.bp.band.low': 'on the low side',
    'insight.risk.bp.band.ideal': 'in the ideal range',
    'insight.risk.bp.window30': 'Over the last 30 days: ',
    'insight.risk.bp.window90': 'Over the last 90 days: ',
    'insight.risk.bp.evidence': '{window}{n} systolic readings, averaging {avg} mmHg — {band}. {over} of them fall outside the normal range (in-range rate {rate}%){extra}.',
    'insight.risk.bp.extra': '; over the last 90 days there are {n90} readings averaging {avg90} mmHg',
    'insight.risk.bp.adviceHigh': 'Cut back on sodium (under 6 g a day), work on your weight, and monitor under the same conditions for 7 days before your next appointment.',
    'insight.risk.bp.adviceMid': 'Keep the low-salt diet and regular daily routine going, and measure 2–3 times a week at fixed times.',
    'insight.risk.bp.adviceGood': 'Blood pressure is well controlled — keep up your current medication and lifestyle.',

    /* ② 血糖 */
    'insight.risk.glucose.name': 'Blood glucose',
    'insight.risk.glucose.category': 'Endocrine',
    'insight.risk.glucose.missing.evidence': 'There are no fasting glucose or HbA1c records, so this dimension is treated as missing information.',
    'insight.risk.glucose.missing.advice': 'Add fasting glucose and HbA1c to your next check-up — HbA1c reflects your average glucose over the past 2–3 months.',
    'insight.risk.glucose.evGlucose': '90-day average fasting glucose {avg} mmol/L ({n} readings, in-range rate {rate}%)',
    'insight.risk.glucose.evNoGlucose': 'No fasting glucose records',
    'insight.risk.glucose.evHba1c': 'Latest HbA1c {value}% ({date})',
    'insight.risk.glucose.evNoHba1c': 'No HbA1c records (a re-check every 3 months is recommended)',
    'insight.risk.glucose.evTrend': 'Trend is improving: down {pct}% overall over the last 90 days',
    'insight.risk.glucose.adviceHigh': 'See an endocrinologist soon to review whether your diet or your medication needs adjusting.',
    'insight.risk.glucose.adviceMid': 'Cut back on refined carbohydrates and sugary drinks, take a 20-minute walk after meals, and re-check HbA1c as your doctor advises.',
    'insight.risk.glucose.adviceGood': 'Glucose is well controlled — keep it up.',

    /* ③ 血脂 */
    'insight.risk.lipid.name': 'Blood lipids (LDL-C)',
    'insight.risk.lipid.missing.evidence': 'There are no LDL cholesterol records, so this dimension is treated as missing information.',
    'insight.risk.lipid.missing.advice': 'Add a full lipid panel to your next check-up (total cholesterol, triglycerides, LDL-C, HDL-C).',
    'insight.risk.lipid.evidence': 'Latest LDL cholesterol {value} mmol/L ({date}); {n} readings in total, ranging {min}–{max} mmol/L{trend}. The normal upper limit is 3.4 mmol/L.',
    'insight.risk.lipid.trendNote': ', trending {direction} over the past year',
    'insight.risk.lipid.adviceHigh': 'Cut back on organ meats, fried food and trans fats, and eat more fibre plus regular aerobic exercise. If you already have cardiovascular disease, discuss with your doctor whether a statin is needed.',
    'insight.risk.lipid.adviceMid': 'You are close to the upper limit — watch your saturated-fat intake and keep exercising.',
    'insight.risk.lipid.adviceGood': 'Blood lipids are well controlled — keep it up.',

    /* ④ 体型 */
    'insight.risk.body.name': 'Body shape (BMI / waist)',
    'insight.risk.body.category': 'Metabolic',
    'insight.risk.body.missing.evidence': 'Neither BMI nor waist circumference is recorded{ps}, so this cannot be assessed.',
    'insight.risk.body.missing.psNote': ' and your basic profile is not filled in either',
    'insight.risk.body.missing.advice': 'Fill in your height and weight under Basic profile, and measure your waist once.',
    'insight.risk.body.evBmi': 'BMI {bmi} kg/m² (normal for Chinese adults: 18.5–23.9)',
    'insight.risk.body.evWaist': 'Latest waist circumference {value} cm (≥90 for men / ≥85 for women suggests central obesity)',
    'insight.risk.body.evAgeOverweight': 'Age {age} combined with excess weight pushes metabolic risk higher still',
    'insight.risk.body.adviceHigh': 'Make “lose 5–10% of body weight” the first goal — roughly 1–2 kg a month, a pace you can hold — together with 150 minutes of moderate aerobic exercise a week and some resistance training.',
    'insight.risk.body.adviceMid': 'Your weight is close to the upper limit — watch total calories and exercise at least 3 times a week.',
    'insight.risk.body.adviceGood': 'Both weight and waist circumference are in the healthy range — keep it up.',

    /* ⑤ 生活方式 */
    'insight.risk.lifestyle.name': 'Lifestyle',
    'insight.risk.lifestyle.category': 'Behaviour',
    'insight.risk.lifestyle.missing.evidence': 'Your basic profile is not filled in yet, so smoking, drinking and exercise cannot be assessed.',
    'insight.risk.lifestyle.missing.advice': 'Fill in the lifestyle section of your basic profile first, and the system can give you advice that actually applies to you.',
    'insight.risk.lifestyle.evSmokingCurrent': 'Currently smoking (markedly higher cardiovascular and respiratory risk)',
    'insight.risk.lifestyle.evSmokingFormer': 'Quit smoking (the risk falls year by year — keep it up)',
    'insight.risk.lifestyle.evSmokingNo': 'Non-smoker',
    'insight.risk.lifestyle.evDrinkingOften': 'Drinks often',
    'insight.risk.lifestyle.evDrinkingSometimes': 'Drinks occasionally',
    'insight.risk.lifestyle.evDrinkingNo': 'Does not drink',
    'insight.risk.lifestyle.evExerciseNever': 'Barely exercises',
    'insight.risk.lifestyle.evExerciseSometimes': 'Exercises less than ideal',
    'insight.risk.lifestyle.evExerciseRegular': 'Exercises regularly',
    'insight.risk.lifestyle.evAge': 'Age {age}',
    'insight.risk.lifestyle.evSteps': 'Averaging {steps} steps a day over the last {n} days',
    'insight.risk.lifestyle.adviceHigh': 'Start with whichever factor drives the risk most: if you smoke, quitting is the priority (a smoking-cessation clinic can help), and build up to 150 minutes of moderate exercise a week.',
    'insight.risk.lifestyle.adviceMid': 'There is still room to improve: set a daily target of 8,000 steps and keep a regular daily rhythm.',
    'insight.risk.lifestyle.adviceGood': 'Your lifestyle is healthy — this is the highest-value change anyone can make, so keep it up.',

    /* ⑥ 家族史 */
    'insight.risk.family.name': 'Family history',
    'insight.risk.family.category': 'Hereditary',
    'insight.risk.family.noRisk.evidence': 'No clear hereditary risk is recorded in your family history. If a relative had cardiovascular disease, diabetes or cancer before the age of 55, add it — it directly changes when screening should start.',
    'insight.risk.family.noRisk.advice': 'A routine check-up once a year; after 40, add blood lipids, blood glucose and an ECG.',
    'insight.risk.family.evidenceItem': '{name} ({reason})',
    'insight.risk.family.evidenceMore': ' — {n} categories in total',
    'insight.risk.family.evidenceEarly': ' Among them is a relative whose condition began before age 55 — an early-onset family history, which means screening should start sooner.',
    'insight.risk.family.adviceTail': '. Tell your doctor about your family history — it is the reference point for what age screening should begin.',

    /* ⑦ 已确诊慢病 */
    'insight.risk.chronic.name': 'Diagnosed chronic conditions',
    'insight.risk.chronic.category': 'Medical history',
    'insight.risk.chronic.none.evidence': 'No chronic conditions needing long-term management are recorded.',
    'insight.risk.chronic.none.advice': 'Keep up a routine check-up once a year, and see a doctor promptly — and record it — if something persists.',
    'insight.risk.chronic.catCount': '{name} {n}',
    'insight.risk.chronic.evidence': '{n} conditions need long-term management ({cats}): {names}{more}. {active} of them are currently active.',
    'insight.risk.chronic.evidenceMore': ', among others',
    'insight.risk.chronic.advice': 'The point of chronic-disease care is long-term stable control, not a cure. Keep to the follow-up schedule your doctor set and record every result — only unbroken data shows whether the plan is working.',

    /* ⑧ 用药依从性 */
    'insight.risk.adherence.name': 'Medication adherence',
    'insight.risk.adherence.category': 'Medication',
    'insight.risk.adherence.none.evidence': 'There are no medication records yet.',
    'insight.risk.adherence.none.advice': 'If you take long-term medication, record the drug name, dose and start/end dates — then the system can check interactions and refill timing for you.',
    'insight.risk.adherence.evidence': '{n} medication records: {good} taken on time and in full, {fair} occasionally missed, {poor} often missed (regular-taking rate {rate}%). {inter}',
    'insight.risk.adherence.interNote': 'A further {k} drug interaction(s) were flagged as needing close attention.',
    'insight.risk.adherence.adviceHigh': 'Missed doses are the most common reason chronic-disease control fails. Use a pill organiser plus a phone alarm, and tie taking your medicine to a fixed action (after brushing your teeth, for example).',
    'insight.risk.adherence.adviceInter': 'Take the full list of everything you take (supplements included) to a doctor or pharmacist and have the interactions checked once.',
    'insight.risk.adherence.adviceGood': 'Medication adherence is good — keep it up.',

    /* ⑨ 随访依从性 */
    'insight.risk.followUp.name': 'Follow-up adherence',
    'insight.risk.followUp.category': 'Care & visits',
    'insight.risk.followUp.none.evidence': 'There is no chronic-disease follow-up plan requiring regular re-checks at the moment.',
    'insight.risk.followUp.none.advice': 'Once a condition needing long-term management is diagnosed, the system generates re-check reminders from its disease category automatically.',
    'insight.risk.followUp.evidence': '{n} follow-up plans in total — {overdue}{soon}.',
    'insight.risk.followUp.overdueItem': '{name} is {days} days overdue',
    'insight.risk.followUp.overdueNone': 'all are still within their window',
    'insight.risk.followUp.soonNote': ', and another {k} come due within 14 days',
    'insight.risk.followUp.adviceOverdue': 'An overdue re-check leaves your doctor unable to tell whether the current plan still works. Book it this week and bring the records from since your last visit.',
    'insight.risk.followUp.adviceOk': 'Keep to the planned appointment times so your results stay continuous.',

    /* 模型口径说明 */
    'insight.risk.model.name': 'PHR simple rule-based risk model',
    'insight.risk.model.note': 'This model is built from publicly available epidemiology and has not been validated in a population. It is not a clinical scoring tool such as Framingham, ASCVD or China-PAR, and must not be used to diagnose or guide treatment.',

    /* ---- 最容易改善的 3 件事 ---- */
    'insight.risk.improve.salt.title': 'Get daily salt under 6 g',
    'insight.risk.improve.salt.detail': 'Use half a spoon less salt and go easy on pickled and processed food — you usually see a change within 4–8 weeks.',
    'insight.risk.improve.salt.expected': 'Expect systolic to fall by 3–5 mmHg (your 30-day average is currently {avg} mmHg).',

    'insight.risk.improve.bpMonitor.title': 'Build up home blood-pressure monitoring: 7 days straight, morning and evening',
    'insight.risk.improve.bpMonitor.detail': 'Home readings predict cardiovascular risk better than clinic readings, and they are what doctors use to adjust medication.',
    'insight.risk.improve.bpMonitor.expected': 'After 7 days you will have a trustworthy average and morning-peak picture (you currently have only {n} readings).',

    'insight.risk.improve.weight.title': 'Lose {min}–{max} kg (5–10% of your current weight)',
    'insight.risk.improve.weight.detail': 'You do not need to reach an “ideal weight” — losing 5–10% already improves blood pressure, glucose and lipids markedly.',
    'insight.risk.improve.weight.expected': 'Expect systolic to fall 3–4 mmHg and fasting glucose 0.3–0.5 mmol/L.',

    'insight.risk.improve.steps.title': 'Raise your daily steps from {from} to {to}',
    'insight.risk.improve.steps.detail': 'Three brisk 10–15 minute walks are easier to keep up than one long one; getting off a stop earlier on your commute counts too.',
    'insight.risk.improve.steps.expected': 'Expect systolic to fall 3–5 mmHg within 3 months, plus better fasting glucose and sleep quality.',

    'insight.risk.improve.sleep.title': 'Get your sleep back above 7 hours',
    'insight.risk.improve.sleep.detail': 'A fixed wake-up time works better than a fixed bedtime; stay away from screens and caffeine for an hour before bed.',
    'insight.risk.improve.sleep.expected': 'Long-term short sleep pushes up blood pressure and glucose. Once it improves, morning blood pressure typically falls 2–4 mmHg (your 7-day average is {avg} hours).',

    'insight.risk.improve.quitSmoking.title': 'Make a quit-smoking plan',
    'insight.risk.improve.quitSmoking.detail': 'Quitting is the single highest-value change available: after a year, the risk of coronary heart disease roughly halves. A cessation clinic can offer medication and behavioural support.',
    'insight.risk.improve.quitSmoking.expected': 'Expect cardiovascular risk to fall markedly within a year, with blood pressure and heart rate improving alongside.',

    'insight.risk.improve.adherence.title': 'Get missed doses below 10%',
    'insight.risk.improve.adherence.detail': 'Use a pill organiser plus a phone alarm and tie taking your medicine to a fixed action; keep a spare dose in your bag for days out.',
    'insight.risk.improve.adherence.expected': 'Taking medication regularly is the foundation of chronic-disease control. Your current regular-taking rate is {rate}%.',

    'insight.risk.improve.followUp.title': 'Book the follow-up: {disease} is {days} days overdue',
    'insight.risk.improve.followUp.detail': 'Bring the results from last time and your recent vital-sign records — that is what lets a doctor judge whether the current plan is working.',
    'insight.risk.improve.followUp.expected': 'Re-checking on time prevents the situation where “the plan stopped working long ago but you are still taking it”.',

    'insight.risk.improve.carbSwap.title': 'Rework your staples: swap half the refined grain for wholegrains and beans',
    'insight.risk.improve.carbSwap.detail': 'Replace half of your white rice or noodles with brown rice, oats or mixed beans, and eat vegetables first and staples last.',
    'insight.risk.improve.carbSwap.expected': 'Expect fasting glucose to fall 0.3–0.6 mmol/L within 3 months (your current average is {avg} mmol/L).',

    'insight.risk.improve.satFat.title': 'Cut back on saturated fat',
    'insight.risk.improve.satFat.detail': 'Eat less organ meat, fatty meat, fried food and cream pastries; switch to vegetable oils and add more oily fish and nuts.',
    'insight.risk.improve.satFat.expected': 'Expect LDL-C to fall 0.3–0.5 mmol/L within 3–6 months (currently {value} mmol/L).',

    'insight.risk.improve.waist.title': 'Measure your waist once a week',
    'insight.risk.improve.waist.detail': 'Waist circumference is the most direct indicator of visceral fat and reflects metabolic risk better than weight does.',
    'insight.risk.improve.waist.expected': 'With aerobic exercise, your waist can come down 0.5–1 cm a month (currently {value} cm).',

    'insight.risk.improve.retest.title': 'Catch up on: {list}',
    'insight.risk.improve.retest.detail': 'When data stops, both trend analysis and the risk score lose accuracy.',
    'insight.risk.improve.retest.expected': 'Once these are filled in, the risk score and trend conclusions will sit much closer to reality.',

    'insight.risk.improve.keepGoing.title': 'Keep to your current recording rhythm',
    'insight.risk.improve.keepGoing.detail': 'All your metrics look good — just keep recording at a fixed frequency. Only continuous data reveals a change in time.',
    'insight.risk.improve.keepGoing.expected': 'Aim for blood pressure 2–3 times a week, weight once a week, and lipids and glucose every 3 months.',

    /* ================================================================== *
     * 七、预防建议（advice.js）—— 六组 / 24 条规则全覆盖
     * ================================================================== */
    /* 分组名（源码里的 group 名是内部 key，这里只作展示） */
    'insight.advice.group.visit': 'Seeing a doctor',
    'insight.advice.group.monitor': 'Monitoring',
    'insight.advice.group.med': 'Medication',
    'insight.advice.group.diet': 'Diet',
    'insight.advice.group.exercise': 'Exercise',
    'insight.advice.group.lifestyle': 'Lifestyle',

    /* 今日计划里每条动作的类别（kind） */
    'insight.advice.kind.visit': 'Doctor',
    'insight.advice.kind.med': 'Medication',
    'insight.advice.kind.exercise': 'Exercise',
    'insight.advice.kind.sleep': 'Sleep',
    'insight.advice.kind.monitor': 'Monitoring',
    'insight.advice.kind.lifestyle': 'Lifestyle',

    /* ---- 就医 ---- */
    'insight.advice.critical.title': 'See a doctor soon: “{metric}” is clearly abnormal',
    'insight.advice.critical.detail': '{title}. {detail} Take your recent records to the relevant department and do not adjust any medication on your own.',
    'insight.advice.overdue.title': 'Book the follow-up: {disease} is {days} days overdue',
    'insight.advice.overdue.detail': '{advice}. Bring the results from your last re-check and your recent vital-sign records — that is what lets a doctor judge whether the plan still works.',
    'insight.advice.overdue.evidence': '{n} follow-ups are overdue',
    'insight.advice.drugReview.title': 'Have a doctor or pharmacist review everything you are taking',
    'insight.advice.drugReview.evidence': '{n} drug interaction(s) flagged as needing close attention',

    /* ---- 监测 ---- */
    'insight.advice.bpMonitor.title': 'Home blood-pressure monitoring: 7 days straight, morning and evening',
    'insight.advice.bpMonitor.detail': 'Measure within an hour of waking, after emptying your bladder and before taking medication, having sat quietly for 5 minutes; then measure once more before bed. Note the time of each reading, and take the 7-day average to your doctor.',
    'insight.advice.bpMonitor.evidence': '30-day average systolic {avg} mmHg (≥130)',
    'insight.advice.bpOk.title': 'Blood pressure is on target: measuring 2–3 times a week is enough',
    'insight.advice.bpOk.detail': 'You do not need to measure daily, but keep to the same time of day and the same arm so the numbers stay comparable. If two readings in a row exceed 140/90 mmHg, book a visit.',
    'insight.advice.bpOk.evidence': '30-day average systolic {avg} mmHg (<130)',
    'insight.advice.glucoseMonitor.title': 'Glucose monitoring: 2–3 times a week, fasting and 2 hours after a meal',
    'insight.advice.glucoseMonitor.detail': 'Fasting readings alone miss post-meal spikes. Record the numbers together with what you ate — that makes it much easier to find the foods that push your glucose up.',
    'insight.advice.glucoseMonitor.evidence': '90-day average fasting glucose {avg} mmol/L{extra}',
    'insight.advice.glucoseMonitor.evidenceHba1c': ', HbA1c {value}%',
    'insight.advice.retest.title': 'Catch up on {n} metrics that have not been recorded for a while',
    'insight.advice.retest.detail': '{list} have gone more than 30 days without a record. Once the data stops, trend judgement and the risk score both lose accuracy.',
    'insight.advice.retest.evidence': '{n} metrics have no readings in the last 30 days',
    'insight.advice.familyPlan.title': 'Turn your family history into a concrete screening plan',
    'insight.advice.familyPlan.detail': '{list}. When a first-degree relative has an early-onset history (before 55), screening usually needs to start 5–10 years earlier.',
    'insight.advice.sleepApnea.title': 'Also note any snoring or daytime sleepiness',
    'insight.advice.sleepApnea.detail': 'If long-term short sleep comes with snoring, morning headaches or daytime drowsiness, it may point to sleep apnoea — which pushes blood pressure up noticeably and is worth a sleep study.',
    'insight.advice.sleepApnea.evidence': 'Sleep under 7 hours on most recent days',

    /* ---- 用药 ---- */
    'insight.advice.longTerm.title': 'Long-term medication: review with a doctor every 30 days',
    'insight.advice.longTerm.detail': 'The system found {n} long-term medications ({list}). Chronic-disease medication needs its dose reviewed periodically — it should not just be taken unchanged forever.',
    'insight.advice.longTerm.evidence': '{n} medications currently taken and marked as long-term',
    'insight.advice.adherence.title': 'Bring the missed-dose rate down: pill organiser + phone alarm',
    'insight.advice.adherence.detail': 'Missed doses are the most common reason chronic-disease control fails. Sort a week of pills into doses in advance, and tie taking them to a fixed action (after brushing your teeth, after breakfast).',
    'insight.advice.adherence.evidence': 'Regular-taking rate only {rate}% ({fair} occasionally missed, {poor} often missed)',
    'insight.advice.refill.title': 'Get the prescription early: {drug} is running out',
    'insight.advice.refill.detail': '{message} Book a visit or renew online 3–5 days before you run out, so you are never without it.',
    'insight.advice.refill.evidence': '{days} days left',

    /* ---- 饮食 ---- */
    'insight.advice.salt.title': 'Cut the salt: keep daily intake under 6 g',
    'insight.advice.salt.detail': 'Use less cooking salt and soy sauce, and go easy on pickles, sausages, instant noodles and takeaway; replace part of the salty taste with vinegar, lemon or spices.',
    'insight.advice.salt.evidence': '30-day average systolic {avg} mmHg; cutting salt usually brings it down 3–5 mmHg after 4–8 weeks',
    'insight.advice.carbs.title': 'Halve your staples and swap in wholegrains — vegetables first, staples last',
    'insight.advice.carbs.detail': 'Replace half your white rice or noodles with brown rice, oats or mixed beans; eat vegetables and protein first at each meal and staples last, and post-meal glucose will rise more gently.',
    'insight.advice.carbs.evidence': '90-day average fasting glucose {avg} mmol/L (normal upper limit 6.1)',
    'insight.advice.satFat.title': 'Cut back on saturated and trans fats',
    'insight.advice.satFat.detail': 'Eat less organ meat, fatty meat, fried food and cream pastries; switch to vegetable oils, have oily fish twice a week and a small handful of nuts a day.',
    'insight.advice.satFat.evidence': 'Latest LDL cholesterol {value} mmol/L (normal upper limit 3.4)',
    'insight.advice.calories.title': 'Watch total calories: smaller plates, soup before the main course',
    'insight.advice.calories.detail': 'You do not need to go hungry, but make “stop at eight-tenths full” a habit. Three days of food records will show you where the calories actually come from.',
    'insight.advice.calories.evidence': 'BMI {bmi} kg/m² (normal 18.5–23.9)',
    'insight.advice.purine.title': 'Limit purines and drink more water: over 2,000 ml a day',
    'insight.advice.purine.detail': 'Eat less organ meat, rich meat broth, shellfish and skip the beer; drinking more water helps your body clear uric acid.',
    'insight.advice.purine.evidence': 'Latest blood uric acid {value} μmol/L (normal upper limit 420)',

    /* ---- 运动 ---- */
    'insight.advice.stepsLow.title': 'Raise your daily steps from {from} to {to}',
    'insight.advice.stepsLow.detail': 'Three brisk 10–15 minute walks are easier to stick to: get off a stop earlier, walk a loop after lunch, take a stroll after dinner.',
    'insight.advice.stepsLow.evidence': 'Averaging {steps} steps a day over the last {n} days (aim for ≥6,000)',
    'insight.advice.stepsOk.title': 'Activity is on target — add a little resistance training',
    'insight.advice.stepsOk.detail': 'Twice a week, 20 minutes of resistance-band or bodyweight work (squats, wall push-ups) helps raise your resting metabolism and improve insulin sensitivity.',
    'insight.advice.stepsOk.evidence': 'Averaging {steps} steps a day over the last {n} days',
    'insight.advice.aerobic.title': '150 minutes of moderate aerobic exercise a week',
    'insight.advice.aerobic.detail': 'Brisk walking, swimming and cycling all count — the right intensity is “you can talk but you cannot sing”. If your blood pressure is high, avoid moves where you hold your breath and strain (heavy lifting, for example).',
    'insight.advice.aerobic.evidence': 'Regular aerobic exercise can bring systolic down 4–9 mmHg',

    /* ---- 生活方式 ---- */
    'insight.advice.sleep.title': 'Get your sleep back above 7 hours',
    'insight.advice.sleep.detail': 'A fixed wake-up time works better than a fixed bedtime; stay away from screens for the hour before bed and avoid caffeine after the afternoon. Long-term short sleep pushes up blood pressure and glucose and affects mood.',
    'insight.advice.sleep.evidence': 'Over the last {n} days you slept {avg} hours on average, with {low} days under 7 hours',
    'insight.advice.smoking.title': 'Quitting smoking is the highest-value change of all',
    'insight.advice.smoking.detail': 'A year after quitting, the risk of coronary heart disease roughly halves. A cessation clinic can offer medication and behavioural support; setting a specific quit date works better than “cutting down gradually”.',
    'insight.advice.smoking.evidence': 'Your basic profile records “currently smoking”',
    'insight.advice.drinking.title': 'Limit how much you drink',
    'insight.advice.drinking.detail': 'No more than 25 g of alcohol a day for men (about 750 ml of beer) and 15 g for women, with at least 2 alcohol-free days a week.',
    'insight.advice.drinking.evidence': 'Your basic profile records “drinks often”',
    'insight.advice.heartRate.title': 'Resting heart rate is on the fast side: start with sleep and exercise',
    'insight.advice.heartRate.detail': 'Regular aerobic exercise, enough sleep and less caffeine usually bring resting heart rate down 3–8 beats a minute. If it stays above 100 beats a minute even at rest, ask a cardiologist for an ECG.',
    'insight.advice.heartRate.evidence': '30-day average resting heart rate {avg} beats/min (normal 60–100)',

    /* ---- 今日健康计划 ---- */
    'insight.plan.doctor': 'Book a visit: “{metric}” needs a doctor\'s assessment',
    'insight.plan.medMissed': 'Take your medicine on time: do not miss today\'s after-meal doses',
    'insight.plan.medLongTerm': 'Take your long-term medication, including {drug}',
    'insight.plan.walk': 'Walk briskly for 30 minutes (about 3,000 steps), split into three if easier',
    'insight.plan.sleep': 'Put the phone down before 23:00 and get 7 hours tonight',
    'insight.plan.bp': 'Measure your blood pressure morning and evening and record it (after sitting quietly for 5 minutes)',
    'insight.plan.glucose': 'Record one fasting glucose reading, and note what you had for dinner the night before',
    'insight.plan.smoke': 'Smoke one cigarette fewer than yesterday, and note the situations where you crave one',
    'insight.plan.fallback': 'Record today\'s weight or blood pressure to keep the data continuous',

    /* ---- 本周小结 ---- */
    'insight.weekly.hlRecords': '{n} new health records this week, covering {types} record types.',
    'insight.weekly.hlNone': 'No new records this week — when the data stops, trend judgement loses its footing.',
    'insight.weekly.trendMismatch': '{metric} has been erratic over the last 90 days, {mag} — read it together with the chart.',
    'insight.weekly.trendGood': '{metric} has been trending {direction} over the last 90 days ({mag}) — the right direction.',
    'insight.weekly.trendBad': '{metric} has been trending {direction} over the last 90 days ({mag}) — worth watching.',
    'insight.weekly.overdue': '{n} follow-up(s) are overdue: {list}.',
    'insight.weekly.nextRetest': 'Catch up on: {list}.',
    'insight.weekly.nextKeep': 'Keep to your current recording rhythm and measure at fixed times.',
    'insight.weekly.text': 'This week ({from} – {to}) you recorded {n} health data points, and completed {done}/{total} of today\'s plan. {high}{concerns}',
    'insight.weekly.textHigh': '{n} metrics need priority attention. ',
    'insight.weekly.textCalm': 'Your metrics are broadly steady. ',
    'insight.weekly.textConcerns': 'See “Worth watching” below.',

    /* ================================================================== *
     * 八、五个页签的内容（insight.panels.js）—— 本模块最大的一块
     * ================================================================== */
    /* 时间范围切换 */
    'insight.range.30': 'Last 30 days',
    'insight.range.90': 'Last 90 days',
    'insight.range.365': 'Last year',
    'insight.range.all': 'All',

    /* 共用零件：记录一次 */
    'insight.panel.quickAdd.metricType': 'Metric',
    'insight.panel.quickAdd.measuredAt': 'Measured at',
    'insight.panel.quickAdd.value': 'Reading',
    'insight.panel.quickAdd.systolic': 'Systolic (upper)',
    'insight.panel.quickAdd.diastolic': 'Diastolic (lower)',
    'insight.panel.quickAdd.context': 'Measurement context',
    'insight.panel.quickAdd.contextPlaceholder': 'e.g. fasting on waking / after exercise / 2 hours after medication',
    'insight.panel.quickAdd.metricOption': '{name} ({unit})',
    'insight.panel.quickAdd.dialogTitle': 'Add a “{metric}” reading',
    'insight.panel.quickAdd.submit': 'Save reading',
    'insight.panel.quickAdd.saveFailed': 'Could not save — please check what you entered.',
    'insight.panel.quickAdd.savedTitle': 'Recorded: {metric}',

    /* 共用零件：告警卡片 */
    'insight.panel.alert.adviceLabel': 'Advice: ',
    'insight.panel.alert.record': 'Add a reading',
    'insight.panel.alert.doctor': 'Prepare for a visit',
    'insight.panel.alert.dismiss': 'Dismiss',
    'insight.panel.alert.dismissedToast': 'Alert dismissed — it will stay hidden for 30 days.',
    'insight.panel.alert.level.high': 'High priority',
    'insight.panel.alert.level.medium': 'Medium priority',
    'insight.panel.alert.level.low': 'Low priority',

    /* 共用零件：就医准备清单 */
    'insight.prep.noticeTitle': 'This checklist is not a diagnosis',
    'insight.prep.noticeBody': 'Its job is to lay out your recent health data in the form a doctor reads fastest. Show it, or read it out, at your appointment.',
    'insight.prep.basic': 'Basic information',
    'insight.prep.name': 'Name: {name}',
    'insight.prep.gender': 'Sex: {gender}',
    'insight.prep.age': 'Age: {age}',
    'insight.prep.bloodType': 'Blood type: {blood}',
    'insight.prep.noProfile': '(Basic profile not filled in yet)',
    'insight.prep.abnormal': 'Recent abnormal readings',
    'insight.prep.abnormalItem': '{date} · {metric} {value} {unit} ({level})',
    'insight.prep.alerts': 'Issues the doctor should look at',
    'insight.prep.alertItem': '{title}: {detail}',
    'insight.prep.meds': 'Current medications',
    'insight.prep.allergies': 'Known allergens',
    'insight.prep.allergyItem': '{allergen} ({severity})',
    'insight.prep.followUp': 'Items due for re-check',
    'insight.prep.followUpItem': '{disease}: {advice} ({days} days overdue)',
    'insight.prep.questions': 'Questions worth asking your doctor',
    'insight.prep.q1': 'Do I need to stay on my current medication? Does the dose need adjusting?',
    'insight.prep.q2': 'What do these trends mean? What else should I be tested for?',
    'insight.prep.q3': 'Across diet, exercise and sleep, which one change should I make first?',
    'insight.prep.footer': 'Generated by “{app}” on {at}. Everything here is self-reported and self-measured data and has not been verified by a medical institution.',
    'insight.prep.title': 'Visit preparation checklist',
    'insight.prep.close': 'Close',
    'insight.prep.copy': 'Copy as text',
    'insight.prep.copied': 'Checklist copied to the clipboard',
    'insight.prep.copyFailed': 'Copy failed — please select the text and copy it manually.',

    /* ---- 页签一：总览 ---- */
    'insight.panel.overview.riskCard': 'Health risk score',
    'insight.panel.overview.riskSub': 'Combined across {n} dimensions · higher is better',
    'insight.panel.overview.riskLevel': 'Risk level',
    'insight.panel.overview.riskDeduction': 'Total deduction',
    'insight.panel.overview.riskDeductionValue': '{n} pts',
    'insight.panel.overview.pending': 'Pending alerts',
    'insight.panel.overview.pendingValue': '{n}',
    'insight.panel.overview.viewFull': 'View the full assessment',
    'insight.panel.overview.improve3': 'The 3 easiest things to improve',
    'insight.panel.overview.improve3Sub': 'Sorted by benefit ÷ effort',
    'insight.panel.overview.plan': 'Today\'s health plan',
    'insight.panel.overview.planProgress': '{done} of {total} done',
    'insight.panel.overview.week': 'This week',
    'insight.panel.gauge.healthScore': 'Health score',
    'insight.panel.riskLevelBadge': '{level} risk',
    'insight.panel.plan.footer': 'Check marks are valid for today only and reset at midnight. Today: {done} of {total} done ({percent}%).',
    'insight.panel.week.highlights': '✅ Highlights',
    'insight.panel.week.concerns': '⚠️ Worth watching',
    'insight.panel.week.next': '🎯 For next week',

    /* ---- 页签二：指标趋势 ---- */
    'insight.panel.trend.showAll': 'Show all metrics',
    'insight.panel.trend.add': '＋ Add a reading',
    'insight.panel.trend.empty.title': 'No vital-sign records in this period',
    'insight.panel.trend.empty.hint': 'Try a different time range, or tap “Add a reading” to start building up data — 3 or more readings in a row and a trend becomes visible.',
    'insight.panel.trend.empty.action': 'Add a reading',
    'insight.panel.metricCard.ref': 'Normal range {range}',
    'insight.panel.metricCard.refCount': '{n} records (data coverage: {coverage})',
    'insight.panel.metricCard.refVolatility': 'fluctuation {value} {unit}',
    'insight.panel.metricCard.record': 'Add a reading',
    'insight.panel.metricCard.detail': 'View details',
    'insight.panel.metricCard.explain': 'What is this?',

    /* 「这是什么？」说明弹窗 */
    'insight.panel.explain.title': '{metric} · About this metric',
    'insight.panel.explain.what': 'What it measures',
    'insight.panel.explain.unit': 'Unit and precision',
    'insight.panel.explain.unitValue': '{unit}, rounded to {digits} decimal place(s)',
    'insight.panel.explain.normalRange': 'Normal range',
    'insight.panel.explain.warnRange': 'Warning range',
    'insight.panel.explain.target': 'Target',
    'insight.panel.explain.latest': 'Latest reading',
    'insight.panel.explain.advice': 'Graded advice',
    'insight.panel.explain.notDiagnosis': 'This is not a diagnosis',
    'insight.panel.explain.close': 'Close',
    'insight.panel.explain.record': 'Add a reading',

    /* ---- 页签三：异常提醒 ---- */
    'insight.panel.alerts.noticeTitle': 'Where do these alerts come from?',
    'insight.panel.alerts.noticeBody': 'The system ships with {count} kinds of detection rule — {rules}. Every time you open this page it re-scans all of your vital-sign data. Current alert sensitivity: {pref} (you can change it under Preferences).',
    'insight.panel.alerts.sensitivity.ok': 'all alerts',
    'insight.panel.alerts.sensitivity.warning': 'warning and above',
    'insight.panel.alerts.sensitivity.critical': 'critical only',
    'insight.panel.alerts.highSub': 'Deal with these soon',
    'insight.panel.alerts.highSubNone': 'No high-priority alerts',
    'insight.panel.alerts.mediumSub': 'Re-measure soon',
    'insight.panel.alerts.lowSub': 'For your information',
    'insight.panel.alerts.dismissed': 'Dismissed',
    'insight.panel.alerts.dismissedSub': 'Shown again automatically after 30 days',
    'insight.panel.alerts.empty.title': 'Nothing needs your attention right now',
    'insight.panel.alerts.empty.hint': 'Your metrics are all within their normal ranges. The system keeps monitoring and will flag repeated abnormal readings, fast changes or long gaps here.',
    'insight.panel.alerts.empty.action': 'Add a reading',
    'insight.panel.alerts.dismissedCard': 'Dismissed alerts',
    'insight.panel.alerts.restoreAll': 'Restore all',
    'insight.panel.alerts.dismissedNote': '{n} dismissed. A dismissed alert does not disappear — it is just hidden for now.',
    'insight.panel.alerts.restoredToast': 'All dismissed alerts restored',

    /* ---- 页签四：风险评估 ---- */
    'insight.panel.risk.dimensions': 'Dimensions included',
    'insight.panel.risk.dimensionsValue': '{n}',
    'insight.panel.risk.deductionValue': '{n} / {max} pts',
    'insight.panel.risk.byDimension': 'Score by dimension',
    'insight.panel.risk.byDimensionSub': 'Out of 100 — higher is better',
    'insight.panel.risk.basis': 'What each score is based on (tap to expand)',
    'insight.panel.risk.basisSub': 'Every conclusion is tied to real data',
    'insight.panel.risk.modelNotice': '⚠️ About the model: a simple rule-based model, not a clinical scoring tool',
    'insight.panel.risk.weight': 'Weight {w} pts · score {s}',
    'insight.panel.risk.basisLabel': 'Basis: ',
    'insight.panel.risk.adviceLabel': 'Advice: ',
    'insight.panel.risk.barUnit': 'pts',

    /* ---- 页签五：预防建议 ---- */
    'insight.panel.advice.noticeTitle': 'Why only these?',
    'insight.panel.advice.noticeBody': 'The system contains {count} advice rules in total, and only shows the ones your data actually triggers. So every item you see corresponds to a specific number in your records.',
    'insight.panel.advice.count': '{n}',
    'insight.panel.advice.empty.title': 'No advice needs flagging right now',
    'insight.panel.advice.empty.hint': 'That usually means your metrics all look good. Keep recording at a fixed frequency and advice will appear here automatically when something changes.',
    'insight.panel.advice.record': 'Record',
    'insight.panel.advice.evidence': 'Triggered by: ',

    /* ================================================================== *
     * 九、指标详情页（insight.detail.js）
     * ================================================================== */
    'insight.detail.nearDays': 'Last {days} days',
    'insight.detail.bandNote': 'Shaded bands are the normal / warning ranges; the dashed line is the target',
    'insight.detail.empty.title': 'No “{metric}” readings yet',
    'insight.detail.empty.hint': 'Record 3 or more and the system can draw the trend and tell you which way it is going.',
    'insight.detail.empty.action': 'Add a reading',
    'insight.detail.trendAnalysis': 'Trend analysis',
    'insight.detail.changeDirection': 'Direction',
    'insight.detail.dirGood': ' (right direction)',
    'insight.detail.dirBad': ' (wrong direction)',
    'insight.detail.speed': 'Rate',
    'insight.detail.speedValue': 'About {value} {unit} per month',
    'insight.detail.stability': 'Stability',
    'insight.detail.stabilityValue': '{name} (fluctuation {value} {unit})',
    'insight.detail.r2': 'Goodness of fit',
    'insight.detail.r2Hint': 'The closer to 1, the more the data follows a straight line',
    'insight.detail.sample': 'Sample size',
    'insight.detail.sampleValue': '{n} readings (data coverage: {coverage})',
    'insight.detail.compare': 'Two periods compared',
    'insight.detail.compareSub': 'Last 30 days vs the 30 days before',
    'insight.detail.changePoints': 'Notable turning points ({n})',
    'insight.detail.changePointNote': 'The rule: a change between two neighbouring readings of more than 2 standard deviations. Spots like these often line up with life events — changing medication, starting to exercise — so it is worth thinking back.',
    'insight.detail.noChangePoints': 'No significant turning point was detected in this period; the data changes fairly continuously.',
    'insight.detail.meaning': 'What this metric tells you',
    'insight.detail.meaningLabel': 'What it means',
    'insight.detail.normalRange': 'Normal range',
    'insight.detail.warnRange': 'Warning range',
    'insight.detail.target': 'Target',
    'insight.detail.latest': 'Latest reading',
    'insight.detail.latestAdvice': 'Advice for that reading',
    'insight.detail.refMeasure': 'How it is usually measured',
    'insight.detail.history': 'Full history',
    'insight.detail.historySub': '{n} in total — tap any row to edit',
    'insight.detail.stat.latest': 'Latest',
    'insight.detail.stat.avg': 'Average',
    'insight.detail.stat.maxmin': 'Highest / lowest',
    'insight.detail.stat.inRange': 'In-range rate',
    'insight.detail.stat.volatility': 'Fluctuation',
    'insight.detail.stat.count': 'Readings',
    'insight.detail.stat.countUnit': '',
    'insight.detail.alertEmpty': 'No alerts for this metric right now',
    'insight.detail.alertEmptyHint': 'The system keeps scanning and will show repeated abnormal readings, fast changes or a worsening trend here.',
    'insight.detail.alerts': 'Alerts for this metric',
    'insight.detail.alertsCount': '{n} in total',
    'insight.detail.disclaimer': '⚠️ Disclaimer',
    'insight.detail.notDiagnosis': 'This is not a diagnosis',
    'insight.detail.table.measuredAt': 'Measured at',
    'insight.detail.table.value': 'Reading',
    'insight.detail.table.level': 'Result',
    'insight.detail.table.context': 'Context and notes',
    'insight.detail.table.ops': 'Actions',
    'insight.detail.table.edit': 'Edit',
    'insight.detail.table.empty': 'No records yet',
    'insight.detail.way.home': 'Home measurement',
    'insight.detail.way.clinic': 'Clinic measurement',
    'insight.detail.way.device': 'Wearable device'

  });

})(window.PHR);
