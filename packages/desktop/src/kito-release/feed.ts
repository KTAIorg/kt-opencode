import { channelOrDefault, KITO_APP_ID } from "./ids"

export type KitoUpdaterSource =
  | { kind: "github" }
  | { kind: "hold" }
  | { kind: "generic"; baseUrl: string; version?: string }

export type SelectKitoUpdaterSourceInput = {
  currentVersion: string
  platform: string
  arch: string
  channel?: string
  appId?: string
  publicBaseUrl?: string
  fetchImpl?: typeof fetch
}

export async function selectKitoUpdaterSource(input: SelectKitoUpdaterSourceInput): Promise<KitoUpdaterSource> {
  const appId = input.appId ?? KITO_APP_ID
  const channel = channelOrDefault(input.channel)
  const baseUrl = (input.publicBaseUrl ?? "https://updates.ktyun.cc").replace(/\/+$/, "")
  const fetchImpl = input.fetchImpl ?? fetch
  const history = await readHistory(fetchImpl, baseUrl, appId, channel)
  if (!history || history.length === 0) return { kind: "github" }

  const resolved = await resolveUpdate(fetchImpl, baseUrl, {
    appId,
    channel,
    currentVersion: input.currentVersion,
    platform: input.platform,
    arch: input.arch,
  })
  if (resolved?.decision === "update_available" || resolved?.decision === "force_update") {
    if (resolved.baseUrl) return { kind: "generic", baseUrl: resolved.baseUrl, version: resolved.version }
  }
  return { kind: "hold" }
}

async function readHistory(fetchImpl: typeof fetch, baseUrl: string, appId: string, channel: string) {
  const response = await fetchImpl(
    `${baseUrl}/api/v1/apps/${encodeURIComponent(appId)}/releases/history?channel=${encodeURIComponent(channel)}`,
    { headers: { Accept: "application/json" } },
  ).catch(() => undefined)
  if (!response?.ok) return
  const payload = await readJson(response)
  return itemsOf(unwrapData(payload)).filter((item) => typeof item === "object")
}

async function resolveUpdate(
  fetchImpl: typeof fetch,
  baseUrl: string,
  input: { appId: string; channel: string; currentVersion: string; platform: string; arch: string },
) {
  const response = await fetchImpl(`${baseUrl}/api/v1/apps/${encodeURIComponent(input.appId)}/updates/resolve`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      traceId: `kito-updater-${input.currentVersion}-${input.platform}-${input.arch}`,
      currentVersion: input.currentVersion,
      channel: input.channel,
      platform: input.platform,
      arch: input.arch,
      locale: "zh-CN",
    }),
  }).catch(() => undefined)
  if (!response?.ok) return
  const payload = unwrapData(await readJson(response))
  if (!isRecord(payload)) return
  const feed = isRecord(payload.feed) ? payload.feed : undefined
  return {
    decision: typeof payload.decision === "string" ? payload.decision : "",
    version: typeof payload.targetVersion === "string" ? payload.targetVersion : undefined,
    baseUrl: feed && typeof feed.baseUrl === "string" ? feed.baseUrl : undefined,
  }
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return
  return JSON.parse(text) as unknown
}

function unwrapData(payload: unknown) {
  if (!isRecord(payload) || !("data" in payload)) return payload
  return payload.data
}

function itemsOf(payload: unknown) {
  if (Array.isArray(payload)) return payload
  if (isRecord(payload) && Array.isArray(payload.items)) return payload.items
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
