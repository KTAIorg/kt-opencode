# KT OpenCode 客户路径

给产品 / 运营 / 研发对齐用的默认客户链路。  
**安装包不会内置运营共享 NewAPI 密钥**；共享 Secret 只给内部调试 / CI。

## 一句话

先白嫖 OpenCode Zen 免费模型 → 额度用完去 KT 充值 → 再用付费 KTAI 模型。

## 流程图

```text
打开软件
  → 先用 OpenCode Zen 免费模型（不用 KT 账号、不用 NewAPI key）

免费额度用完
  → 弹 KT 充值引导（https://www.ktapi.cc/wallet）
  → 去注册 / 登录 KT、充值

然后用付费 KTAI 模型
  → 目标态：KT Identity 登录后，NewAPI 按 kt_account_id 自动 Ensure / 发个人 token
  → 过渡态（Ensure 还没好）：用户在 ktapi 控制台自己建 key，或在 OpenCode 粘贴 “KTAI API key”
```

## 分步说明

### 1. 打开软件：免费起步

- 默认可用 **OpenCode Zen** 免费模型。
- **不需要** KT 账号，也 **不需要** NewAPI / KTAI API key。
- ktapi 侧基本没有免费模型；免费体验靠 Zen。

### 2. 免费额度用完：引导充值

- 触发条件：Zen 返回免费额度用尽（`FreeUsageLimitError`）。
- 产品行为：弹出 **KT 充值引导**（不是 OpenCode Go 订阅）。
- CTA：[`https://www.ktapi.cc/wallet`](https://www.ktapi.cc/wallet)
- 用户动作：注册 / 登录 KT，完成充值。

### 3. 付费 KTAI 模型

身份与账单归属同一个 `kt_account_id`。注意：

- **KT Identity Bearer ≠ NewAPI API Key**
- Identity 只证明「你是谁」；真正调模型还要 NewAPI 凭证。

#### 目标态（Ensure 就绪后）

1. 用户在 OpenCode 用 KT Identity 登录（Telegram / 密码）。
2. NewAPI 按 `kt_account_id` **Ensure / Token Exchange**，自动发个人 token。
3. OpenCode 写入该账号的 API key，切换到 **KTAI 付费模型**。
4. 客户 **不用** 手动粘贴 key。

#### 过渡态（Ensure 还没上线）

任选其一即可用付费模型：

1. 去 [ktapi.cc](https://ktapi.cc) 控制台自己建 token；或
2. 在 OpenCode 粘贴 **「KTAI API key」**；或
3. 开发机可用环境变量 `KTAI_API_KEY`（仅开发，不进安装包）。

## 和内部密钥的区别（重要）

| 用途 | 密钥从哪来 | 给谁用 |
| --- | --- | --- |
| 客户正式路径 | 个人 NewAPI token（Ensure 自动发，或控制台自建） | 终端用户 |
| 内部调试 / CI | 如 `KT_NEWAPI__PROD__KT_OPENCODE__API_KEY` | 研发 / 自动化 |

**不要把共享 Secret 写进客户安装包或对外 README 安装步骤。**

## 模型选择器（补充）

- KTAI 默认只点亮一批精选编程模型（约 8–10 个），降低首次选择成本。
- 其余模型仍可在 **Manage models** 里手动打开。

## 相关文档

- 技术细节：[KT OpenCode × KT Identity](../development/opencode-independent-identity.md)
- Wiki 目录：[README](./README.md)
