# 从 KT Desktop 一键登录 Kito

配套契约：`KTAIorg/kt-desktop/contracts/kito-launch.md`。Kito 继续作为独立设备客户端，复用 ADR 0024 的 access/refresh 和既有 integration/个人模型 key。

`ktai://desktop-login?port=<1..65535>&request=<64hex>` 仅由主进程消费，不传渲染层、不记录完整 URL。主进程调用已有 Basic 鉴权 sidecar 的 `POST /ktai/desktop-login`。请求和回调地址必须精确绑定 127.0.0.1，不接受任意 URL。

本次回调 GET 返回 source accountId/displayName/allowSwitch；Kito 当前账号不同且未明确允许切换时回报 account_conflict，保持原凭据与数据。有效同账号设备会话复用；否则创建自己的设备 challenge，通过回调让 Desktop 批准，再由 Kito 自行兑换 opaque_code。Desktop 永远拿不到 Kito refresh，Kito 永远拿不到 Desktop Bearer。

Ensure 个人 key 后先 POST `/commit`，确认 Desktop 没有取消或切换来源登录，再持久化 key 和独立设备会话、激活 integration 凭据。发布 Switched 并等待 Provider 实际加载目标 key 后才 `/complete`。这个短提交阶段不可取消；未提交的失败会撤销本次生成的设备会话。不得清空聊天、项目或其他账号凭据。

判断旧账号直接读取原始 Credential metadata，不触发旧账号刷新。过期或已撤销的同账号会话可通过新设备批准恢复。全流程串行，避免两次本地交接交错。sidecar 在共享用户配置的 Location 图执行握手，与当前项目和进程 cwd 无关。

本地验证覆盖跨账号未确认、明确切换后 Provider key、同账号重新签发 key、取消后保留旧凭据、access/refresh 被撤销后的恢复。需要新 Kito 版本（至少 2.1.22）与新 Identity 批准端点先发布。正式 macOS 自动安装仍要求可信签名和公证的 DMG/ZIP；当前公开 adhoc 包与 unsigned PKG 不满足要求。
