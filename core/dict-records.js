/**
 * ============================================================================
 * 文件：core/dict-records.js
 * 层：核心基础设施层（数据字典 · 第二部分：健康记录类型）
 * 职责：定义"档案中心"支持的全部记录类型，以及每种类型的表单字段模式(schema)。
 *      档案编辑视图、搜索索引、时间线、审计与授权范围校验都从本表读取定义，
 *      做到"新增一种记录类型只需改这一个文件"。
 * 依赖：core/dict.js
 * ============================================================================
 *
 * 字段模式(field schema)说明：
 *   name        字段名（存储键）
 *   label       界面标签
 *   i18n        该字段标签的词条键（文件末尾自动生成：dict.field.<类型key>.<字段名>）
 *   type        text | textarea | date | datetime | number | select | multiselect
 *               | tags | checkbox | range
 *   required    是否必填
 *   options     当 type 为 select / multiselect 时的候选项（数组或函数）
 *   unit        单位后缀（数字类字段）
 *   min / max / step   数字类字段约束
 *   placeholder 占位提示
 *   hint        字段下方说明文字
 *   span        栅格宽度：1 = 半行，2 = 整行
 *
 * 记录类型(record type)说明：
 *   key         类型标识
 *   name        中文名称
 *   icon        图标
 *   color       主题色（用于时间线圆点与标签）
 *   diseaseCat  默认疾病分类（可被记录本身覆盖，用于搜索筛选与统计）
 *   scope       该类型数据归属的授权范围 key（见 core/dict.js → consentScope）
 *   titleField  用哪个字段作为记录的"标题"（列表 / 时间线 / 搜索结果展示）
 *   dateField   用哪个字段作为记录的"发生日期"（排序 / 时间筛选）
 *   desc        给用户看的一句话说明
 *   fields      表单字段模式数组
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var D = PHR.dict;

  /* ------------------------------------------------------------------ *
   * 医疗机构下拉的候选项。
   * 刻意写成函数而不是常量：机构名与等级都要随语言切换，
   * 必须在渲染表单的那一刻求值（form.js / models.js 都支持 options 传函数）。
   * ------------------------------------------------------------------ */
  function hospitalOptions() {
    var en = !!(PHR.i18n && PHR.i18n.isEn && PHR.i18n.isEn());
    var lb = en ? ' (' : '（', rb = en ? ')' : '）';
    return D.hospital.map(function (h) {
      return {
        key: h.key,
        name: D.nameOf(D.hospital, h.key) +
          lb + PHR.t('dict.hospital.' + h.key + '.level', h.level) + rb
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * 通用字段模板：多数"就诊类"记录都会用到的字段
   * 使用 Object.assign 浅拷贝后拼接到各类型的 fields 中，避免重复书写。
   * ------------------------------------------------------------------ */
  var F = {
    hospital: {
      name: 'hospital', label: '医疗机构', type: 'select', required: true,
      options: hospitalOptions
    },
    department: {
      name: 'department', label: '科室', type: 'select',
      options: D.department, placeholder: '请选择科室'
    },
    doctor: { name: 'doctor', label: '医生', type: 'text', placeholder: '如：李建国 医师' },
    conclusion: { name: 'conclusion', label: '结论 / 医师意见', type: 'textarea', span: 2, placeholder: '医生给出的结论、建议或注意事项' },
    note: { name: 'note', label: '本人备注', type: 'textarea', span: 2, placeholder: '补充说明，仅自己可见' },
    severity: {
      name: 'severity', label: '严重程度', type: 'select', required: true,
      options: D.severity, placeholder: '请选择严重程度'
    },
    diseaseCat: {
      name: 'diseaseCat', label: '疾病分类', type: 'select',
      options: D.diseaseCategory, placeholder: '请选择所属系统'
    }
  };

  /** 复制一个通用字段模板并允许覆盖属性 */
  function f(tpl, over) {
    return Object.assign({}, tpl, over || {});
  }

  /* ================================================================== *
   * 记录类型总表
   * ================================================================== */
  D.recordTypes = [

    /* ---------------------------------------------------------------- *
     * 1. 门诊 / 就诊记录
     * ---------------------------------------------------------------- */
    {
      key: 'visit', name: '门诊就诊', icon: '🏥', color: '#3b82f6',
      diseaseCat: 'other', scope: 'visit',
      titleField: 'chiefComplaint', dateField: 'visitDate',
      desc: '一次门诊或急诊的就诊经过，包含主诉、诊断与处置意见。',
      fields: [
        { name: 'visitDate', label: '就诊日期', type: 'date', required: true },
        f(F.hospital), f(F.department), f(F.doctor),
        { name: 'visitType', label: '就诊类型', type: 'select', required: true,
          options: [
            { key: 'outpatient', name: '普通门诊' },
            { key: 'expert',     name: '专家门诊' },
            { key: 'emergency',  name: '急诊' },
            { key: 'followup',   name: '复诊' },
            { key: 'telemed',    name: '互联网问诊' }
          ] },
        { name: 'chiefComplaint', label: '主诉', type: 'text', required: true, span: 2,
          placeholder: '如：反复头晕 3 天' },
        { name: 'diagnosis', label: '诊断', type: 'text', span: 2, placeholder: '如：原发性高血压 2 级' },
        f(F.diseaseCat),
        { name: 'treatment', label: '处置意见', type: 'textarea', span: 2,
          placeholder: '用药方案、检查安排或随访要求' },
        { name: 'cost', label: '费用', type: 'number', unit: '元', min: 0, step: 0.01 },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 2. 确诊疾病 / 既往病史
     * ---------------------------------------------------------------- */
    {
      key: 'diagnosis', name: '确诊疾病', icon: '🩺', color: '#ef4444',
      diseaseCat: 'other', scope: 'history',
      titleField: 'diseaseName', dateField: 'diagnosedDate',
      desc: '被正式确诊的疾病，是既往病史与风险评估的核心依据。',
      fields: [
        { name: 'diseaseName', label: '疾病名称', type: 'text', required: true, span: 2,
          placeholder: '如：2 型糖尿病' },
        f(F.diseaseCat, { required: true }),
        f(F.severity),
        { name: 'diagnosedDate', label: '确诊日期', type: 'date', required: true },
        { name: 'status', label: '当前状态', type: 'select', required: true,
          options: [
            { key: 'active',   name: '治疗中 / 未愈' },
            { key: 'control',  name: '已控制 / 稳定' },
            { key: 'remission',name: '已缓解' },
            { key: 'cured',    name: '已治愈' }
          ] },
        f(F.hospital), f(F.department), f(F.doctor),
        { name: 'basis', label: '诊断依据', type: 'textarea', span: 2,
          placeholder: '如：空腹血糖 8.9 mmol/L，糖化血红蛋白 7.8%' },
        f(F.conclusion), f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 3. 检验报告（化验）
     * ---------------------------------------------------------------- */
    {
      key: 'lab', name: '检验报告', icon: '🧪', color: '#8b5cf6',
      diseaseCat: 'other', scope: 'lab',
      titleField: 'itemName', dateField: 'reportDate',
      desc: '血常规、生化、尿检等化验单结果。',
      fields: [
        { name: 'reportDate', label: '报告日期', type: 'date', required: true },
        f(F.hospital, { required: true }), f(F.department),
        { name: 'itemName', label: '检验项目', type: 'text', required: true, span: 2,
          placeholder: '如：空腹血糖 / 糖化血红蛋白 / 低密度脂蛋白' },
        { name: 'result', label: '检验结果', type: 'number', required: true, step: 0.01 },
        { name: 'unit', label: '单位', type: 'text', placeholder: '如：mmol/L' },
        { name: 'refRange', label: '参考范围', type: 'text', span: 2,
          placeholder: '如：3.9 - 6.1' },
        { name: 'abnormal', label: '结果异常', type: 'checkbox',
          hint: '勾选后该条记录会参与健康洞察的异常统计' },
        f(F.diseaseCat),
        { name: 'impression', label: '检验结论', type: 'textarea', span: 2 },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 4. 影像 / 特殊检查
     * ---------------------------------------------------------------- */
    {
      key: 'imaging', name: '影像检查', icon: '🩻', color: '#06b6d4',
      diseaseCat: 'other', scope: 'lab',
      titleField: 'modality', dateField: 'examDate',
      desc: 'CT、MRI、X 光、超声、内镜等影像与特殊检查。',
      fields: [
        { name: 'examDate', label: '检查日期', type: 'date', required: true },
        f(F.hospital, { required: true }), f(F.department),
        { name: 'modality', label: '检查方式', type: 'select', required: true,
          options: [
            { key: 'X 光',    name: 'X 光' },
            { key: 'CT',      name: 'CT' },
            { key: 'MRI',     name: 'MRI 核磁共振' },
            { key: '超声',    name: '超声' },
            { key: '内镜',    name: '内镜' },
            { key: '心电图',  name: '心电图' },
            { key: '骨密度',  name: '骨密度' },
            { key: '其他',    name: '其他' }
          ] },
        { name: 'bodyPart', label: '检查部位', type: 'text', required: true,
          placeholder: '如：胸部 / 腹部 / 头颅' },
        { name: 'findings', label: '影像所见', type: 'textarea', span: 2 },
        { name: 'impression', label: '影像结论', type: 'textarea', span: 2, required: true },
        f(F.severity),
        f(F.diseaseCat),
        { name: 'attachment', label: '报告附件', type: 'text', span: 2,
          placeholder: '报告编号或存放位置' },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 5. 处方
     * ---------------------------------------------------------------- */
    {
      key: 'prescription', name: '处方', icon: '📋', color: '#f59e0b',
      diseaseCat: 'other', scope: 'medication',
      titleField: 'drugName', dateField: 'prescribedDate',
      desc: '医生开具的处方，一条记录对应一种药品。',
      fields: [
        { name: 'prescribedDate', label: '开方日期', type: 'date', required: true },
        f(F.hospital, { required: true }), f(F.department), f(F.doctor),
        { name: 'drugName', label: '药品名称', type: 'text', required: true, span: 2,
          placeholder: '如：苯磺酸氨氯地平片' },
        { name: 'spec', label: '规格', type: 'text', placeholder: '如：5mg × 7 片' },
        { name: 'dose', label: '单次剂量', type: 'text', placeholder: '如：5mg' },
        { name: 'frequency', label: '服用频次', type: 'select', options: D.medFrequency },
        { name: 'route', label: '给药途径', type: 'select', options: D.medRoute },
        { name: 'course', label: '疗程', type: 'text', placeholder: '如：14 天 / 长期' },
        { name: 'quantity', label: '开药数量', type: 'number', min: 0 },
        { name: 'indication', label: '用药目的', type: 'text', span: 2,
          placeholder: '如：控制血压' },
        f(F.conclusion), f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 6. 用药记录（自主管理）
     * ---------------------------------------------------------------- */
    {
      key: 'medication', name: '用药记录', icon: '💊', color: '#10b981',
      diseaseCat: 'other', scope: 'medication',
      titleField: 'drugName', dateField: 'startDate',
      desc: '自己正在服用或曾经服用的药物，含保健品。',
      fields: [
        { name: 'drugName', label: '药品名称', type: 'text', required: true, span: 2 },
        { name: 'dose', label: '单次剂量', type: 'text', required: true, placeholder: '如：1 片 / 5mg' },
        { name: 'frequency', label: '服用频次', type: 'select', required: true, options: D.medFrequency },
        { name: 'route', label: '给药途径', type: 'select', options: D.medRoute },
        { name: 'startDate', label: '开始日期', type: 'date', required: true },
        { name: 'endDate', label: '结束日期', type: 'date', hint: '长期服用可留空' },
        { name: 'longTerm', label: '长期用药', type: 'checkbox', hint: '勾选后会在首页与授权摘要中高亮提示' },
        { name: 'reason', label: '用药原因', type: 'text', span: 2, placeholder: '如：降压 / 降糖 / 补钙' },
        { name: 'adherence', label: '依从性自评', type: 'select',
          options: [
            { key: 'good', name: '按时按量' },
            { key: 'fair', name: '偶尔漏服' },
            { key: 'poor', name: '经常漏服' }
          ] },
        { name: 'sideEffect', label: '不良反应', type: 'textarea', span: 2,
          placeholder: '如：服药后轻微干咳' },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 7. 过敏史
     * ---------------------------------------------------------------- */
    {
      key: 'allergy', name: '过敏史', icon: '⚠️', color: '#dc2626',
      diseaseCat: 'immune', scope: 'allergy',
      titleField: 'allergen', dateField: 'foundDate',
      desc: '药物、食物、接触物等过敏原及反应，就医时必须让医生看到。',
      fields: [
        { name: 'allergen', label: '过敏原', type: 'text', required: true, span: 2,
          placeholder: '如：青霉素 / 芒果 / 尘螨' },
        { name: 'allergenType', label: '过敏类型', type: 'select', required: true, options: D.allergenType },
        f(F.severity, { label: '严重程度', required: true }),
        { name: 'reactions', label: '典型反应', type: 'multiselect', options: D.allergyReaction, span: 2 },
        { name: 'foundDate', label: '首次发现日期', type: 'date' },
        { name: 'confirmedBy', label: '确认方式', type: 'select',
          options: [
            { key: 'test',   name: '医院检测确认' },
            { key: 'self',   name: '本人经历判断' },
            { key: 'family', name: '家族遗传' }
          ] },
        { name: 'handling', label: '应急处理', type: 'textarea', span: 2,
          placeholder: '如：立即停药并口服氯雷他定，严重时就医' },
        { name: 'emergencyDrug', label: '随身急救药', type: 'text', span: 2 },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 8. 手术记录
     * ---------------------------------------------------------------- */
    {
      key: 'surgery', name: '手术记录', icon: '🔪', color: '#7c3aed',
      diseaseCat: 'other', scope: 'history',
      titleField: 'surgeryName', dateField: 'surgeryDate',
      desc: '曾经接受过的手术。',
      fields: [
        { name: 'surgeryName', label: '手术名称', type: 'text', required: true, span: 2,
          placeholder: '如：腹腔镜胆囊切除术' },
        { name: 'surgeryDate', label: '手术日期', type: 'date', required: true },
        f(F.hospital, { required: true }), f(F.department),
        { name: 'anesthesia', label: '麻醉方式', type: 'select',
          options: [
            { key: 'general',  name: '全身麻醉' },
            { key: 'spinal',   name: '椎管内麻醉' },
            { key: 'local',    name: '局部麻醉' },
            { key: 'none',     name: '无麻醉' }
          ] },
        { name: 'reason', label: '手术原因', type: 'text', span: 2 },
        { name: 'outcome', label: '术后恢复', type: 'textarea', span: 2,
          placeholder: '如：恢复良好，无并发症' },
        f(F.severity),
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 9. 住院记录
     * ---------------------------------------------------------------- */
    {
      key: 'hospitalization', name: '住院记录', icon: '🛏️', color: '#0ea5e9',
      diseaseCat: 'other', scope: 'history',
      titleField: 'admitDiagnosis', dateField: 'admitDate',
      desc: '一次住院经历，含入院与出院诊断。',
      fields: [
        { name: 'admitDate', label: '入院日期', type: 'date', required: true },
        { name: 'dischargeDate', label: '出院日期', type: 'date', required: true },
        f(F.hospital, { required: true }), f(F.department),
        { name: 'admitDiagnosis', label: '入院诊断', type: 'text', required: true, span: 2 },
        { name: 'dischargeDiagnosis', label: '出院诊断', type: 'text', required: true, span: 2 },
        { name: 'bedNo', label: '床号', type: 'text' },
        { name: 'attendingDoctor', label: '主治医生', type: 'text' },
        { name: 'cost', label: '住院费用', type: 'number', unit: '元', min: 0, step: 0.01 },
        { name: 'summary', label: '住院经过', type: 'textarea', span: 2 },
        f(F.conclusion, { label: '出院医嘱' }),
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 10. 疫苗接种
     * ---------------------------------------------------------------- */
    {
      key: 'vaccination', name: '疫苗接种', icon: '💉', color: '#22c55e',
      diseaseCat: 'infectious', scope: 'history',
      titleField: 'vaccineName', dateField: 'vaccineDate',
      desc: '疫苗接种记录，对出行、入学与就医都有用。',
      fields: [
        { name: 'vaccineName', label: '疫苗名称', type: 'text', required: true, span: 2,
          placeholder: '如：流感疫苗 / 乙肝疫苗' },
        { name: 'vaccineDate', label: '接种日期', type: 'date', required: true },
        { name: 'doseNo', label: '剂次', type: 'select',
          options: [
            { key: '1', name: '第 1 剂' }, { key: '2', name: '第 2 剂' },
            { key: '3', name: '第 3 剂' }, { key: 'booster', name: '加强针' }
          ] },
        { name: 'site', label: '接种机构', type: 'text', span: 2 },
        { name: 'batchNo', label: '疫苗批号', type: 'text' },
        { name: 'manufacturer', label: '生产企业', type: 'text' },
        { name: 'reaction', label: '接种后反应', type: 'textarea', span: 2,
          placeholder: '如：接种部位轻微酸痛，1 天后缓解' },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 11. 体检报告
     * ---------------------------------------------------------------- */
    {
      key: 'checkup', name: '体检报告', icon: '📊', color: '#14b8a6',
      diseaseCat: 'other', scope: 'lab',
      titleField: 'conclusion', dateField: 'checkupDate',
      desc: '年度或入职体检的整体结论。',
      fields: [
        { name: 'checkupDate', label: '体检日期', type: 'date', required: true },
        { name: 'institution', label: '体检机构', type: 'text', required: true, span: 2 },
        { name: 'checkupType', label: '体检类型', type: 'select',
          options: [
            { key: 'routine',  name: '常规体检' },
            { key: 'employment', name: '入职体检' },
            { key: 'occupational', name: '职业健康体检' },
            { key: 'senior',   name: '老年专项体检' }
          ] },
        { name: 'conclusion', label: '体检结论', type: 'text', required: true, span: 2,
          placeholder: '如：血脂偏高，建议复查' },
        { name: 'abnormalItems', label: '异常项目', type: 'tags', span: 2,
          placeholder: '输入后按回车添加，如：低密度脂蛋白' },
        { name: 'advice', label: '健康建议', type: 'textarea', span: 2 },
        { name: 'nextDate', label: '建议复查日期', type: 'date' },
        /* 二进制文件保存在 IndexedDB；记录与版本快照只保存轻量元数据。
           hidden 字段仍属于 schema，因此编辑、回滚和备份记录时不会丢失附件引用。 */
        { name: 'attachmentId', label: '附件 ID', type: 'hidden' },
        { name: 'attachmentName', label: '附件文件名', type: 'hidden' },
        { name: 'attachmentType', label: '附件类型', type: 'hidden' },
        { name: 'attachmentSize', label: '附件大小', type: 'hidden' },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 12. 家族病史
     * ---------------------------------------------------------------- */
    {
      key: 'family', name: '家族病史', icon: '👪', color: '#a855f7',
      diseaseCat: 'other', scope: 'family',
      titleField: 'diseaseName', dateField: 'recordDate',
      desc: '亲属的疾病情况，用于遗传风险评估。',
      fields: [
        { name: 'relation', label: '亲属关系', type: 'select', required: true, options: D.familyRelation },
        { name: 'diseaseName', label: '疾病名称', type: 'text', required: true },
        f(F.diseaseCat, { required: true }),
        { name: 'onsetAge', label: '发病年龄', type: 'number', min: 0, max: 120, unit: '岁' },
        { name: 'alive', label: '是否在世', type: 'select',
          options: [
            { key: 'yes', name: '在世' },
            { key: 'no',  name: '已故' },
            { key: 'unknown', name: '不详' }
          ] },
        { name: 'recordDate', label: '记录日期', type: 'date', required: true },
        { name: 'note', label: '备注', type: 'textarea', span: 2,
          placeholder: '如：65 岁确诊，目前药物控制良好' }
      ]
    },

    /* ---------------------------------------------------------------- *
     * 13. 体征指标（趋势图的数据源）
     * ---------------------------------------------------------------- */
    {
      key: 'vital', name: '体征指标', icon: '📈', color: '#e11d48',
      diseaseCat: 'other', scope: 'vital',
      titleField: 'metricName', dateField: 'measuredAt',
      desc: '血压、血糖、心率等可量化的身体指标，是趋势图与异常提醒的数据来源。',
      fields: [
        { name: 'metricKey', label: '指标类型', type: 'select', required: true, span: 2,
          // options 支持传函数：渲染表单时才求值，从而与 core/dict-metrics.js 解耦加载顺序
          options: function () {
            return (PHR.dict.metrics || []).map(function (m) { return { key: m.key, name: m.name }; });
          } },
        { name: 'measuredAt', label: '测量时间', type: 'datetime', required: true },
        { name: 'value', label: '数值', type: 'number', required: true, step: 0.1, min: 0 },
        { name: 'value2', label: '第二数值', type: 'number', step: 0.1, min: 0,
          hint: '舒张压等需要两个数值的指标填写此项' },
        { name: 'unit', label: '单位', type: 'text', placeholder: '自动带出' },
        { name: 'measureWay', label: '测量方式', type: 'select',
          options: [
            { key: 'home',   name: '家庭自测' },
            { key: 'clinic', name: '医院测量' },
            { key: 'device', name: '可穿戴设备' }
          ] },
        { name: 'context', label: '测量情境', type: 'text', span: 2,
          placeholder: '如：晨起空腹 / 运动后 / 服药后 2 小时' },
        f(F.note)
      ]
    },

    /* ---------------------------------------------------------------- *
     * 14. 健康笔记
     * ---------------------------------------------------------------- */
    {
      key: 'note', name: '健康笔记', icon: '📝', color: '#64748b',
      diseaseCat: 'other', scope: 'basic',
      titleField: 'title', dateField: 'noteDate',
      desc: '不方便归类的身体感受、问题清单与待办事项。',
      fields: [
        { name: 'noteDate', label: '日期', type: 'date', required: true },
        { name: 'title', label: '标题', type: 'text', required: true, span: 2 },
        { name: 'content', label: '内容', type: 'textarea', required: true, span: 2 },
        { name: 'tags', label: '标签', type: 'tags', span: 2,
          placeholder: '输入后按回车添加，如：睡眠 / 头痛' }
      ]
    }
  ];

  /* ------------------------------------------------------------------ *
   * 国际化：把 name 改成读取词条的访问器
   * `D.recordType(key).name` 这类直接属性访问全站有几十处（列表、时间线、
   * 详情的标题、表单标题），改成访问器即可全部随语言切换。
   * ------------------------------------------------------------------ */
  D.recordTypes.forEach(function (t) {
    var zhName = t.name;
    /* 中文原文另存一份：models.record.displayTitle() 要拿它认出
       "标题其实是创建时兜底的类型名"这种历史数据（见该函数注释）。 */
    t.nameZh = zhName;
    Object.defineProperty(t, 'name', {
      enumerable: true, configurable: true,
      get: function () {
        return PHR.i18n ? PHR.i18n.dictName('recordType', t.key, zhName) : zhName;
      }
    });
  });

  /* ------------------------------------------------------------------ *
   * 国际化：字段标签与字段内的展示文案
   * ------------------------------------------------------------------
   * 每个字段都会得到一个稳定的词条键（挂在 fields[].i18n 上）：
   *
   *   dict.field.<记录类型key>.<字段名>          → 标签 label
   *   dict.field.<记录类型key>.<字段名>.ph       → 占位提示 placeholder
   *   dict.field.<记录类型key>.<字段名>.hint     → 字段说明 hint
   *   dict.field.<记录类型key>.<字段名>.unit     → 单位 unit
   *
   * 把 label 等属性改成访问器后，「表单、详情、卡片摘要、版本对比、
   * 搜索索引、导出文本」等所有读 label 的地方会一起变成英文 ——
   * 这与上方记录类型 name 的做法一致，无需改动任何调用点。
   *
   * 注意：只给**该字段本来就有**的属性装访问器。
   * PHR.t 在"词条缺失且兜底为空"时会返回键名本身，
   * 因此不能给一个原本没有 placeholder 的字段凭空造出占位文案。
   * ------------------------------------------------------------------ */
  /** 把 obj[prop] 换成读词条的访问器（词条缺失时原样回退到中文原文） */
  function i18nAccessor(obj, prop, key) {
    var d = Object.getOwnPropertyDescriptor(obj, prop);
    if (!d || d.get || d.value === undefined) { return; }
    var zh = d.value;
    Object.defineProperty(obj, prop, {
      enumerable: true, configurable: true,
      get: function () { return PHR.t(key, zh); }
    });
  }

  D.recordTypes.forEach(function (t) {
    var zhDesc = t.desc;

    t.fields.forEach(function (fd) {
      if (!fd || !fd.name) { return; }
      var base = 'dict.field.' + t.key + '.' + fd.name;
      fd.i18n = base;
      i18nAccessor(fd, 'label', base);
      i18nAccessor(fd, 'placeholder', base + '.ph');
      i18nAccessor(fd, 'hint', base + '.hint');
      i18nAccessor(fd, 'unit', base + '.unit');

      /* select / multiselect 的**行内**候选项：打上组名标记后，
       * D.nameOf() 就会去查 dict.field.<类型>.<字段>.opt.<选项key>。
       * 共享字典数组（D.department 等）在 core/dict.js 里已经打过标记，
       * 此处必须跳过，否则会把全站共用的那一份改掉。 */
      if (Array.isArray(fd.options) && !fd.options.__i18n) {
        D.tagDict(fd.options, 'field.' + t.key + '.' + fd.name + '.opt');
      }
    });

    Object.defineProperty(t, 'desc', {
      enumerable: true, configurable: true,
      get: function () { return PHR.t('dict.recordType.' + t.key + '.desc', zhDesc); }
    });
  });

  /* ------------------------------------------------------------------ *
   * 便捷索引
   * ------------------------------------------------------------------ */
  D.recordTypeMap = D.index(D.recordTypes);

  /** 取某记录类型的定义，找不到时回退到 note 类型 */
  D.recordType = function (key) {
    return D.recordTypeMap[key] || D.recordTypeMap.note;
  };

  /** 取某记录类型的展示名 */
  D.recordTypeName = function (key) {
    var t = D.recordTypeMap[key];
    return t ? t.name : (key || PHR.t('dict.recordType.unknown', '未知类型'));
  };

  /** 取某记录类型下某字段的标签（英文环境返回英文，未翻译时回退中文原文） */
  D.fieldLabel = function (typeKey, fieldName) {
    var t = D.recordTypeMap[typeKey];
    if (!t) { return fieldName; }
    var hit = t.fields.filter(function (x) { return x.name === fieldName; })[0];
    if (!hit) { return fieldName; }
    return hit.i18n ? PHR.t(hit.i18n, hit.label) : hit.label;
  };

})(window.PHR);
