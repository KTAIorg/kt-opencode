# KT 输入校正词表

只收**稳定、高置信**的口误 / 语音识别 / 打字错误。不要把偶发错字塞进来。

列含义：

| 列 | 含义 |
|---|---|
| 听到/打出 | 用户原文里出现的形式（大小写不敏感，除非注明） |
| 理解成 | Agent 解读意图时使用的形式 |
| 不要当成 | 明确排除的错误理解 |
| 备注 | 边界 |

## 组织与产品

| 听到/打出 | 理解成 | 不要当成 | 备注 |
|---|---|---|---|
| KD | KT | KDC、某个独立「KD 产品」 | 默认替换。`接入 KD`、`KD 结算`、`KD settlement` 都是 KT |
| KD settlement / KD 结算 | KT settlement / `kt-settlement`（Casio 收银台） | NewAPI 自己收款、独立 KD 链 | 入账仍走 settlement → billing → Identity |
| KDC | KDC（KTSecret / 凭据中心） | KT | **禁止**收成 KT |
| Keto / Kete / keto | Kito | 新品牌名 | 桌面/客户产品对外名 |
| KT OpenCode / KTAPI / KTAI（当产品名说） | Kito（对外）；内部 ID 仍是 `ktai` / 域名 `ktapi.cc` | 把内部 ID 展示给客户 | 只校正「用户在说产品」时的叫法 |
| new API / newapi / New Api | NewAPI | 让用户进 NewAPI 控制台充值 | 计量面，不是收银台 |
| 飞机 / 飞机号 / 飞机账户 | Telegram | 航空、独立 IM 产品 | KT 登录因子 |
| kt admin / KTAdmin / 后台 | KT Admin（`kt-admin-web` / `kt telegram` 视语境） | 让用户去 NewAPI Admin 充值 | 调 Telegram 用 `kt telegram`，不是 NewAPI |

## 结算与身份

| 听到/打出 | 理解成 | 不要当成 | 备注 |
|---|---|---|---|
| 身份 / Identity / kt identity | KT Identity（`kt_account_id`） | NewAPI user id、Telegram id | 跨产品主身份 |
| Ensure | Identity 登录后为该 `kt_account_id` 幂等创建 NewAPI 影子用户并发卡给 Kito | 用户粘贴任意 NewAPI key | 支付仍不进 NewAPI |
| 充值 / 钱包 / 虚拟币地址 | **KT 钱包**（settlement 按 `kt_account_id` 复用地址） | 把 `ktapi.cc` NewAPI 登录页当收银台 | 同一个人同一地址 |

## 口语 / 语音

| 听到/打出 | 理解成 | 不要当成 | 备注 |
|---|---|---|---|
| 奇葩 | 七七八八（杂项、剩余事项） | 「做法很荒唐 / bizarre」 | 用户常说七七八八，转写经常落成奇葩。`这种奇葩的做法` = 这些七七八八的做法。说「就是奇葩」时不改 |

## 追加模板

在对应表末尾加一行，并在 PR 说明里写：谁确认的、出现过几次、有没有例外。

```md
| <听到/打出> | <理解成> | <不要当成> | <备注> |
```
