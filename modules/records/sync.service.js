/**
 * ============================================================================
 * 文件：modules/records/sync.service.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：模拟"从医院 / 诊所同步检查结果与诊断报告"。
 *      对应需求原文："也可以从医院或诊所同步检查结果和诊断报告"。
 *      纯前端环境没有真实接口，本模块用一套可复现的模拟数据源，
 *      完整模拟「选择机构 → 拉取 → 查重 → 入库 → 写同步日志 → 留痕」全流程，
 *      真实产品只需把 fetchPull() 换成真实的 HL7 FHIR / 医院接口调用即可。
 * 依赖：core/dict.js（PHR.dict.hospital）、modules/records/record.service.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;

  /* 机构等级的英文取自词条；未登记的等级原样显示中文 */
  var LEVEL_KEY = {
    '三级甲等': 'sync.level.3a',
    '三级专科': 'sync.level.3spec',
    '一级': 'sync.level.1'
  };

  /* ================================================================== *
   * 一、可同步的机构
   * ================================================================== */
  function hospitals() {
    return D.hospital.map(function (h) {
      var logs = PHR.db.syncLogs.all().filter(function (l) { return l.hospital === h.key; });
      var last = logs.length ? U.max(logs, 'at') : null;
      return {
        key: h.key,
        name: h.name,
        level: LEVEL_KEY[h.level] ? U.t(LEVEL_KEY[h.level], h.level) : h.level,
        connected: true,
        lastSyncAt: last,
        syncCount: logs.length
      };
    });
  }

  /* ================================================================== *
   * 二、模拟的远端数据源
   *     用固定的模板 + 相对日期生成，保证每次"同步"都能拿到合理数据。
   *
   *     text 列出该条目里的**自由文本字段**（会写进档案）。这些字段在
   *     fetchPull() 里按当前语言取词 —— 同步那一刻的语言就是入库语言，
   *     与 core/seed.js 的示例数据同一条规则。枚举类字段（diseaseCat /
   *     department / metricKey 等）是数据值，不参与翻译。
   * ================================================================== */
  var TEMPLATES = {
    hosp_rm: [
      { id: 'rm_hba1c', type: 'lab', offsetDays: 14, text: ['itemName', 'impression'], data: {
        itemName: '糖化血红蛋白', result: 6.1, unit: '%', refRange: '4.0 - 6.0', abnormal: true,
        diseaseCat: 'endocrine', impression: '较上次下降，血糖控制趋势向好' } },
      { id: 'rm_glucose', type: 'lab', offsetDays: 14, text: ['itemName'], data: {
        itemName: '空腹血糖', result: 5.6, unit: 'mmol/L', refRange: '3.9 - 6.1', abnormal: false,
        diseaseCat: 'endocrine' } },
      { id: 'rm_ldl', type: 'lab', offsetDays: 14, text: ['itemName'], data: {
        itemName: '低密度脂蛋白', result: 2.6, unit: 'mmol/L', refRange: '< 3.4', abnormal: false,
        diseaseCat: 'cardio' } },
      { id: 'rm_visit', type: 'visit', offsetDays: 14,
        text: ['doctor', 'chiefComplaint', 'diagnosis', 'treatment'], data: {
        visitType: 'followup', department: 'cardio', doctor: '李建国 主任医师',
        chiefComplaint: '高血压、糖尿病定期复诊',
        diagnosis: '血压达标，血糖控制良好',
        diseaseCat: 'cardio',
        treatment: '维持现有用药方案，继续家庭血压监测，3 个月后复查' } },
      { id: 'rm_ecg', type: 'imaging', offsetDays: 14,
        text: ['modality', 'bodyPart', 'findings', 'impression'], data: {
        modality: '心电图', bodyPart: '心脏',
        findings: '窦性心律，大致正常心电图',
        impression: '未见明显异常', severity: 'info', diseaseCat: 'cardio' } }
    ],
    hosp_cd: [
      { id: 'cd_wbc', type: 'lab', offsetDays: 7, text: ['itemName'], data: {
        itemName: '血常规 - 白细胞计数', result: 6.2, unit: '10⁹/L', refRange: '3.5 - 9.5', abnormal: false } },
      { id: 'cd_hgb', type: 'lab', offsetDays: 7, text: ['itemName'], data: {
        itemName: '血常规 - 血红蛋白', result: 128, unit: 'g/L', refRange: '115 - 150', abnormal: false } },
      { id: 'cd_checkup', type: 'checkup', offsetDays: 7, text: ['conclusion', 'advice'], data: {
        checkupType: 'routine', conclusion: '各项指标基本正常，建议保持规律作息',
        abnormalItems: [], advice: '继续保持低盐低脂饮食与规律运动' } }
    ],
    hosp_jk: [
      { id: 'jk_sys', type: 'vital', offsetDays: 1, text: ['context'], data: {
        metricKey: 'systolic', value: 128, unit: 'mmHg', measureWay: 'clinic',
        context: '社区随访测量' } },
      { id: 'jk_dia', type: 'vital', offsetDays: 1, text: ['context'], data: {
        metricKey: 'diastolic', value: 82, unit: 'mmHg', measureWay: 'clinic',
        context: '社区随访测量' } },
      { id: 'jk_flu', type: 'vaccination', offsetDays: 30, text: ['vaccineName', 'site', 'reaction'], data: {
        vaccineName: '流感疫苗（四价）', doseNo: '1', site: '健康社区卫生服务中心',
        reaction: '无明显不适' } }
    ],
    hosp_zl: [
      { id: 'zl_cea', type: 'lab', offsetDays: 21, text: ['itemName', 'impression'], data: {
        itemName: '肿瘤标志物 CEA', result: 2.1, unit: 'ng/mL', refRange: '< 5.0', abnormal: false,
        diseaseCat: 'oncology', impression: '未见异常升高' } }
    ],
    hosp_ey: [
      { id: 'ey_growth', type: 'lab', offsetDays: 60, text: ['itemName'], data: {
        itemName: '儿童生长发育评估', result: 50, unit: '百分位', refRange: '3 - 97', abnormal: false } }
    ]
  };

  /** 把模板里的自由文本字段按当前语言取词 */
  function localizeTemplate(t, data) {
    (t.text || []).forEach(function (f) {
      if (typeof data[f] === 'string' && data[f]) {
        data[f] = U.t('sync.tpl.' + t.id + '.' + f, data[f]);
      }
    });
    return data;
  }

  /**
   * 拉取某机构的可同步条目（模拟网络请求）。
   * @returns {Promise<Array>}
   */
  function fetchPull(hospitalKey) {
    var tpl = TEMPLATES[hospitalKey] || [];
    var user = PHR.session.currentUser();
    var hospital = D.hospital.filter(function (h) { return h.key === hospitalKey; })[0];

    var rows = tpl.map(function (t, i) {
      var date = U.fmtDate(Date.now() - t.offsetDays * 86400000);
      var data = localizeTemplate(t, Object.assign({}, t.data));

      // 补齐该类型必填的日期 / 机构字段
      var typeDef = D.recordType(t.type);
      data.date = date;
      if (typeDef.dateField && !data[typeDef.dateField]) {
        data[typeDef.dateField] = t.type === 'vital'
          ? (date + ' 09:30')
          : date;
      }
      if (typeDef.fields.some(function (f) { return f.name === 'hospital'; })) {
        data.hospital = hospitalKey;
      }
      if (typeDef.fields.some(function (f) { return f.name === 'reportDate'; })) { data.reportDate = date; }
      if (typeDef.fields.some(function (f) { return f.name === 'examDate'; })) { data.examDate = date; }
      if (typeDef.fields.some(function (f) { return f.name === 'visitDate'; })) { data.visitDate = date; }
      if (typeDef.fields.some(function (f) { return f.name === 'checkupDate'; })) { data.checkupDate = date; }
      if (typeDef.fields.some(function (f) { return f.name === 'vaccineDate'; })) { data.vaccineDate = date; }
      if (typeDef.fields.some(function (f) { return f.name === 'institution'; }) && !data.institution) {
        data.institution = hospital
          ? U.t('sync.checkupCenter', '{name}体检中心', { name: hospital.name })
          : U.t('sync.checkupCenterShort', '体检中心');
      }
      if (typeDef.fields.some(function (f) { return f.name === 'site'; }) && !data.site) {
        data.site = hospital ? hospital.name : '';
      }
      if (typeDef.fields.some(function (f) { return f.name === 'note'; })) { data.note = ''; }
      return { type: t.type, data: data, remoteId: hospitalKey + '_' + date + '_' + i };
    });

    // 模拟网络延迟
    return new Promise(function (resolve) {
      setTimeout(function () { resolve({ hospital: hospital, rows: rows, user: user }); }, 700);
    });
  }

  /* ================================================================== *
   * 三、查重
   * ================================================================== */
  /**
   * 判断一条远端数据是否已经在本地存在。
   * 查重口径：同类型 + 同发生日期 + 标题一致 视为同一条。
   */
  function isDuplicate(row) {
    var probe = PHR.models.record.create(row.type, row.data, { userId: PHR.session.userId() });
    return PHR.records.service.all().some(function (r) {
      return r.type === probe.type &&
             U.fmtDate(r.date) === U.fmtDate(probe.date) &&
             String(r.title) === String(probe.title);
    });
  }

  /* ================================================================== *
   * 四、执行同步
   * ================================================================== */
  /**
   * 预演：只拉取并查重，不写库。
   * @returns {Promise<{ok, hospital, items:[{type,data,duplicate,preview}], stats}>}
   */
  function preview(hospitalKey) {
    return fetchPull(hospitalKey).then(function (res) {
      var items = res.rows.map(function (row) {
        var probe = PHR.models.record.create(row.type, row.data, { userId: PHR.session.userId() });
        return {
          type: row.type,
          typeName: D.recordTypeName(row.type),
          icon: D.recordType(row.type).icon,
          color: D.recordType(row.type).color,
          title: probe.title,
          dateText: U.fmtDate(probe.date),
          summary: probe.summary,
          data: row.data,
          duplicate: isDuplicate(row)
        };
      });
      return {
        ok: true,
        hospital: res.hospital,
        items: items,
        stats: {
          total: items.length,
          fresh: items.filter(function (i) { return !i.duplicate; }).length,
          duplicate: items.filter(function (i) { return i.duplicate; }).length
        }
      };
    });
  }

  /**
   * 正式同步：把非重复项写入档案。
   * @param {string} hospitalKey
   * @param {object} opt { skipPreview, onProgress }
   * @returns {Promise<{ok, imported, skipped, log}>}
   */
  function sync(hospitalKey, opt) {
    opt = opt || {};
    return fetchPull(hospitalKey).then(function (res) {
      var hospital = res.hospital;
      var imported = 0, skipped = 0;
      var created = [];

      res.rows.forEach(function (row, i) {
        if (isDuplicate(row)) { skipped++; return; }
        var r = PHR.records.service.create(row.type, row.data, {
          source: 'sync',
          sourceName: hospital ? hospital.name : hospitalKey,
          silent: true
        });
        if (r.ok) { imported++; created.push(r.record); }
        else { skipped++; }
        if (opt.onProgress) { opt.onProgress(i + 1, res.rows.length); }
      });

      var log = PHR.db.syncLogs.insert({
        userId: PHR.session.userId(),
        hospital: hospitalKey,
        hospitalName: hospital ? hospital.name : hospitalKey,
        imported: imported,
        skipped: skipped,
        total: res.rows.length,
        at: Date.now()
      });

      PHR.audit.log({
        action: 'sync.pull', targetType: 'sync', targetId: log.id,
        targetName: hospital ? hospital.name : hospitalKey,
        detail: U.t('sync.audit.pulled', '同步到 {n} 条新记录，跳过重复 {m} 条',
                  { n: imported, m: skipped }),
        result: 'success'
      });

      PHR.records.service.all().forEach(function (r) {});   // 触发一次集合读取，保证派生缓存最新

      return { ok: true, imported: imported, skipped: skipped, log: log, records: created,
               message: U.t('sync.done', '同步完成：新增 {n} 条，跳过重复 {m} 条',
                          { n: imported, m: skipped }) };
    });
  }

  /* ================================================================== *
   * 五、文件导入
   *     支持两类来源：
   *       1) JSON：[{ type, data }, ...] / { records:[...] } / 备份文件 { data:{records:[...] } }
   *       2) CSV：第一行表头，表头可用字段名或中文标签，例如「记录类型,测量时间,指标类型,数值」
   * ================================================================== */
  function norm(v) {
    return String(v === undefined || v === null ? '' : v)
      .trim().toLowerCase()
      .replace(/[\s_\-＿－—–:：()（）]/g, '');
  }

  function valueOf(obj, names) {
    if (!obj) { return undefined; }
    var keys = Object.keys(obj);
    for (var i = 0; i < names.length; i++) {
      var want = norm(names[i]);
      for (var j = 0; j < keys.length; j++) {
        if (norm(keys[j]) === want) { return obj[keys[j]]; }
      }
    }
    return undefined;
  }

  function keyFromDict(list, value) {
    if (value === undefined || value === null || value === '') { return value; }
    var n = norm(value);
    var hit = (list || []).filter(function (it) {
      return norm(it.key) === n ||
             norm(it.name) === n ||
             norm(D.nameOf(list, it.key)) === n;
    })[0];
    return hit ? hit.key : value;
  }

  function recordTypeKey(value) {
    var n = norm(value);
    var hit = (D.recordTypes || []).filter(function (t) {
      return norm(t.key) === n || norm(t.name) === n || norm(t.nameZh) === n;
    })[0];
    return hit ? hit.key : '';
  }

  function metricKey(value) {
    var n = norm(value);
    var hit = (D.metrics || []).filter(function (m) {
      return norm(m.key) === n || norm(m.name) === n || norm(m.shortName) === n;
    })[0];
    return hit ? hit.key : value;
  }

  function hospitalKey(value) {
    if (value === undefined || value === null || value === '') { return value; }
    var n = norm(value);
    var hit = (D.hospital || []).filter(function (h) {
      return norm(h.key) === n || norm(h.name) === n || norm(D.nameOf(D.hospital, h.key)) === n;
    })[0];
    return hit ? hit.key : value;
  }

  function fieldMap(type) {
    var t = D.recordType(type);
    var map = {};
    t.fields.forEach(function (fd) {
      map[norm(fd.name)] = fd.name;
      map[norm(fd.label)] = fd.name;
    });

    map[norm('date')] = t.dateField;
    map[norm('日期')] = t.dateField;
    map[norm('时间')] = t.dateField;
    map[norm('title')] = t.titleField;
    map[norm('标题')] = t.titleField;
    map[norm('名称')] = t.titleField;
    map[norm('医院')] = map[norm('医疗机构')] || 'hospital';
    map[norm('机构')] = map[norm('医疗机构')] || 'hospital';

    if (type === 'vital') {
      map[norm('metric')] = 'metricKey';
      map[norm('指标')] = 'metricKey';
      map[norm('指标类型')] = 'metricKey';
      map[norm('项目')] = 'metricKey';
      map[norm('测量值')] = 'value';
      map[norm('数值')] = 'value';
      map[norm('结果')] = 'value';
      map[norm('舒张压')] = 'value2';
      map[norm('低压')] = 'value2';
      map[norm('测量时间')] = 'measuredAt';
    }

    if (type === 'lab') {
      map[norm('项目')] = 'itemName';
      map[norm('检查项目')] = 'itemName';
      map[norm('数值')] = 'result';
      map[norm('结果')] = 'result';
    }

    return map;
  }

  function normalizeValue(fd, value) {
    if (value === undefined) { return value; }
    if (typeof value === 'string') { value = value.trim(); }
    if (fd.name === 'hospital') { return hospitalKey(value); }
    if (fd.name === 'metricKey') { return metricKey(value); }
    if (fd.name === 'unit' && value === '') { return value; }

    if (fd.type === 'checkbox') {
      if (typeof value === 'boolean') { return value; }
      return /^(1|true|yes|y|是|对|异常)$/i.test(String(value).trim());
    }
    if (fd.type === 'number') {
      if (value === '' || value === null) { return value; }
      var n = Number(String(value).replace(/,/g, ''));
      return isNaN(n) ? value : n;
    }
    if (fd.type === 'select') {
      var opts = typeof fd.options === 'function' ? fd.options() : fd.options;
      return keyFromDict(opts || [], value);
    }
    if (fd.type === 'multiselect' || fd.type === 'tags') {
      var arr = Array.isArray(value) ? value : String(value || '').split(/[,，、;；\s]+/).filter(Boolean);
      if (fd.type === 'multiselect') {
        var o = typeof fd.options === 'function' ? fd.options() : fd.options;
        arr = arr.map(function (x) { return keyFromDict(o || [], x); });
      }
      return arr;
    }
    return value;
  }

  function normalizeIncoming(raw, idx, fileName) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { valid: false, error: U.t('import.err.rowShape', '第 {n} 行不是一条有效记录', { n: idx + 1 }) };
    }

    var type = recordTypeKey(valueOf(raw, ['type', 'recordType', 'record_type', '记录类型', '类型']));
    if (!type || !D.recordTypeMap[type]) {
      return { valid: false, error: U.t('import.err.typeMissing', '第 {n} 行缺少有效的记录类型', { n: idx + 1 }) };
    }

    var t = D.recordType(type);
    var map = fieldMap(type);
    var data = {};

    function assign(k, v) {
      if (v === undefined || v === null) { return; }
      var fieldName = map[norm(k)] || (t.fields.some(function (fd) { return fd.name === k; }) ? k : '');
      if (!fieldName) { return; }
      var fd = t.fields.filter(function (x) { return x.name === fieldName; })[0];
      if (!fd) { return; }
      data[fieldName] = normalizeValue(fd, v);
    }

    if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
      Object.keys(raw.data).forEach(function (k) { assign(k, raw.data[k]); });
    }
    Object.keys(raw).forEach(function (k) {
      if (/^(id|userId|type|recordType|record_type|data|source|sourceName|source_name|createdAt|updatedAt|version|searchText)$/i.test(k)) { return; }
      if (/^(记录类型|类型|来源|来源名称|医院名称|机构名称)$/i.test(k)) { return; }
      assign(k, raw[k]);
    });

    var genericDate = valueOf(raw, ['date', '日期', '时间', '发生日期']);
    if (genericDate && !data[t.dateField]) { data[t.dateField] = genericDate; }
    var genericTitle = valueOf(raw, ['title', '标题', '名称']);
    if (genericTitle && !data[t.titleField]) { data[t.titleField] = genericTitle; }

    if (type === 'vital' && data.metricKey) {
      data.metricKey = metricKey(data.metricKey);
      var m = D.metric(data.metricKey);
      if (m && !data.unit) { data.unit = m.unit; }
    }

    var sourceName = valueOf(raw, ['sourceName', 'source_name', 'hospitalName', '医院名称', '医院', '医疗机构', '机构名称', '机构', '来源']);
    if (!sourceName && data.hospital) { sourceName = D.nameOf(D.hospital, data.hospital) || data.hospital; }
    if (!sourceName) { sourceName = fileName || U.t('import.source.file', '上传报告'); }

    var check = PHR.models.record.validate(type, data);
    var probe = PHR.models.record.create(type, data, {
      userId: PHR.session.userId(),
      source: 'import',
      sourceName: sourceName
    });

    return {
      valid: check.ok,
      error: check.ok ? '' : check.list.join(U.t('ui.listSep', '；')),
      type: type,
      typeName: D.recordTypeName(type),
      icon: t.icon,
      color: t.color,
      title: PHR.models.record.displayTitle(probe),
      dateText: U.fmtDate(probe.date),
      summary: PHR.models.record.summaryOf(probe),
      data: data,
      sourceName: sourceName,
      duplicate: check.ok ? isDuplicate({ type: type, data: data }) : false
    };
  }

  function parseCsv(text) {
    var rows = [], row = [], cur = '', inQ = false;
    var s = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '"') {
        if (inQ && s.charAt(i + 1) === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        row.push(cur); cur = '';
      } else if ((ch === '\n' || ch === '\r') && !inQ) {
        if (ch === '\r' && s.charAt(i + 1) === '\n') { i++; }
        row.push(cur); cur = '';
        if (row.some(function (v) { return String(v).trim() !== ''; })) { rows.push(row); }
        row = [];
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    if (row.some(function (v) { return String(v).trim() !== ''; })) { rows.push(row); }
    if (rows.length < 2) { return []; }
    var head = rows[0].map(function (h) { return String(h || '').trim(); });
    return rows.slice(1).map(function (r) {
      var obj = {};
      head.forEach(function (h, i) { if (h) { obj[h] = r[i] === undefined ? '' : r[i]; } });
      return obj;
    });
  }

  function rowsFromJson(raw) {
    if (Array.isArray(raw)) { return raw; }
    if (raw && Array.isArray(raw.records)) { return raw.records; }
    if (raw && raw.data && Array.isArray(raw.data.records)) { return raw.data.records; }
    return [];
  }

  function parseFileRows(text, fileName) {
    var body = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!body) { return { ok: false, rows: [], message: U.t('import.err.empty', '文件是空的') }; }

    if (/\.json$/i.test(fileName || '') || /^[\[{]/.test(body)) {
      try {
        var raw = JSON.parse(body);
        return { ok: true, rows: rowsFromJson(raw), format: 'json' };
      } catch (e) {
        return { ok: false, rows: [], message: U.t('import.err.badJson', 'JSON 解析失败：{msg}', { msg: e.message }) };
      }
    }

    var rows = parseCsv(body);
    return rows.length
      ? { ok: true, rows: rows, format: 'csv' }
      : { ok: false, rows: [], message: U.t('import.err.badCsv', 'CSV 至少需要一行表头和一行数据') };
  }

  function previewFile(text, fileName) {
    var parsed = parseFileRows(text, fileName);
    if (!parsed.ok) { return Object.assign(parsed, { items: [], stats: { total: 0, importable: 0, duplicate: 0, invalid: 0 } }); }

    var items = parsed.rows.map(function (row, i) { return normalizeIncoming(row, i, fileName); });
    var stats = {
      total: items.length,
      importable: items.filter(function (x) { return x.valid && !x.duplicate; }).length,
      duplicate: items.filter(function (x) { return x.valid && x.duplicate; }).length,
      invalid: items.filter(function (x) { return !x.valid; }).length
    };
    return { ok: true, format: parsed.format, fileName: fileName, items: items, stats: stats };
  }

  function importFile(text, fileName) {
    var pre = previewFile(text, fileName);
    if (!pre.ok) { return pre; }

    var imported = 0;
    pre.items.forEach(function (it) {
      if (!it.valid || it.duplicate) { return; }
      var res = PHR.records.service.create(it.type, it.data, {
        source: 'import',
        sourceName: it.sourceName,
        silent: true,
        reason: U.t('import.reason.file', '从上传文件导入')
      });
      if (res.ok) { imported++; }
    });

    if (imported && PHR.audit && PHR.audit.log) {
      PHR.audit.log({
        action: 'record.import',
        targetType: 'record',
        targetName: fileName || U.t('import.source.file', '上传报告'),
        detail: U.t('import.audit.detail', '从上传文件导入 {n} 条健康记录，跳过重复 {d} 条，无效 {x} 条',
          { n: imported, d: pre.stats.duplicate, x: pre.stats.invalid }),
        result: 'success'
      });
    }

    return Object.assign(pre, {
      imported: imported,
      message: U.t('import.done', '上传完成：新增 {n} 条，跳过重复 {d} 条，无效 {x} 条',
        { n: imported, d: pre.stats.duplicate, x: pre.stats.invalid })
    });
  }

  /** 同步历史 */
  function logs(limit) {
    var list = U.sortBy(PHR.db.syncLogs.all(), 'at', true);
    return limit ? list.slice(0, limit) : list;
  }

  /** 自动同步设置（当前默认关闭，真实产品可按频率自动拉取） */
  function settings() {
    return PHR.store.read('sync_settings', {
      autoSync: false,
      intervalDays: 7,
      hospitals: ['hosp_rm']
    });
  }

  function saveSettings(s) {
    PHR.store.write('sync_settings', Object.assign(settings(), s));
    return settings();
  }

  /* ================================================================== *
   * 五、说明（界面展示用）
   * ================================================================== */
  function explain() {
    return {
      title: U.t('sync.explain.title', '同步是怎么工作的'),
      steps: [
        U.t('sync.explain.step1', '① 选择要同步的医疗机构'),
        U.t('sync.explain.step2', '② 系统向该机构发起数据请求（当前版本使用模拟数据源）'),
        U.t('sync.explain.step3', '③ 拉取到的每条数据会先做**查重**：同类型 + 同日期 + 同标题视为同一条，避免重复入库'),
        U.t('sync.explain.step4', '④ 确认后写入档案，并标记来源为「医院同步」'),
        U.t('sync.explain.step5', '⑤ 整个过程写入审计日志（动作：同步医院数据）')
      ],
      realWorld: U.t('sync.explain.realWorld',
        '真实产品中，这一步需要对接医院的 HIS / LIS 系统或区域健康信息平台，' +
        '通常采用 HL7 FHIR 标准，并需要用户签署的授权书与机构间的数据共享协议。' +
        '同步回来的数据应当只读，且必须保留「来自哪家医院、什么时候同步的」溯源信息。')
    };
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.records.sync = {
    hospitals: hospitals,
    preview: preview,
    sync: sync,
    previewFile: previewFile,
    importFile: importFile,
    logs: logs,
    isDuplicate: isDuplicate,
    settings: settings,
    saveSettings: saveSettings,
    explain: explain
  };

})(window.PHR);
