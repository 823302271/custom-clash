// anyrouter_checkin_loon.js
// 参数格式：
//   session=xxx&new_api_user=xxx
//   cookie=完整Cookie&new_api_user=xxx
// 可选参数：
//   delay_ms=3000

(function () {
  var DOMAIN = "https://anyrouter.top";
  var QUOTA_UNIT = 500000;
  var REQUIRED_WAF_COOKIES = ["acw_tc", "cdn_sec_tc", "acw_sc__v2"];

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

  function missingWafCookies(cookie) {
    var missing = [];
    for (var i = 0; i < REQUIRED_WAF_COOKIES.length; i++) {
      var name = REQUIRED_WAF_COOKIES[i];
      if (cookie.indexOf(name + "=") < 0) missing.push(name);
    }
    return missing;
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
    $done(message);
  }

  function buildError(prefix, response, data, cookie) {
    var text = prefix + " HTTP " + statusOf(response) + ": " + shortText(data);
    var missing = missingWafCookies(cookie);
    if (missing.length > 0 || hasWafChallenge(data)) {
      text += "\n请重新抓完整 Cookie，至少包含 session";
      if (missing.length > 0) text += "、" + missing.join("、");
      text += "。";
    }
    return text;
  }

  var session = getArg("session");
  var fullCookie = getArg("cookie");
  var cookie = fullCookie || (session ? "session=" + session : "");
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
    Cookie: cookie,
    "new-api-user": newApiUser,
    Referer: DOMAIN + "/console",
    Origin: DOMAIN,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  };

  function request(method, path, headers, body, callback) {
    var allHeaders = {};
    var key;
    for (key in baseHeaders) allHeaders[key] = baseHeaders[key];
    for (key in headers || {}) allHeaders[key] = headers[key];

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
      callback(null, response, data);
    });
  }

  function readUserInfo(callback) {
    request("get", "/api/user/self", null, null, function (error, response, data) {
      if (error) {
        callback(error);
        return;
      }

      var json = parseJson(data);
      if (!json || json.success !== true || !json.data) {
        callback(buildError("获取用户信息失败", response, data, cookie));
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
          callback(buildError("签到接口失败", response, data, cookie));
          return;
        }

        callback(null, {
          already: already,
          message: (json && (json.msg || json.message)) || (already ? "今日已签到" : "签到接口成功"),
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
