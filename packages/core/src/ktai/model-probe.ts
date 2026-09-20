import { KTAI_API_URL } from "./catalog"
import { ModelProbe } from "../model-probe"

// Kito 渠道模型可用性探测：对 NewAPI 发一个 max_tokens=1 的极小 chat 请求。
// 目的是把「渠道死了/模型不存在」从「能列出但用不了」变成可显式呈现的状态，
// 供管理模型面板的一键检测与选择器的「隐藏不可用」开关消费。
// 结果是探测时刻的快照，不做后台轮询——每次检测由用户显式触发。
// 探测引擎与通用 provider 探测共享（core/model-probe.ts，并发 5、超时 12s）。

export type ModelProbeResult = ModelProbe.ModelProbeResult
export type FetchLike = ModelProbe.FetchLike

export async function probeKtaiModels(
  modelIDs: string[],
  apiKey: string,
  options?: { fetchImpl?: FetchLike; signal?: AbortSignal },
) {
  if (!apiKey) return { ok: false as const, reason: "missing-api-key" as const }
  const results = await ModelProbe.probe(
    modelIDs.map((modelID) => ({
      modelID,
      target: {
        url: `${KTAI_API_URL}/chat/completions`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: {
          model: modelID,
          max_tokens: 1,
          stream: false,
          messages: [{ role: "user", content: "hi" }],
        },
      },
    })),
    options,
  )
  return { ok: true as const, results }
}
