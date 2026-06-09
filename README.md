# custom-clash
自己使用的clash规则

## 维护约定

- 每次变更必须同步更新本 README，记录变更日期、涉及文件和主要内容。

## 变更记录

### 2026-06-09

- 更新 `automated/anyrouter-sign_in.js`：AnyRouter 签到脚本改为先读取 `/api/user/self`，再调用 `/api/user/sign_in`，最后再次读取用户信息，通过签到前后余额与用量变化判断是否真实增加积分。
- 修复原脚本无论接口返回结果如何都推送“签到成功”的问题。
- 增加完整 Cookie/WAF Cookie 缺失提示，便于排查 `acw_tc`、`cdn_sec_tc`、`acw_sc__v2` 缺失导致的签到无积分问题。
