
// anyrouter_checkin_loon.js
// 参数格式：session=xxx&new_api_user=xxx&cookie=可选完整Cookie

function getArg(key) {
  const raw = typeof $argument === "string" ? $argument : "";
  const match = raw.match(new RegExp("(^|&)" + key + "=([^&]*)"));
  return match ? decodeURIComponent(match[2]) : "";
}

$notification.post(
  "Loon 参数调试",
  "收到的 $argument",
  $argument
);

const session = getArg("session");
const newApiUser = getArg("new_api_user");
const fullCookie = getArg("cookie");

const cookie = fullCookie || `session=${session}`;

if (!session && !fullCookie) {
  $notification.post("AnyRouter 参数错误", "", "缺少 session 或 cookie");
  $done("AnyRouter 参数错误 缺少 session 或 cookie");
}

if (!newApiUser) {
  $notification.post("AnyRouter 参数错误", "", "缺少 new_api_user");
  $done("AnyRouter 参数错误 缺少 new_api_user");
}

const url = "https://anyrouter.top/api/user/sign_in";

const headers = {
  "Cookie": cookie,
  "new-api-user": newApiUser,
  "Referer": "https://anyrouter.top/console",
  "Origin": "https://anyrouter.top",
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0"
};

$httpClient.post({ url, headers, body: "{}" }, function(error, response, data) {
  if (error) {
    console.log("AnyRouter error: " + JSON.stringify(error));
    $notification.post("AnyRouter 签到失败", "", String(error));
    $done("AnyRouter error: " + JSON.stringify(error));
    return;
  }

  console.log("AnyRouter status: " + (response ? response.status : "no response"));
  console.log("AnyRouter data: " + data);

  let title = "AnyRouter 签到结果";
  let msg = data || "无返回内容";

  try {
    const json = JSON.parse(data);
    msg = json.msg || json.message || JSON.stringify(json);

    if (
      json.success === true ||
      json.ret === 1 ||
      json.code === 0 ||
      /成功|已签到|签到/.test(JSON.stringify(json))
    ) {
      title = "AnyRouter 签到成功/已签到";
    }
  } catch (e) {}
  console.log("AnyRouter 签到完成")
  $notification.post(title, "", msg);
  $done(
    "AnyRouter 签到测试结果\n\n" +
    "返回内容:\n" + (data || "无返回内容")
  );
});
