---
name: kito-release
description: This skill should be used when the user asks to "Kito 发版", "Kito release", "register kito artifacts", "Kito rollout 0", "tag 发布 Kito", "Release Service kito app", or when tagging Kito desktop, registering GitHub Release assets into KT Release Service, or publishing rollout 0. Do not use for kt-desktop / KT CLI component releases.
version: 1.0.0
category: 平台服务
status: active
last_verified: 2026-08-20
metadata:
  kt:
    related_skills:
      - kt-release-service
      - cicd-workflow-naming
      - cicd-pipeline-structure
      - kt-cli-component-hygiene
      - oss-fork-maintenance
    handoff_to:
      - kt-release-service
---

# Kito 发版

对外产品名是 **Kito**。仓库仍是 `KTAIorg/kt-opencode`。不要把 OpenCode、ktapi、KTAI 写进客户发版文案。

Release Service **已经有** app `kito`。复用它，不要再造 `kt-opencode` / `opencode` 第三条线。

## 何时用

- 给 Kito 桌面打 `v*` tag、注册 GitHub Release 产物、`rolloutPercent=0` 发布
- 查为什么客户端还在走 GitHub、为什么 `kt component` 口径不适用于 Kito
- 改 `.github/workflows/release-kito.yml` 或 `packages/desktop/scripts/kito-release.ts`

不要用来做 **kt-desktop（拓客）**、**KT CLI 组件**、或 skill catalog 发布。那些走 `kt-release-service` / `kt-cli-component-hygiene`。

## Hard Rules

1. **只打 tag 才发。** 不要在 `dev` / `main` 普通 push 上跑生产注册。不要打开上游 `publish.yml`（它只服务 `anomalyco/opencode`，还会发 npm / AUR）。
2. **CI 只许 `rolloutPercent=0`。** 禁止移植 `KT_DESKTOP_AUTO_FULL_RELEASE=true`。100% 必须人批，走 `kt-release-service`。
3. **先核字节再注册。** 本机/CI 对每个安装包算 size、sha256 hex、sha512 base64。`signatureStatus` 默认 `unknown`。
4. **不要打印 token。** `KT_RELEASE_SERVICE_ADMIN_TOKEN` 来自 GitHub secret / KTSecret `kt-release-service` `/runtime/`。
5. **不要自动 promote。** 灰度 / 白名单 / `confirmHighRisk` 全是人工步骤。

## 现行流水线

```text
GitHub tag vX.Y.Z + Release 资产
  -> release-kito.yml 下载资产
  -> bun packages/desktop/scripts/kito-release.ts register
  -> 复用 app kito
  -> create draft + register artifacts + publish rollout 0
  -> 人在 release-admin.ktyun.cc / kt release 放量
```

客户端：Release Service 还没有公开 history 时继续 GitHub；history 已有版本后，`no_update`（含 rollout 0）必须停住，不许再回落到 GitHub 绕过灰度。

详细 payload、产物映射、命令见 [references/register-publish-0.md](references/register-publish-0.md)。

## 相关

- 控制面通用规则：`kt-release-service`
- 拓客 Windows / CDN：`kt-desktop-watchdog-cdn-refresh`
- Fork 定制边界：`oss-fork-maintenance`
