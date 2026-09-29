/**
 * ============================================================================
 * 文件：core/i18n/en-US.core.js
 * 层：核心基础设施层（国际化 · 英文词条 · 核心字典与通用组件）
 * 职责：登记**核心基础设施层与通用 UI 组件**的英文词条，具体包括：
 *
 *       ① 字典项说明     dict.<组名>.<key>.desc
 *       ② 医疗机构等级   dict.hospital.<key>.level
 *       ③ 记录类型说明   dict.recordType.<key>.desc
 *       ④ 记录字段标签   dict.field.<类型key>.<字段名>
 *       ⑤ 字段内文案     dict.field.<类型key>.<字段名>.ph / .hint / .unit
 *       ⑥ 字段候选项     dict.field.<类型key>.<字段名>.opt.<选项key>
 *       ⑦ 体征指标文案   dict.metric.<key>.desc / .adviceNormal / .adviceWarn
 *                        / .adviceCritical、dict.metricUnit.<key>
 *       ⑧ 表单校验提示   model.*
 *       ⑨ 安全治理文案   pwd.* / sec.*
 *       ⑩ 通用组件文案   ui.*（分页、空状态、弹窗、表单…）
 *       ⑪ 应用外壳文案   shell.* / i18n.*
 *
 *       词条键的生成规则写在 core/dict-records.js 与 core/dict-metrics.js 里：
 *       那两个文件把 fields[].i18n 挂到每个字段上，并把 label 等属性改成
 *       读取词条的访问器。因此本文件**只登记词条，不参与任何逻辑**。
 *
 *       未登记的词条会自动回退到源码里的中文原文 ——
 *       也就是说，漏掉一条只会显示中文，不会出现空白，也不会报错。
 *
 * 依赖：core/i18n/i18n.js（register）
 * ============================================================================
 *
 * ⚠️ 翻译口径（与 core/i18n/en-US.js 保持一致）：
 *   · 医疗术语采用国际通行的英文医学表达：
 *     Hypertension / Fasting blood glucose / Body mass index / HbA1c
 *   · 英式与美式拼写择一后统一：本文件用英式（anaesthesia / hospitalisation）
 *   · 字段标签按真实医疗信息系统的写法（Test item / Reference range /
 *     Prescribing date），不逐字直译
 *   · 中文原文一律原样保留在 .js 源码里作为兜底，本文件不复制中文
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  if (!PHR.i18n) { return; }

  PHR.i18n.register('en-US', {

    /* ================================================================== *
     * 一、字典项说明（core/dict.js → desc 字段）
     * ================================================================== */

    /* ---------- 授权范围：可授权的数据类别说明 ---------- */
    'dict.consentScope.basic.desc': 'Name, sex, date of birth, blood type, height and weight',
    'dict.consentScope.history.desc': 'Confirmed diagnoses, surgical and hospitalisation history',
    'dict.consentScope.family.desc': 'Conditions among first- and second-degree relatives',
    'dict.consentScope.medication.desc': 'Current and past medications, prescriptions',
    'dict.consentScope.allergy.desc': 'Allergens, reaction types and severity',
    'dict.consentScope.lab.desc': 'Lab results, imaging and health check-up reports',
    'dict.consentScope.vital.desc': 'Blood pressure, glucose, heart rate, weight and other values over time',
    'dict.consentScope.visit.desc': 'Outpatient, emergency and follow-up visits',
    'dict.consentScope.insight.desc': 'Trend analysis, risk assessment and system advice',
    'dict.consentScope.psych.desc': 'Scores, severity bands and advice from depression, anxiety, sleep and stress scales',

    /* ---------- 认证方式：第二因素说明 ---------- */
    'dict.authFactor.password.desc': 'First factor: account password',
    'dict.authFactor.sms.desc': 'Second factor: a 6-digit code sent to your registered phone',
    'dict.authFactor.face.desc': 'Second factor: simulated on-device face match',

    /* ---------- 社群板块：板块说明 ---------- */
    'dict.communityBoard.general.desc': 'Anything related to managing your health',
    'dict.communityBoard.chronic.desc': 'Living with hypertension, diabetes and other long-term conditions',
    'dict.communityBoard.nutrition.desc': 'Real stories about changing diet and exercise habits',
    'dict.communityBoard.psych.desc': 'Emotions and stress — mutual support',
    'dict.communityBoard.caregiver.desc': 'Experience and questions from caring for a family member',

    /* ---------- 医疗机构等级（拼在下拉项名称的括号里） ---------- */
    'dict.hospital.hosp_rm.level': 'Tertiary A',
    'dict.hospital.hosp_cd.level': 'Tertiary A',
    'dict.hospital.hosp_jk.level': 'Primary',
    'dict.hospital.hosp_zl.level': 'Tertiary specialist',
    'dict.hospital.hosp_ey.level': 'Tertiary specialist',

    /* ================================================================== *
     * 二、14 种记录类型的一句话说明（列表 / 卡片 / 新建入口展示）
     * ================================================================== */
    'dict.recordType.visit.desc': 'A single outpatient or emergency visit — presenting complaint, diagnosis and treatment plan.',
    'dict.recordType.diagnosis.desc': 'A formally confirmed condition. The core input for your medical history and risk assessment.',
    'dict.recordType.lab.desc': 'Results from blood counts, chemistry panels, urinalysis and other laboratory tests.',
    'dict.recordType.imaging.desc': 'CT, MRI, X-ray, ultrasound, endoscopy and other imaging or special examinations.',
    'dict.recordType.prescription.desc': 'Prescriptions issued by a doctor — one record per medication.',
    'dict.recordType.medication.desc': 'Medications you are taking or have taken, supplements included.',
    'dict.recordType.allergy.desc': 'Drug, food and contact allergens with the reactions they cause. Always show this to a doctor.',
    'dict.recordType.surgery.desc': 'Surgical procedures you have undergone.',
    'dict.recordType.hospitalization.desc': 'A hospital stay, with both admission and discharge diagnoses.',
    'dict.recordType.vaccination.desc': 'Immunisation records — useful for travel, school enrolment and medical visits.',
    'dict.recordType.checkup.desc': 'Overall conclusions from an annual, pre-employment or occupational health check-up.',
    'dict.recordType.family.desc': 'Conditions among your relatives, used to assess hereditary risk.',
    'dict.recordType.vital.desc': 'Quantifiable measures such as blood pressure, glucose and heart rate — the source behind trend charts and abnormal-result alerts.',
    'dict.recordType.note.desc': 'Symptoms, question lists and to-dos that do not fit anywhere else.',

    /* ================================================================== *
     * 三、记录字段标签与字段内文案
     *     键：dict.field.<记录类型key>.<字段名>[.ph | .hint | .unit]
     *     同一字段名在不同记录类型下是**不同的词条**，
     *     因为同一个"单位"在检验报告里是 mmol/L、在体征指标里是自动带出。
     * ================================================================== */

    /* ---------------- 1. 门诊就诊 visit ---------------- */
    'dict.field.visit.visitDate': 'Visit date',
    'dict.field.visit.hospital': 'Healthcare facility',
    'dict.field.visit.department': 'Department',
    'dict.field.visit.department.ph': 'Please select a department',
    'dict.field.visit.doctor': 'Doctor',
    'dict.field.visit.doctor.ph': 'e.g. Dr Li Jianguo',
    'dict.field.visit.visitType': 'Visit type',
    'dict.field.visit.chiefComplaint': 'Presenting complaint',
    'dict.field.visit.chiefComplaint.ph': 'e.g. recurring dizziness for 3 days',
    'dict.field.visit.diagnosis': 'Diagnosis',
    'dict.field.visit.diagnosis.ph': 'e.g. stage 2 essential hypertension',
    'dict.field.visit.diseaseCat': 'Disease category',
    'dict.field.visit.diseaseCat.ph': 'Please select the body system',
    'dict.field.visit.treatment': 'Treatment plan',
    'dict.field.visit.treatment.ph': 'Medication plan, tests ordered or follow-up arrangements',
    'dict.field.visit.cost': 'Cost',
    'dict.field.visit.cost.unit': 'CNY',
    'dict.field.visit.note': 'Personal notes',
    'dict.field.visit.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 2. 确诊疾病 diagnosis ---------------- */
    'dict.field.diagnosis.diseaseName': 'Condition name',
    'dict.field.diagnosis.diseaseName.ph': 'e.g. type 2 diabetes',
    'dict.field.diagnosis.diseaseCat': 'Disease category',
    'dict.field.diagnosis.diseaseCat.ph': 'Please select the body system',
    'dict.field.diagnosis.severity': 'Severity',
    'dict.field.diagnosis.severity.ph': 'Please select the severity',
    'dict.field.diagnosis.diagnosedDate': 'Date of diagnosis',
    'dict.field.diagnosis.status': 'Current status',
    'dict.field.diagnosis.hospital': 'Healthcare facility',
    'dict.field.diagnosis.department': 'Department',
    'dict.field.diagnosis.department.ph': 'Please select a department',
    'dict.field.diagnosis.doctor': 'Doctor',
    'dict.field.diagnosis.doctor.ph': 'e.g. Dr Li Jianguo',
    'dict.field.diagnosis.basis': 'Basis for diagnosis',
    'dict.field.diagnosis.basis.ph': 'e.g. fasting glucose 8.9 mmol/L, HbA1c 7.8%',
    'dict.field.diagnosis.conclusion': 'Conclusion / physician advice',
    'dict.field.diagnosis.conclusion.ph': 'The conclusion, advice or precautions given by the doctor',
    'dict.field.diagnosis.note': 'Personal notes',
    'dict.field.diagnosis.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 3. 检验报告 lab ---------------- */
    'dict.field.lab.reportDate': 'Report date',
    'dict.field.lab.hospital': 'Healthcare facility',
    'dict.field.lab.department': 'Department',
    'dict.field.lab.department.ph': 'Please select a department',
    'dict.field.lab.itemName': 'Test item',
    'dict.field.lab.itemName.ph': 'e.g. fasting glucose / HbA1c / LDL cholesterol',
    'dict.field.lab.result': 'Result',
    'dict.field.lab.unit': 'Unit',
    'dict.field.lab.unit.ph': 'e.g. mmol/L',
    'dict.field.lab.refRange': 'Reference range',
    'dict.field.lab.refRange.ph': 'e.g. 3.9 - 6.1',
    'dict.field.lab.abnormal': 'Abnormal result',
    'dict.field.lab.abnormal.hint': 'Tick to include this record in the abnormal-result statistics under Health Insight',
    'dict.field.lab.diseaseCat': 'Disease category',
    'dict.field.lab.diseaseCat.ph': 'Please select the body system',
    'dict.field.lab.impression': 'Interpretation',
    'dict.field.lab.note': 'Personal notes',
    'dict.field.lab.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 4. 影像检查 imaging ---------------- */
    'dict.field.imaging.examDate': 'Examination date',
    'dict.field.imaging.hospital': 'Healthcare facility',
    'dict.field.imaging.department': 'Department',
    'dict.field.imaging.department.ph': 'Please select a department',
    'dict.field.imaging.modality': 'Modality',
    'dict.field.imaging.bodyPart': 'Body part examined',
    'dict.field.imaging.bodyPart.ph': 'e.g. chest / abdomen / head',
    'dict.field.imaging.findings': 'Findings',
    'dict.field.imaging.impression': 'Impression',
    'dict.field.imaging.severity': 'Severity',
    'dict.field.imaging.severity.ph': 'Please select the severity',
    'dict.field.imaging.diseaseCat': 'Disease category',
    'dict.field.imaging.diseaseCat.ph': 'Please select the body system',
    'dict.field.imaging.attachment': 'Report attachment',
    'dict.field.imaging.attachment.ph': 'Report number or storage location',
    'dict.field.imaging.note': 'Personal notes',
    'dict.field.imaging.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 5. 处方 prescription ---------------- */
    'dict.field.prescription.prescribedDate': 'Prescribing date',
    'dict.field.prescription.hospital': 'Healthcare facility',
    'dict.field.prescription.department': 'Department',
    'dict.field.prescription.department.ph': 'Please select a department',
    'dict.field.prescription.doctor': 'Doctor',
    'dict.field.prescription.doctor.ph': 'e.g. Dr Li Jianguo',
    'dict.field.prescription.drugName': 'Medication name',
    'dict.field.prescription.drugName.ph': 'e.g. amlodipine besylate tablets',
    'dict.field.prescription.spec': 'Strength / pack size',
    'dict.field.prescription.spec.ph': 'e.g. 5 mg × 7 tablets',
    'dict.field.prescription.dose': 'Dose per administration',
    'dict.field.prescription.dose.ph': 'e.g. 5 mg',
    'dict.field.prescription.frequency': 'Frequency',
    'dict.field.prescription.route': 'Route of administration',
    'dict.field.prescription.course': 'Course duration',
    'dict.field.prescription.course.ph': 'e.g. 14 days / long-term',
    'dict.field.prescription.quantity': 'Quantity dispensed',
    'dict.field.prescription.indication': 'Indication',
    'dict.field.prescription.indication.ph': 'e.g. blood pressure control',
    'dict.field.prescription.conclusion': 'Conclusion / physician advice',
    'dict.field.prescription.conclusion.ph': 'The conclusion, advice or precautions given by the doctor',
    'dict.field.prescription.note': 'Personal notes',
    'dict.field.prescription.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 6. 用药记录 medication ---------------- */
    'dict.field.medication.drugName': 'Medication name',
    'dict.field.medication.dose': 'Dose per administration',
    'dict.field.medication.dose.ph': 'e.g. 1 tablet / 5 mg',
    'dict.field.medication.frequency': 'Frequency',
    'dict.field.medication.route': 'Route of administration',
    'dict.field.medication.startDate': 'Start date',
    'dict.field.medication.endDate': 'End date',
    'dict.field.medication.endDate.hint': 'Leave blank if you take it long-term',
    'dict.field.medication.longTerm': 'Long-term medication',
    'dict.field.medication.longTerm.hint': 'Highlighted on the dashboard and in consent summaries',
    'dict.field.medication.reason': 'Reason for taking',
    'dict.field.medication.reason.ph': 'e.g. blood pressure / blood sugar / calcium supplement',
    'dict.field.medication.adherence': 'Self-rated adherence',
    'dict.field.medication.sideEffect': 'Adverse effects',
    'dict.field.medication.sideEffect.ph': 'e.g. mild dry cough after each dose',
    'dict.field.medication.note': 'Personal notes',
    'dict.field.medication.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 7. 过敏史 allergy ---------------- */
    'dict.field.allergy.allergen': 'Allergen',
    'dict.field.allergy.allergen.ph': 'e.g. penicillin / mango / dust mites',
    'dict.field.allergy.allergenType': 'Allergen type',
    'dict.field.allergy.severity': 'Severity',
    'dict.field.allergy.severity.ph': 'Please select the severity',
    'dict.field.allergy.reactions': 'Typical reactions',
    'dict.field.allergy.foundDate': 'First noticed',
    'dict.field.allergy.confirmedBy': 'How it was confirmed',
    'dict.field.allergy.handling': 'Emergency management',
    'dict.field.allergy.handling.ph': 'e.g. stop the drug and take oral loratadine; seek care if severe',
    'dict.field.allergy.emergencyDrug': 'Emergency medication carried',
    'dict.field.allergy.note': 'Personal notes',
    'dict.field.allergy.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 8. 手术记录 surgery ---------------- */
    'dict.field.surgery.surgeryName': 'Procedure name',
    'dict.field.surgery.surgeryName.ph': 'e.g. laparoscopic cholecystectomy',
    'dict.field.surgery.surgeryDate': 'Surgery date',
    'dict.field.surgery.hospital': 'Healthcare facility',
    'dict.field.surgery.department': 'Department',
    'dict.field.surgery.department.ph': 'Please select a department',
    'dict.field.surgery.anesthesia': 'Anaesthesia',
    'dict.field.surgery.reason': 'Reason for surgery',
    'dict.field.surgery.outcome': 'Post-operative recovery',
    'dict.field.surgery.outcome.ph': 'e.g. recovered well, no complications',
    'dict.field.surgery.severity': 'Severity',
    'dict.field.surgery.severity.ph': 'Please select the severity',
    'dict.field.surgery.note': 'Personal notes',
    'dict.field.surgery.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 9. 住院记录 hospitalization ---------------- */
    'dict.field.hospitalization.admitDate': 'Admission date',
    'dict.field.hospitalization.dischargeDate': 'Discharge date',
    'dict.field.hospitalization.hospital': 'Healthcare facility',
    'dict.field.hospitalization.department': 'Department',
    'dict.field.hospitalization.department.ph': 'Please select a department',
    'dict.field.hospitalization.admitDiagnosis': 'Admission diagnosis',
    'dict.field.hospitalization.dischargeDiagnosis': 'Discharge diagnosis',
    'dict.field.hospitalization.bedNo': 'Bed number',
    'dict.field.hospitalization.attendingDoctor': 'Attending physician',
    'dict.field.hospitalization.cost': 'Cost of stay',
    'dict.field.hospitalization.cost.unit': 'CNY',
    'dict.field.hospitalization.summary': 'Course of stay',
    'dict.field.hospitalization.conclusion': 'Discharge instructions',
    'dict.field.hospitalization.conclusion.ph': 'The conclusion, advice or precautions given by the doctor',
    'dict.field.hospitalization.note': 'Personal notes',
    'dict.field.hospitalization.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 10. 疫苗接种 vaccination ---------------- */
    'dict.field.vaccination.vaccineName': 'Vaccine name',
    'dict.field.vaccination.vaccineName.ph': 'e.g. influenza / hepatitis B',
    'dict.field.vaccination.vaccineDate': 'Date administered',
    'dict.field.vaccination.doseNo': 'Dose number',
    'dict.field.vaccination.site': 'Administering site',
    'dict.field.vaccination.batchNo': 'Batch number',
    'dict.field.vaccination.manufacturer': 'Manufacturer',
    'dict.field.vaccination.reaction': 'Reaction after vaccination',
    'dict.field.vaccination.reaction.ph': 'e.g. mild soreness at the injection site, gone within a day',
    'dict.field.vaccination.note': 'Personal notes',
    'dict.field.vaccination.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 11. 体检报告 checkup ---------------- */
    'dict.field.checkup.checkupDate': 'Check-up date',
    'dict.field.checkup.institution': 'Check-up provider',
    'dict.field.checkup.checkupType': 'Check-up type',
    'dict.field.checkup.conclusion': 'Overall conclusion',
    'dict.field.checkup.conclusion.ph': 'e.g. elevated blood lipids, recheck advised',
    'dict.field.checkup.abnormalItems': 'Abnormal items',
    'dict.field.checkup.abnormalItems.ph': 'Type and press Enter, e.g. LDL cholesterol',
    'dict.field.checkup.advice': 'Health advice',
    'dict.field.checkup.nextDate': 'Recommended recheck date',
    'dict.field.checkup.attachmentId': 'Attachment ID',
    'dict.field.checkup.attachmentName': 'Attachment file name',
    'dict.field.checkup.attachmentType': 'Attachment type',
    'dict.field.checkup.attachmentSize': 'Attachment size',
    'dict.field.checkup.note': 'Personal notes',
    'dict.field.checkup.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 12. 家族病史 family ---------------- */
    'dict.field.family.relation': 'Relationship',
    'dict.field.family.diseaseName': 'Condition name',
    'dict.field.family.diseaseCat': 'Disease category',
    'dict.field.family.diseaseCat.ph': 'Please select the body system',
    'dict.field.family.onsetAge': 'Age at onset',
    'dict.field.family.onsetAge.unit': 'years',
    'dict.field.family.alive': 'Still living?',
    'dict.field.family.recordDate': 'Record date',
    'dict.field.family.note': 'Notes',
    'dict.field.family.note.ph': 'e.g. diagnosed at 65, currently well controlled on medication',

    /* ---------------- 13. 体征指标 vital ---------------- */
    'dict.field.vital.metricKey': 'Metric',
    'dict.field.vital.measuredAt': 'Measured at',
    'dict.field.vital.value': 'Value',
    'dict.field.vital.value2': 'Secondary value',
    'dict.field.vital.value2.hint': 'Fill this in for metrics that need two readings, such as diastolic pressure',
    'dict.field.vital.unit': 'Unit',
    'dict.field.vital.unit.ph': 'Filled in automatically',
    'dict.field.vital.measureWay': 'Measurement method',
    'dict.field.vital.context': 'Measurement context',
    'dict.field.vital.context.ph': 'e.g. fasting on waking / after exercise / 2 hours after medication',
    'dict.field.vital.note': 'Personal notes',
    'dict.field.vital.note.ph': 'Additional notes, visible only to you',

    /* ---------------- 14. 健康笔记 note ---------------- */
    'dict.field.note.noteDate': 'Date',
    'dict.field.note.title': 'Title',
    'dict.field.note.content': 'Content',
    'dict.field.note.tags': 'Tags',
    'dict.field.note.tags.ph': 'Type and press Enter, e.g. sleep / headache',

    /* ================================================================== *
     * 四、字段的行内候选项
     *     键：dict.field.<类型key>.<字段名>.opt.<选项key>
     *     共享字典（科室、严重程度、用药频次…）已由 core/dict.js 处理，
     *     这里只登记写在各记录类型内部的候选项。
     * ================================================================== */

    /* ---------- 就诊类型 ---------- */
    'dict.field.visit.visitType.opt.outpatient': 'Routine outpatient',
    'dict.field.visit.visitType.opt.expert': 'Specialist clinic',
    'dict.field.visit.visitType.opt.emergency': 'Emergency',
    'dict.field.visit.visitType.opt.followup': 'Follow-up',
    'dict.field.visit.visitType.opt.telemed': 'Online consultation',

    /* ---------- 疾病当前状态 ---------- */
    'dict.field.diagnosis.status.opt.active': 'Under treatment / not resolved',
    'dict.field.diagnosis.status.opt.control': 'Controlled / stable',
    'dict.field.diagnosis.status.opt.remission': 'In remission',
    'dict.field.diagnosis.status.opt.cured': 'Cured',

    /* ---------- 检查方式（选项 key 本身即中文，故词条键含中文） ---------- */
    'dict.field.imaging.modality.opt.X 光': 'X-ray',
    'dict.field.imaging.modality.opt.CT': 'CT',
    'dict.field.imaging.modality.opt.MRI': 'MRI',
    'dict.field.imaging.modality.opt.超声': 'Ultrasound',
    'dict.field.imaging.modality.opt.内镜': 'Endoscopy',
    'dict.field.imaging.modality.opt.心电图': 'ECG',
    'dict.field.imaging.modality.opt.骨密度': 'Bone densitometry',
    'dict.field.imaging.modality.opt.其他': 'Other',

    /* ---------- 依从性自评 ---------- */
    'dict.field.medication.adherence.opt.good': 'On time, full dose',
    'dict.field.medication.adherence.opt.fair': 'An occasional missed dose',
    'dict.field.medication.adherence.opt.poor': 'Frequent missed doses',

    /* ---------- 过敏确认方式 ---------- */
    'dict.field.allergy.confirmedBy.opt.test': 'Confirmed by hospital testing',
    'dict.field.allergy.confirmedBy.opt.self': 'Based on personal experience',
    'dict.field.allergy.confirmedBy.opt.family': 'Family history',

    /* ---------- 麻醉方式 ---------- */
    'dict.field.surgery.anesthesia.opt.general': 'General anaesthesia',
    'dict.field.surgery.anesthesia.opt.spinal': 'Neuraxial (spinal / epidural)',
    'dict.field.surgery.anesthesia.opt.local': 'Local anaesthesia',
    'dict.field.surgery.anesthesia.opt.none': 'None',

    /* ---------- 疫苗剂次 ---------- */
    'dict.field.vaccination.doseNo.opt.1': 'Dose 1',
    'dict.field.vaccination.doseNo.opt.2': 'Dose 2',
    'dict.field.vaccination.doseNo.opt.3': 'Dose 3',
    'dict.field.vaccination.doseNo.opt.booster': 'Booster',

    /* ---------- 体检类型 ---------- */
    'dict.field.checkup.checkupType.opt.routine': 'Routine check-up',
    'dict.field.checkup.checkupType.opt.employment': 'Pre-employment check-up',
    'dict.field.checkup.checkupType.opt.occupational': 'Occupational health check-up',
    'dict.field.checkup.checkupType.opt.senior': 'Senior health check-up',

    /* ---------- 亲属是否在世 ---------- */
    'dict.field.family.alive.opt.yes': 'Living',
    'dict.field.family.alive.opt.no': 'Deceased',
    'dict.field.family.alive.opt.unknown': 'Unknown',

    /* ---------- 体征测量方式 ---------- */
    'dict.field.vital.measureWay.opt.home': 'At home',
    'dict.field.vital.measureWay.opt.clinic': 'At a clinic',
    'dict.field.vital.measureWay.opt.device': 'Wearable device',

    /* ================================================================== *
     * 五、16 项体征指标的说明、分级建议与单位
     *     键：dict.metric.<key>.desc / .adviceNormal / .adviceWarn / .adviceCritical
     *         dict.metricUnit.<key>
     * ================================================================== */

    /* ---------- 血压 ---------- */
    'dict.metric.systolic.desc': 'The peak pressure in the arteries when the heart contracts. For home monitoring, measure for 7 consecutive days and average the readings.',
    'dict.metric.systolic.adviceNormal': 'Your blood pressure is in the ideal range. Keep up the low-salt diet and the regular daily routine.',
    'dict.metric.systolic.adviceWarn': 'Your blood pressure is outside the ideal range. Cut back on sodium, manage your weight and keep monitoring for a week.',
    'dict.metric.systolic.adviceCritical': 'Your blood pressure has reached a level that needs treatment. See a cardiologist promptly, and do not adjust your blood-pressure medication on your own.',

    'dict.metric.diastolic.desc': 'The lowest pressure in the arteries, when the heart relaxes between beats.',
    'dict.metric.diastolic.adviceNormal': 'Your diastolic pressure is normal.',
    'dict.metric.diastolic.adviceWarn': 'Your diastolic pressure is outside the ideal range. Pay attention to sleep quality and emotional stress.',
    'dict.metric.diastolic.adviceCritical': 'Your diastolic pressure is clearly abnormal. Seek medical assessment promptly.',

    /* ---------- 血糖 ---------- */
    'dict.metric.glucose.desc': 'Blood glucose from a venous or finger-prick sample taken after at least 8 hours of fasting.',
    'dict.metric.glucose.adviceNormal': 'Your fasting glucose is normal. Keep refined carbohydrates in check.',
    'dict.metric.glucose.adviceWarn': 'Your fasting glucose is too high or too low. Have HbA1c rechecked and start logging post-meal glucose.',
    'dict.metric.glucose.adviceCritical': 'Your blood glucose is markedly abnormal, which carries a risk of acute complications. Seek medical care immediately.',

    'dict.metric.hba1c.desc': 'Reflects average blood glucose over the past 2–3 months. Usually rechecked every 3 months.',
    'dict.metric.hba1c.adviceNormal': 'Your blood glucose has been well controlled over the past three months.',
    'dict.metric.hba1c.adviceWarn': 'Long-term glucose control is suboptimal. Discuss your treatment plan with an endocrinologist.',
    'dict.metric.hba1c.adviceCritical': 'Your HbA1c is markedly elevated and your treatment plan needs adjusting without delay.',

    /* ---------- 心血管 ---------- */
    'dict.metric.heartRate.desc': 'Heartbeats per minute at rest. Measure in the morning, before getting out of bed.',
    'dict.metric.heartRate.adviceNormal': 'Your resting heart rate is normal.',
    'dict.metric.heartRate.adviceWarn': 'Your heart rate is outside the normal range. Consider whether caffeine, fever or emotional stress may be involved.',
    'dict.metric.heartRate.adviceCritical': 'Your heart rate is clearly abnormal. Seek care immediately if you also have chest tightness or fainting.',
    'dict.metricUnit.heartRate': 'bpm',

    /* ---------- 体型 ---------- */
    'dict.metric.weight.desc': 'There is no absolute normal weight. What the system looks at is your trend over time and your BMI.',
    'dict.metric.weight.adviceNormal': 'Weigh yourself at the same time each week, fasting and in similar clothing, and record it.',
    'dict.metric.weight.adviceWarn': 'If your weight is changing quickly, watch your diet and look out for swelling.',
    'dict.metric.weight.adviceCritical': 'Your weight has changed markedly in a short period. See a doctor to find out why.',

    'dict.metric.bmi.desc': 'BMI = weight (kg) ÷ height (m)². For Chinese adults, 18.5–23.9 is considered normal.',
    'dict.metric.bmi.adviceNormal': 'Your weight is in the healthy range.',
    'dict.metric.bmi.adviceWarn': 'You are underweight or overweight. Adjust gradually through diet and exercise, and avoid rapid weight loss.',
    'dict.metric.bmi.adviceCritical': 'Your BMI falls in the obese or severely underweight range. Have it assessed by a dietitian or an endocrinologist.',

    'dict.metric.waist.desc': 'For Chinese adults, ≥90 cm in men and ≥85 cm in women suggests central obesity. The thresholds used here are generic.',
    'dict.metric.waist.adviceNormal': 'Your waist circumference is within a reasonable range.',
    'dict.metric.waist.adviceWarn': 'Your waist is on the large side, which raises visceral fat risk. Add more aerobic exercise.',
    'dict.metric.waist.adviceCritical': 'Your waist circumference is well above the threshold and the risk of metabolic syndrome is high. Seek medical assessment.',

    /* ---------- 其他 ---------- */
    'dict.metric.temperature.desc': 'An axillary temperature of 36.0–37.2 °C is normal.',
    'dict.metric.temperature.adviceNormal': 'Your temperature is normal.',
    'dict.metric.temperature.adviceWarn': 'You have a low-grade fever, or a lower-than-normal temperature. Rest, drink plenty of fluids, and see a doctor if it lasts more than 3 days.',
    'dict.metric.temperature.adviceCritical': 'High fever or hypothermia — seek medical care immediately.',

    'dict.metric.spo2.desc': 'Arterial oxygen saturation, as measured by a finger-pulse oximeter.',
    'dict.metric.spo2.adviceNormal': 'Your blood oxygen is normal.',
    'dict.metric.spo2.adviceWarn': 'Your blood oxygen is low. If you also have a cough or shortness of breath, see a respiratory specialist promptly.',
    'dict.metric.spo2.adviceCritical': 'Your blood oxygen has dropped sharply. This is an emergency — seek care or call emergency services now.',

    'dict.metric.ldl.desc': 'Commonly called "bad cholesterol". A major risk factor for atherosclerosis.',
    'dict.metric.ldl.adviceNormal': 'Your blood lipids are well controlled.',
    'dict.metric.ldl.adviceWarn': 'Your LDL-C is high. Cut back on saturated fat and exercise more.',
    'dict.metric.ldl.adviceCritical': 'Your LDL-C is markedly elevated. Ask a cardiologist whether statin therapy is needed.',

    'dict.metric.uricAcid.desc': 'Raised uric acid is linked to gout and kidney stones.',
    'dict.metric.uricAcid.adviceNormal': 'Your uric acid is normal.',
    'dict.metric.uricAcid.adviceWarn': 'Your uric acid is high. Limit high-purine foods and alcohol, and drink more water.',
    'dict.metric.uricAcid.adviceCritical': 'Your uric acid is markedly elevated. See a rheumatologist to have treatment assessed.',

    'dict.metric.creatinine.desc': 'A basic marker of kidney function.',
    'dict.metric.creatinine.adviceNormal': 'Your kidney function marker is normal.',
    'dict.metric.creatinine.adviceWarn': 'Your creatinine is outside the reference range. Avoid nephrotoxic drugs and have it rechecked.',
    'dict.metric.creatinine.adviceCritical': 'Your creatinine is clearly abnormal. See a nephrologist as soon as possible.',

    'dict.metric.alt.desc': 'A commonly used marker of liver-cell damage.',
    'dict.metric.alt.adviceNormal': 'Your liver function marker is normal.',
    'dict.metric.alt.adviceWarn': 'Your ALT is mildly raised. Avoid alcohol, keep a regular routine, and recheck in 2–4 weeks.',
    'dict.metric.alt.adviceCritical': 'Your ALT is markedly elevated. See a gastroenterologist or hepatologist promptly.',

    'dict.metric.sleepHours.desc': 'Hours actually slept the previous night.',
    'dict.metric.sleepHours.adviceNormal': 'Your sleep duration is appropriate.',
    'dict.metric.sleepHours.adviceWarn': 'You are sleeping too little or too much, which affects blood pressure and glucose over time. Keep a consistent schedule.',
    'dict.metric.sleepHours.adviceCritical': 'Your sleep duration is far from the recommended range. If mood problems come with it, consider a sleep clinic.',
    'dict.metricUnit.sleepHours': 'h',

    'dict.metric.steps.desc': 'Total steps per day, taken from your phone or fitness band.',
    'dict.metric.steps.adviceNormal': 'Your activity level meets the target.',
    'dict.metric.steps.adviceWarn': 'Your activity level is low. Add a 20-minute brisk walk each day.',
    'dict.metric.steps.adviceCritical': 'Prolonged sitting markedly raises the risk of chronic disease. Increase your daily activity gradually.',
    'dict.metricUnit.steps': 'steps',

    /* ================================================================== *
     * 六、表单校验提示（core/models.js）
     *     {label} 会被替换成该字段的英文标签
     * ================================================================== */
    'model.err.required': 'Please fill in “{label}”',
    'model.err.notNumber': '“{label}” must be a number',
    'model.err.min': '“{label}” cannot be less than {min}',
    'model.err.max': '“{label}” cannot be greater than {max}',
    'model.err.dateFormat': '“{label}” is not a valid date',
    'model.err.phone': 'Please enter a valid mobile number',

    'model.user.err.username': 'Please enter your account',
    'model.user.err.usernameFormat': 'Account must be 3–32 characters: letters, digits, underscore or an email address',
    'model.user.err.password': 'Please enter your password',
    'model.user.err.passwordLength': 'Password must be at least {n} characters',
    'model.user.err.passwordMismatch': 'The two passwords do not match',

    'model.profile.err.realName': 'Please enter your name',
    'model.profile.err.gender': 'Please select your sex',
    'model.profile.err.birthDate': 'Please select your date of birth',
    'model.profile.err.birthDateFuture': 'Date of birth cannot be later than today',
    'model.profile.err.height': 'Height must be between 50 and 250 cm',
    'model.profile.err.weight': 'Weight must be between 10 and 300 kg',

    'model.record.err.endBeforeStart': 'End date cannot be earlier than start date',
    'model.record.err.dischargeBeforeAdmit': 'Discharge date cannot be earlier than admission date',

    /* ================================================================== *
     * 七、安全治理层（core/security.js）
     * ================================================================== */

    /* ---------- 口令策略：问题描述 ---------- */
    'pwd.issue.minLength': 'at least {n} characters',
    'pwd.issue.letter': 'must contain a letter',
    'pwd.issue.digit': 'must contain a digit',
    'pwd.issue.repeat': 'cannot be a single repeated character',
    'pwd.issue.common': 'cannot start with a common weak password',
    'pwd.issue.allDigits': 'cannot be all digits',
    'pwd.strengthPrefix': 'Password strength: ',

    /* ---------- 安全体检（安全设置页的结论列表） ---------- */
    'sec.item.hash.name': 'Hashed password storage',
    'sec.item.hash.detail': 'Passwords are stored as salted SHA-256 hashes. No plaintext password exists in the database.',
    'sec.item.mfa.name': 'Two-factor authentication',
    'sec.item.mfa.on': 'Enabled. Signing in requires a second confirmation via “{factors}”.',
    'sec.item.mfa.off': 'Not enabled. We recommend turning on SMS verification or face recognition.',
    'sec.item.remember.name': 'Staying signed in',
    'sec.item.remember.detail': 'Your sign-in is kept for {n} days, so reopening the browser does not ask for your password again. Change this under Preferences & Security.',
    'sec.item.audit.name': 'Access trail',
    'sec.item.audit.detail': 'Every read and write of your records is written to the audit log, viewable under Access Log.',
    'sec.item.storage.name': 'Storage',
    'sec.item.storage.on': 'Local storage is available. Your data stays on this device and is not shared externally.',
    'sec.item.storage.off': 'Local storage is disabled in this browser. Data is held in memory only and is lost when the page closes.',

    /* ---------- 异常访问检测规则 ---------- */
    'sec.rule.brute_force.name': 'Possible brute-force attack',
    'sec.rule.brute_force.desc': 'Repeated sign-in failures on the same account in a short period',
    'sec.rule.brute_force.detail': 'There were {n} failed sign-in attempts in the last 10 minutes. Someone may be trying to break into this account.',
    'sec.rule.brute_force.suggestion': 'Change your password now, and make sure SMS verification and face recognition are enabled.',

    'sec.rule.account_locked.name': 'Account locked',
    'sec.rule.account_locked.desc': 'The account was temporarily locked after hitting the sign-in failure threshold',
    'sec.rule.account_locked.detail': 'The account was locked at {at} after repeated failed sign-ins.',
    'sec.rule.account_locked.suggestion': 'If this was not you, change your password and check the phone number registered to the account.',

    'sec.rule.off_hours_access.name': 'Access outside normal hours',
    'sec.rule.off_hours_access.desc': 'Health records accessed between midnight and 6 a.m.',
    'sec.rule.off_hours_access.detail': '{n} record access(es) were detected in the early hours. The most recent was at {at}.',
    'sec.rule.off_hours_access.suggestion': 'Unless it was an emergency, consider revoking that consent and checking with the doctor.',

    'sec.rule.bulk_read.name': 'Bulk viewing in a short window',
    'sec.rule.bulk_read.desc': 'A large number of records viewed under a single consent in a very short time',
    'sec.rule.bulk_read.detail': 'Consent {name} was used to view records {n} times within 24 hours.',
    'sec.rule.bulk_read.suggestion': 'If this goes beyond your care needs, revoke the consent promptly.',

    'sec.rule.denied_access.name': 'Out-of-scope access blocked',
    'sec.rule.denied_access.desc': 'A doctor tried to access data outside the granted scope',
    'sec.rule.denied_access.detail': '{n} access request(s) were blocked for exceeding the granted scope. The most recent was at {at}.',
    'sec.rule.denied_access.suggestion': 'The system blocked them automatically. Keep an eye on this doctor’s further activity.',

    'sec.rule.export_activity.name': 'Data export activity',
    'sec.rule.export_activity.desc': 'Health data was exported — please confirm it was you',
    'sec.rule.export_activity.detail': 'Full health data was exported {n} time(s) in the last 7 days.',
    'sec.rule.export_activity.suggestion': 'Exported files contain sensitive information. Keep them safe and do not forward them over insecure channels.',

    /* ================================================================== *
     * 八、通用组件文案（ui/components/*）
     *     · 与 core/i18n/en-US.js 里已有的 ui.* 词条合并使用，
     *       已存在的键此处不重复登记。
     * ================================================================== */

    /* ---------- 空状态 / 加载 / 错误（empty.js） ---------- */
    'ui.tableEmptyHint': 'Try a different filter, or add a new record.',

    /* ---------- 分页器（table.js） ---------- */
    'ui.pagerInfo': '{total} in total, page {page} of {pages}',

    /* ---------- 表单（form.js） ---------- */
    'ui.selectPlaceholder': 'Please select…',
    'ui.tagsPlaceholder': 'Type and press Enter',
    'ui.addTag': 'Add tag',
    'ui.remove': 'Remove',
    'ui.yes': 'Yes',
    'ui.kvSep': ': ',
    'ui.listSep': ', ',
    'ui.formTitle': 'Enter information',

    /* ---------- 弹窗与确认（modal.js） ---------- */
    'ui.dialog': 'Dialog',
    'ui.detail': 'Details',
    'ui.confirmTitle': 'Please confirm',
    'ui.confirmMessage': 'Are you sure you want to do this?',
    'ui.confirmType': 'Type',
    'ui.confirmTypeSuffix': 'to confirm',
    'ui.confirmMismatch': 'The confirmation text did not match',

    /* ---------- 文案分隔符（models.js / security.js） ---------- */
    'ui.semiSep': '; ',

    /* ================================================================== *
     * 九、应用外壳（ui/shell.js）
     * ================================================================== */
    'shell.appTitle': 'Personal Health Record',
    'shell.mainNav': 'Main navigation',
    'shell.doctorGuest': 'Doctor guest',
    'shell.blockedTitle': 'Access blocked',
    'shell.authMissing': 'The account security module did not load. Check that the scripts under modules/auth are included correctly.',
    'shell.renderError': 'Failed to render the page: ',
    'shell.mountError': 'Failed to mount the page: ',

    /* ---------- 未登录页的品牌区 ---------- */
    'shell.brandHeadline': 'All your scattered<br>health information,<br>in one secure place',
    'shell.brandLead': 'Check-up reports, diagnoses, prescriptions, medications and allergies are scattered across different hospitals, dates and formats. This system gives you one secure, centralised and searchable entry point that helps you understand your own health.',
    'shell.point.secure': '<b>Secure</b>: two-factor sign-in, salted password hashing, automatic session timeout',
    'shell.point.controlled': '<b>Controlled</b>: 14 record types under one roof, every edit versioned',
    'shell.point.understandable': '<b>Understandable</b>: trend charts, abnormal-result alerts and preventive advice',
    'shell.point.traceable': '<b>Traceable</b>: doctor access is time- and scope-limited, and every view is logged',

    /* ---------- 语言对话框的补充说明 ---------- */
    'i18n.entryNote': '{n} English entries are registered under <code>core/i18n/en-US*.js</code>. Whenever you spot a line that is still in Chinese, add one entry there — no view code needs to change.',

    /* ================================================================== *
     * 十、通用组件补充（badge / dom / router）
     * ================================================================== */
    'badge.delta.same': '— Same as last time',
    'badge.delta.up': '▲ {value}{unit} vs last time',
    'badge.delta.down': '▼ {value}{unit} vs last time',

    'ui.dom.downloadFail': 'Download failed',

    'router.listenerFail': 'Route listener failed'
  });

})(window.PHR);
