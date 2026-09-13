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
  // modelID → 探测结果（仅 Kito provider 的模型）。ok=false 表示渠道实测不可用。
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

  const applyProbe = (results: { results: ProbeResult[]; probedAt: number }) => {
    const next: Record<string, Omit<ProbeResult, "modelID">> = {}
    for (const item of results.results) next[item.modelID] = { ok: item.ok, status: item.status, error: item.error }
    setProbeStore("probe", {
      results: next,
      probedAt: results.probedAt,
      hideUnavailable: probeStore.probe.hideUnavailable,
    })
  }

  const probeIDs = () =>
    [...new Set(list().filter((model) => isKtaiProviderID(model.provider.id)).map((model) => model.id))]

  // 探测只有这一份实现：管理弹窗的「一键检测」和打开模型列表时的自动检测都走 run()。
  // 并发去重（探测中重复调用复用同一个 promise），silent 时不弹 toast（自动检测不能打扰用户）。
  const runProbe = (options?: { silent?: boolean }) => {
    if (probeRun) return probeRun
    const ids = probeIDs()
    if (ids.length === 0) return Promise.resolve()
    setProbeRunning(true)
    probeRun = executeProbe(ids, options?.silent === true).finally(() => {
      setProbeRunning(false)
      probeRun = undefined
    })
    return probeRun
  }

  // 列表被打开时调用：结果过期才跑，新鲜时不重复请求。
  const autoRunProbe = () => {
    if (!probeStale()) return
    void runProbe({ silent: true })
  }

  const executeProbe = async (ids: string[], silent: boolean) => {
    const url = serverSDK.url.replace(/\/+$/, "")
    const headers = new Headers({ "content-type": "application/json", accept: "application/json" })
    if (serverSDK.server.http.username && serverSDK.server.http.password) {
      headers.set("authorization", `Basic ${btoa(`${serverSDK.server.http.username}:${serverSDK.server.http.password}`)}`)
    }
    // server 限制每次探测最多 100 个模型，超限分批请求
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
    const results: ProbeResult[] = []
    try {
      for (const chunk of chunks) {
        const response = await (platform.fetch ?? fetch)(`${url}/ktai/models/probe`, {
          method: "POST",
          headers,
          body: JSON.stringify({ modelIDs: chunk }),
        })
        const payload = (await response.json().catch(() => undefined)) as
          | { results?: ProbeResult[]; probedAt?: number }
          | undefined
        if (!response.ok || !payload?.results) {
          if (!silent) showToast({ variant: "error", title: language.t("dialog.model.probe.failed") })
          return
        }
        results.push(...payload.results)
      }
      applyProbe({ results, probedAt: Date.now() })
      if (!silent) showToast({ variant: "success", title: language.t("dialog.model.probe.done") })
    } catch {
      if (!silent) showToast({ variant: "error", title: language.t("dialog.model.probe.failed") })
    }
  }

  return {
    ready,
    list,
    find,
    visible,
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
      result: (model: ModelKey) => probeStore.probe.results[model.modelID],
      stale: probeStale,
      running: probeRunning,
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
