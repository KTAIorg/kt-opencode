/** Settlement application created for the KT OpenCode desktop client. */
export const KT_SETTLEMENT_APPLICATION_ID = "2088777044511035392"
export const KT_SETTLEMENT_APPLICATION_NAME = "kt-opencode"
export const KT_WALLET_URL = "https://www.ktapi.cc/wallet"

export function isCustomerFacingProvider(id: string) {
  if (id === "ktai" || id === "ktapi" || id === "opencode") return true
  return id.startsWith("ktai") || id.startsWith("ktapi")
}
