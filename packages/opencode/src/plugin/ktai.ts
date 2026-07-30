import type { Config, Hooks } from "@opencode-ai/plugin"
import { OAUTH_DUMMY_KEY } from "@/auth"
import { Global } from "@opencode-ai/core/global"
import path from "path"
import {
  externalIdentity,
  isEmbeddedMode,
  KT_IDENTITY_REFRESH_MARKER,
  validateExternalIdentity,
} from "./ktai-identity"

export const KTAI_PRICING_URL = "https://ktapi.cc/api/pricing"
export const KTAI_MODELS_URL = "https://ktapi.cc/v1/models"
export const KTAI_TOPUP_URL = "https://www.ktapi.cc/wallet"

const API_URL = "https://ktapi.cc/v1"
/** Used for non-default models so OpenCode's visibility heuristic keeps them hidden until opted in. */
const HIDDEN_RELEASE_DATE = "2020-01-01"
const DEFAULT_CONTEXT = 131_072
const DEFAULT_OUTPUT = 32_768

/**
 * Curated KTAI defaults shown in the model picker for new customers.
 * Order = product priority (cost-friendly first). Each group contributes at most
 * ONE id: the first alias that exists in the current `/v1/models` catalog.
 * OpenCode treats missing/invalid `release_date` as visible by default.
 *
 * UI list order for these families lives in
 * `packages/app/src/utils/ktai-model-order.ts` — keep the two tables aligned.
 */
export const KTAI_DEFAULT_VISIBLE_PICKS: readonly (readonly string[])[] = [
  // 1) Kimi — prefer K3 when NewAPI lists it; else newest K2.x
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
  // 2) MiniMax
  ["MiniMax-M3", "minimax/minimax-m3", "MiniMax-M2.7", "minimax/minimax-m2.7", "MiniMax-M2.5", "MiniMax-M2.1"],
  // 3) DeepSeek
  ["deepseek-v4-flash", "deepseek/deepseek-v4-flash", "deepseek-v4-pro", "deepseek/deepseek-v4-pro"],
  // 4) Gemini — one latest flash/pro-preview line
  [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
  ],
  // 5) GPT — one latest flagship only (not mini + flagship together)
  ["gpt-5.6", "openai/gpt-5.6", "gpt-5.5", "openai/gpt-5.5", "gpt-5.4", "openai/gpt-5.4", "gpt-5.4-mini"],
  // 6) Claude — one latest Sonnet (skip default Opus/Haiku for typical customers)
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
  description?: unknown
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
  owned_by?: unknown
  supported_endpoint_types?: unknown
}

type PricingCost = {
  input: number
  output: number
  tags?: string
  name?: string
  context?: number
}

type RawModel = {
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

function context(tags?: string) {
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

/** Build model_name → cost/metadata from the public pricing endpoint. */
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

/** Catalog entries from `/v1/models` (what the current credential can call). */
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

/**
 * Legacy pricing-only catalog (used when `/v1/models` is unavailable).
 * Kept as a fallback so the picker is not empty before a NewAPI key is configured.
 */
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

function label(id: string) {
  return id
    .split("/")
    .at(-1)!
    .replaceAll(/[-_.:]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

function withDefaultVisibility(list: RawModel[]): RawModel[] {
  const defaults = pickDefaultVisibleModelIDs(list.map((model) => model.id))
  // If the catalog is a tiny fallback set, keep everything visible.
  if (list.length <= defaults.size || defaults.size === 0) {
    return list.map((model) => ({ ...model, defaultVisible: true }))
  }
  return list.map((model) => ({ ...model, defaultVisible: defaults.has(model.id) }))
}

function providerModel(model: RawModel) {
  const tags = model.tags ?? ""
  const image = /(?:^|,)Vision(?:,|$)/i.test(tags)
  const pdf = /(?:^|,)Files(?:,|$)/i.test(tags)
  const input: Array<"text" | "image" | "pdf"> = ["text"]
  if (image) input.push("image")
  if (pdf) input.push("pdf")
  const defaultVisible = model.defaultVisible !== false
  return {
    name: model.name ?? label(model.id),
    family: defaultVisible ? `ktai:${model.id}` : "ktai",
    // Missing/invalid release_date => visible by default in OpenCode's model picker.
    // Older valid dates => hidden until the customer opts in via Manage models.
    ...(defaultVisible ? {} : { release_date: HIDDEN_RELEASE_DATE }),
    attachment: image || pdf,
    reasoning: /(?:^|,)Reasoning(?:,|$)/i.test(tags),
    temperature: true,
    tool_call: /(?:^|,)Tools(?:,|$)/i.test(tags),
    cost: { input: model.input, output: model.output },
    limit: { context: model.context ?? context(tags), output: DEFAULT_OUTPUT },
    modalities: {
      input,
      output: ["text"] as Array<"text">,
    },
  }
}

export function createKTAIProviderConfig(list: RawModel[]): NonNullable<Config["provider"]>[string] {
  const visible = withDefaultVisibility(list)
  return {
    name: "KTAI",
    api: API_URL,
    npm: "@ai-sdk/openai-compatible",
    env: ["KTAI_API_KEY"],
    models: Object.fromEntries(visible.map((model) => [model.id, providerModel(model)])),
  }
}

async function readStoredApiKey(): Promise<string | undefined> {
  if (process.env.KTAI_API_KEY?.trim()) return process.env.KTAI_API_KEY.trim()
  try {
    const file = path.join(Global.Path.data, "auth.json")
    const raw = await Bun.file(file).text()
    const data = JSON.parse(raw) as Record<string, { type?: string; key?: string }>
    const auth = data.ktai
    if (auth?.type === "api" && typeof auth.key === "string" && auth.key.trim()) return auth.key.trim()
  } catch {
    // no stored key yet
  }
  return
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`)
  return response.json()
}

async function load() {
  const pricing = await fetchJson(KTAI_PRICING_URL).catch(() => null)
  const costs = pricing ? pricingIndex(pricing) : new Map<string, PricingCost>()

  const apiKey = await readStoredApiKey()
  if (apiKey) {
    const catalog = await fetchJson(KTAI_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "KTOpenCode/1.0",
      },
    }).catch(() => null)
    if (catalog) return createKTAIProviderConfig(catalogModels(catalog, costs))
  }

  // Before a NewAPI key exists, keep a discovery catalog from public pricing.
  if (pricing) return createKTAIProviderConfig(pricingModels(pricing))
  return createKTAIProviderConfig(fallback)
}

export async function KTAIProviderPlugin(): Promise<Hooks> {
  const injectedIdentity = externalIdentity()
  const embeddedWithIdentity = isEmbeddedMode() && injectedIdentity

  return {
    config: async (config) => {
      if (embeddedWithIdentity) void validateExternalIdentity(embeddedWithIdentity).catch(() => undefined)
      const provider = await load().catch(() => createKTAIProviderConfig(fallback))
      const current = config.provider?.ktai
      config.provider = {
        ...config.provider,
        ktai: {
          ...provider,
          ...current,
          options: { ...provider.options, ...current?.options },
          models: { ...provider.models, ...current?.models },
        },
      }
    },
    auth: {
      provider: "ktai",
      // Identity Bearer is NOT a NewAPI API key. Until Identity→NewAPI key
      // exchange ships, only offer pasted API keys (Telegram/password would
      // "succeed" login but leave chat on Invalid token / dummy key).
      async loader(getAuth) {
        const auth = await getAuth()
        if (!auth) return {}
        if (auth.type === "oauth" && auth.refresh === KT_IDENTITY_REFRESH_MARKER) {
          return { apiKey: process.env.KTAI_API_KEY || OAUTH_DUMMY_KEY }
        }
        return {}
      },
      methods: [{ type: "api" as const, label: "KTAI API key" }],
    },
  }
}
