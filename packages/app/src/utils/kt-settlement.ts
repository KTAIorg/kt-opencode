/** Settlement application created for the Kito desktop client. */
export const KT_SETTLEMENT_APPLICATION_ID = "2088777044511035392"
export const KT_SETTLEMENT_APPLICATION_NAME = "kt-opencode"
/** Legacy NewAPI wallet URL. Kito top-up now uses the in-app Identity deposit address. */
export const KT_WALLET_URL = "https://www.ktapi.cc/wallet"

export function isCustomerFacingProvider(id: string) {
  if (id === "ktai" || id === "ktapi" || id === "opencode") return true
  return id.startsWith("ktai") || id.startsWith("ktapi")
}

export function customerFacingProviderName(id: string, name: string) {
  if (id === "ktai" || id === "ktapi" || id.startsWith("ktai-") || id.startsWith("ktapi-")) return "Kito"
  if (id !== "opencode" && !id.startsWith("opencode")) return name
  if (!name.includes("OpenCode")) return name
  return name.replaceAll("OpenCode", "").replace(/\s+/g, " ").trim() || "Zen"
}
