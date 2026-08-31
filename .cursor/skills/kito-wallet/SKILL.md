---
name: kito-wallet
description: This skill should be used when the user asks to "Kito 充值", "ERC20 二维码", "USDT USDC 地址", "TRC20", "deposit address", "top up Kito", "钱包二维码", "充值弹窗", or when implementing Kito customer top-up, deposit QR, or crypto address.
version: 1.0.0
category: 平台服务
status: active
last_verified: 2026-08-20
metadata:
  kt:
    related_skills:
      - kt-input-correction
      - kt-auto-arrival-system
      - kt-iam-bearer-integration
      - settlement-admin
---

# Kito 客户充值

对外产品名是 **Kito**。内部仓库/路径仍是 `kt-opencode`、`/ktai/*`、域名 `ktapi.cc`。不要把 OpenCode、ktapi、KTAI 写进客户文案。

主身份是 `kt_account_id`（KT Identity），不是 NewAPI user id，也不是 Telegram id。

## 何时用

- 做或改 Kito 充值弹窗、二维码、链上地址
- 查为什么 ERC20 拿到了 TRON `T…` 地址
- 接 NewAPI IAM / kt-billing / Casio 取址

不要用来做账目人工工资（`settlement-admin`），也不要改 Casio 扫块归集（`kt-auto-arrival-system`）。

## 产品规则

1. **法币在前**：微信 / 支付宝（KTPay），然后才是 USDT / USDC。
2. **TRC20（`tron`）**：只收 USDT。地址必须以 `T` 开头。
3. **ERC20（`ethereum`）**：USDT 和 USDC **共用一条** 以太坊地址。地址必须以 `0x` 开头、长度 42。
4. **按链复用，不跨链复用。** 同一 `kt_account_id`：TRC20 一条 `T…`，ERC20 一条 `0x…`。
5. **登录不造地址。** 打开充值、选到对应网络时再取/建。
6. **链名对不上就不要展示。** ERC20 若返回 `T…`，不要画那个二维码。
7. **对话里不要打印完整充值地址。** 只写前缀 + 长度。

## 取址链路

```text
Kito GET /ktai/wallet/deposit-address?chain=&asset=
  → NewAPI IAM GET /api/iam/deposit-address
  → kt-billing GET /recharge/crypto/address
  → Casio settlement-address list / create
```

| 调用方 | TRON | Ethereum |
|---|---|---|
| Kito / NewAPI / 用户文案 | `tron` / TRC20 | `ethereum` / ERC20 |
| Casio `list` / `create` | `tron` | `eth` |

Casio **只认** `tron` / `eth`。把 `ethereum` 原样发给 Casio 会失败或拿回错链地址。

取址顺序：

1. 问生产 NewAPI IAM（`https://ktapi.cc`）。
2. 地址与网络不符就丢掉，继续（例如 `ethereum` 收到 `T…`）。
3. 可选 `KTAI_BILLING_BASE_URL` 走 billing；必须按 chain 过滤，不能 `page_size=1` 拿租户第一条。
4. 可选 `KTAI_SETTLEMENT_ADDRESS_URL`：先 `GET /api/v1/address/list?tenant_id=&chain=eth|tron`，没有再 `POST /api/v1/address/create`（`chain: eth|tron`）。
5. `tenant_id` = Identity `account.id` 去掉横线的 UUID。优先复用已有行，不要为了试接口再 create。

结算应用 ID 和回调 URL 用环境变量 / 仓库常量，不要把密钥或完整地址写进回复、commit、skill。

## UI

- ERC20：USDT / USDC 两张卡 + **一张**二维码 + **一条** `0x` + 复制。
- 对话框 body 必须能滚动；二维码不要把地址裁出视口。
- App 不要 import `@opencode-ai/core`；网络形态校验在对话框里自备一份。

## 常见误区

| 乌龙 | 正确口径 |
|---|---|
| 一个人全世界一条地址 | 按链复用：TRC20 与 ERC20 不是同一条 |
| USDT / USDC 各造一条 ERC20 | 共用一条 `0x` |
| 问 Casio `chain=ethereum` | 问 Casio 用 `eth` |
| 登录时预创建地址 | 打开充值再取 |
| 把 `T…` 画成 ERC20 二维码 | 丢掉，继续下一路 |
| billing 按租户取第一条 | 必须带 chain，否则会拿到 TRON |

## 相关

- 口误：`kt-input-correction`
- Casio B 端：`kt-auto-arrival-system`（消费者链名见其 `references/consumer-chain.md`）
- 登录：`kt-iam-bearer-integration`、`kt-telegram-login-e2e`
- 人工账本：`settlement-admin`
