# KT OpenCode 客户路径

给产品 / 运营 / 研发对齐用的默认客户链路。  
**安装包不会内置运营共享 NewAPI 密钥**；共享 Secret 只给内部调试 / CI。

## 一句话

免登录先用 Zen → **本地软限额 100 次到点半停** → 去 KT / ktapi 继续 → 付费 KTAI。  
Zen 自己额度耗尽时，走同一套充值引导（兜底）。

## 已拍板（2026-07-30）

| 项 | 决定 |
| --- | --- |
| 首屏强制登录 | **不做** |
| 主转化扳机 | **本地软限额**：免费 Zen 对话 **100 次**（已实现） |
| 到点行为 | **半停**：停 Zen 白嫖发送；已配置 KTAI key 的付费模型仍可发 |
| Zen 上游耗尽 | **兜底**：`FreeUsageLimitError` → 同一套 wallet CTA |
| CTA | `https://www.ktapi.cc/wallet`（不是 OpenCode Go） |
| 实现 | `packages/opencode/src/session/soft-quota.ts` + `SessionPrompt.prompt` 门禁 |

## 流程图

```text
打开软件
  → 免登录，先用 OpenCode Zen 免费模型
  → 本地计数：免费 Zen 成功对话次数

次数达到 100（主转化）
  → 半停：Zen 不能再发
  → 弹 KT 引导（去 wallet 充值 / 登录拿付费能力）
  → 已有 KTAI API key → 付费模型仍可发

Zen 自己返回额度用尽（兜底，可能早于或晚于 100）
  → 同一套 KT 充值引导（https://www.ktapi.cc/wallet）

然后用付费 KTAI 模型
  → 目标态：KT Identity 登录后，NewAPI 按 kt_account_id 自动 Ensure / 发个人 token
  → 过渡态（Ensure 还没好）：用户在 ktapi 控制台自己建 key，或在 OpenCode 粘贴 “KTAI API key”
```

## 分步说明

### 1. 打开软件：免费起步

- 默认可用 **OpenCode Zen** 免费模型。
- **不需要** KT 账号，也 **不需要** NewAPI / KTAI API key。
- ktapi 侧基本没有免费模型；免费体验靠 Zen。
- **不在首屏强制登录**（避免安装后即流失）。

### 2. 软限额 100 次：半停（主转化）

- **计数范围**：免登录使用 Zen 免费模型、成功完成的对话轮次（产品实现时以「用户成功发出并得到模型响应的一轮」为准；具体埋点以实现 PR 为准）。
- **阈值**：`100`。
- **到点行为（半停）**：
  - Zen / 免费白嫖通道：**不能再发送**。
  - 弹窗引导去 KT：充值 / 登录 / 配置个人 key。
  - 若用户已配置 **KTAI API key**（或后续 Ensure 自动写入的个人 token）：**付费 KTAI 模型仍可发送**。
- **不是**：到点后整 App 废掉；也不是仅 toast 提醒却继续无限白嫖。

### 3. Zen 上游额度用尽：兜底

- 触发条件：Zen 返回免费额度用尽（`FreeUsageLimitError`）。
- 产品行为：弹出 **KT 充值引导**（不是 OpenCode Go 订阅）。
- CTA：[`https://www.ktapi.cc/wallet`](https://www.ktapi.cc/wallet)
- 与软限额共用同一套引导口径；不单独依赖「Zen 自然耗尽」做主转化（额度不透明且可能日刷）。

### 4. 付费 KTAI 模型

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
- 其余模型仍可在 **Manage models** 里可手动打开。

## 相关文档

- 测试验收清单：[软限额与客户路径测试](./soft-quota-acceptance.md)
- 技术细节：[KT OpenCode × KT Identity](../development/opencode-independent-identity.md)
- Wiki 目录：[README](./README.md)
