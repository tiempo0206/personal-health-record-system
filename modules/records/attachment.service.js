/**
 * ============================================================================
 * 文件：modules/records/attachment.service.js
 * 层：业务模块层（档案中心 —— 二进制附件）
 * 职责：使用 IndexedDB 保存 PDF/JPG/PNG 原始文件，并提供读取、预览、下载能力。
 *
 * 为什么不放 localStorage / records：
 *   · localStorage 通常只有约 5 MB，Base64 还会额外膨胀约三分之一；
 *   · records 会进入版本快照，直接放文件会让每个版本重复复制整份附件；
 *   · IndexedDB 能原生保存 Blob，记录本身只需保存 attachmentId 与元数据。
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;
  var DB_NAME = 'phr-health-record-attachments';
  var STORE_NAME = 'files';
  var DB_VERSION = 1;
  var MAX_FILE_BYTES = 20 * 1024 * 1024;
  var dbPromise = null;

  var MIME_BY_EXT = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png'
  };

  function extension(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function normalizedType(file) {
    var ext = extension(file && file.name);
    var mime = String(file && file.type || '').toLowerCase();
    if (mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png') { return mime; }
    return MIME_BY_EXT[ext] || '';
  }

  function isSupported(file) {
    return !!normalizedType(file);
  }

  function kindOf(file) {
    var mime = normalizedType(file);
    if (mime === 'application/pdf') { return 'pdf'; }
    if (mime === 'image/jpeg' || mime === 'image/png') { return 'image'; }
    return '';
  }

  function formatSize(bytes) {
    bytes = Number(bytes || 0);
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function openDb() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error(PHR.t('attachment.err.unsupported',
          '当前浏览器不支持附件存储，请使用最新版 Chrome、Edge 或 Safari')));
        return;
      }
      var req;
      try { req = window.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }

      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () {
        reject(req.error || new Error(PHR.t('attachment.err.open', '无法打开附件存储')));
      };
      req.onblocked = function () {
        reject(new Error(PHR.t('attachment.err.blocked', '附件存储正在被另一个页面占用，请关闭其它页面后重试')));
      };
    });
    return dbPromise;
  }

  function save(file) {
    return new Promise(function (resolve, reject) {
      var mime = normalizedType(file);
      if (!mime) {
        reject(new Error(PHR.t('attachment.err.type', '仅支持 PDF、JPG 和 PNG 文件')));
        return;
      }
      if (!file || !file.size) {
        reject(new Error(PHR.t('attachment.err.empty', '文件为空，无法上传')));
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        reject(new Error(PHR.t('attachment.err.tooLarge', '文件不能超过 {size}', {
          size: formatSize(MAX_FILE_BYTES)
        })));
        return;
      }

      openDb().then(function (db) {
        var row = {
          id: U.uid('ATT'),
          userId: PHR.session && PHR.session.userId ? PHR.session.userId() : '',
          name: String(file.name || 'medical-report').slice(0, 180),
          type: mime,
          size: Number(file.size || 0),
          blob: file.slice(0, file.size, mime),
          createdAt: Date.now()
        };
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(row);
        tx.oncomplete = function () {
          resolve({
            id: row.id, name: row.name, type: row.type, size: row.size,
            createdAt: row.createdAt, kind: kindOf(row)
          });
        };
        tx.onerror = function () {
          reject(tx.error || new Error(PHR.t('attachment.err.save', '附件保存失败')));
        };
        tx.onabort = tx.onerror;
      }, reject);
    });
  }

  function get(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () {
          reject(req.error || new Error(PHR.t('attachment.err.read', '附件读取失败')));
        };
      });
    });
  }

  function remove(id) {
    if (!id) { return Promise.resolve(false); }
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error(PHR.t('attachment.err.remove', '附件删除失败'))); };
        tx.onabort = tx.onerror;
      });
    });
  }

  function download(item) {
    if (!item || !item.blob) { return false; }
    var url = URL.createObjectURL(item.blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = item.name || 'medical-report';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return true;
  }

  PHR.records.attachments = {
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
    isSupported: isSupported,
    kindOf: kindOf,
    normalizedType: normalizedType,
    formatSize: formatSize,
    save: save,
    get: get,
    remove: remove,
    download: download
  };

})(window.PHR);
