# Kito / OpenCode 2.0.27 升级验收

2026-10-13（Asia/Shanghai）。官方稳定标签 `v2.0.27`，提交 `1f4d07a4a519185955ae8ab2ea3607805509e386`。框架包版本 2.0.27，Bun 1.4.2，Kito 产品版本线仍为 `KTAI_VERSION` 2.1。

## 本机验证

环境：macOS Apple Silicon，Bun 1.4.2，现代 Bash 5.3 与系统 ripgrep。测试通过 core 的隔离脚本运行；使用临时 HOME、XDG 和 KITO 数据目录。

| 检查 | 结果 |
| --- | --- |
| 全仓 `bun turbo typecheck --concurrency=3` | 36/36 包通过 |
| `packages/core`：`bun run test` | 6696 通过，43 跳过，0 失败 |
| `packages/app`：`bun run test:unit` | 791 通过，0 失败 |
| `packages/app`：`bun run test:browser` | 175 通过，0 失败 |
| `packages/desktop`：`bun test` | 174 通过，1 跳过，0 失败 |
| `packages/ai`：`bun run test` | 1793 通过，28 跳过，0 失败 |
| `packages/server`：`bun run test` | 84 通过，1 跳过，0 失败；使用隔离 HOME / XDG / KITO 环境 |
| `packages/ui`：`bun test` | 155 通过，0 失败 |
| `packages/util`：`bun run test` | 99 通过，0 失败 |
| `packages/cli`：`bun test test/web-ui.test.ts` | 3 通过，90 个断言，0 失败 |
| Protocol / Kito 契约 / 网站 OpenAPI 生成检查 | 通过 |
| CLI `build --single --skip-install`（prod / 2.0.27） | arm64 原生二进制构建通过，`--version` 返回 `opencode v2.0.27` |
| Desktop `build`（prod / 2.0.27 / 本地 CLI_DIST） | main、preload、renderer 构建通过 |
| Node CLI `build-node.ts --single --skip-install` 与 `service-smoke.ts --node` | Apple Silicon 构建与完整服务生命周期通过 |
| HTTP API codegen `bun test` | 99 通过，0 失败；覆盖具名类型和真实 binary wildcard 请求 |
| CLI `script/service-smoke.ts` | 通过：两个服务竞争唯一注册、查询鉴权、插件热加载、内嵌网页和退出清理 |

跳过项由现有测试的平台/工具条件决定。这里只验证 Apple Silicon 本机产物；Windows、Intel macOS 安装包和远端 CI 结果应以 PR 检查为准。

## 真实 HTTP 与页面

从构建出的 CLI 在隔离临时目录启动真实服务，通过独立浏览器会话访问内嵌网页：

- 网页标题为 Kito；`/api/info` 返回版本 2.0.27。未鉴权返回 401。
- `/ktai/credential` 未鉴权返回 401；鉴权后返回 JSON `{identity:false,keyPresent:false}`，不会被网页回退路由拦截。
- 未登录访问 `/ktai/account` 返回 401 与明确的 Identity 错误。
- 打开项目后首页可输入提示词；模型从 Exo Free 切换为 gpt-5.5 后持久显示。
- 管理模型显示 Zen / Kito 分组、默认/显示偏好、探测进度与不可用过滤。
- 顶栏登录生成 Telegram 登录挑战与二维码；关闭弹窗会取消挑战。未完成 Telegram 授权。
- 未登录发送 Kito 模型提示词会先打开登录弹窗；关闭后输入内容保留，没有创建推理请求。
- 浏览器未捕获异常列表为空。

![首页输入框与 Kito 模型](home.png)

![模型管理](models.png)

## 交付边界

框架升级保留官方标签作为 merge commit 的第二父提交，防止下一次升级失去上游共同祖先。PR 不应 squash 合并。

合入 main 会触发原有安装包正式发布流水线；正式发布需要用户授权。钱包充值、实际付费推理、生产数据迁移和已安装客户端升级不属于本次本机验收。
