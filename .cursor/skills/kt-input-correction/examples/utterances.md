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
行动: 同一 kt_account_id → 同一 settlement 地址；NewAPI 只是计量面
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

## 「以后把『卡西欧』都当成收银台」

```text
听到: 用户明确追加规则
理解成: Casio = kt-settlement 收银台
行动: 把稳定映射写入 references/glossary.md 并提交 skill 仓库
```
