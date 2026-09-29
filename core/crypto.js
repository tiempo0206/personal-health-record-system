/**
 * ============================================================================
 * 文件：core/crypto.js
 * 层：核心基础设施层（安全治理层 · 加密组件）
 * 职责：提供口令哈希、随机令牌、可逆加密（教学用途强度）与脱敏工具。
 *      - 口令使用 加盐 + SHA-256 存储，绝不落库明文；
 *      - SHA-256 为纯 JavaScript 实现，不依赖 HTTPS 环境下的 crypto.subtle，
 *        因此 file:// 双击打开也能正常工作；
 *      - 健康档案正文的"加密存储"使用 XOR 流 + Base64，属于教学用途强度，
 *        真实生产必须替换为 AES-GCM 并由服务端托管密钥（见开发者说明书）。
 * 依赖：core/namespace.js、core/utils.js
 * ============================================================================
 */
(function (PHR) {
  'use strict';

  var U = PHR.util;

  /* ================================================================== *
   * 一、UTF-8 编码（SHA-256 只接受字节串）
   * ================================================================== */
  function utf8Encode(str) {
    str = String(str);
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out += String.fromCharCode(c);
      } else if (c < 0x800) {
        out += String.fromCharCode(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        // 代理对（emoji 等）合并为 4 字节
        var cp = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00);
        out += String.fromCharCode(
          0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)
        );
      } else {
        out += String.fromCharCode(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return out;
  }

  /** UTF-8 字节串 -> JS 字符串 */
  function utf8Decode(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length;) {
      var c = bytes.charCodeAt(i++);
      if (c < 0x80) {
        out += String.fromCharCode(c);
      } else if (c < 0xe0) {
        out += String.fromCharCode(((c & 0x1f) << 6) | (bytes.charCodeAt(i++) & 0x3f));
      } else if (c < 0xf0) {
        out += String.fromCharCode(
          ((c & 0x0f) << 12) |
          ((bytes.charCodeAt(i++) & 0x3f) << 6) |
          (bytes.charCodeAt(i++) & 0x3f)
        );
      } else {
        var cp = ((c & 0x07) << 18) |
          ((bytes.charCodeAt(i++) & 0x3f) << 12) |
          ((bytes.charCodeAt(i++) & 0x3f) << 6) |
          (bytes.charCodeAt(i++) & 0x3f);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return out;
  }

  /* ================================================================== *
   * 二、纯 JavaScript SHA-256
   *     实现依据 FIPS 180-4，输入为"字节串"，输出 64 位十六进制字符串。
   * ================================================================== */
  function sha256Bytes(ascii) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }

    var K = sha256Bytes._k;
    var H0 = sha256Bytes._h0;
    if (!K) {
      K = []; H0 = [];
      var composite = {}, primeCount = 0;
      for (var cand = 2; primeCount < 64; cand++) {
        if (!composite[cand]) {
          for (var m = 0; m < 313; m += cand) { composite[m] = cand; }
          H0[primeCount] = (Math.pow(cand, 0.5) * 4294967296) | 0;
          K[primeCount++] = (Math.pow(cand, 1 / 3) * 4294967296) | 0;
        }
      }
      sha256Bytes._k = K;
      sha256Bytes._h0 = H0;
    }

    var bitLen = ascii.length * 8;
    ascii += '\x80';
    while (ascii.length % 64 !== 56) { ascii += '\x00'; }

    var words = [];
    for (var i = 0; i < ascii.length; i++) {
      words[i >> 2] = (words[i >> 2] || 0) | (ascii.charCodeAt(i) << ((3 - i % 4) * 8));
    }
    words[words.length] = (bitLen / 4294967296) | 0;
    words[words.length] = bitLen | 0;

    var hash = H0.slice(0, 8);
    for (var j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var old = hash.slice(0, 8);
      for (var n = 0; n < 64; n++) {
        var w15 = w[n - 15], w2 = w[n - 2];
        var a = hash[0], e = hash[4];
        var t1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + K[n]
          + (w[n] = n < 16 ? w[n] : (
              w[n - 16]
              + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
              + w[n - 7]
              + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
            ) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash.unshift((t1 + t2) | 0);
        hash[4] = (hash[4] + t1) | 0;
      }
      // unshift 会让数组逐轮变长，这里截回 8 个寄存器再与旧值相加
      hash.length = 8;
      for (var q = 0; q < 8; q++) { hash[q] = (hash[q] + old[q]) | 0; }
    }

    var out = '';
    for (var p = 0; p < 8; p++) {
      for (var b = 3; b >= 0; b--) {
        var byte = (hash[p] >> (b * 8)) & 255;
        out += (byte < 16 ? '0' : '') + byte.toString(16);
      }
    }
    return out;
  }

  /* ================================================================== *
   * 三、对外接口
   * ================================================================== */
  PHR.crypto = {

    /** 纯 JS SHA-256（十六进制小写） */
    sha256: function (text) { return sha256Bytes(utf8Encode(text)); },

    /**
     * 加盐哈希口令。
     * @returns {string} 'sha256$<salt>$<hash>'
     */
    hashPassword: function (password, salt) {
      salt = salt || PHR.crypto.randomHex(16);
      var digest = sha256Bytes(utf8Encode(salt + '::' + password + '::' + salt));
      return 'sha256$' + salt + '$' + digest;
    },

    /**
     * 校验口令。
     * @param {string} password 用户输入
     * @param {string} stored   hashPassword 的返回值
     */
    verifyPassword: function (password, stored) {
      if (!stored) { return false; }
      var parts = String(stored).split('$');
      if (parts.length !== 3) { return false; }
      return PHR.crypto.hashPassword(password, parts[1]) === stored;
    },

    /** 生成 n 个字节的随机十六进制串 */
    randomHex: function (n) {
      var out = '';
      for (var i = 0; i < (n || 8); i++) {
        out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
      }
      return out;
    },

    /** 生成 n 位数字验证码 */
    randomDigits: function (n) {
      var out = '';
      for (var i = 0; i < (n || 6); i++) { out += Math.floor(Math.random() * 10); }
      return out;
    },

    /**
     * 生成业务令牌（会话 token / 医生授权码）。
     * 字符集剔除了容易混淆的 0/O/1/I/L。
     */
    token: function (len) {
      var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      var out = '';
      for (var i = 0; i < (len || 20); i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    },

    /** 生成形如 A1B2-C3D4-E5F6 的医生授权码（便于口头/短信转述） */
    consentCode: function () {
      return [4, 4, 4].map(function (n) { return PHR.crypto.token(n); }).join('-');
    },

    /* ---------------------------------------------------------------- *
     * 教学用途对称加密：XOR 流 + Base64
     * 目的：让"健康数据以密文形式落盘"这一设计要求在纯前端环境可被展示。
     * 注意：这不是安全的加密方案，生产环境必须使用 WebCrypto AES-GCM。
     * ---------------------------------------------------------------- */

    /** 用口令派生一个可重复的密钥流 */
    _keyStream: function (key, len) {
      var seed = sha256Bytes(utf8Encode('PHR-KEY:' + key));
      var stream = seed;
      while (stream.length < len) { stream += sha256Bytes(utf8Encode(seed + stream)); }
      return stream.slice(0, len);
    },

    /** 对象 -> 加密字符串（密文字符串中每个字符的码点都在 0~255 之间） */
    encrypt: function (value, key) {
      var text = JSON.stringify(value);
      var bytes = utf8Encode(text);
      var ks = PHR.crypto._keyStream(key, Math.max(bytes.length, 1));
      var out = '';
      for (var i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes.charCodeAt(i) ^ ks.charCodeAt(i % ks.length));
      }
      return 'enc.v1.' + btoa(out);
    },

    /** 加密字符串 -> 对象；解密失败返回 null */
    decrypt: function (cipher, key) {
      try {
        if (!cipher || cipher.indexOf('enc.v1.') !== 0) { return null; }
        var raw = atob(cipher.slice(7));
        var ks = PHR.crypto._keyStream(key, Math.max(raw.length, 1));
        var out = '';
        for (var i = 0; i < raw.length; i++) {
          out += String.fromCharCode(raw.charCodeAt(i) ^ ks.charCodeAt(i % ks.length));
        }
        // out 是 UTF-8 字节串，需要还原成 JS 字符串
        return JSON.parse(utf8Decode(out));
      } catch (e) {
        PHR.warn(PHR.t('crypto.decryptFail', '解密失败'), e);
        return null;
      }
    },

    /* ---------------------------------------------------------------- *
     * 脱敏
     * ---------------------------------------------------------------- */
    maskPhone: function (phone) {
      return String(phone || '').replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    },
    maskIdCard: function (id) {
      return String(id || '').replace(/^(.{6}).+(.{4})$/, '$1********$2');
    },
    maskName: function (name) { return U.maskName(name); },
    maskEmail: function (mail) {
      return String(mail || '').replace(/^(.{2}).*(@.*)$/, '$1***$2');
    },

    /** 口令强度评估（供注册页与安全策略使用） */
    strength: function (pwd) {
      pwd = String(pwd || '');
      var score = 0;
      if (pwd.length >= 8) { score++; }
      if (pwd.length >= 12) { score++; }
      if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) { score++; }
      if (/\d/.test(pwd)) { score++; }
      if (/[^A-Za-z0-9]/.test(pwd)) { score++; }
      var zhLevels = ['很弱', '弱', '一般', '较强', '强', '很强'];
      return {
        score: score,
        max: 5,
        percent: Math.round(score / 5 * 100),
        level: PHR.t('crypto.strength.' + score, zhLevels[score]),
        tone: score <= 1 ? 'danger' : score === 2 ? 'warn' : score === 3 ? 'info' : 'ok'
      };
    }
  };

})(window.PHR);
