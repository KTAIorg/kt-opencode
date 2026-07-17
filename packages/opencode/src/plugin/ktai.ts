import type { Config, Hooks } from "@opencode-ai/plugin"

export const KTAI_PRICING_URL = "https://ktapi.cc/api/pricing"

const API_URL = "https://ktapi.cc/v1"
const RELEASE_DATE = "2026-03-29"
const DEFAULT_CONTEXT = 131_072
const DEFAULT_OUTPUT = 32_768

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

type RawModel = {
  id: string
  name?: string
  input: number
  output: number
  tags?: string
  context?: number
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

function models(input: unknown) {
  const rows = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { data?: unknown }).data)
      ? (input as { data: unknown[] }).data
      : []

  const result = rows.flatMap((value): RawModel[] => {
    if (!value || typeof value !== "object") return []
    const row = value as PricingModel
    const id = typeof row.model_name === "string" ? row.model_name.trim() : ""
    if (!id) return []
    if (Array.isArray(row.enable_groups) && !row.enable_groups.includes("ktai")) return []
    const endpoints = Array.isArray(row.supported_endpoint_types) ? row.supported_endpoint_types : []
    if (!endpoints.includes("openai") && !endpoints.includes("openai-response")) return []

    const ratio = number(row.model_ratio)
    const price = number(row.model_price)
    const completion = number(row.completion_ratio, 1)
    const quota = number(row.quota_type)
    const tags = typeof row.tags === "string" ? row.tags : undefined
    return [
      {
        id,
        name: typeof row.name === "string" ? row.name : undefined,
        input: quota === 0 ? ratio * 2 : price,
        output: quota === 0 ? ratio * completion * 2 : price,
        tags,
        context: context(tags),
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

function providerModel(model: RawModel) {
  const tags = model.tags ?? ""
  const image = /(?:^|,)Vision(?:,|$)/i.test(tags)
  const pdf = /(?:^|,)Files(?:,|$)/i.test(tags)
  return {
    name: model.name ?? label(model.id),
    family: "ktai",
    release_date: RELEASE_DATE,
    attachment: image || pdf,
    reasoning: /(?:^|,)Reasoning(?:,|$)/i.test(tags),
    temperature: true,
    tool_call: /(?:^|,)Tools(?:,|$)/i.test(tags),
    cost: { input: model.input, output: model.output },
    limit: { context: model.context ?? context(tags), output: DEFAULT_OUTPUT },
    modalities: {
      input: ["text", ...(image ? (["image"] as const) : []), ...(pdf ? (["pdf"] as const) : [])],
      output: ["text"] as const,
    },
  }
}

export function createKTAIProviderConfig(input: unknown): NonNullable<Config["provider"]>[string] {
  const list = models(input)
  return {
    name: "KTAI",
    api: API_URL,
    npm: "@ai-sdk/openai-compatible",
    env: ["KTAI_API_KEY"],
    models: Object.fromEntries(list.map((model) => [model.id, providerModel(model)])),
  }
}

async function load() {
  const response = await fetch(KTAI_PRICING_URL, { signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`KTAI pricing request failed: ${response.status}`)
  return createKTAIProviderConfig(await response.json())
}

export async function KTAIProviderPlugin(): Promise<Hooks> {
  return {
    config: async (config) => {
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
      methods: [{ type: "api", label: "KTAI API key" }],
    },
  }
}
