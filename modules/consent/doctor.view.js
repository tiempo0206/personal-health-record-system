/**
 * ============================================================================
 * 文件：modules/consent/doctor.view.js
 * 层：业务模块层（医生授权 —— 模块 5）
 * 职责：注册「医生视图」（#/doctor）—— 医生凭授权码进入的受限工作台：
 *      ① 顶部授权横幅（医生身份、授权码、有效期每秒倒计时）
 *      ② 只列出被授权的范围导航
 *      ③ 按范围渲染被授权的内容，每展示一条记录就写一条访问日志
 *      ④ 底部「未被授权的范围」提示入口：点击被系统阻断并写 consent.denied 日志
 *      医生模式下 ui/shell.js 的侧边导航只渲染本视图，因此页面骨架必须自带。
 * 依赖：modules/consent/{scope,consent.service}.js、modules/records/*、ui/components/*
 * ============================================================================
 */
(function (PHR) {
  'use strict';
  var U = PHR.util, D = PHR.dict, dom = PHR.ui.dom;
  var S = PHR.consent.scope, CS = PHR.consent.service;
  var timer = null;
  var state = { scope: '' };

  PHR.registerView('doctor', {
    title: PHR.t('view.doctor.title', '医生视图'), icon: '👨‍⚕️', group: 'main', order: 5, nav: false, module: 'consent',
    render: render, unmount: stopTimer
  });

  /* ================================================================== *
   * 一、页面骨架
   * ================================================================== */
  function render(root) {
    stopTimer();
    if (!PHR.session.isDoctorGuest()) {
      root.innerHTML = '<div id="doc-gate">' + PHR.ui.empty({
        icon: '🔒', title: PHR.t('consent.doctor.gateTitle', '请从登录页用授权码进入'),
        hint: PHR.t('consent.doctor.gateHint',
          '医生视图只对凭授权码验证通过的医生开放。请在登录页点击「我是医生，用授权码进入」，' +
          '并输入患者提供的那串 12 位授权码。'),
        action: { label: PHR.t('consent.doctor.backToLogin', '返回登录页'), action: 'exit' }
      }) + '</div>';
      dom.actions(U.$('#doc-gate', root), { exit: function () { PHR.shell.exitDoctorMode(); } });
      return;
    }
    var consent = PHR.session.currentConsent();
    if (!consent) { root.innerHTML = PHR.ui.error(PHR.t('consent.doctor.invalid', '授权已失效，请重新用授权码进入。')); return; }

    var keys = S.sanitize(consent.scopes);
    if (keys.indexOf(state.scope) < 0) { state.scope = keys[0] || ''; }

    root.innerHTML = '<div id="doc-main">' + banner(consent, keys) +
      '<div class="tabs" id="doc-scopes" role="tablist">' + keys.map(function (k) {
        return '<button role="tab" data-scope="' + k + '" aria-selected="' + (state.scope === k) + '">' +
          dom.esc(S.nameOf(k)) + '</button>';
      }).join('') + '</div>' +
      '<div id="doc-content"></div>' + deniedBlock(consent, keys) + privacy() + '</div>';

    var main = U.$('#doc-main', root);
    dom.actions(main, {
      exit: function () { PHR.shell.exitDoctorMode(); },
      denied: function (e, el) { deny(consent, el.getAttribute('data-key')); }
    });
    var scopeTabs = U.$('#doc-scopes', main);
    if (scopeTabs) {
      scopeTabs.addEventListener('click', function (e) {
        var b = e.target.closest('[data-scope]');
        if (!b) { return; }
        state.scope = b.getAttribute('data-scope');
        U.$$('[data-scope]', main).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        drawContent(consent);
      });
    }

    drawContent(consent);
    startTimer(consent);
  }

  /* ================================================================== *
   * 二、授权横幅与倒计时
   * ================================================================== */
  function banner(c, keys) {
    var d = PHR.session.currentDoctor() || {};
    return '<div class="doctor-banner"><div class="row between wrap gap3"><div>' +
        '<div class="who">' + PHR.t('consent.doctor.viewing', '您正在以受限身份查看 <b>{name}</b> 的档案',
          { name: dom.esc(patientName(c)) }) + '</div>' +
        '<div class="t-sm mt2">' + dom.esc(d.name || c.doctorName) + ' ' + dom.esc(d.title || c.doctorTitle || '') +
          PHR.t('consent.sep.dot', '　·　') + dom.esc(D.nameOf(D.hospital, d.hospital || c.hospital)) +
          PHR.t('consent.sep.dot', '　·　') + dom.esc(D.nameOf(D.department, d.department || c.department)) + '</div>' +
        '<div class="t-xs dim mt1">' + PHR.t('consent.code.label', '授权码') +
          ' <span class="mono">' + dom.esc(c.code) + '</span>' +
          PHR.t('consent.sep.dot', '　·　') +
          PHR.t('consent.doctor.bannerScopes', '共授权 {n} 个范围', { n: keys.length }) +
          PHR.t('consent.sep.dot', '　·　') +
          PHR.t('consent.card.purpose', '就诊目的：{text}', { text: dom.esc(c.purpose || '—') }) + '</div></div>' +
      '<div class="tr"><div class="t-xs dim">' + PHR.t('consent.doctor.timeLeft', '授权剩余时间') + '</div>' +
        '<div class="timer" id="doc-timer">—</div>' +
        '<button class="btn btn-sm mt2" data-action="exit">' + PHR.t('consent.doctor.exit', '退出医生视图') + '</button></div></div>' +
      '<div class="t-xs mt3">' + PHR.t('consent.doctor.bannerWarn',
        '⚠️ 系统已记录您的进入时间与身份信息；您在本页的每一次查看都会写入患者的访问日志。') + '</div></div>';
  }

  function patientName(c) {
    var p = PHR.db.profiles.firstBy('userId', c.userId);
    return (p && p.realName) || PHR.t('consent.doctor.patient', '患者');
  }

  /** 每秒刷新一次：剩余不足 1 天时转为警示色 */
  function startTimer(c) {
    stopTimer();
    function tick() {
      var el = document.getElementById('doc-timer');
      if (!el) { return stopTimer(); }
      var left = c.expireAt - Date.now();
      if (left <= 0) {
        el.textContent = PHR.t('consent.doctor.expired', '授权已失效');
        el.style.color = 'var(--danger)';
        return stopTimer();
      }
      var sec = Math.floor(left / 1000);
      el.textContent = PHR.t('consent.doctor.timer', '{d} 天 {h} 小时 {m} 分 {s} 秒', {
        d: Math.floor(sec / 86400),
        h: Math.floor(sec % 86400 / 3600),
        m: Math.floor(sec % 3600 / 60),
        s: U.pad2(sec % 60)
      });
      el.style.color = left < 86400000 ? 'var(--warn)' : '';
    }
    tick();
    timer = setInterval(tick, 1000);
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  /* ================================================================== *
   * 三、内容区
   * ================================================================== */
  function drawContent(consent) {
    var box = document.getElementById('doc-content');
    if (!box) { return; }
    var key = state.scope;
    if (!key) {
      box.innerHTML = PHR.ui.empty({ icon: '🚫', title: PHR.t('consent.doctor.noScopes', '该授权没有包含任何范围'),
        hint: PHR.t('consent.doctor.noScopesHint', '请让患者重新创建一条授权。') });
      return;
    }
    /* 心理测评是"独立集合"范围：数据不在 records 里，forConsent 必然返回空数组。
       如果照常走下面的通用路径，logAccess 会先写一条「该范围暂无记录」的日志，
       而 psychPanel 又会写真实的查阅日志 —— 患者的访问记录里会出现两条互相矛盾
       的内容。所以这里必须先分流：不取 records、也不写那句空日志。 */
    if (key === 'psych') {
      logPsychAccess(consent);
      box.innerHTML = '<div class="card"><div class="card-head"><h3>' + dom.esc(S.nameOf(key)) + '</h3>' +
        '<div class="sub">' + dom.esc(S.descOf(key)) + '</div>' +
        '<div class="actions">' + PHR.ui.badge(PHR.t('consent.doctor.authorized', '已授权'), 'ok', { icon: '✅' }) + '</div></div>' +
        '<div class="card-body">' + psychPanel(consent) + '</div></div>';
      return;
    }

    // 唯一的数据入口：forConsent 负责"范围白名单"，canView 再叠一层"指定记录"的收窄
    var rows = PHR.records.service.forConsent(consent, { scopeKey: key })
      .filter(function (r) { return PHR.records.service.canView(r, consent); });
    logAccess(consent, key, rows);

    box.innerHTML = '<div class="card"><div class="card-head"><h3>' + dom.esc(S.nameOf(key)) + '</h3>' +
      '<div class="sub">' + PHR.t('consent.doctor.scopeMeta', '{desc}　·　本次授权可见 {n} 条记录',
        { desc: dom.esc(S.descOf(key)), n: rows.length }) + '</div>' +
      '<div class="actions">' + PHR.ui.badge(PHR.t('consent.doctor.authorized', '已授权'), 'ok', { icon: '✅' }) + '</div></div>' +
      '<div class="card-body">' + panelOf(key, rows, consent) + '</div></div>';
    afterRender(key, rows);
  }

  /**
   * 心理测评的访问留痕。
   * 由本函数自己写，是因为通用 logAccess 只认 records 集合里的行。
   */
  function logPsychAccess(consent) {
    var list = [];
    try { list = (PHR.assessment && PHR.assessment.forConsent) ? PHR.assessment.forConsent(consent) : []; }
    catch (e) { list = []; }

    if (!list.length) {
      CS.recordAccess(consent, { scopeKey: 'psych',
        recordName: PHR.t('consent.doctor.noPsychRecords', '该范围暂无心理测评报告') });
      return;
    }
    list.slice(0, 20).forEach(function (r) {
      CS.recordAccess(consent, {
        scopeKey: 'psych', recordId: r.id,
        recordName: PHR.t('consent.doctor.psychRecord', '{name}（{total}/{max} 分）',
          { name: r.scaleName, total: r.total, max: r.max })
      });
    });
  }

  /** 每展示一条记录就写一条访问日志（上限 40 条） */
  function logAccess(consent, key, rows) {
    if (!rows.length) {
      return CS.recordAccess(consent, { scopeKey: key, recordName: PHR.t('consent.doctor.noRecords', '该范围暂无记录') });
    }
    rows.slice(0, 40).forEach(function (r) {
      CS.recordAccess(consent, { scopeKey: key, recordId: r.id, recordName: r.title });
    });
  }

  function panelOf(key, rows, consent) {
    if (key === 'basic') { return basicPanel(rows, consent); }
    if (key === 'vital') { return vitalPanel(rows); }
    if (key === 'insight') { return insightPanel(); }
    if (key === 'lab') { return rows.length ? '<div id="doc-lab"></div>' : emptyScope('🧪'); }
    if (key === 'visit') { return visitPanel(rows); }
    if (key === 'history' || key === 'family') { return historyPanel(consent, key); }
    if (key === 'medication' || key === 'allergy') { return medPanel(consent, key); }
    if (key === 'psych') { return psychPanel(consent); }
    return recList(rows);
  }

  function emptyScope(icon) {
    return PHR.ui.empty({ icon: icon, title: PHR.t('consent.doctor.emptyScope', '本次授权内没有这类记录'), compact: true });
  }

  /** 通用记录清单：一条记录一行，附严重程度与摘要 */
  function recList(rows) {
    if (!rows.length) { return emptyScope('📭'); }
    return '<div class="list">' + rows.map(function (r) {
      var t = D.recordType(r.type);
      return '<div class="list-item"><span class="lead" style="background:' + t.color + '1f;color:' + t.color + '">' + t.icon + '</span>' +
        '<div class="body"><div class="title">' + dom.esc(PHR.models.record.displayTitle(r)) + ' ' +
          (r.severity ? PHR.ui.badges.severity(r.severity) : '') +
          (r.abnormal ? PHR.ui.badge(PHR.t('consent.doctor.abnormal', '异常'), 'danger') : '') + '</div>' +
          '<div class="sub">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 140)) + '</div></div>' +
        '<div class="meta">' + U.fmtDate(r.date) + '</div></div>';
    }).join('') + '</div>';
  }

  /* ------------------------------ 基本信息 ------------------------------ */
  function basicPanel(rows, consent) {
    var p = maskedProfile(consent);
    var sum = PHR.records.medication ? PHR.records.medication.doctorSummary() : { current: [], allergies: [] };
    var allergy = (sum.allergies || []).filter(function (r) { return allowed(r, consent); });
    var meds = (sum.current || []).filter(function (r) { return allowed(r, consent); });

    return (p
      ? '<dl class="kv">' + [
          [PHR.t('consent.basic.name', '姓名'), p.realName],
          [PHR.t('consent.basic.gender', '性别'), D.nameOf(D.gender, p.gender)],
          [PHR.t('consent.basic.birth', '出生日期'), p.birthDate],
          [PHR.t('consent.basic.age', '年龄'),
            p.birthDate ? PHR.t('consent.basic.yearsOld', '{n} 岁', { n: U.ageFrom(p.birthDate) }) : '—'],
          [PHR.t('consent.basic.bloodType', '血型'), D.nameOf(D.bloodType, p.bloodType)],
          [PHR.t('consent.basic.heightWeight', '身高 / 体重'), (p.height || '—') + ' cm / ' + (p.weight || '—') + ' kg'],
          ['BMI', PHR.records.profile.computeBmi(p.weight, p.height) || '—'],
          [PHR.t('consent.basic.emergency', '紧急联系人'),
            (p.emergencyContact || '—') + PHR.t('consent.sep.wide', '　') + (p.emergencyPhone || '')]
        ].map(function (kv) { return '<dt>' + dom.esc(kv[0]) + '</dt><dd>' + dom.esc(kv[1]) + '</dd>'; }).join('') + '</dl>' +
        '<div class="t-xs dim mt2">' + PHR.t('consent.basic.maskedNote', '身份证号与紧急联系人电话已按医生视角脱敏显示。') + '</div>'
      : PHR.ui.empty({ icon: '👤', title: PHR.t('consent.basic.missing', '患者尚未填写个人基本信息'), compact: true })) +
      allergyBanner(allergy) +
      '<div class="divider"></div><div class="callout-title">' +
        PHR.t('consent.doctor.currentMeds', '当前用药（{n}）', { n: meds.length }) + '</div>' +
      (meds.length ? medList(meds)
        : '<div class="dim t-sm mt2">' + PHR.t('consent.doctor.noMeds', '没有正在服用的药物记录。') + '</div>');
  }

  /**
   * 医生视角的脱敏基本信息。医生访客没有患者会话，getMasked 会返回 null，
   * 此时直接读取档案再按 'doctor' 视角脱敏 —— 脱敏规则仍然生效，不是降级放行。
   */
  function maskedProfile(consent) {
    var m = PHR.records.profile.getMasked('doctor');
    if (m) { return m; }
    var p = PHR.db.profiles.firstBy('userId', consent.userId);
    return p ? PHR.security.masker.profile(p, 'doctor') : null;
  }

  function allowed(record, consent) { return PHR.records.service.canView(record, consent); }

  /** 药物过敏置顶警示：开方前最需要先看到的一条信息 */
  function allergyBanner(allergy) {
    var drug = allergy.filter(function (r) { return r.data.allergenType === 'drug'; });
    if (drug.length) {
      return '<div class="mt4">' + PHR.ui.notice('danger',
        PHR.t('consent.doctor.drugAllergy', '药物过敏：{list}',
          { list: drug.map(function (r) { return r.data.allergen; }).join(PHR.t('consent.sep.list', '、')) }),
        PHR.t('consent.doctor.drugAllergyHint', '开方前请务必核对。完整清单见「过敏史」范围。'), { icon: '⛔' }) + '</div>';
    }
    if (allergy.length) {
      return '<div class="mt4">' + PHR.ui.notice('warn',
        PHR.t('consent.doctor.allergyCount', '该患者有 {n} 项过敏记录', { n: allergy.length }),
        PHR.t('consent.doctor.allergyHint', '请留意食物与接触性过敏。'), { icon: '⚠️' }) + '</div>';
    }
    return '<div class="mt4">' + PHR.ui.notice('ok', PHR.t('consent.doctor.noAllergy', '没有过敏记录'),
      PHR.t('consent.doctor.noAllergyHint', '该患者未登记任何过敏史，开方前仍建议口头确认。'), { icon: '✅' }) + '</div>';
  }

  function medList(meds) {
    return '<div class="list mt2">' + meds.map(function (m) {
      return '<div class="list-item"><span class="lead">💊</span><div class="body">' +
        '<div class="title">' + dom.esc(m.data.drugName) +
          (m.data.longTerm ? ' ' + PHR.ui.badge(PHR.t('consent.doctor.longTerm', '长期'), 'info') : '') + '</div>' +
        '<div class="sub">' + dom.esc([m.data.dose, D.nameOf(D.medFrequency, m.data.frequency),
          D.nameOf(D.medRoute, m.data.route)].filter(Boolean).join(PHR.t('consent.sep.wide', '　'))) + '</div></div>' +
        '<div class="meta">' + U.fmtDate(m.date) + '</div></div>';
    }).join('') + '</div>';
  }

  /* --------------------------- 用药与过敏清单 --------------------------- */
  function medPanel(consent, key) {
    var sum = PHR.records.medication ? PHR.records.medication.doctorSummary()
                                     : { current: [], allergies: [], interactions: [] };
    var allergy = (sum.allergies || []).filter(function (r) { return allowed(r, consent); });
    var meds = (sum.current || []).filter(function (r) { return allowed(r, consent); });

    return allergyBanner(allergy) +
      '<div class="callout-title mt4">' + PHR.t('consent.doctor.allergyList', '过敏清单（{n}）', { n: allergy.length }) + '</div>' +
      (allergy.length ? '<div class="list">' + allergy.map(function (a) {
        return '<div class="list-item"><span class="lead">⚠️</span><div class="body">' +
          '<div class="title">' + dom.esc(a.data.allergen) + ' ' +
            PHR.ui.badge(D.nameOf(D.allergenType, a.data.allergenType), 'info') + ' ' +
            PHR.ui.badges.severity(a.data.severity) + '</div>' +
          '<div class="sub">' + PHR.t('consent.doctor.reactions', '反应：{list}', {
            list: dom.esc((a.data.reactions || []).map(function (x) {
              return D.nameOf(D.allergyReaction, x); }).join(PHR.t('consent.sep.list', '、'))
              || PHR.t('consent.doctor.reactionsNone', '未记录'))
          }) +
            (a.data.handling
              ? PHR.t('consent.sep.dot', '　·　') +
                PHR.t('consent.doctor.handling', '应急处理：{text}', { text: dom.esc(a.data.handling) })
              : '') + '</div></div>' +
          '<div class="meta">' + U.fmtDate(a.date) + '</div></div>';
      }).join('') + '</div>'
        : '<div class="dim t-sm mt2">' + PHR.t('consent.doctor.allergyHidden', '未被授权查看过敏史，或该患者没有过敏记录。') + '</div>') +
      (key === 'allergy' ? '' :
        '<div class="divider"></div><div class="callout-title">' +
          PHR.t('consent.doctor.currentMeds', '当前用药（{n}）', { n: meds.length }) + '</div>' +
        (meds.length ? medList(meds)
          : '<div class="dim t-sm mt2">' + PHR.t('consent.doctor.noMeds', '没有正在服用的药物记录。') + '</div>') +
        ((sum.interactions || []).length
          ? '<div class="mt4">' + PHR.ui.notice('warn', PHR.t('consent.doctor.interactions', '药物相互作用提示'),
              sum.interactions.map(function (i) { return i.text; }).join(' '), { icon: '⚗️' }) + '</div>'
          : ''));
  }

  /* ---------------------------- 病史与家族史 ---------------------------- */
  function historyPanel(consent, key) {
    var b = PHR.records.history.bundle();
    var keep = function (r) { return allowed(r, consent); };

    if (key === 'family') {
      var fam = (b.family || []).filter(keep);
      if (!fam.length) {
        return PHR.ui.empty({ icon: '👪', title: PHR.t('consent.doctor.familyNone', '未被授权或暂无家族病史'),
          hint: PHR.t('consent.doctor.familyNoneHint',
            '家族病史描述的是亲属的健康信息，属于敏感范围，需要患者单独勾选。'), compact: true });
      }
      var risks = (b.geneticRisks || []).map(function (g) {
        return Object.assign({}, g, { relatives: (g.relatives || []).filter(keep) });
      }).filter(function (g) { return g.relatives.length; });

      return '<div class="callout-title">' +
          PHR.t('consent.doctor.familyCount', '家族病史（{n} 条）', { n: fam.length }) + '</div>' +
        recList(U.sortBy(fam, 'date', true)) +
        (risks.length ? '<div class="divider"></div><div class="callout-title">' +
          PHR.t('consent.doctor.geneticRisks', '遗传风险提示') + '</div>' +
          risks.map(function (g) {
            return '<div class="alert-card sev-' + (g.tone === 'danger' ? 'high' : g.tone === 'warn' ? 'medium' : 'low') + ' mt2">' +
              '<span class="ico">' + g.icon + '</span><div class="body"><div class="t">' +
                dom.esc(g.name) + PHR.t('consent.sep.wide', '　') + dom.esc(g.levelName) + '</div>' +
              '<div class="d">' + dom.esc(g.reason) + '</div>' +
              '<div class="s">' + PHR.t('consent.doctor.advice', '建议：{text}', { text: dom.esc(g.advice) }) + '</div></div></div>';
          }).join('') : '');
    }

    return [
      [PHR.t('consent.doctor.diagnoses', '确诊疾病'), '🩺', (b.diagnoses || []).filter(keep)],
      [PHR.t('consent.doctor.surgeries', '手术记录'), '🔪', (b.surgeries || []).filter(keep)],
      [PHR.t('consent.doctor.hospitalizations', '住院记录'), '🛏️', (b.hospitalizations || []).filter(keep)],
      [PHR.t('consent.doctor.vaccinations', '疫苗接种'), '💉', (b.vaccinations || []).filter(keep)]
    ].map(function (s) {
      return '<div class="callout-title">' + s[1] + ' ' + s[0] +
        PHR.t('consent.countParen', '（{n}）', { n: s[2].length }) + '</div>' + recList(s[2]);
    }).join('<div class="divider"></div>');
  }

  /* ------------------------------ 体征指标 ------------------------------ */
  function vitalPanel(rows) {
    if (!rows.length) { return emptyScope('📈'); }
    return '<div id="doc-vital"></div><div class="grid g3 mt4" id="doc-vital-stats"></div>';
  }

  function drawVital(rows) {
    var box = document.getElementById('doc-vital');
    if (!box) { return; }
    var sys = [], dia = [];
    rows.filter(function (r) { return r.data.metricKey === 'systolic' || r.data.metricKey === 'diastolic'; })
      .sort(function (a, b) { return a.date - b.date; })
      .forEach(function (r) {
        var pt = { x: r.date, y: Number(r.data.value), meta: r.data.context || '' };
        if (r.data.metricKey === 'systolic') { sys.push(pt); } else { dia.push(pt); }
      });

    var m = D.metric('systolic');
    if (sys.length || dia.length) {
      PHR.ui.chart.line(box, {
        height: 250, yUnit: 'mmHg', ariaLabel: PHR.t('consent.doctor.bpTrend', '血压趋势'), xTicks: 5,
        series: [{ name: PHR.t('consent.doctor.systolic', '收缩压'), color: 'var(--c1)', points: sys },
                 { name: PHR.t('consent.doctor.diastolic', '舒张压'), color: 'var(--c2)', points: dia }],
        bands: m && m.normal
          ? [{ min: m.normal.min, max: m.normal.max, level: 'ok',
               label: PHR.t('consent.doctor.systolicRange', '收缩压参考区间') }] : []
      });
    } else {
      box.innerHTML = PHR.ui.empty({ icon: '📉', title: PHR.t('consent.doctor.noBp', '没有血压数据'),
        hint: PHR.t('consent.doctor.noBpHint', '本次授权范围内的体征记录里不含血压。'), compact: true });
    }

    var stats = document.getElementById('doc-vital-stats');
    if (!stats) { return; }
    stats.innerHTML = U.unique(rows.map(function (r) { return r.data.metricKey; })).map(function (k) {
      var list = U.sortBy(rows.filter(function (r) { return r.data.metricKey === k; }), 'date');
      var ys = list.map(function (r) { return Number(r.data.value); }).filter(function (v) { return !isNaN(v); });
      if (!ys.length) { return ''; }
      var metric = D.metric(k), dec = metric ? metric.decimals : 1, last = ys[ys.length - 1];
      return '<div class="stat"><span class="corner"></span><div class="label">' + dom.esc(D.metricName(k)) + '</div>' +
        '<div class="value">' + dom.esc(dom.num(last, dec)) + '<span class="unit">' +
          dom.esc(metric ? metric.unit : '') + '</span></div>' +
        '<div class="delta">' + PHR.ui.badges.metricLevel(D.judge(k, last)) + '</div>' +
        '<div class="t-xs dim mt2">' + PHR.t('consent.doctor.vitalSummary', '{n} 次记录　均 {avg}　区间 {min} ~ {max}', {
          n: ys.length,
          avg: dom.esc(dom.num(U.avg(ys), dec)),
          min: dom.esc(dom.num(U.min(ys), dec)),
          max: dom.esc(dom.num(U.max(ys), dec))
        }) + '</div>' +
        '<div class="t-xs dim">' + PHR.t('consent.doctor.latestAt', '最近 {at}',
          { at: U.fmtDate(list[list.length - 1].date) }) + '</div></div>';
    }).join('');
  }

  /* ------------------------------ 就诊记录 ------------------------------ */
  function visitPanel(rows) {
    if (!rows.length) { return emptyScope('🏥'); }
    return '<div class="timeline">' + U.sortBy(rows, 'date', true).map(function (r) {
      return '<div class="tl-item"><span class="dot"></span><div class="when">' + U.fmtDate(r.date) + '</div>' +
        '<div class="what"><div class="h">' + dom.esc(PHR.models.record.displayTitle(r)) + ' ' + PHR.ui.badges.recordType(r.type) + '</div>' +
        '<div class="d">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 160)) + '</div>' +
        '<div class="t-xs dim">' + dom.esc(D.nameOf(D.hospital, r.data.hospital)) +
          PHR.t('consent.sep.wide', '　') +
          dom.esc(D.nameOf(D.department, r.data.department)) + '</div></div></div>';
    }).join('') + '</div>';
  }

  /* ---------------------------- 心理测评报告 ---------------------------- */
  /**
   * 患者授权给医生的心理测评报告。
   *
   * 与 insightPanel 同构：数据不在 records 集合里，自己去别的模块取数。
   * ⚠️ 只能通过 PHR.assessment.forConsent(consent) 取数 —— 它内部走的是
   *    core/security.js 的 canViewScoped（与健康记录共用同一份可见性判定），
   *    并且只认字面量 'psych' 范围。**不要**在这里直接读 PHR.db.assessments。
   */
  function psychPanel(consent) {
    if (!PHR.assessment || !PHR.assessment.forConsent) {
      return PHR.ui.empty({ icon: '🧠', title: PHR.t('consent.doctor.dataMissing', '该数据未生成'),
        hint: PHR.t('consent.doctor.psychModuleMissing', '心理测评模块未加载，或患者还没有完成过测评。'), compact: true });
    }

    var list = [];
    try { list = PHR.assessment.forConsent(consent); }
    catch (e) {
      PHR.warn(PHR.t('consent.doctor.warn.psychRead', '心理测评数据读取失败'), e);
      return PHR.ui.empty({ icon: '🧠', title: PHR.t('consent.doctor.dataMissing', '该数据未生成'),
        hint: PHR.t('consent.doctor.psychReadError', '读取心理测评报告时出错。'), compact: true });
    }

    if (!list.length) {
      return PHR.ui.empty({ icon: '🧠', title: PHR.t('consent.doctor.psychNone', '患者还没有可分享的心理测评'),
        hint: PHR.t('consent.doctor.psychNoneHint', '该范围已被授权，但患者目前没有已完成的测评报告。'), compact: true });
    }

    return PHR.ui.notice('warn', PHR.t('consent.doctor.psychNoticeTitle', '心理测评结果的使用提示'),
        PHR.t('consent.doctor.psychNoticeBody',
          '以下结果是患者**自评筛查**的记录，不是诊断结论。' +
          '请结合临床面谈与病史判断，不要仅凭分数下结论。' +
          '心理数据社会敏感度较高，请注意保密，不要记录到其它非授权系统。'),
        { icon: '⚠️', raw: true }) +

      '<div style="display:grid;gap:var(--sp-3);margin-top:var(--sp-4)">' +
        list.map(function (r) {
          var lv = r.level || {};
          var noCut = !!r.noCutoff;
          return '<div class="record-card">' +
            '<span class="bar" style="background:' + (r.color || 'var(--primary)') + '"></span>' +
            '<div class="head">' +
              '<span class="ico">' + (r.icon || '🧠') + '</span>' +
              '<div class="t">' + dom.esc(r.scaleName) + '</div>' +
              (noCut ? PHR.ui.badge(lv.name || '—', 'muted')
                     : PHR.ui.badge(lv.name || '—', lv.tone || 'info')) +
            '</div>' +
            '<div class="reading" style="margin:6px 0">' +
              '<span class="v" style="font-size:var(--fs-2xl);font-weight:700">' + r.total + '</span>' +
              '<span class="u dim">' + PHR.t('consent.doctor.outOfScore', '/ {n} 分', { n: r.max }) + '</span>' +
            '</div>' +
            '<div class="t-sm">' + dom.esc(lv.summary || '') + '</div>' +
            (noCut ? '<div class="t-xs dim mt1">⚠️ ' +
              dom.esc(r.cutoffNote || PHR.t('consent.doctor.noCutoff', '该量表没有临床切分点')) + '</div>' : '') +

            /* 得分分布 */
            ((r.dimensions || []).length > 1
              ? '<div class="mt3">' + r.dimensions.map(function (d) {
                  return '<div class="bar-row" style="grid-template-columns:96px 1fr auto">' +
                    '<span class="ellipsis t-xs">' + dom.esc(d.name) + '</span>' +
                    '<span class="track"><i style="width:' + Math.max(2, d.percent) + '%;background:var(--primary)"></i></span>' +
                    '<span class="val">' + d.score + '/' + d.max + '</span></div>';
                }).join('') + '</div>'
              : '') +

            /* 患者主动授权分享的应对策略摘要 */
            (r.coping && r.coping.professional && r.coping.professional.length
              ? '<div class="mt3 t-xs dim">' + PHR.t('consent.doctor.copingExcerpt', '患者报告中的建议（摘）：{text}',
                  { text: dom.esc(r.coping.professional[0].title) }) + '</div>'
              : '') +

            '<div class="foot">' +
              '<span>' + PHR.t('consent.doctor.takenAt', '测评于 {at}', { at: U.fmtDateTime(r.at) }) + '</span>' +
              '<span class="dim">' + dom.esc(r.source || '') + '</span>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +

      '<div class="t-xs dim mt4">' +
        PHR.t('consent.doctor.reportCount', '共 {n} 份报告。患者可随时在「医生授权」中撤销该范围。', { n: list.length }) +
      '</div>';
  }

  /* ---------------------------- 健康洞察结论 ---------------------------- */
  function insightPanel() {
    if (!PHR.insight) {
      return PHR.ui.empty({ icon: '🧠', title: PHR.t('consent.doctor.dataMissing', '该数据未生成'),
        hint: PHR.t('consent.doctor.insightModuleMissing', '健康洞察模块未加载，或患者还没有生成洞察结论。'), compact: true });
    }
    try {
      var risk = PHR.insight.risk && PHR.insight.risk.assess ? PHR.insight.risk.assess() : null;
      var trends = (PHR.insight.trend && PHR.insight.trend.analyzeAll ? PHR.insight.trend.analyzeAll(90) : [])
        .filter(function (t) { return !t.empty; }).slice(0, 6);
      var plan = PHR.insight.advice && PHR.insight.advice.dailyPlan ? PHR.insight.advice.dailyPlan() : null;
      var items = (plan && (plan.items || plan.advice || plan)) || [];
      if (!Array.isArray(items)) { items = []; }

      return (risk ? '<div class="callout-title">' + PHR.t('consent.doctor.riskScoreTitle', '综合风险评分') +
            '</div><div class="row wrap gap3 mt2">' +
            PHR.ui.badge(PHR.t('consent.doctor.riskScore', '{n} 分 · {level}', {
              n: String(risk.score !== undefined ? risk.score : '—'),
              level: risk.levelName || risk.level || '—'
            }), risk.tone || 'info') +
            '<span class="t-sm dim">' + dom.esc(risk.summaryText || risk.advice || '') + '</span></div>' : '') +
        '<div class="callout-title mt4">' + PHR.t('consent.doctor.trendsTitle', '指标趋势结论') + '</div>' +
        (trends.length ? '<ul class="t-sm mt2">' + trends.map(function (t) {
          return '<li><b>' + dom.esc(t.name || t.metricName || D.nameOf(D.metrics, t.metricKey)) + '</b>' +
            PHR.t('consent.sep.colon', '：') +
            dom.esc(t.summaryText || t.text || t.summary || t.advice ||
              PHR.t('consent.doctor.trend90', '近 90 天趋势「{dir}」', { dir: t.direction || '—' })) + '</li>';
        }).join('') + '</ul>'
          : '<div class="dim t-sm mt2">' + PHR.t('consent.doctor.noTrends', '暂无趋势结论。') + '</div>') +
        '<div class="callout-title mt4">' + PHR.t('consent.doctor.adviceTitle', '系统建议') + '</div>' +
        (items.length ? '<ul class="t-sm mt2">' + items.slice(0, 6).map(function (a) {
          return '<li>' + dom.esc(typeof a === 'string' ? a : (a.text || a.title || a.advice || '')) + '</li>';
        }).join('') + '</ul>'
          : '<div class="dim t-sm mt2">' + PHR.t('consent.doctor.noAdvice', '暂无建议。') + '</div>');
    } catch (e) {
      PHR.warn(PHR.t('consent.doctor.warn.insightRead', '健康洞察数据读取失败'), e);
      return PHR.ui.empty({ icon: '🧠', title: PHR.t('consent.doctor.dataMissing', '该数据未生成'),
        hint: PHR.t('consent.doctor.insightReadError', '读取洞察结论时出错。'), compact: true });
    }
  }

  /* ================================================================== *
   * 四、越权阻断提示
   * ================================================================== */
  function deniedBlock(consent, keys) {
    var locked = S.list().filter(function (s) { return keys.indexOf(s.key) < 0; });
    if (!locked.length) { return ''; }
    return '<div class="card mt5"><div class="card-head"><h3>' +
        PHR.t('consent.doctor.deniedTitle', '🔒 未被授权的范围') + '</h3>' +
      '<div class="sub">' + PHR.t('consent.doctor.deniedSub',
        '点击任意一项，可以直观看到"医生只能查看被授权内容"这条规则被真正执行') + '</div></div>' +
      '<div class="card-body">' + PHR.ui.notice('danger', PHR.t('consent.doctor.deniedWhy', '为什么把它们放在这里？'),
        PHR.t('consent.doctor.deniedWhyBody',
          '这些范围不在患者的授权清单内，系统不会向您展示任何数据。点击任意一项会触发一次真实的越权判定：' +
          '系统阻断访问、写入一条「越权访问被拒绝」日志，患者会在访问追踪里看到。'), { icon: '⛔' }) +
      '<div class="scope-grid mt4">' + locked.map(function (s) {
        return '<div class="scope-tile" data-action="denied" data-key="' + s.key + '" style="opacity:.62;cursor:not-allowed">' +
          '<span aria-hidden="true">🔒</span><div class="grow"><div class="n">' + dom.esc(s.name) + '</div>' +
          '<div class="d">' + dom.esc(s.desc) + '</div></div></div>';
      }).join('') + '</div></div></div>';
  }

  function deny(consent, key) {
    CS.recordAccess(consent, { scopeKey: key, allowed: false });
    PHR.ui.toast.danger(PHR.t('consent.doctor.deniedToast', '该范围未在授权清单内，访问已被系统阻断并记录'), {
      title: PHR.t('consent.doctor.deniedToastTitle', '越权访问已阻断'),
      detail: PHR.t('consent.doctor.deniedToastDetail', '这条尝试已写入患者的访问日志（consent.denied）。')
    });
  }

  function privacy() {
    return '<div class="mt5 t-xs dim">' +
      PHR.t('consent.doctor.privacy',
        '🔐 隐私声明：您的每一次查看都会被患者看到 —— 包括查阅了哪个范围、看了哪条记录、' +
        '什么时候看的、从哪里看的。请仅将本页信息用于本次诊疗。') +
      '<button class="btn btn-sm mt3" data-action="exit">' + PHR.t('consent.doctor.exit', '退出医生视图') + '</button></div>';
  }

  /* ================================================================== *
   * 五、渲染后的增强（图表 / 表格需要真实 DOM 容器）
   * ================================================================== */
  function afterRender(key, rows) {
    if (key === 'vital') { drawVital(rows); }
    if (key === 'lab') {
      PHR.ui.table(document.getElementById('doc-lab'), {
        pageSize: 8,
        columns: [
          { key: 'date', label: PHR.t('consent.lab.date', '日期'), width: '110px', sortable: true,
            render: function (r) { return U.fmtDate(r.date); } },
          { key: 'type', label: PHR.t('consent.lab.type', '报告类型'), width: '130px',
            render: function (r) { return PHR.ui.badges.recordType(r.type); } },
          { key: 'title', label: PHR.t('consent.lab.title', '报告名称与结论'),
            render: function (r) {
              return '<div class="semibold">' + dom.esc(PHR.models.record.displayTitle(r)) + '</div>' +
                (r.abnormal ? PHR.ui.badge(PHR.t('consent.doctor.resultAbnormal', '结果异常'), 'danger') : '') +
                '<div class="t-xs dim">' + dom.esc(U.truncate(PHR.models.record.summaryOf(r), 100)) + '</div>';
            } },
          { key: 'source', label: PHR.t('consent.lab.source', '来源'), width: '120px',
            render: function (r) { return PHR.ui.badges.source(r.source, r.sourceName); } }
        ]
      });
    }
  }

})(window.PHR);
