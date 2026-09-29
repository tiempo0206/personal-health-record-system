/**
 * ============================================================================
 * 文件：modules/records/basic.view.js
 * 层：业务模块层（档案中心 —— 模块 2）
 * 职责：注册「个人基本信息」页面。
 *      除了基本资料表单，本页还提供两样"关键时刻真能用上"的东西：
 *        ① 急救信息卡 —— 血型、过敏史、当前用药、紧急联系人，可打印
 *        ② 健康风险因素列表 —— 由吸烟/饮酒/运动/年龄/BMI 推导
 * 依赖：modules/records/{profile,medication}.js、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var P = PHR.records.profile;

  /* 基本信息的字段模式（不走 dict-records，因为它是独立实体）。
     文案在运行时按语言生成，见下面的 FIELDS() —— 本文件在语言探测之前加载，
     直接在这里调用 PHR.t 只会拿到中文。 */
  var FIELD_DEFS = [
    { name: 'realName', label: '真实姓名', type: 'text', required: true, placeholder: '与就诊卡一致' },
    { name: 'gender', label: '性别', type: 'select', required: true, options: D.gender },
    { name: 'birthDate', label: '出生日期', type: 'date', required: true },
    { name: 'bloodType', label: '血型', type: 'select', options: D.bloodType,
      hint: '急救输血时最关键的信息之一' },
    { name: 'height', label: '身高', type: 'number', unit: 'cm', min: 50, max: 250, step: 0.1 },
    { name: 'weight', label: '体重', type: 'number', unit: 'kg', min: 10, max: 300, step: 0.1,
      hint: '用于计算 BMI 与用药剂量' },
    { name: 'waist', label: '腰围', type: 'number', unit: 'cm', min: 30, max: 200, step: 0.1 },
    { name: 'maritalStatus', label: '婚姻状况', type: 'select', options: D.maritalStatus },
    { name: 'idCard', label: '身份证号', type: 'text', placeholder: '选填，仅本地保存',
      hint: '展示时会自动脱敏，如 310101********1234' },
    { name: 'phone', label: '手机号', type: 'text', placeholder: '用于接收短信验证码' },
    { name: 'email', label: '邮箱', type: 'text' },
    { name: 'occupation', label: '职业', type: 'text', placeholder: '选填' },
    { name: 'emergencyContact', label: '紧急联系人', type: 'text', span: 2, placeholder: '姓名' },
    { name: 'emergencyPhone', label: '紧急联系人电话', type: 'text', placeholder: '手机号' },
    { name: 'address', label: '联系地址', type: 'text', span: 2 },
    { name: 'smoking', label: '吸烟情况', type: 'select',
      options: D.tagDict([{ key: 'never', name: '从不吸烟' }, { key: 'former', name: '已戒烟' }, { key: 'current', name: '目前吸烟' }], 'basicSmoking') },
    { name: 'drinking', label: '饮酒情况', type: 'select',
      options: D.tagDict([{ key: 'never', name: '从不饮酒' }, { key: 'sometimes', name: '偶尔饮酒' }, { key: 'often', name: '经常饮酒' }], 'basicDrinking') },
    { name: 'exercise', label: '运动习惯', type: 'select',
      options: D.tagDict([{ key: 'never', name: '几乎不运动' }, { key: 'sometimes', name: '每周 1~2 次' },
                { key: 'often', name: '每周 3~5 次' }, { key: 'daily', name: '几乎每天' }], 'basicExercise') },
    { name: 'bloodDonor', label: '无偿献血者', type: 'checkbox', checkboxLabel: '我参加过无偿献血' },
    { name: 'organDonor', label: '器官捐献意愿', type: 'checkbox', checkboxLabel: '我愿意登记器官捐献' }
  ];

  /** 按当前语言生成一份字段模式（每次都从中文原文重新取词，切回中文不会串味） */
  function FIELDS() {
    return FIELD_DEFS.map(function (fd) {
      var o = Object.assign({}, fd);
      o.label = U.t('basic.field.' + fd.name, fd.label);
      if (fd.hint) { o.hint = U.t('basic.field.' + fd.name + '.hint', fd.hint); }
      if (fd.placeholder) { o.placeholder = U.t('basic.field.' + fd.name + '.ph', fd.placeholder); }
      if (fd.checkboxLabel) { o.checkboxLabel = U.t('basic.field.' + fd.name + '.cb', fd.checkboxLabel); }
      return o;
    });
  }

  PHR.registerView('basic', {
    title: PHR.t('view.basic.title', '个人基本信息'), icon: '👤', group: 'main', order: 99, nav: false, module: 'records',
    render: render
  });

  /* ================================================================== *
   * 页面
   * ================================================================== */
  function render(root) {
    var fields = FIELDS();
    var values = P.getOrDefault();
    var sum = P.summary();

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles"><h2>' + U.t('view.basic.title', '个人基本信息') + '</h2></div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="back">' + U.t('basic.back', '← 返回档案') + '</button>' +
          '<button class="btn btn-primary" data-action="save">' + U.t('ui.save', '保存') + '</button>' +
        '</div>' +
      '</div>' +

      (sum ? summaryBar(sum) : '') +

      '<div class="grid g2 mb5">' +
        '<div class="card"><div class="card-body">' +
          '<div class="callout-title">' + U.t('basic.card.title', '📇 急救信息卡') + '</div>' +
          '<div class="t-xs dim mb3">' +
            U.t('basic.card.desc', '紧急情况下，这几项信息可能决定抢救速度。可以打印出来放在钱包或手机壳里。') +
          '</div>' +
          '<div id="emergency-card"></div>' +
          '<button class="btn btn-sm mt3" data-action="print">' +
            U.t('basic.card.print', '🖨️ 打印急救卡') + '</button>' +
        '</div></div>' +

        '<div class="card"><div class="card-body">' +
          '<div class="callout-title">' + U.t('basic.risk.title', '⚠️ 健康风险因素') + '</div>' +
          '<div class="t-xs dim mb3">' +
            U.t('basic.risk.desc', '根据您填写的生活习惯与身体数据自动推导，用于体检与就诊时向医生说明。') +
          '</div>' +
          '<div id="risk-list"></div>' +
        '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-head"><h3>' + U.t('basic.form.title', '基本资料') + '</h3>' +
        '<div class="sub">' + U.t('basic.form.required', '带 <span class="req">*</span> 的为必填项') + '</div></div>' +
        '<div class="card-body">' +
          '<form id="basic-form" novalidate>' + PHR.ui.form.render(fields, values, {}) + '</form>' +
          '<div class="form-actions">' +
            '<button class="btn btn-ghost" data-action="back">' + U.t('ui.cancel', '取消') + '</button>' +
            '<button class="btn btn-primary" data-action="save">' +
              U.t('basic.form.save', '保存基本信息') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<p class="dim t-xs mt4">' +
        U.t('basic.footnote',
          '🔒 身份证明与联系方式属于敏感信息：在本地保存，' +
          '在界面上展示时自动脱敏；授权给医生时默认隐藏身份证与紧急联系人电话。' +
          '详细规则见「访问追踪」。') + '</p>';

    var formEl = U.$('#basic-form', root);
    PHR.ui.form.enhance(formEl, fields, function () {
      // BMI 实时预览
      var v = PHR.ui.form.read(formEl, fields);
      var bmi = P.computeBmi(v.weight, v.height);
      var el = document.getElementById('bmi-live');
      if (el) {
        el.innerHTML = bmi === null
          ? '<span class="dim">' + U.t('basic.bmi.pending', '填写身高与体重后自动计算') + '</span>'
          : U.t('basic.bmi.value', 'BMI <b class="t-lg">{v}</b> kg/m²　{tone}', {
              v: bmi,
              tone: PHR.ui.badge(PHR.dict.judgeName(PHR.dict.judge('bmi', bmi)),
                                 PHR.dict.judgeTone(PHR.dict.judge('bmi', bmi)))
            });
      }
    });

    // BMI 行插到体重字段之后
    var weightField = U.$('#f_weight', root);
    if (weightField) {
      weightField.closest('.field').insertAdjacentHTML('afterend',
        '<div class="field span-2"><label>' + U.t('basic.bmi.label', '体质指数 BMI') + '</label>' +
        '<div id="bmi-live" class="input" style="display:flex;align-items:center;gap:8px;background:var(--surface-2)">' +
        '<span class="dim">' + U.t('basic.bmi.pending', '填写身高与体重后自动计算') + '</span></div></div>');
    }

    drawEmergency(sum);
    drawRisks(sum);

    dom.actions(root, {
      back: function () { PHR.router.go('/records'); },
      save: save,
      print: function () { window.print(); }
    });

    formEl.addEventListener('submit', function (e) { e.preventDefault(); });
  }

  /* ------------------------------ 摘要条 ------------------------------ */
  function summaryBar(sum) {
    return '<div class="grid g4 mb5">' +
      tile(U.t('basic.summary.age', '年龄'), sum.age === null ? '—' : sum.age, U.t('basic.unit.years', '岁'),
           '🎂', sum.ageGroup) +
      tile(U.t('basic.summary.bmi', 'BMI'), sum.bmi === null ? '—' : sum.bmi, 'kg/m²', '⚖️', sum.bmiText,
           PHR.dict.judgeTone(sum.bmiLevel)) +
      tile(U.t('basic.summary.bloodType', '血型'),
           sum.profile.bloodType === 'unknown' ? U.t('basic.unset', '未填') : D.nameOf(D.bloodType, sum.profile.bloodType),
           '', '🩸', sum.profile.bloodType === 'unknown' ? 'warn' : '') +
      tile(U.t('basic.summary.risks', '风险因素'), sum.risks.length, U.t('basic.unit.items', '项'), '⚠️',
           sum.risks.length === 0 ? 'ok' : sum.risks.length <= 2 ? 'info' : 'warn') +
    '</div>';

    function tile(label, value, unit, icon, sub, tone) {
      return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span class="corner"></span>' +
        '<div class="label">' + icon + ' ' + dom.esc(label) + '</div>' +
        '<div class="value">' + dom.esc(value) + (unit ? '<span class="unit">' + dom.esc(unit) + '</span>' : '') + '</div>' +
        '<div class="delta dim">' + dom.esc(sub || '') + '</div></div>';
    }
  }

  /* ------------------------------ 急救卡 ------------------------------ */
  function drawEmergency() {
    var el = document.getElementById('emergency-card');
    if (!el) { return; }
    var card = P.emergencyCard();
    if (!card || !card.name) {
      el.innerHTML = PHR.ui.empty({
        icon: '📇',
        title: U.t('basic.emergency.emptyTitle', '填写姓名与血型后'),
        hint: U.t('basic.emergency.emptyHint', '这里会生成一张可打印的急救信息卡。'),
        compact: true
      });
      return;
    }

    el.innerHTML =
      '<dl class="kv">' +
        '<dt>' + U.t('basic.emergency.nameRow', '姓名 / 性别 / 年龄') + '</dt><dd>' +
          dom.esc(card.name) + '　' + dom.esc(card.gender) +
          '　' + (card.age === null ? '—' : U.t('basic.ageValue', '{n} 岁', { n: card.age })) + '</dd>' +
        '<dt>' + U.t('basic.emergency.bloodType', '血型') + '</dt><dd>' + (card.bloodType === '未填' || !card.bloodType
          ? '<span class="warn">' + U.t('basic.emergency.notFilled', '未填写') + '</span>'
          : '<b class="t-lg">' + dom.esc(card.bloodType) + '</b>') + '</dd>' +
        '<dt>' + U.t('basic.emergency.heightWeight', '身高 / 体重') + '</dt><dd>' +
          dom.or(card.height) + ' cm　/　' + dom.or(card.weight) + ' kg</dd>' +
        '<dt>' + U.t('basic.emergency.allergies', '药物与食物过敏') + '</dt><dd>' +
          (card.allergies.length
            ? '<div class="tag-list">' + card.allergies.map(function (a) {
                return '<span class="badge tone-' + a.tone + '">' + dom.esc(a.allergen) +
                  '（' + dom.esc(a.severity) + '）</span>';
              }).join('') + '</div>'
            : '<span class="dim">' + U.t('basic.emergency.noRecord', '无记录') + '</span>') + '</dd>' +
        '<dt>' + U.t('basic.emergency.meds', '正在服用的药') + '</dt><dd>' +
          (card.medications.length
            ? dom.esc(card.medications.join(U.t('ui.listSep', '、')))
            : '<span class="dim">' + U.t('basic.emergency.noRecord', '无记录') + '</span>') + '</dd>' +
        '<dt>' + U.t('basic.emergency.conditions', '主要疾病') + '</dt><dd>' +
          (card.conditions.length
            ? dom.esc(card.conditions.join(U.t('ui.listSep', '、')))
            : '<span class="dim">' + U.t('basic.emergency.noRecord', '无记录') + '</span>') + '</dd>' +
        '<dt>' + U.t('basic.emergency.contact', '紧急联系人') + '</dt><dd>' +
          (card.emergencyContact
            ? dom.esc(card.emergencyContact) + '　<span class="mono">' + dom.esc(card.emergencyPhone || '') + '</span>'
            : '<span class="warn">' + U.t('basic.emergency.notFilled', '未填写') + '</span>') + '</dd>' +
      '</dl>';

    if (!card.allergies.length || card.bloodType === '未填') {
      el.insertAdjacentHTML('beforeend',
        PHR.ui.notice('warn', U.t('basic.emergency.incompleteTitle', '急救卡还不完整'),
          (!card.allergies.length ? U.t('basic.emergency.missAllergy', '缺少过敏史；') : '') +
          (card.bloodType === '未填' ? U.t('basic.emergency.missBloodType', '缺少血型；') : '') +
          U.t('basic.emergency.incompleteTail', '这些信息在急救时非常关键，建议尽快补齐。'), { icon: '⚠️' }));
    }
  }

  /* ------------------------------ 风险列表 ------------------------------ */
  function drawRisks(sum) {
    var el = document.getElementById('risk-list');
    if (!el) { return; }
    if (!sum || !sum.risks.length) {
      el.innerHTML = PHR.ui.notice('ok', U.t('basic.risk.noneTitle', '暂未发现明显风险因素'),
        U.t('basic.risk.noneBody',
          '继续保持规律作息与适量运动。建议每年做一次常规体检，并持续记录体征指标。'), { icon: '✅' });
      return;
    }
    var LEVEL_NAME = {
      danger: U.t('basic.risk.level.high', '高'),
      warn: U.t('basic.risk.level.medium', '中'),
      info: U.t('basic.risk.level.low', '低')
    };
    el.innerHTML = sum.risks.map(function (r) {
      return '<div class="row gap2 mb3"><span>' +
        (r.tone === 'danger' ? '⛔' : r.tone === 'warn' ? '⚠️' : 'ℹ️') + '</span>' +
        '<div><div class="semibold t-sm">' + dom.esc(r.name) +
          ' ' + PHR.ui.badge(LEVEL_NAME[r.tone], r.tone) + '</div>' +
          '<div class="t-xs dim">' + dom.esc(r.detail) + '</div></div></div>';
    }).join('');
  }

  /* ------------------------------ 保存 ------------------------------ */
  function save() {
    var fields = FIELDS();
    var formEl = document.getElementById('basic-form');
    if (!formEl) { return; }
    var values = PHR.ui.form.read(formEl, fields);
    var res = P.save(values);
    if (!res.ok) {
      PHR.ui.form.showErrors(formEl, fields, res.errors || {});
      PHR.ui.toast.danger(res.message || U.t('editor.saveFailed', '保存失败'));
      return;
    }
    PHR.ui.toast.ok(res.message, { title: U.t('basic.savedTitle', '已保存') });
    if (PHR.shell.refreshNav) { PHR.shell.refreshNav(); }
    PHR.router.reload();
  }

})(window.PHR);
