# OpenCode 上游同步策略

## 仓库关系

- `origin`：`KTAIorg/kt-opencode`
- `upstream`：`anomalyco/opencode`
- 稳定主线：`main`
- 当前上游基线：`v2.0.27`（OpenCode V2 稳定版，commit `1f4d07a4a519185955ae8ab2ea3607805509e386`，2026-10-13 核实）
- 不要使用过期的 `origin/beta`（可能仍是 1.x）

`main` 必须始终保留与 OpenCode 官方仓库的共同祖先。禁止通过 ZIP、删除 `.git`、Squash 全量导入或覆盖目录的方式更新上游代码。

Kito 产品线基于 OpenCode V2 稳定版。同步时选取官方 `v2.*` 稳定标签，在当前 `main` 上合并完整上游历史，并适配 Kito 页面和定制功能到 V2 包结构（`packages/core`、`packages/server`、`packages/protocol`、`packages/app`、`packages/cli`）。`packages/opencode` 在 V2 中已移除。

## Kito 定制白名单

允许长期维护的定制范围：

1. Kito 品牌、窗口标题、wordmark、应用标识和安装包命名。对外名称永远是 Kito，不展示 OpenCode / ktapi / ktai。
2. Kito Provider（`packages/core/src/plugin/provider/ktai.ts`）、公开模型目录和托管密钥接入。
3. KT Identity Telegram 登录、`/ktai/*` 账户与钱包路由、标题栏登录/充值页。
4. Zen 本地软配额和会话错误 CTA。
5. Windows、macOS 桌面构建及组织发布流程。
6. Kito 专属配置、文档和测试。

通用 Bug 修复优先提交 OpenCode 官方；上游已经实现的能力应删除本地 Patch。

## 同步流程

1. 查询 `@opencode/cli` 的 npm `latest` 并核对官方 `v2.*` 标签；不选 `dev` / `beta` 分发标签。
2. 获取已核实标签：`git fetch upstream tag v2.0.27 --no-tags`。
3. 从最新 `origin/main` 创建隔离工作分支，执行 `git merge --no-ff <官方标签>`。保留 merge commit 的两个父提交；禁止 squash 丢弃上游祖先。
4. 将白名单定制移植到 V2 API（Plugin Effect、Protocol HttpApi、Client generate）。
5. 冲突处理优先级：安全修复以上游为准、已上游化的 Patch 删除、Kito 白名单定制重新应用、纯格式变化以上游为准。
6. 运行 `packages/core` / `packages/app` 的 Kito 测试和 `bun typecheck`。
7. 通过 PR 合入 `main`，禁止直接推送。

## 版本与 Release

- `KTAI_VERSION` 保存 Kito 产品的 `major.minor` 基线。同步 V2 稳定版是上游框架升级，不自动抬这个号。
- PR 构建使用 `0.0.<workflow run number>`，只上传 Actions Artifact，不创建 GitHub Release。
- `main` 每次成功构建使用 `<major>.<minor>.<已发布版本计数>`，并自动创建 GitHub 正式 Release 且标记为 Latest。
- 安装包文件名必须包含 Kito 产品版本。
- Release 必须包含 Windows x64、macOS Intel、macOS Apple Silicon 安装包和 `SHA256SUMS`。
- Release 创建成功后，自动创建或更新同版本测试需求 Issue，关联合并 PR、Closing Issues、安装包和 `KT主系统 Issue 看板` 的 `KT测试组` 模块。

Kito 发布 Tag 使用：

```text
kito-v<产品版本>
```

上游 OpenCode 版本记录在 Release 正文（构建信息），不进 Tag。禁止创建与 OpenCode 官方冲突的裸 `vX.Y.Z` Tag。`main` 只发布正式 Release；当前安装包未签名，Release Notes 必须明确标注 Windows 代码签名、Apple Developer ID 签名和 macOS 公证风险。

## 同步频率

- 安全修复：立即评估并同步。
- 官方 `v2.*` 稳定版发布：按产品需要拉取并重放白名单定制。
- 最低要求：每月完成一次上游差异审计。

## V2 2.0.27 的接缝

- 工作区 npm 包名为 `@opencode/*`，框架要求 Bun `1.4.2`；不要把仍由官方发布的 `@opencode-ai/pty` 改名。
- Kito Provider 使用 `ctx.provider.transform` 与 `ctx.model.transform`；原 `ctx.catalog` 已由上游移除。
- Kito 账户按钮通过 `TitlebarRight` 注册；默认项目调用使用上游 typed Electron IPC。
- `docs/api/openapi.yaml` 是 Kito HTTP+JSON 接口契约。修改 Protocol 后依次执行 `packages/protocol` 的 `generate`、`packages/client` 的 `generate` 和根目录 `sync:kito-contract`。
- 数据、配置、缓存、服务注册继续位于 Kito 自己的 XDG 目录；托管 NewAPI 密钥与 KT Identity OAuth 分离。
- 桌面更新器由 `packages/gui-extensions/src/updater` 拥有。必须先请求 Kito Release Service 的版本分配，再读取 `kito-v<targetVersion>` 的不可变 GitHub 清单；不得使用 OpenCode 官方源、KT Desktop 的 legacy feed 或绕过灰度的 Latest。安装设备 ID 存于 updater 的 main store，更新器禁止降级。
- `kito-v2.1.18` 打包了错误的官方更新源，已经安装该版本的设备需要一次手动安装修复版；服务端无法修改已安装包的 `app-update.yml`。macOS 原生自动安装还需要 Apple Developer ID 签名：未签名产物显示 Kito 安装包下载提示，签名状态经独立验证为 `signed` 后才使用原生路径。Windows 签名构建会将 publisherName 写入 app-update.yml 并验证更新签名。
- 已缓存更新也必须在安装时重新取得分配；hold/暂停清除 ready，网络失败中止安装。关闭退出时自动安装，避免绕过最后的分配检查。
- 升级后的“新功能／发行说明”从 Kito Release Service 的 `/api/v1/apps/kito/releases/history` 读取，按界面语言和发布通道取数，只展示上次已见版本之后、当前已安装版本以内的 Kito 记录；禁止读取 OpenCode 官方 changelog。
- 新版本先以 rollout 0 登记，给验证设备配置白名单，用 `Verify Kito Updater` workflow 运行实际 Electron 检查和下载，通过后再放量。该验证使用隔离 profile，不改用户正在运行的客户端。
- 合入 `main` 会自动发布安装包，合入前需完成质量门禁并取得发布授权。

## 已退役的旧 Patch

- 旧的全局 `http.body` 协议字段 denylist 不适用于当前框架：新版原生提供商正式使用 body overlays 覆盖部署名、生成参数、工具控制和结构化输出配置。HTTP 传输采用官方 V2 行为，参数由调用方拥有的路由/模型配置决定。保留诊断凭据脱敏、Kito 托管密钥隔离、配置路径隔离与子进程凭据过滤。
- 旧 Promise codegen 禁止 binary / 尾部 wildcard 的断言已由新版真实二进制请求测试替代；具名类型不再要求展开成匿名类型。
- Node SEA 资源变量与读取方统一使用 `KITO_*`，构建声明使用现有 `@types/bun` 的 `bun` 名称。
