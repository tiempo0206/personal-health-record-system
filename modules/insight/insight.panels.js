/**
 * ============================================================================
 * 文件：modules/insight/insight.panels.js
 * 层：业务模块层（健康洞察 —— 模块 4）
 * 职责：「健康洞察」主页五个页签的内容渲染：
 *        overview 总览 / trend 指标趋势 / alerts 异常提醒 /
 *        risk 风险评估 / advice 预防建议。
 *      另提供三个被多处复用的零件：quickAdd（记录一次）、alertCard（告警卡片）、
 *      doctorPrep（就医准备清单）。
 *
 *      实现约定：每次渲染都用一个**全新的元素**替换旧面板（fresh()），
 *      这样面板内绑定的监听器会随旧元素一起被回收，不会因为反复重绘而叠加。
 * 依赖：modules/insight/*、ui/components/{chart,form,modal,toast,empty,badge}.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var D = PHR.dict;
  var dom = PHR.ui.dom;
  var M = PHR.insight.metrics;

  /** 时间范围选项（"全部"用 3650 天表示，避免 0 被当成缺省值）
   *  label 保持中文兜底，展示时经 rangeLabel() 取当前语言的词条：
   *  本文件在 boot 之前加载，这里查词条只会拿到中文。 */
  var RANGES = [
    { key: '30', label: '近 30 天', days: 30 },
    { key: '90', label: '近 90 天', days: 90 },
    { key: '365', label: '近 1 年', days: 365 },
    { key: 'all', label: '全部', days: 3650 }
  ];

  function rangeLabel(r) { return PHR.t('insight.range.' + r.key, r.label); }

  /* 优先级的「高 / 中 / 低」在服务层是中文（供排序与判断用），展示时取词 */
  function priorityText(p) {
    var key = p === '高' ? 'high' : p === '低' ? 'low' : 'medium';
    return PHR.t('insight.priority.' + key, p);
  }

  /* 告警等级 → 徽章文案 */
  function alertLevelName(level) {
    var key = level === 'high' ? 'high' : level === 'low' ? 'low' : 'medium';
    return PHR.t('insight.panel.alert.level.' + key, levelName(level));
  }

  /* 提醒敏感度偏好的展示名 */
  function sensitivityName(pref) {
    var key = pref === 'ok' ? 'ok' : pref === 'critical' ? 'critical' : 'warning';
    var zh = { ok: '全部提醒', warning: '仅警戒以上', critical: '仅危急' }[pref] || pref;
    return PHR.t('insight.panel.alerts.sensitivity.' + key, zh);
  }

  function vital() { return PHR.records.vital; }
  function state() { return PHR.insight.state; }

  function currentDays() {
    var hit = RANGES.filter(function (r) { return r.days === state().days; })[0];
    return hit ? hit.days : 90;
  }

  /** 用一个全新元素替换旧面板，避免事件监听器叠加 */
  function fresh(panel) {
    var next = document.createElement('div');
    if (panel && panel.parentNode) { panel.parentNode.replaceChild(next, panel); }
    return next;
  }

  /** 重新渲染当前页签 */
  function redraw(panel) {
    var fn = PHR.insight.panels[state().tab];
    if (fn) { fn(panel); }
  }

  /* ================================================================== *
   * 一、共用零件
   * ================================================================== */
  /** 快捷记录一次（趋势卡片、告警卡片、详情页都会用到） */
  function quickAdd(metricKey, onDone) {
    var m = D.metric(metricKey) || D.metric('systolic');
    var dual = M.isDual(m.key);
    var fields = [
      { name: 'metricKey',
        label: PHR.t('insight.panel.quickAdd.metricType', '指标类型'),
        type: 'select', required: true, span: 2,
        options: function () {
          return D.metrics.map(function (x) {
            return { key: x.key,
              name: PHR.t('insight.panel.quickAdd.metricOption', '{name}（{unit}）',
                { name: x.name, unit: x.unit }) };
          });
        } },
      { name: 'measuredAt', label: PHR.t('insight.panel.quickAdd.measuredAt', '测量时间'),
        type: 'datetime', required: true },
      { name: 'value',
        label: dual ? PHR.t('insight.panel.quickAdd.systolic', '收缩压（高压）')
                    : PHR.t('insight.panel.quickAdd.value', '数值'),
        type: 'number', required: true, step: 0.1, min: 0, unit: m.unit },
      { name: 'value2', label: PHR.t('insight.panel.quickAdd.diastolic', '舒张压（低压）'),
        type: 'number', step: 0.1, min: 0 },
      { name: 'context', label: PHR.t('insight.panel.quickAdd.context', '测量情境'),
        type: 'text', span: 2,
        placeholder: PHR.t('insight.panel.quickAdd.contextPlaceholder',
          '如：晨起空腹 / 运动后 / 服药后 2 小时') }
    ];

    PHR.ui.form.dialog({
      title: PHR.t('insight.panel.quickAdd.dialogTitle', '记录一次「{metric}」', { metric: m.name }),
      fields: fields,
      values: {
        metricKey: m.key,
        measuredAt: Date.now(),        // 传时间戳，表单会按本地时区格式化
        value: '',
        value2: '',
        context: vital().defaultContext(m.key)
      },
      submitLabel: PHR.t('insight.panel.quickAdd.submit', '保存记录'),
      onSubmit: function (v) {
        var at = String(v.measuredAt || '').replace('T', ' ');
        var res = vital().add(v.metricKey, v.value, v.value2, at, { context: v.context });
        if (!res || res.ok === false) {
          PHR.ui.toast.warn(res && res.message ? res.message
            : PHR.t('insight.panel.quickAdd.saveFailed', '保存失败，请检查填写内容'));
          return false;
        }
        // 保存后立刻把这次读数的含义讲给用户听，而不是只弹一句"保存成功"
        var e = M.explain(v.metricKey, Number(v.value));
        PHR.ui.toast({
          type: e.level === 'critical' ? 'danger' : e.level === 'warning' ? 'warn' : 'ok',
          title: PHR.t('insight.panel.quickAdd.savedTitle', '已记录：{metric}',
            { metric: D.metric(v.metricKey).shortName }),
          message: e.headline + '。' + e.levelName
        });
        if (onDone) { onDone(); }
        return true;
      }
    });
  }

  function levelName(level) {
    return { high: '高优先级', medium: '中优先级', low: '低优先级' }[level] || level;
  }

  /** 单条告警卡片 */
  function alertCard(a) {
    var sev = a.level === 'high' ? 'sev-high' : a.level === 'medium' ? 'sev-medium' : 'sev-low';
    return '<div class="alert-card ' + sev + '">' +
      '<span class="ico" aria-hidden="true">' + (a.icon || '⚠️') + '</span>' +
      '<div class="body">' +
        '<div class="t">' + dom.esc(a.title) +
          '<span class="badge tone-muted ml2">' + U.fmtRelative(a.at) + '</span>' +
          '<span class="badge tone-' + a.tone + ' ml2">' + dom.esc(alertLevelName(a.level)) + '</span>' +
        '</div>' +
        '<div class="d">' + dom.esc(a.detail) + '</div>' +
        (a.advice ? '<div class="s"><b>' +
          dom.esc(PHR.t('insight.panel.alert.adviceLabel', '建议：')) + '</b>' +
          dom.esc(a.advice) + '</div>' : '') +
      '</div>' +
      '<div class="col gap2 none">' +
        (a.metricKey ? '<button class="btn btn-sm btn-primary" data-action="alert-record" data-metric="' +
          dom.esc(a.metricKey) + '">' +
          dom.esc(PHR.t('insight.panel.alert.record', '去记录一次')) + '</button>' : '') +
        '<button class="btn btn-sm" data-action="alert-doctor">' +
          dom.esc(PHR.t('insight.panel.alert.doctor', '去就医准备')) + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="alert-dismiss" data-id="' +
          dom.esc(a.id) + '">' +
          dom.esc(PHR.t('insight.panel.alert.dismiss', '忽略')) + '</button>' +
      '</div>' +
    '</div>';
  }

  /** 就医准备清单：把"去医院要说什么"整理成一页 */
  function doctorPrep() {
    var p = PHR.records.profile.get();
    var meds = PHR.records.medication.current();
    var allergies = PHR.records.medication.allergiesBySeverity();
    var abnormal = vital().abnormalAll(30).slice(0, 6);
    var overdue = PHR.records.history.followUpDue().filter(function (f) { return f.overdue; });
    var alerts = PHR.insight.anomaly.active().slice(0, 5);

    function li(title, arr) {
      return '<div class="mb3"><div class="semibold">' + title + '</div>' +
        (arr.length ? '<ul class="t-sm" style="margin:4px 0 0;padding-left:1.2em">' +
          arr.map(function (x) { return '<li>' + dom.esc(x) + '</li>'; }).join('') + '</ul>'
          : '<div class="t-sm dim">—</div>') + '</div>';
    }

    var body =
      PHR.ui.notice('info', PHR.t('insight.prep.noticeTitle', '这份清单不是诊断'),
        PHR.t('insight.prep.noticeBody',
          '它的作用是把您最近的健康数据整理成医生最容易看懂的形式，就诊时可以直接出示或读给医生听。'),
        { icon: '📋' }) +
      '<div class="p4">' +
        li(PHR.t('insight.prep.basic', '基本信息'), [p
          ? [
              PHR.t('insight.prep.name', '姓名：{name}', { name: p.realName }),
              PHR.t('insight.prep.gender', '性别：{gender}',
                { gender: D.nameOf(D.gender, p.gender) }),
              (p.birthDate
                ? PHR.t('insight.prep.age', '年龄：{age} 岁', { age: U.ageFrom(p.birthDate) }) : ''),
              (p.bloodType
                ? PHR.t('insight.prep.bloodType', '血型：{blood}',
                    { blood: D.nameOf(D.bloodType, p.bloodType) }) : '')
            ].filter(function (x) { return x; }).join(PHR.t('insight.sep.wide', '　'))
          : PHR.t('insight.prep.noProfile', '（尚未填写个人基本信息）')]) +
        li(PHR.t('insight.prep.abnormal', '最近异常读数'), abnormal.map(function (a) {
          return PHR.t('insight.prep.abnormalItem', '{date}　{metric} {value} {unit}（{level}）', {
            date: U.fmtDate(a.at), metric: a.metricName,
            value: M.fmt(a.value, M.decimalsOf(a.metricKey)), unit: a.unit, level: a.levelName
          });
        })) +
        li(PHR.t('insight.prep.alerts', '需要医生关注的问题'), alerts.map(function (a) {
          return PHR.t('insight.prep.alertItem', '{title}：{detail}',
            { title: a.title, detail: a.detail });
        })) +
        li(PHR.t('insight.prep.meds', '正在服用的药物'),
          meds.map(function (x) { return x.data.drugName + ' ' + (x.data.dose || ''); })) +
        li(PHR.t('insight.prep.allergies', '已知过敏原'), allergies.map(function (a) {
          return PHR.t('insight.prep.allergyItem', '{allergen}（{severity}）',
            { allergen: a.data.allergen, severity: D.nameOf(D.severity, a.data.severity) });
        })) +
        li(PHR.t('insight.prep.followUp', '需要复查的项目'), overdue.map(function (f) {
          return PHR.t('insight.prep.followUpItem', '{disease}：{advice}（已逾期 {days} 天）',
            { disease: f.diseaseName, advice: f.advice, days: Math.abs(f.daysLeft) });
        })) +
        li(PHR.t('insight.prep.questions', '建议向医生提出的问题'), [
          PHR.t('insight.prep.q1', '我目前的用药方案还需要继续吗？剂量是否需要调整？'),
          PHR.t('insight.prep.q2', '这些指标的变化趋势说明什么？还需要做什么检查？'),
          PHR.t('insight.prep.q3', '在饮食、运动、作息上，我最应该优先改哪一件事？')
        ]) +
        '<div class="t-xs dim mt4">' +
          PHR.t('insight.prep.footer', '由「{app}」于 {at} 生成。内容均为用户自述与自测数据，未经医疗机构核实。',
            { app: PHR.meta.appName, at: U.fmtDateTime(Date.now()) }) + '</div>' +
      '</div>';

    PHR.ui.modal({
      title: PHR.t('insight.prep.title', '就医准备清单'), size: 'wide', body: body,
      actions: [
        { label: PHR.t('insight.prep.close', '关闭'), tone: 'ghost' },
        { label: PHR.t('insight.prep.copy', '复制为文本'), tone: 'primary', close: false,
          action: function (v, close, bodyEl) {
            dom.copy(String(bodyEl.innerText || '').trim()).then(function (ok) {
              if (ok) { PHR.ui.toast.ok(PHR.t('insight.prep.copied', '清单已复制到剪贴板')); }
              else {
                PHR.ui.toast.warn(PHR.t('insight.prep.copyFailed',
                  '复制失败，请手动选择文本复制'));
              }
            });
          } }
      ]
    });
  }

  /** 统一绑定面板内的动作（面板每次都是新元素，不会重复绑定） */
  function bindPanel(panel, extra) {
    dom.actions(panel, Object.assign({
      'alert-dismiss': function (e, el) {
        PHR.insight.anomaly.dismiss(el.getAttribute('data-id'));
        PHR.ui.toast.info(PHR.t('insight.panel.alert.dismissedToast',
          '已忽略这条提醒（30 天内不再显示）'));
        redraw(panel);
      },
      'alert-record': function (e, el) {
        quickAdd(el.getAttribute('data-metric'), function () { redraw(panel); });
      },
      'alert-doctor': function () { doctorPrep(); },
      'go-tab': function (e, el) { PHR.insight.goTab(el.getAttribute('data-tab')); }
    }, extra || {}));
  }

  /* ================================================================== *
   * 二、总览
   * ================================================================== */
  function drawOverview(panel) {
    panel = fresh(panel);

    var risk = PHR.insight.risk.assess();
    var imps = PHR.insight.risk.improvements();
    var plan = PHR.insight.advice.dailyPlan();
    var week = PHR.insight.advice.weeklyReport();
    var alerts = PHR.insight.anomaly.active();
    var color = risk.tone === 'ok' ? 'var(--ok)' : risk.tone === 'warn' ? 'var(--warn)'
      : risk.tone === 'danger' ? 'var(--danger)' : 'var(--primary)';

    panel.innerHTML =
      '<div class="grid g2 mb5">' +
        '<div class="card"><div class="card-head"><h3>' +
          dom.esc(PHR.t('insight.panel.overview.riskCard', '健康风险评分')) + '</h3>' +
          '<div class="sub">' + dom.esc(PHR.t('insight.panel.overview.riskSub',
            '{n} 个维度综合 · 得分越高越好', { n: risk.factors.length })) + '</div></div>' +
          '<div class="card-body"><div class="risk-gauge"><div id="ov-gauge"></div>' +
            '<div class="risk-list">' +
              '<div class="row between"><span>' +
                dom.esc(PHR.t('insight.panel.overview.riskLevel', '风险等级')) + '</span>' +
                '<span class="badge tone-' + risk.tone + '">' +
                dom.esc(PHR.t('insight.panel.riskLevelBadge', '{level}风险',
                  { level: risk.levelName })) + '</span></div>' +
              '<div class="row between"><span>' +
                dom.esc(PHR.t('insight.panel.overview.riskDeduction', '扣分合计')) + '</span>' +
                '<span class="bold">' + dom.esc(PHR.t('insight.panel.overview.riskDeductionValue',
                  '{n} 分', { n: risk.deduction })) + '</span></div>' +
              '<div class="row between"><span>' +
                dom.esc(PHR.t('insight.panel.overview.pending', '待处理提醒')) + '</span>' +
                '<span class="bold">' + dom.esc(PHR.t('insight.panel.overview.pendingValue',
                  '{n} 条', { n: alerts.length })) + '</span></div>' +
              '<div class="t-sm">' + dom.esc(risk.summaryText) + '</div>' +
              '<button class="btn btn-sm btn-soft" data-action="go-tab" data-tab="risk">' +
                dom.esc(PHR.t('insight.panel.overview.viewFull', '查看完整评估')) + '</button>' +
            '</div>' +
          '</div></div>' +
        '</div>' +

        '<div class="card"><div class="card-head"><h3>' +
          dom.esc(PHR.t('insight.panel.overview.improve3', '最容易改善的 3 件事')) + '</h3>' +
          '<div class="sub">' +
          dom.esc(PHR.t('insight.panel.overview.improve3Sub', '按「收益 ÷ 难度」排序')) + '</div></div>' +
          '<div class="card-body">' + imps.map(improveRow).join('') + '</div></div>' +
      '</div>' +

      '<div class="grid g2">' +
        '<div class="card"><div class="card-head"><h3>' +
          dom.esc(PHR.t('insight.panel.overview.plan', '今日健康计划')) + '</h3>' +
          '<div class="sub">' + dom.esc(PHR.t('insight.panel.overview.planProgress',
            '完成 {done} / {total}', { done: plan.progress.done, total: plan.progress.total })) +
          '</div></div>' +
          '<div class="card-body">' + planHtml(plan) + '</div></div>' +

        '<div class="card"><div class="card-head"><h3>' +
          dom.esc(PHR.t('insight.panel.overview.week', '本周小结')) + '</h3>' +
          '<div class="sub">' + dom.esc(week.range.text) + '</div></div>' +
          '<div class="card-body">' + weekHtml(week) + '</div></div>' +
      '</div>';

    PHR.ui.chart.gauge(panel.querySelector('#ov-gauge'), {
      percent: risk.score, value: risk.score,
      label: PHR.t('insight.panel.gauge.healthScore', '健康得分'), color: color
    });
    bindPanel(panel);
    bindTodo(panel, function () { drawOverview(panel); });
  }

  function improveRow(i) {
    return '<div class="mb4">' +
      '<div class="row between wrap gap2"><span class="semibold">' + dom.esc(i.title) + '</span>' +
        PHR.ui.badge(i.priority + PHR.t('insight.panel.prioritySuffix', '优先'), i.tone) + '</div>' +
      '<div class="t-sm mt1">' + dom.esc(i.detail) + '</div>' +
      '<div class="t-sm dim mt1">' + dom.esc(i.expected) + '</div></div>';
  }

  function planHtml(plan) {
    return plan.items.map(function (it) {
      return '<label class="checkbox mb2" style="display:flex;align-items:flex-start;gap:8px">' +
        '<input type="checkbox" data-todo="' + dom.esc(it.id) + '"' + (it.done ? ' checked' : '') + '>' +
        '<span><b>' + it.icon + ' ' + dom.esc(PHR.insight.advice.kindName(it.kind)) + '</b>　' +
        (it.done ? '<s class="dim">' + dom.esc(it.text) + '</s>' : dom.esc(it.text)) + '</span></label>';
    }).join('') +
    '<div class="t-xs dim mt3">' +
      dom.esc(PHR.t('insight.panel.plan.footer',
        '勾选状态当天有效，每天 0 点自动重置。今日完成 {done} / {total}（{percent}%）。',
        { done: plan.progress.done, total: plan.progress.total, percent: plan.progress.percent })) +
      '</div>';
  }

  function bindTodo(panel, rerender) {
    U.$$('[data-todo]', panel).forEach(function (box) {
      box.addEventListener('change', function () {
        PHR.insight.advice.toggle(box.getAttribute('data-todo'));
        rerender();
      });
    });
  }

  function weekHtml(week) {
    function block(title, arr, tone) {
      if (!arr.length) { return ''; }
      return '<div class="mb3"><div class="semibold ' + (tone || '') + '">' + title + '</div>' +
        '<ul class="t-sm" style="margin:4px 0 0;padding-left:1.2em">' +
        arr.map(function (x) { return '<li>' + dom.esc(x) + '</li>'; }).join('') + '</ul></div>';
    }
    return '<div class="t-sm mb3">' + dom.esc(week.text) + '</div>' +
      block(PHR.t('insight.panel.week.highlights', '✅ 本周亮点'), week.highlights, 'ok') +
      block(PHR.t('insight.panel.week.concerns', '⚠️ 需要关注'), week.concerns, 'warn') +
      block(PHR.t('insight.panel.week.next', '🎯 下周建议'), week.nextWeek) +
      '<div class="t-xs dim mt2">' + dom.esc(week.disclaimer) + '</div>';
  }

  /* ================================================================== *
   * 三、指标趋势
   * ================================================================== */
  function drawTrend(panel) {
    panel = fresh(panel);

    var st = state();
    var days = currentDays();
    var summaries = M.withData(days);
    var all = summaries.map(function (s) { return s.metricKey; });

    // 血压一次测量出两个数：收缩压卡片里已经画了舒张压那条线，不再重复出卡片
    var eligible = all.indexOf('systolic') >= 0
      ? all.filter(function (k) { return k !== 'diastolic'; }) : all;
    var keys = st.metrics.length
      ? eligible.filter(function (k) { return st.metrics.indexOf(k) >= 0; }) : eligible;
    // 每个指标都在显示时视为"未筛选"，避免出现"所有 chip 都高亮却没有卡片"的状态
    if (st.metrics.length && keys.length === eligible.length) { st.metrics = []; }
    function chipOn(key) { return !st.metrics.length || st.metrics.indexOf(key) >= 0; }

    panel.innerHTML =
      '<div class="card mb4"><div class="card-body tight">' +
        '<div class="row wrap gap3 between">' +
          '<div class="segmented" id="range-switch">' +
            RANGES.map(function (r) {
              return '<button data-days="' + r.days + '" aria-pressed="' + (r.days === days) + '">' +
                dom.esc(rangeLabel(r)) + '</button>';
            }).join('') +
          '</div>' +
          '<div class="row wrap gap2">' +
            '<button class="btn btn-sm btn-ghost" data-action="clear-filter">' +
              dom.esc(PHR.t('insight.panel.trend.showAll', '显示全部指标')) + '</button>' +
            '<button class="btn btn-sm btn-primary" data-action="add">' +
              dom.esc(PHR.t('insight.panel.trend.add', '＋ 记录一次')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="row wrap gap2 mt3">' +
          summaries.map(function (s) {
            return '<span class="chip clickable' + (chipOn(s.metricKey) ? ' active' : '') +
              '" data-metric="' + dom.esc(s.metricKey) + '">' + dom.esc(s.metric.shortName) + '　' +
              dom.esc(dom.num(s.latest.value, s.metric.decimals)) + ' ' + dom.esc(s.metric.unit) + '</span>';
          }).join('') +
        '</div>' +
      '</div></div>' +

      (keys.length
        ? '<div class="grid auto-grid">' + keys.map(function (k) {
            return metricCardHtml(k, days, summaries);
          }).join('') + '</div>'
        : '<div class="card"><div class="card-body">' + PHR.ui.empty({
            icon: '📈',
            title: PHR.t('insight.panel.trend.empty.title', '这个时间范围内还没有体征记录'),
            hint: PHR.t('insight.panel.trend.empty.hint',
              '换一个时间范围，或者点「记录一次」开始积累数据 —— 连续记录 3 次以上就能看出趋势。'),
            action: { label: PHR.t('insight.panel.trend.empty.action', '记录一次'), action: 'add' }
          }) + '</div></div>');

    keys.forEach(function (k) {
      var box = panel.querySelector('#chart_' + k);
      if (box) { PHR.ui.chart.line(box, PHR.insight.trend.chartConfig(k, days)); }
    });

    var switcher = panel.querySelector('#range-switch');
    if (switcher) {
      switcher.addEventListener('click', function (e) {
        var b = e.target.closest('[data-days]');
        if (!b) { return; }
        st.days = Number(b.getAttribute('data-days'));
        drawTrend(panel);
      });
    }

    // 指标筛选 chips（多选）
    panel.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip[data-metric]');
      if (!chip || !panel.contains(chip)) { return; }
      var key = chip.getAttribute('data-metric');
      var list = st.metrics.length ? st.metrics.slice() : eligible.slice();
      var i = list.indexOf(key);
      if (i >= 0) { list.splice(i, 1); } else { list.push(key); }
      st.metrics = list;
      drawTrend(panel);
    });

    bindPanel(panel, {
      'clear-filter': function () { st.metrics = []; drawTrend(panel); },
      add: function () { quickAdd(keys[0] || 'systolic', function () { drawTrend(panel); }); },
      detail: function (e, el) { PHR.router.go('/insight/' + el.getAttribute('data-metric')); },
      record: function (e, el) {
        quickAdd(el.getAttribute('data-metric'), function () { drawTrend(panel); });
      },
      explain: function (e, el) { explainModal(el.getAttribute('data-metric')); }
    });
  }

  /** 单张指标卡片：大号数值 + 等级徽章 + 刻度尺 + 折线图 + 趋势结论 */
  function metricCardHtml(key, days, summaries) {
    var s = summaries.filter(function (x) { return x.metricKey === key; })[0];
    if (!s) { return ''; }
    var m = s.metric;
    var t = PHR.insight.trend.analyze(key, days);
    var reading = s.latest.value2 !== null && s.latest.value2 !== undefined
      ? dom.num(s.latest.value, m.decimals) + '/' + dom.num(s.latest.value2, m.decimals)
      : dom.num(s.latest.value, m.decimals);

    return '<div class="metric-card' + (s.level === 'ok' ? '' : ' tone-' + s.level) + '">' +
      '<div class="top"><span class="name">' + dom.esc(m.name) + '</span>' +
        PHR.ui.badges.metricLevel(s.level) + '</div>' +

      '<div class="reading"><span class="v">' + reading + '</span>' +
        '<span class="u">' + dom.esc(m.unit) + '</span>' +
        '<span class="t-xs dim">' + U.fmtRelative(s.latest.at) + '</span></div>' +

      PHR.ui.chart.scaleBar(s.latest.value, m) +

      '<div class="ref">' +
        dom.esc(PHR.t('insight.panel.metricCard.ref', '正常范围 {range}',
          { range: M.normalRangeText(m) })) +
        dom.esc(PHR.t('insight.sep.dot', '　·　')) +
        dom.esc(PHR.t('insight.panel.metricCard.refCount', '{n} 次记录（数据{coverage}）',
          { n: s.count, coverage: M.coverageOf(s.count) })) +
        (t.count >= 2
          ? dom.esc(PHR.t('insight.sep.dot', '　·　')) +
            dom.esc(PHR.t('insight.panel.metricCard.refVolatility', '波动 {value} {unit}',
              { value: dom.num(t.volatility, m.decimals), unit: m.unit }))
          : '') + '</div>' +

      '<div class="chart-wrap" id="chart_' + dom.esc(key) + '"></div>' +

      '<div class="t-sm">' + dom.esc(t.summaryText) + '</div>' +
      '<div class="t-sm dim">' + dom.esc(M.explain(key, s.latest.value).compareText) + '</div>' +

      '<div class="row wrap gap2 mt2">' +
        '<button class="btn btn-sm btn-primary" data-action="record" data-metric="' + dom.esc(key) +
          '">' + dom.esc(PHR.t('insight.panel.metricCard.record', '记录一次')) + '</button>' +
        '<button class="btn btn-sm" data-action="detail" data-metric="' + dom.esc(key) +
          '">' + dom.esc(PHR.t('insight.panel.metricCard.detail', '查看详情')) + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="explain" data-metric="' + dom.esc(key) +
          '">' + dom.esc(PHR.t('insight.panel.metricCard.explain', '这是什么？')) + '</button>' +
      '</div>' +
    '</div>';
  }

  /** "这是什么？"：把指标含义、本次读数的解释与建议一次讲清楚 */
  function explainModal(key) {
    var m = D.metric(key);
    if (!m) { return; }
    var s = vital().summary(key, { days: currentDays() });
    var e = s.count ? M.explain(key, s.latest.value) : null;

    PHR.ui.modal({
      title: PHR.t('insight.panel.explain.title', '{metric} · 指标说明', { metric: m.name }),
      body: '<dl class="kv">' +
        '<dt>' + dom.esc(PHR.t('insight.panel.explain.what', '这项指标')) + '</dt><dd>' +
          dom.esc(m.desc) + '</dd>' +
        '<dt>' + dom.esc(PHR.t('insight.panel.explain.unit', '单位与精度')) + '</dt><dd>' +
          dom.esc(PHR.t('insight.panel.explain.unitValue', '{unit}，保留 {digits} 位小数',
            { unit: m.unit, digits: m.decimals })) + '</dd>' +
        '<dt>' + dom.esc(PHR.t('insight.panel.explain.normalRange', '正常范围')) + '</dt><dd>' +
          dom.esc(M.normalRangeText(m)) + '</dd>' +
        '<dt>' + dom.esc(PHR.t('insight.panel.explain.warnRange', '警戒范围')) + '</dt><dd>' +
          dom.esc(M.rangeText(m.warn, m.decimals) + ' ' + m.unit) + '</dd>' +
        (m.target !== null && m.target !== undefined
          ? '<dt>' + dom.esc(PHR.t('insight.panel.explain.target', '目标值')) + '</dt><dd>' +
            dom.esc(M.fmt(m.target, m.decimals) + ' ' + m.unit) + '</dd>' : '') +
        (e ? '<dt>' + dom.esc(PHR.t('insight.panel.explain.latest', '最近一次读数')) + '</dt><dd>' +
             dom.esc(e.detail) + '</dd>' +
             '<dt>' + dom.esc(PHR.t('insight.panel.explain.advice', '分级建议')) + '</dt><dd>' +
             dom.esc(e.advice) + '</dd>' : '') +
        '</dl>' +
        '<div class="mt4">' +
        PHR.ui.notice('warn', PHR.t('insight.panel.explain.notDiagnosis', '这不是诊断'), M.DISCLAIMER,
          { icon: '⚠️' }) + '</div>',
      actions: [
        { label: PHR.t('insight.panel.explain.close', '关闭'), tone: 'ghost' },
        { label: PHR.t('insight.panel.explain.record', '记录一次'), tone: 'primary',
          action: function () { quickAdd(key); } }
      ]
    });
  }

  /* ================================================================== *
   * 四、异常提醒
   * ================================================================== */
  function drawAlerts(panel) {
    panel = fresh(panel);

    var all = PHR.insight.anomaly.scan();
    var shown = PHR.insight.anomaly.active({ list: all });
    var lv = PHR.insight.anomaly.byLevel({ list: all });
    var blocked = PHR.insight.anomaly.dismissed();
    var prefName = sensitivityName(PHR.insight.anomaly.thresholdOf());

    function tile(label, value, tone, sub) {
      return '<div class="stat' + (tone ? ' tone-' + tone : '') + '"><span class="corner"></span>' +
        '<div class="label">' + dom.esc(label) + '</div>' +
        '<div class="value">' + dom.esc(value) + '</div>' +
        '<div class="delta dim">' + dom.esc(sub) + '</div></div>';
    }

    panel.innerHTML =
      PHR.ui.notice('info', PHR.t('insight.panel.alerts.noticeTitle', '提醒是怎么来的？'),
        PHR.t('insight.panel.alerts.noticeBody',
          '系统内置 {count} 类检测规则：{rules}；每次打开本页都会重新扫描全部体征数据。' +
          '当前提醒敏感度：{pref}（可在「体验保障 → 偏好设置」中调整）。',
          {
            count: PHR.insight.anomaly.rules.length,
            rules: PHR.insight.anomaly.rules.join(PHR.t('insight.punct.listSep', '、')),
            pref: prefName
          }), { icon: '🧠' }) +

      '<div class="grid g4 mb5">' +
        tile(PHR.t('insight.panel.alert.level.high', '高优先级'), String(lv.count.high),
          lv.count.high ? 'danger' : 'ok',
          lv.count.high ? PHR.t('insight.panel.alerts.highSub', '建议尽快处理')
            : PHR.t('insight.panel.alerts.highSubNone', '没有高危提醒')) +
        tile(PHR.t('insight.panel.alert.level.medium', '中优先级'), String(lv.count.medium),
          lv.count.medium ? 'warn' : '',
          PHR.t('insight.panel.alerts.mediumSub', '建议近期复测')) +
        tile(PHR.t('insight.panel.alert.level.low', '低优先级'), String(lv.count.low), '',
          PHR.t('insight.panel.alerts.lowSub', '了解即可')) +
        tile(PHR.t('insight.panel.alerts.dismissed', '已忽略'), String(blocked.length), '',
          PHR.t('insight.panel.alerts.dismissedSub', '30 天后自动恢复显示')) +
      '</div>' +

      (shown.length
        ? shown.map(alertCard).join('')
        : '<div class="card"><div class="card-body">' + PHR.ui.empty({
            icon: '✅',
            title: PHR.t('insight.panel.alerts.empty.title', '当前没有需要处理的提醒'),
            hint: PHR.t('insight.panel.alerts.empty.hint',
              '指标都在正常范围内。系统会持续监测，出现连续异常、快速变化或长期未测时会在这里提醒。'),
            action: { label: PHR.t('insight.panel.alerts.empty.action', '去记录一次'), action: 'add' }
          }) + '</div></div>') +

      (blocked.length
        ? '<div class="card mt4"><div class="card-head"><h3>' +
            dom.esc(PHR.t('insight.panel.alerts.dismissedCard', '已忽略的提醒')) + '</h3>' +
            '<div class="actions"><button class="btn btn-sm" data-action="restore-all">' +
            dom.esc(PHR.t('insight.panel.alerts.restoreAll', '全部恢复')) + '</button>' +
            '</div></div>' +
            '<div class="card-body t-sm dim">' +
            dom.esc(PHR.t('insight.panel.alerts.dismissedNote',
              '共 {n} 条已忽略。被忽略的提醒不会消失，只是暂时不显示。', { n: blocked.length })) +
            '</div></div>'
        : '');

    bindPanel(panel, {
      add: function () { quickAdd('systolic', function () { drawAlerts(panel); }); },
      'restore-all': function () {
        PHR.insight.anomaly.clearDismissed();
        PHR.ui.toast.ok(PHR.t('insight.panel.alerts.restoredToast', '已恢复全部被忽略的提醒'));
        drawAlerts(panel);
      }
    });
  }

  /* ================================================================== *
   * 五、风险评估
   * ================================================================== */
  function drawRisk(panel) {
    panel = fresh(panel);

    var r = PHR.insight.risk.assess();
    var imps = PHR.insight.risk.improvements();
    var color = r.tone === 'ok' ? 'var(--ok)' : r.tone === 'warn' ? 'var(--warn)'
      : r.tone === 'danger' ? 'var(--danger)' : 'var(--primary)';

    panel.innerHTML =
      '<div class="card mb4"><div class="card-body"><div class="risk-gauge"><div id="rk-gauge"></div>' +
        '<div class="risk-list">' +
          '<div class="row between"><span>' +
            dom.esc(PHR.t('insight.panel.overview.riskLevel', '风险等级')) + '</span>' +
            '<span class="badge tone-' + r.tone + '">' +
            dom.esc(PHR.t('insight.panel.riskLevelBadge', '{level}风险', { level: r.levelName })) +
            '</span></div>' +
          '<div class="row between"><span>' +
            dom.esc(PHR.t('insight.panel.risk.dimensions', '纳入评估的维度')) + '</span>' +
            '<span class="bold">' +
            dom.esc(PHR.t('insight.panel.risk.dimensionsValue', '{n} 项', { n: r.factors.length })) +
            '</span></div>' +
          '<div class="row between"><span>' +
            dom.esc(PHR.t('insight.panel.overview.riskDeduction', '扣分合计')) + '</span>' +
            '<span class="bold">' + dom.esc(PHR.t('insight.panel.risk.deductionValue',
              '{n} / {max} 分', { n: r.deduction, max: PHR.insight.risk.model.maxDeduction })) +
            '</span></div>' +
          '<div class="t-sm">' + dom.esc(r.summaryText) + '</div>' +
        '</div></div></div></div>' +

      '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.panel.risk.byDimension', '分维度得分')) + '</h3>' +
        '<div class="sub">' +
        dom.esc(PHR.t('insight.panel.risk.byDimensionSub', '满分 100 分，越高越好')) + '</div></div>' +
        '<div class="card-body" id="rk-bars"></div></div>' +

      '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.panel.risk.basis', '评估依据（点击展开）')) + '</h3>' +
        '<div class="sub">' +
        dom.esc(PHR.t('insight.panel.risk.basisSub', '每一项结论都对应真实数据')) + '</div></div>' +
        '<div class="card-body">' + r.factors.map(factorRow).join('') + '</div></div>' +

      '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.panel.overview.improve3', '最容易改善的 3 件事')) + '</h3></div>' +
        '<div class="card-body">' + imps.map(improveRow).join('') + '</div></div>' +

      '<div class="card"><div class="card-body">' +
        PHR.ui.notice('warn',
          PHR.t('insight.panel.risk.modelNotice',
            '⚠️ 模型说明：这是简易规则模型，不是临床评分工具'),
          PHR.insight.risk.model.note + ' ' + r.disclaimer, { icon: '📐' }) +
      '</div></div>';

    PHR.ui.chart.gauge(panel.querySelector('#rk-gauge'), {
      percent: r.score, value: r.score,
      label: PHR.t('insight.panel.gauge.healthScore', '健康得分'), color: color
    });
    PHR.ui.chart.bar(panel.querySelector('#rk-bars'), {
      items: PHR.insight.risk.byCategory().map(function (c) {
        var tone = c.tone === 'ok' ? 'ok' : c.tone === 'info' ? 'info'
          : c.tone === 'warn' ? 'warn' : 'danger';
        return { label: c.label + '（' + c.levelName + '）', value: c.value, color: 'var(--' + tone + ')' };
      }),
      horizontal: true, yUnit: PHR.t('insight.panel.risk.barUnit', '分'), valueDigits: 0
    });

    bindPanel(panel, {
      'alert-record': function () { PHR.insight.goTab('trend'); }
    });
  }

  function factorRow(f) {
    return '<details class="mb3"><summary class="row between pointer">' +
        '<span class="semibold">' + dom.esc(f.name) + '</span>' +
        '<span class="row gap2"><span class="dim t-xs">' +
          dom.esc(PHR.t('insight.panel.risk.weight', '权重 {w} 分 · 得分 {s}',
            { w: f.weight, s: f.score })) + '</span>' +
        PHR.ui.badge(f.levelName, f.tone) + '</span>' +
      '</summary>' +
      '<div class="t-sm mt2"><b>' +
        dom.esc(PHR.t('insight.panel.risk.basisLabel', '判断依据：')) + '</b>' +
        dom.esc(f.evidence) + '</div>' +
      '<div class="t-sm mt2"><b>' +
        dom.esc(PHR.t('insight.panel.risk.adviceLabel', '建议：')) + '</b>' +
        dom.esc(f.advice) + '</div>' +
    '</details>';
  }

  /* ================================================================== *
   * 六、预防建议
   * ================================================================== */
  function drawAdvice(panel) {
    panel = fresh(panel);

    var groups = PHR.insight.advice.generate();
    var plan = PHR.insight.advice.dailyPlan();

    panel.innerHTML =
      PHR.ui.notice('primary', PHR.t('insight.panel.advice.noticeTitle', '为什么只显示这几条？'),
        PHR.t('insight.panel.advice.noticeBody',
          '系统里一共内置了 {count} 条建议规则，' +
          '只有当您的数据满足触发条件时才会显示出来。所以看到的每一条，都对应档案里的某个具体数值。',
          { count: PHR.insight.advice.ruleCount }), { icon: '🎯' }) +

      (groups.length
        ? groups.map(function (g) {
            return '<div class="card mb4"><div class="card-head"><h3>' + g.icon + ' ' +
              dom.esc(g.label) + '</h3><div class="sub">' +
              dom.esc(PHR.t('insight.panel.advice.count', '{n} 条', { n: g.items.length })) +
              '</div></div>' +
              '<div class="card-body">' + g.items.map(adviceRow).join('') + '</div></div>';
          }).join('')
        : '<div class="card mb4"><div class="card-body">' + PHR.ui.empty({
            icon: '🌱',
            title: PHR.t('insight.panel.advice.empty.title', '暂时没有需要特别提醒的建议'),
            hint: PHR.t('insight.panel.advice.empty.hint',
              '这通常意味着各项指标都比较理想。继续按固定频率记录，出现变化时这里会自动给出建议。')
          }) + '</div></div>') +

      '<div class="card mb4"><div class="card-head"><h3>' +
        dom.esc(PHR.t('insight.panel.overview.plan', '今日健康计划')) + '</h3>' +
        '<div class="sub">' + dom.esc(PHR.t('insight.panel.overview.planProgress',
          '完成 {done} / {total}', { done: plan.progress.done, total: plan.progress.total })) +
        '</div></div>' +
        '<div class="card-body">' + planHtml(plan) + '</div></div>' +

      '<div class="card"><div class="card-body">' +
        PHR.ui.notice('warn', PHR.t('insight.detail.disclaimer', '⚠️ 免责声明'),
          groups.disclaimer || PHR.insight.advice.disclaimer, { icon: '⚕️' }) +
      '</div></div>';

    bindPanel(panel);
    bindTodo(panel, function () { drawAdvice(panel); });
  }

  function adviceRow(it) {
    return '<div class="mb4">' +
      '<div class="row between wrap gap2"><span class="semibold">' + dom.esc(it.title) + '</span>' +
        '<span class="row gap2">' +
        PHR.ui.badge(priorityText(it.priority) +
          PHR.t('insight.panel.prioritySuffixAdvice', '优先级'), it.tone) +
        (it.metricKey
          ? '<button class="btn btn-sm btn-ghost" data-action="alert-record" data-metric="' +
            dom.esc(it.metricKey) + '">' +
            dom.esc(PHR.t('insight.panel.advice.record', '去记录')) + '</button>'
          : '') + '</span></div>' +
      '<div class="t-sm mt1">' + dom.esc(it.detail) + '</div>' +
      (it.evidence ? '<div class="t-xs dim mt1">' +
        dom.esc(PHR.t('insight.panel.advice.evidence', '触发依据：')) +
        dom.esc(it.evidence) + '</div>' : '') +
    '</div>';
  }

  /* ================================================================== *
   * 挂载
   * ================================================================== */
  PHR.insight.panels = {
    overview: drawOverview,
    trend: drawTrend,
    alerts: drawAlerts,
    risk: drawRisk,
    advice: drawAdvice,
    quickAdd: quickAdd,
    alertCard: alertCard,
    doctorPrep: doctorPrep,
    ranges: RANGES
  };

})(window.PHR);
