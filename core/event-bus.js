/**
 * ============================================================================
 * 文件：core/event-bus.js
 * 层：核心基础设施层
 * 职责：极简发布 / 订阅事件总线，用于模块之间解耦通信。
 *      例如：档案中心写入一条记录后 emit('record:changed')，
 *            智能搜索与健康洞察各自订阅并刷新自己的索引与缓存，
 *            双方互不引用对方代码。
 * 依赖：core/namespace.js
 * ============================================================================
 *
 * 已约定的系统事件名（全大写下划线不加，统一使用 "域:动作" 形式）：
 *   app:ready          应用装配完成
 *   route:changed      路由切换完成   payload: { view, params }
 *   auth:login         登录成功       payload: { user }
 *   auth:logout        退出登录
 *   auth:locked        账号被锁定     payload: { username, until }
 *   record:changed     档案数据变化   payload: { action, type, id }
 *   metric:changed     体征指标变化   payload: { metricKey }
 *   consent:changed    授权变化       payload: { action, id }
 *   audit:written      写入审计日志   payload: { entry }
 *   security:alert     产生安全告警   payload: { alert }
 *   toast              请求弹出提示   payload: { message, type }
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var handlers = Object.create(null);      // 普通订阅，bus.clear() 会清空
  var persistent = Object.create(null);    // 持久订阅，bus.clear() 会保留

  function listHandlers(evt) {
    return (handlers[evt] || []).concat(persistent[evt] || []);
  }

  PHR.bus = {

    /**
     * 订阅事件，返回取消订阅函数。
     * @param {object} [opt] { persistent: true } 表示持久订阅，退出登录不清空。
     */
    on: function (evt, fn, opt) {
      if (typeof fn !== 'function') { return function () {}; }
      opt = opt || {};
      var target = opt.persistent ? persistent : handlers;
      (target[evt] = target[evt] || []).push(fn);
      return function () { PHR.bus.off(evt, fn, opt); };
    },

    /** 只触发一次 */
    once: function (evt, fn) {
      var dispose = PHR.bus.on(evt, function (payload) {
        dispose();
        fn(payload);
      });
      return dispose;
    },

    /** 取消订阅 */
    off: function (evt, fn, opt) {
      opt = opt || {};
      var target = opt.persistent ? persistent : handlers;
      var list = target[evt];
      if (!list) { return; }
      if (!fn) { delete target[evt]; return; }
      target[evt] = list.filter(function (h) { return h !== fn; });
    },

    /** 发布事件 */
    emit: function (evt, payload) {
      var list = listHandlers(evt);
      PHR.log('emit', evt, payload);
      if (!list || !list.length) { return; }
      // 拷贝一份，避免订阅者在回调中取消订阅导致遍历错乱
      list.slice().forEach(function (fn) {
        try {
          fn(payload);
        } catch (e) {
          // 单个订阅者出错不能影响其它订阅者
          PHR.warn(PHR.t('eventBus.handlerFail', '事件处理失败：{event}', { event: evt }), e);
        }
      });
    },

    /** 清空全部普通订阅（退出登录时使用）；持久订阅保留 */
    clear: function () {
      PHR.bus.emit('bus:cleared', {});
      handlers = Object.create(null);
    },

    /** 调试用：查看当前订阅情况 */
    inspect: function () {
      return Object.keys(handlers).map(function (k) {
        return { event: k, count: handlers[k].length };
      });
    }
  };

})(window.PHR);
