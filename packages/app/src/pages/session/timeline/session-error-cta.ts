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
    lower.includes("top up on kt") ||
    lower.includes("免费") ||
    lower.includes("免費")
  ) {
    return "billing"
  }
}
