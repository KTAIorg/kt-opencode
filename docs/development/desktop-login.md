# 从 KT Desktop 一键登录 Kito

配套契约：`KTAIorg/kt-desktop/contracts/kito-launch.md`。Kito 继续作为独立设备客户端，复用 ADR 0024 的 access/refresh 和既有 integration/个人模型 key。

`ktai://desktop-login?port=<1..65535>&request=<64hex>` 仅由主进程消费，不传渲染层、不记录完整 URL。主进程调用已有 Basic 鉴权 sidecar 的 `POST /ktai/desktop-login`。请求和回调地址必须精确绑定 127.0.0.1，不接受任意 URL。

本次回调 GET 返回 source accountId/displayName/allowSwitch；Kito 当前账号不同且未明确允许切换时回报 account_conflict，保持原凭据与数据。有效同账号设备会话复用；否则创建自己的设备 challenge，通过回调让 Desktop 批准，再由 Kito 自行兑换 opaque_code。Desktop 永远拿不到 Kito refresh，Kito 永远拿不到 Desktop Bearer。

Ensure 个人 key 后先 POST `/commit`，确认 Desktop 没有取消或切换来源登录，再持久化 key 和独立设备会话、激活 integration 凭据。发布 Switched 并等待 Provider 实际加载目标 key 后才 `/complete`。这个短提交阶段不可取消；未提交的失败会撤销本次生成的设备会话。不得清空聊天、项目或其他账号凭据。

判断旧账号直接读取原始 Credential metadata，不触发旧账号刷新。过期或已撤销的同账号会话可通过新设备批准恢复。全流程串行，避免两次本地交接交错。sidecar 在共享用户配置的 Location 图执行握手，与当前项目和进程 cwd 无关。

本地验证覆盖跨账号未确认、明确切换后 Provider key、同账号重新签发 key、取消后保留旧凭据、access/refresh 被撤销后的恢复。需要新 Kito 版本（至少 2.1.22）与新 Identity 批准端点先发布。正式 macOS 自动安装仍要求可信签名和公证的 DMG/ZIP；当前公开 adhoc 包与 unsigned PKG 不满足要求。

## Forgejo 校验入口

用户于 2026-10-17 要求改用已有 Forgejo。`bash script/ci/verify-desktop-login.sh` 复用 Core / Server 的隔离测试 harness、native 深链测试及这三个包现有类型检查。脚本可在本地和统一 CI 的隔离 worker 中执行，不读取个人 key，不调用生产模型或生产 Identity。

接入复用 `KTAIorg/kt-workflows#82` 的源快照、控制 SHA、运行绑定和结果读取，不把 App 私钥或 installation token 放进 runner，也不在本仓复制调度/凭据/CheckRun writer。当前平台候选仍需增加桌面执行 profile、授权固定派发和验证真实运行，不能仅新增 runs-on 标签就声称接入完成。

Windows 构建复用现有 CLI 交叉编译、desktop prepare/build 和 electron-builder 配置。既有 Forgejo Docker runner 可作为调度资源，应用构建需在与平台身份隔离的容器内执行；签名由单独受控任务接入既有 PFX，缺失时停止。版本、可信发布者、最低 2.1.22、Release Service 及 Windows 客户机签名检查继续生效。旧 GitHub workflow 和独立审核要求保持到替代链完成验收。

Windows 11 ARM64 当前用户候选包 0.0.276 已实测：重复打开复用进程；正常重启和同版本签名 /S 覆盖安装后，明确提交的未发送草稿保留；持久化合成会话的前后完整导出一致，标题和消息正文可见。此证据不替代跨版本、已登录会话和默认入口免重复登录验收。
