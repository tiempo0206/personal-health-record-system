/**
 * ============================================================================
 * 文件：modules/assessment/assessment-selftest.view.js
 * 层：业务模块层（心理测评 —— 模块 9）
 * 职责：注册一个**隐藏的自检页面**（不进左侧导航），把心理测评模块的
 *      计分正确性与安全断言跑一遍，并把结果渲染成**机器可读的 DOM 标记**。
 *
 *      为什么要有这个页面：本项目没有 Node、没有测试框架，只能靠
 *      headless Chrome 的 --dump-dom 做端到端验证。而"没报错就算通过"
 *      是危险的判据 —— 脚本一旦抛错，整个 #app 会是空的，
 *      用"grep 不到失败"来判定就会把**白屏判成 PASS**。
 *      因此这里主动写出 data-ok="true" / data-total="N"，
 *      验证脚本必须**要求这个标记出现**才算通过。
 *
 *      用法（在项目根目录执行）：
 *        chrome --headless=new --disable-gpu --virtual-time-budget=6000 \
 *               --dump-dom "file:///.../index.html#/assessment-selftest"
 *        然后检查输出里是否含  data-ok="true"
 *
 *      这个页面同时也用于验证计分逻辑是否准确。
 *
 * 依赖：modules/assessment/assessment.service.js（selfTest）
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var dom = PHR.ui.dom;

  PHR.registerView('assessment-selftest', {
    title: PHR.t('view.assessment-selftest.title', '心理测评自检'),
    icon: '🧪',
    group: 'system',
    order: 99,
    nav: false,               // 刻意不出现在导航里
    module: 'assessment',
    requiresAuth: false,      // 无需登录即可运行，便于自动化验证
    auditView: false,         // 自检不写"浏览页面"审计，避免污染日志
    render: render
  });

  function render(root) {
    var r;
    try {
      r = PHR.assessment.selfTest();
    } catch (e) {
      root.innerHTML = PHR.ui.error(PHR.t('assessment.selftest.runFail', '自检执行失败：{msg}',
        { msg: (e && e.message ? e.message : e) }));
      writeMark(false, 0, 0);
      return;
    }

    var failed = r.cases.filter(function (c) { return !c.ok; });

    root.innerHTML =
      '<div class="page-head">' +
        '<div class="titles"><h2>🧪 ' +
          PHR.t('view.assessment-selftest.title', '心理测评自检') + '</h2>' +
          '<div class="desc">' + PHR.t('assessment.selftest.pageDesc',
            '本页面对计分引擎与安全判定做自动化断言。' +
            '它不出现在左侧导航中，仅供开发与验收使用。') + '</div></div>' +
        '<div class="actions"><button class="btn" data-action="rerun">' +
          PHR.t('assessment.selftest.rerun', '重新运行') + '</button></div>' +
      '</div>' +

      '<div id="selftest" data-ok="' + (r.ok ? 'true' : 'false') + '" ' +
        'data-total="' + r.total + '" data-failed="' + failed.length + '" ' +
        'data-passed="' + r.passed + '" style="display:none"></div>' +

      (r.ok
        ? PHR.ui.notice('ok',
            PHR.t('assessment.selftest.allPass', '全部通过　{passed} / {total}',
              { passed: r.passed, total: r.total }),
            PHR.t('assessment.selftest.allPassHint', '计分正确性与安全断言均符合预期。'),
            { icon: '✅' })
        : PHR.ui.notice('danger',
            PHR.t('assessment.selftest.someFail', '有断言未通过　{passed} / {total}',
              { passed: r.passed, total: r.total }),
            PHR.t('assessment.selftest.someFailHint',
              '请查看下方标红的用例。**这类问题通常不会抛异常，只会静默算错**，' +
              '例如反向计分写反、选项分值顺序颠倒。'), { icon: '⛔' })) +

      (failed.length
        ? '<div class="card mb4"><div class="card-head"><h3>' +
          PHR.t('assessment.selftest.failedCases', '未通过的用例') + '</h3></div>' +
          '<div class="card-body">' + failed.map(function (c) {
            return '<div class="notice tone-danger" style="margin-bottom:8px">' +
              '<span class="ico">✗</span><div class="body">' +
              '<b>' + dom.esc(c.name) + '</b><br>' +
              '<span class="t-sm">' + PHR.t('assessment.selftest.expectActual',
                '期望 <code>{expected}</code>，实际 <code>{actual}</code>', {
                  expected: dom.esc(JSON.stringify(c.expected)),
                  actual: dom.esc(JSON.stringify(c.actual))
                }) + '</span>' +
              '</div></div>';
          }).join('') + '</div></div>'
        : '') +

      '<div class="card"><div class="card-head"><h3>' +
        PHR.t('assessment.selftest.allCases', '全部用例（{n} 条）', { n: r.total }) + '</h3>' +
        '<div class="sub">' + PHR.t('assessment.selftest.coverage',
          '覆盖反向计分、极值不变量、线性换算、分级边界、危机识别、越权判定') + '</div>' +
      '</div><div class="card-body flush">' +
        '<div class="table-wrap" style="border:0"><table class="tbl">' +
          '<thead><tr><th style="width:56px">' + PHR.t('assessment.selftest.colResult', '结果') + '</th>' +
          '<th>' + PHR.t('assessment.selftest.colAssert', '断言') + '</th>' +
          '<th style="width:150px">' + PHR.t('assessment.selftest.colExpected', '期望') + '</th>' +
          '<th style="width:150px">' + PHR.t('assessment.selftest.colActual', '实际') + '</th></tr></thead><tbody>' +
          r.cases.map(function (c) {
            return '<tr' + (c.ok ? '' : ' style="background:var(--danger-soft)"') + '>' +
              '<td>' + (c.ok ? '✅' : '❌') + '</td>' +
              '<td class="t-sm">' + dom.esc(c.name) + '</td>' +
              '<td><code class="t-xs">' + dom.esc(JSON.stringify(c.expected)) + '</code></td>' +
              '<td><code class="t-xs">' + dom.esc(JSON.stringify(c.actual)) + '</code></td>' +
            '</tr>';
          }).join('') +
        '</tbody></table></div>' +
      '</div></div>' +

      '<p class="dim t-xs mt4">' + PHR.t('assessment.selftest.footnote',
        '提示：这些断言刻意挑选了"朴素实现会给出不同答案"的用例。' +
        '例如 PSS-10 全选 4 分，正向 6 题贡献 24 分、4 道反向题贡献 0 分，正确答案是 24；' +
        '若忘记反向计分会得到 40 —— 而这**不会报任何错**。') + '</p>';

    writeMark(r.ok, r.total, failed.length);

    dom.actions(root, {
      rerun: function () { PHR.router.reload(); }
    });
  }

  /** 兜底：即使上面的渲染路径出错，也要写出一个明确的失败标记 */
  function writeMark(ok, total, failedCount) {
    try {
      if (!document.getElementById('selftest')) {
        var d = document.createElement('div');
        d.id = 'selftest';
        document.body.appendChild(d);
      }
      var el = document.getElementById('selftest');
      el.setAttribute('data-ok', ok ? 'true' : 'false');
      el.setAttribute('data-total', String(total));
      el.setAttribute('data-failed', String(failedCount));
    } catch (e) { /* 忽略 */ }
  }

})(window.PHR);
