export const DEFAULT_IDENTITY_BASE_URL = "https://login.ktyun.cc"
export const KT_IDENTITY_REFRESH_MARKER = "kt-identity"

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
  opaqueCode?: string
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
    account?: { id?: unknown; accountNo?: unknown; displayName?: unknown }
    token?: unknown
    session?: { id?: unknown; tokenType?: unknown; expiresAt?: unknown }
    loginHint?: unknown
  }
  if (typeof record.token !== "string" || !record.token) return
  if (typeof record.account?.id !== "string" || typeof record.account?.accountNo !== "string") return
  if (
    typeof record.session?.id !== "string" ||
    typeof record.session?.tokenType !== "string" ||
    typeof record.session?.expiresAt !== "string"
  ) {
    return
  }
  return {
    account: {
      id: record.account.id,
      accountNo: record.account.accountNo,
      ...(typeof record.account.displayName === "string" ? { displayName: record.account.displayName } : {}),
    },
    token: record.token,
    session: {
      id: record.session.id,
      tokenType: record.session.tokenType,
      expiresAt: record.session.expiresAt,
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
  const [accountPayload, balancePayload] = await Promise.all([
    identityGet(token, "/identity/v1/account/me", baseUrl, fetchImpl),
    identityGet(token, "/identity/v1/account/ledger/balance", baseUrl, fetchImpl),
  ])
  const account = asAccount(accountPayload)
  const balance = balanceFrom(balancePayload)
  if (!account || balance === undefined) throw new Error("KT Identity account response was unexpected")
  const memberSince = optionalAccountDetail(accountPayload, "memberSince")
  const joinedDays = optionalAccountDetail(accountPayload, "joinedDays")
  return {
    account,
    balance,
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
  if (!payload || typeof payload !== "object")
    throw new Error("KT Identity Telegram start returned an unexpected payload")
  const record = payload as {
    challengeId?: unknown
    displayCode?: unknown
    opaqueCode?: unknown
    telegram?: { botUsername?: unknown; qrUrl?: unknown }
    expiresAt?: unknown
  }
  if (
    typeof record.challengeId !== "string" ||
    typeof record.displayCode !== "string" ||
    typeof record.expiresAt !== "string" ||
    typeof record.telegram?.botUsername !== "string" ||
    typeof record.telegram?.qrUrl !== "string"
  ) {
    throw new Error("KT Identity Telegram start returned an unexpected payload")
  }
  return {
    challengeId: record.challengeId,
    displayCode: record.displayCode,
    ...(typeof record.opaqueCode === "string" ? { opaqueCode: record.opaqueCode } : {}),
    telegram: {
      botUsername: record.telegram.botUsername,
      qrUrl: record.telegram.qrUrl,
    },
    expiresAt: record.expiresAt,
  }
}

export async function pollTelegramLogin(
  input: {
    challengeId: string
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

  while (Date.now() - started < timeoutMs) {
    const response = await fetchImpl(
      `${base}/identity/v1/auth/telegram/poll/${encodeURIComponent(input.challengeId)}`,
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

export function identityLoginInstructions(session: IdentityBearerSession) {
  const who = session.account.displayName?.trim() || session.account.accountNo
  return [
    `Signed in to KT Identity as ${who} (${session.account.accountNo}).`,
    "AI calls still use NewAPI (ktapi.cc).",
    "Until NewAPI auto-provision by kt_account_id lands, also set KTAI_API_KEY (or use “KTAI API key”).",
  ].join(" ")
}
