# opencode V2 × KT 平台集成设计（总纲）

日期：2026-07-22
状态：草案（Draft，用于 V2 落地对齐，尚未实现）
适用范围：`KTAIorg/kt-opencode`（基于上游 `anomalyco/opencode` V2 Beta 的 fork）

> 本文是 KTAI opencode 从 V1 迁移到 **V2 Beta** 并接入 KT 平台（身份、计费、桌面壳）的**架构总纲**。
> 它冻结部署拓扑、集成边界与落地顺序，作为后续每个 PR 的依据。具体实现细节由各阶段的
> 子文档 / contract 承接。

## 1. 背景与目标

KTAI opencode 目前是上游 `v1.18.3` 的最小补丁 fork（见 `docs/development/upstream-sync-policy.md`），
自研内容仅：KTAI Provider、桌面品牌化、桌面打包/发布流水线。产品尚未面向市场。

目标：

1. **底座升级到上游 V2 Beta**（`opencode2`，二进制 = `packages/cli`，从上游 `beta` 分支出包）。
2. **认证改造**：接入 **KT Identity**（`login.ktyun.cc/identity/v1`，Casdoor 内核）。
3. **计费/计量**：AI 计量走 **new-api（= 现有 KTAI Provider / `ktapi.cc`）**，账本复用 **KT Identity ledger**，
   套餐/订阅/账单走 **KT Billing**。
4. **交付形态**：opencode 作为 **kt-desktop** 里的一个会话类型（像 WhatsApp/Telegram 会话），
   可在 kt-desktop 内嵌、侧栏或独立窗口打开。

## 2. 关于 “2.0” 的事实澄清

- 上游没有已发布的 `2.0` 正式 tag（最新正式版 `v1.18.4`）。V2 是一条独立的 **beta 发布线**：
  文档 `v2.opencode.ai`，二进制 `opencode2`，通过 `next` 分发标签安装，beta 期间版本号为 `0.x`（发布渠道注入）。
- V2 从上游 **`beta` 分支**出包（发到 `anomalyco/opencode-beta`，`OPENCODE_CHANNEL=beta`）。
- V2 三个 breaking change：**插件 API 全新**、**服务端 API + 客户端契约全新**（改用 `@opencode-ai/client`）、
  **配置从 `tui.json(c)` 迁到全局 `cli.json`**（自动迁移，V1 配置仍在内存翻译兼容）。
- V2 CLI（`packages/cli`，内部代号 `lildax`）子命令：`serve`（起 v2 API server）、`service`（后台 daemon 管理）、
  `api`（按 OpenAPI operationId 调用运行中的 server）、`migrate`（V1→V2 数据迁移）、`debug`。
- 已验证：V2 server 起在本地端口、可创建/列出 session，并能读到 V1 已建的 session（共享存储）。

## 3. 总体分层架构

对齐 KT 统一计费蓝图（`kt-billing-blueprint`）：

```
L4 展示   kt-desktop（会话/窗口） + opencode web UI（自托管）
   │
L3 编排   kt-billing（套餐 / 订阅 / 周期扣费 / 免费额度 / 超额 / 账单 / 分层定价）
   │       kt-growth（权益规则引擎 + New API 静默开通 provision）
   │
L2 账本   kt-identity entitlement_ledger（唯一事实源，不新建）
   │
L1 计量   new-api = ktapi.cc（AI token → quota；模型执行 + 计量 + 配额）
   │          ▲ free-model-hub（免费模型统一注册表）注册进 new-api，对 opencode 透明
```

**核心边界原则**（沿用各仓库 contract）：

- 身份事实源 = KT Identity；业务只认 `kt_account_id`（token `sub`）。
- 余额/账本事实源 = KT Identity ledger；kt-billing 不存余额、不算 token、不收款。
- AI 计量事实源 = new-api；opencode 本地只做成本展示（不作为计费依据）。
- **opencode 的唯一 AI 门 = new-api（ktapi.cc）**：所有模型（含 free-model-hub 免费模型）都从 ktapi.cc 出；
  opencode **不直接对接** free-model-hub，也**不经过** `kt-ai-api-gateway`（后者是旧桌面翻译/chatGpt/workflow 的产品入口，与 opencode 无关）。
- **零账号自动开通**：用户不手动注册 new-api、不复制 key；由 `kt-growth` 的 `provision` adapter 消费
  identity `user.registered` 事件，**幂等静默开通** new-api account+token（`Ensure()`）。
- kt-desktop 只执行平台决策（`kt-desktop/adr/0001`）。

## 4. 部署拓扑

```
┌── 用户本地机器 ─────────────────────────┐     ┌── KTAI 服务器 ──────────────┐
│  opencode2 内核 = 本地后台 daemon        │     │  opencode web UI（自托管静态）│
│  (opencode2 serve/service, 带 password)  │◄────┤  由 kt-desktop 的 BrowserView │
│  访问本地文件、跑 agent、调 new-api LLM   │连本地│  或用户浏览器加载             │
└──────────────────────────────────────────┘ API └───────────────────────────────┘
        ▲ 由 kt-desktop 作为 host capability 托管（spawn / 健康上报）
```

- **内核（后端）跑在用户本地**：编码 agent 必须在代码所在处运行、需访问本地文件系统。
- **web UI 自托管**：集中托管前端（替代上游 `app.opencode.ai`）。
- **web → 本地 daemon**：前端在 Electron BrowserView（或浏览器）内运行，连 `localhost` 的本地 daemon。
  **Electron 壳内加载可天然规避 https→localhost 的混合内容 / CORS 限制**（首选路径）。

## 5. opencode 作为 kt-desktop capability

### 5.1 kt-desktop 现状（读 `KTAIorg/kt-desktop`）

- Electron + Vue（view-ui-plus）壳；每个会话 = 一个 **BrowserView + 独立 session partition**，加载一个 URL
  （`electron/main/view.ts`）。
- **多会话网格**：每会话有 `uId` / running / `position`（内嵌 / `right` 侧栏 / **`outer` 独立窗口**），
  有 `maxSessionCount` 配额（`src/view/customSession/CustomSession.vue`、`src/store/sessionStore.ts`）。
- 已有通用会话类型 **`CustomSession`**（不止 WhatsApp）。
- per-session 身份上报（`xSessionIdentity*`）、per-session 代理/UA。
- 正演进为**企业插件平台客户端**：Desktop 调 `kt-plugin-platform` 的 `resolve` → artifact 下载/校验 →
  本地激活 → 状态与 **host capability 上报**；Desktop 只执行平台决策（`adr/0001`）。
- Session Type → Host App → Plugin 注册表为数字 ID（`1`=whatsapp、`4/27`=telegram……见
  `contracts/plugin-resolve-client.md`）。

### 5.2 关键差异：opencode 是 first-party host，不是被注入的第三方页面

kt-desktop 现有的 host-capability / host-policy / plugin-resolve 机制，是为**往第三方页面（WhatsApp Web 等）
注入插件**设计的（DOM 探测、`dom.composer.write`、宿主版本 pin……）。opencode 不同：

- **我们同时拥有页面（web UI）和后端（daemon）**，不需要 DOM 注入类能力（这类 capability 对 opencode `N/A`）。
- opencode 需要的是一个现有会话都没有的新能力：**在本地拉起并管理一个后端 daemon**。

因此集成策略是“**复用会话/窗口框架，新增 daemon host capability，跳过 DOM 注入链路**”。

### 5.3 会话模型

- 新增 opencode 会话类型（实现上先复用 `CustomSession` 骨架），在 plugin-resolve 的
  Session Type 注册表中登记一个新 ID + Host App（建议 `opencode-web`）。
- **会话语义**（默认采用，可再调）：opencode 的“会话” = **一个项目 / 工作目录**（多会话网格 = 同时打开的多个项目/工作区），
  与社媒会话“一个账号一个会话”不同。所属身份统一挂在登录的 `kt_account_id` 上。
- 会话 `position` 直接复用 内嵌 / 侧栏 / **独立窗口（`outer`）**。

### 5.4 本地 daemon 生命周期（新增 host capability：`opencode.daemon`）

由 kt-desktop 作为 host capability 托管：

1. **启动**：会话打开时，desktop spawn `opencode2 serve --hostname 127.0.0.1 --port <auto> --register`
   （端口默认 4096 起自动递增）。daemon 生成/持有 `password`（server 鉴权）。
2. **发现**：`--register` 把 daemon 地址注册给本地 daemon 管理器（对应 `opencode2 service`），
   web UI / 会话据此连接。
3. **注入身份**：desktop 在 spawn 时把 KT Identity 凭据（见 §6）与 workspace/项目上下文注入 daemon 环境。
4. **健康上报**：daemon 状态以 host-capability-report 形式上报（复用现有上报通道），
   能力键建议：`opencode.daemon.spawn`、`opencode.daemon.health`、`opencode.api.reachable`、
   `provider.newapi.reachable`（状态枚举 `ok/degraded/missing/unknown`）。
5. **停止/回收**：会话关闭或 `closeAll` 时优雅停止 daemon；遵守 host-policy 的 `block`（阻断高风险）与过期规则。

> 注：DOM/宿主版本 `pin`、`fresh_partition` 等 host-policy 对 opencode 基本 `N/A`，但 daemon 的
> 启停/阻断可复用 host-policy 的 `block` 语义与 decision-trace 上报，保持“平台决策、desktop 执行”的一致性。

## 6. 认证数据流（KT Identity）

- 入口：`https://login.ktyun.cc/identity/v1/*`；Casdoor 内核在 `auth.ktyun.cc`。统一主键 `sub = kt_account_id`。
- 登录交接规则（`kt-identity/docs/api/post-login-session-handoff-contract.md`）：
  **官方同源页面走 Cookie 面；Desktop / 第三方 SPA / CLI 走 Bearer 面**；一个 challenge 只消费一次；
  token 不入 URL / 长期 localStorage。→ **opencode-in-kt-desktop 属于 Bearer 面**。

数据流：

```
kt-desktop 登录(KT Identity, Bearer, sub=kt_account_id)
  -> spawn 本地 daemon, 注入 Bearer / 短期凭据
  -> web UI 连 daemon(用 daemon password)
  -> daemon 校验用户态: POST /identity/v1/auth/introspect
  -> 权限: POST /identity/v1/authz/can | /authz/batch
  -> 账户: GET /identity/v1/account/me
```

关键接口：
`/auth/login`、`/auth/telegram/{start,poll}`、`/auth/introspect`、`/authz/{can,batch,permissions}`、
`/account/me`、`/account/sessions`、`/account/ledger/balance`。

### 6.1 单点登录：复用 kt-desktop 的 KT 登录态（不二次登录）

kt-desktop 的 `feat/identity-only-login` 分支已实现 KT Identity 登录并常驻登录态，opencode 会话
**必须复用它，不能再弹一次登录**：

- `kt-desktop/src/libs/identityAuth.ts`：登录只打 `login.ktyun.cc/identity/v1/auth/login`，
  Bearer **只存渲染进程内存**（`runtimeIdentityToken`，不落 localStorage/URL），已封装
  `account/me`、`account/ledger/balance`、`getIdentityToken()`。
- `kt-desktop/src/libs/apiAuth.ts`：`getApiAuthHeaders()` 从内存取 token，统一发 `Authorization: Bearer`；
  401 走 `handleApiUnauthorized` 重登。

融合规则（宿主单点登录，opencode 复用）：

1. **opencode web UI 增加“宿主注入认证”模式**：嵌入 kt-desktop 时不走应用内 KT 登录，而是经
   **preload IPC 桥**向宿主索取当前 `getIdentityToken()`，并订阅 token 刷新事件；登录页在嵌入模式隐藏。
2. **daemon 凭据由宿主注入短期派生凭据**（定案：不把长期 Bearer 落到本地 daemon）。daemon 用它做
   `introspect`/`authz`/`ledger` 与 new-api 计量，全部落在同一 `kt_account_id`。
3. **单一事实源 + 刷新**：kt-desktop 是唯一登录处；401/过期由它 `handleApiUnauthorized` 重登一次，
   再经桥把新 token 推给 opencode 会话与 daemon。opencode 永不独立登录。
4. 符合登录交接契约：Desktop = Bearer 面；token 不进 URL / 长期 localStorage；桥传内存态。

两边改动：
- **opencode（本仓）**：新增 external/injected-auth 接缝——KT 身份来自宿主而非应用内登录。
- **kt-desktop**：在 `identityAuth`/preload 暴露 `getIdentityToken()` + token-changed 事件给 opencode
  BrowserView；spawn opencode daemon 时注入短期凭据。桌面侧 KT 登录基于 `feat/identity-only-login`，不重造。

## 7. 计费 / 计量数据流

```
opencode agent 调 LLM
  -> new-api(ktapi.cc, KTAI Provider) 计量 AI token -> quota   [L1 事实源]
  -> 用量记账/余额: kt-identity /ledger/entries, /ledger/balance [L2 事实源]
  -> 套餐/订阅/免费额度/超额/账单: kt-billing                    [L3 编排]
        /plans /subscriptions /pricing-policies
        /units/{id}/allocate /billing/statement
```

- 单位统一：`$1 = 500k quota`（`kt-billing`）。
- **零账号自动开通**（`kt-growth/internal/provision/provision.go`）：用户不手动注册 new-api、不复制 key。
  `Ensure(ktUserID)` 幂等静默开号——按 `ktUserID` 派生 new-api 用户名 → CreateUser/ResetPassword →
  CreateTokenForUser → 存映射 `{ktUserID, username, userID, APIToken}`；由 identity `user.registered` 事件触发。
- **provider 凭据 = 该账号的 new-api APIToken**（kt-growth 静默开通铸出，绑定 `kt_account_id`），
  **不是**共享静态 `KTAI_API_KEY`；由宿主 kt-desktop 注入本地 daemon（见 §6.1）。
- opencode 侧：
  - **计量**：走 KTAI Provider（new-api / ktapi.cc）；模型目录也从 ktapi.cc 出（free-model-hub 在上游、透明）。
  - **余额/额度展示**：读 `identity /account/ledger/balance`（与会话 `kt_account_id` 绑定）——**不本地反推成本**。
  - **套餐/账单页**：读 `kt-billing`。
  - **去掉本地定价换算**：不再复刻 new-api 的 ratio/price 计费数学；V2 模型 schema 的 `cost` 字段填 0/占位，仅满足类型，不作为计费依据。
- 额度校验位置（待定）：本地 daemon 直连 identity/new-api 校验，还是经我们服务器中转（利于跨端 quota 互通与防刷）。

## 8. KTAI Provider 移植到 V2（已定方案，独立于外部仓库，可先做）

范围收敛（结合 §7 决策）：**只保留“连 ktapi.cc + 抓模型目录”，去掉定价/成本换算逻辑**。

| V1（现状） | V2 落点 |
|---|---|
| `packages/opencode/src/plugin/ktai.ts` 的 `config` hook 注 `config.provider.ktai` | 新建 `packages/core/src/plugin/provider/ktai.ts`，用 `ctx.catalog.transform` 动态注模型 |
| `auth:{provider,methods:[{type:"api"}]}` | 改用 `ctx.integration.transform` 注册 `key` + `env:["KTAI_API_KEY"]`（**M2 开发/回退**；M4 换成宿主注入的 per-account new-api token） |
| 在 `opencode/internalPlugins()` 注册 | 在 `packages/core/src/plugin/provider.ts` 的 `ProviderPlugins` 数组注册 |
| model 能力 `tool_call/modalities/release_date` | 映射到 V2 catalog：`capabilities.tools/input/output`、`time.released` |
| model **定价** `quota_type/model_ratio/model_price/completion_ratio → $` | **删除**；`cost` 填 0/占位（计费在平台侧，见 §7） |

- 模型目录来源：`ktapi.cc/api/pricing`（或 new-api `/v1/models`）**只取模型列表 + 能力标签**（Vision/Files/Reasoning/Tools/上下文），不取价格。free-model-hub 在 new-api 上游、对 opencode 透明。
- 旧 `ktai.ts` 的 pricing 数学（`models()`/`providerModel()` 里 ratio 换算）不再移植；顺带消除 V1 遗留类型错误（`modalities.input` 被推断为 `string[]`，V1 期卡 pre-push typecheck）。

## 9. V2 基线与交付策略

- **基线**：不动 `main`（保留 V1 可回退）；新建 `v2` 基线分支 = 上游 `beta` 的一个 pin 提交；
  KTAI 定制以 PR 落到 `v2`；稳定后再把 `v2` 提为默认分支。遵循 `upstream-sync-policy.md`
  （禁止 ZIP/squash 覆盖式同步；beta 无稳定 tag，pin 到具体 commit）。
- **交付收敛**：opencode 只保留 **server(daemon) + web UI** 两个产物，桌面交付统一收敛到 **kt-desktop**。
  → 冻结/移除 opencode 自己的 Electron 桌面打包与 `release-desktop.yml` 的 KTAI 桌面定制
  （V1 的“桌面品牌化 / 独立安装包 / 发布流水线”不再需要，显著缩减移植量）。

## 10. 落地里程碑（建议顺序）

1. **M1｜V2 基线分支**：建 `v2` = 上游 `beta` pin；跑通 `opencode2 serve` + web UI（已在隔离 worktree 验证过底座可运行）。
2. **M2｜KTAI Provider 移植**：catalog/integration 版 KTAI Provider + 修类型错误 + 测试（不依赖外部仓库）。
3. **M3｜daemon host capability**：kt-desktop 侧新增 opencode 会话类型 + 本地 daemon 生命周期（spawn/发现/健康上报）。
4. **M4｜KT Identity 认证**：Bearer 面接入（introspect/authz/account.me），desktop→daemon 凭据注入与刷新。
5. **M5｜计费/计量**：ledger 余额 + kt-billing 套餐/账单展示；额度校验位置定稿；单位口径统一。
6. **M6｜交付收敛**：冻结 opencode 桌面打包，产物只留 daemon + web UI，接入 kt-desktop 发布。

## 11. 开放问题（待确认）

1. 会话语义：opencode 会话按“项目/工作目录”还是“KT workspace”为主键？（本文默认前者）
2. ~~daemon 凭据模型~~（已定案，见 §6.1/§7）：宿主 kt-desktop 单点登录，opencode 复用其内存 Bearer；
   daemon 由宿主注入的凭据即该账号 new-api APIToken（kt-growth 静默开通），opencode 不自带登录页。
3. 额度校验位置：本地 daemon 直连 vs 服务器中转。
4. web UI 自托管形态：纯静态 CDN vs 由某个网关服务托管（影响与 daemon 的同源/代理策略）。
5. 桌面打包冻结的时机：M2 后即冻结，还是保留到 M6。
6. ~~模型目录来源~~（已定案，见 §3/§8）：唯一 AI 门 = new-api（ktapi.cc）；free-model-hub 注册进 new-api、
   对 opencode 透明；opencode 不直连 free-model-hub，也不经过 kt-ai-api-gateway。

## 12. 参考（源契约位置）

- 上游 V2：`v2.opencode.ai`、`v2.opencode.ai/migrate-v1`；本仓 `packages/cli`、`packages/core/src/plugin/*`。
- KT Identity：`kt-identity/openapi/kt-identity-public-v1.yaml`、
  `kt-identity/docs/integration/kt-identity-integration-guide.md`、
  `kt-identity/docs/api/post-login-session-handoff-contract.md`。
- KT Billing：`kt-billing/README.md`、`kt-billing/contracts/billing-api.md`、`kt-billing-blueprint/`。
- New API 静默开通：`kt-growth/internal/provision/provision.go`、
  `kt-growth/docs/prd/growth-loop-v1.md`（§4.2 事件流、§5 静默开通）、
  `kt-growth/docs/decisions/0001-supersede-newapi-provisioner.md`。
- AI 门层次：`KTAIorg/new-api`（= ktapi.cc，LLM 执行/计量）、`KTAIorg/free-model-hub`（免费模型注册表，上游）、
  `KTAIorg/kt-ai-api-gateway`（旧桌面翻译/chatGpt/workflow 产品入口，opencode 不经过）。
- kt-desktop：`kt-desktop/electron/main/view.ts`、`kt-desktop/src/view/customSession/CustomSession.vue`、
  `kt-desktop/contracts/{host-capability-report,host-policy-execution,plugin-resolve-client}.md`、
  `kt-desktop/adr/0001-desktop-executes-platform-decisions.md`、
  `kt-desktop/docs/plan/enterprise-plugin-platform-client.md`。
- kt-desktop KT 登录（单点登录基线）：分支 `feat/identity-only-login`，
  `kt-desktop/src/libs/identityAuth.ts`、`kt-desktop/src/libs/apiAuth.ts`。
