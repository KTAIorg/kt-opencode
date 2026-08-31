/**
 * UI sort order for KTAI models — must stay aligned with
 * `packages/core/src/ktai/catalog.ts` → `KTAI_DEFAULT_VISIBLE_PICKS`.
 *
 * Product order:
 * Grok → GPT → K3 → DeepSeek → MiniMax
 */
export const KTAI_UI_ORDER_GROUPS: readonly (readonly string[])[] = [
  ["grok-4.6", "grok-4.5", "grok-latest", "grok"],
  ["gpt-5.6", "openai/gpt-5.6", "gpt-5.5", "openai/gpt-5.5", "gpt-5.4", "openai/gpt-5.4", "gpt-5.4-mini"],
  [
    "k3",
    "k3-latest",
    "kimi-k3",
    "moonshotai/kimi-k3",
    "kimi-for-coding",
    "kimi-k2.7-code",
    "moonshotai/kimi-k2.7-code",
    "kimi-k2.6",
    "moonshotai/kimi-k2.6",
    "kimi-k2.5",
    "moonshotai/kimi-k2.5",
  ],
  [
    "deepseek-v4-flash-vision-exp",
    "deepseek/deepseek-v4-flash-vision-exp",
    "deepseek-v4-flash",
    "deepseek/deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek/deepseek-v4-pro",
  ],
  ["MiniMax-M2.7", "minimax/minimax-m2.7", "MiniMax-M3", "minimax/minimax-m3", "MiniMax-M2.5", "MiniMax-M2.1"],
]

const FAMILY_FALLBACK: readonly { re: RegExp; group: number }[] = [
  { re: /grok/i, group: 0 },
  { re: /gpt|openai/i, group: 1 },
  { re: /kimi|moonshot|^k3(?:-|$)|^k2p/i, group: 2 },
  { re: /deepseek/i, group: 3 },
  { re: /minimax/i, group: 4 },
  { re: /gemini/i, group: 5 },
  { re: /claude|anthropic/i, group: 6 },
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
