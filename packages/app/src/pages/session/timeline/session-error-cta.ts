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
    lower.includes("免费") ||
    lower.includes("免費")
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

export function sessionBillingCta(text: string, signedIn: boolean | undefined, balance?: number) {
  if (classifySessionErrorCta(text) !== "billing") return
  if (signedIn === undefined) return
  if (!signedIn || isPaidBalanceError(text) || balance === 0) return "wallet"
  return "switch"
}

export function sessionBillingLeadKey(text: string, signedIn: boolean | undefined, balance?: number) {
  if (classifySessionErrorCta(text) !== "billing") return
  if (signedIn === undefined) return
  if (!signedIn) return "dialog.ktAccess.billing.lead"
  if (isPaidBalanceError(text) || balance === 0) return "dialog.ktAccess.billing.paid.lead"
  return "dialog.ktAccess.switch.lead"
}
