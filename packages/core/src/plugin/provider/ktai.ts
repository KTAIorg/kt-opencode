import { Effect } from "effect"
import { define } from "../internal"

// KTAI provider = KT 平台的 new-api 网关（ktapi.cc）的 OpenAI-compatible 接入。
// V2 只负责“连网关 + 抓模型目录（列表 + 能力）”；定价/计费由平台侧
// （new-api 计量 -> kt-identity ledger -> kt-billing）负责，见
// docs/development/opencode-v2-kt-integration.md。凭据在 M2 走 KTAI_API_KEY
// 环境变量作为开发/回退，M4 换成宿主注入的 per-account new-api token。

const PROVIDER_ID = "ktai"
const PRICING_URL = "https://ktapi.cc/api/pricing"
const API_URL = "https://ktapi.cc/v1"
const NPM = "@ai-sdk/openai-compatible"
const RELEASE_DATE = "2026-03-29"
const DEFAULT_CONTEXT = 131_072
const DEFAULT_OUTPUT = 32_768

type CatalogModel = {
  id: string
  name: string
  tools: boolean
  reasoning: boolean
  input: string[]
  context: number
}

const fallback: CatalogModel[] = [
  model("gpt-5.4", "GPT-5.4", "Reasoning,Tools,Vision,Files,400K"),
  model("gpt-5.4-mini", "GPT-5.4 Mini", "Reasoning,Tools,Vision,Files,400K"),
  model("MiniMax-M2.7", "MiniMax M2.7", "Reasoning,Tools,200K"),
]

function contextFromTags(tags: string) {
  const match = tags.match(/(?:^|,)\s*(\d+(?:\.\d+)?)\s*([KM])\s*(?:,|$)/i)
  if (!match?.[1]) return DEFAULT_CONTEXT
  const multiplier = match[2]?.toUpperCase() === "M" ? 1_000_000 : 1_000
  return Math.round(Number(match[1]) * multiplier)
}

function label(id: string) {
  return id
    .split("/")
    .at(-1)!
    .replaceAll(/[-_.:]+/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase())
}

function model(id: string, name: string | undefined, tags: string): CatalogModel {
  const image = /(?:^|,)Vision(?:,|$)/i.test(tags)
  const pdf = /(?:^|,)Files(?:,|$)/i.test(tags)
  return {
    id,
    name: name ?? label(id),
    tools: /(?:^|,)Tools(?:,|$)/i.test(tags),
    reasoning: /(?:^|,)Reasoning(?:,|$)/i.test(tags),
    input: ["text", ...(image ? ["image"] : []), ...(pdf ? ["pdf"] : [])],
    context: contextFromTags(tags),
  }
}

// 解析 ktapi.cc/api/pricing（new-api 定价格式），只取模型列表 + 能力标签，忽略价格。
export function parseCatalog(input: unknown): CatalogModel[] {
  const rows = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { data?: unknown }).data)
      ? (input as { data: unknown[] }).data
      : []

  const result = rows.flatMap((value): CatalogModel[] => {
    if (!value || typeof value !== "object") return []
    const row = value as {
      model_name?: unknown
      name?: unknown
      tags?: unknown
      enable_groups?: unknown
      supported_endpoint_types?: unknown
    }
    const id = typeof row.model_name === "string" ? row.model_name.trim() : ""
    if (!id) return []
    if (Array.isArray(row.enable_groups) && !row.enable_groups.includes("ktai")) return []
    const endpoints = Array.isArray(row.supported_endpoint_types) ? row.supported_endpoint_types : []
    if (!endpoints.includes("openai") && !endpoints.includes("openai-response")) return []
    return [model(id, typeof row.name === "string" ? row.name : undefined, typeof row.tags === "string" ? row.tags : "")]
  })
  return result.length ? result : fallback
}

function loadCatalog() {
  return Effect.promise(() =>
    fetch(PRICING_URL, { signal: AbortSignal.timeout(5_000) })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
  ).pipe(Effect.map(parseCatalog))
}

export const KtaiPlugin = define({
  id: PROVIDER_ID,
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((integrations) => {
      integrations.update(PROVIDER_ID, (integration) => (integration.name = "KTAI"))
      integrations.method.update({ integrationID: PROVIDER_ID, method: { type: "key", label: "KTAI API key" } })
      integrations.method.update({ integrationID: PROVIDER_ID, method: { type: "env", names: ["KTAI_API_KEY"] } })
    })

    yield* ctx.catalog.transform(
      Effect.fn(function* (catalog) {
        const models = yield* loadCatalog()
        catalog.provider.update(PROVIDER_ID, (provider) => {
          provider.name = "KTAI"
          provider.api = { type: "aisdk", package: NPM, url: API_URL }
        })
        const released = Date.parse(RELEASE_DATE) || 0
        for (const item of models) {
          catalog.model.update(PROVIDER_ID, item.id, (draft) => {
            draft.name = item.name
            draft.family = "ktai"
            draft.api = { id: item.id, type: "aisdk", package: NPM, url: API_URL }
            draft.capabilities = { tools: item.tools, input: [...item.input], output: ["text"] }
            draft.variants = []
            draft.time.released = released
            // 计费在平台侧（new-api/ledger/kt-billing），本地成本不作为事实源。
            draft.cost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }]
            draft.status = "active"
            draft.enabled = true
            draft.limit = { context: item.context, output: DEFAULT_OUTPUT }
          })
        }
      }),
    )
  }),
})
