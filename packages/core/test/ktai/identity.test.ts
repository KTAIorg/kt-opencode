import { afterEach, expect, test } from "bun:test"
import fs from "fs"
import {
  externalIdentity,
  fetchAccountSummary,
  identityBaseUrl,
  identityLoginInstructions,
  isEmbeddedMode,
  KT_IDENTITY_REFRESH_MARKER,
  parseTelegramAuthorization,
  passwordLogin,
  persistIdentitySession,
  pollTelegramLogin,
  readPersistedIdentityToken,
  revokeCurrentIdentitySession,
  sessionExpiresAt,
  startTelegramLogin,
  telegramAuthorizeView,
} from "@opencode-ai/core/ktai/identity"

afterEach(() => {
  if (process.env.KITO_KTAI_IDENTITY_PATH) fs.rmSync(process.env.KITO_KTAI_IDENTITY_PATH, { force: true })
  delete process.env.KITO_KTAI_IDENTITY_PATH
})

test("identityBaseUrl defaults and trims trailing slash", () => {
  expect(identityBaseUrl({})).toBe("https://login.ktyun.cc")
  expect(identityBaseUrl({ KT_IDENTITY_BASE_URL: "https://login.example/ " })).toBe("https://login.example")
})

test("reads valid injected identities only in embedded mode", () => {
  expect(isEmbeddedMode({ OPENCODE_EMBEDDED: "true" })).toBe(true)
  expect(isEmbeddedMode({ OPENCODE_EMBEDDED: "1" })).toBe(true)
  expect(isEmbeddedMode({ OPENCODE_EMBEDDED: "false" })).toBe(false)
  expect(
    externalIdentity({
      KTAI_IDENTITY_TOKEN: " injected-token ",
      KTAI_IDENTITY_ACCOUNT_ID: " acc-1 ",
      KTAI_IDENTITY_EXPIRES_AT: "2099-01-01T00:00:00.000Z",
    }),
  ).toEqual({
    token: "injected-token",
    accountId: "acc-1",
    expiresAt: "2099-01-01T00:00:00.000Z",
  })
  expect(externalIdentity({ KTAI_IDENTITY_TOKEN: " " })).toBeUndefined()
  expect(
    externalIdentity({
      KTAI_IDENTITY_TOKEN: "injected-token",
      KTAI_IDENTITY_EXPIRES_AT: "2000-01-01T00:00:00.000Z",
    }),
  ).toBeUndefined()
})

test("passwordLogin posts to Identity Bearer login", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(
      JSON.stringify({
        account: { id: "acc-1", accountNo: "KT260001", displayName: "Arise" },
        token: "identity-token",
        session: { id: "sess-1", tokenType: "Bearer", expiresAt: "2026-08-01T00:00:00.000Z" },
        loginHint: "arise",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }

  const session = await passwordLogin(
    { loginName: "arise", password: "secret-password", baseUrl: "https://login.example" },
    fetchImpl,
  )

  expect(calls[0]?.url).toBe("https://login.example/identity/v1/auth/login")
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
    loginName: "arise",
    password: "secret-password",
  })
  expect(session.token).toBe("identity-token")
  expect(session.account.id).toBe("acc-1")
  expect(sessionExpiresAt(session)).toBe(Date.parse("2026-08-01T00:00:00.000Z"))
  expect(identityLoginInstructions(session)).toContain("KT260001")
})

test("startTelegramLogin and pollTelegramLogin complete a challenge", async () => {
  let polls = 0
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/identity/v1/auth/telegram/start")) {
      return new Response(
        JSON.stringify({
          challengeId: "chal-1",
          displayCode: "AB12",
          opaqueCode: "opaque-ab12",
          telegram: { botUsername: "KTClientBot", qrUrl: "https://t.me/KTClientBot?start=login_opaque-ab12" },
          expiresAt: "2026-08-01T00:00:00.000Z",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      )
    }
    if (url.includes("/identity/v1/auth/telegram/poll/chal-1")) {
      expect(url).toContain("opaqueCode=opaque-ab12")
      polls += 1
      if (polls === 1) {
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(
        JSON.stringify({
          account: { id: "acc-2", accountNo: "KT260002" },
          token: "tg-token",
          session: { id: "sess-2", tokenType: "Bearer", expiresAt: "2026-08-01T00:00:00.000Z" },
          loginHint: "arise085",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    throw new Error(`unexpected url ${url}`)
  }

  const challenge = await startTelegramLogin({ baseUrl: "https://login.example" }, fetchImpl)
  expect(challenge.displayCode).toBe("AB12")
  expect(challenge.opaqueCode).toBe("opaque-ab12")
  expect(parseTelegramAuthorization(telegramAuthorizeView(challenge))).toEqual({
    url: "https://t.me/KTClientBot?start=login_opaque-ab12",
    code: "AB12",
    bot: "KTClientBot",
  })

  const session = await pollTelegramLogin(
    {
      challengeId: challenge.challengeId,
      opaqueCode: challenge.opaqueCode,
      baseUrl: "https://login.example",
      intervalMs: 1,
      timeoutMs: 1_000,
    },
    fetchImpl,
  )
  expect(session.token).toBe("tg-token")
  expect(session.account.accountNo).toBe("KT260002")
  expect(KT_IDENTITY_REFRESH_MARKER).toBe("kt-identity")
})

test("startTelegramLogin accepts nested challenge.id", async () => {
  const challenge = await startTelegramLogin({ baseUrl: "https://login.example" }, async () => {
    return new Response(
      JSON.stringify({
        challenge: { id: "chal-nested" },
        displayCode: "066949",
        opaqueCode: "opaque-1",
        telegram: { botUsername: "kt_official_service_bot", qrUrl: "https://t.me/kt_official_service_bot?start=login_x" },
        expiresAt: "2026-08-01T00:00:00.000Z",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    )
  })
  expect(challenge.challengeId).toBe("chal-nested")
  expect(challenge.displayCode).toBe("066949")
  expect(challenge.opaqueCode).toBe("opaque-1")
})

test("startTelegramLogin reads opaqueCode from telegram.qrUrl when the field is omitted", async () => {
  const challenge = await startTelegramLogin({ baseUrl: "https://login.example" }, async () => {
    return new Response(
      JSON.stringify({
        challengeId: "chal-qr",
        displayCode: "112233",
        telegram: {
          botUsername: "kt_official_service_bot",
          qrUrl: "https://t.me/kt_official_service_bot?start=login_from-qr",
        },
        expiresAt: "2026-08-01T00:00:00.000Z",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    )
  })
  expect(challenge.opaqueCode).toBe("from-qr")
})

test("pollTelegramLogin accepts Identity confirmed payload without session wrapper", async () => {
  const session = await pollTelegramLogin(
    { challengeId: "chal-2", opaqueCode: "opaque-2", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
    async () =>
      new Response(
        JSON.stringify({
          account: { id: "acc-3", accountNo: "KT260003", displayName: "芒 果果" },
          token: "tg-token-plain",
          expiresAt: "2026-08-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  )
  expect(session.token).toBe("tg-token-plain")
  expect(session.account.displayName).toBe("芒 果果")
  expect(session.session.expiresAt).toBe("2026-08-01T00:00:00.000Z")
})

test("fetchAccountSummary keeps the profile when the ledger is unavailable", async () => {
  const summary = await fetchAccountSummary("identity-token", "https://login.example", async (input) => {
    const url = String(input)
    if (url.endsWith("/identity/v1/account/me")) {
      return new Response(
        JSON.stringify({ id: "acc-1", accountNo: "KT260001", displayName: "芒 果果" }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    return new Response("ledger down", { status: 503 })
  })
  expect(summary.account.displayName).toBe("芒 果果")
  expect(summary.balance).toBe(0)
})

test("revokes the current Identity session on the product logout route", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  await revokeCurrentIdentitySession("identity-token", "https://login.example", async (input, init) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify({ revoked: 1 }), { status: 200 })
  })
  expect(calls[0]?.url).toBe("https://login.example/identity/v1/account/sessions/current/revoke")
  expect(calls[0]?.init?.method).toBe("POST")
  expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe("Bearer identity-token")
})

test("treats an already-invalid Identity session as a successful revoke", async () => {
  await revokeCurrentIdentitySession("expired-token", "https://login.example", async () => {
    return new Response(JSON.stringify({ message: "invalid or inactive Identity token" }), { status: 401 })
  })
})

test("pollTelegramLogin tolerates transient failures then completes", async () => {
  let polls = 0
  const session = await pollTelegramLogin(
    { challengeId: "chal-3", opaqueCode: "opaque-3", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
    async () => {
      polls += 1
      if (polls === 1) throw new Error("socket hang up")
      if (polls === 2) return new Response("bad gateway", { status: 502 })
      if (polls === 3) return new Response(JSON.stringify({ status: "pending" }), { status: 429 })
      return new Response(
        JSON.stringify({
          account: { id: "acc-4", accountNo: "KT260004" },
          token: "tg-token-flaky",
          session: { id: "sess-4", tokenType: "Bearer", expiresAt: "2026-08-01T00:00:00.000Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  )
  expect(session.token).toBe("tg-token-flaky")
  expect(polls).toBe(4)
})

test("sessions without a server expiry stay valid and persist no expiry", async () => {
  const session = await passwordLogin(
    { loginName: "arise", password: "secret-password", baseUrl: "https://login.example" },
    async () =>
      new Response(
        JSON.stringify({
          account: { id: "acc-9", accountNo: "KT260009" },
          token: "no-expiry-token",
          session: { id: "sess-9", tokenType: "Bearer" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  )

  expect(session.session.expiresAt).toBeUndefined()
  // Credential.OAuth.expires is required, so the runtime still yields an estimate.
  expect(sessionExpiresAt(session)).toBeGreaterThan(Date.now())

  process.env.KITO_KTAI_IDENTITY_PATH = `/tmp/ktai-identity-${crypto.randomUUID()}.json`
  persistIdentitySession(session)
  const persisted = JSON.parse(fs.readFileSync(process.env.KITO_KTAI_IDENTITY_PATH, "utf8"))
  expect(persisted.expiresAt).toBeUndefined()
  expect(readPersistedIdentityToken()).toBe("no-expiry-token")
  expect(fs.statSync(process.env.KITO_KTAI_IDENTITY_PATH).mode & 0o777).toBe(0o600)
})

test("readPersistedIdentityToken rejects only a valid expired timestamp", () => {
  process.env.KITO_KTAI_IDENTITY_PATH = `/tmp/ktai-identity-${crypto.randomUUID()}.json`

  persistIdentitySession({
    account: { id: "acc-10", accountNo: "KT260010" },
    token: "expired-token",
    session: { id: "sess-10", tokenType: "Bearer", expiresAt: "2000-01-01T00:00:00.000Z" },
  })
  expect(readPersistedIdentityToken()).toBeUndefined()

  persistIdentitySession({
    account: { id: "acc-10", accountNo: "KT260010" },
    token: "future-token",
    session: { id: "sess-10", tokenType: "Bearer", expiresAt: "2999-01-01T00:00:00.000Z" },
  })
  expect(readPersistedIdentityToken()).toBe("future-token")

  // A malformed expiry is not a valid timestamp, so the token still reads.
  persistIdentitySession({
    account: { id: "acc-10", accountNo: "KT260010" },
    token: "malformed-token",
    session: { id: "sess-10", tokenType: "Bearer", expiresAt: "not-a-date" },
  })
  expect(readPersistedIdentityToken()).toBe("malformed-token")
})

test("pollTelegramLogin fails fast on non-transient errors", async () => {
  let polls = 0
  await expect(
    pollTelegramLogin(
      { challengeId: "chal-4", opaqueCode: "opaque-4", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
      async () => {
        polls += 1
        return new Response(JSON.stringify({ message: "challenge not found" }), { status: 404 })
      },
    ),
  ).rejects.toThrow("challenge not found")
  expect(polls).toBe(1)
})

test("pollTelegramLogin gives up after repeated transient failures", async () => {
  let polls = 0
  await expect(
    pollTelegramLogin(
      { challengeId: "chal-5", opaqueCode: "opaque-5", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 10_000 },
      async () => {
        polls += 1
        return new Response("bad gateway", { status: 502 })
      },
    ),
  ).rejects.toThrow("KT Identity Telegram poll failed (502)")
  expect(polls).toBe(5)
})
