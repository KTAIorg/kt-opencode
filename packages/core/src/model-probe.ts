export * as ModelProbe from "./model-probe.js"

import { Effect } from "effect"
import { Catalog } from "./catalog.js"
import { Credential } from "./credential.js"
import { Integration } from "./integration.js"
import { Model } from "./model.js"
import { Provider } from "./provider.js"

// 通用模型可用性探测：按 provider 的真实协议族发一个极小请求，
// 把「渠道死了/模型不存在」从「能列出但用不了」变成可显式呈现的状态。
// Kito provider 走 /ktai/models/probe（KT Identity 门控），这里服务其它渠道：
// OpenAI 兼容中转（占大头）、OpenAI Responses、Anthropic Messages、Gemini。
// 结果是探测时刻的快照，不做后台轮询——每次检测由用户显式触发。

export type ModelProbeResult = {
  modelID: string
  ok: boolean
  status?: number
  error?: string
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
export type { FetchLike }

const PROBE_CONCURRENCY = 5
const PROBE_TIMEOUT_MS = 12_000

type Protocol = "openai-chat" | "openai-responses" | "anthropic-messages" | "gemini"

// 包名 → HTTP 协议族。只收录探测语义明确的协议；
// bedrock（SigV4）、azure（部署 URL+api-version）、vertex（IAM）、copilot（专属 token 交换）、
// cohere/gitlab/sap 等非通用协议不在内——它们返回 "unsupported-protocol"，由调用方按模型汇报。
const OPENAI_CHAT_PACKAGES = new Set([
  "@ai-sdk/openai-compatible",
  "@opencode-ai/ai/providers/openai-compatible",
  "@ai-sdk/xai",
  "@opencode-ai/ai/providers/xai",
  "@ai-sdk/mistral",
  "@ai-sdk/groq",
  "@ai-sdk/cerebras",
  "@ai-sdk/deepinfra",
  "@ai-sdk/togetherai",
  "@ai-sdk/perplexity",
  "@ai-sdk/alibaba",
  "venice-ai-sdk-provider",
  "@openrouter/ai-sdk-provider",
  "@opencode-ai/ai/providers/openrouter",
  "@ai-sdk/gateway",
  "ai-gateway-provider",
])

const OPENAI_RESPONSES_PACKAGES = new Set([
  "@ai-sdk/openai",
  "@opencode-ai/ai/providers/openai",
  "@opencode-ai/ai/providers/openai/responses",
])

const ANTHROPIC_MESSAGES_PACKAGES = new Set([
  "@ai-sdk/anthropic",
  "@opencode-ai/ai/providers/anthropic",
  "@opencode-ai/ai/providers/anthropic-compatible",
])

const GEMINI_PACKAGES = new Set(["@ai-sdk/google", "@opencode-ai/ai/providers/google"])

// openai-chat 没有规范默认地址（自定义中转必须配 baseURL）；其余协议有官方默认端点。
const DEFAULT_BASE_URL: Record<Exclude<Protocol, "openai-chat">, string> = {
  "openai-responses": "https://api.openai.com/v1",
  "anthropic-messages": "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
}

export type ProbeTarget = {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export type ProbeFailure =
  | "unsupported-protocol"
  | "missing-base-url"
  | "unresolved-variables"
  | "missing-credential"

const protocolFor = (packageName: string | undefined): Protocol | undefined => {
  if (packageName === undefined) return undefined
  if (OPENAI_CHAT_PACKAGES.has(packageName)) return "openai-chat"
  if (OPENAI_RESPONSES_PACKAGES.has(packageName)) return "openai-responses"
  if (ANTHROPIC_MESSAGES_PACKAGES.has(packageName)) return "anthropic-messages"
  if (GEMINI_PACKAGES.has(packageName)) return "gemini"
  return undefined
}

/** 判断 catalog 投影出的模型是否走可探测协议（前端也用同一判定决定「一键检测」覆盖范围）。 */
export const supported = (model: Pick<Model.Info, "package">) =>
  protocolFor(Provider.packageName(model.package)) !== undefined

// 与 model-resolver 的 apiKey() 对齐：key 直连密钥、oauth 走 access token，
// 都没有时回落 settings.apiKey（config provider 内联密钥/公共渠道）。
const apiKey = (model: Pick<Model.Info, "settings">, credential?: Credential.Value) => {
  if (credential?.type === "key") return { kind: "api-key" as const, value: credential.key }
  if (credential?.type === "oauth") return { kind: "bearer" as const, value: credential.access }
  const apiKey = model.settings?.apiKey
  if (typeof apiKey === "string" && apiKey) return { kind: "api-key" as const, value: apiKey }
  const authToken = model.settings?.authToken
  if (typeof authToken === "string" && authToken) return { kind: "bearer" as const, value: authToken }
  return undefined
}

const authHeaders = (
  protocol: Protocol,
  key: { kind: "api-key" | "bearer"; value: string } | undefined,
): Record<string, string> => {
  if (key === undefined) return {}
  if (key.kind === "bearer") return { authorization: `Bearer ${key.value}` }
  if (protocol === "anthropic-messages") return { "x-api-key": key.value }
  if (protocol === "gemini") return { "x-goog-api-key": key.value }
  return { authorization: `Bearer ${key.value}` }
}

const probeBody = (protocol: Protocol, modelID: string, model: Pick<Model.Info, "compatibility">) => {
  if (protocol === "openai-chat") {
    return {
      model: modelID,
      [model.compatibility?.maxTokensField ?? "max_tokens"]: 1,
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    }
  }
  if (protocol === "openai-responses") {
    // reasoning 系模型要求 max_output_tokens >= 16，取最小合法值。
    return { model: modelID, max_output_tokens: 16, stream: false, input: "hi" }
  }
  if (protocol === "anthropic-messages") {
    return { model: modelID, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }
  }
  return {
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    generationConfig: { maxOutputTokens: 16 },
  }
}

const probeURL = (protocol: Protocol, baseURL: string, modelID: string) => {
  const base = baseURL.replace(/\/+$/, "")
  if (protocol === "openai-chat") return `${base}/chat/completions`
  if (protocol === "openai-responses") return `${base}/responses`
  if (protocol === "anthropic-messages") return `${base}/messages`
  return `${base}/models/${encodeURIComponent(modelID)}:generateContent`
}

/**
 * 为单个模型解析探测请求。model 必须是 catalog 投影后的 Info
 * （settings/headers/body/package 已合并 provider 层）。
 */
export function target(
  model: Pick<Model.Info, "id" | "modelID" | "package" | "settings" | "headers" | "body" | "compatibility">,
  provider: Pick<Provider.Info, "activation">,
  credential?: Credential.Value,
): { ok: true; target: ProbeTarget } | { ok: false; reason: ProbeFailure } {
  const protocol = protocolFor(Provider.packageName(model.package))
  if (!protocol) return { ok: false, reason: "unsupported-protocol" }
  const modelID = model.modelID ?? model.id
  const configured = typeof model.settings?.baseURL === "string" ? model.settings.baseURL : undefined
  const baseURL =
    configured?.replace(/\$\{([^}]+)\}/g, (placeholder, name: string) => process.env[name] ?? placeholder) ??
    (protocol === "openai-chat" ? undefined : DEFAULT_BASE_URL[protocol])
  if (baseURL === undefined) return { ok: false, reason: "missing-base-url" }
  if (/\$\{[^}]+\}/.test(baseURL)) return { ok: false, reason: "unresolved-variables" }
  const key = apiKey(model, credential)
  // 对齐 model-resolver：activation=enabled 且无凭据的 provider（本地/公共端点）按无鉴权探测；
  // 其它渠道缺凭据时如实汇报 missing-credential，而不是让整个接口 401。
  if (key === undefined && provider.activation !== "enabled") return { ok: false, reason: "missing-credential" }
  const body = probeBody(protocol, modelID, model)
  return {
    ok: true,
    target: {
      url: probeURL(protocol, baseURL, modelID),
      headers: {
        ...authHeaders(protocol, key),
        ...model.headers,
        "content-type": "application/json",
        accept: "application/json",
        ...(protocol === "anthropic-messages" ? { "anthropic-version": "2023-06-01" } : {}),
      },
      // 浅合并避免 decodeJsonRecord 对非 JSON 值抛错；探测只需 body 覆盖生效。
      body: model.body ? { ...body, ...model.body } : body,
    },
  }
}

async function send(
  fetchImpl: FetchLike,
  modelID: string,
  target: ProbeTarget,
  signal: AbortSignal,
): Promise<ModelProbeResult> {
  try {
    const response = await fetchImpl(target.url, {
      method: "POST",
      signal,
      headers: target.headers,
      body: JSON.stringify(target.body),
    })
    if (response.ok) return { modelID, ok: true, status: response.status }
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: { message?: string } | string }
      | undefined
    const message =
      typeof payload?.error === "string" ? payload.error : payload?.error?.message || `HTTP ${response.status}`
    return { modelID, ok: false, status: response.status, error: message.slice(0, 200) }
  } catch (error) {
    if (signal.aborted) return { modelID, ok: false, error: "timeout" }
    return { modelID, ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "network error" }
  }
}

/** 并发 5、整体超时 12s 的探测引擎，与 ktai 探测同一节奏。 */
export async function probe(
  requests: readonly { modelID: string; target: ProbeTarget }[],
  options?: { fetchImpl?: FetchLike },
) {
  const fetchImpl = options?.fetchImpl ?? fetch
  const results: ModelProbeResult[] = []
  const queue = [...requests]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      results.push(await send(fetchImpl, item.modelID, item.target, controller.signal))
    }
  }
  try {
    await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker))
  } finally {
    clearTimeout(timeout)
  }
  return results
}

// HTTP handler 与插件宿主共用的编排：解析凭据 → 逐模型 plan → 探测。
// 与 ModelResolver 同一套凭据来源：integration connection（key/oauth/env）→ resolve。
// resolve 失败按无凭据处理，由 target() 汇报 missing-credential，而不是让上层 401。
const PROBE_BATCH_LIMIT = 100
export const probeProvider = Effect.fn("ModelProbe.probeProvider")(function* (
  catalog: Catalog.Interface,
  integrations: Integration.Interface,
  provider: Provider.Info,
  modelIDs: readonly string[],
) {
  const ids = [...new Set(modelIDs.map((id) => id.trim()).filter(Boolean))].slice(0, PROBE_BATCH_LIMIT)
  const connection = yield* integrations.connection.active(
    provider.integrationID ?? Integration.ID.make(provider.id),
  )
  const credential = connection
    ? yield* integrations.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
    : undefined
  const planned: { modelID: string; target: ProbeTarget }[] = []
  const results: ModelProbeResult[] = []
  for (const id of ids) {
    const model = yield* catalog.model.get(provider.id, Model.ID.make(id))
    if (!model) {
      results.push({ modelID: id, ok: false, error: "unknown-model" })
      continue
    }
    const probeTarget = target(model, provider, credential)
    if (!probeTarget.ok) {
      results.push({ modelID: id, ok: false, error: probeTarget.reason })
      continue
    }
    planned.push({ modelID: id, target: probeTarget.target })
  }
  const probed = yield* Effect.promise(() => probe(planned))
  return { results: [...results, ...probed], probedAt: Date.now() }
})
