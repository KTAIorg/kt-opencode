> 从 SKILL.md 拆出（2026-08-20）

## App

| 项 | 值 |
|---|---|
| appId | `kito`（已存在，空仓即可复用） |
| displayName | `Kito` |
| supportedPlatforms | `win32`, `darwin`, `linux` |
| defaultChannel | `stable` |
| 管理面 | `https://release-admin.ktyun.cc` |
| 客户端 | `https://updates.ktyun.cc` |

不要创建第三个 app。`kt-opencode` / `opencode` 若已在 RS 里，保持空置。

## 产物映射

GitHub Release 文件名现在是 `kito-desktop-<version>-<os>-<arch>.<ext>`，也接受旧的 `ktai-desktop-*` / `opencode-desktop-<os>-<arch>.<ext>`。

| 文件 | platform | arch | kind |
|---|---|---|---|
| `*-win-x64.exe` | win32 | x64 | installer |
| `*-mac-x64.dmg` / `*-mac-arm64.dmg` | darwin | x64/arm64 | installer |
| `*-linux-x64.AppImage` / `*-linux-arm64.AppImage` | linux | x64/arm64 | installer |
| `*-mac-*.zip` / `*.app.tar.gz` | darwin | … | archive |

跳过：`latest*.yml`、`*.blockmap`、`.deb`、`.rpm`、uninstaller。同一 `platform+arch+kind` 只能有一条；Linux 只注册 AppImage，避免和 deb/rpm 抢 `installer`。

`releaseId = rel_kito_<version_underscores>_stable`  
`artifactId = art_<releaseId>_<platform>_<arch>_<kind>`

下载 URL：`https://github.com/ktaiorg/kt-opencode/releases/download/kito-v<VERSION>/<fileName>`

## CI

仓库：`KTAIorg/kt-opencode`  
Workflow：`.github/workflows/release-kito.yml`（`Release · Kito`）  
触发：GitHub Release published（仅 `kito-v*` tag 的 release）、`workflow_dispatch`。`kito-v*` tag 由 main 流水线（release-desktop.yml）自动创建；release-kito-installers.yml 已改为纯手动恢复路径。
脚本：`packages/desktop/scripts/kito-release.ts`

```bash
bun ./packages/desktop/scripts/kito-release.ts register \
  --version 1.18.3 \
  --tag kito-v1.18.3 \
  --channel stable \
  --repo ktaiorg/kt-opencode \
  --dir /tmp/kito-release-assets
```

幂等 key：

- `kito-<VERSION>-create-release`
- `kito-<VERSION>-register-<platform>-<arch>-<kind>`
- `kito-<VERSION>-publish-rollout-0`

环境变量：

- `KT_RELEASE_SERVICE_ADMIN_BASE_URL=https://release-admin.ktyun.cc`
- `KT_RELEASE_SERVICE_CLIENT_BASE_URL=https://updates.ktyun.cc`
- `KT_RELEASE_SERVICE_ADMIN_TOKEN`（GitHub Actions secret；缺省时 workflow 跳过，不失败）
- `KT_RELEASE_SERVICE_DRY_RUN=1`

CI **不会**读 `KT_DESKTOP_AUTO_FULL_RELEASE`。publish body 固定 `rolloutPercent: 0`，不带 `confirmHighRisk`。

机器/`CI_SERVICE_TOKEN` 可以 create + register，**不能** publish。这条 workflow 需要 admin token 才能落到 rollout 0。

## 本地 dry-run

```bash
cd packages/desktop
KT_RELEASE_SERVICE_DRY_RUN=1 bun ./scripts/kito-release.ts register \
  --version 0.0.0 \
  --dir /tmp/kito-release-assets
```

不要把 token 写进回复、commit 或日志。

## 客户端

`packages/desktop/src/main/updater.ts` 在每次检查时：

1. `GET /api/v1/apps/kito/releases/history?channel=stable`
2. history 空或入口不可达 → 继续 electron-updater GitHub（本 fork）
3. history 已有版本 → `POST /updates/resolve`
4. `update_available` / `force_update` 且有 `feed.baseUrl` → `setFeedURL({ provider: "generic", url })`
5. 其他判定（含 rollout 0 的 `no_update`）→ **hold**，不再回落 GitHub

## 人批放量

回到 `kt-release-service`：

```bash
kt release rollout set --app kito --version <VERSION> --percent 100 \
  --reason "full rollout kito <VERSION> after artifact verification" --confirm
```

100% 必须 `confirmHighRisk`。Kito 没有 Desktop 那种 OSS `download.ktai.im` 默认路径；字节在 GitHub Release，控制面在 RS。
