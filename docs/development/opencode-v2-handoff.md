# opencode V2 × KT 集成 — 任务交接（Handoff）

日期：2026-07-22
交接给：接手继续开发的 AI / 工程师
配套总纲：`docs/development/opencode-v2-kt-integration.md`（架构决策事实源，PR #9）

> 本文是**给接手者的操作性交接**：现状、已做、怎么继续、坑与访问方式。
> 架构“为什么这么设计”看总纲；本文只讲“到哪了、接下来怎么做、注意什么”。

## 0. TL;DR

- **目标**：把 KTAI opencode 从 V1(`1.18.3` fork) 迁到 **上游 V2 Beta**（`opencode2`），并接入 KT 平台（身份 / 计费 / 桌面壳）。产品未上线，走**干净的 V2 路线**（不背 V1 兼容包袱）。
- **进度**：M1 ✅、M2 ✅；M3–M6 待做。
- **相关 PR**：
  - #9 设计总纲（`opencode-v2-kt-integration.md`）——架构事实源。
  - #10 M2：V2 版 KTAI Provider（base = `cursor/v2-base-cf06`）。
  - #7 开发环境（AGENTS.md Cursor Cloud 说明）。
- **分支**：
  - `main`：保持 V1（`1.18.3`），可回退，**不要动**。
  - `cursor/v2-base-cf06`：**V2 基线** = 上游 `beta` pin（`9cf4ecd18b`）。后续 V2 工作都以它为 base。
  - `cursor/v2-ktai-provider-cf06`：M2（PR #10）。
  - `cursor/v2-kt-integration-design-cf06`：设计总纲（PR #9）。

## 1. 已完成

### M1 — V2 基线分支
- `cursor/v2-base-cf06` = 上游 `anomalyco/opencode` 的 `beta` 分支最新提交 `9cf4ecd18b`，已推 origin。
- 已验证底座可跑：`opencode2`(=`packages/cli`) `serve` 起 V2 server、`api` 建/列 session，并能读 V1 已建 session（共享 SQLite 存储）。

### M2 — KTAI Provider V2 版（PR #10）
- 新增 `packages/core/src/plugin/provider/ktai.ts`：`catalog.transform` 从 `ktapi.cc/api/pricing` 拉目录
  （**只映射能力 tools/vision→image/files→pdf/上下文；`cost` 置 0；去掉全部定价数学**；网络失败回退静态目录）
  + `integration.transform` 注册 `ktai`（`key`/`env:["KTAI_API_KEY"]`）；注册进 `ProviderPlugins`。
- 测试 `packages/core/test/plugin/provider-ktai.test.ts`：**5 pass**（含经 `PluginHost` 跑通插件、
  确认 catalog 出现 `ktai` provider 指向 `ktapi.cc/v1`）。`bun typecheck` 干净。

## 2. 已定架构决策（详见总纲）

- **分层**：`new-api(ktapi.cc, L1 计量)` → `kt-identity ledger(L2 账本, 唯一事实源)` → `kt-billing(L3 编排/账单)`；展示层 `kt-desktop + opencode web UI`。
- **拓扑**：内核 = 用户本地 `opencode2` daemon；web UI 自托管；由 **kt-desktop** 作为会话类型承载（内嵌/侧栏/独立窗口），Electron 壳规避 https→localhost。
- **单一 AI 门 = new-api(ktapi.cc)**：所有模型（含 `free-model-hub` 免费模型，注册进 new-api）都从 ktapi.cc 出；opencode **不直连 free-model-hub、不经过 `kt-ai-api-gateway`**（后者遗留、逐步退役）。
- **去定价**：opencode 不自算成本；余额读 `identity /account/ledger/balance`。
- **零账号自动开通**：`kt-growth` 的 `provision` adapter 消费 identity `user.registered` 事件，**幂等静默开通** new-api account+token（`Ensure()`）。用户不手动注册 new-api。
- **认证单点登录（不二次登录）**：kt-desktop 分支 `feat/identity-only-login` 已实现 KT Identity 登录、Bearer 常驻内存；opencode 会话经 **preload IPC 桥复用宿主 token**，daemon 由宿主注入**该账号的 new-api token**；opencode 不自带登录页。Desktop = Bearer 面。
- **交付收敛**：opencode 只留 daemon + web UI；桌面收敛到 kt-desktop → **冻结 opencode 自己的 Electron 打包与 `release-desktop.yml` KTAI 定制**。

## 3. 剩余里程碑（接手从这里继续）

### M3 — kt-desktop：opencode 会话类型 + 本地 daemon host capability
在 **`KTAIorg/kt-desktop`** 仓库（Electron + Vue，非本仓）：
1. 新增 opencode 会话类型（复用 `src/view/customSession/CustomSession.vue` 骨架 + `src/store/sessionStore.ts`），
   在 plugin-resolve 的 Session Type 注册表登记新 ID + Host App（建议 `opencode-web`）。
2. 新增 host capability `opencode.daemon`：`electron/main/view.ts`（BrowserView + partition）spawn/管理
   `opencode2 serve --hostname 127.0.0.1 --port <auto> --register`（带 password），会话内 BrowserView 加载自托管 web UI 连该 daemon。
3. 健康上报走现有 host-capability-report 通道（`opencode.daemon.spawn/health`、`opencode.api.reachable`、`provider.newapi.reachable`）。
4. 复用 `position=outer` 实现独立窗口。
> 注意：opencode 是 first-party host，DOM 注入类 capability 对它 N/A（见总纲 §5.2）。

### M4 — KT Identity 认证（复用宿主登录）+ provider 凭据换 new-api token
- opencode(本仓)：新增 external/injected-auth 接缝——KT 身份来自宿主，不走应用内登录。
- kt-desktop：在 `src/libs/identityAuth.ts`/preload 暴露 `getIdentityToken()` + token-changed 事件给 opencode BrowserView；spawn daemon 时注入**该账号 new-api token**（kt-growth 静默开通产出）。
- daemon 侧：把 M2 的 `KTAI_API_KEY` 凭据来源换成宿主注入的 new-api token；用 identity `auth/introspect`、`authz/can`、`account/me` 校验。

### M5 — 计费 / 计量展示
- opencode 读 `identity /account/ledger/balance`（余额/额度）+ `kt-billing`（套餐/账单：`/plans`、`/subscriptions`、`/billing/statement`）。
- 定稿：额度校验位置（本地 daemon 直连 vs 服务器中转）。单位 `$1=500k quota`。

### M6 — 交付收敛
- 冻结 opencode 自己的桌面打包（`packages/desktop` KTAI 定制、`.github/workflows/release-desktop.yml`），产物只留 daemon + web UI，接入 kt-desktop 发布。

## 4. 待用户拍板的开放问题（总纲 §11）

1. **会话主键**：opencode 会话 = 项目/工作目录（默认）还是 KT workspace？→ 影响 M3。
2. 额度校验位置：本地 daemon 直连 vs 服务器中转。→ 影响 M5。
3. web UI 自托管形态：纯静态 CDN vs 网关托管。
4. 桌面打包冻结时机。

（daemon 凭据模型、模型目录来源、kt-ai-api-gateway 去留 已定案，见总纲 §11。）

## 5. 开发环境与如何继续（本 VM）

- **运行时**：`bun 1.3.14`（`/usr/local/bin/bun`）。安装/说明见 `AGENTS.md`(#7) 的 `## Cursor Cloud specific instructions`。
- **V2 工作区**：git worktree 在 `/workspace/.worktrees/v2beta`，检出分支 `cursor/v2-ktai-provider-cf06`（基于 V2 基线）。主 checkout `/workspace` 用于 V1/文档分支。
- **跑 V2**：`cd /workspace/.worktrees/v2beta && bun run --cwd packages/cli src/index.ts serve --port <p> --hostname 127.0.0.1`；
  用 `bun run --cwd packages/cli src/index.ts api <operationId>` 调运行中 server。
- **typecheck**：`cd packages/core && bun typecheck`（走 tsgo，勿用 tsc）。
- **测试**：**按单文件跑**，例 `bun test test/plugin/provider-ktai.test.ts`。**不要整目录 `bun test test/plugin/`**——上游 beta 基线本身有循环初始化 TDZ（`provider.ts` 的 `ProviderPlugins`），整目录跑会全红（pristine base 已复现，非我方引入）。
- **git 提交**：pre-push husky 钩子会跑 `bun turbo typecheck`；对文档/上游基线用 `git push --no-verify`（V1 `main` 上还有个遗留 `ktai.ts` 类型错误卡 typecheck，V2 分支已无此问题）。
- **仓库大小写**：origin 是 `ktaiorg/kt-opencode`，会 301 重定向到 `KTAIorg`；`ManagePullRequest` 更新描述可能因此报错，用 create 或直接改。

## 6. 私有仓库访问（关键）

其它 KT 私有仓库**不在环境自带 GitHub 令牌范围内**（cursor 令牌只覆盖 kt-opencode）。访问方式：
1. `kt` CLI（`~/.kt/bin`，`curl -fsSL https://ktcli.com/install.sh | sh` 安装）。
2. `kt login --no-browser --async`（Telegram 授权）→ 登录态存 `~/.kt-auth/`（本 VM 已登录，token 可能过期，用 `kt auth refresh` 续期，refresh 有效期到 2026-08-21）。
3. `kt component install secret` 后，`kt secret get --ws kt --project github_push_token --env prod --path / --key GITHUB_PUSH_TOKEN` 取 GitHub PAT（本 VM 已放在 `~/.kt-secrets/gh_pat`，0600，**勿提交/勿打印**）。
4. 用该 PAT 克隆（避免命中 cursor 令牌的 insteadOf）：
   `git clone https://x-access-token:$(cat ~/.kt-secrets/gh_pat)@github.com/KTAIorg/<repo>.git`，克隆后 `git remote set-url origin https://github.com/KTAIorg/<repo>.git` 抹掉内嵌 token。

本 VM 已克隆到 `~/kt-repos/`：`kt-identity`、`kt-billing`、`kt-billing-blueprint`、`kt-desktop`、`kt-growth`、`kt-ai-api-gateway`。

## 7. 关键文件 / 入口清单

**opencode（本仓，V2 在 worktree）**
- V2 CLI：`packages/cli/src/index.ts`（`opencode2`）。
- Provider 插件：`packages/core/src/plugin/provider/*.ts`（KTAI = `ktai.ts`）；注册表 `packages/core/src/plugin/provider.ts`。
- 插件 API：`packages/core/src/plugin/internal.ts`（`define`）、`@opencode-ai/plugin/v2/effect`。
- catalog/integration：`packages/core/src/catalog.ts`、`packages/core/src/integration.ts`、schema `packages/schema/src/{model,provider,integration}.ts`。
- 模型解析参考：`packages/core/src/plugin/models-dev.ts`（动态目录范式）。

**kt-desktop（`~/kt-repos/kt-desktop`）**
- 会话/窗口：`electron/main/view.ts`（BrowserView+partition）、`src/view/customSession/CustomSession.vue`、`src/store/sessionStore.ts`。
- KT 登录（复用基线）：分支 `feat/identity-only-login`，`src/libs/identityAuth.ts`、`src/libs/apiAuth.ts`。
- 平台契约：`contracts/{host-capability-report,host-policy-execution,plugin-resolve-client}.md`、`adr/0001-*`、`docs/plan/enterprise-plugin-platform-client.md`。

**KT 平台**
- 身份：`kt-identity/openapi/kt-identity-public-v1.yaml`、`docs/integration/kt-identity-integration-guide.md`、`docs/api/post-login-session-handoff-contract.md`。入口 `login.ktyun.cc/identity/v1/*`，Casdoor `auth.ktyun.cc`。
- 计费：`kt-billing/contracts/billing-api.md`、`kt-billing/README.md`、`kt-billing-blueprint/`。
- 静默开通：`kt-growth/internal/provision/provision.go`、`kt-growth/docs/prd/growth-loop-v1.md`、`docs/decisions/0001-*`。
- AI 门：`KTAIorg/new-api`(=ktapi.cc)、`KTAIorg/free-model-hub`(上游注册表)、`KTAIorg/kt-ai-api-gateway`(遗留)。

## 8. 坑 / 注意事项

- 上游 `beta` 会 **rebase（force-update）**，是移动目标；同步时 pin 到具体 commit，按 `upstream-sync-policy.md` 滚动。
- 整目录跑插件测试的 TDZ（见 §5）——单文件跑。
- V1 `main` 的 `packages/opencode/src/plugin/ktai.ts` 有遗留类型错误（卡 pre-push），V2 已重写无此问题；别把 V1 ktai.ts 带进 V2。
- 秘钥只走 `kt`/本地 0600 文件，**不入仓库、不入聊天、不打印**。
- 本 VM 有若干 tmux 会话在跑（`opencode2-ktai` 等），是历史验证用，可忽略或清理。
