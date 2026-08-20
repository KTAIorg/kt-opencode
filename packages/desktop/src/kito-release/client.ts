export type ReleaseRequest = {
  method: string
  path: string
  body?: unknown
  entry?: "admin" | "public"
}

export type ReleaseClient = {
  request(input: ReleaseRequest): Promise<unknown>
}

export type ReleaseClientOptions = {
  adminBaseUrl: string
  publicBaseUrl?: string
  token?: string
  dryRun?: boolean
  fetchImpl?: typeof fetch
}

export class ReleaseHttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function createReleaseClient(input: ReleaseClientOptions): ReleaseClient {
  const adminBaseUrl = input.adminBaseUrl.replace(/\/+$/, "")
  const publicBaseUrl = (input.publicBaseUrl ?? "https://updates.ktyun.cc").replace(/\/+$/, "")
  const fetchImpl = input.fetchImpl ?? fetch

  return {
    async request(request) {
      const root = request.entry === "public" ? publicBaseUrl : adminBaseUrl
      const url = `${root}${request.path}`
      if (input.dryRun) {
        console.log(`[dry-run] ${request.method} ${url}`)
        if (request.body !== undefined) console.log(JSON.stringify(request.body, null, 2))
        return dryRunPayload(request)
      }

      const response = await fetchImpl(url, {
        method: request.method,
        headers: {
          Accept: "application/json",
          ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      })
      const payload = await readJson(response)
      if (response.ok) return unwrapData(payload)
      throw new ReleaseHttpError(response.status, errorCode(payload), errorMessage(payload, response.status, request))
    },
  }
}

export function isAlreadyExists(error: unknown) {
  return error instanceof ReleaseHttpError && (error.status === 409 || error.code === "already_exists")
}

export function isStateConflict(error: unknown) {
  return error instanceof ReleaseHttpError && error.code === "state_conflict"
}

function dryRunPayload(request: ReleaseRequest) {
  if (request.path.endsWith("/publish")) {
    return { status: "published", rolloutPercent: 0 }
  }
  if (request.path.includes("/updates/resolve")) {
    return { decision: "no_update" }
  }
  if (request.method === "GET" && request.path.endsWith("/apps")) {
    return { items: [{ appId: "kito", displayName: "Kito" }] }
  }
  return {}
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return undefined
  return JSON.parse(text) as unknown
}

function unwrapData(payload: unknown) {
  if (!isRecord(payload) || !("data" in payload)) return payload
  return payload.data
}

function errorCode(payload: unknown) {
  const error = isRecord(payload) ? payload.error : undefined
  return isRecord(error) && typeof error.code === "string" ? error.code : ""
}

function errorMessage(payload: unknown, status: number, request: ReleaseRequest) {
  const error = isRecord(payload) ? payload.error : undefined
  if (isRecord(error) && typeof error.message === "string") return `${request.method} ${request.path} failed: ${status} ${error.message}`
  if (isRecord(payload) && typeof payload.message === "string") return `${request.method} ${request.path} failed: ${status} ${payload.message}`
  return `${request.method} ${request.path} failed: ${status}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
