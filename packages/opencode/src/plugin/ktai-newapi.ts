import { Global } from "@opencode-ai/core/global"
import path from "path"

export const KTAI_NEWAPI_BASE_URL = "https://ktapi.cc"
export const KTAI_MANAGED_TOKEN_NAME = "kito"
export const KTAI_API_AUTH_ID = "ktai-api"

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type ManagedToken = {
  key: string
  created: boolean
  name: string
}

export type DepositAddress = {
  chain: string
  asset: string
  address: string
}

type JsonRecord = Record<string, unknown>

function newapiBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.KTAI_NEWAPI_BASE_URL?.trim() || env.KTAPI_BASE_URL?.trim()
  return value ? value.replace(/\/+$/, "") : KTAI_NEWAPI_BASE_URL
}

export function managedApiKeyPath() {
  return path.join(Global.Path.data, "ktai-api-key.json")
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" ? (value as JsonRecord) : undefined
}

function stringField(value: unknown, ...keys: string[]): string | undefined {
  const record = asRecord(value)
  if (!record) return
  for (const key of keys) {
    const item = record[key]
    if (typeof item === "string" && item.trim()) return item.trim()
  }
  if (record.data) return stringField(record.data, ...keys)
  return
}

function formatRelayKey(key: string) {
  return key.startsWith("sk-") ? key : `sk-${key}`
}

function cookieHeader(response: Response) {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []
  const pairs = cookies
    .map((entry) => entry.split(";")[0]?.trim())
    .filter((entry): entry is string => Boolean(entry))
  return pairs.length ? pairs.join("; ") : undefined
}

export async function persistManagedApiKey(key: string) {
  const file = managedApiKeyPath()
  await Bun.write(file, JSON.stringify({ name: KTAI_MANAGED_TOKEN_NAME, key: formatRelayKey(key) }))
}

export async function readManagedApiKey(): Promise<string | undefined> {
  if (process.env.KTAI_API_KEY?.trim()) return process.env.KTAI_API_KEY.trim()
  try {
    const sidecar = (await Bun.file(managedApiKeyPath()).json()) as { key?: unknown }
    if (typeof sidecar.key === "string" && sidecar.key.trim()) return sidecar.key.trim()
  } catch {
    // no sidecar yet
  }
  try {
    const data = (await Bun.file(path.join(Global.Path.data, "auth.json")).json()) as Record<
      string,
      { type?: string; key?: string }
    >
    const stored = data[KTAI_API_AUTH_ID] ?? data.ktai
    if (stored?.type === "api" && typeof stored.key === "string" && stored.key.trim()) return stored.key.trim()
  } catch {
    // no stored key yet
  }
  return
}

async function tryDedicatedTokenEnsure(
  identityToken: string,
  baseUrl: string,
  fetchImpl: FetchLike,
): Promise<ManagedToken | undefined> {
  const response = await fetchImpl(`${baseUrl}/api/iam/token/ensure`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${identityToken}`,
    },
    body: JSON.stringify({ name: KTAI_MANAGED_TOKEN_NAME }),
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) return
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(stringField(payload, "message", "error") ?? `NewAPI token ensure failed (${response.status})`)
  }
  const key = stringField(payload, "key")
  if (!key) throw new Error("NewAPI token ensure returned no key")
  const created = asRecord(payload)?.created === true || asRecord(asRecord(payload)?.data)?.created === true
  return { key: formatRelayKey(key), created, name: KTAI_MANAGED_TOKEN_NAME }
}

function userIdFrom(payload: unknown): string | undefined {
  const record = asRecord(payload)
  const data = asRecord(record?.data) ?? record
  const id = data?.id
  if (typeof id === "number" && Number.isFinite(id)) return String(id)
  if (typeof id === "string" && id.trim()) return id.trim()
  return
}

function tokenRows(payload: unknown): JsonRecord[] {
  const record = asRecord(payload)
  const data = record?.data
  if (Array.isArray(data)) return data.filter((row): row is JsonRecord => Boolean(asRecord(row)))
  const items = asRecord(data)?.items
  if (Array.isArray(items)) return items.filter((row): row is JsonRecord => Boolean(asRecord(row)))
  return []
}

async function sessionJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<{ payload: unknown; cookie?: string; status: number }> {
  const response = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) })
  return {
    payload: await readJson(response),
    cookie: cookieHeader(response),
    status: response.status,
  }
}

async function ensureViaSession(
  identityToken: string,
  baseUrl: string,
  fetchImpl: FetchLike,
): Promise<ManagedToken> {
  const ensured = await sessionJson(fetchImpl, `${baseUrl}/api/iam/ensure`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${identityToken}`,
    },
    body: "{}",
  })
  if (ensured.status >= 400) {
    throw new Error(stringField(ensured.payload, "message", "error") ?? `NewAPI ensure failed (${ensured.status})`)
  }
  const cookie = ensured.cookie
  if (!cookie) throw new Error("NewAPI ensure did not return a session cookie")
  const userId = userIdFrom(ensured.payload)
  if (!userId) throw new Error("NewAPI ensure did not return a user id")
  const sessionHeaders = {
    accept: "application/json",
    cookie,
    "New-Api-User": userId,
  }

  const list = async () => {
    const result = await sessionJson(fetchImpl, `${baseUrl}/api/token/?p=1&size=100`, {
      method: "GET",
      headers: sessionHeaders,
    })
    if (result.status >= 400) {
      throw new Error(stringField(result.payload, "message", "error") ?? `NewAPI token list failed (${result.status})`)
    }
    return tokenRows(result.payload).find((row) => {
      const name = typeof row.name === "string" ? row.name.trim().toLowerCase() : ""
      return name === KTAI_MANAGED_TOKEN_NAME
    })
  }

  let row = await list()
  let created = false
  if (!row) {
    const createdToken = await sessionJson(fetchImpl, `${baseUrl}/api/token/`, {
      method: "POST",
      headers: {
        ...sessionHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: KTAI_MANAGED_TOKEN_NAME,
        unlimited_quota: true,
        expired_time: -1,
      }),
    })
    if (createdToken.status >= 400 || asRecord(createdToken.payload)?.success === false) {
      throw new Error(
        stringField(createdToken.payload, "message", "error") ?? `NewAPI token create failed (${createdToken.status})`,
      )
    }
    created = true
    row = await list()
  }
  const id = typeof row?.id === "number" ? row.id : Number(row?.id)
  if (!Number.isFinite(id)) throw new Error("NewAPI managed token id was missing")

  const keyResult = await sessionJson(fetchImpl, `${baseUrl}/api/token/${id}/key`, {
    method: "POST",
    headers: sessionHeaders,
  })
  const key = stringField(keyResult.payload, "key")
  if (keyResult.status >= 400 || !key) {
    throw new Error(stringField(keyResult.payload, "message", "error") ?? `NewAPI token key failed (${keyResult.status})`)
  }
  return { key: formatRelayKey(key), created, name: KTAI_MANAGED_TOKEN_NAME }
}

export async function ensureManagedToken(
  identityToken: string,
  input: { baseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<ManagedToken> {
  const baseUrl = input.baseUrl ?? newapiBaseUrl()
  const fetchImpl = input.fetchImpl ?? fetch
  const dedicated = await tryDedicatedTokenEnsure(identityToken, baseUrl, fetchImpl)
  if (dedicated) return dedicated
  return ensureViaSession(identityToken, baseUrl, fetchImpl)
}

export async function fetchDepositAddress(
  identityToken: string,
  input: { chain?: string; asset?: string; baseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<DepositAddress> {
  const baseUrl = input.baseUrl ?? newapiBaseUrl()
  const fetchImpl = input.fetchImpl ?? fetch
  const chain = input.chain ?? "tron"
  const asset = input.asset ?? "USDT"
  const query = new URLSearchParams({ chain, asset })
  const paths = [`/api/iam/deposit-address?${query}`, `/wallet/v1/deposit-address?${query}`]
  let last = "Deposit address API is not available yet"
  for (const pathName of paths) {
    const response = await fetchImpl(`${baseUrl}${pathName}`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${identityToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    const payload = await readJson(response)
    if (response.status === 404 || typeof payload === "string") {
      last = stringField(payload, "message", "error") ?? last
      continue
    }
    if (!response.ok) {
      throw new Error(stringField(payload, "message", "error") ?? `Deposit address failed (${response.status})`)
    }
    const address = stringField(payload, "address")
    if (!address) {
      last = "Deposit address API is not available yet"
      continue
    }
    return {
      chain: stringField(payload, "chain") ?? chain,
      asset: stringField(payload, "asset") ?? asset,
      address,
    }
  }
  throw new Error(last)
}

export async function syncManagedToken(identityToken: string, input: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const current = await readManagedApiKey()
  const token = await ensureManagedToken(identityToken, input)
  if (current !== token.key) await persistManagedApiKey(token.key)
  return { ...token, updated: current !== token.key }
}
