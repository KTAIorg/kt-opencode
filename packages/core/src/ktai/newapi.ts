import { Global } from "@opencode-ai/util/global"
import path from "path"
import { fetchAccountMe } from "./identity"

export const KTAI_NEWAPI_BASE_URL = "https://ktapi.cc"
export const KTAI_WALLET_FALLBACK_BASE_URL = "https://newapi-test.ktyun.cc"
export const KTAI_SETTLEMENT_APP_ID = "2079689277851045900"
export const KTAI_RECHARGE_CALLBACK_URL = "http://kt-billing.kt-billing-prod.svc.cluster.local/recharge/crypto/webhook"
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

export type KtpayMethod = {
  name: string
  type: string
}

export type KtpayInfo = {
  enabled: boolean
  methods: KtpayMethod[]
  minTopup: number
  maxTopup: number
  amountOptions: number[]
  appId?: string
  defaultLang?: string
  sdkUrl?: string
}

export type KtpayOrder = {
  orderId: string
  cashierUrl: string
  amount: number
  requested: number
  status: string
}

export type KtpayStatus = {
  orderId: string
  status: string
  localStatus: string
  settled: boolean
}

type JsonRecord = Record<string, unknown>

function newapiBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.KTAI_NEWAPI_BASE_URL?.trim() || env.KTAPI_BASE_URL?.trim()
  return value ? value.replace(/\/+$/, "") : KTAI_NEWAPI_BASE_URL
}

function walletBaseUrls(explicit?: string, env: NodeJS.ProcessEnv = process.env) {
  if (explicit?.trim()) return [explicit.trim().replace(/\/+$/, "")]
  const primary = newapiBaseUrl(env)
  const fallback = (env.KTAI_WALLET_BASE_URL?.trim() || KTAI_WALLET_FALLBACK_BASE_URL).replace(/\/+$/, "")
  return primary === fallback ? [primary] : [primary, fallback]
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

function numberField(value: unknown, ...keys: string[]): number | undefined {
  const record = asRecord(value)
  if (!record) return
  for (const key of keys) {
    const item = record[key]
    if (typeof item === "number" && Number.isFinite(item)) return item
    if (typeof item === "string" && item.trim() && Number.isFinite(Number(item))) return Number(item)
  }
  if (record.data) return numberField(record.data, ...keys)
  return
}

function stringField(value: unknown, ...keys: string[]): string | undefined {
  const record = asRecord(value)
  if (!record) return
  for (const key of keys) {
    const item = record[key]
    if (typeof item === "string" && item.trim()) return item.trim()
    const nested = asRecord(item)
    if (typeof nested?.message === "string" && nested.message.trim()) return nested.message.trim()
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

export function normalizeDepositChain(value?: string) {
  const chain = value?.trim().toLowerCase() ?? ""
  if (chain === "eth" || chain === "erc20" || chain === "ethereum") return "ethereum"
  if (chain === "trx" || chain === "trc20" || chain === "tron" || chain === "") return "tron"
  return chain
}

export function assetsForChain(chain: string) {
  if (normalizeDepositChain(chain) === "ethereum") return ["USDT", "USDC"]
  return ["USDT"]
}

export function addressLooksLikeChain(address: string, chain: string) {
  const value = address.trim()
  if (!value) return false
  const normalized = normalizeDepositChain(chain)
  if (normalized === "ethereum") return value.toLowerCase().startsWith("0x")
  if (normalized === "tron") return value.startsWith("T")
  return true
}

function billingBaseUrls(explicit?: string, env: NodeJS.ProcessEnv = process.env) {
  if (explicit?.trim()) return []
  const value = env.KTAI_BILLING_BASE_URL?.trim()
  return value ? [value.replace(/\/+$/, "")] : []
}

function settlementAddressUrl(
  input: { baseUrl?: string; settlementBaseUrl?: string },
  env: NodeJS.ProcessEnv = process.env,
) {
  if (input.settlementBaseUrl?.trim()) return input.settlementBaseUrl.trim().replace(/\/+$/, "")
  if (input.baseUrl?.trim()) return
  const value = env.KTAI_SETTLEMENT_ADDRESS_URL?.trim()
  return value ? value.replace(/\/+$/, "") : undefined
}

function depositFromPayload(payload: unknown, chain: string, asset: string): DepositAddress | undefined {
  const address = stringField(payload, "address")
  if (!address || !addressLooksLikeChain(address, chain)) return
  return {
    chain: normalizeDepositChain(stringField(payload, "chain") ?? chain),
    asset: stringField(payload, "asset") ?? asset,
    address,
  }
}

async function readDepositResponse(
  fetchImpl: FetchLike,
  url: string,
  identityToken: string,
): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${identityToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  return { ok: response.ok, status: response.status, payload: await readJson(response) }
}

async function assignSettlementAddress(
  identityToken: string,
  chain: string,
  asset: string,
  input: { fetchImpl: FetchLike; baseUrl: string; env?: NodeJS.ProcessEnv },
): Promise<DepositAddress | undefined> {
  const fetchImpl = input.fetchImpl
  const env = input.env ?? process.env
  const tenantID = (await fetchAccountMe(identityToken, undefined, fetchImpl)).id.replaceAll("-", "")
  const query = new URLSearchParams({ tenant_id: tenantID, chain, page_size: "20" })
  const listed = await fetchImpl(`${input.baseUrl}/api/v1/address/list?${query}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  })
  const listedPayload = await readJson(listed)
  const existing = settlementAddressFromList(listedPayload, chain)
  if (existing) return { chain, asset, address: existing }

  const created = await fetchImpl(`${input.baseUrl}/api/v1/address/create`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      chain,
      tenant_id: tenantID,
      application_id: env.KTAI_SETTLEMENT_APP_ID?.trim() || KTAI_SETTLEMENT_APP_ID,
      callback_url: env.KTAI_RECHARGE_CALLBACK_URL?.trim() || KTAI_RECHARGE_CALLBACK_URL,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const createdPayload = await readJson(created)
  if (!created.ok) return
  const address = stringField(createdPayload, "address")
  if (!address || !addressLooksLikeChain(address, chain)) return
  return { chain, asset, address }
}

function settlementAddressFromList(payload: unknown, chain: string) {
  const record = asRecord(payload)
  const data = asRecord(record?.data) ?? record
  const rows = Array.isArray(data?.list) ? data.list : []
  return rows
    .flatMap((row) => {
      const item = asRecord(row)
      const address = typeof item?.address === "string" ? item.address.trim() : ""
      if (!address) return []
      const itemChain = typeof item?.chain === "string" ? item.chain.trim() : ""
      if (!addressLooksLikeChain(address, chain)) return []
      if (itemChain && normalizeDepositChain(itemChain) !== chain) return []
      return [address]
    })
    .at(0)
}

export async function fetchDepositAddress(
  identityToken: string,
  input: { chain?: string; asset?: string; baseUrl?: string; settlementBaseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<DepositAddress> {
  const fetchImpl = input.fetchImpl ?? fetch
  const chain = normalizeDepositChain(input.chain)
  const asset = input.asset?.trim().toUpperCase() || assetsForChain(chain)[0]
  const query = new URLSearchParams({ chain, asset })
  const iamPaths = [`/api/iam/deposit-address?${query}`, `/wallet/v1/deposit-address?${query}`]
  const billingPaths = [`/recharge/crypto/address?${query}`, `/wallet/v1/deposit-address?${query}`]
  let last = "Deposit address API is not available yet"
  const hosts = [
    ...walletBaseUrls(input.baseUrl).map((baseUrl) => ({ baseUrl, paths: iamPaths })),
    ...billingBaseUrls(input.baseUrl).map((baseUrl) => ({ baseUrl, paths: billingPaths })),
  ]
  for (const host of hosts) {
    for (const pathName of host.paths) {
      const result = await readDepositResponse(fetchImpl, `${host.baseUrl}${pathName}`, identityToken)
      if (result.status === 404 || typeof result.payload === "string") {
        last = stringField(result.payload, "message", "error") ?? last
        continue
      }
      if (!result.ok) {
        throw new Error(stringField(result.payload, "message", "error") ?? `Deposit address failed (${result.status})`)
      }
      const address = depositFromPayload(result.payload, chain, asset)
      if (address) return address
      last = "Deposit address does not match the requested network"
    }
  }
  const settlement = settlementAddressUrl(input)
  if (settlement) {
    const assigned = await assignSettlementAddress(identityToken, chain, asset, {
      fetchImpl,
      baseUrl: settlement,
    })
    if (assigned) return assigned
    last = "Deposit address does not match the requested network"
  }
  throw new Error(last)
}

async function fetchIamJson(
  identityToken: string,
  paths: string[],
  input: { method?: string; body?: unknown; baseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? fetch
  let last = "KTPay API is not available yet"
  for (const baseUrl of walletBaseUrls(input.baseUrl)) {
    for (const pathName of paths) {
      const response = await fetchImpl(`${baseUrl}${pathName}`, {
        method: input.method ?? "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${identityToken}`,
          ...(input.body ? { "content-type": "application/json" } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(15_000),
      })
      const payload = await readJson(response)
      if (response.status === 404 || typeof payload === "string") {
        last = stringField(payload, "message", "error") ?? last
        continue
      }
      if (!response.ok || asRecord(payload)?.success === false) {
        throw new Error(stringField(payload, "message", "error", "data") ?? `KTPay request failed (${response.status})`)
      }
      return payload
    }
  }
  throw new Error(last)
}

export async function fetchKtpayInfo(
  identityToken: string,
  input: { baseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<KtpayInfo> {
  const payload = await fetchIamJson(identityToken, ["/api/iam/ktpay/info", "/wallet/v1/ktpay/info"], input)
  const record = asRecord(payload)
  const data = asRecord(record?.data) ?? record
  const methods = Array.isArray(data?.methods)
    ? data.methods.flatMap((row) => {
        const item = asRecord(row)
        const type = typeof item?.type === "string" ? item.type.trim() : ""
        if (!type) return []
        return [{ name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : type, type }]
      })
    : []
  const amountOptions = Array.isArray(data?.amount_options)
    ? data.amount_options.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : []
  return {
    enabled: data?.enabled === true,
    methods,
    minTopup: numberField(data, "min_topup") ?? 1,
    maxTopup: numberField(data, "max_topup") ?? 500,
    amountOptions,
    appId: stringField(data, "app_id"),
    defaultLang: stringField(data, "default_lang"),
    sdkUrl: stringField(data, "sdk_url"),
  }
}

export async function createKtpayOrder(
  identityToken: string,
  input: { amount: number; method: string; baseUrl?: string; fetchImpl?: FetchLike },
): Promise<KtpayOrder> {
  const payload = await fetchIamJson(identityToken, ["/api/iam/ktpay/pay", "/wallet/v1/ktpay/pay"], {
    method: "POST",
    body: { amount: input.amount, method: input.method },
    baseUrl: input.baseUrl,
    fetchImpl: input.fetchImpl,
  })
  const orderId = stringField(payload, "order_id")
  const cashierUrl = stringField(payload, "cashier_url")
  if (!orderId || !cashierUrl) throw new Error("KTPay did not return a cashier order")
  return {
    orderId,
    cashierUrl,
    amount: numberField(payload, "amount") ?? input.amount,
    requested: numberField(payload, "requested") ?? input.amount,
    status: stringField(payload, "status") ?? "pending",
  }
}

export async function fetchKtpayStatus(
  identityToken: string,
  orderId: string,
  input: { baseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<KtpayStatus> {
  const encoded = encodeURIComponent(orderId)
  const payload = await fetchIamJson(
    identityToken,
    [`/api/iam/ktpay/status/${encoded}`, `/wallet/v1/ktpay/status/${encoded}`],
    input,
  )
  return {
    orderId: stringField(payload, "order_id") ?? orderId,
    status: stringField(payload, "status") ?? "",
    localStatus: stringField(payload, "local_status") ?? "",
    settled: asRecord(payload)?.settled === true || asRecord(asRecord(payload)?.data)?.settled === true,
  }
}

export async function syncManagedToken(identityToken: string, input: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const current = await readManagedApiKey()
  const token = await ensureManagedToken(identityToken, input)
  if (current !== token.key) await persistManagedApiKey(token.key)
  return { ...token, updated: current !== token.key }
}
