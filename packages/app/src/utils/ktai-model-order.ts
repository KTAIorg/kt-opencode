/**
 * UI sort order for KTAI models — must stay aligned with
 * `packages/core/src/ktai/catalog.ts` → `KTAI_DEFAULT_VISIBLE_PICKS`.
 *
 * Product order (cost-friendly first):
 * Kimi → MiniMax → DeepSeek → Gemini → GPT → Claude
 */
export const KTAI_UI_ORDER_GROUPS: readonly (readonly string[])[] = [
  [
    "kimi-k3",
    "moonshotai/kimi-k3",
    "kimi-k2.7-code",
    "moonshotai/kimi-k2.7-code",
    "kimi-k2.6",
    "moonshotai/kimi-k2.6",
    "kimi-k2.5",
    "moonshotai/kimi-k2.5",
  ],
  ["MiniMax-M3", "minimax/minimax-m3", "MiniMax-M2.7", "minimax/minimax-m2.7", "MiniMax-M2.5", "MiniMax-M2.1"],
  ["deepseek-v4-flash", "deepseek/deepseek-v4-flash", "deepseek-v4-pro", "deepseek/deepseek-v4-pro"],
  [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
  ],
  ["gpt-5.6", "openai/gpt-5.6", "gpt-5.5", "openai/gpt-5.5", "gpt-5.4", "openai/gpt-5.4", "gpt-5.4-mini"],
  [
    "claude-sonnet-5",
    "anthropic/claude-sonnet-5",
    "claude-sonnet-4.6",
    "anthropic/claude-sonnet-4.6",
    "claude-sonnet-4-6",
    "claude-sonnet-4.5",
    "anthropic/claude-sonnet-4.5",
  ],
]

const FAMILY_FALLBACK: readonly { re: RegExp; group: number }[] = [
  { re: /kimi/i, group: 0 },
  { re: /minimax/i, group: 1 },
  { re: /deepseek/i, group: 2 },
  { re: /gemini/i, group: 3 },
  { re: /gpt|openai/i, group: 4 },
  { re: /claude|anthropic/i, group: 5 },
]

/** Lower = higher in the picker. Unknown models go after curated families. */
export function ktaiModelOrderKey(modelID: string): [group: number, alias: number] {
  const id = modelID.trim()
  for (let group = 0; group < KTAI_UI_ORDER_GROUPS.length; group++) {
    const aliases = KTAI_UI_ORDER_GROUPS[group]
    const alias = aliases.findIndex((entry) => entry === id)
    if (alias >= 0) return [group, alias]
  }
  for (const item of FAMILY_FALLBACK) {
    if (item.re.test(id)) return [item.group, 999]
  }
  return [1000, 0]
}

export function compareKtaiModelOrder(a: { id: string; name?: string }, b: { id: string; name?: string }) {
  const [ag, aa] = ktaiModelOrderKey(a.id)
  const [bg, ba] = ktaiModelOrderKey(b.id)
  if (ag !== bg) return ag - bg
  if (aa !== ba) return aa - ba
  return (a.name ?? a.id).localeCompare(b.name ?? b.id)
}

export function isKtaiProviderID(providerID: string) {
  return providerID === "ktai" || providerID === "ktapi" || providerID.startsWith("ktai")
}
