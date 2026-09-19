export function sessionErrorText(error: unknown): string {
  if (typeof error === "string") return error
  if (!error || typeof error !== "object") return ""
  const record = error as { message?: unknown; data?: { message?: unknown } }
  if (typeof record.data?.message === "string") return record.data.message
  if (typeof record.message === "string") return record.message
  return ""
}

export function classifySessionErrorCta(text: string): "auth" | "billing" | undefined {
  const lower = text.toLowerCase()
  if (
    lower.includes("api key is invalid") ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid token") ||
    lower.includes("sign in or top up") ||
    lower.includes("密钥无效") ||
    lower.includes("金鑰無效") ||
    lower.includes("configure a ktai") ||
    lower.includes("配置 ktai")
  ) {
    return "auth"
  }
  if (
    lower.includes("free usage exceeded") ||
    lower.includes("free model quota") ||
    lower.includes("ktapi.cc/wallet") ||
    lower.includes("余额不足") ||
    lower.includes("餘額不足") ||
    lower.includes("额度不足") ||
    lower.includes("額度不足") ||
    lower.includes("本次额度") ||
    lower.includes("本次額度") ||
    lower.includes("insufficient quota") ||
    lower.includes("insufficient balance") ||
    lower.includes("remaining quota") ||
    lower.includes("top up on kt") ||
    lower.includes("免费额度") ||
    lower.includes("免費額度")
  ) {
    return "billing"
  }
}

export function sessionAuthCta(text: string, signedIn: boolean | undefined) {
  if (classifySessionErrorCta(text) !== "auth") return
  if (signedIn === undefined) return
  return signedIn ? "refresh" : "telegram"
}

export function sessionAuthLeadKey(text: string, signedIn: boolean | undefined) {
  if (classifySessionErrorCta(text) !== "auth") return
  if (!/invalid token|incorrect api key|api key is invalid|密钥无效|金鑰無效/i.test(text)) return
  if (signedIn === undefined) return
  return signedIn ? "dialog.ktAccess.auth.signedIn.lead" : "dialog.ktAccess.auth.lead"
}

export function isPaidBalanceError(text: string) {
  return /额度不足|額度不足|本次额度|本次額度|insufficient quota|insufficient balance|remaining quota/i.test(text)
}

export function sessionBillingCta(
  text: string,
  signedIn: boolean | undefined,
  balance?: number,
  balanceResolved = true,
) {
  if (classifySessionErrorCta(text) !== "billing") return
  if (signedIn === undefined) return
  if (!signedIn) return "wallet"
  // 只有登录用户的动作取决于余额（充值 vs 切模型），所以要等余额查完再决定。
  if (!balanceResolved) return
  // 免费额度用尽不是"钱"的问题，而是"当前用的是免费模型"：只有确认余额为 0 才引导充值。
  // 余额查不到（/ktai/account 503、冷却中、刚登录）时按"切付费模型"引导；真没钱的用户
  // 换到付费模型后会拿到"余额不足"，那时再引导充值也不迟——反之把有余额的人推去充值更糟。
  if (isFreeUsageExceeded(text)) return confirmedEmptyBalance(balance) ? "wallet" : "switch"
  if (!hasConfirmedBalance(balance)) return "wallet"
  if (isPaidBalanceError(text)) return "none"
  return "switch"
}

export function sessionBillingLeadKey(
  text: string,
  signedIn: boolean | undefined,
  balance?: number,
  balanceResolved = true,
) {
  if (classifySessionErrorCta(text) !== "billing") return
  if (signedIn === undefined) return
  if (!signedIn) return "dialog.ktAccess.billing.lead"
  if (!balanceResolved) return
  if (isFreeUsageExceeded(text)) {
    if (confirmedEmptyBalance(balance)) return "dialog.ktAccess.billing.paid.lead"
    // 余额没查到时不能替用户断言"你已有余额"，用不涉及余额的文案。
    return hasConfirmedBalance(balance)
      ? "dialog.ktAccess.switch.lead"
      : "dialog.ktAccess.switch.unknownBalance.lead"
  }
  if (!hasConfirmedBalance(balance)) return "dialog.ktAccess.billing.paid.lead"
  if (isPaidBalanceError(text)) return "dialog.ktAccess.billing.serviceIssue.lead"
  return "dialog.ktAccess.switch.lead"
}

// 技术性 SessionError.type → 面向用户的友好文案 i18n key。映射命中的错误替换原始
// 技术文案（原文仍在卡片次要行展示），未命中类型保持原文。auth/billing 文案走文本
// 分类的 lead key，优先级在本映射之上。
const MODEL_ERROR_LEAD_KEYS: Record<string, string> = {
  "provider.invalid-output": "session.error.model.invalidOutput",
  "provider.invalid-request": "session.error.model.invalidRequest",
  "provider.empty-response": "session.error.model.empty",
  "provider.transport": "session.error.model.transport",
  "provider.internal": "session.error.model.internal",
  "provider.unknown": "session.error.model.internal",
  "provider.rate-limit": "session.error.model.rateLimit",
  "provider.no-route": "session.error.model.noRoute",
  "provider.content-filter": "session.error.model.contentFilter",
  "tool.input-json": "session.error.model.invalidOutput",
  "tool.result-missing": "session.error.model.toolResult",
}

export function sessionModelLeadKey(type: string | undefined) {
  if (!type) return
  return MODEL_ERROR_LEAD_KEYS[type]
}

// 免费额度/免费模型相关的报错文案（软配额触发时由 runner 发出）。
const FREE_USAGE_EXCEEDED = /free usage exceeded|free model quota|top up on kt|免费额度|免費額度/i

export function isFreeUsageExceeded(text: string) {
  return FREE_USAGE_EXCEEDED.test(text)
}

// undefined（尚未查到余额 / /ktai/account 失败）不能被当成"有余额"，只有确认 balance > 0 才
// 说"你已有余额"。balanceResolved=false（/ktai/account 还在途中）时余额是未知的：先按"没
// 余额"渲染会让充值/切模型按钮闪一下，用户点快了就被送到钱包，所以此时不返回动作。
// 未登录时余额不影响动作（都是充值），不必等。
// 余额已确认 > 0 时若仍报"额度不足"（isPaidBalanceError），说明服务端拒绝扣费与余额无关
// （如网关分组/渠道路由问题），不再引导充值，返回 "none" 只换文案。
function hasConfirmedBalance(balance?: number) {
  return typeof balance === "number" && balance > 0
}

function confirmedEmptyBalance(balance?: number) {
  return typeof balance === "number" && balance <= 0
}
