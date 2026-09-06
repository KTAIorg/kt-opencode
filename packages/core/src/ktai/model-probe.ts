import { KTAI_API_URL } from "./catalog"

// 模型可用性探测：对 NewAPI 发一个 max_tokens=1 的极小 chat 请求。
// 目的是把「渠道死了/模型不存在」从「能列出但用不了」变成可显式呈现的状态，
// 供管理模型面板的一键检测与选择器的「隐藏不可用」开关消费。
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

async function probeModel(
  fetchImpl: FetchLike,
  apiKey: string,
  modelID: string,
  signal: AbortSignal,
): Promise<ModelProbeResult> {
  try {
    const response = await fetchImpl(`${KTAI_API_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        model: modelID,
        max_tokens: 1,
        stream: false,
        messages: [{ role: "user", content: "hi" }],
      }),
    })
    if (response.ok) return { modelID, ok: true, status: response.status }
    const payload = (await response.json().catch(() => undefined)) as { error?: { message?: string } | string } | undefined
    const message =
      typeof payload?.error === "string" ? payload.error : payload?.error?.message || `HTTP ${response.status}`
    return { modelID, ok: false, status: response.status, error: message.slice(0, 200) }
  } catch (error) {
    if (signal.aborted) return { modelID, ok: false, error: "timeout" }
    return { modelID, ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "network error" }
  }
}

export async function probeKtaiModels(
  modelIDs: string[],
  apiKey: string,
  options?: { fetchImpl?: FetchLike },
) {
  if (!apiKey) return { ok: false as const, reason: "missing-api-key" as const }
  const fetchImpl = options?.fetchImpl ?? fetch
  const results: ModelProbeResult[] = []
  const queue = [...modelIDs]
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      results.push(await probeModel(fetchImpl, apiKey, item, controller.signal))
    }
  }
  try {
    await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker))
  } finally {
    clearTimeout(timeout)
  }
  return { ok: true as const, results }
}
