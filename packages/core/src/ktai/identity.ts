import { Global } from "@opencode/util/global"
import { kitoDataEnv } from "@opencode/util/kito-env"
import fs from "fs"
import os from "os"
import path from "path"

export const DEFAULT_IDENTITY_BASE_URL = "https://login.ktyun.cc"
// 设备会话契约（kt-identity 决策 0024）：Kito 以 kito_desktop 设备客户端身份
// 登录，换取 access（默认 1h）+ refresh（默认 30d 滚动续期）双令牌。
export const KITO_DEVICE_CLIENT_TYPE = "kito_desktop"
export const KITO_DEVICE_CLIENT_ID = "kito-desktop"
export const IDENTITY_SESSION_FILE = "ktai-identity.json"

export type IdentityAccount = {
  id: string
  accountNo: string
  displayName?: string
}

export type ExternalKTAIIdentity = {
  token: string
  accountId?: string
  expiresAt?: string
}

export type IdentityAccountSummary = {
  account: IdentityAccount
  balance: number
  memberSince?: string
  joinedDays?: number
}

export type IdentityDeviceSession = {
  // 设备会话的 refresh 面是非轮换的；仅当服务端响应省略 refresh_token
  // （刷新场景）时缺省，调用方回落到已存的值或 access 本身。
  refreshToken?: string
  refreshExpiresAt?: string
  deviceSessionId?: string
}

export type IdentityBearerSession = {
  account: IdentityAccount
  token: string
  session: {
    id: string
    tokenType: string
    // Omitted when the Identity response carries no expiry. A missing value is
    // treated as still-valid rather than invented, so restarts cannot turn a
    // fabricated expiry into a spurious logout.
    expiresAt?: string
  }
  device?: IdentityDeviceSession
  loginHint?: string
}

export type DeviceLoginChallenge = {
  sessionId: string
  userCode: string
  opaqueCode: string
  loginUrl: string
  expiresAt: string
  interval: number
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function identityBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.KT_IDENTITY_BASE_URL?.trim()
  return value ? value.replace(/\/+$/, "") : DEFAULT_IDENTITY_BASE_URL
}

export function isEmbeddedMode(env: NodeJS.ProcessEnv = process.env) {
  const value = (env.KITO_EMBEDDED ?? env.OPENCODE_EMBEDDED)?.trim().toLowerCase()
  return value === "1" || value === "true"
}

export function externalIdentity(env: NodeJS.ProcessEnv = process.env): ExternalKTAIIdentity | undefined {
  const token = env.KTAI_IDENTITY_TOKEN?.trim()
  if (!token) return

  const expiresAt = env.KTAI_IDENTITY_EXPIRES_AT?.trim()
  if (expiresAt) {
    const expires = Date.parse(expiresAt)
    if (!Number.isFinite(expires) || expires <= Date.now()) return
  }

  const accountId = env.KTAI_IDENTITY_ACCOUNT_ID?.trim()
  return {
    token,
    ...(accountId ? { accountId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  }
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

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as { message?: unknown; error?: unknown; code?: unknown }
    if (typeof record.message === "string" && record.message.trim()) return record.message
    if (typeof record.error === "string" && record.error.trim()) return record.error
    if (typeof record.code === "string" && record.code.trim()) return record.code
  }
  return fallback
}

function asSession(payload: unknown): IdentityBearerSession | undefined {
  if (!payload || typeof payload !== "object") return
  const record = payload as {
    data?: unknown
    account?: { id?: unknown; accountNo?: unknown; displayName?: unknown }
    token?: unknown
    expiresAt?: unknown
    session?: { id?: unknown; tokenType?: unknown; expiresAt?: unknown }
    loginHint?: unknown
  }
  if (record.data && record.data !== payload) return asSession(record.data)
  if (typeof record.token !== "string" || !record.token) return
  if (typeof record.account?.id !== "string" || typeof record.account?.accountNo !== "string") return
  const expiresAt =
    typeof record.session?.expiresAt === "string"
      ? record.session.expiresAt
      : typeof record.expiresAt === "string"
        ? record.expiresAt
        : undefined
  return {
    account: {
      id: record.account.id,
      accountNo: record.account.accountNo,
      ...(typeof record.account.displayName === "string" ? { displayName: record.account.displayName } : {}),
    },
    token: record.token,
    session: {
      id: typeof record.session?.id === "string" ? record.session.id : "identity",
      tokenType: typeof record.session?.tokenType === "string" ? record.session.tokenType : "Bearer",
      ...(expiresAt ? { expiresAt } : {}),
    },
    ...(typeof record.loginHint === "string" ? { loginHint: record.loginHint } : {}),
  }
}

function asAccount(payload: unknown): IdentityAccount | undefined {
  if (!payload || typeof payload !== "object") return
  const record = payload as {
    account?: unknown
    data?: unknown
    id?: unknown
    accountNo?: unknown
    displayName?: unknown
  }
  if (record.account) return asAccount(record.account)
  if (record.data) return asAccount(record.data)
  if (typeof record.id !== "string" || typeof record.accountNo !== "string") return
  return {
    id: record.id,
    accountNo: record.accountNo,
    ...(typeof record.displayName === "string" ? { displayName: record.displayName } : {}),
  }
}

function balanceFrom(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return
  const record = payload as { data?: unknown; balance?: unknown; amount?: unknown }
  if (record.data) return balanceFrom(record.data)
  const value = record.balance ?? record.amount
  const balance = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(balance) ? balance : undefined
}

function optionalAccountDetail(payload: unknown, key: "memberSince" | "joinedDays") {
  if (!payload || typeof payload !== "object") return
  const record = payload as Record<string, unknown>
  if (record.account) return optionalAccountDetail(record.account, key)
  if (record.data) return optionalAccountDetail(record.data, key)
  return record[key]
}

async function identityGet(token: string, path: string, baseUrl: string | undefined, fetchImpl: FetchLike) {
  const response = await fetchImpl(`${baseUrl ?? identityBaseUrl()}${path}`, {
    method: "GET",
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await readJson(response)
  if (!response.ok) throw new Error(errorMessage(payload, `KT Identity request failed (${response.status})`))
  return payload
}

export async function fetchAccountMe(
  token: string,
  baseUrl?: string,
  fetchImpl: FetchLike = fetch,
): Promise<IdentityAccount> {
  const account = asAccount(await identityGet(token, "/identity/v1/account/me", baseUrl, fetchImpl))
  if (!account) throw new Error("KT Identity account response was unexpected")
  return account
}

export async function fetchLedgerBalance(
  token: string,
  baseUrl?: string,
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  const balance = balanceFrom(await identityGet(token, "/identity/v1/account/ledger/balance", baseUrl, fetchImpl))
  if (balance === undefined) throw new Error("KT Identity balance response was unexpected")
  return balance
}

export async function fetchAccountSummary(
  token: string,
  baseUrl?: string,
  fetchImpl: FetchLike = fetch,
): Promise<IdentityAccountSummary> {
  const accountPayload = await identityGet(token, "/identity/v1/account/me", baseUrl, fetchImpl)
  const account = asAccount(accountPayload)
  if (!account) throw new Error("KT Identity account response was unexpected")
  const balance = await identityGet(token, "/identity/v1/account/ledger/balance", baseUrl, fetchImpl)
    .then((payload) => balanceFrom(payload))
    .catch(() => undefined)
  const memberSince = optionalAccountDetail(accountPayload, "memberSince")
  const joinedDays = optionalAccountDetail(accountPayload, "joinedDays")
  return {
    account,
    balance: balance ?? 0,
    ...(typeof memberSince === "string" ? { memberSince } : {}),
    ...(typeof joinedDays === "number" && Number.isFinite(joinedDays) ? { joinedDays } : {}),
  }
}

export async function validateExternalIdentity(identity: ExternalKTAIIdentity, fetchImpl: FetchLike = fetch) {
  const account = await fetchAccountMe(identity.token, undefined, fetchImpl)
  if (identity.accountId && account.id !== identity.accountId)
    throw new Error("KT Identity account does not match injected identity")
  return account
}

export async function passwordLogin(
  input: {
    loginName: string
    password: string
    newPassword?: string
    baseUrl?: string
  },
  fetchImpl: FetchLike = fetch,
): Promise<IdentityBearerSession> {
  const body: Record<string, string> = {
    loginName: input.loginName.trim(),
    password: input.password,
  }
  if (input.newPassword?.trim()) body.newPassword = input.newPassword.trim()

  const response = await fetchImpl(`${input.baseUrl ?? identityBaseUrl()}/identity/v1/auth/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(errorMessage(payload, `KT Identity password login failed (${response.status})`))
  }
  const session = asSession(payload)
  if (!session) throw new Error("KT Identity password login returned an unexpected payload")
  return session
}

export async function startDeviceLogin(
  input: { baseUrl?: string; deviceName?: string } = {},
  fetchImpl: FetchLike = fetch,
): Promise<DeviceLoginChallenge> {
  const response = await fetchImpl(`${input.baseUrl ?? identityBaseUrl()}/identity/v1/device/sessions`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_type: KITO_DEVICE_CLIENT_TYPE,
      client_id: KITO_DEVICE_CLIENT_ID,
      device_name: input.deviceName ?? defaultDeviceName(),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(errorMessage(payload, `KT Identity device login start failed (${response.status})`))
  }
  const challenge = deviceLoginChallenge(payload)
  if (!challenge) throw new Error("KT Identity device login start returned an unexpected payload")
  return challenge
}

export function defaultDeviceName() {
  const host = os.hostname().trim()
  return host ? `Kito on ${host}` : "Kito"
}

function deviceLoginChallenge(payload: unknown): DeviceLoginChallenge | undefined {
  if (!payload || typeof payload !== "object") return
  const record = payload as Record<string, unknown>
  const source =
    record.challenge && typeof record.challenge === "object" ? (record.challenge as Record<string, unknown>) : record
  const sessionId = stringField(source.session_id) ?? stringField(source.sessionId)
  const userCode = stringField(source.user_code) ?? stringField(source.userCode)
  const opaqueCode = stringField(source.opaque_code) ?? stringField(source.opaqueCode)
  const loginUrl = stringField(source.login_url) ?? stringField(source.loginUrl)
  const expiresAt = stringField(source.expires_at) ?? stringField(source.expiresAt)
  const interval = source.interval
  if (!sessionId || !userCode || !opaqueCode || !loginUrl || !expiresAt) return
  return {
    sessionId,
    userCode,
    opaqueCode,
    loginUrl,
    expiresAt,
    interval: typeof interval === "number" && interval > 0 ? interval : 5,
  }
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

export async function pollDeviceLogin(
  input: {
    sessionId: string
    opaqueCode: string
    baseUrl?: string
    timeoutMs?: number
    intervalMs?: number
    deviceName?: string
  },
  fetchImpl: FetchLike = fetch,
): Promise<IdentityBearerSession> {
  const timeoutMs = input.timeoutMs ?? 180_000
  const intervalMs = input.intervalMs ?? 2_000
  const started = Date.now()
  const base = input.baseUrl ?? identityBaseUrl()
  const opaqueCode = input.opaqueCode.trim()
  if (!opaqueCode) throw new Error("KT Identity device login requires opaqueCode")

  // 网络抖动、网关 5xx、限流 429 是瞬态错误：连续偶发不判死，最多容忍
  // 5 次连续失败，4xx 仍旧立即失败。总时长仍由 timeoutMs 兜底。
  let transientFailures = 0
  while (Date.now() - started < timeoutMs) {
    const polled = await fetchImpl(`${base}/identity/v1/device/sessions/${encodeURIComponent(input.sessionId)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
      .then(
        async (response): Promise<{ ok: true; response: Response; payload: unknown }> => ({
          ok: true,
          response,
          payload: await readJson(response),
        }),
      )
      .catch((error: unknown): { ok: false; error: unknown } => ({ ok: false, error }))
    if (!polled.ok) {
      transientFailures += 1
      if (transientFailures >= 5) {
        throw polled.error instanceof Error ? polled.error : new Error("KT Identity device login poll failed")
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      continue
    }
    const payload = polled.payload
    if (!polled.response.ok) {
      const transient = polled.response.status === 429 || polled.response.status >= 500
      if (transient) {
        transientFailures += 1
        if (transientFailures >= 5) {
          throw new Error(errorMessage(payload, `KT Identity device login poll failed (${polled.response.status})`))
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        continue
      }
      throw new Error(errorMessage(payload, `KT Identity device login poll failed (${polled.response.status})`))
    }
    transientFailures = 0

    const status =
      payload && typeof payload === "object" && typeof (payload as { status?: unknown }).status === "string"
        ? (payload as { status: string }).status
        : "pending"

    // 用户在 Telegram 确认后挑战变为 approved，随即用一次性 opaque_code 换双令牌。
    if (status === "approved") return exchangeDeviceTokens(input, fetchImpl)
    if (status === "denied" || status === "expired" || status === "consumed") {
      throw new Error(`KT Identity device login ${status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error("KT Identity device login timed out")
}

export async function exchangeDeviceTokens(
  input: { sessionId: string; opaqueCode: string; baseUrl?: string; deviceName?: string },
  fetchImpl: FetchLike = fetch,
): Promise<IdentityBearerSession> {
  const response = await fetchImpl(
    `${input.baseUrl ?? identityBaseUrl()}/identity/v1/device/sessions/${encodeURIComponent(input.sessionId)}/token`,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        opaque_code: input.opaqueCode.trim(),
        client_id: KITO_DEVICE_CLIENT_ID,
        device_name: input.deviceName ?? defaultDeviceName(),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  )
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(errorMessage(payload, `KT Identity device token exchange failed (${response.status})`))
  }
  const session = asDeviceSession(payload)
  if (!session) throw new Error("KT Identity device token exchange returned an unexpected payload")
  return session
}

function asDeviceSession(payload: unknown): IdentityBearerSession | undefined {
  if (!payload || typeof payload !== "object") return
  const record = payload as Record<string, unknown>
  const source = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record
  const accessToken = stringField(source.access_token) ?? stringField(source.accessToken)
  const accountId = stringField(source.subject) ?? stringField(source.account_id)
  const username = stringField(source.username)
  const refreshToken = stringField(source.refresh_token) ?? stringField(source.refreshToken)
  const expiresAt = stringField(source.expires_at) ?? stringField(source.expiresAt)
  const refreshExpiresAt = stringField(source.refresh_expires_at) ?? stringField(source.refreshExpiresAt)
  const deviceSessionId = stringField(source.device_session_id) ?? stringField(source.deviceSessionId)
  if (!accessToken || !accountId) return
  return {
    account: { id: accountId, accountNo: username ?? accountId },
    token: accessToken,
    session: {
      id: deviceSessionId ?? "identity",
      tokenType: stringField(source.token_type) ?? stringField(source.tokenType) ?? "Bearer",
      ...(expiresAt ? { expiresAt } : {}),
    },
    ...(refreshToken || refreshExpiresAt || deviceSessionId
      ? {
          device: {
            ...(refreshToken ? { refreshToken } : {}),
            ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
            ...(deviceSessionId ? { deviceSessionId } : {}),
          },
        }
      : {}),
  }
}

export class InvalidIdentityRefreshError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function refreshDeviceTokens(
  input: { refreshToken: string; baseUrl?: string },
  fetchImpl: FetchLike = fetch,
): Promise<IdentityBearerSession> {
  const refreshToken = input.refreshToken.trim()
  if (!refreshToken) throw new Error("KT Identity refresh requires refreshToken")
  const response = await fetchImpl(`${input.baseUrl ?? identityBaseUrl()}/identity/v1/device/token/refresh`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await readJson(response)
  if (response.status === 401 || response.status === 403) {
    // Refresh token 已失效（30 天滚动窗口耗尽 / 设备会话被吊销 / 账号停用）。
    throw new InvalidIdentityRefreshError(
      errorMessage(payload, `KT Identity refresh token is no longer valid (${response.status})`),
      response.status,
    )
  }
  if (!response.ok) {
    throw new Error(errorMessage(payload, `KT Identity refresh failed (${response.status})`))
  }
  const session = asDeviceSession(payload)
  if (!session) throw new Error("KT Identity refresh returned an unexpected payload")
  // Refresh 响应不回传 refresh_token（非轮换语义）：沿用入参，只有
  // refresh_expires_at 每次滚动前移。若后端未来改为轮换式，服务端下发
  // 的新 token 优先。
  if (session.device?.refreshToken && session.device.refreshToken !== refreshToken) return session
  return {
    ...session,
    device: {
      refreshToken,
      ...(session.device?.refreshExpiresAt ? { refreshExpiresAt: session.device.refreshExpiresAt } : {}),
      ...(session.device?.deviceSessionId ? { deviceSessionId: session.device.deviceSessionId } : {}),
    },
  }
}

export async function ensureFreshIdentityToken(fetchImpl: FetchLike = fetch) {
  const injected = externalIdentity()
  if (injected?.token) return injected.token
  const raw = readIdentitySessionFile()
  if (!raw) return
  const expires = typeof raw.expiresAt === "string" ? Date.parse(raw.expiresAt) : Number.NaN
  if (typeof raw.token === "string" && raw.token.trim() && !(Number.isFinite(expires) && expires <= Date.now())) {
    return raw.token.trim()
  }
  if (typeof raw.refreshToken !== "string" || !raw.refreshToken.trim()) return
  // Refresh 面失效（401/403）：清空本地登录态（托管 NewAPI key 保留），
  // UI 正确回到「请登录」而不是永久的半登录假死。网络类瞬态失败不清
  // 文件，留待下次进入时重试。
  const session = await refreshDeviceTokens({ refreshToken: raw.refreshToken }, fetchImpl).catch((cause: unknown) => {
    if (cause instanceof InvalidIdentityRefreshError) clearPersistedIdentity()
    return undefined
  })
  if (!session) return
  persistIdentitySession(session)
  return session.token
}

export function sessionExpiresAt(session: IdentityBearerSession) {
  const parsed = session.session.expiresAt ? Date.parse(session.session.expiresAt) : Number.NaN
  // Credential.OAuth.expires is a required timestamp, so an absent/invalid
  // server expiry still yields a short-lived estimate. A device-flow session
  // refreshes via refreshDeviceTokens before this estimate matters, and
  // persisted identity files only ever store the server-provided expiresAt.
  return Number.isFinite(parsed) ? parsed : Date.now() + 60 * 60 * 1000
}

export function deviceAuthorizeView(challenge: DeviceLoginChallenge) {
  // instructions 的格式是 app 端 parseTelegramAuthorization 的解析契约：
  // 「Code: <user_code>」供复制，bot 名从 t.me 链接提取。
  return {
    url: challenge.loginUrl,
    instructions: `Confirm Kito login in Telegram @${telegramBotFromUrl(challenge.loginUrl)}. Code: ${challenge.userCode}`,
    method: "auto" as const,
  }
}

function telegramBotFromUrl(url: string) {
  return /t\.me\/([^/?#]+)/.exec(url)?.[1] ?? "bot"
}

export function parseTelegramAuthorization(input: { url: string; instructions: string }) {
  const code = /Code:\s*(\S+)/.exec(input.instructions)?.[1]
  const bot = /t\.me\/([^/?#]+)/.exec(input.url)?.[1]
  return {
    url: input.url,
    code,
    bot,
  }
}

export function identityLoginInstructions(session: IdentityBearerSession) {
  const who = session.account.displayName?.trim() || session.account.accountNo
  return `Signed in to KT Identity as ${who} (${session.account.accountNo}).`
}

export function identitySessionPath() {
  return kitoDataEnv("KTAI_IDENTITY_PATH")?.trim() || path.join(Global.Path.data, IDENTITY_SESSION_FILE)
}

export function persistIdentityToken(
  token: string,
  extra?: {
    accountId?: string
    expiresAt?: string
    refreshToken?: string
    refreshExpiresAt?: string
    deviceSessionId?: string
  },
) {
  const current = token.trim()
  if (!current) return
  fs.mkdirSync(path.dirname(identitySessionPath()), { recursive: true })
  fs.writeFileSync(
    identitySessionPath(),
    JSON.stringify(
      {
        token: current,
        accountId: extra?.accountId,
        expiresAt: extra?.expiresAt,
        refreshToken: extra?.refreshToken,
        refreshExpiresAt: extra?.refreshExpiresAt,
        deviceSessionId: extra?.deviceSessionId,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  )
  // The mode option only applies to newly created files; keep an existing
  // identity file user-only as well.
  fs.chmodSync(identitySessionPath(), 0o600)
}

export function persistIdentitySession(session: IdentityBearerSession) {
  persistIdentityToken(session.token, {
    accountId: session.account.id,
    expiresAt: session.session.expiresAt,
    refreshToken: session.device?.refreshToken,
    refreshExpiresAt: session.device?.refreshExpiresAt,
    deviceSessionId: session.device?.deviceSessionId,
  })
}

function readIdentitySessionFile() {
  if (!fs.existsSync(identitySessionPath())) return
  try {
    return JSON.parse(fs.readFileSync(identitySessionPath(), "utf8")) as {
      token?: unknown
      accountId?: unknown
      expiresAt?: unknown
      refreshToken?: unknown
      refreshExpiresAt?: unknown
      deviceSessionId?: unknown
    }
  } catch {
    return
  }
}

export function readPersistedIdentityToken() {
  const raw = readIdentitySessionFile()
  if (typeof raw?.token !== "string" || !raw.token.trim()) return
  if (typeof raw.expiresAt === "string") {
    const expires = Date.parse(raw.expiresAt)
    if (Number.isFinite(expires) && expires <= Date.now()) return
  }
  return raw.token.trim()
}

export function readPersistedIdentityAccountId() {
  const raw = readIdentitySessionFile()
  return typeof raw?.accountId === "string" ? raw.accountId : undefined
}

export function clearPersistedIdentity() {
  if (!fs.existsSync(identitySessionPath())) return
  fs.unlinkSync(identitySessionPath())
}

export async function revokeCurrentIdentitySession(token: string, baseUrl?: string, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(`${baseUrl ?? identityBaseUrl()}/identity/v1/account/sessions/current/revoke`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  })
  if (response.ok || response.status === 401 || response.status === 404) return
  throw new Error(errorMessage(await readJson(response), `KT Identity logout failed (${response.status})`))
}

export async function signOutIdentity(input: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const raw = readIdentitySessionFile()
  // access 过期时先用 refresh 面换新（ensureFreshIdentityToken 在 refresh
  // 失效时已顺带清文件），否则旧 token 会 401 而设备会话残留到自然过期。
  const token =
    (await ensureFreshIdentityToken(fetchImpl).catch(() => undefined)) ??
    (typeof raw?.token === "string" ? raw.token.trim() : "")
  if (token) {
    if (typeof raw?.deviceSessionId === "string" && raw.deviceSessionId) {
      await revokeDeviceSession(token, raw.deviceSessionId, input.baseUrl, fetchImpl).catch(() => undefined)
    } else {
      await revokeCurrentIdentitySession(token, input.baseUrl, fetchImpl).catch(() => undefined)
    }
  }
  clearPersistedIdentity()
}

export async function revokeDeviceSession(
  token: string,
  deviceSessionId: string,
  baseUrl?: string,
  fetchImpl: FetchLike = fetch,
) {
  const response = await fetchImpl(
    `${baseUrl ?? identityBaseUrl()}/identity/v1/device/device-sessions/${encodeURIComponent(deviceSessionId)}`,
    {
      method: "DELETE",
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (response.ok || response.status === 401 || response.status === 404) return
  throw new Error(errorMessage(await readJson(response), `KT Identity device logout failed (${response.status})`))
}
