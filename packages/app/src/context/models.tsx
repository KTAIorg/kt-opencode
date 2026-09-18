import { type Accessor, createMemo, createResource, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { DateTime } from "luxon"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useProviders } from "@/hooks/use-providers"
import { Persist, persisted } from "@/utils/persist"
import { isKtaiProviderID } from "@/utils/ktai-model-order"
import { showToast } from "@/utils/toast"

export type ModelKey = { providerID: string; modelID: string }

type ProbeResult = { modelID: string; ok: boolean; status?: number; error?: string }

type Visibility = "show" | "hide"
type User = ModelKey & { visibility: Visibility; favorite?: boolean }
type Store = {
  user: User[]
  recent: ModelKey[]
  variant?: Record<string, string | undefined>
}

export type ProbeState = {
  // `${providerID}:${modelID}` → 探测结果。ok=false 表示渠道实测失败（含 missing-credential、限流）；
  // 展示层用 rateLimited()/unavailable() 把暂时限流和硬失败分开。
  results: Record<string, Omit<ProbeResult, "modelID">>
  probedAt?: number
  hideUnavailable: boolean
}

const RECENT_LIMIT = 5
const PROBE_STALE_MS = 1000 * 60 * 30

function modelKey(model: ModelKey) {
  return `${model.providerID}:${model.modelID}`
}

const createModelsPersistedState = () => {
  const [store, setStore, _, ready] = persisted(
    Persist.global("model"),
    createStore<Store>({
      user: [],
      recent: [],
      variant: {},
    }),
  )

  return [store, setStore, ready] as const
}

const createProbePersistedState = () => {
  const [store, setStore, _, ready] = persisted(
    Persist.global("model-probe"),
    createStore<{ probe: ProbeState }>({
      probe: { results: {}, hideUnavailable: false },
    }),
  )

  return [store, setStore, ready] as const
}

const createModelsController = (directory: Accessor<string | undefined>) => {
  const providers = useProviders(() => directory())
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()

  const [store, setStore, ready] = createModelsPersistedState()

  const available = createMemo(() =>
    providers.connected().flatMap((p) =>
      Object.values(p.models).map((m) => ({
        ...m,
        provider: p,
      })),
    ),
  )

  const release = createMemo(
    () =>
      new Map(
        available().map((model) => {
          const parsed = DateTime.fromISO(model.release_date)
          return [modelKey({ providerID: model.provider.id, modelID: model.id }), parsed] as const
        }),
      ),
  )

  const latest = createMemo(() =>
    pipe(
      available(),
      filter(
        (x) =>
          Math.abs(
            (release().get(modelKey({ providerID: x.provider.id, modelID: x.id })) ?? DateTime.invalid("invalid"))
              .diffNow()
              .as("months"),
          ) < 6,
      ),
      groupBy((x) => x.provider.id),
      mapValues((models) =>
        pipe(
          models,
          groupBy((x) => x.family),
          values(),
          (groups) =>
            groups.flatMap((g) => {
              const first = firstBy(g, [(x) => x.release_date, "desc"])
              return first ? [{ modelID: first.id, providerID: first.provider.id }] : []
            }),
        ),
      ),
      values(),
      flat(),
    ),
  )

  const latestSet = createMemo(() => new Set(latest().map((x) => modelKey(x))))

  const visibility = createMemo(() => {
    const map = new Map<string, Visibility>()
    for (const item of store.user) map.set(`${item.providerID}:${item.modelID}`, item.visibility)
    return map
  })

  const list = createMemo(() =>
    available().map((m) => ({
      ...m,
      name: m.name.replace("(latest)", "").trim(),
      latest: m.name.includes("(latest)"),
    })),
  )

  const find = (key: ModelKey) => list().find((m) => m.id === key.modelID && m.provider.id === key.providerID)

  function update(model: ModelKey, state: Visibility) {
    const index = store.user.findIndex((x) => x.modelID === model.modelID && x.providerID === model.providerID)
    if (index >= 0) {
      setStore("user", index, (current) => ({ ...current, visibility: state }))
      return
    }
    setStore("user", store.user.length, { ...model, visibility: state })
  }

  const visible = (model: ModelKey) => {
    const key = modelKey(model)
    const state = visibility().get(key)
    if (state === "hide") return false
    if (state === "show") return true
    if (latestSet().has(key)) return true
    const date = release().get(key)
    if (!date?.isValid) return true
    return false
  }

  const setVisibility = (model: ModelKey, state: boolean) => {
    update(model, state ? "show" : "hide")
  }

  // 用户显式关掉的模型（visible 为 false 也可能只是"不是最新版"的默认隐藏，两者要分开）。
  const hiddenByUser = (model: ModelKey) => visibility().get(modelKey(model)) === "hide"

  const push = (model: ModelKey) => {
    const uniq = uniqueBy([model, ...store.recent], (x) => `${x.providerID}:${x.modelID}`)
    if (uniq.length > RECENT_LIMIT) uniq.pop()
    setStore("recent", uniq)
  }

  const variantKey = (model: ModelKey) => `${model.providerID}/${model.modelID}`
  const getVariant = (model: ModelKey) => store.variant?.[variantKey(model)]

  const setVariant = (model: ModelKey, value: string | undefined) => {
    const key = variantKey(model)
    if (!store.variant) {
      setStore("variant", { [key]: value })
      return
    }
    setStore("variant", key, value)
  }

  const [recentModels] = createResource(
    async () => {
      const recent = store.recent
      await ready.promise
      return recent
    },
    (p) => p,
    { initialValue: [] },
  )

  const [probeStore, setProbeStore, probeReady] = createProbePersistedState()
  const [probeRunning, setProbeRunning] = createSignal(false)
  let probeRun: Promise<void> | undefined

  const probeStale = () => {
    const at = probeStore.probe.probedAt
    return at === undefined || Date.now() - at > PROBE_STALE_MS
  }

  const applyProbe = (results: { providerID: string; results: ProbeResult[] }[], probedAt: number) => {
    const next: Record<string, Omit<ProbeResult, "modelID">> = {}
    for (const group of results) {
      for (const item of group.results) {
        next[`${group.providerID}:${item.modelID}`] = { ok: item.ok, status: item.status, error: item.error }
      }
    }
    setProbeStore("probe", {
      results: next,
      probedAt,
      hideUnavailable: probeStore.probe.hideUnavailable,
    })
  }

  // 限流（429/免费额度窗口）是暂时状态，不算「不可用」：徽标橙显，「隐藏不可用」也不滤掉。
  const rateLimited = (model: ModelKey) => {
    const result = probeStore.probe.results[modelKey(model)]
    return result?.ok === false && (result.status === 429 || /rate limit/i.test(result.error ?? ""))
  }

  // 硬失败（403/401/缺凭据/网络错误）：只有这类参与「隐藏不可用」的过滤与计数。
  const unavailable = (model: ModelKey) =>
    probeStore.probe.results[modelKey(model)]?.ok === false && !rateLimited(model)

  // 协议族可探测的 aisdk 包名（去掉 "aisdk:" 前缀后与 server 端 ModelProbe 的映射保持一致）。
  // Kito provider 不算在内——它走 /ktai/models/probe（KT Identity 门控）。
  const PROBEABLE_PACKAGES = new Set([
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
    "@ai-sdk/openai",
    "@opencode-ai/ai/providers/openai",
    "@opencode-ai/ai/providers/openai/responses",
    "@ai-sdk/anthropic",
    "@opencode-ai/ai/providers/anthropic",
    "@opencode-ai/ai/providers/anthropic-compatible",
    "@ai-sdk/google",
    "@opencode-ai/ai/providers/google",
  ])

  const probeable = (model: { provider: { id: string }; api?: { npm?: string } }) => {
    if (isKtaiProviderID(model.provider.id)) return true
    const npm = typeof model.api?.npm === "string" ? model.api.npm.replace(/^aisdk:/, "") : undefined
    return npm !== undefined && PROBEABLE_PACKAGES.has(npm)
  }

  // 可探测模型按 provider 分组：ktai 组走 /ktai/models/probe，其余走通用 provider 探测端点。
  // auto 时排除 opencode（zen 匿名免费池）：探测是真实对话请求，自动跑会消耗免费额度、
  // 自我制造 429；手动「一键检测」仍然覆盖它。
  const probeTargets = (options?: { auto?: boolean }) => {
    const groups = new Map<string, string[]>()
    for (const model of list()) {
      if (!probeable(model)) continue
      if (options?.auto && model.provider.id === "opencode") continue
      const group = groups.get(model.provider.id) ?? []
      if (!group.includes(model.id)) group.push(model.id)
      groups.set(model.provider.id, group)
    }
    return groups
  }

  // 探测只有这一份实现：管理弹窗的「一键检测」和打开模型列表时的自动检测都走 run()。
  // 并发去重（探测中重复调用复用同一个 promise），silent 时不弹 toast（自动检测不能打扰用户）。
  const runProbe = (options?: { silent?: boolean; auto?: boolean }) => {
    if (probeRun) return probeRun
    const targets = probeTargets({ auto: options?.auto })
    if (targets.size === 0) return Promise.resolve()
    setProbeRunning(true)
    probeRun = executeProbe(targets, options?.silent === true).finally(() => {
      setProbeRunning(false)
      probeRun = undefined
    })
    return probeRun
  }

  // 列表被打开时调用：结果过期才跑，新鲜时不重复请求。
  const autoRunProbe = () => {
    if (!probeStale()) return
    void runProbe({ silent: true, auto: true })
  }

  const executeProbe = async (targets: Map<string, string[]>, silent: boolean) => {
    const url = serverSDK.url.replace(/\/+$/, "")
    const headers = new Headers({ "content-type": "application/json", accept: "application/json" })
    if (serverSDK.server.http.username && serverSDK.server.http.password) {
      headers.set("authorization", `Basic ${btoa(`${serverSDK.server.http.username}:${serverSDK.server.http.password}`)}`)
    }
    const dir = directory()
    const location = dir ? `?location[directory]=${encodeURIComponent(dir)}` : ""
    const grouped: { providerID: string; results: ProbeResult[] }[] = []
    let failed = false
    for (const [providerID, ids] of targets) {
      const ktai = isKtaiProviderID(providerID)
      // server 限制每次探测最多 100 个模型，超限分批请求
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
      const results: ProbeResult[] = []
      try {
        for (const chunk of chunks) {
          const endpoint = ktai
            ? `${url}/ktai/models/probe`
            : `${url}/api/provider/${encodeURIComponent(providerID)}/models/probe${location}`
          const response = await (platform.fetch ?? fetch)(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ modelIDs: chunk }),
          })
          const payload = (await response.json().catch(() => undefined)) as
            | {
                results?: ProbeResult[]
                data?: { results?: ProbeResult[] }
                probedAt?: number
                message?: string
                error?: string
              }
            | undefined
          const probed = payload?.results ?? payload?.data?.results
          if (!response.ok || !probed) {
            // 未登录时手动检测要引导登录：派发事件由全局监听打开登录弹窗。
            // 静默自动检测不打扰（顶栏已有登录入口），避免每次打开模型列表都弹窗。
            if (response.status === 401 && ktai && !silent) {
              window.dispatchEvent(new Event("kito-login-required"))
            }
            throw new Error(payload?.message ?? payload?.error ?? `HTTP ${response.status}`)
          }
          results.push(...probed)
        }
      } catch (error) {
        failed = true
        if (!silent) {
          showToast({
            variant: "error",
            title: language.t("dialog.model.probe.failed"),
            description: error instanceof Error ? error.message : undefined,
          })
        }
        continue
      }
      grouped.push({ providerID, results })
    }
    if (grouped.length > 0) applyProbe(grouped, Date.now())
    if (!silent && !failed) showToast({ variant: "success", title: language.t("dialog.model.probe.done") })
  }

  return {
    ready,
    list,
    find,
    visible,
    hiddenByUser,
    setVisibility,
    recent: {
      list: () => recentModels()!,
      push,
    },
    variant: {
      get: getVariant,
      set: setVariant,
    },
    probe: {
      ready: probeReady,
      state: () => {
        void probeReady.promise
        return probeStore.probe
      },
      result: (model: ModelKey) => probeStore.probe.results[modelKey(model)],
      rateLimited,
      unavailable,
      stale: probeStale,
      running: probeRunning,
      // 可探测模型数（含 Kito 与已配置的其它协议渠道），「一键检测」按钮据此置灰。
      probeable: () => [...probeTargets().values()].reduce((count, ids) => count + ids.length, 0),
      run: runProbe,
      autoRun: autoRunProbe,
      setHideUnavailable: (value: boolean) => setProbeStore("probe", "hideUnavailable", value),
      apply: applyProbe,
    },
  }
}

export const { use: useModels, provider: ModelsProvider } = createSimpleContext({
  name: "Models",
  gate: false,
  init: (props: { directory?: string | Accessor<string | undefined> } = {}) => {
    return createModelsController(() => (typeof props.directory === "function" ? props.directory() : props.directory))
  },
})
