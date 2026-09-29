/**
 * ============================================================================
 * 文件：core/i18n/en-US.assessment.js
 * 层：核心基础设施层（国际化 · 英文词条 · 心理测评模块）
 * 职责：注册**心理测评模块（模块 9）**的英文词条。
 *
 *      为什么单独一个文件：这个模块的文案量最大（量表名与分级、选项标签、
 *      应对策略池、危机提示、报告全文），和公共词条混在一起会难以维护。
 *      register() 会把各分片合并，加载顺序无关；
 *      与 core/i18n/en-US.js 里的同名键以本文件为准（后注册覆盖）。
 *
 *  ┌─ 键名规则（与代码里的取词点一一对应） ────────────────────────────┐
 *  │ assessment.opt.<选项组>.<分值>          选项标签（作答页的按钮）    │
 *  │ assessment.topic.<主题>                 主题名                      │
 *  │ assessment.scale.<量表key>.name/.shortName/.desc/.intro/.source    │
 *  │ assessment.scale.<量表key>.level.<分级key>.name/.summary           │
 *  │ assessment.scale.<量表key>.dim.<维度key>                           │
 *  │ assessment.scale.<量表key>.item.<题号>.note                        │
 *  │ assessment.scale.<量表key>.crisisdim.<维度key>.<阈值>              │
 *  │ assessment.coping.pool.<强度>.<时段>.<序号>.title/.detail          │
 *  │ assessment.coping.tip.<量表key>.<时段>.<序号>.title/.detail        │
 *  │ assessment.coping.dim.<量表key>.<维度key>                          │
 *  │ assessment.crisis.res.<资源id>.name/.desc/.num.<序号>              │
 *  │ 其余为页面与报告文案，按视图分组见下方小标题                        │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ **本文件不翻译量表题目**（PHQ-9 等 scale.items[].text）。
 *    题目是公开发表量表的原文，换语言等于换掉量表的效度依据，
 *    需要专业翻译与版本验证，不在本次范围内。英文界面下题目仍显示中文原文，
 *    这是刻意的取舍，不是遗漏。
 *
 * ⚠️ 心理文案的三条底线（翻译时不能破）：
 *    1. **不贴标签**：写 "falls in the moderate range"，绝不写 "you have depression"。
 *    2. **分级只用描述性词汇**：Mild / Moderate / Moderately severe / Severe，
 *       不暗示诊断。
 *    3. **危机措辞克制准确**：不制造恐慌、不写 "you are at risk"，
 *       只说清问卷的边界 —— "this questionnaire cannot tell whether you are
 *       in danger, but you don't have to carry this alone."
 *    凡是中文写了"不构成诊断"的地方，英文都必须把语义译出来。
 *
 * 依赖：core/i18n/i18n.js（register）
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    /* ================================================================== *
     * 一、模块与页面
     * ================================================================== */
    'module.assessment.title': 'Mental Health',
    'module.assessment.desc': 'Self-assessment across several topics, with banded reports and coping strategies you can act on',
    'assessment.warn.overviewReadFail': 'Failed to read assessment overview',

    'assessment.page.desc': 'Take a self-assessment built on published scales, see how things have been lately, and get coping suggestions you can start on today.',
    'assessment.page.introBody': 'This page collects {n} published psychological scales, grouped into five topics (screening, mood, sleep, stress, positive wellbeing). Each takes 1–3 minutes. A high score **does not mean** you are ill, and a normal score **does not rule out** a problem. Every result **stays on this device and is visible only to you** — it never enters your health records, never appears in search, and never feeds into the health insight risk score.',
    'assessment.notLoaded': 'The mental health module is not loaded. Check that the scripts under modules/assessment are included correctly.',

    'assessment.recordsSub': '{n} in total — click any row to open the full report',
    'assessment.trendSub': 'A change is only visible once you have taken the same scale twice',
    'assessment.trendEmpty': 'Nothing to chart yet',
    'assessment.trendEmptyHint': 'Once you complete any scale, its change over time is drawn here.',
    'assessment.trendNeed2': 'Take it twice to see a change',
    'assessment.trendNeed2Hint': '“{name}” has been taken {n} time(s) so far — one more and a trend appears.',
    'assessment.trendAria': 'Trend of the {name} total score',
    'assessment.trendChartEmpty': 'No records available for this scale yet.',
    'assessment.trendStats': '{count} assessments　lowest {best}　highest {worst}　average {avg} (out of {max})',
    'assessment.unit.score': 'pts',
    'assessment.scaleCount': '{n} scales',
    'assessment.backToCatalog': 'Back to Mental Health',

    'assessment.emptyRecords': 'No assessments yet',
    'assessment.emptyRecordsHint': 'Pick one from the catalogue above to get started — it will show up here automatically.',
    'assessment.col.scale': 'Scale',
    'assessment.col.total': 'Score',
    'assessment.col.level': 'Band',
    'assessment.col.time': 'Taken at',
    'assessment.col.ops': 'Actions',
    'assessment.viewReport': 'View report',
    'assessment.recordGone': 'This record no longer exists — it may have been deleted.',
    'assessment.confirmDeleteTitle': 'Delete this assessment record',
    'assessment.confirmDelete': 'Delete “{name}” ({date})?',
    'assessment.confirmDeleteDetail': 'This cannot be undone. Mental health assessments are stored only on this device and are not included in your backups — please be careful.',
    'assessment.deleted': 'Deleted',
    'assessment.deleteFailed': 'Delete failed',
    'assessment.exported': 'Exported: {name}',
    'assessment.exportFailed': 'Export failed — check whether your browser blocked the download.',

    /* ================================================================== *
     * 二、主题与选项标签（选项标签必须翻，否则英文用户没法作答）
     * ================================================================== */
    'assessment.topic.screen': 'Screening',
    'assessment.topic.mood': 'Mood',
    'assessment.topic.sleep': 'Sleep',
    'assessment.topic.stress': 'Stress',
    'assessment.topic.positive': 'Positive wellbeing',

    /* PHQ-9 / GAD-7 / 快速筛查：最近两周的出现频率 */
    'assessment.opt.freq4.0': 'Not at all',
    'assessment.opt.freq4.1': 'Several days',
    'assessment.opt.freq4.2': 'More than half the days',
    'assessment.opt.freq4.3': 'Nearly every day',

    /* ISI 严重程度 */
    'assessment.opt.isi5.0': 'None',
    'assessment.opt.isi5.1': 'Mild',
    'assessment.opt.isi5.2': 'Moderate',
    'assessment.opt.isi5.3': 'Severe',
    'assessment.opt.isi5.4': 'Very severe',

    /* ISI 第 4 题：对睡眠的满意程度 */
    'assessment.opt.satisfy5.0': 'Very satisfied',
    'assessment.opt.satisfy5.1': 'Satisfied',
    'assessment.opt.satisfy5.2': 'Neutral',
    'assessment.opt.satisfy5.3': 'Dissatisfied',
    'assessment.opt.satisfy5.4': 'Very dissatisfied',

    /* PSS-10 发生频率 */
    'assessment.opt.pss5.0': 'Never',
    'assessment.opt.pss5.1': 'Almost never',
    'assessment.opt.pss5.2': 'Sometimes',
    'assessment.opt.pss5.3': 'Fairly often',
    'assessment.opt.pss5.4': 'Very often',

    /* WHO-5 幸福感频率 */
    'assessment.opt.who6.5': 'All of the time',
    'assessment.opt.who6.4': 'Most of the time',
    'assessment.opt.who6.3': 'More than half of the time',
    'assessment.opt.who6.2': 'Less than half of the time',
    'assessment.opt.who6.1': 'Once in a while',
    'assessment.opt.who6.0': 'Never',

    /* CD-RISC-10 符合程度 */
    'assessment.opt.cd5.0': 'Not true at all',
    'assessment.opt.cd5.1': 'Rarely true',
    'assessment.opt.cd5.2': 'Sometimes true',
    'assessment.opt.cd5.3': 'Often true',
    'assessment.opt.cd5.4': 'True nearly all the time',

    /* ================================================================== *
     * 三、量表定义（scales.js）—— 名 / 简介 / 来源
     *     ⚠️ 题目（items[].text）不在这里，也不翻译，理由见文件头。
     * ================================================================== */

    /* ---------- PHQ-9 抑郁情绪 ---------- */
    'assessment.scale.phq9.name': 'Depression self-assessment',
    'assessment.scale.phq9.shortName': 'Depression',
    'assessment.scale.phq9.desc': 'Over the past two weeks, how many days have you been bothered by each of the following?',
    'assessment.scale.phq9.intro': 'This questionnaire asks about the **past two weeks**. Answer according to how often things actually happened — do not pick the answer that “looks normal”. Honest answers are the only ones that tell you anything.',
    'assessment.scale.phq9.source': 'PHQ-9 (Kroenke et al., 2001)',
    'assessment.scale.phq9.level.none.name': 'No notable indication',
    'assessment.scale.phq9.level.none.summary': 'This self-assessment did not indicate notable depressive symptoms.',
    'assessment.scale.phq9.level.mild.name': 'Mild',
    'assessment.scale.phq9.level.mild.summary': 'Some depression-related feelings are present, at a mild level.',
    'assessment.scale.phq9.level.moderate.name': 'Moderate',
    'assessment.scale.phq9.level.moderate.summary': 'Depression-related feelings are fairly noticeable and worth taking seriously.',
    'assessment.scale.phq9.level.moderately_severe.name': 'Moderately severe',
    'assessment.scale.phq9.level.moderately_severe.summary': 'The symptom burden is fairly heavy; a professional assessment soon is recommended.',
    'assessment.scale.phq9.level.severe.name': 'Severe',
    'assessment.scale.phq9.level.severe.summary': 'The symptom burden is heavy; seeing a professional promptly is strongly recommended.',
    'assessment.scale.phq9.dim.mood': 'Core mood',
    'assessment.scale.phq9.dim.body': 'Body and energy',
    'assessment.scale.phq9.dim.mind': 'Thinking and self-view',
    'assessment.scale.phq9.dim.risk': 'Warning signs',
    'assessment.scale.phq9.crisisNote': 'At a total of 20 or above, depressive symptoms are usually already affecting daily life noticeably.',

    /* ---------- GAD-7 焦虑水平 ---------- */
    'assessment.scale.gad7.name': 'Anxiety self-assessment',
    'assessment.scale.gad7.shortName': 'Anxiety',
    'assessment.scale.gad7.desc': 'Over the past two weeks, how many days have you been bothered by each of the following?',
    'assessment.scale.gad7.intro': 'This one also asks about the **past two weeks**. Anxiety and worry are experiences everyone has — what this questionnaire looks at is the degree, and how much it affects your life, not whether it exists at all.',
    'assessment.scale.gad7.source': 'GAD-7 (Spitzer et al., 2006)',
    'assessment.scale.gad7.level.none.name': 'No notable indication',
    'assessment.scale.gad7.level.none.summary': 'This self-assessment did not indicate notable anxiety symptoms.',
    'assessment.scale.gad7.level.mild.name': 'Mild',
    'assessment.scale.gad7.level.mild.summary': 'Some anxious feelings are present, at a mild level.',
    'assessment.scale.gad7.level.moderate.name': 'Moderate',
    'assessment.scale.gad7.level.moderate.summary': 'Anxious feelings are fairly noticeable and may affect sleep and concentration.',
    'assessment.scale.gad7.level.severe.name': 'Severe',
    'assessment.scale.gad7.level.severe.summary': 'The level of anxiety is fairly high; a professional assessment soon is recommended.',
    'assessment.scale.gad7.dim.tension': 'Tension and worry',
    'assessment.scale.gad7.dim.relax': 'Difficulty relaxing and restlessness',
    'assessment.scale.gad7.dim.irritable': 'Irritability and fear',

    /* ---------- ISI 睡眠状况 ---------- */
    'assessment.scale.isi.name': 'Sleep self-assessment',
    'assessment.scale.isi.shortName': 'Sleep',
    'assessment.scale.isi.desc': 'How severe your sleep difficulties have been over the past two weeks, and how much they affect your days.',
    'assessment.scale.isi.intro': 'Sleep problems are often the first thing to appear and the easiest to improve. Answer for how things have actually been over the **past two weeks**.',
    'assessment.scale.isi.source': 'Insomnia Severity Index (Bastien et al., 2001)',
    'assessment.scale.isi.level.none.name': 'No notable indication',
    'assessment.scale.isi.level.none.summary': 'Sleep is within the normal range, with no clinically meaningful insomnia.',
    'assessment.scale.isi.level.subclinical.name': 'Subthreshold',
    'assessment.scale.isi.level.subclinical.summary': 'There is mild sleep disturbance — worth watching, but usually not a cause for concern.',
    'assessment.scale.isi.level.moderate.name': 'Moderate',
    'assessment.scale.isi.level.moderate.summary': 'Sleep problems are fairly noticeable; behavioural changes are worth trying, and seeing a doctor if needed.',
    'assessment.scale.isi.level.severe.name': 'Severe',
    'assessment.scale.isi.level.severe.summary': 'The sleep problem is severe; a sleep clinic or mental health service is recommended soon.',
    'assessment.scale.isi.dim.onset': 'Falling and staying asleep',
    'assessment.scale.isi.dim.impact': 'Daytime impact',
    'assessment.scale.isi.dim.worry': 'Satisfaction and worry',
    'assessment.scale.isi.item.4.note': 'The options here run in the opposite direction to the other items (the more satisfied you are, the lower the score)',

    /* ---------- PSS-10 压力感知 ---------- */
    'assessment.scale.pss10.name': 'Perceived stress self-assessment',
    'assessment.scale.pss10.shortName': 'Stress',
    'assessment.scale.pss10.desc': 'How you have subjectively felt about the stress in your life over the past month.',
    'assessment.scale.pss10.intro': 'This questionnaire does not ask how much happened to you, but how out of control you felt. Answer for how things have actually been over the **past month**.',
    'assessment.scale.pss10.source': 'PSS-10 Perceived Stress Scale (Cohen et al., 1983)',
    'assessment.scale.pss10.level.low.name': 'Lower stress',
    'assessment.scale.pss10.level.low.summary': 'The stress you perceive is at a lower level.',
    'assessment.scale.pss10.level.moderate.name': 'Moderate stress',
    'assessment.scale.pss10.level.moderate.summary': 'There is some stress, within the range most people experience.',
    'assessment.scale.pss10.level.high.name': 'Higher stress',
    'assessment.scale.pss10.level.high.summary': 'The stress you perceive is on the high side; staying at this level for a long time drains mental and physical resources.',
    'assessment.scale.pss10.cutoffNote': 'PSS-10 has no accepted clinical cut-off. The three bands above are simply score ranges to make reading easier; they do not represent clinical severity.',
    'assessment.scale.pss10.dim.helpless': 'Loss of control and helplessness',
    'assessment.scale.pss10.dim.mastery': 'Sense of control (reverse-scored)',
    'assessment.scale.pss10.item.4.note': 'Reverse-scored item: the more confident you feel, the lower the score',

    /* ---------- WHO-5 主观幸福感 ---------- */
    'assessment.scale.who5.name': 'Wellbeing self-assessment',
    'assessment.scale.who5.shortName': 'Wellbeing',
    'assessment.scale.who5.desc': 'Over the past two weeks, which option best describes how you have generally been.',
    'assessment.scale.who5.intro': 'This is a **positively worded** questionnaire: it asks how much of the time good states were present. The raw score is multiplied by 4 to give a 0–100 scale.',
    'assessment.scale.who5.source': 'WHO-5 Well-Being Index (WHO Regional Office for Europe, 1998)',
    'assessment.scale.who5.level.very_low.name': 'Markedly low',
    'assessment.scale.who5.level.very_low.summary': 'Wellbeing is markedly low; screening suggests it may be worth assessing for depressive mood.',
    'assessment.scale.who5.level.low.name': 'Low',
    'assessment.scale.who5.level.low.summary': 'Wellbeing is below the general level and worth paying attention to.',
    'assessment.scale.who5.level.medium.name': 'Average',
    'assessment.scale.who5.level.medium.summary': 'Wellbeing is at a moderate level.',
    'assessment.scale.who5.level.good.name': 'Good',
    'assessment.scale.who5.level.good.summary': 'Wellbeing is at a good level.',
    'assessment.scale.who5.dim.positive': 'Positive states',
    'assessment.scale.who5.crisisNote': 'When WHO-5 is below 28 (on the 0–100 scale), international practice is to suggest a further depression assessment.',

    /* ---------- CD-RISC-10 心理韧性 ---------- */
    'assessment.scale.cdrisc10.name': 'Resilience self-assessment',
    'assessment.scale.cdrisc10.shortName': 'Resilience',
    'assessment.scale.cdrisc10.desc': 'How you usually respond when facing pressure and difficulty.',
    'assessment.scale.cdrisc10.intro': 'Resilience is not a fixed personality trait — it is a capacity that can be practised. This questionnaire helps you see the resources you **already have**.',
    'assessment.scale.cdrisc10.source': 'CD-RISC-10 (Campbell-Sills & Stein, 2007)',
    'assessment.scale.cdrisc10.level.low.name': 'Fewer resources available',
    'assessment.scale.cdrisc10.level.low.summary': 'Fewer psychological resources are available right now. This is usually linked to a high stress level, and it can be improved with practice.',
    'assessment.scale.cdrisc10.level.medium.name': 'Moderate resources',
    'assessment.scale.cdrisc10.level.medium.summary': 'There are some coping resources to draw on, with room to build more.',
    'assessment.scale.cdrisc10.level.high.name': 'Relatively good resources',
    'assessment.scale.cdrisc10.level.high.summary': 'There is relatively good resilience here, which is a very important protective factor.',
    'assessment.scale.cdrisc10.cutoffNote': 'CD-RISC-10 has no clinical cut-off. Only the score and a descriptive note are shown here; it is not an evaluation or a diagnosis.',
    'assessment.scale.cdrisc10.dim.tough': 'Hardiness',
    'assessment.scale.cdrisc10.dim.adapt': 'Adapting and focusing',

    /* ---------- 快速筛查 ---------- */
    'assessment.scale.quick.name': 'Quick mental health screen',
    'assessment.scale.quick.shortName': 'Quick screen',
    'assessment.scale.quick.desc': 'Only 5 questions, about a minute. It helps decide whether a fuller assessment is worth doing.',
    'assessment.scale.quick.intro': 'If you are not sure which questionnaire to start with, begin here. It combines the **core items** of several standard scales; if the score is on the high side, the system will suggest the matching full assessment.',
    'assessment.scale.quick.source': 'PHQ-2 + GAD-2 (two-item short forms) + one sleep item',
    'assessment.scale.quick.level.none.name': 'No notable indication',
    'assessment.scale.quick.level.none.summary': 'The core items scored very low — there is no need for a fuller assessment right now.',
    'assessment.scale.quick.level.mild.name': 'Further assessment suggested',
    'assessment.scale.quick.level.mild.summary': 'One or two items scored high enough that taking the matching full scale would give a clearer picture.',
    'assessment.scale.quick.level.high.name': 'Worth attention soon',
    'assessment.scale.quick.level.high.summary': 'Several core items scored high. Completing the full assessment soon, and considering talking to a professional, is recommended.',
    'assessment.scale.quick.level.very_high.name': 'Professional assessment strongly advised',
    'assessment.scale.quick.level.very_high.summary': 'The core items scored high across the board; seeking a professional assessment promptly is strongly recommended.',
    'assessment.scale.quick.dim.dep': 'Core depression items',
    'assessment.scale.quick.dim.anx': 'Core anxiety items',
    'assessment.scale.quick.dim.sleep': 'Sleep item',
    'assessment.scale.quick.crisisdim.dep.6': 'The core depression items (PHQ-2) scored the maximum',
    'assessment.scale.quick.crisisdim.dep.4': 'The core depression items scored on the high side',
    'assessment.scale.quick.crisisdim.anx.6': 'The core anxiety items (GAD-2) scored the maximum',
    'assessment.scale.quick.crisisdim.anx.4': 'The core anxiety items scored on the high side',

    /* ================================================================== *
     * 四、作答页（assessment-take.view.js）
     * ================================================================== */
    'assessment.take.noScaleTitle': 'This scale could not be found',
    'assessment.take.noScaleHint': 'The scale identifier “{key}” in the address is not in this system’s scale list.',
    'assessment.take.consentTitle': 'Before you begin — four things worth a minute',
    'assessment.take.consent1': '<b>This is a screening tool, not a diagnosis.</b> A high screening score does not mean you are ill, and a normal score does not rule a problem out. Any conclusion has to be drawn by a psychiatrist or psychotherapist together with an interview and your history.',
    'assessment.take.consent2': '<b>Results are stored only on this device, and only you can see them.</b> Assessments are not written into your health records, cannot be found by search, and do not feed into other modules’ risk scoring. One caveat: if this computer is shared, someone else could open this page and see them.',
    'assessment.take.consent3': '<b>Honest answers are the only useful ones.</b> Answer according to how things have actually felt <b>for you</b> lately — do not pick the answer that “looks normal”, because a score built that way will not help you at all.',
    'assessment.take.consent4': '<b>If thoughts of harming yourself come up in your answers, the system will show you helplines.</b> That is not alarmism — it is so that anyone who needs a number finds it within reach.',
    'assessment.take.formDesc': 'Answer according to how things have actually been lately',
    'assessment.take.noCutoffTitle': 'This scale has no clinical cut-off',
    'assessment.take.noCutoffBody': 'This scale has no accepted clinical cut-off. The score is for self-observation only and does not indicate severity.',
    'assessment.take.submit': '✅ Submit and view report',
    'assessment.take.exit': '💾 Exit and save draft',
    'assessment.take.exitHint': 'You can leave halfway through. Your answers are kept as a draft on this device — come back and carry on whenever you like.',
    'assessment.take.answered': 'Answered',
    'assessment.take.unanswered': 'Not answered',
    'assessment.take.draftSavedAt': 'Draft saved automatically · {time}',
    'assessment.take.missing': '{n} question(s) still unanswered',
    'assessment.take.missingTitle': 'Please finish before submitting',
    'assessment.take.missingDetail': 'Moved to question {n}.',
    'assessment.take.submitFail': 'Submission failed — please try again in a moment.',
    'assessment.take.done': 'Assessment completed — your report is ready.',
    'assessment.take.gotIt': 'I understand',
    'assessment.take.draftKept': 'Draft saved — continue from here next time.',
    'assessment.take.aboutScale': 'About “{name}”',
    'assessment.take.statItems': 'Questions',
    'assessment.take.statTime': 'Estimated time',
    'assessment.take.statTopic': 'Topic',
    'assessment.take.statDirection': 'Scoring direction',
    'assessment.take.higherBetter': 'Higher scores are better',
    'assessment.take.lowerBetter': 'Lower scores are better',
    'assessment.take.backToCatalog': 'Back to the scale catalogue',

    /* ================================================================== *
     * 五、报告页与报告正文（assessment-report.view.js / report.js）
     * ================================================================== */
    'assessment.report.notFoundHint': 'It may have been deleted, or this address may not belong to the account currently signed in.',
    'assessment.report.headMeta': 'Taken {at}　·　{source}　·　{n} questions',
    'assessment.report.exportHint': 'The exported file is saved on your own computer — nothing is uploaded. The conclusions in the report are screening prompts, not a diagnosis.',
    'assessment.report.deleteDetail': 'This cannot be undone. The report exists only on this device — deleting it leaves no copy behind.',
    'assessment.report.auditView': 'Viewed a mental health assessment report ({total} / {max} points, {level})',

    'assessment.report.ofMax': ' / {max} points',
    'assessment.report.scoreUnit': ' points',
    'assessment.report.raw': 'Raw score {raw}',
    'assessment.report.howToRead': '📌 How to read this result',
    'assessment.report.read1': 'The score reflects <strong>how you were when you took it</strong> — feelings naturally fluctuate.',
    'assessment.report.read2': 'A screening scale measures how often symptoms occurred; <strong>that is not a diagnosis</strong>.',
    'assessment.report.read3': 'A high score on one item does not say what kind of person you are — only that some feelings were more frequent lately.',
    'assessment.report.readNoCutoff': 'This scale <strong>has no accepted clinical cut-off</strong>. The bands above are there for readability — please do not read them as severity.',
    'assessment.report.readSource': 'The bands come from the cut-offs published for this scale ({source}).',
    'assessment.report.nextTitle': '🔎 Suggested next step',
    'assessment.report.nextHint': 'This quick screen used only the core items — the full scale gives a clearer picture.',
    'assessment.report.aboutMinutes': 'about {n} min',
    'assessment.report.itemsCount': '{n} items',
    'assessment.report.colItem': 'Item',
    'assessment.report.colChoice': 'Your answer',
    'assessment.report.colScore': 'Score',
    'assessment.report.reverse': 'Reverse-scored',
    'assessment.report.criticalItem': 'Key item',
    'assessment.report.sourceLine': 'Scale source: {source}',
    'assessment.report.timeLine': '　·　Taken: {at}',
    'assessment.report.comma': ', ',
    'assessment.report.good': 'Looking good',
    'assessment.report.attention': 'Worth attention',
    'assessment.report.summaryLine': ': {total} / {max} points　',

    /* ---------- 纯文本导出 / 打印 ---------- */
    'assessment.txt.title': 'Mental health assessment report · {name}',
    'assessment.txt.at': 'Taken: {at}',
    'assessment.txt.total': 'Total: {total} / {max} ({level})',
    'assessment.txt.raw': 'Raw score: {raw} (converted to a 0–100 scale by ×4)',
    'assessment.txt.note': 'Note: {note}',
    'assessment.txt.breakdown': '[ Score breakdown ]',
    'assessment.txt.dimLine': '  {name}: {score} / {max} ({percent}%)',
    'assessment.txt.crisis': '[ Important ]',
    'assessment.txt.channels': '  Where to get help:',
    'assessment.txt.channelLine': '    {name}: {numbers}',
    'assessment.txt.coping': '[ Coping strategies ]',
    'assessment.txt.groupPro': 'Do this soon',
    'assessment.txt.groupNow': 'Can do today',
    'assessment.txt.groupWeek': 'Plan for this week',
    'assessment.txt.adviceLine': '    · {title}: {detail}',
    'assessment.txt.footer1': 'This assessment is a self-rated screening tool, not a diagnostic one.',
    'assessment.txt.footer2': 'A high screening score does not mean you are ill, and a normal score does not rule a problem out.',
    'assessment.txt.footer3': 'Any conclusion must be drawn by a qualified professional together with an interview and your history.',
    'assessment.txt.source': 'Scale source: {source}',
    'assessment.txt.filePrefix': 'assessment_report_',

    /* ================================================================== *
     * 六、计分引擎的句子（scoring.js）
     * ================================================================== */
    'assessment.scoring.unanswered': 'Not answered',
    'assessment.scoring.noScale': 'Scale not found',
    'assessment.scoring.missing': '{n} question(s) not answered yet',
    'assessment.scoring.scoreWord': 'Score',
    'assessment.scoring.cmpFlat': 'Roughly unchanged from last time ({from} → {to})',
    'assessment.scoring.cmpBetter': '{name} went from {from} to {to} ({delta}), moving in a good direction',
    'assessment.scoring.cmpWorse': '{name} went from {from} to {to} ({delta}) — worth keeping an eye on',
    'assessment.scoring.trendNeed2': 'Take the same scale at least twice before a trend means anything.',
    'assessment.scoring.recommend': '“{name}” scored {score} (≥ {when}) — taking the full scale is recommended',

    /* ================================================================== *
     * 七、应对策略库（coping.js）
     *     规则：具体、可执行、不写空话；重度档第一条永远是"联系专业人员"。
     * ================================================================== */

    /* ---------- 通用策略池 · 状态平稳 ---------- */
    'assessment.coping.pool.none.immediate.0.title': 'Keep your current daily rhythm',
    'assessment.coping.pool.none.immediate.0.detail': 'Fixed times for going to bed and getting up are the least effortful protection for your mental state.',
    'assessment.coping.pool.none.immediate.1.title': 'Give your feelings an outlet',
    'assessment.coping.pool.none.immediate.1.detail': 'Talk with someone you trust once a week. It does not have to be about problems — anything will do.',
    'assessment.coping.pool.none.weekly.0.title': 'A 30-minute brisk walk, three times a week',
    'assessment.coping.pool.none.weekly.0.detail': 'Regular aerobic exercise has fairly consistent evidence for improving mood — it helps more than “getting more rest”.',
    'assessment.coping.pool.none.weekly.1.title': 'Note one small thing that went well today',
    'assessment.coping.pool.none.weekly.1.detail': 'One sentence is enough. The point is to keep your attention from resting only on problems.',

    /* ---------- 通用策略池 · 轻度 ---------- */
    'assessment.coping.pool.mild.immediate.0.title': 'Go to bed 30 minutes earlier tonight',
    'assessment.coping.pool.mild.immediate.0.detail': 'Sleep and mood affect each other. Shifting sleep a little earlier usually works better than pushing through.',
    'assessment.coping.pool.mild.immediate.1.title': 'Write down what you are worried about',
    'assessment.coping.pool.mild.immediate.1.detail': 'Split a page into two columns: “things I can act on” and “things I cannot”. Only plan a next step for the first column.',
    'assessment.coping.pool.mild.weekly.0.title': 'Schedule one activity purely for relaxation',
    'assessment.coping.pool.mild.weekly.0.detail': 'A walk, some music, cooking a meal — anything. The key is that it is **not meant to achieve anything**.',
    'assessment.coping.pool.mild.weekly.1.title': 'Cut down on phone time before bed',
    'assessment.coping.pool.mild.weekly.1.detail': 'Put your phone out of reach an hour before bed. This is the single most effective step for better sleep.',
    'assessment.coping.pool.mild.weekly.2.title': 'Try saying “I have been quite tired lately” out loud',
    'assessment.coping.pool.mild.weekly.2.detail': 'One sentence to a family member or friend is enough. No need to elaborate.',
    'assessment.coping.pool.mild.professional.0.title': 'Re-take the assessment in two weeks',
    'assessment.coping.pool.mild.professional.0.detail': 'If the score has not come down, or has risen, talking to a counsellor once is worth considering.',

    /* ---------- 通用策略池 · 中度 ---------- */
    'assessment.coping.pool.moderate.immediate.0.title': 'Start with the smallest possible thing',
    'assessment.coping.pool.moderate.immediate.0.detail': 'When you feel low, “I cannot do anything” is very common. Pick something that takes 5 minutes (wash your face, walk round the block) — finishing it counts as a win.',
    'assessment.coping.pool.moderate.immediate.1.title': 'Break big tasks down until they feel almost silly',
    'assessment.coping.pool.moderate.immediate.1.detail': 'Change “tidy the room” into “take the three cups on the desk back to the kitchen”. The sense of completion itself eases the feeling of helplessness.',
    'assessment.coping.pool.moderate.immediate.2.title': 'Put a time limit on going over things',
    'assessment.coping.pool.moderate.immediate.2.detail': 'Give yourself “20 minutes a day to think it through”; when the time is up, go and do something else. This is not suppression — it is setting a boundary for the thoughts.',
    'assessment.coping.pool.moderate.weekly.0.title': 'Build a routine, starting with your wake-up time',
    'assessment.coping.pool.moderate.weekly.0.detail': 'Do not force yourself to sleep earlier first — fix your wake-up time instead. Your body clock will follow.',
    'assessment.coping.pool.moderate.weekly.1.title': 'Spend time with people face to face at least twice a week',
    'assessment.coping.pool.moderate.weekly.1.detail': 'Online does not count. Even just one meal together is enough.',
    'assessment.coping.pool.moderate.weekly.2.title': 'Cut back on alcohol and caffeine',
    'assessment.coping.pool.moderate.weekly.2.detail': 'Both make anxiety and sleep problems worse, especially in the evening.',
    'assessment.coping.pool.moderate.weekly.3.title': '20 minutes of moderate exercise a day',
    'assessment.coping.pool.moderate.weekly.3.detail': 'Brisk walking, cycling, swimming — any of them. Two weeks is usually enough to feel a difference.',
    'assessment.coping.pool.moderate.professional.0.title': 'Book a counselling session or a mental health clinic appointment',
    'assessment.coping.pool.moderate.professional.0.detail': 'At a moderate level, professional help usually brings improvement faster. There is no need to wait until “it gets worse”.',
    'assessment.coping.pool.moderate.professional.1.title': 'If nothing improves within two weeks, seek care promptly',
    'assessment.coping.pool.moderate.professional.1.detail': 'Bring this report with you — it saves a lot of back-and-forth.',

    /* ---------- 通用策略池 · 重度 ---------- */
    'assessment.coping.pool.severe.immediate.0.title': '**Contact a professional first**',
    'assessment.coping.pool.severe.immediate.0.detail': 'Managing this on your own is hard right now. Treat “book an appointment or a session” as the single most important thing this week.',
    'assessment.coping.pool.severe.immediate.1.title': 'Do not make major decisions alone',
    'assessment.coping.pool.severe.immediate.1.detail': 'Judgement tends to turn pessimistic at a low point. Put decisions like changing jobs, separating, or dropping out on hold for now.',
    'assessment.coping.pool.severe.immediate.2.title': 'Keep yourself basically safe and looked after',
    'assessment.coping.pool.severe.immediate.2.detail': 'Try not to be alone, eat on time, and put away anything you could use to hurt yourself. This is not an overreaction.',
    'assessment.coping.pool.severe.weekly.0.title': 'Let at least one person know how you really are',
    'assessment.coping.pool.severe.weekly.0.detail': 'Family, a friend, a colleague — anyone. Being known by one specific person matters more than being “understood”.',
    'assessment.coping.pool.severe.weekly.1.title': 'Lower your daily demands to the minimum',
    'assessment.coping.pool.severe.weekly.1.detail': 'This week, do only what truly must be done. Everything else can wait.',
    'assessment.coping.pool.severe.professional.0.title': 'See a mental health clinic or psychiatrist within this week',
    'assessment.coping.pool.severe.professional.0.detail': 'Bring this report with you. If it helps, ask a family member or friend to come along.',
    'assessment.coping.pool.severe.professional.1.title': 'If thoughts of harming yourself appear, contact a professional or call emergency services immediately',
    'assessment.coping.pool.severe.professional.1.detail': 'The helplines you can call at any time are listed below this report.',

    /* ---------- 量表专属补充 ---------- */
    'assessment.coping.tip.phq9.immediate.0.title': 'Schedule something that used to interest you',
    'assessment.coping.tip.phq9.immediate.0.detail': 'Even if it feels like nothing right now — with low mood, action comes first and the feeling follows. Wait for the feeling first and it never arrives.',
    'assessment.coping.tip.phq9.weekly.0.title': 'Get 20 minutes of daylight at the same time each day',
    'assessment.coping.tip.phq9.weekly.0.detail': 'Light helps both mood and sleep rhythm, and it costs almost nothing.',

    'assessment.coping.tip.gad7.immediate.0.title': 'Try 4-7-8 breathing once',
    'assessment.coping.tip.gad7.immediate.0.detail': 'Breathe in for 4 seconds, hold for 7, breathe out slowly for 8. Repeat for four rounds. In anxiety, the body settles before the thoughts do.',
    'assessment.coping.tip.gad7.immediate.1.title': '“Book” your worries into a fixed slot',
    'assessment.coping.tip.gad7.immediate.1.detail': 'When a worry arrives, note it down and tell yourself “I will think about it at 8 pm”. Most worries look far less urgent by then.',
    'assessment.coping.tip.gad7.weekly.0.title': 'Limit work messages to a set time each day',
    'assessment.coping.tip.gad7.weekly.0.detail': 'Being permanently online keeps you in a state of alert — a common fuel for anxiety.',

    'assessment.coping.tip.isi.immediate.0.title': 'If you are not asleep after 20 minutes, get up',
    'assessment.coping.tip.isi.immediate.0.detail': 'Leave the bed and do something dull (read a manual). Go back only when you feel sleepy. **Do not lie there tossing and turning** — that teaches your brain to link the bed with being awake.',
    'assessment.coping.tip.isi.immediate.1.title': 'Turn the clock away from you',
    'assessment.coping.tip.isi.immediate.1.detail': 'Checking the time again and again at night markedly increases anxiety, which makes falling asleep even harder.',
    'assessment.coping.tip.isi.weekly.0.title': 'Fix your wake-up time, weekends included',
    'assessment.coping.tip.isi.weekly.0.detail': 'This is the most important element of behavioural treatment for insomnia — far more effective than catching up on sleep.',
    'assessment.coping.tip.isi.weekly.1.title': 'No caffeine after 2 pm',
    'assessment.coping.tip.isi.weekly.1.detail': 'Caffeine has a half-life of about 5 hours, so an afternoon coffee still affects how you fall asleep at night.',

    'assessment.coping.tip.pss10.immediate.0.title': 'Write down three small things you did get done today',
    'assessment.coping.tip.pss10.immediate.0.detail': 'The feeling of pressure often comes from the illusion that “nothing is going right”. Replace it with concrete facts.',
    'assessment.coping.tip.pss10.weekly.0.title': 'Find one commitment you can decline or postpone',
    'assessment.coping.tip.pss10.weekly.0.detail': 'Stress often comes not from the tasks themselves, but from all of them falling due at once.',

    'assessment.coping.tip.who5.immediate.0.title': 'Put one thing you are looking forward to into today',
    'assessment.coping.tip.who5.immediate.0.detail': 'When wellbeing is low, life tends to shrink to “things I should do”. Add one thing you want to do.',
    'assessment.coping.tip.who5.weekly.0.title': 'Pick up an interest you used to have',
    'assessment.coping.tip.who5.weekly.0.detail': 'You do not have to take it all up again. Doing it once is enough to start.',

    'assessment.coping.tip.cdrisc10.immediate.0.title': 'Recall one time you got through something hard',
    'assessment.coping.tip.cdrisc10.immediate.0.detail': 'Be specific: what you did, who helped. This is your own evidence, and it is more solid than any encouragement.',
    'assessment.coping.tip.cdrisc10.weekly.0.title': 'Practise asking for help as a skill',
    'assessment.coping.tip.cdrisc10.weekly.0.detail': 'Resilience does not mean carrying everything alone. Being able to say exactly what help you need is part of it.',

    'assessment.coping.tip.quick.immediate.0.title': 'Complete the matching full scale first',
    'assessment.coping.tip.quick.immediate.0.detail': 'This quick screen uses only the core items. The full scale gives a more detailed breakdown and more specific suggestions.',

    /* ---------- 维度提示 ---------- */
    'assessment.coping.dim.phq9.body': 'Physical signs (sleep, appetite, energy) often improve first — steady your routine and your meals before anything else.',
    'assessment.coping.dim.phq9.mood': 'When mood is low, doing the thing first and letting the feeling follow works better than waiting until you feel like it.',
    'assessment.coping.dim.phq9.mind': 'When self-criticism repeats, try treating the thought as “a thought” rather than “a fact”.',
    'assessment.coping.dim.gad7.tension': 'Constant tension keeps the body on alert. Breathing exercises are the fastest way to shift down a gear.',
    'assessment.coping.dim.gad7.relax': 'Being unable to relax often means the body has not received a “safe” signal. Progressive muscle relaxation is worth a try.',
    'assessment.coping.dim.isi.onset': 'For difficulty falling asleep, fixing your wake-up time works better than going to bed earlier.',
    'assessment.coping.dim.isi.impact': 'Part of the daytime impact of poor sleep comes from worrying about sleep itself. Bring that layer of anxiety down first.',
    'assessment.coping.dim.pss10.helpless': 'When everything feels out of control, bring your attention back to one small thing you can control today.',
    'assessment.coping.dim.pss10.mastery': 'A low score here means you rarely feel in control — start by dropping one commitment.',
    'assessment.coping.dimFallback': 'The “{name}” group accounts for the largest share of your score ({percent}%), so it may be worth focusing on.',
    'assessment.coping.noCutoffFallback': 'This scale has no clinical cut-off; the score is for self-observation only.',
    'assessment.coping.noteCutoffSuffix': ' (Note: {note})',

    /* ---------- 三档强度的一句话说明 ---------- */
    'assessment.coping.note.severe': 'Your score this time falls in the higher range. Of everything below, **the most important one is to contact a professional soon** — the rest can wait. Bring this report to your doctor or counsellor; it helps them understand your situation faster.',
    'assessment.coping.note.moderate': 'These suggestions are split into three layers — what you can do today, what to arrange this week, and when to involve a professional. You do not have to do them all; pick one and start there.',
    'assessment.coping.note.mild': 'There is still plenty of room to adjust how things are going. The steps below are all low-effort — try one or two.',
    'assessment.coping.note.none': 'Things look good at the moment. What follows is about **maintaining** that — useful when you are doing well, too.',

    /* ================================================================== *
     * 八、危机提示与求助资源（crisis.js）
     *     措辞底线：不制造恐慌、不写 "you are at risk"，
     *     只说清"问卷判断不了危险，但你不必独自承担"。
     * ================================================================== */
    'crisis.helpTitle': 'Helplines',
    'assessment.crisis.message.urgent': 'Something in your answers matters to us. **This questionnaire cannot tell whether you are in danger, but you do not have to carry this alone.** There is someone on the other end of each of these lines, and talking to them can help.',
    'assessment.crisis.message.watch': 'There are signals in your answers that are worth taking seriously. That does not mean things are serious, but **talking to someone earlier is always better than carrying it alone**. If things feel worse later, these services are there at any time.',
    'assessment.crisis.banner.urgent': 'This questionnaire cannot tell whether you are in danger, but you do not have to carry this alone.',
    'assessment.crisis.banner.watch': 'That does not mean things are serious, but talking to someone earlier is always better than carrying it alone.',

    'assessment.crisis.reason.critical': 'On the item “{item}”, you chose “{label}”.',
    'assessment.crisis.reason.dimName': '“{name}”',
    'assessment.crisis.reason.dimSuffix': ' ({score} points, reaching the threshold of {at} points).',
    'assessment.crisis.reason.totalHigh': 'Your total of {total} points falls in this scale’s high range (≥ {at} points).',
    'assessment.crisis.reason.totalLow': 'Your total of {total} points is below this scale’s threshold for attention (< {at} points).',

    'assessment.crisis.modal.saved': 'Your assessment report has been saved. You can open it again any time under “Mental Health → My assessments”, and it includes the same helplines.',

    /* ---------- 求助资源（号码本身不翻译，说明要翻） ---------- */
    'assessment.crisis.res.emergency.name': 'Emergency medical / police',
    'assessment.crisis.res.emergency.desc': 'If you have already acted, or are about to act, on thoughts of harming yourself, or you cannot keep yourself safe — call immediately. Do not hesitate; this is always the first option.',
    'assessment.crisis.res.emergency.num.0': 'Ambulance',
    'assessment.crisis.res.emergency.num.1': 'Police',
    'assessment.crisis.res.hotline_national.name': 'National psychological support hotline',
    'assessment.crisis.res.hotline_national.desc': '24-hour psychological support and crisis intervention. You can call anonymously, and the call is free of charge.',
    'assessment.crisis.res.hotline_national.num.0': 'Psychological support',
    'assessment.crisis.res.hotline_beijing.name': 'Beijing Suicide Research and Prevention Center',
    'assessment.crisis.res.hotline_beijing.desc': 'One of the earliest professional crisis-intervention services in the country, with a 24-hour hotline.',
    'assessment.crisis.res.hotline_beijing.num.0': 'Hotline',
    'assessment.crisis.res.hotline_hope.name': 'Hope 24 Hotline',
    'assessment.crisis.res.hotline_hope.desc': 'A nationwide life-crisis intervention hotline, answered around the clock.',
    'assessment.crisis.res.hotline_hope.num.0': 'Life crisis intervention',
    'assessment.crisis.res.urgentTitle': 'If you are struggling right now, please contact any one of these immediately',
    'assessment.crisis.res.watchTitle': 'These services can be called at any time — no need to wait until you cannot cope',

    /* ---------- 危机提示的审计留痕 ---------- */
    'assessment.crisis.audit.target': '{name} ({total} points)',
    'assessment.crisis.audit.detail': 'Mental health assessment raised a {level} alert; psychological support helplines were shown to the user. Triggered by: {reasons}',
    'assessment.crisis.audit.urgent': 'urgent',
    'assessment.crisis.audit.watch': 'attention',

    /* ================================================================== *
     * 九、服务层与审计（assessment.service.js）
     * ================================================================== */
    'assessment.service.needLogin': 'Please sign in first',
    'assessment.service.done': 'Assessment completed',
    'assessment.service.recordGone': 'Record not found',
    'assessment.audit.targetScore': '{name} ({total}/{max} points)',
    'assessment.audit.submitted': 'Completed {name}; the result fell in “{level}”',
    'assessment.audit.removed': 'Deleted a mental health assessment record',

    /* ================================================================== *
     * 十、自检页（assessment-selftest.view.js / assessment.service.js）
     *     断言名会显示在页面的表格里，所以一并翻译；
     *     断言本身（期望值 / 实际值）一个数字都没动。
     * ================================================================== */
    'view.assessment-selftest.title': 'Mental health self-test',
    'assessment.selftest.pageDesc': 'This page runs automated assertions over the scoring engine and the safety rules. It does not appear in the left-hand navigation and is intended for development and acceptance only.',
    'assessment.selftest.rerun': 'Run again',
    'assessment.selftest.runFail': 'Self-test could not run: {msg}',
    'assessment.selftest.allPass': 'All passed　{passed} / {total}',
    'assessment.selftest.allPassHint': 'Scoring correctness and safety assertions all behave as expected.',
    'assessment.selftest.someFail': 'Assertions failed　{passed} / {total}',
    'assessment.selftest.someFailHint': 'See the cases highlighted below. **Problems like these usually do not throw — they just quietly compute the wrong number**, for example a reversed-scoring item implemented backwards, or option values in the wrong order.',
    'assessment.selftest.failedCases': 'Failed cases',
    'assessment.selftest.expectActual': 'expected <code>{expected}</code>, got <code>{actual}</code>',
    'assessment.selftest.allCases': 'All cases ({n})',
    'assessment.selftest.coverage': 'Covers reverse scoring, extreme-value invariants, linear conversion, band boundaries, crisis detection and access-control decisions',
    'assessment.selftest.colResult': 'Result',
    'assessment.selftest.colAssert': 'Assertion',
    'assessment.selftest.colExpected': 'Expected',
    'assessment.selftest.colActual': 'Actual',
    'assessment.selftest.footnote': 'Note: these assertions deliberately pick cases where a naive implementation would give a different answer. For example, with PSS-10 answered 4 everywhere, the six forward-scored items contribute 24 and the four reverse-scored items contribute 0, so the correct answer is 24; forgetting to reverse-score gives 40 — and **that raises no error at all**.',

    'assessment.selftest.pssAll4': 'PSS-10 all 4 → 24 (reverse items zeroed)',
    'assessment.selftest.pssAll1': 'PSS-10 all 1 → 18 (reverse items flipped)',
    'assessment.selftest.pssAll0': 'PSS-10 all 0 → 16',
    'assessment.selftest.allLowest': '{scale} all-lowest → 0 points',
    'assessment.selftest.allHighest': '{scale} all-highest → full marks {full} points',
    'assessment.selftest.isiOptValues': 'ISI item 4 option values are 0..4',
    'assessment.selftest.isiOptFirst': 'ISI item 4 first option is the “very satisfied” label',
    'assessment.selftest.whoRaw': 'WHO-5 all “all of the time” → raw 25',
    'assessment.selftest.whoTotal': 'WHO-5 all “all of the time” → converted 100',
    'assessment.selftest.missingOk': 'one item missing → ok=false',
    'assessment.selftest.missingList': 'one item missing → missing lists the item numbers',
    'assessment.selftest.phqBoundary': 'PHQ-9 total {total} → {level}',
    'assessment.selftest.phqBoundarySevere': 'PHQ-9 total 20 → severe (heavy symptom burden)',
    'assessment.selftest.item9Zero': 'PHQ-9 item 9 = 0 → none',
    'assessment.selftest.item9One': 'PHQ-9 item 9 = 1 → watch (does not interrupt)',
    'assessment.selftest.item9Two': 'PHQ-9 item 9 = 2 → urgent',
    'assessment.selftest.item9Three': 'PHQ-9 item 9 = 3 → urgent',
    'assessment.selftest.highNoCritical': 'PHQ-9 high total but no self-harm item → watch (no false crisis alert)',
    'assessment.selftest.quickUrgent': 'quick screen, depression dimension maxed → urgent',
    'assessment.selftest.canViewNoPsych': 'canView: consent without the psych scope → false',
    'assessment.selftest.canViewForeign': 'canView: someone else’s consent reaching this user’s data → false',
    'assessment.selftest.canViewPsych': 'canView: consent including the psych scope → true',
    'assessment.selftest.canViewOtherRecord': 'canView: consent limited to other record ids → false',
    'assessment.selftest.canViewNoConsent': 'canView: no consent + someone else’s data → false',
    'assessment.selftest.notInRecords': 'no mental health data inside the records collection',
    'assessment.selftest.noIdentityAll': 'with no identity (signed out / doctor guest), all() returns an empty array',
    'assessment.selftest.noIdentityById': 'with no identity, byId() refuses to return data',

    /* ================================================================== *
     * 十一、免责声明（scales.js 的常量，界面/报告/导出三处共用）
     * ================================================================== */
    'assessment.disclaimer': 'This assessment is a **self-rated screening tool**, not a diagnostic one. A high screening score does not mean you are ill, and a normal score does not rule a problem out. Any conclusion must be drawn by a qualified professional (psychiatrist or psychotherapist) together with an interview and your history. If you are going through intense distress, or having thoughts of harming yourself, contact a professional or call emergency services immediately.',
    'assessment.disclaimerShort': 'A self-rated screening tool, not a basis for diagnosis; results cannot replace professional assessment.'
  });

})(window.PHR);
