# Kito 2.1.7 问题排查与修复记录（2026-09-17/18）

源码：KTAIorg/kt-opencode @ main（tarball 快照，对应 release kito-v2.1.7）。
本机路径：/Users/fuwuqi/kito-src（无 .git，未建分支/提交）

## 已实施修复（全部本地改动）

### A. Telegram 登录可靠性（identity + 弹窗）
1. `packages/core/src/ktai/identity.ts` `pollTelegramLogin`：
   网络抛错、5xx、429 视为瞬态，连续失败 <5 次继续轮询；4xx 仍立即失败。
   原行为：任一传输错误直接判死 → TG 开着时偶发抖动就登录失败。
2. `packages/core/src/plugin/provider/ktai.ts` authorize：
   轮询 `timeoutMs` 对齐 `challenge.expiresAt`（+30s 宽限，下限 60s），不再硬编码 180s。
3. `packages/core/src/plugin/provider/ktai.ts` load()：
   `persistIdentityToken` 保留 `expiresAt`（credential.expires → ISO）与 `accountId`。
   原行为重写文件丢 expiresAt → 过期判定失效 → 本地/远端登录态不一致（假离线来源之一）。
4. `packages/app/src/components/dialog-kt-identity-login.tsx`：
   - 关闭弹窗/点重试 → `integration.oauth.cancel` 取消服务端旧 attempt
     （原：旧 attempt 继续跑 180s，点旧链接 token 落到无人等待的尝试上）。
   - `finish()` ensure 失败不再静默冒充成功：仍提示登录成功，但追加
     `dialog.ktIdentity.ensureFailed` 错误 toast（en 新 key，其它语言走英文兜底）。
   - 新增 `loginOpen` 去重 + `openKtIdentityLogin({push})` 选项。

### B. 模型检测登录引导（用户报告 #2）
5. `packages/app/src/context/models.tsx` executeProbe：
   401 → 手动检测派发 `kito-login-required`（静默自动检测不弹，避免打扰）；
   非静默失败 toast 附服务端 message/error。
6. `packages/app/src/components/titlebar-account-button.tsx`：
   监听 `kito-login-required` → 未登录时 `openKtIdentityLogin({push:true})` 弹登录框。
7. `packages/app/src/components/dialog-kt-wallet.tsx` 登录引导改用 push（保留下层弹窗）。

### C. 免费模型列表陈旧（用户报告 #1/#3）
8. `packages/core/src/models-dev/snapshot.txt`：用官方管线脚本同等流程刷新
   （fetch models.opencode.ai/api.json，221 providers，4.69MB）。
   根因：内置快照 ~5 周陈旧，longcat-2.0-free、laguna-s-2.1-free、
   deepseek-v4-flash-free、ling-3.0-tiny-free、hy3-free 等已被上游下架仍标 active
   → 首次安装+拉不到 live catalog 时显示已死模型、调用被拒；nemotron 两边都活所以能用。
   建议：发版管线加 `bun packages/core/script/update-models-snapshot.ts`。

### D. 假离线兜底（用户报告 #8 相关）
9. `titlebar-account-button.tsx` + `utils/kt-signed-in.ts` createAccountReader：
   /ktai/account 4xx 视为真未登录；5xx（上游 Identity 故障）与网络瞬态失败
   保留上次成功结果，不再把已登录用户闪成"离线"。

### E. 充值状态判定（用户报告 #6 相关）
10. `dialog-kt-wallet.tsx` checkOrder：终态判定改为 `localStatus`/`status`
    任一命中 {failed,expired,cancelled,canceled}（localStatus 优先，对齐 Go 契约
    "失败终态按 localStatus 判断"）。
11. `pay()` 错误读取 `payload.error` → 兼容 `{message}` 错误体，透出服务端真实原因。

## 验证
- `cd packages/core && bun test test/ktai/identity.test.ts`：13 pass（含新增 3 个轮询容错用例）
- `cd packages/core && bun test test/ktai/*`：41 pass
- `cd packages/app && bun test src/components/dialog-kt-wallet.test.ts src/utils/kt-identity-login.test.ts`：3 pass
- `tsgo -b`（app）/ `tsgo -b tsconfig.json`（core）：干净
- core `tsconfig.tests.json` 有 1 个既有缺失依赖报错（`@ai-sdk/xai`，与本次无关）

## 未在本仓修复项（需产品/运维决策）
- **default 分组检测全灭**：`KTAI_CUSTOMER_GROUP="default"` 钉组 +
  pricing 过滤 `enable_groups` 含 "ktai"。若网关未给 default 组开渠道 → 探测全 403。
  探测结果已带上游 error 文案（badge tooltip 可见），需运维确认 default 组渠道配置。
- **opencode 会话/数据目录零隔离**：`util/global.ts app="opencode"`，Kito 与官方
  共用 ~/.local/share/opencode（db/auth/storage/config）。改路径=数据迁移决策，须产品拍板。
  → 2026-09-18 已实施 `kito` 独立根 + 凭据文件复制迁移（见末节 J）。
- **其它渠道可用性检测**：probe 仅覆盖 ktai provider，扩展需新增通用探测端点（设计项）。
- **支付失败根因（服务端侧）**：客户端已如实透出终态与错误文案；若网关渠道
  （alipay/wechat 对应 KTProd appId 渠道）配置故障，需 kt-pay 侧日志确认
  （运维入口：kt-agent-skills/kt/ktpay + ktpay-payment-reconcile）。
- **TG 拿不到请求**：tg:// scheme 被 resolveExternalURL 白名单挡；t.me 深链只弹
  START 不自动发送——需桌面端加 tg:// 放行或二维码兜底（后续独立改）。
  → 2026-09-18 已补二维码 + 复制链接兜底（见下节）；tg:// 放行仍未做。

## 追加修复（2026-09-18）：登录弹窗 TG 触达兜底

### F. 「TG 开着却拿不到登录请求」剩余修复
12. `packages/app/src/components/dialog-kt-identity-login.tsx`：
    - 深链二维码：t.me?start= 链接渲染成 QR（img，160x160，沿用钱包同款
      api.qrserver.com 方案），手机扫码直达 TG 确认页——绕开桌面端
      「只弹 START 不自动发送」问题。
    - 「Copy link」按钮（variant=outline）：navigator.clipboard.writeText 复制
      深链，成功后按钮变「Link copied」；start() 重试生成新链接时复位。
    - 状态从 3 个 createSignal 合并为单个 createStore（AGENTS SolidJS 规范），
      新增 copied 字段。
13. `packages/app/src/utils/qr.ts`：qrUrl() 从 dialog-kt-wallet.tsx 提取为共享
    工具（两弹窗共用，避免循环 import）；wallet 改 import，行为不变。
14. `packages/app/src/i18n/en.ts`：新增 dialog.ktIdentity.scanQr /
    dialog.ktIdentity.copyLink / dialog.ktIdentity.copied（仅 en，其它语言走英文兜底）。
15. tg:// 确认被挡，未放行：desktop `main/files/external-url.ts` 与 app
    `entry.tsx` openExternal 白名单均只放行 http/https/mailto → tg://resolve
    会静默丢弃。按计划只保留 t.me；如后续要 tg:// 优先需桌面白名单改动（独立决策）。

## 验证（2026-09-18 追加）
- `cd packages/app && bun test src/utils/qr.test.ts src/utils/kt-identity-login.test.ts src/components/dialog-kt-wallet.test.ts`：4 pass（新增 qr.test.ts 1 例）
- `/Users/fuwuqi/kito-src/node_modules/.bin/tsgo -b`（packages/app）：干净

## 追加修复（2026-09-18）：default 分组契约对齐（闭环 A）

### G. 「default 分组用户检测全部不可用」根因与客户端修复

**侦察结论**（agent da2eda44 深挖 new-api 源码 + 治理文档）：

- Kito 客户经 `POST /api/iam/ensure` 建影子用户，`users.group` DB 默认 `'default'`
- `syncManagedToken` fire-and-forget 调 `pinEnsuredUserToDefault` 把用户钉回
  `"default"`——但该 pin 走 `PUT /api/user/`，上游挂在 adminRoute + AdminAuth，
  普通客户 role<10 → HTTP 200 + `success:false` → **对客户一直是静默 no-op**
- 探测链路：managed token 不带 group → `usingGroup = user.group = "default"`
  → abilities 交集空 → 网关 503「分组 default 下模型 X 无可用渠道」
- 治理文档（newapi-group-governance）权威口径：**对外 API 消费者组 = `ktai`，
  `default` 是内置兜底，"不要单独当业务组"**
- `enable_groups` 仅在 pricing/目录元数据生效，不在 relay 路径强制；直接死因是
  default 组无渠道 abilities

**客户端已改**：
- `newapi.ts` `KTAI_CUSTOMER_GROUP` `"default"` → `"ktai"`（对齐治理与 catalog.ts
  pricing 兜底 `enable_groups ∋ "ktai"` 的既有假设）
- `pinEnsuredUserToDefault` → `pinEnsuredUserToCustomerGroup`（名实一致；pin 仍
  best-effort，若 fork 放宽 UpdateUser 则把客户从 default/ox-free 收敛到 ktai）
- 测试同步更新：`pins ... back to the customer group`（28/28 pass）

**仍需服务端/运维**：
- fork `controller/iam.go` FindOrCreate 建用户时 group 赋值应为 `ktai`（或运维批量
  `UPDATE users SET "group"='ktai'`）——pin 若持续 no-op，新用户仍落 default
- 验证：`kt newapi ability check --model <id> --group default` vs `--group ktai`；
  `GET /api/option/` 查 `UserUsableGroups`/`GroupRatio` 是否含 default
- 若产品坚持 default=客户组：运维给面向客户的渠道 group 追加 `default` 并登记
  `UserUsableGroups`/`GroupRatio` + pricing `enable_groups` 补 `default`

## 追加侦察（2026-09-18）：支付失败服务端根因（闭环 D）

### H. 「充值下单显示支付失败」链路结论（agent 7238fc4e）

**判定契约**：轮询 `status`/`local_status` 任一 ∈ {failed,cancelled} → 「支付失败」；
`expired` 走另一条文案。`local_status`/`settled` 是 IAM 侧字段（kt-pay 仓零命中）。

**根因排序**：
- R1（最可能）：KTProd 应用（app_id=2079689277851045900）绑定的 provider 账号池
  全灭 → `markAsyncOrderFailed` CAS 置 failed。openrouter 为无绑定默认；门槛=活跃
  +未 suspend+有 session+熔断窗口外。
- R2：上游渠道建单/出码被拒——Stripe 托管收银不再 advertise alipay/wechat、
  Moonshot 风控/凭证失效（alipay/wechat_pay 仅 CN 区 Kimi 账号）、NanoGPT cookie 失效。
- R3：IAM bridge `local_status` 映射问题（本地不可证，需生产响应样本）。
- R4：`cashier_url` 相对路径需 IAM 补全 `https://ktpay.ktcloud.cc`；缺失则 iframe
  无法支付→expired。另 KTProd `allowed_origins` 若不含 ktpay 域 → iframe 内调用 403。
- R6：下单即报错的旁支——provider 不支持 method（400 NO_PROVIDER_AVAILABLE）、
  金额越界、key 失效、签名缺失等（客户端已透出 {message}）。

**客户端判定语义已正确**，无需再改；可选优化是 kt-pay `PaymentStatusResponse`
补 `error_message` 字段后客户端透显「渠道暂不可用」而非裸「支付失败」。

**运维清单**（详见 agent 报告 §6）：ktapi `app_config.ktpay_*` 对齐 →
kt-pay DB 查 `api_keys` 行与各 provider 账号健康 → `payment_orders` 近 20 单
failed 聚集时段 → `kt-pay-worker` pod 必须 Running → 边缘响应头/allowed_origins →
webhook_configs/logs → IAM 响应采样。

## 追加实现（2026-09-18）：通用渠道模型探测（闭环 E）

### I. 「其它渠道也需要可用性检测」实现（agent c8532ccc）

**架构**：共享探测引擎 `core/model-probe.ts` + 通用端点 + Kito 旧路径复用。

- `packages/core/src/model-probe.ts`（新）：按 provider 真实协议族发极小请求
  （chat max_tokens=1 / responses max_output_tokens=16 / anthropic max_tokens=1 /
  gemini maxOutputTokens=16），并发 5、整体超时 12s。协议族映射：
  - openai-chat：`/chat/completions`——openai-compatible/xai/mistral/groq/
    cerebras/deepinfra/togetherai/perplexity/alibaba/venice/openrouter/gateway 等 16 包
  - openai-responses：`/responses`（默认 api.openai.com）——openai 系 3 包
  - anthropic-messages：`/messages` + x-api-key + anthropic-version——anthropic 系
  - gemini：`/models/{id}:generateContent` + x-goog-api-key——google 系
  - 未收录协议（bedrock/azure/vertex/copilot/cohere 等）→ per-model
    `unsupported-protocol`
- `probeProvider` 编排（Effect.fn）：dedupe+trim+cap100 → integration connection
  active → resolve（失败按无凭据）→ 逐模型 plan → 并发探测。凭据来源与
  model-resolver 对齐：key 直连 / oauth access / settings.apiKey / authToken 回落；
  activation=enabled 且无凭据的 provider 按无鉴权探测（本地/公共端点）。
- 协议端点：`POST /api/provider/:providerID/models/probe`（Effect HttpApi，
  payload `{modelIDs[]}`，空→400、>100→400、provider 不存在→404）。
  **不需要 Kito 登录**；缺凭据/未知模型/不支持协议都是 per-model `{ok:false,error}`，
  不会让整端点 401。
- `packages/core/src/ktai/model-probe.ts`：改为复用共享引擎，行为不变
  （仍走 `/ktai/models/probe`，KT Identity 门控，401 仍触发登录引导）。
- plugin 适配层：`core/plugin/host.ts` 与 `plugin/promise/adapter.ts` 补
  `catalog.provider.models.probe`。
- 前端 `context/models.tsx`：`probeTargets()` 按 provider 分组——ktai 组走
  `/ktai/models/probe`，其余走通用端点；每批 ≤100 分批；结果按
  `providerID:modelID` 键控；badge/hide-unavailable 对所有已探测模型生效；
  `probeable()` 计数含 Kito+已配置协议渠道用于按钮置灰；`PROBEABLE_PACKAGES`
  与 server 端 `Provider.packageName`（去 aisdk: 前缀）映射一致。
- `bun run generate` 已重跑（client generated 已同步）。

**验证**：`bun test src/model-probe.test.ts` 19/19；ktai 探测 3/3；ktai 全套+探测
68/68；tsgo -b core/server/client/plugin/app 全绿（app 测试 4 个 SSR 环境失败为
预存在环境问题）。

**遗留**：bedrock/azure/vertex/copilot 等专属协议未覆盖（如实报
unsupported-protocol）；批量探测整体 12s 超时对 >~30 模型的大 provider 可能部分
超时（与 Kito 探测原节奏一致）。

## 追加实施（2026-09-18）：Kito/opencode 数据目录隔离（闭环「零隔离」项）

### J. Kito 独立数据根 + 凭据复制迁移

**根因**：`packages/util/src/global.ts app="opencode"` → data/config/state/cache
全部落在 `~/.local/share/opencode` 等共享目录，Kito 与官方 OpenCode 共用
`opencode.db`、`auth.json`、`storage/`、config。Electron userData
（ai.opencode.desktop）只隔离壳层，sidecar 进程不隔离。

**实施**：

- `packages/util/src/global.ts`：`app = "kito"`，所有 `Global.Path.*` 根自动落到
  `~/.local/share/kito`、`~/.config/kito`、`~/.cache/kito`、`~/.local/state/kito`
  （XDG_*_HOME 覆盖对两棵树仍生效）；`Flock.setGlobal` 的锁目录随 state 一起隔离。
  `OPENCODE_CONFIG_DIR`/`OPENCODE_CONFIG`/`OPENCODE_DB` 覆盖机制保持不变。
- 硬编码叶目录同步改 `kito`：`client/effect/service.ts`、`client/promise/service.ts`
  的 service.json 回退路径；desktop `registration-file.ts`、`background-service.ts`
  （service-local.json）、`storage/install-state.ts`（kito+opencode 双标记兼容）、
  `native/logging.ts`（导出 zip 同时收 kito 新日志与 legacy opencode 日志）、
  `wsl/sidecar.ts`（WSL 侧导出 `XDG_*_HOME=$HOME/.kito/*`，因 sidecar 可能跑上游
  二进制，须显式导出而非继承）。
- `desktop/service/shell-env.ts`：`applyShellEnvironment` 合入登录 shell 环境时先
  `sanitizeImportedEnv` 过滤——导入的 `OPENCODE_*`/`XDG_*_HOME`/`OPENAI_*`/`KTAI_*`
  不得把 sidecar 指回宿主 opencode 根或回灌宿主凭据。
- `cli/services/legacy-data.ts`（新）：首次在 kito 数据根启动且无
  `ktai-identity.json` 时，从 legacy opencode 数据根（兄弟叶目录优先，其次
  `~/.local/share/opencode` 兜底 dedupe）**复制** Kito 自有文件
  `ktai-identity.json`、`ktai-api-key.json`、`ktai-models.json`、
  `ktai-spendable.json`、`soft-quota.json`（0600）。**只复制不移动**，
  不迁移 `opencode.db`/`storage/`/`auth.json`/config——升级用户保留身份与
  API 凭据不被登出，但会话历史/数据库是干净新库（刻意取舍，避免双写分歧）。
  官方 opencode 目录只读不写。
- `cli/server-process.ts`：processEffect 在取得 Global.Service 后、chdir 前调用
  迁移（service/default/stdio 全模式）；失败只告警不阻断启动。
- `cli/server-process.ts` 端口兜底：managed service 的 channel 默认端口被
  **非己方注册**占用时（老版 kito 守护、官方 opencode 服务、或无关进程），
  recognizeIncumbent 失败后回退临时端口（launch(0)），注册文件照常广播真实
  url；显式 `--port`/`service set port` 仍硬报错。否则升级后老守护（注册在
  `state/opencode/`）占死默认端口会让新 sidecar 永远 EADDRINUSE 起不来。
- `tui/mini/variant.shared.ts` 注释同步 `~/.local/state/kito/model.json`。

**不改**：KTAI_IDENTITY_TOKEN 等环境注入路径不变；OPENCODE_EMBEDDED 判定不变；
sidecar 二进制名 `opencode-cli`、basic-auth 用户名 `opencode`、debug zip 名、
WSL 上游安装 URL、`~/.opencode` 官方二进制布局均为发行/协议标识，不属于数据目录。

**验证**：cli `bun test` 211/211（含 legacy-data 7 例 + service 21 例，新增
「外部占用默认端口回退临时端口」用例）；util 23/23；desktop src/main 58/59
（唯一 fail 为 `node:sqlite` 在本机 bun 1.3.11 下的预存在环境问题，repo 钉
1.3.14）；core ktai 相关全绿，全量 1934 pass，10 fail 均为 gh-guard 拦
git push / 缺 `@ai-sdk/xai` / provider-opencode 测试自身 gate 逻辑缺陷等
预存在问题，与本次改动无关。tsgo -b：cli/util/client/desktop/tui 全 0。

**风险/取舍**：升级用户不掉登录（ktai 凭据文件已复制），但会话历史留在旧
opencode.db 不可见（新库全新）；运行中的旧版守护进程保留在 opencode 注册名下
直到重启/注销，期间占默认端口——新 sidecar 走临时端口不受影响。

---

## K. PR 合规坑（2026-09-18 实踩，记给后续）

- 本仓 issue-compliance bot 校验 PR body 必须匹配 `dev` 分支
  `.github/pull_request_template.md` 的 6 段式（Issue for this PR /
  Type of change / What does this PR do / How did you verify your code
  works / Screenshots / Checklist）。不匹配 → `needs:compliance` 标签
  + 2 小时窗口 → **自动关单**（PR #105 因此被关过一次）。
- gh-guard 的 7 段模板与该仓模板冲突：先用 gh-guard 模板过创建闸，
  再 `gh pr edit` 换成仓库模板，pr-standards 检查即认账。
- 模板警告"大段明显 AI 生成描述会被 IGNORED/CLOSED"——body 写紧凑。
- 手动挂 Development 侧栏（齿轮 → Link an issue）= Closes 等价，
  合并自动关单，不是"仅展示"。
- CI runner：`blacksmith-4vcpu-ubuntu-2404` 池 2026-09-18 长时间无
  可接任务（main 的 triage/duplicate-issues 同样排队），GitHub 托管
  runner 正常；queued ≠ 代码失败。

---

## L. Issue #114 隔离与安全加固（2026-09-19，fix-114-isolation）

目标：Kito 不再与上游 OpenCode 共享身份、配置、数据库、Chromium userData、
协议处理、凭据、日志与更新行为；不可被上游静默替换或跨产品泄漏秘密。

### A. CLI 上游更新器停用
- `cli/src/services/updater.ts`：Kito 构建（`OPENCODE_CLI_NAME` 未设/以
  `opencode2` 开头）跳过 update.opencode.ai 检查与 `opencode.ai/v2/install`
  安装路径，日志标记 `kito-build`；留 TODO 待接 Kito 更新 feed。

### B. 桌面身份与 userData 隔离
- `desktop/lifecycle/environment.ts`：appId 改为 `cc.ktapi.desktop{,.dev,.beta}`；
  `app.setPath("userData")` 随之隔离；`setAsDefaultProtocolClient("ktai")` +
  保留 `opencode` 兼容注册。
- `electron-builder.config.ts` / `copy-metainfo.ts` / 旧版
  `opencode-desktop.desktop` 启动器全部改 Kito 目标
  （`/opt/Kito/cc.ktapi.desktop`）；打包测试同步更新。
- 旧共享 userData 刻意不迁移（只有窗口状态与权限，本不该共享）。

### C. OPENCODE_* 环境变量隔离
- 新增 `util/src/kito-env.ts`：`kitoEnv()` = KITO_ 优先 + OPENCODE_ 兼容
  回退（安全开关）；`kitoDataEnv()` = 仅 KITO_（一切路径/文件选择器，
  上游 OPENCODE_* 不得重指 Kito 的库与二进制）。
- 全仓数据路径变量走 kitoDataEnv（CONFIG_DIR/DB/CONFIG/CONFIG_CONTENT/
  MODELS_PATH/TEST_HOME/资产与 wasm 覆盖/KTAI_SPENDABLE_PATH 等）；
  安全开关走 kitoEnv 双名（CLIENT/DISABLE_*/LOG_LEVEL/CPU_PROFILE 等）。
- `desktop/service/shell-env.ts` 过滤导入的 KITO_*/OPENCODE_* 与宿主凭据。
- `cli/services/standalone.ts`：子进程 env 同时写 KITO_PASSWORD +
  OPENCODE_PASSWORD——修复 extendEnv 下宿主 KITO_PASSWORD 抢先于
  OPENCODE_PASSWORD 遮蔽租约凭据的问题。
- Effect Config 读（model-request 等）用 `Config.orElse` 双名等价。

### D. 凭据文件 0600
- `core/ktai/newapi.ts`：`ktai-api-key.json`/`ktai-spendable.json` 写后
  `chmod 0600`（含修复已存在的宽松文件）；`auth.json` 同样修补。
- `core/ktai/identity.ts`：`ktai-identity.json` 写后 chmod 0600。

### E. 日志脱敏
- `server/src/process.ts`：自研 request logger 替代默认 logger——查询串
  中 token|secret|password|key 类参数值置 `REDACTED`，其余参数保留；
  只记录 4xx/5xx，保持原有错误语义。
- `cli/src/util/process.ts` 新增 `redactArgs()`（-H/--header/--prompt/
  --token/--password/--api-key/--auth-token/--data/--param 值置
  `<redacted>`），index.ts 启动与失败日志、mini-host trace 统一使用。

### F. ktai:// 深链
- desktop 注册 `ktai` + 保留 `opencode`；second-instance argv 双协议过滤；
  app `parseUrl` 双协议解析；打包三通道 protocols 均为 `[ktai, opencode]`。

### G. 身份过期时间不再杜撰
- `identity.ts` `asSession`：服务端未给 expiresAt 时不再编造 +1h；
  `sessionExpiresAt` 缺省仅在运行时返回估算（Credential.expires 必填），
  不落盘；`persistIdentityToken/Session` 只写实有值；
  `readPersistedIdentityToken` 无 expiresAt 视为有效、仅拒绝真实过期；
  新增 `KITO_KTAI_IDENTITY_PATH` 覆盖供测试/部署。
- `provider/ktai.ts`：真实 expiresAt 经 credential.metadata 传递，
  持久化只写服务端实值。

### H. 面向用户文案去 OpenCode 化
- CLI：`commands.ts` 程序名 opencode2 / "Kito command line interface"，
  描述文案改 Kito；`default.ts`/`service-config.ts`/`pair.ts` 错误与
  用法提示改 Kito 或 `selfCommand()`；`update-preflight.tsx` 阶段文案改
  Kito；console/login.ts "Connecting to OpenCode..." → Kito。
- TUI：error-component 崩溃页与 issue 链接指向 ktaiorg/kt-opencode；
  dialog-pair/mini/splash/footer/util-error 文案改 opencode2/Kito；
  app.tsx "Open docs" 指向 fork 仓库。
- app：四处 `opencode.ai/docs/*` "learn more" 链接与
  dialog-custom-provider 文档链接指向 fork 仓库；
  `context/highlights.tsx` CHANGELOG_URL 置空（Kito 无公开 changelog
  feed，防止拉取展示上游 release notes，留注释待接 Kito feed）。
- desktop i18n：`desktop.updater.none.message` 与
  `desktop.updater.downloaded.prompt` 英文源改 Kito；62 个非英语 locale
  中陈旧 OpenCode 译文删除走英文兜底（符合本仓本地化约定）。
- WSL 安装器：`wslCliInstallCommand` 改指 fork 仓库
  `ktaiorg/kt-opencode/main/install`；无 bundled binary 时显式抛错，
  不再从上游 npm 拉 `@opencode-ai/cli`（修自我替换风险；代价是打包版
  桌面在 WSL 安装按钮会失败，待 Kito 自带 CLI feed 或随包 Linux 二进制）。

**不改（有意保留）**：`opencode.db` 文件名、`auth.json`、`opencode.json`
配置名、basic-auth 用户名 `opencode`、`x-opencode-*` 协议头、
`opencode` 集成/provider id、OpenCode Console/Zen 产品名引用、
storage key 命名空间（`opencode.*`，改名会丢存量数据）、legacy 日志只读
回收路径、compile-time 常量（OPENCODE_VERSION/CHANNEL/CLI_NAME）、
OPENCODE_DRIVE/STORY 等 dev 工具 env、simulation `opencode-drive` state 目录。

### 测试
- desktop：electron-builder 8 + wsl servers 7（含新「拒绝上游安装」用例）
  + shell-env 10 = 25 pass；`bun typecheck` 0。
- app：helpers 43 pass（ktai:// 覆盖）；typecheck 0。
- core：ktai 5 文件 + config = 84 pass（新增 expiresAt 缺失/畸形/过期、
  0600 修补用例）；`bun typecheck` 仅预存在 `@ai-sdk/xai` 声明缺失
  （test/provider-xai-responses.test.ts，未触碰，core package.json 未声明）。
- server：process/auth/request-tracing/log-leak = 5 pass；typecheck 0。
- cli：argv-redact 新 2 + service 21 + env + standalone = 25 pass；
  typecheck 0。util/tui typecheck 0。

### 未完成/后续
- Kito 无自有 CLI/desktop 更新 feed：CLI 更新器整段跳过、app release
  highlights 停用、打包版 WSL 安装会显式失败——待 feed 落地后逐项恢复。
- `install` 脚本本体仍是上游内容（下载 `@opencode-ai/cli` npm 包），
  仅 `--binary` 路径安全；接入 Kito 分发渠道前勿用于版本安装。
- OPENCODE_DRIVE/STORY dev env 保留原名（文档既有接口），未加 KITO_ 别名。

---

## 追加实施：Issue #114 Kito/OpenCode 隔离与凭据安全（分支 fix-114-isolation）

工作树 `/Users/fuwuqi/kito-pr-iso`，基于 origin/main 的 `fix-114-isolation` 分支。

### A/P0 CLI updater 禁用
- `packages/cli/src/services/updater.ts`：Kito 构建（`OPENCODE_CLI_NAME` 未定义或
  `opencode2*`）在 `check()` 入口直接返回，不再触达
  `update.opencode.ai`、`@opencode-ai/cli` 或 `opencode.ai/v2/install`。
  TODO 注明重开前需接 Kito 自有 feed。
- `packages/desktop/src/main/wsl/runtime.ts`：无内置二进制时拒绝版本安装
  （原会从 anomalyco/opencode 拉上游包）；安装脚本指向 ktaiorg/kt-opencode。

### B/P0 桌面运行时 ID / userData
- `electron-builder.config.ts`、`lifecycle/environment.ts`、`copy-metainfo.ts`、
  `resources/linux/opencode-desktop.desktop`：appId/userData 根改为
  `cc.ktapi.desktop[.dev|.beta]`；旧的共享 `ai.opencode.desktop` userData
  不迁移（只含窗口状态与权限）。

### C/P0 环境变量集中化
- 新增 `packages/util/src/kito-env.ts`：`kitoEnv`（KITO_* 优先、OPENCODE_* 兼容）
  与 `kitoDataEnv`（仅 KITO_*，用于一切数据/路径变量）。
- 数据根 leaf 由 `opencode` 改为 `kito`（`util/global.ts`），`OPENCODE_TEST_HOME`
  → `KITO_TEST_HOME`。
- DB/CONFIG*/MODELS_PATH/KTAI_*_PATH/SOFT_QUOTA_PATH/PARCEL_WATCHER_PATH/
  PHOTON_WASM_PATH/NODE_PTY_PATH/TREE_SITTER_*/NODE_ASSETS_DIR/FFF_FFI_PATH/
  GIT_BASH_PATH/ZED_DB/KTAI_SPENDABLE_PATH/SIMULATE 等全部走 `kitoDataEnv`。
- `vite.node.config.ts` bundle prelude 改为写 `KITO_*` 资产变量。
- desktop `shell-env.ts`：登录 shell 导入同时屏蔽 `KITO_*` 与 `OPENCODE_*`；
  desktop 写双命名空间仅为兼容（CLIENT/EXPERIMENTAL_*）。
- `cli/env.ts`：`KITO_PASSWORD`/`KITO_SERVER_PASSWORD` 优先并同样从 session env 剔除。
- `script/src/index.ts`：发布脚本 KITO_* 优先（BUMP/VERSION/CHANNEL/RELEASE）。

### D/P1 凭据文件 0600
- `newapi.ts` persistManagedApiKey、`identity.ts` persistIdentityToken、
  `clearManagedApiKey` 的 auth.json 重写、spendable cache 写入后均 `chmodSync 0600`，
  修复已存在宽松权限文件；含修复性测试。

### E/P1 日志脱敏
- `server/src/process.ts`：`redactUrl` 将 token/secret/password/key 类查询参数值
  替换为 REDACTED（保留安全参数），替换原 HttpMiddleware.logger 仅 4xx/5xx 输出。
- `cli/util/process.ts` 新增 `redactArgs`：`--prompt/--token/--password/--api-key/
  --auth-token/--header/--data/--param`（含 `=` 形式）写日志/诊断前打码；
  `index.ts`、`mini-host.ts` argv 记录全部接入。

### F/P1 双 scheme 深链
- electron-builder protocols、`lifecycle/index.ts` second-instance argv、
  `app/.../deep-links.ts` 解析同时接受 `ktai://` 与 `opencode://`；
  helpers.test 增补 ktai 用例 + 畸形链接安全用例。

### G/P0 不再虚构 expiresAt
- `IdentityBearerSession.session.expiresAt` 改可选；`asSession` 不再编造 +1h。
- `sessionExpiresAt` 仅在内存为必填的 Credential.OAuth.expires 给估算值；
  `plugin/provider/ktai.ts` 仅持久化服务端真实 expiresAt（经 metadata 传递）。
- `readPersistedIdentityToken` 仅拒绝"有效且已过期"的时间戳；无 expiresAt 的
  token 重启后仍有效。

### H/P2 用户面命名
- CLI usage/描述/用法错误经 `selfCommand()` 输出 `opencode2`；ACP agentInfo.name、
  terminal-auth、登录提示改 `Kito`/`opencode2`；TUI `/exit`、crash 屏、mini
  splash、pair 提示等文案改 Kito/opencode2。
- app：`opencode.ai` 文档/更新日志链接替换为 ktaiorg/kt-opencode；changelog
  feed 置空（Kito 无自有 feed 前不再拉取上游 release notes）。
- desktop i18n：en 两条 updater 文案改 Kito；其余 60+ 语言删除同名过期译文，
  走英文兜底（符合 i18n 规范：不留指向旧产品名的译文）。

### 验证结果
- typecheck：util / cli / server / desktop / tui / app / enterprise 全部 0 错误。
  core `tsgo -b` 仅余 `test/provider-xai-responses.test.ts` 缺 `@ai-sdk/xai`
  声明——该测试文件在 HEAD 未改动且包未声明于 core/package.json，属预存在问题。
- 测试：cli service 21/21（含 1 处期望文案改 `service set port`）；
  acp 全套 48 pass；auth+mini 20 pass；argv-redact/env/updater/legacy-data/
  mini-host/node-assets 29 pass；debug-config 2 pass；core ktai 48 pass +
  config 35 pass；app helpers+build-prompt 43 pass；desktop 18 pass；
  server log-leak/process/request-tracing 4 pass；tui 抽样 32 pass。
- 新修测试：electron-builder 各 channel 期望 `["ktai","opencode"]`；
  identity 新增"无 expiresAt 仍有效 + 0600"两例；newapi 新增 0600 修复例；
  shell-env 增补 KITO_* 屏蔽断言；servers.test 新增拒绝上游版本安装例；
  acp command/initialize-auth 期望改 Kito；service.test 端口冲突提示断言放宽到
  `service set port <port>`（selfCommand 前缀）。

### 未解决/说明
- core typecheck 的 `@ai-sdk/xai` 缺失为预存在环境/依赖声明问题，非本次引入。
- `packages/web` 文档站仍为上游 OpenCode 文档内容，不在本 issue 范围。
- 内部 wire/协议标识（`x-opencode-*` 头、basic-auth 用户名 `opencode`、
  `opencode.*` 命令 ID、主题名、provider id、`ai.opencode` 兼容常量）按规范保留。
## Issue #114 钱包与登录 UX 修复（2026-09，worktree kito-pr-wallet @ fix-114-wallet）

审计确证的 P1/P2 缺陷，逐项修复：

### A【P1】充值 pay() 网络异常永久卡死按钮
- `dialog-kt-wallet.tsx` `pay()`：fetch reject 走不到 `setPaying()`/`setPayError`
  → 两按钮永久 disabled。改 try/catch/finally：catch 置
  `dialog.ktWallet.fiatError`，finally 复位 `paying`。
- `checkOrder` 补 `.catch`（setInterval 每 2s 漏 unhandled rejection；
  "I've paid" 按钮的 `.finally` 也因此不再卡死）。

### B【P1】订单轮询无总期限 + 慢上游重叠
- 轮询加绝对期限：订单本地建单起 15 分钟（`ORDER_POLL_LIMIT_MS`，
  `KtpayOrder.createdAt`），超时显示 `dialog.ktWallet.expired` 并清订单回表单。
- `inflight` 门闩：上一 tick 未完成的请求跳过本轮，慢上游不再堆积并发。
- 终态判定去掉 `response.ok` 前提：响应体明确写出
  failed/expired/cancelled/canceled（localStatus 优先）即终止轮询；
  无终态字段的 502 仍按瞬态处理、由期限兜底。

### C【P1】余额 inflight 吞强制刷新 + 无超时
- `kt-signed-in.ts` `createAccountReader`：`/ktai/account` fetch 加
  `AbortSignal.timeout(30s)`（上游 Ensure 串行最坏 60s+，socket 挂起曾使
  inflight 永真）；inflight 期间的 force 刷新（入金 markPaid、登录成功）
  排队最新一次，当前请求落地后立即追跑。

### D【P1】`useKtaiSignedIn` 非 2xx 一律判未登录
- `/ktai/credential` 非 2xx 不再置 `signedIn=false`：仅 401/403 判 false，
  其余（5xx/404 等）保留上次判定——与 account 读取器 4xx/5xx 口径一致，
  本地服务故障不再把钱包闪成"需登录"。

### E【P1】加密入金 baseline 漏检已到账
- ledger 基线改为与 deposit-address 请求并发发出（"地址获取时点"的已知
  余额），存 `ledgerBaseline` signal；到账检测轮询只比较 `ledger > baseline`，
  基线未回前用首次成功读数兜底。原首次 tick 读数即基线，提前到账永不成立。

### F【P1】OAuth attempt 消失生错误直出
- `core/integration.ts` `oauth.status`：attempt 不明（服务端重启/已清理/
  已取消后继续轮询）由 `Effect.die` 改为返回 `{status:"expired"}`——
  `Integration.AttemptStatus` 既有合法值，协议契约不变、无需重新生成 client。
- `dialog-kt-identity-login.tsx`：expired 分支从笼统 `common.requestFailed`
  改走新键 `dialog.ktIdentity.expired`（"This sign-in request expired.
  Try again."，仅 en，其它语言走兜底）。

### G【P2】登录成功 + ensure 失败双 toast
- `finish()` 合并为单条 success toast：ensure 成功用原 connected 描述，
  失败把 `dialog.ktIdentity.ensureFailed` 警示放进同一条描述。

### H【P1】会话 not-found 只报错不兜底
- `session.tsx` `SessionErrorFallback`：not-found 时若持久化 `tabs.info`
  存有原目录，自动关死标签 + 在同目录 `newDraft` 草稿会话标签并导航过去；
  目录未知时保留原"cannot be found"+Close Tab UI。

### I【P2】`isKtaiProviderID`/`isCustomerFacingProvider` startsWith 过匹配
- 收窄为 `"ktai"`/`"ktapi"` 全等 + `"ktai-"`/`"ktapi-"` 前缀
  （与 `customerFacingProviderName` 既有口径对齐），裸 startsWith("ktai")
  不再把 ktai 开头的无关 provider 误吸。

## 验证（Issue #114）
- `cd packages/app && bun test`：559 pass / 6 fail——fail 均为
  `solid-js/web/dist/server.js` "Export named 'use' not found" SSR 环境
  SyntaxError（terminal/comments/prompt-state/submit 等），已在未改动
  基线 stash 复现，为 bun 1.4.2 预存在环境问题，与本次无关。
- `cd packages/core && bun test test/integration.test.ts`：12/12 pass。
  core 全量 1906 pass / 10 fail（RepositoryCache/Git 网络克隆 +
  OpencodePlugin 外部服务，均为预存在环境问题）。
- `bun typecheck`：app 干净；core tsconfig.json 干净，
  tsconfig.tests.json 仅 `@ai-sdk/xai` 预存在缺依赖报错。
- bun.lock 因本机 npmmirror registry 产生的 URL 噪声未提交（已 checkout 还原）。
- 后续补充：`test(app)` 增加 `isKtaiProviderID`/`isCustomerFacingProvider`
  边界用例与 `oauth.status` 未知 attempt → expired 回归（`ca6905d`）；
  `fix(core)` 将 `provider-xai-responses.test.ts` 引用的 `@ai-sdk/xai`
  声明为直接依赖（`9881387`），修复上文记录的预存在缺依赖 typecheck
  报错（pre-push turbo 缓存未命中时必现）。
