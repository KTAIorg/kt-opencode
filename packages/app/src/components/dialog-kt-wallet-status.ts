const TERMINAL_PAID = new Set([
  "success",
  "paid",
  "completed",
  "complete",
  "finished",
  "settled",
  "ok",
  "trade_success",
  "pay_success",
])

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function readKtpayStatus(payload: unknown) {
  const row = asRecord(payload)
  const nested = asRecord(row?.data) ?? row
  if (!nested) return
  return {
    status: stringValue(nested.status) ?? stringValue(row?.status) ?? "",
    localStatus:
      stringValue(nested.localStatus) ??
      stringValue(nested.local_status) ??
      stringValue(row?.localStatus) ??
      stringValue(row?.local_status) ??
      "",
    settled: nested.settled === true || row?.settled === true,
  }
}

export function isKtpayPaid(payload: unknown) {
  const status = readKtpayStatus(payload)
  if (!status) return false
  if (status.settled) return true
  const local = status.localStatus.toLowerCase()
  if (local && TERMINAL_PAID.has(local)) return true
  const remote = status.status.toLowerCase()
  return Boolean(remote && TERMINAL_PAID.has(remote))
}
