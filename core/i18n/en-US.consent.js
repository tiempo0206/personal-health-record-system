/**
 * 文件：core/i18n/en-US.consent.js
 * 层：核心基础设施层（国际化 · 英文词条 · 医生授权模块）
 * 职责：登记医生授权模块中文文案对应的英文词条（授权列表、四步授权向导、
 *      医生受限视图、授权范围说明与常用组合预设、审计文案）。
 * 依赖：core/i18n/i18n.js
 */
(function (PHR) {
  'use strict';
  if (!PHR.i18n) { return; }
  PHR.i18n.register('en-US', {

    'module.consent.title': 'Doctor Access',
    'module.consent.desc': 'Share only the records a doctor needs, for a limited time and scope, and revoke access at any time.',
    'consent.warn.coverageFail': 'Consent coverage calculation failed',
    'consent.doctor.warn.psychRead': 'Failed to read mental health data',
    'consent.doctor.warn.insightRead': 'Failed to read health insight data',

    /* ---------- 授权列表与统计卡 ---------- */
    'consent.list.title': 'My consents',
    'consent.list.summary': '<b>{total}</b> consents in total · {shown} shown',
    'consent.btn.new': '＋ New consent',
    'consent.btn.newShort': 'New consent',
    'consent.btn.detail': 'Details & access log',
    'consent.btn.extend': 'Extend',
    'consent.btn.copy': '📋 Copy code',
    'consent.btn.revoke': 'Revoke',

    /* ---------- 授权状态（值本身是内部 key，不翻译） ---------- */
    'consent.status.active': 'Active',
    'consent.status.pending': 'Pending',
    'consent.status.expired': 'Expired',
    'consent.status.revoked': 'Revoked',

    /* ---------- 单位与分隔符 ---------- */
    'consent.unit.consent': 'consents',
    'consent.unit.times': 'times',
    'consent.unit.record': 'records',
    'consent.unit.report': 'reports',
    'consent.sep.list': ', ',
    'consent.sep.dot': ' · ',
    'consent.sep.wide': ' ',
    'consent.sep.semicolon': '; ',
    'consent.sep.colon': ': ',
    'consent.countParen': ' ({n})',

    /* ---------- 统计卡 ---------- */
    'consent.tile.accessTotal': 'Total views',
    'consent.tile.activeSub': 'Visible to the doctor right now',
    'consent.tile.pendingSub': 'Not yet in effect',
    'consent.tile.expiredSub': 'Expires automatically',
    'consent.tile.revokedSub': 'Revoked by you',
    'consent.tile.accessSub': 'Every view is logged',

    /* ---------- 空状态 ---------- */
    'consent.empty.none': 'No consents yet',
    'consent.empty.filtered': 'No consents with this status',
    'consent.empty.hint': 'When you need to show your records to a doctor, create a consent and send them the 12-character code — they will only see the scopes you ticked.',
    'consent.none.yet': 'not yet',

    /* ---------- 页面上的两段说明 ---------- */
    'consent.notice.howTitle': 'How does a consent keep the doctor to only what they should see?',
    'consent.notice.howBody': '① The doctor can only see the scopes you tick; ② a code works for one consent only, and that consent lasts at most {n} days; ③ every view the doctor makes is written to the access log, which you can check in Access Log; ④ it expires automatically, and you can revoke it at any time.',
    'consent.notice.detailsTitle': 'Two security details',
    'consent.notice.detailsBody': '① When a consent expires the system marks it invalid and the doctor immediately loses access; ② whatever a doctor has already seen stays in the access log permanently — that record cannot be deleted.',

    /* ---------- 授权卡片 ---------- */
    'consent.card.license': 'License no. {no}',
    'consent.card.licenseNone': 'No license number given',
    'consent.card.purpose': 'Purpose: {text}',
    'consent.card.period': 'Valid {from} → {to}',
    'consent.card.coverage': 'Covers {n} records',
    'consent.card.accessCount': 'Viewed {n} times',
    'consent.card.lastAccess': 'Last viewed {when}',
    'consent.card.code': 'Code {code}',
    'consent.code.label': 'Code',
    'consent.badge.expiringSoon': 'Expires soon',
    'consent.badge.sensitive': 'Confirm separately',

    /* ---------- 授权时长文案 ---------- */
    'consent.time.revoked': 'Revoked on {at}',
    'consent.time.expired': 'Expired automatically on {at}',
    'consent.time.pending': 'Takes effect {at}',
    'consent.time.left': '{n} days left (expires automatically on {at})',
    'consent.daysPlus': '+{n} days',
    'consent.daysShort': '{n} days',

    /* ---------- 复制授权码 ---------- */
    'consent.toast.copied': 'Code copied: {code}',
    'consent.toast.copiedDetail': 'Send it to the doctor in person, by phone, or through an official hospital channel.',
    'consent.toast.copyFail': 'Copy failed — please write it down instead: {code}',
    'consent.toast.granted': 'Consent created',

    /* ---------- 授权详情与访问时间线 ---------- */
    'consent.modal.detailTitle': 'Consent details · {name}',
    'consent.kv.code': 'Code',
    'consent.kv.purpose': 'Purpose',
    'consent.kv.license': 'License no.',
    'consent.kv.scopes': 'Scopes',
    'consent.kv.period': 'Validity',
    'consent.kv.accessStats': 'Accesses',
    'consent.kv.note': 'Note',
    'consent.kv.revokeRecord': 'Revocation',
    'consent.kv.doctor': 'Doctor',
    'consent.kv.org': 'Hospital & department',
    'consent.kv.visible': 'Visible records',
    'consent.detail.coverage': 'Covers {hit} / {total} records ({percent}%)',
    'consent.detail.periodValue': '{range} · {left}',
    'consent.detail.accessStats': '{n} times in total, most recent {when}',
    'consent.detail.revokeRecord': '{at} · Reason: {reason}',
    'consent.detail.timeline': 'Access timeline',
    'consent.detail.noActivity': 'This doctor has not viewed your records yet. Every view they make will appear here.',

    /* ---------- 延长与撤销 ---------- */
    'consent.modal.extendTitle': 'Extend consent validity',
    'consent.extend.body': 'Extend the consent for “{name}”. It currently ends on {at}.',
    'consent.revoke.confirm': 'Revoke the consent for “{name}”?',
    'consent.revoke.confirmDetail': 'The doctor immediately loses access to your records; records they have already viewed stay in the access log. This cannot be undone.',
    'consent.revoke.continue': 'Revoke anyway',
    'consent.revoke.reasonTitle': 'Reason for revoking',
    'consent.revoke.reasonLabel': 'Reason (optional, visible only to you)',
    'consent.revoke.reasonPlaceholder': 'e.g. this follow-up visit has ended',
    'consent.revoke.confirmBtn': 'Revoke consent',
    'consent.revoke.reasonDefault': 'Revoked by the user',

    /* ---------- 服务层提示与校验错误 ---------- */
    'consent.err.notFoundPlain': 'Consent not found',
    'consent.err.notFound': 'Consent not found or already deleted',
    'consent.err.alreadyRevoked': 'This consent has already been revoked',
    'consent.err.scopesRequired': 'Select at least one scope',
    'consent.err.scopesRequiredPick': 'Tick at least one scope',
    'consent.err.doctorNameRequired': 'Enter the doctor’s name',
    'consent.err.expireInvalid': 'Choose a valid end date',
    'consent.err.expirePast': 'The end date must be later than today',
    'consent.err.expireMustBeFuture': 'Choose an end date later than today',
    'consent.err.maxDays': 'Validity can be at most {n} days',
    'consent.err.daysRange': 'Validity must be between 1 and {n} days',
    'consent.err.extendRange': 'The extension must be between 1 and {n} days',
    'consent.err.revokedCannotExtend': 'A revoked consent cannot be extended — create a new one',
    'consent.err.checkInput': 'Please check the form',
    'consent.msg.granted': 'Consent created — send the code to the doctor',
    'consent.msg.revoked': 'Revoked. The doctor can no longer access your records.',
    'consent.msg.extended': 'Validity extended to {until}',

    /* ---------- 医生入口：校验授权码 ---------- */
    'consent.verify.notFound': 'That code does not exist. Check it and try again (mind the difference between letters and digits).',
    'consent.verify.revoked': 'The patient has revoked this consent. The records can no longer be accessed.',
    'consent.verify.expired': 'This consent expired on {at}. Ask the patient to create a new one.',
    'consent.verify.pending': 'This consent is not in effect yet (starts {at})',
    'consent.verify.nameRequired': 'Enter your name — it is recorded for the audit trail',
    'consent.verify.ok': 'Verified. You are viewing the records with restricted access.',

    /* ---------- 四步授权向导 ---------- */
    'consent.wizard.title': 'New doctor consent',
    'consent.wizard.prev': '← Previous',
    'consent.wizard.next': 'Next →',
    'consent.wizard.grant': '✓ Generate code',
    'consent.wizard.done': 'Done',
    'consent.wizard.stepOf': 'Step {n} of 4 · ',
    'consent.wizard.clearPresets': 'Clear',
    'consent.wizard.coverage': '{n} scopes selected, covering {hit} / {total} records ({percent}%)',

    /* ---------- 向导第 1 步：医生信息表单 ---------- */
    'consent.f1.doctorName': 'Doctor’s name',
    'consent.f1.doctorNamePh': 'e.g. Li Jianguo',
    'consent.f1.doctorTitle': 'Title',
    'consent.f1.doctorTitlePh': 'e.g. Chief physician',
    'consent.f1.hospital': 'Hospital',
    'consent.f1.department': 'Department',
    'consent.f1.licenseNo': 'License number',
    'consent.f1.licenseNoPh': 'Optional, used for the audit trail',
    'consent.f1.purpose': 'Purpose of visit',
    'consent.f1.purposePh': 'e.g. hypertension follow-up; needs recent blood pressure trends and current medication',

    /* ---------- 向导各步骤 ---------- */
    'consent.step.doctor': 'Doctor',
    'consent.step.doctorHint': 'This information goes into the access log, so you can check later who viewed your records and when.',
    'consent.step.scopes': 'Scopes',
    'consent.step.scopesHint': 'Tick only what this visit really needs — the narrower the scope, the smaller the exposure.',
    'consent.step.period': 'Validity',
    'consent.step.periodHint': 'Shorter is safer. Once it expires the doctor loses access immediately, with nothing for you to do.',
    'consent.step.quickPick': 'Quick pick',
    'consent.step.customDate': 'Or set an end date',
    'consent.step.expireNote': 'This consent expires automatically on <b>{at}</b>{suffix}.',
    'consent.step.expireCustom': ' (a custom end date counts to 23:59 that day)',
    'consent.step.expireFrom': ' ({n} days from now)',
    'consent.step.confirm': 'Confirm',
    'consent.step.confirmHint': 'The system will generate a 12-character code. Send it to the doctor.',
    'consent.confirm.visible': '<b>{hit}</b> of {total} records ({percent}%)',
    'consent.confirm.noticeTitle': 'One more look before you confirm',
    'consent.confirm.noticeBody': 'Once created, the doctor can enter with this code straight away. Ticking too much can be revoked immediately, but it is safer to change it back now.',

    /* ---------- 向导第 2 步：范围与常用组合 ---------- */
    'consent.scope.basic.desc': 'Name, sex, date of birth, blood type, height and weight',
    'consent.scope.history.desc': 'Diagnosed conditions, surgical history, hospitalizations',
    'consent.scope.family.desc': 'Illnesses among first- and second-degree relatives',
    'consent.scope.medication.desc': 'Current and past medications and prescriptions',
    'consent.scope.allergy.desc': 'Allergens, reaction types and severity',
    'consent.scope.lab.desc': 'Lab reports, imaging studies and health check-up reports',
    'consent.scope.vital.desc': 'Blood pressure, blood glucose, heart rate, weight and other values over time',
    'consent.scope.visit.desc': 'Outpatient, emergency and follow-up visit records',
    'consent.scope.insight.desc': 'Trend analysis, risk assessment and system advice',
    'consent.scope.psych.desc': 'Scores, severity levels and advice for depression, anxiety, sleep, stress and similar scales',
    'consent.scope.psychTypeName': 'Psychological scale report',
    'consent.scope.includes': 'Includes: {types} · {n} records now',
    'consent.sensitive.title': 'These scopes are best confirmed separately',
    'consent.sensitive.body': '{scopes} — {descs}',

    'consent.preset.revisit.name': 'Follow-up (most used)',
    'consent.preset.revisit.desc': 'Basic profile, past history, medications, allergies, vital signs, visit records and system conclusions — enough for the doctor to take in the whole picture in one pass.',
    'consent.preset.lab_only.name': 'Labs only',
    'consent.preset.lab_only.desc': 'For when you only need a doctor to interpret a lab report. Smallest exposure.',
    'consent.preset.emergency.name': 'Emergency',
    'consent.preset.emergency.desc': 'Emergency care first needs to know about allergies, current medication and underlying conditions, so lab reports and family history are left out.',
    'consent.preset.chronic.name': 'Chronic care follow-up',
    'consent.preset.chronic.desc': 'For long-term management of hypertension, diabetes and the like: vital sign trends + labs + medications, best used together with follow-up reminders.',
    'consent.preset.drug.name': 'Medication review',
    'consent.preset.drug.desc': 'Ask a doctor whether the current regimen is appropriate and whether anything interacts.',
    'consent.preset.first.name': 'First visit',
    'consent.preset.first.desc': 'Seeing this doctor for the first time: everything except family history — complete information, while leaving the most sensitive item for the patient to decide.',

    /* ---------- 向导第 5 屏：授权码 ---------- */
    'consent.result.title': '✅ Consent created',
    'consent.result.hint': 'Send this code to the doctor through a secure channel. It works for this one consent only and becomes void as soon as it expires or is revoked.',
    'consent.result.nextTitle': 'What happens next',
    'consent.result.nextBody': 'Once the doctor chooses “I’m a doctor” on the sign-in page and enters this code, they can only see the {n} scopes you ticked (about {records} records); every view they make is recorded, and you can check it in Access Log.',

    /* ---------- 覆盖度 ---------- */
    'consent.coverage.records': 'Health records {hit} / {total}',
    'consent.coverage.assessments': 'Assessments {hit} / {total}',
    'consent.coverage.none': 'You have no data to share yet.',
    'consent.coverage.text': 'This consent covers: {list}',

    /* ---------- 审计文案（展示在「访问追踪」里） ---------- */
    'consent.actor.system': 'System',
    'consent.actor.doctor': 'Doctor',
    'consent.audit.grantTarget': 'Consent for {name}{title}',
    'consent.audit.grantDetail': 'Scopes: {scopes}; valid {days} days (until {until}); covers {hit}/{total} records; code {code}',
    'consent.audit.revokeTarget': 'Revoked the consent for {name}',
    'consent.audit.revokeDetail': 'Reason: {reason} (the doctor immediately loses access to the records)',
    'consent.audit.extendTarget': 'Extended the consent for {name}',
    'consent.audit.extendDetail': 'Validity extended by {days} days: {from} → {to}',
    'consent.audit.verifyDetail': 'Doctor verified with the consent code and entered the restricted view (scopes for this consent: {scopes})',
    'consent.audit.expiredDetail': 'The consent expired on {at} and was invalidated automatically (the doctor immediately lost access)',
    'consent.audit.accessTarget': 'Consent for {name} ({scope})',
    'consent.audit.accessAllowed': 'Viewed “{scope}”{record}',
    'consent.audit.accessDenied': 'Attempted to view unauthorized content “{scope}”{record} (this scope is not in the consent list; access was blocked by the system)',
    'consent.audit.recordPart': ': {name}',

    /* ---------- 医生受限视图 ---------- */
    'consent.doctor.gateTitle': 'Enter from the sign-in page with a code',
    'consent.doctor.gateHint': 'Doctor view is open only to doctors verified with a consent code. On the sign-in page choose “I’m a doctor — view a patient’s records with a code” and enter the 12-character code the patient gave you.',
    'consent.doctor.backToLogin': 'Back to sign in',
    'consent.doctor.invalid': 'This consent is no longer valid. Enter again with a code.',
    'consent.doctor.viewing': 'You are viewing the records of <b>{name}</b> with restricted access',
    'consent.doctor.bannerScopes': '{n} scopes shared',
    'consent.doctor.bannerWarn': '⚠️ The system has recorded your entry time and identity; every view you make on this page is written to the patient’s access log.',
    'consent.doctor.timeLeft': 'Time remaining',
    'consent.doctor.exit': 'Exit doctor view',
    'consent.doctor.patient': 'Patient',
    'consent.doctor.expired': 'Consent expired',
    'consent.doctor.timer': '{d} d {h} h {m} min {s} s',
    'consent.doctor.authorized': 'Authorized',
    'consent.doctor.scopeMeta': '{desc} · {n} records visible under this consent',
    'consent.doctor.noScopes': 'This consent covers no scopes',
    'consent.doctor.noScopesHint': 'Ask the patient to create a new consent.',
    'consent.doctor.noRecords': 'No records in this scope',
    'consent.doctor.noPsychRecords': 'No assessment reports in this scope',
    'consent.doctor.psychRecord': '{name} ({total}/{max} points)',
    'consent.doctor.emptyScope': 'No records of this kind under this consent',
    'consent.doctor.abnormal': 'Abnormal',
    'consent.doctor.resultAbnormal': 'Abnormal result',

    /* ---------- 医生视图：基本信息 ---------- */
    'consent.basic.name': 'Name',
    'consent.basic.gender': 'Sex',
    'consent.basic.birth': 'Date of birth',
    'consent.basic.age': 'Age',
    'consent.basic.yearsOld': '{n} years',
    'consent.basic.bloodType': 'Blood type',
    'consent.basic.heightWeight': 'Height / weight',
    'consent.basic.emergency': 'Emergency contact',
    'consent.basic.maskedNote': 'The ID number and emergency contact phone are masked for the doctor view.',
    'consent.basic.missing': 'The patient has not filled in their basic profile',

    /* ---------- 医生视图：用药与过敏 ---------- */
    'consent.doctor.currentMeds': 'Current medications ({n})',
    'consent.doctor.noMeds': 'No medications are being taken.',
    'consent.doctor.longTerm': 'Long-term',
    'consent.doctor.interactions': 'Drug interaction alert',
    'consent.doctor.allergyList': 'Allergies ({n})',
    'consent.doctor.allergyHidden': 'Allergy history is not authorized, or this patient has no allergy records.',
    'consent.doctor.reactions': 'Reactions: {list}',
    'consent.doctor.reactionsNone': 'not recorded',
    'consent.doctor.handling': 'Emergency management: {text}',
    'consent.doctor.drugAllergy': 'Drug allergy: {list}',
    'consent.doctor.drugAllergyHint': 'Check before prescribing. The full list is in the Allergies scope.',
    'consent.doctor.allergyCount': 'This patient has {n} allergy records',
    'consent.doctor.allergyHint': 'Watch for food and contact allergies.',
    'consent.doctor.noAllergy': 'No allergy records',
    'consent.doctor.noAllergyHint': 'This patient has no recorded allergy history; a verbal check before prescribing is still advised.',

    /* ---------- 医生视图：病史与家族史 ---------- */
    'consent.doctor.diagnoses': 'Diagnoses',
    'consent.doctor.surgeries': 'Surgeries',
    'consent.doctor.hospitalizations': 'Hospitalizations',
    'consent.doctor.vaccinations': 'Vaccinations',
    'consent.doctor.familyNone': 'Not authorized, or no family history',
    'consent.doctor.familyNoneHint': 'Family history describes the health of relatives. It is a sensitive scope and has to be ticked by the patient separately.',
    'consent.doctor.familyCount': 'Family history ({n})',
    'consent.doctor.geneticRisks': 'Genetic risk notes',
    'consent.doctor.advice': 'Advice: {text}',

    /* ---------- 医生视图：体征指标 ---------- */
    'consent.doctor.bpTrend': 'Blood pressure trend',
    'consent.doctor.systolic': 'Systolic',
    'consent.doctor.diastolic': 'Diastolic',
    'consent.doctor.systolicRange': 'Systolic reference range',
    'consent.doctor.noBp': 'No blood pressure data',
    'consent.doctor.noBpHint': 'The vital sign records in this consent contain no blood pressure readings.',
    'consent.doctor.vitalSummary': '{n} readings · avg {avg} · range {min} ~ {max}',
    'consent.doctor.latestAt': 'Latest {at}',

    /* ---------- 医生视图：心理测评报告 ---------- */
    'consent.doctor.dataMissing': 'No data generated',
    'consent.doctor.psychModuleMissing': 'The mental health module is not loaded, or the patient has not completed an assessment yet.',
    'consent.doctor.psychReadError': 'Something went wrong reading the assessment reports.',
    'consent.doctor.psychNone': 'The patient has no assessment report to share',
    'consent.doctor.psychNoneHint': 'This scope is authorized, but the patient has no completed assessment reports at the moment.',
    'consent.doctor.psychNoticeTitle': 'How to use these assessment results',
    'consent.doctor.psychNoticeBody': 'These results are the patient’s **self-reported screening** records, not a diagnosis. Judge them together with a clinical interview and the medical history; do not draw conclusions from the score alone. Mental health data carries a high social sensitivity — treat it as confidential and do not copy it into other, unauthorized systems.',
    'consent.doctor.outOfScore': '/ {n} points',
    'consent.doctor.noCutoff': 'This scale has no clinical cut-off',
    'consent.doctor.copingExcerpt': 'Advice from the patient’s report (excerpt): {text}',
    'consent.doctor.takenAt': 'Taken {at}',
    'consent.doctor.reportCount': '{n} reports. The patient can revoke this scope at any time in Doctor Access.',

    /* ---------- 医生视图：健康洞察结论 ---------- */
    'consent.doctor.insightModuleMissing': 'The health insight module is not loaded, or the patient has not generated any conclusions yet.',
    'consent.doctor.insightReadError': 'Something went wrong reading the insight conclusions.',
    'consent.doctor.riskScoreTitle': 'Overall risk score',
    'consent.doctor.riskScore': '{n} points · {level}',
    'consent.doctor.trendsTitle': 'Metric trend conclusions',
    'consent.doctor.trend90': 'trend over the last 90 days: “{dir}”',
    'consent.doctor.noTrends': 'No trend conclusions yet.',
    'consent.doctor.adviceTitle': 'System advice',
    'consent.doctor.noAdvice': 'No advice yet.',

    /* ---------- 医生视图：越权阻断与隐私声明 ---------- */
    'consent.doctor.deniedTitle': '🔒 Scopes not authorized',
    'consent.doctor.deniedSub': 'Click any of them to see the rule “a doctor can only view authorized content” actually enforced',
    'consent.doctor.deniedWhy': 'Why are they listed here?',
    'consent.doctor.deniedWhyBody': 'These scopes are not in the patient’s consent list, so the system will not show you any data. Clicking one triggers a real authorization check: the system blocks the access, writes an “unauthorized access blocked” entry, and the patient sees it in Access Log.',
    'consent.doctor.deniedToast': 'This scope is not in the consent list. Access was blocked and recorded.',
    'consent.doctor.deniedToastTitle': 'Unauthorized access blocked',
    'consent.doctor.deniedToastDetail': 'This attempt has been written to the patient’s access log (consent.denied).',
    'consent.doctor.privacy': '🔐 Privacy notice: the patient sees every view you make — which scope you opened, which record you read, when, and from where. Use the information on this page for this episode of care only.',

    /* ---------- 医生视图：检验检查报告表格 ---------- */
    'consent.lab.date': 'Date',
    'consent.lab.type': 'Report type',
    'consent.lab.title': 'Report name & conclusion',
    'consent.lab.source': 'Source'
  });
})(window.PHR);
