# Kito Repository Instructions

- 评审、文档、PR 描述、Commit 说明和发布说明默认使用简体中文。
- 代码标识符、API 路径、环境变量、配置键和第三方名称保持英文。
- 对外产品名是 Kito。不要把 OpenCode、ktapi、ktai、KTAI、KT OpenCode 当作产品名展示。
- Kito 定制必须限制在 `docs/development/upstream-sync-policy.md` 声明的白名单内。
- 当前上游基线是 `anomalyco/opencode` 的 `beta`（V2）。不要把 1.x `packages/opencode` 路径当作运行时代码。
- 禁止提交 API Key、Token、证书、私钥或生产环境配置；密钥必须通过 GitHub Secrets 或运行时环境变量注入。
- 修改 Provider、认证、权限、构建或发布流程时，必须补充验证结果和回滚方案。
- 不得通过 ZIP 覆盖上游目录的方式同步 OpenCode。从 `upstream/beta` 开分支，再移植白名单定制。
