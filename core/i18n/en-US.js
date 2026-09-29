/**
 * ============================================================================
 * 文件：core/i18n/en-US.js
 * 层：核心基础设施层（国际化 · 英文词条）
 * 职责：注册英文词条。**这是唯一需要人工维护的翻译文件**。
 *
 *      命名约定：
 *        dict.<字典组>.<key>   字典层（性别、疾病分类、记录类型、体征指标…）
 *        view.<视图名>.title   页面标题
 *        view.<视图名>.desc    页面副标题
 *        nav.<名称>            导航分组名
 *        ui.<名称>             通用组件文案
 *        <模块>.<名称>         模块内文案
 *
 *      维护方式：界面上看到哪句还是中文，就在本文件加一条对应词条即可，
 *      不需要改任何视图代码（未命中的键会自动回退到中文兜底）。
 *
 * 依赖：core/i18n/i18n.js（register）
 * ============================================================================
 *
 * ⚠️ 医疗术语的翻译原则：
 *   · 采用国际通行的英文医学表达（Hypertension 而非 High blood pressure）
 *   · 量表名保留原始缩写（PHQ-9 / GAD-7），因为它们是专有名称
 *   · 分级用描述性词汇（Mild / Moderate），避免暗示诊断
 *   · 本文件不翻译**量表题目**（那属于量表原文，见 scales.js 的说明）
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    /* ================================================================== *
     * 一、数据字典层 —— 杠杆最大的一层
     *    改这里，全站的列表、图表、徽章、筛选器、表单下拉一起变英文
     * ================================================================== */

    /* ---------- 人口学 ---------- */
    'dict.gender.male': 'Male',
    'dict.gender.female': 'Female',
    'dict.gender.other': 'Other / Prefer not to say',

    'dict.bloodType.A': 'Type A',
    'dict.bloodType.B': 'Type B',
    'dict.bloodType.O': 'Type O',
    'dict.bloodType.AB': 'Type AB',
    'dict.bloodType.Rh-': 'Rh-negative',
    'dict.bloodType.unknown': 'Unknown',

    'dict.maritalStatus.single': 'Single',
    'dict.maritalStatus.married': 'Married',
    'dict.maritalStatus.divorced': 'Divorced',
    'dict.maritalStatus.widowed': 'Widowed',

    /* ---------- 家族关系 ---------- */
    'dict.familyRelation.father': 'Father',
    'dict.familyRelation.mother': 'Mother',
    'dict.familyRelation.brother': 'Brother',
    'dict.familyRelation.sister': 'Sister',
    'dict.familyRelation.son': 'Child',
    'dict.familyRelation.grandfather_p': 'Paternal grandfather',
    'dict.familyRelation.grandmother_p': 'Paternal grandmother',
    'dict.familyRelation.grandfather_m': 'Maternal grandfather',
    'dict.familyRelation.grandmother_m': 'Maternal grandmother',
    'dict.familyRelation.uncle': 'Uncle',
    'dict.familyRelation.aunt': 'Aunt',
    'dict.familyRelation.cousin': 'Cousin',
    'dict.familyRelation.other': 'Other relative',

    /* ---------- 疾病分类 ---------- */
    'dict.diseaseCategory.cardio': 'Cardiovascular',
    'dict.diseaseCategory.endocrine': 'Endocrine & Metabolic',
    'dict.diseaseCategory.respiratory': 'Respiratory',
    'dict.diseaseCategory.digestive': 'Digestive',
    'dict.diseaseCategory.neuro': 'Neurological',
    'dict.diseaseCategory.urinary': 'Urinary',
    'dict.diseaseCategory.musculo': 'Musculoskeletal',
    'dict.diseaseCategory.immune': 'Immune & Rheumatic',
    'dict.diseaseCategory.oncology': 'Oncology',
    'dict.diseaseCategory.infectious': 'Infectious Disease',
    'dict.diseaseCategory.mental': 'Mental Health',
    'dict.diseaseCategory.eye': 'Ophthalmology',
    'dict.diseaseCategory.skin': 'Dermatology',
    'dict.diseaseCategory.ent': 'ENT',
    'dict.diseaseCategory.obgyn': 'Obstetrics & Gynecology',
    'dict.diseaseCategory.pediatric': 'Pediatrics',
    'dict.diseaseCategory.other': 'Other',

    /* ---------- 严重程度 ---------- */
    'dict.severity.info': 'Informational',
    'dict.severity.mild': 'Mild',
    'dict.severity.moderate': 'Moderate',
    'dict.severity.severe': 'Severe',
    'dict.severity.critical': 'Critical',

    /* ---------- 过敏 ---------- */
    'dict.allergenType.drug': 'Drug allergy',
    'dict.allergenType.food': 'Food allergy',
    'dict.allergenType.pollen': 'Pollen / Dust mite',
    'dict.allergenType.contact': 'Contact allergy',
    'dict.allergenType.insect': 'Insect sting',
    'dict.allergenType.other': 'Other',

    'dict.allergyReaction.rash': 'Rash / Hives',
    'dict.allergyReaction.itch': 'Itching',
    'dict.allergyReaction.sneeze': 'Sneezing / Runny nose',
    'dict.allergyReaction.asthma': 'Asthma attack',
    'dict.allergyReaction.vomit': 'Nausea / Vomiting',
    'dict.allergyReaction.diarrhea': 'Diarrhea',
    'dict.allergyReaction.swelling': 'Facial / Laryngeal swelling',
    'dict.allergyReaction.shock': 'Anaphylactic shock',
    'dict.allergyReaction.other': 'Other',

    /* ---------- 用药 ---------- */
    'dict.medFrequency.qd': 'Once daily',
    'dict.medFrequency.bid': 'Twice daily',
    'dict.medFrequency.tid': 'Three times daily',
    'dict.medFrequency.qid': 'Four times daily',
    'dict.medFrequency.qod': 'Every other day',
    'dict.medFrequency.qw': 'Once weekly',
    'dict.medFrequency.prn': 'As needed',
    'dict.medFrequency.st': 'One-time dose',

    'dict.medRoute.po': 'Oral',
    'dict.medRoute.iv': 'Intravenous',
    'dict.medRoute.im': 'Intramuscular',
    'dict.medRoute.sc': 'Subcutaneous',
    'dict.medRoute.top': 'Topical',
    'dict.medRoute.inh': 'Inhalation',
    'dict.medRoute.other': 'Other',

    /* ---------- 科室 ---------- */
    'dict.department.general': 'General / Internal Medicine',
    'dict.department.cardio': 'Cardiology',
    'dict.department.endocrine': 'Endocrinology',
    'dict.department.resp': 'Respiratory Medicine',
    'dict.department.gastro': 'Gastroenterology',
    'dict.department.neuro': 'Neurology',
    'dict.department.surgery': 'Surgery',
    'dict.department.ortho': 'Orthopedics',
    'dict.department.derm': 'Dermatology',
    'dict.department.eye': 'Ophthalmology',
    'dict.department.ent': 'ENT',
    'dict.department.obgyn': 'Obstetrics & Gynecology',
    'dict.department.peds': 'Pediatrics',
    'dict.department.emerg': 'Emergency',
    'dict.department.other': 'Other department',

    /* ---------- 医疗机构 ---------- */
    'dict.hospital.hosp_rm': 'Municipal First People\'s Hospital',
    'dict.hospital.hosp_cd': 'Municipal Central Hospital',
    'dict.hospital.hosp_jk': 'Health Community Health Centre',
    'dict.hospital.hosp_zl': 'Municipal Cancer Hospital',
    'dict.hospital.hosp_ey': 'Municipal Children\'s Hospital',

    /* ---------- 授权范围 ---------- */
    'dict.consentScope.basic': 'Basic profile',
    'dict.consentScope.history': 'Medical history',
    'dict.consentScope.family': 'Family history',
    'dict.consentScope.medication': 'Medications',
    'dict.consentScope.allergy': 'Allergies',
    'dict.consentScope.lab': 'Lab & imaging reports',
    'dict.consentScope.vital': 'Vital signs',
    'dict.consentScope.visit': 'Visit records',
    'dict.consentScope.insight': 'Health insight conclusions',
    'dict.consentScope.psych': 'Psychological assessment reports',

    /* ---------- 认证方式 ---------- */
    'dict.authFactor.password': 'Password',
    'dict.authFactor.sms': 'SMS code',
    'dict.authFactor.face': 'Face recognition',

    /* ---------- 社群板块 ---------- */
    'dict.communityBoard.general': 'General discussion',
    'dict.communityBoard.chronic': 'Chronic conditions',
    'dict.communityBoard.nutrition': 'Diet & exercise',
    'dict.communityBoard.psych': 'Emotional support',
    'dict.communityBoard.caregiver': 'Family caregivers',

    /* ---------- 14 种健康记录类型 ---------- */
    'dict.recordType.visit': 'Outpatient visit',
    'dict.recordType.diagnosis': 'Diagnosis',
    'dict.recordType.lab': 'Lab report',
    'dict.recordType.imaging': 'Imaging study',
    'dict.recordType.prescription': 'Prescription',
    'dict.recordType.medication': 'Medication',
    'dict.recordType.allergy': 'Allergy',
    'dict.recordType.surgery': 'Surgery',
    'dict.recordType.hospitalization': 'Hospitalization',
    'dict.recordType.vaccination': 'Vaccination',
    'dict.recordType.checkup': 'Health check-up',
    'dict.recordType.family': 'Family history',
    'dict.recordType.vital': 'Vital sign',
    'dict.recordType.note': 'Health note',
    'dict.recordType.unknown': 'Unknown record type',

    /* ---------- 16 项体征指标 ---------- */
    'dict.metric.systolic': 'Systolic blood pressure',
    'dict.metric.diastolic': 'Diastolic blood pressure',
    'dict.metric.glucose': 'Fasting blood glucose',
    'dict.metric.hba1c': 'HbA1c',
    'dict.metric.heartRate': 'Resting heart rate',
    'dict.metric.weight': 'Body weight',
    'dict.metric.bmi': 'Body mass index (BMI)',
    'dict.metric.waist': 'Waist circumference',
    'dict.metric.temperature': 'Body temperature',
    'dict.metric.spo2': 'Blood oxygen saturation',
    'dict.metric.ldl': 'LDL cholesterol',
    'dict.metric.uricAcid': 'Blood uric acid',
    'dict.metric.creatinine': 'Serum creatinine',
    'dict.metric.alt': 'ALT (liver enzyme)',
    'dict.metric.sleepHours': 'Sleep duration',
    'dict.metric.steps': 'Daily steps',

    'dict.metricShort.systolic': 'Systolic',
    'dict.metricShort.diastolic': 'Diastolic',
    'dict.metricShort.glucose': 'Glucose',
    'dict.metricShort.hba1c': 'HbA1c',
    'dict.metricShort.heartRate': 'Heart rate',
    'dict.metricShort.weight': 'Weight',
    'dict.metricShort.bmi': 'BMI',
    'dict.metricShort.waist': 'Waist',
    'dict.metricShort.temperature': 'Temperature',
    'dict.metricShort.spo2': 'SpO₂',
    'dict.metricShort.ldl': 'LDL-C',
    'dict.metricShort.uricAcid': 'Uric acid',
    'dict.metricShort.creatinine': 'Creatinine',
    'dict.metricShort.alt': 'ALT',
    'dict.metricShort.sleepHours': 'Sleep',
    'dict.metricShort.steps': 'Steps',

    /* ---------- 指标三级判定 ---------- */
    'dict.judge.ok': 'Normal',
    'dict.judge.warning': 'Needs attention',
    'dict.judge.critical': 'Clearly abnormal',
    'dict.judge.unknown': '—',

    /* ---------- 审计动作（部分高频项） ---------- */
    'dict.auditAction.auth.register': 'Account registered',
    'dict.auditAction.auth.login': 'Signed in',
    'dict.auditAction.auth.login_fail': 'Sign-in failed',
    'dict.auditAction.auth.logout': 'Signed out',
    'dict.auditAction.auth.mfa_pass': 'Two-factor passed',
    'dict.auditAction.auth.mfa_fail': 'Two-factor failed',
    'dict.auditAction.auth.locked': 'Account locked',
    'dict.auditAction.auth.password': 'Password changed',
    'dict.auditAction.profile.update': 'Profile updated',
    'dict.auditAction.record.create': 'Record added',
    'dict.auditAction.record.update': 'Record edited',
    'dict.auditAction.record.delete': 'Record deleted',
    'dict.auditAction.record.view': 'Record viewed',
    'dict.auditAction.record.rollback': 'Version restored',
    'dict.auditAction.record.import': 'Records imported from file',
    'dict.auditAction.sync.pull': 'Synced from hospital',
    'dict.auditAction.search.run': 'Search performed',
    'dict.auditAction.insight.view': 'Insight viewed',
    'dict.auditAction.insight.alert': 'Abnormal result alert',
    'dict.auditAction.consent.grant': 'Access granted',
    'dict.auditAction.consent.revoke': 'Access revoked',
    'dict.auditAction.consent.expired': 'Access expired',
    'dict.auditAction.consent.access': 'Doctor viewed records',
    'dict.auditAction.consent.denied': 'Unauthorized access blocked',
    'dict.auditAction.consent.verify': 'Consent code verified',
    'dict.auditAction.community.post': 'Community post',
    'dict.auditAction.community.reply': 'Community reply',
    'dict.auditAction.community.remove': 'Community post removed',
    'dict.auditAction.assessment.submit': 'Assessment completed',
    'dict.auditAction.assessment.view': 'Assessment report viewed',
    'dict.auditAction.assessment.grant': 'Assessment shared',
    'dict.auditAction.ux.export': 'Data exported',
    'dict.auditAction.ux.import': 'Data imported',
    'dict.auditAction.ux.integrity': 'Integrity check',
    'dict.auditAction.ux.settings': 'Settings changed',
    'dict.auditAction.security.alert': 'Security alert',

    /* ================================================================== *
     * 二、外壳与导航
     * ================================================================== */
    'app.name': 'Personal Health Record System',
    'app.shortName': 'PHR',
    'app.slogan': 'Secure · Controllable · Understandable · Traceable',
    'seed.collectFail': 'Failed to collect demo text, so the interface may not switch languages completely.',

    'nav.group.main': 'Modules',
    'nav.group.system': 'System & Support',
    'nav.dashboard': 'Dashboard',
    'nav.records': 'Health Records',
    'nav.timeline': 'Timeline',
    'nav.search': 'Search',
    'nav.insight': 'Health Insight',
    'nav.consent': 'Doctor Access',
    'nav.audit': 'Access Log',
    'nav.community': 'Community',
    'nav.assessment': 'Mental Health',
    'nav.settings': 'Preferences',
    'nav.help': 'Help',
    'nav.profile': 'Account & Security',
    'nav.doctor': 'Doctor View',

    'shell.menu': 'Open navigation',
    'shell.searchPlaceholder': 'Search health records, press Enter  ( / to focus )',
    'shell.search': 'Search',
    'shell.alerts': 'Security alerts',
    'shell.theme': 'Toggle light / dark',
    'shell.logout': 'Sign out',
    'shell.language': 'Language',
    'shell.autoLogout': 'Screensaver countdown',
    'shell.mfaOn': '🔐 Two-factor enabled',
    'shell.mfaOff': '⚠️ Two-factor recommended',
    'shell.restricted': 'Restricted access mode',
    'shell.exitDoctor': 'Exit doctor view',
    'shell.demoEnv': 'local',
    'shell.logoutConfirm': 'Sign out of the current account?',
    'shell.logoutDetail': 'Signing out will not delete your saved health data.',
    'shell.idleLogout': 'Your sign-in has expired. Please sign in again.',
    'shell.screensaverHint': 'Click anywhere to continue',
    'shell.sessionTimeout': 'Sign-in expired',
    'shell.doctorBlocked': 'Restricted access — you can only view records the patient shared',
    'shell.appMissing': 'Cannot find the #app container, so the interface cannot render. Make sure the page contains <div id="app"></div>.',
    'shell.unmountError': 'Failed to unmount view: {name}',
    'shell.doctorBlockedDetail': 'Ask the patient to create a consent for anything else.',

    /* ================================================================== *
     * 三、页面标题与副标题
     * ================================================================== */
    'view.dashboard.title': 'Dashboard',
    'view.dashboard.desc': 'Everything in one screen: today’s to-dos, recent records, health alerts and security status.',

    'view.records.title': 'Health Records',
    'view.records.desc': 'All of your health data lives here: 14 record types, version history, traceable sources.',

    'view.timeline.title': 'Health Timeline',
    'view.timeline.desc': 'Every record in reverse chronological order — what happened, when, and how it went.',

    'view.search.title': 'Search',
    'view.search.desc': 'Filter by date, condition or record type, or just type a keyword — fuzzy matching is built in.',

    'view.insight.title': 'Health Insight',
    'view.insight.desc': 'Turns your blood pressure, glucose and heart rate into readable trends, alerts and advice.',

    'view.consent.title': 'Doctor Access',
    'view.consent.desc': 'Share only what is needed, for a limited time. Expires automatically, revocable anytime.',

    'view.audit.title': 'Access Log',
    'view.audit.desc': 'Who accessed what, when and from where. Abnormal behaviour is detected automatically.',

    'view.community.title': 'Community',
    'view.community.desc': 'Anonymous peer support. Not a substitute for medical advice.',
    'view.community-post.title': 'Post',

    'view.assessment.title': 'Mental Health',
    'view.assessment.desc': 'Self-assessment with published screening scales — results, plain-language reports and coping strategies.',

    'view.settings.title': 'Preferences',
    'view.help.title': 'Help',
    'view.profile.title': 'Account & Security',
    'view.doctor.title': 'Doctor View',
    'view.basic.title': 'Basic Profile',
    'view.records-edit.title': 'Add Record',
    'view.assessment-take.title': 'Assessment',
    'view.assessment-report.title': 'Report',

    /* ================================================================== *
     * 四、通用 UI 组件文案
     * ================================================================== */
    'ui.close': 'Close',
    'ui.cancel': 'Cancel',
    'ui.confirm': 'Confirm',
    'ui.save': 'Save',
    'ui.delete': 'Delete',
    'ui.edit': 'Edit',
    'ui.back': 'Back',
    'ui.retry': 'Retry',
    'ui.search': 'Search',
    'ui.reset': 'Reset',
    'ui.all': 'All',
    'ui.none': '—',
    'ui.loading': 'Loading…',
    'ui.noData': 'No data',
    'ui.empty': 'Nothing here yet',
    'ui.error': 'Something went wrong',
    'ui.errorHint': 'Data failed to load. Please retry.',
    'ui.required': 'Required',
    'ui.optional': 'optional',
    'ui.prev': 'Previous',
    'ui.next': 'Next',
    'ui.first': 'First',
    'ui.last': 'Last',
    'ui.page': 'Page',
    'ui.total': 'Total',
    'ui.items': 'items',
    'ui.of': 'of',
    'ui.viewDetail': 'View',
    'ui.print': 'Print',
    'ui.export': 'Export',
    'ui.copy': 'Copy',
    'ui.copied': 'Copied',
    'ui.selectAll': 'Select all',
    'ui.clear': 'Clear',

    /* ================================================================== *
     * 五、账号安全（登录页）
     * ================================================================== */
    'auth.welcome': 'Welcome back',
    'auth.subtitle': 'Sign in to manage your health records.',
    'auth.tab.login': 'Sign in',
    'auth.tab.register': 'Create account',
    'auth.account': 'Account / Phone',
    'auth.accountPlaceholder': 'Enter your account or phone number',
    'auth.password': 'Password',
    'auth.passwordPlaceholder': 'Enter your password',
    'auth.signIn': 'Sign in',
    'auth.remember': 'Stay signed in for 7 days',
    'auth.forgot': 'Forgot password?',
    'auth.doctorEntry': 'I’m a doctor — view a patient’s records with a code',
    'auth.mfa.title': 'Verification',
    'auth.mfa.subtitle': 'Password verified. One more step protects your health data.',
    'auth.mfa.step1': '① Password',
    'auth.mfa.step2': '② Verification',
    'auth.mfa.step3': '③ Enter',
    'auth.mfa.smsLabel': 'Enter the 6-digit code sent to',
    'auth.mfa.verify': 'Verify',
    'auth.mfa.resend': 'Resend',
    'auth.mfa.startFace': 'Start scan',
    'auth.mfa.faceAgain': 'Try again',
    'auth.mfa.backToLogin': '← Back to sign in',
    'auth.mfa.sessionNote': 'This verification is valid for this tab only.',
    'auth.session.started': 'Session established',
    'auth.session.ended': 'Session ended: {reason}',
    'auth.brandHeadline': 'All your scattered health information, in one secure place',
    'auth.brandLead': 'Check-up reports, diagnoses, prescriptions, medications and allergies are scattered across hospitals, dates and formats. This system gives you one secure, centralized, searchable entry point.',

    /* ================================================================== *
     * 六、工作台
     * ================================================================== */
    'dash.greet.morning': 'Good morning',
    'dash.greet.noon': 'Good afternoon',
    'dash.greet.evening': 'Good evening',
    'dash.greet.night': 'Good night',
    'dash.addRecord': '＋ Add record',
    'dash.viewInsight': '📈 Health insight',
    'dash.grantAccess': '🔑 Share with doctor',
    'dash.searchRecords': '🔍 Search records',
    'dash.records': 'health records',
    'dash.types': 'record types',
    'dash.completeness': 'profile completeness',
    'dash.activeConsents': 'active consents',
    'dash.denied': 'unauthorized attempts blocked',
    'dash.riskScore': 'Health score',
    'dash.alerts': 'Health alerts',
    'dash.latestMetric': 'Latest reading',
    'dash.todos': 'To-dos',
    'dash.todoDone': 'All clear',
    'dash.recent': 'Recent records',
    'dash.consentStatus': 'Doctor access',
    'dash.security': 'Security status',

    /* ================================================================== *
     * 七、心理测评（模块 9，本次新增，覆盖度最高）
     * ================================================================== */
    'assessment.intro.title': 'A self-assessment tool, not a diagnosis',
    'assessment.intro.body': 'Seven published screening scales across five topics. Each takes 1–3 minutes. A high score does not mean you have a disorder, and a normal score does not rule one out. Everything stays on this device — assessments never enter your health records, never appear in search, and never feed into the health insight risk score.',
    'assessment.catalog': 'Scale catalogue',
    'assessment.catalogHint': 'Not sure where to start? Try the 5-question quick screen.',
    'assessment.myRecords': 'My assessments',
    'assessment.quickScreen': 'Quick screen',
    'assessment.start': 'Start',
    'assessment.retake': 'Take again',
    'assessment.doneTimes': 'Completed {n}×',
    'assessment.neverDone': 'Not taken yet',
    'assessment.minutes': '{n} min',
    'assessment.questions': '{n} questions',
    'assessment.noCutoff': 'no clinical cut-off',
    'assessment.trend': 'Trend',
    'assessment.trendHint': 'Complete the same scale at least twice to see a trend.',

    'assessment.take.consentTitle': 'Before you begin',
    'assessment.take.consent1': 'This is a screening tool, not a diagnosis. A high score does not mean you are ill.',
    'assessment.take.consent3': 'Answer honestly — that is the only way the result means anything.',
    'assessment.take.consent4': 'If your answers mention thoughts of self-harm, we will show you helplines.',
    'assessment.take.agree': 'I understand, start',
    'assessment.take.progress': 'Answered {done} / {total}',
    'assessment.take.submit': 'Submit',
    'assessment.take.draftSaved': 'Draft saved automatically',
    'assessment.take.incomplete': '{n} question(s) still unanswered',

    'assessment.report.score': 'Score',
    'assessment.report.breakdown': 'Score breakdown',
    'assessment.report.breakdownHint': 'Which group of items contributed most',
    'assessment.report.coping': 'Coping strategies',
    'assessment.report.copingHint': 'Split by how soon you can act',
    'assessment.report.items': 'Item-by-item detail',
    'assessment.report.disclaimer': 'Disclaimer',
    'assessment.report.exportTxt': 'Export as text',
    'assessment.report.notFound': 'This report does not exist',
    'assessment.report.deleteConfirm': 'Delete this assessment report?',

    'assessment.coping.now': '☀️ Can do today',
    'assessment.coping.week': '📅 This week',
    'assessment.coping.pro': '🏥 Professional help',
    'assessment.coping.urgent': '🏥 Please do this first',

    'crisis.headline': 'Please read this first',
    'crisis.watchHeadline': 'One thing we want to flag',
    'crisis.emergency': 'Emergency services',
    'crisis.hotline': 'Psychological support hotline',
    'crisis.showHelp': '📞 See helplines',
    'crisis.note': 'Numbers are subject to change — check official sources. If you cannot get through, try another, or go to the nearest emergency department. Asking for help is not weakness.',

    /* ---------- 体征指标的"建议测量情境"（core/../vital.service.js） ---------- */
    'vital.unknownMetric': 'Unknown metric type',
    'vital.context.systolic': 'Measured at rest in the morning',
    'vital.context.diastolic': 'Measured at rest in the morning',
    'vital.context.glucose': 'After at least 8 hours fasting',
    'vital.context.hba1c': 'No fasting required',
    'vital.context.heartRate': 'After resting quietly for 5 minutes',
    'vital.context.weight': 'Morning, fasting, after emptying bladder and bowels',
    'vital.context.bmi': 'Calculated automatically from height and weight',
    'vital.context.waist': 'Standing, breathing normally, measured at navel level',
    'vital.context.temperature': 'Axillary measurement, 5 minutes',
    'vital.context.spo2': 'Finger clip, at rest',
    'vital.context.ldl': 'Fasting venous blood',
    'vital.context.uricAcid': 'Fasting venous blood',
    'vital.context.creatinine': 'Fasting venous blood',
    'vital.context.alt': 'Fasting venous blood',
    'vital.context.lab': 'Lab report',
    'vital.context.labSource': 'Lab report: {name}',
    'vital.context.sleepHours': 'Recorded by wearable or phone',
    'vital.context.steps': 'Counted by phone or wearable',

    /* ---------- 枚举值兜底短语表 ----------
       有些模块的内部枚举值（趋势方向、风险等级）会直接显示到界面上。
       刻意**不翻译枚举本身**（跨模块用 === 比较，改了会坏），
       改为在显示处用 PHR.t('phrase.' + 值, 值) 查这张表。
       若值已经是英文，键不匹配 → 原样返回，因此中英都安全。 */
    'phrase.上升': 'Rising',
    'phrase.下降': 'Falling',
    'phrase.平稳': 'Stable',
    'phrase.较高': 'Relatively high',
    'phrase.中等': 'Moderate',
    'phrase.较低': 'Relatively low',
    'phrase.低': 'Low',
    'phrase.高': 'High',

    /* ---------- 相对时间（core/utils.js fmtRelative） ---------- */
    'time.justNow': 'just now',
    'time.minutesAgo': '{n} min ago',
    'time.hoursAgo': '{n} h ago',
    'time.daysAgo': '{n} d ago',

    /* ---------- 通用徽章（ui/components/badge.js） ---------- */
    'badge.consent.active': 'Active',
    'badge.consent.pending': 'Not yet active',
    'badge.consent.expired': 'Expired',
    'badge.consent.revoked': 'Revoked',
    'badge.unknownAction': 'Unknown action',
    'badge.result.success': 'Success',
    'badge.result.fail': 'Failed',
    'badge.result.denied': 'Blocked',
    'badge.source.sync': 'Hospital sync',
    'badge.source.import': 'Imported',
    'badge.source.manual': 'Manual entry',

    /* ---------- 图表（ui/components/chart.js） ---------- */
    'chart.empty.title': 'No data',
    'chart.empty.hint': 'There are no records available to plot a trend yet.',
    'chart.ariaLabel': 'Trend chart',
    'chart.series': 'Series {n}',
    'chart.scale.ref': 'Ref {range}',
    'chart.scale.current': 'Current value {value}',
    'chart.renderWarn': 'Chart redraw failed',

    /* ---------- 口令强度（core/crypto.js 的 strength()） ---------- */
    'crypto.strength.0': 'Very weak',
    'crypto.strength.1': 'Weak',
    'crypto.strength.2': 'Fair',
    'crypto.strength.3': 'Good',
    'crypto.strength.4': 'Strong',
    'crypto.strength.5': 'Very strong',
    'crypto.decryptFail': 'Decryption failed',

    /* ---------- 存储（core/store.js） ---------- */
    'store.driver.fallback': 'localStorage unavailable; falling back to in-memory storage (data will be lost when the page is closed)',
    'store.driver.file': 'Local database file (data/database.json)',
    'store.driver.local': 'Browser local storage (localStorage)',
    'store.driver.memory': 'Memory (lost when the page closes)',
    'store.read.fail': 'Read failed: {name}',
    'store.write.quota': 'Local storage is full. Please export and clean up historical data in Experience → Data Backup.',
    'store.drop.fail': 'Delete failed: {name}',
    'store.ready.cbFail': 'A startup callback failed',

    /* ---------- 本地数据库文件（core/store.file.js） ---------- */
    'store.file.netErr': 'Cannot reach the local database server',
    'store.file.timeout': 'The local database server timed out',
    'store.file.fallback': 'The local database server is unavailable ({reason}); falling back to browser local storage',
    'store.file.path': 'data/database.json',
    'store.file.tooLarge': 'The database file is too large; this save was skipped',
    'store.file.conflictLoop': 'Kept colliding with another tab; this save was abandoned',
    'store.file.warn.summary': 'The database file has {n} thing(s) worth a look',
    'store.file.warn.notArray': '“{k}” is not an array; treated as an empty collection',
    'store.file.warn.unknown': '“{k}” is not one of this system’s collections; kept as-is in the kv section',
    'store.file.warn.noVersion': 'The file has no storageVersion marker; read on a best-effort basis and it will be added on the next save',
    'store.file.warn.flat': 'This file is not in the standard format (no meta/data wrapper); read on a best-effort basis as a flat document',
    'store.file.corrupt.title': 'data/database.json could not be parsed',
    'store.file.corrupt.message': 'This file is not valid JSON, so its data cannot be read. The file will not be modified automatically.',
    'store.file.corrupt.detail': '“Back up and rebuild”: the original is renamed to database.json.corrupt-<timestamp> and kept (never deleted), then the system restores the sample data and writes a fresh database.json.\n“Cancel”: this session runs on browser local storage and leaves the file completely untouched — fix it in Notepad and reload the page.',
    'store.file.corrupt.confirm': 'Back up and rebuild',
    'store.file.corrupt.cancel': 'Cancel, I will fix it myself',
    'store.file.corrupt.kept': 'The file is unreadable and the user chose to repair it by hand',
    'store.file.corrupt.done': 'The original file was backed up and the sample data rebuilt',
    'store.file.corrupt.backupFail': 'Could not back up the original file',
    'eventBus.handlerFail': 'Event handler failed: {event}',

    /* ================================================================== *
     * 八、启动与自检（core/boot.js）
     * ================================================================== */
    'boot.title': 'Personal Health Record System',
    'boot.subtitle': 'Assembling modules, please wait…',
    'boot.meta.description': 'Personal Health Record System — keep scattered health information secure, controllable, searchable and understandable.',
    'boot.appAria': 'Personal Health Record System',
    'boot.noscript.title': 'JavaScript Required',
    'boot.noscript.p1': 'This system is a pure frontend application; all functions run in your browser. Please enable JavaScript and refresh the page.',
    'boot.error.uncaught': 'Uncaught error',
    'boot.error.toast': 'An error occurred; the action may not have taken effect.',
    'boot.error.title': 'System notification',
    'boot.error.promise': 'Unhandled Promise rejection',
    'boot.seed.firstRun': 'First run: sample data written',
    'boot.seed.fail': 'Sample data write failed',
    'boot.seed.toast': 'Sample data initialization failed; you can register an account manually.',
    'boot.locale.applied': 'Interface language: {lang}',
    'boot.locale.forced': ' (specified by ?lang=)',
    'boot.locale.fail': 'Language initialization failed',
    'boot.pref.fail': 'Preference application failed',
    'boot.housekeeping.fail': 'Cleanup task failed',
    'boot.startup.done': 'Startup completed in {ms} ms',
    'boot.console.demoAccount': 'Sample account: {username} / {password}',
    'boot.console.selfTest': 'Self-test: PHR.boot.selfTest()',
    'boot.console.debug': 'Enable debug logging: PHR.boot.debug(true)',
    'boot.console.seed': 'Rebuild sample data: PHR.seed.run(true) (clears existing data)',
    'boot.selfTest.core.namespace': 'Core · Namespace',
    'boot.selfTest.core.dict': 'Core · Dictionary',
    'boot.selfTest.core.metrics': 'Core · Metrics',
    'boot.selfTest.core.store': 'Core · Storage',
    'boot.selfTest.core.crypto': 'Core · Password hash',
    'boot.selfTest.core.encrypt': 'Core · Encrypt/decrypt round-trip',
    'boot.selfTest.core.collections': 'Core · Collections',
    'boot.selfTest.core.seed': 'Core · Sample data',
    'boot.selfTest.core.security': 'Core · Security',
    'boot.selfTest.mod1.auth': 'Module 1 · Account security',
    'boot.selfTest.mod2.records': 'Module 2 · Records',
    'boot.selfTest.mod2.vital': 'Module 2 · Vitals',
    'boot.selfTest.mod2.versions': 'Module 2 · Version history',
    'boot.selfTest.mod2.sync': 'Module 2 · Hospital sync',
    'boot.selfTest.mod3.search': 'Module 3 · Search',
    'boot.selfTest.mod3.fuzzy': 'Module 3 · Fuzzy match',
    'boot.selfTest.mod4.insight': 'Module 4 · Health insight',
    'boot.selfTest.mod4.risk': 'Module 4 · Risk assessment',
    'boot.selfTest.mod5.consent': 'Module 5 · Doctor access',
    'boot.selfTest.mod6.audit': 'Module 6 · Access log',
    'boot.selfTest.mod7.community': 'Module 7 · Community',
    'boot.selfTest.mod8.ux': 'Module 8 · Experience',
    'boot.selfTest.mod9.assessment': 'Module 9 · Mental health',
    'boot.selfTest.mod9.scoring': 'Module 9 · Scoring & bands',
    'boot.selfTest.mod9.reverse': 'Module 9 · Reverse scoring',
    'boot.selfTest.mod9.scoped': 'Module 9 · Scoped access',
    'boot.selfTest.views': 'Views · Registered pages',
    'boot.selfTest.count': '{count} items',
    'boot.selfTest.exception': 'Exception: {msg}',
    'boot.selfTest.pass': '✅ Pass',
    'boot.selfTest.fail': '❌ Fail',
    'boot.selfTest.col.name': 'Check item',
    'boot.selfTest.col.result': 'Result',
    'boot.selfTest.col.note': 'Description',
    'boot.selfTest.storage.persistent': ' ({driver}; persistent)',
    'boot.selfTest.storage.memory': ' ({driver}; lost when page closed)',
    'boot.selfTest.views.note': '{count} pages',
    'boot.selfTest.views.missing': ', missing: {list}',
    'boot.debug.on': 'Debug logging enabled',
    'boot.debug.off': 'Debug logging disabled',

    /* ================================================================== *
     * 九、语言切换自身
     * ================================================================== */
    'i18n.log.switched': 'Language switched to {lang}',
    'i18n.switchedToEn': 'Language switched to English',
    'i18n.switchedToZh': '已切换为简体中文',
    'i18n.partialNote': 'Some content is still being translated; untranslated parts show the original Chinese.',
    'i18n.coverage': 'Translation coverage',
    'i18n.coverageDesc': 'Dictionary terms translated',
    'i18n.forcedNote': 'This session was started with ?lang=en-US, so English is forced and your saved preference is unchanged.'
  });

})(window.PHR);
