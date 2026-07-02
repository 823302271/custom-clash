// Script: AnyRouter auto sign-in with WAF cookie refresh and balance verification.
// Purpose: Automatically checks in to AnyRouter, refreshes short-lived WAF cookies, verifies balance changes, and sends a notification.
// Last modified: 2026-07-02 21:47:12 +08:00
// Compatible with Surge script task.
//
// Surge argument examples:
//   session=xxx&new_api_user=123
//   cookie=session%3Dxxx&new_api_user=123
// Optional:
//   delay_ms=3000

(function () {
  var DOMAIN = "https://anyrouter.top";
  var QUOTA_UNIT = 500000;
  var ACW_SC_KEY = "acw_sc__v2";
  var TRANSIENT_COOKIE_NAMES = {
    acw_tc: true,
    cdn_sec_tc: true,
    acw_sc__v2: true,
  };
  var ACW_SHUFFLE = [
    0xf, 0x23, 0x1d, 0x18, 0x21, 0x10, 0x1, 0x26, 0xa, 0x9, 0x13, 0x1f, 0x28, 0x1b, 0x16, 0x17, 0x19,
    0xd, 0x6, 0xb, 0x27, 0x12, 0x14, 0x8, 0xe, 0x15, 0x20, 0x1a, 0x2, 0x1e, 0x7, 0x4, 0x11, 0x5, 0x3,
    0x1c, 0x22, 0x25, 0xc, 0x24,
  ];
  var ACW_XOR_KEY = "3000176000856006061501533003690027800375";

  function getArg(key) {
    var raw = typeof $argument === "string" ? $argument : "";
    var parts = raw.split("&");
    for (var i = 0; i < parts.length; i++) {
      var item = parts[i];
      var index = item.indexOf("=");
      if (index < 0) continue;

      var name = item.slice(0, index);
      var value = item.slice(index + 1);
      if (name === key) {
        try {
          return decodeURIComponent(value);
        } catch (e) {
          return value;
        }
      }
    }
    return "";
  }

  function getAnyArg(keys) {
    for (var i = 0; i < keys.length; i++) {
      var value = getArg(keys[i]);
      if (value) return value;
    }
    return "";
  }

  function statusOf(response) {
    if (!response) return "no response";
    return response.status || response.statusCode || "unknown";
  }

  function parseJson(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  function shortText(data) {
    return String(data || "无返回内容").replace(/\s+/g, " ").slice(0, 500);
  }

  function money(rawValue) {
    return "$" + (Number(rawValue || 0) / QUOTA_UNIT).toFixed(2);
  }

  function signedMoney(value) {
    var prefix = value >= 0 ? "+" : "";
    return prefix + "$" + value.toFixed(2);
  }

  function hasWafChallenge(data) {
    var text = String(data || "");
    return /acw_sc__v2|acw_tc|cdn_sec_tc|arg1=|document\.cookie|waf/i.test(text);
  }

  function parseCookieString(value) {
    var jar = {};
    var parts = String(value || "").split(";");
    for (var i = 0; i < parts.length; i++) {
      var item = parts[i];
      var index = item.indexOf("=");
      if (index < 0) continue;
      var name = item.slice(0, index).replace(/^\s+|\s+$/g, "");
      var cookieValue = item.slice(index + 1).replace(/^\s+|\s+$/g, "");
      if (name) jar[name] = cookieValue;
    }
    return jar;
  }

  function serializeCookieJar(jar) {
    var parts = [];
    for (var name in jar) {
      if (Object.prototype.hasOwnProperty.call(jar, name) && jar[name] !== undefined && jar[name] !== null) {
        parts.push(name + "=" + jar[name]);
      }
    }
    return parts.join("; ");
  }

  function hasCookie(jar, name) {
    return Object.prototype.hasOwnProperty.call(jar, name) && String(jar[name] || "") !== "";
  }

  function dropTransientCookies(jar) {
    for (var name in TRANSIENT_COOKIE_NAMES) {
      if (Object.prototype.hasOwnProperty.call(TRANSIENT_COOKIE_NAMES, name)) {
        delete jar[name];
      }
    }
  }

  function headerValues(headers, name) {
    var values = [];
    if (!headers) return values;
    var target = name.toLowerCase();
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key) && String(key).toLowerCase() === target) {
        var value = headers[key];
        if (value instanceof Array) {
          for (var i = 0; i < value.length; i++) values.push(String(value[i]));
        } else if (value !== undefined && value !== null) {
          values.push(String(value));
        }
      }
    }
    return values;
  }

  function splitSetCookieHeader(value) {
    return String(value || "")
      .split(/,(?=\s*[^;,\s]+=)/)
      .map(function (item) {
        return item.replace(/^\s+|\s+$/g, "");
      })
      .filter(function (item) {
        return item.length > 0;
      });
  }

  function mergeSetCookieHeader(cookieJar, response) {
    var headers = response && (response.headers || response.header);
    var values = headerValues(headers, "set-cookie");
    for (var i = 0; i < values.length; i++) {
      var cookies = splitSetCookieHeader(values[i]);
      for (var j = 0; j < cookies.length; j++) {
        var pair = cookies[j].split(";")[0];
        var index = pair.indexOf("=");
        if (index < 0) continue;
        var name = pair.slice(0, index).replace(/^\s+|\s+$/g, "");
        var cookieValue = pair.slice(index + 1).replace(/^\s+|\s+$/g, "");
        if (name) cookieJar[name] = cookieValue;
      }
    }
  }

  function extractChallengeArg(data) {
    var match = String(data || "").match(/var\s+arg1\s*=\s*['"]([0-9a-fA-F]+)['"]/);
    return match ? match[1] : "";
  }

  function createAcwScV2(arg1) {
    if (!arg1 || arg1.length !== ACW_SHUFFLE.length) return "";

    var chars = [];
    for (var i = 0; i < arg1.length; i++) {
      for (var j = 0; j < ACW_SHUFFLE.length; j++) {
        if (ACW_SHUFFLE[j] === i + 1) chars[j] = arg1[i];
      }
    }

    var shuffled = chars.join("");
    var value = "";
    for (var index = 0; index < shuffled.length && index < ACW_XOR_KEY.length; index += 2) {
      var next = (parseInt(shuffled.slice(index, index + 2), 16) ^ parseInt(ACW_XOR_KEY.slice(index, index + 2), 16)).toString(16);
      if (next.length === 1) next = "0" + next;
      value += next;
    }
    return value;
  }

  function notify(title, body) {
    if (typeof $notification !== "undefined" && $notification.post) {
      $notification.post(title, "", body);
    } else if (typeof $notify !== "undefined") {
      $notify(title, "", body);
    }
  }

  function finish(title, body) {
    var message = title + "\n" + body;
    console.log(message);
    notify(title, body);
    $done();
  }

  function buildError(prefix, response, data, cookieJar) {
    var text = prefix + " HTTP " + statusOf(response) + ": " + shortText(data);
    if (hasWafChallenge(data)) {
      text += "\n已尝试自动刷新 WAF Cookie，但仍被挑战页拦截。";
      if (!hasCookie(cookieJar, "session")) {
        text += "\n当前 Cookie 缺少 session，请抓登录后的 session。";
      } else {
        text += "\n请确认 session 未过期，或在同一网络环境重新运行一次。";
      }
    } else if (!hasCookie(cookieJar, "session")) {
      text += "\n当前 Cookie 缺少 session，请抓登录后的 session。";
    }
    return text;
  }

  var session = getArg("session");
  var fullCookie = getArg("cookie");
  var cookie = fullCookie || (session ? "session=" + session : "");
  var cookieJar = parseCookieString(cookie);
  dropTransientCookies(cookieJar);
  var newApiUser = getAnyArg(["new_api_user", "new-api-user", "api_user"]);
  var delayMs = Number(getArg("delay_ms") || 3000);

  if (!delayMs || delayMs < 500) delayMs = 3000;
  if (delayMs > 10000) delayMs = 10000;

  if (!cookie) {
    finish("AnyRouter 参数错误", "缺少 session 或 cookie");
    return;
  }

  if (!newApiUser) {
    finish("AnyRouter 参数错误", "缺少 new_api_user");
    return;
  }

  var baseHeaders = {
    "new-api-user": newApiUser,
    Referer: DOMAIN + "/console",
    Origin: DOMAIN,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  };

  function request(method, path, headers, body, callback) {
    function run(attempt) {
      var allHeaders = {};
      var key;
      for (key in baseHeaders) allHeaders[key] = baseHeaders[key];
      for (key in headers || {}) allHeaders[key] = headers[key];
      allHeaders.Cookie = serializeCookieJar(cookieJar);

      var options = {
        url: DOMAIN + path,
        headers: allHeaders,
      };
      if (typeof body === "string") options.body = body;

      $httpClient[method](options, function (error, response, data) {
        if (error) {
          callback("网络请求失败: " + JSON.stringify(error));
          return;
        }

        mergeSetCookieHeader(cookieJar, response);

        if (hasWafChallenge(data) && attempt < 2) {
          var arg1 = extractChallengeArg(data);
          var acwScV2 = createAcwScV2(arg1);
          if (acwScV2) {
            cookieJar[ACW_SC_KEY] = acwScV2;
            console.log("AnyRouter WAF challenge resolved, retrying request...");
            setTimeout(function () {
              run(attempt + 1);
            }, 300);
            return;
          }
        }

        callback(null, response, data);
      });
    }

    run(0);
  }

  function readUserInfo(callback) {
    request("get", "/api/user/self", null, null, function (error, response, data) {
      if (error) {
        callback(error);
        return;
      }

      var json = parseJson(data);
      if (!json || json.success !== true || !json.data) {
        callback(buildError("获取用户信息失败", response, data, cookieJar));
        return;
      }

      var quota = Number(json.data.quota || 0);
      var usedQuota = Number(json.data.used_quota || 0);
      callback(null, {
        quota: quota,
        usedQuota: usedQuota,
        total: quota + usedQuota,
      });
    });
  }

  function signIn(callback) {
    request(
      "post",
      "/api/user/sign_in",
      {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      "{}",
      function (error, response, data) {
        if (error) {
          callback(error);
          return;
        }

        var json = parseJson(data);
        var text = json ? JSON.stringify(json) : String(data || "");
        var ok = json && (json.success === true || json.ret === 1 || json.code === 0);
        var already = /已经签到|已签到|重复签到|already/i.test(text);

        if (!ok && !already) {
          callback(buildError("签到接口失败", response, data, cookieJar));
          return;
        }

        callback(null, {
          already: already,
          message: (json && (json.msg || json.message)) || (already ? "今日已签到" : "签到接口成功"),
          raw: text,
        });
      }
    );
  }

  readUserInfo(function (beforeError, before) {
    if (beforeError) {
      finish("AnyRouter 签到失败", beforeError);
      return;
    }

    signIn(function (signError, signResult) {
      if (signError) {
        finish("AnyRouter 签到失败", signError);
        return;
      }

      setTimeout(function () {
        readUserInfo(function (afterError, after) {
          if (afterError) {
            finish("AnyRouter 签到结果未知", signResult.message + "\n" + afterError);
            return;
          }

          var reward = (after.total - before.total) / QUOTA_UNIT;
          var balanceChange = (after.quota - before.quota) / QUOTA_UNIT;
          var usedChange = (after.usedQuota - before.usedQuota) / QUOTA_UNIT;
          var title = reward > 0 ? "AnyRouter 签到成功" : "AnyRouter 签到未增加积分";

          if (signResult.already && reward === 0) {
            title = "AnyRouter 今日已签到";
          }

          var lines = [
            "接口返回: " + signResult.message,
            "签到前余额: " + money(before.quota) + "，已用: " + money(before.usedQuota),
            "签到后余额: " + money(after.quota) + "，已用: " + money(after.usedQuota),
            "签到奖励: " + signedMoney(reward),
            "余额变化: " + signedMoney(balanceChange),
          ];

          if (usedChange !== 0) {
            lines.push("期间消耗: " + signedMoney(usedChange));
          }

          finish(title, lines.join("\n"));
        });
      }, delayMs);
    });
  });
})();
