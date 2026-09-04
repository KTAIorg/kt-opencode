export type KtaiAccountSummary = {
  account: { accountNo: string; displayName?: string }
  balance?: number
}

export function isKitoProviderId(id: string) {
  return id === "ktai" || id === "ktapi" || id.startsWith("ktai") || id.startsWith("ktapi")
}

export function hasKitoCredential(providers: Array<{ id: string; source?: string; key?: string }>) {
  return providers.some((provider) => {
    if (!isKitoProviderId(provider.id)) return false
    if (provider.source === "api" || provider.source === "env" || provider.source === "oauth") return true
    return Boolean(provider.key)
  })
}

export function titlebarAccountAction(input: { account?: KtaiAccountSummary; hasCredential: boolean }) {
  if (input.account || input.hasCredential) return "topUp" as const
  return "signIn" as const
}

export function titlebarAccountName(account?: KtaiAccountSummary) {
  const name = account?.account.displayName?.trim() || account?.account.accountNo
  return name || undefined
}

export function formatKtaiBalance(balance: number) {
  if (Number.isInteger(balance)) return String(balance)
  return balance.toFixed(2)
}
