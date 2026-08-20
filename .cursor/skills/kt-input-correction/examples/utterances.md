# 校正前后对照

Agent 应按「理解成」行动，回复里用校正后的词。

## 「接下来接入 KD，配合 KD settlement 做虚拟币自动到账」

```text
听到: KD, KD settlement
理解成: KT, kt-settlement（Casio）
行动: 按 KT Identity + kt-settlement 自动入账设计，不要去找名为 KD 的新系统
```

## 「用户用同一个飞机账户登录 newAPI，地址要和 Keto 一样」

```text
听到: 飞机账户, newAPI, Keto
理解成: Telegram, NewAPI, Kito
行动: 同一 kt_account_id 按链复用地址（TRC20 一条 T…，ERC20 一条 0x… 给 USDT+USDC）。NewAPI 只是计量面
```

## 「把 ERC20 USDT 和 USDC 的二维码和地址那一块做了」

```text
听到: ERC20, USDT, USDC, 二维码, 地址
理解成: Kito 充值弹窗的以太坊网络
行动: 走 kito-wallet。两张卡 + 一张 QR + 一条 0x。问 Casio 用 chain=eth。T… 当 ERC20 就丢掉，不要画
```

## 「我们不是有 kt Admin 吗？里面应该可以调用 Telegram」

```text
听到: kt Admin
理解成: KT Admin / `kt telegram` 运行时
行动: 用已登录的 `kt telegram userbot` 点官方 bot 确认，而不是让用户手机点
```

## 「就是 KD，不是 KT」

```text
听到: 就是 KD，不是 KT
理解成: 字面 KD（本次不要替换）
行动: 保持 KD，必要时请用户把 KD 的正式名补进词表例外
```

## 「这种奇葩的做法是不是不够好，其他的你就处理一下」

```text
听到: 奇葩, 其他的你就处理一下
理解成: 七七八八（杂项做法）, 把剩余事项一并做掉
行动: 按「零散做法要不要收口」讨论，并动手处理剩下的 skill/命令，而不是理解成用户在骂方案荒唐
```

## 「以后把『卡西欧』都当成收银台」

```text
听到: 用户明确追加规则
理解成: Casio = kt-settlement 收银台
行动: 把稳定映射写入 references/glossary.md 并提交 skill 仓库
```
