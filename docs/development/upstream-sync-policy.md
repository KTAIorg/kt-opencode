# OpenCode 上游同步策略

## 仓库关系

- `origin`：`KTAIorg/kt-opencode`
- `upstream`：`anomalyco/opencode`
- 稳定主线：`main`
- 当前上游基线：`upstream/beta`（OpenCode V2）
- 不要使用过期的 `origin/beta`（可能仍是 1.x）

`main` 必须始终保留与 OpenCode 官方仓库的共同祖先。禁止通过 ZIP、删除 `.git`、Squash 全量导入或覆盖目录的方式更新上游代码。

Kito 产品线已切到 OpenCode V2 beta。同步时从 `upstream/beta` 拉取，再把 Kito 页面和定制功能重新应用到 V2 包结构（`packages/core`、`packages/server`、`packages/protocol`、`packages/app`、`packages/cli`）。`packages/opencode` 在 V2 中已移除。

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

1. 获取官方分支：`git fetch upstream beta`。
2. 从最新 `upstream/beta` 开工作分支，不要把 `upstream/beta` 直接 merge 进旧的 1.x 工作区。
3. 将白名单定制移植到 V2 API（Plugin Effect、Protocol HttpApi、Client generate）。
4. 冲突处理优先级：安全修复以上游为准、已上游化的 Patch 删除、Kito 白名单定制重新应用、纯格式变化以上游为准。
5. 运行 `packages/core` / `packages/app` 的 Kito 测试和 `bun typecheck`。
6. 通过 PR 合入 `main`，禁止直接推送。

## 版本与 Release

- `KTAI_VERSION` 保存 Kito 产品的 `major.minor` 基线。切到 V2 beta 是上游线切换，不自动抬这个号。
- PR 构建使用 `0.0.<workflow run number>`，只上传 Actions Artifact，不创建 GitHub Release。
- `main` 每次成功构建使用 `<major>.<minor>.<workflow run number>`，并自动创建 GitHub 正式 Release 且标记为 Latest。
- 安装包文件名必须包含 Kito 产品版本。
- Release 必须包含 Windows x64、macOS Intel、macOS Apple Silicon 安装包和 `SHA256SUMS`。
- Release 创建成功后，自动创建或更新同版本测试需求 Issue，关联合并 PR、Closing Issues、安装包和 `KT主系统 Issue 看板` 的 `KT测试组` 模块。

Kito 发布 Tag 使用：

```text
ktai-v<产品版本>-opencode-v<上游版本>
```

禁止创建与 OpenCode 官方冲突的裸 `vX.Y.Z` Tag。`main` 只发布正式 Release；当前安装包未签名，Release Notes 必须明确标注 Windows 代码签名、Apple Developer ID 签名和 macOS 公证风险。

## 同步频率

- 安全修复：立即评估并同步。
- 官方 `beta` 推进：按产品需要拉取并重放白名单定制。
- 最低要求：每月完成一次上游差异审计。
