export const KTAI_PRICING_URL = "https://ktapi.cc/api/pricing"
export const KTAI_MODELS_URL = "https://ktapi.cc/v1/models"
export const KTAI_API_URL = "https://ktapi.cc/v1"
export const KTAI_TOPUP_URL = "https://www.ktapi.cc/wallet"
export const HIDDEN_RELEASE_DATE = "2020-01-01"
export const DEFAULT_CONTEXT = 131_072
export const DEFAULT_OUTPUT = 32_768

/**
 * Curated Kito defaults shown in the model picker for new customers.
 * Order = product priority (cost-friendly first). Each group contributes at most
 * ONE id: the first alias that exists in the current `/v1/models` catalog.
 *
 * UI list order for these families lives in
 * `packages/app/src/utils/ktai-model-order.ts` — keep the two tables aligned.
 */
export const KTAI_DEFAULT_VISIBLE_PICKS: readonly (readonly string[])[] = [
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

export function pickDefaultVisibleModelIDs(catalogIDs: Iterable<string>): Set<string> {
  const available = new Set(catalogIDs)
  const picked = new Set<string>()
  for (const group of KTAI_DEFAULT_VISIBLE_PICKS) {
    const hit = group.find((id) => available.has(id))
    if (hit) picked.add(hit)
  }
  return picked
}

type PricingModel = {
  model_name?: unknown
  name?: unknown
  tags?: unknown
  enable_groups?: unknown
  quota_type?: unknown
  model_ratio?: unknown
  model_price?: unknown
  completion_ratio?: unknown
  supported_endpoint_types?: unknown
}

type CatalogModel = {
  id?: unknown
  supported_endpoint_types?: unknown
}

export type PricingCost = {
  input: number
  output: number
  tags?: string
  name?: string
  context?: number
}

export type RawModel = {
  id: string
  name?: string
  input: number
  output: number
  tags?: string
  context?: number
  defaultVisible?: boolean
}

const fallback: RawModel[] = [
  { id: "gpt-5.4", name: "GPT-5.4", input: 2, output: 10, tags: "Reasoning,Tools,Vision,Files,400K" },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    input: 0.75,
    output: 4.5,
    tags: "Reasoning,Tools,Vision,Files,400K",
  },
  { id: "MiniMax-M2.7", input: 0.3, output: 1.2, tags: "Reasoning,Tools,200K" },
  { id: "MiniMax-M2.7-highspeed", input: 0.6, output: 2.4, tags: "Reasoning,Tools,200K" },
]

function number(input: unknown, value = 0) {
  const parsed = Number(input)
  return Number.isFinite(parsed) ? parsed : value
}

export function context(tags?: string) {
  const match = tags?.match(/(?:^|,)\s*(\d+(?:\.\d+)?)\s*([KM])\s*(?:,|$)/i)
  if (!match?.[1]) return DEFAULT_CONTEXT
  const multiplier = match[2]?.toUpperCase() === "M" ? 1_000_000 : 1_000
  return Math.round(Number(match[1]) * multiplier)
}

function rowsFrom(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input && typeof input === "object" && Array.isArray((input as { data?: unknown }).data)) {
    return (input as { data: unknown[] }).data
  }
  return []
}

function pricingCost(row: PricingModel): PricingCost | undefined {
  const id = typeof row.model_name === "string" ? row.model_name.trim() : ""
  if (!id) return
  const ratio = number(row.model_ratio)
  const price = number(row.model_price)
  const completion = number(row.completion_ratio, 1)
  const quota = number(row.quota_type)
  const tags = typeof row.tags === "string" ? row.tags : undefined
  return {
    input: quota === 0 ? ratio * 2 : price,
    output: quota === 0 ? ratio * completion * 2 : price,
    tags,
    name: typeof row.name === "string" ? row.name : undefined,
    context: context(tags),
  }
}

export function pricingIndex(input: unknown): Map<string, PricingCost> {
  const index = new Map<string, PricingCost>()
  for (const value of rowsFrom(input)) {
    if (!value || typeof value !== "object") continue
    const row = value as PricingModel
    const id = typeof row.model_name === "string" ? row.model_name.trim() : ""
    if (!id) continue
    const cost = pricingCost(row)
    if (cost) index.set(id, cost)
  }
  return index
}

export function catalogModels(input: unknown, costs: Map<string, PricingCost>): RawModel[] {
  const result = rowsFrom(input).flatMap((value): RawModel[] => {
    if (!value || typeof value !== "object") return []
    const row = value as CatalogModel
    const id = typeof row.id === "string" ? row.id.trim() : ""
    if (!id) return []
    const endpoints = Array.isArray(row.supported_endpoint_types) ? row.supported_endpoint_types : []
    if (endpoints.length > 0 && !endpoints.includes("openai") && !endpoints.includes("openai-response")) return []
    const cost = costs.get(id)
    return [
      {
        id,
        name: cost?.name,
        input: cost?.input ?? 0,
        output: cost?.output ?? 0,
        tags: cost?.tags,
        context: cost?.context ?? context(cost?.tags),
      },
    ]
  })
  return result.length ? result : fallback
}

export function pricingModels(input: unknown): RawModel[] {
  const result = rowsFrom(input).flatMap((value): RawModel[] => {
    if (!value || typeof value !== "object") return []
    const row = value as PricingModel
    const id = typeof row.model_name === "string" ? row.model_name.trim() : ""
    if (!id) return []
    if (Array.isArray(row.enable_groups) && !row.enable_groups.includes("ktai")) return []
    const endpoints = Array.isArray(row.supported_endpoint_types) ? row.supported_endpoint_types : []
    if (!endpoints.includes("openai") && !endpoints.includes("openai-response")) return []
    const cost = pricingCost(row)
    if (!cost) return []
    return [
      {
        id,
        name: cost.name,
        input: cost.input,
        output: cost.output,
        tags: cost.tags,
        context: cost.context,
      },
    ]
  })
  return result.length ? result : fallback
}

export function label(id: string) {
  return id
    .split("/")
    .at(-1)!
    .replaceAll(/[-_.:]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

export function withDefaultVisibility(list: RawModel[]): RawModel[] {
  const defaults = pickDefaultVisibleModelIDs(list.map((model) => model.id))
  if (list.length <= defaults.size || defaults.size === 0) {
    return list.map((model) => ({ ...model, defaultVisible: true }))
  }
  return list.map((model) => ({ ...model, defaultVisible: defaults.has(model.id) }))
}

export async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`)
  return response.json()
}

export async function loadKtaiModels(apiKey?: string): Promise<RawModel[]> {
  const pricing = await fetchJson(KTAI_PRICING_URL).catch(() => null)
  const costs = pricing ? pricingIndex(pricing) : new Map<string, PricingCost>()

  if (apiKey) {
    const catalog = await fetchJson(KTAI_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "Kito/2.0",
      },
    }).catch(() => null)
    if (catalog) return withDefaultVisibility(catalogModels(catalog, costs))
  }

  if (pricing) return withDefaultVisibility(pricingModels(pricing))
  return withDefaultVisibility(fallback)
}
