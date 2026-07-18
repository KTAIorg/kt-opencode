# OpenCode 上游同步策略

## 仓库关系

- `origin`：`KTAIorg/kt-opencode`
- `upstream`：`anomalyco/opencode`
- 稳定主线：`main`
- 同步缓冲分支：`upstream-sync`
- 上游开发分支：`upstream/dev`

`main` 必须始终保留与 OpenCode 官方仓库的共同祖先。禁止通过 ZIP、删除 `.git`、Squash 全量导入或覆盖目录的方式更新上游代码。

## KTAI 定制白名单

允许长期维护的定制范围：

1. KTAI 品牌、应用标识和安装包命名。
2. KTAI Provider、公开模型目录和运行时密钥接入。
3. Windows、macOS 桌面构建及组织发布流程。
4. KTAI 专属配置、文档和测试。

通用 Bug 修复优先提交 OpenCode 官方；上游已经实现的能力应删除本地 Patch。

## 同步流程

1. 获取官方 Release Tags：`git fetch upstream --tags`。
2. 将 `upstream-sync` 重置到最新 `main`，并合并目标稳定 Tag。
3. 不直接追逐 `upstream/dev`：`git merge v1.19.0`。
4. 冲突处理优先级：安全修复以上游为准、已上游化的 Patch 删除、KTAI 白名单定制重新应用、纯格式变化以上游为准。
5. 运行 Provider 测试、类型检查和 Windows/macOS 构建。
6. 通过 PR 合入 `main`，禁止直接推送。

## 版本与 Release

- `KTAI_VERSION` 保存 KTAI 产品的 `major.minor` 基线。
- PR 构建使用 `0.0.<workflow run number>`，只上传 Actions Artifact，不创建 GitHub Release。
- `main` 每次成功构建使用 `<major>.<minor>.<workflow run number>`，并自动创建 GitHub Pre-release。
- 安装包文件名必须包含 KTAI 产品版本。
- Release 必须包含 Windows x64、macOS Intel、macOS Apple Silicon 安装包和 `SHA256SUMS`。
- Release 创建成功后，自动创建或更新同版本测试需求 Issue，关联合并 PR、Closing Issues、安装包和 `KT主系统 Issue 看板` 的 `KT测试组` 模块。

KTAI 发布 Tag 使用：

```text
ktai-v<产品版本>-opencode-v<上游版本>
```

例如：

```text
ktai-v1.0.2-opencode-v1.18.3
```

禁止创建与 OpenCode 官方冲突的裸 `vX.Y.Z` Tag。当前安装包未签名，因此自动发布为 Pre-release；完成签名、公证和测试门禁后再建立稳定 Release 流程。

## 同步频率

- 安全修复：立即评估并同步。
- 官方稳定 Release：每个 Release 自动检测并创建同步任务。
- 最低要求：每月完成一次上游差异审计。
