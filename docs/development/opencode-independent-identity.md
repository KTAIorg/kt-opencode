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

## 5. 模型列表与计费展示

- **可选模型目录**：优先 `GET https://ktapi.cc/v1/models`（对应当前 NewAPI credential / 分组实际可调用集合）。
- **价格 / 成本估算**：`GET https://ktapi.cc/api/pricing`（给目录项挂 cost）。
- 尚无 NewAPI key 时：暂时用 public pricing 里 `enable_groups` 含 `ktai` 的条目做发现列表；有 key 后切到 `/v1/models`。

## 6. 免费体验：软限额（主）+ Zen 耗尽（兜底）

仍保留上游 OpenCode Zen 免费模型（ktapi 侧基本没有免费模型）。  
产品口径见：[客户路径 Wiki](../wiki/customer-journey.md)。

### 6.1 本地软限额（主转化，已拍板）

- **不**首屏强制登录。
- 免登录 Zen 对话累计 **100** 次后 **半停**：
  - Zen 白嫖通道不可再发送；
  - 引导去 `https://www.ktapi.cc/wallet`（或等价 KT 入口）；
  - 已配置 KTAI API key / 个人 token 时，付费 KTAI 模型仍可发送。
- 实现落点（待开发）：本地计数 + 发送前拦截 + 与现有 usageExceeded / wallet CTA 复用文案。

### 6.2 Zen 上游额度用尽（兜底）

当 Zen 返回 `FreeUsageLimitError` 时：

- **不再**弹出 OpenCode Go 订阅 / 连接 `opencode-go`。
- 改为 KT 充值引导，CTA：`https://www.ktapi.cc/wallet`。
- 与软限额共用引导口径；**不**把「Zen 自然耗尽」当作唯一转化扳机。

## 7. 客户默认链路（不是 KT Secret 共享密钥）

> 团队可读版（推荐转发给小伙伴）：[客户路径 Wiki](../wiki/customer-journey.md)  
> 测试清单：[软限额与客户路径测试](../wiki/soft-quota-acceptance.md)

客户安装包 **不会** 内置 `KT_NEWAPI__PROD__KT_OPENCODE__API_KEY` 这类运营共享密钥。  
该 Secret 仅供内部调试 / CI。

目标客户路径：

```text
1) 打开 KT OpenCode
   └─ 先用 OpenCode Zen 免费模型（无需 KT 账号 / 无需 NewAPI key）

2) 本地软限额达到 100 次（主转化）
   └─ 半停 Zen 发送，引导去 https://www.ktapi.cc/wallet
   └─ 已有 KTAI key 则付费模型可继续

2b) Zen 返回额度用尽（兜底）
   └─ 同一套 KT 充值引导（不是 Go）

3) 注册 / 登录 KT Identity
   └─ Telegram 或密码登录（写入 auth.json，refresh=kt-identity）

4) 获得个人可用的 NewAPI 凭证（目标态）
   └─ NewAPI 按 kt_account_id Ensure / Token Exchange
   └─ OpenCode 自动写入该账号的 API key，切换到 KTAI 付费模型

5) 过渡态（Ensure 未上线前）
   └─ 用户在 ktapi.cc 控制台自建 token，或在 OpenCode 粘贴 “KTAI API key”
   └─ 也可用环境变量 KTAI_API_KEY（仅开发机）
```

KTAI 模型选择器默认只点亮精选编程模型（约 8–10 个）；其余仍在 Manage models 里可手动打开。

## 8. 下一步

1. OpenCode：实现软限额 100 + 半停（计数、拦截、与 wallet CTA 复用）。
2. NewAPI：按 `kt_account_id` Ensure / Token Exchange（已交接）——这是客户免粘贴 key 的关键路径。
3. OpenCode：Ensure 就绪后，Identity 登录成功即自动写入 per-account NewAPI token，去掉对共享 `KTAI_API_KEY` 的依赖。
4. 可选：账户页展示当前 `kt_account_id` / accountNo；`authz/can` 产品权限。
5. V2 升级与独立桌面打包策略另开里程碑，不阻塞本身份闭环。
