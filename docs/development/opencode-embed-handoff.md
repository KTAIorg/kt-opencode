# 交接：KT OpenCode —— 内嵌 kt-desktop + opencode 侧增强（两步走）

日期：2026-07-29
交接给：本地 agent / 工程师
关联：`opencode-independent-identity.md`（#13 现状）、`opencode-v2-kt-integration.md`（PR #9 设计总纲）、`opencode-v2-handoff.md`（PR #11）

## 0. 背景与已定决策（先读）

- 仓库：`KTAIorg/kt-opencode`（opencode fork，当前 **V1 / opencode 1.18.3** 基线）、`KTAIorg/kt-desktop`（KT 客户端，Electron+Vue，内嵌目标）。
- 现状：PR #13 已并入 `main`，实现了「**独立桌面版** KT 登录（Telegram+密码）+ 从 `/v1/models` 出模型 + 精选默认模型 + 免费额度用尽引导去 `ktapi.cc/wallet` 充值」。**代码质量好、有测试，保留，禁止整体撤销/revert。**
- 决策：**分两步并行**——(1) 在 kt-desktop 把 opencode 内嵌；(2) 在 opencode 侧补「接受外部登录 / 显示余额 / 免填密钥」。
- 两条轴独立：**「内嵌」不需要升级 V2，V1 就能做**；V2 升级作为**以后单独里程碑**，本次不做。

## 1. 访问其它私有仓库

环境自带的 GitHub 令牌只覆盖 kt-opencode。要访问 kt-desktop / kt-identity / kt-growth 等私有仓库：

- 用 `kt` CLI：`kt login --no-browser --async`（Telegram 授权）→ `kt component install secret` → `kt secret get --ws kt --project github_push_token --env prod --path / --key GITHUB_PUSH_TOKEN` 取 GitHub PAT。
- 用该 PAT 克隆：`git clone https://x-access-token:<PAT>@github.com/KTAIorg/<repo>.git`，克隆后 `git remote set-url origin https://github.com/KTAIorg/<repo>.git` 抹掉内嵌 token。
- **密钥只留本地 0600 文件，禁止提交/打印。**

## 2. 第一步 —— kt-desktop 集成（新独立分支）

在 `KTAIorg/kt-desktop` 新建分支（如 `feat/opencode-embed`）：

1. **新增一个 "opencode" 会话类型**，复用现有会话框架：`electron/main/view.ts`（BrowserView + 独立 session partition）、`src/view/customSession/CustomSession.vue`、`src/store/sessionStore.ts`。支持内嵌 / 侧栏 / 独立窗口（`position=outer`）。
2. **新增 host capability：本地启动并管理 opencode 后台**——spawn `opencode serve --hostname 127.0.0.1 --port <自动分配>`（V1 命令），会话内 BrowserView 加载 `http://127.0.0.1:<port>/app`（opencode V1 的 server 自带该 web UI，已验证）。做好启动/停止/端口分配/崩溃重启/健康检查。
3. **复用 KT 登录、避免二次登录**：kt-desktop 分支 `feat/identity-only-login` 已实现 KT Identity 登录、Bearer 常驻内存（`src/libs/identityAuth.ts` 的 `getIdentityToken()`、`src/libs/apiAuth.ts`）。把该 token 通过 preload/IPC 或启动 daemon 时注入的方式传给 opencode 会话，**opencode 不再弹自己的登录**。
4. **验收（在 macOS 上按 kt-desktop 现有规矩启动，勿在无头环境跑 Electron 验收）**：从 KT 客户端点开 opencode 会话 → 无需再登录 → 能正常对话；可开成独立窗口；关闭会话能回收后台进程。

## 3. 第二步 —— opencode 侧（在 kt-opencode `main`/#13 之上加，不推翻）

1. **「外部注入登录」模式**：opencode 被内嵌时，从宿主注入的凭据（环境变量或握手）读取 KT 身份，**隐藏自带登录入口**；非内嵌时保持 #13 现有登录不变。入口在 `packages/opencode/src/plugin/ktai.ts` + `ktai-identity.ts`。
2. **显示余额/账号**：登录后调用 `GET https://login.ktyun.cc/identity/v1/account/me` 和 `/identity/v1/account/ledger/balance`，在界面展示「账号 + 剩余额度」。（#13 目前登录了但没展示，需补。）
3. **免填密钥（最高优先，但依赖外部）**：目标是登录成功后自动拿到该用户专属的 NewAPI 凭证，写入 `auth.json` 并切换到付费模型，**去掉手动 `KTAI_API_KEY`**。依赖 **NewAPI 按 `kt_account_id` 的 Ensure/Token Exchange**（参考 `KTAIorg/kt-growth` 的 `internal/provision/provision.go`，已交接给 NewAPI 开发者）。Ensure 就绪前保留 #13 的 `KTAI_API_KEY`/粘贴 过渡路径。
4. （可选/安全）不把长期 Bearer 落到本地后台，改用短期派生凭据 + 到期自动续。
5. **验收**：内嵌模式下不弹登录、界面能显示账号与余额；Ensure 就绪后新用户无需填 key 即可用付费模型。

## 4. 关键接口/契约速查

- KT Identity（`login.ktyun.cc/identity/v1`）：`/auth/login`、`/auth/telegram/{start,poll}`、`/auth/introspect`、`/account/me`、`/account/ledger/balance`、`/authz/can`。契约见 `kt-identity/openapi/kt-identity-public-v1.yaml`、`docs/api/post-login-session-handoff-contract.md`（Desktop 走 Bearer 面；token 不入 URL/长期 localStorage）。
- NewAPI = `ktapi.cc`：模型 `GET /v1/models`（带 Bearer key）、定价 `GET /api/pricing`。所有模型（含 free-model-hub 的免费模型）都从 ktapi.cc 出；**不经过 kt-ai-api-gateway**（遗留、退役中）。
- 免费额度：Zen 返回 `FreeUsageLimitError` → 引导 `https://www.ktapi.cc/wallet`（#13 已实现，勿改回 OpenCode Go）。

## 5. 我的设计更好、但 #13 还没做的点（本次要补）

| 点 | #13 现状 | 目标（本次补） | 归属 |
|---|---|---|---|
| 嵌进 KT 客户端 | 无（独立 app） | 有 | 第一步 |
| 不二次登录 | 会重复登录 | 复用宿主登录 | 第一步 + 第二步 |
| 显示余额/账号 | 未显示 | 显示 | 第二步 |
| 免填密钥 | 手动填 key（过渡） | 自动拿专属凭证 | 第二步 + 催 NewAPI |
| 本地后台由客户端托管 | 无 | 客户端起/管/健康检查 | 第一步 |

## 6. 坑与红线

- **不要 revert #13**；在其之上增量。
- 本次**留在 V1 基线**，不迁 V2（V2 是 beta、每天在变；迁移作为以后里程碑）。
- kt-desktop 是 Electron 桌面应用，**GUI 验收在 macOS 上按现有启动方式做**，别在云/无头环境判定失败。
- `packages/opencode/src/plugin/ktai.ts` 里用 `release_date` 控制模型默认可见性是**取巧写法**，改动模型列表时小心别踩坏。
- 提交遵循仓库约定（conventional commit、中文说明），PR 前本地 `bun typecheck`（包目录内跑）。

## 7. 建议顺序

先做**第一步（kt-desktop 内嵌 + 复用登录）**打通「能在客户端里用」，同时**第二步的 1、2**（外部登录 + 余额展示）配合；**第二步的 3（免填密钥）**并行催 NewAPI Ensure。
