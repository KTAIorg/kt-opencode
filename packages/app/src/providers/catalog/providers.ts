import { customerFacingProviderName } from "@/runtime/server/kt-settlement"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { normalizeProviderList } from "@/runtime/server/global-sync/utils"
import { Iterable, pipe } from "effect"
import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"
import type { ProviderListResponse } from "@/runtime/server/types"
import { useIntegrations } from "./integrations"
import { popularProviders } from "./order"

export { popularProviders } from "./order"

const emptyProviderCatalog: ProviderListResponse = { all: new Map(), connected: [], default: {} }

const popularProviderSet = new Set(popularProviders)

export function useProviders(directory: Accessor<string | undefined>) {
  const data = useData()
  const sdk = useServerSDK()

  const location = () => {
    const dir = directory()

    return dir ? { directory: dir } : undefined
  }

  // Catalog sync failures must reach a terminal state: keep the cause so the
  // composer can stop showing "loading" forever and offer a retry. Bound the
  // wait as well — while the server is still building its location layer the
  // underlying requests can hang far longer than a user would wait, and a
  // never-settling retry would keep `model.loading` (and everything gated on
  // it) stuck.
  const [failure, setFailure] = createSignal<unknown>()
  const retry = () => {
    setFailure(undefined)
    const task = (async () => {
      const ref = location()
      if (!ref) await data.location.syncInfo()
      const resolved = ref ?? data.location.default()
      await Promise.all([data.location.provider.sync(resolved), data.location.model.sync(resolved)])
    })()
    void Promise.race([
      task,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Provider catalog load timed out")), 30_000)),
    ]).catch((cause) => {
      console.error("Failed to load provider catalog", cause)
      setFailure(cause)
    })
  }

  createEffect(() => {
    if (sdk.connection.status() !== "connected") return
    retry()
  })
  const integrations = useIntegrations(directory)

  // Hold the last resolved catalog while a location change re-fetches: the
  // workspace directory can be re-resolved to a canonical form mid-session and
  // returning an empty catalog briefly would flicker `paid`/model lists and
  // unmount an open model popover.
  const providers = createMemo<ProviderListResponse>((prev) => {
    const ref = location()
    const provider = data.location.provider.list(ref)
    const model = data.location.model.list(ref)

    if (!provider || !model) return emptyProviderCatalog

    return normalizeProviderList(provider, model)
  }, emptyProviderCatalog)

  // Once any catalog has loaded, keep the composer rendered while the next
  // location's data streams in — the workspace directory can be re-resolved to
  // a canonical form mid-session, and treating that as "loading" would unmount
  // the controls (and close an open model popover).
  const [everLoaded, setEverLoaded] = createSignal(false)
  createEffect(() => {
    if (data.location.provider.list(location()) !== undefined && data.location.model.list(location()) !== undefined)
      setEverLoaded(true)
  })

  const ready = () => {
    const ref = location()

    return data.location.provider.list(ref) !== undefined && data.location.model.list(ref) !== undefined
  }

  return {
    ready: () => ready() || everLoaded(),
    error: failure,
    retry,
    all: () => providers().all,
    default: () => providers().default,
    // V2 servers list only available providers, so the connectable catalog
    // comes from the integration list, with the provider catalog as fallback.
    popular: () => {
      const catalog = integrations
        .list()
        .filter((integration) => popularProviderSet.has(integration.id))
        .map((integration) => ({ id: integration.id, name: integration.name }))

      const seen = new Set(catalog.map((integration) => integration.id))

      return pipe(
        providers().all,
        Iterable.map(([, p]) => p),
        Iterable.filter((p) => popularProviderSet.has(p.id) && !seen.has(p.id)),
        Iterable.map((p) => ({ id: p.id, name: customerFacingProviderName(p.id, p.name) })),
        (v) => [...catalog, ...v],
      )
    },
    connected: () => {
      const connected = new Set(providers().connected)

      return pipe(
        providers().all,
        Iterable.map(([, p]) => p),
        Iterable.filter((p) => connected.has(p.id)),
        (v) => Array.from(v),
      )
    },
    // Any stored or detected connection, or a provider with models beyond the keyless OpenCode catalog.
    // Undefined until both catalogs load, so callers never mistake loading for a first run.
    anyConnection: () => {
      if (!integrations.ready() || !ready()) return undefined

      if (integrations.list().some((integration) => integration.connections.length > 0)) return true

      return providers().connected.some(
        (id) => id !== "opencode" && Object.keys(providers().all.get(id)?.models ?? {}).length > 0,
      )
    },
    paid: () => {
      const connected = new Set(providers().connected)

      const paid = [
        ...Iterable.filter(
          providers().all,
          ([id]) =>
            connected.has(id) &&
            (id !== "opencode" || Object.values(providers().all.get(id)?.models ?? {}).some((m) => m.cost?.input)),
        ),
      ]

      return paid
    },
  }
}
