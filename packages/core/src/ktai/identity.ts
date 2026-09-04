import { Global } from "@opencode-ai/util/global"
import fs from "fs"
import path from "path"

export const DEFAULT_IDENTITY_BASE_URL = "https://login.ktyun.cc"
export const KT_IDENTITY_REFRESH_MARKER = "kt-identity"
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

export type IdentityBearerSession = {
  account: IdentityAccount
  token: string
  session: {
    id: string
    tokenType: string
    expiresAt: string
  }
  loginHint?: string
}

export type TelegramChallenge = {
  challengeId: string
  displayCode: string
  opaqueCode: string
  telegram: {
    botUsername: string
    qrUrl: string
  }
  expiresAt: string
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function identityBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const value = env.KT_IDENTITY_BASE_URL?.trim()
  return value ? value.replace(/\/+$/, "") : DEFAULT_IDENTITY_BASE_URL
}

export function isEmbeddedMode(env: NodeJS.ProcessEnv = process.env) {
  const value = env.OPENCODE_EMBEDDED?.trim().toLowerCase()
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
      expiresAt: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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

export async function startTelegramLogin(
  input: { baseUrl?: string } = {},
  fetchImpl: FetchLike = fetch,
): Promise<TelegramChallenge> {
  const response = await fetchImpl(`${input.baseUrl ?? identityBaseUrl()}/identity/v1/auth/telegram/start`, {
    method: "POST",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(errorMessage(payload, `KT Identity Telegram start failed (${response.status})`))
  }
  const challenge = telegramStartChallenge(payload)
  if (!challenge) throw new Error("KT Identity Telegram start returned an unexpected payload")
  return challenge
}

function telegramStartChallenge(payload: unknown): TelegramChallenge | undefined {
  if (!payload || typeof payload !== "object") return
  const record = payload as Record<string, unknown>
  const nested = record.challenge && typeof record.challenge === "object" ? (record.challenge as Record<string, unknown>) : undefined
  const challengeId = stringField(nested?.id) ?? stringField(nested?.challengeId) ?? stringField(record.challengeId)
  const displayCode = stringField(nested?.displayCode) ?? stringField(record.displayCode)
  const expiresAt = stringField(nested?.expiresAt) ?? stringField(record.expiresAt)
  const telegramSource = (nested?.telegram && typeof nested.telegram === "object" ? nested.telegram : record.telegram) as
    | { botUsername?: unknown; qrUrl?: unknown }
    | undefined
  const qrUrl = typeof telegramSource?.qrUrl === "string" ? telegramSource.qrUrl : undefined
  const opaqueCode =
    stringField(nested?.opaqueCode) ?? stringField(record.opaqueCode) ?? opaqueCodeFromQrUrl(qrUrl)
  if (
    !challengeId ||
    !displayCode ||
    !expiresAt ||
    !opaqueCode ||
    typeof telegramSource?.botUsername !== "string" ||
    !qrUrl
  ) {
    return
  }
  return {
    challengeId,
    displayCode,
    opaqueCode,
    telegram: {
      botUsername: telegramSource.botUsername,
      qrUrl,
    },
    expiresAt,
  }
}

function opaqueCodeFromQrUrl(url?: string) {
  if (!url) return
  try {
    const start = new URL(url).searchParams.get("start")?.trim()
    if (start?.startsWith("login_") && start.length > "login_".length) return start.slice("login_".length)
  } catch {
    return
  }
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

export async function pollTelegramLogin(
  input: {
    challengeId: string
    opaqueCode: string
    baseUrl?: string
    timeoutMs?: number
    intervalMs?: number
  },
  fetchImpl: FetchLike = fetch,
): Promise<IdentityBearerSession> {
  const timeoutMs = input.timeoutMs ?? 180_000
  const intervalMs = input.intervalMs ?? 2_000
  const started = Date.now()
  const base = input.baseUrl ?? identityBaseUrl()
  const opaqueCode = input.opaqueCode.trim()
  if (!opaqueCode) throw new Error("KT Identity Telegram poll requires opaqueCode")

  while (Date.now() - started < timeoutMs) {
    const response = await fetchImpl(
      `${base}/identity/v1/auth/telegram/poll/${encodeURIComponent(input.challengeId)}?opaqueCode=${encodeURIComponent(opaqueCode)}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      },
    )
    const payload = await readJson(response)
    if (!response.ok) {
      throw new Error(errorMessage(payload, `KT Identity Telegram poll failed (${response.status})`))
    }

    const session = asSession(payload)
    if (session) return session

    const status =
      payload && typeof payload === "object" && typeof (payload as { status?: unknown }).status === "string"
        ? (payload as { status: string }).status
        : "pending"

    if (status === "denied" || status === "expired" || status === "consumed") {
      throw new Error(`KT Identity Telegram login ${status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error("KT Identity Telegram login timed out")
}

export function sessionExpiresAt(session: IdentityBearerSession) {
  const parsed = Date.parse(session.session.expiresAt)
  return Number.isFinite(parsed) ? parsed : Date.now() + 60 * 60 * 1000
}

export function telegramAuthorizeView(challenge: TelegramChallenge) {
  return {
    url: challenge.telegram.qrUrl,
    instructions: `Confirm Kito login in Telegram @${challenge.telegram.botUsername}. Code: ${challenge.displayCode}`,
    method: "auto" as const,
  }
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
  return path.join(Global.Path.data, IDENTITY_SESSION_FILE)
}

export function persistIdentityToken(token: string, extra?: { accountId?: string; expiresAt?: string }) {
  const current = token.trim()
  if (!current) return
  fs.mkdirSync(path.dirname(identitySessionPath()), { recursive: true })
  fs.writeFileSync(
    identitySessionPath(),
    JSON.stringify({ token: current, accountId: extra?.accountId, expiresAt: extra?.expiresAt }, null, 2) + "\n",
    { mode: 0o600 },
  )
}

export function persistIdentitySession(session: IdentityBearerSession) {
  persistIdentityToken(session.token, {
    accountId: session.account.id,
    expiresAt: session.session.expiresAt,
  })
}

function readIdentitySessionFile() {
  if (!fs.existsSync(identitySessionPath())) return
  try {
    return JSON.parse(fs.readFileSync(identitySessionPath(), "utf8")) as {
      token?: unknown
      expiresAt?: unknown
    }
  } catch {
    return
  }
}

export function readStoredIdentityToken() {
  const token = readIdentitySessionFile()?.token
  if (typeof token === "string" && token.trim()) return token.trim()
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

export function clearPersistedIdentity() {
  if (!fs.existsSync(identitySessionPath())) return
  fs.unlinkSync(identitySessionPath())
}

export async function revokeCurrentIdentitySession(
  token: string,
  baseUrl?: string,
  fetchImpl: FetchLike = fetch,
) {
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

export async function signOutIdentity(
  input: { baseUrl?: string; fetchImpl?: FetchLike } = {},
) {
  const token = readStoredIdentityToken()
  if (token) {
    await revokeCurrentIdentitySession(token, input.baseUrl, input.fetchImpl ?? fetch).catch(() => undefined)
  }
  clearPersistedIdentity()
}
