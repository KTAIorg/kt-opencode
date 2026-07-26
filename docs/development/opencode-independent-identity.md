# KT OpenCode × KT Identity（独立桌面）

日期：2026-07-26  
状态：进行中  
产品定案：**KT OpenCode 是独立桌面应用**，共用 KT Identity；**不依赖嵌进 KT 客户端**。

## 1. 目标

客户用同一个 KT Account（例如 Telegram `@Arise085`）登录独立的 KT OpenCode 后：

1. 不需要再造一套 OpenCode 账号体系。
2. AI 调用走 NewAPI（`ktapi.cc`）。
3. 用量最终归属到同一个 `kt_account_id`。

这与 KTPay / KT 客户端是**平级关系**：都是 Identity 的消费方，不是上下级宿主关系。

## 2. 身份分层

```text
KT Identity          证明你是谁（kt_account_id）
KT OpenCode Desktop  独立应用；Bearer 登录 Identity
NewAPI / ktapi.cc    AI 执行与计量（需要 NewAPI credential）
```

规则：

- Identity Bearer ≠ NewAPI API Key。
- 在 NewAPI 完成「按 `kt_account_id` Ensure/换票」之前，AI 调用仍可使用 `KTAI_API_KEY` 或手动粘贴的 KTAI API key 作为过渡。
- NewAPI 侧缺口已单独交接给 NewAPI 开发者。

## 3. 本仓已落地（本阶段）

在独立桌面 / CLI 共用的 KTAI Provider 中增加：

- **KT Identity (Telegram)**：`/identity/v1/auth/telegram/{start,poll}`
- **KT Identity (password)**：`/identity/v1/auth/login`
- **KTAI API key**：保留原手动/环境变量路径

登录成功后写入 `auth.json`（`0600`）：

```json
{
  "ktai": {
    "type": "oauth",
    "access": "<identity-bearer>",
    "refresh": "kt-identity",
    "expires": 1234567890000,
    "accountId": "<kt_account_id>"
  }
}
```

`auth.loader` 约定：

- 若 `refresh === "kt-identity"`，**不会**把 Identity Bearer 当作 `ktapi.cc` 的 API Key。
- AI 调用优先使用 `KTAI_API_KEY`；未配置时使用 dummy key（避免 SDK 直接崩溃，真正调用仍需有效 NewAPI key）。

入口文件：

- `packages/opencode/src/plugin/ktai.ts`
- `packages/opencode/src/plugin/ktai-identity.ts`

环境变量：

| 变量 | 含义 |
|---|---|
| `KT_IDENTITY_BASE_URL` | 默认 `https://login.ktyun.cc` |
| `KTAI_API_KEY` | 过渡期 NewAPI API Key |

## 4. 与旧 V2「嵌进 kt-desktop」草案的关系

`cursor/v2-*` 分支上曾有一份把 OpenCode 嵌进 KT 客户端、复用宿主登录的设计。  
按 2026-07-26 产品确认，**该方向不再作为默认前提**。

后续若要做「从 KT 客户端一键打开 OpenCode」，只能作为体验增强，不能替代 OpenCode 自己的 Identity 登录。

## 5. 下一步

1. NewAPI：按 `kt_account_id` Ensure / Token Exchange（已交接）。
2. OpenCode：Ensure 就绪后，Identity 登录成功即自动写入 per-account NewAPI token，去掉对共享 `KTAI_API_KEY` 的依赖。
3. 可选：账户页展示当前 `kt_account_id` / accountNo；`authz/can` 产品权限。
4. V2 升级与独立桌面打包策略另开里程碑，不阻塞本身份闭环。
