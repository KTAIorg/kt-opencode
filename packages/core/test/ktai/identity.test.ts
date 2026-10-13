import { afterEach, expect, test } from "bun:test"
import fs from "fs"
import {
  deviceAuthorizeView,
  ensureFreshIdentityToken,
  externalIdentity,
  fetchAccountSummary,
  identityBaseUrl,
  identityLoginInstructions,
  InvalidIdentityRefreshError,
  isEmbeddedMode,
  KITO_DEVICE_CLIENT_ID,
  parseTelegramAuthorization,
  passwordLogin,
  persistIdentitySession,
  pollDeviceLogin,
  readPersistedIdentityToken,
  refreshDeviceTokens,
  revokeCurrentIdentitySession,
  sessionExpiresAt,
  startDeviceLogin,
} from "@opencode-ai/core/ktai/identity"

afterEach(() => {
  if (process.env.KITO_KTAI_IDENTITY_PATH) fs.rmSync(process.env.KITO_KTAI_IDENTITY_PATH, { force: true })
  delete process.env.KITO_KTAI_IDENTITY_PATH
})

function identityFilePath() {
  process.env.KITO_KTAI_IDENTITY_PATH = `/tmp/ktai-identity-${crypto.randomUUID()}.json`
  return process.env.KITO_KTAI_IDENTITY_PATH
}

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

const deviceTokenResponse = {
  access_token: "device-access",
  token_type: "Bearer",
  expires_at: "2026-08-01T00:10:00.000Z",
  username: "KT260002",
  subject: "acc-2",
  refresh_token: "refresh-1",
  refresh_expires_at: "2026-08-31T00:00:00.000Z",
  device_session_id: "dev-1",
}

test("startDeviceLogin and pollDeviceLogin complete a device session", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  let polls = 0
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith("/identity/v1/device/sessions") && init?.method === undefined) {
      return new Response(JSON.stringify({ message: "method not allowed" }), { status: 405 })
    }
    if (url.endsWith("/identity/v1/device/sessions")) {
      return new Response(
        JSON.stringify({
          session_id: "dev-1",
          user_code: "AB12",
          opaque_code: "opaque-ab12",
          login_url: "https://t.me/kt_official_service_bot?start=login_opaque-ab12",
          status: "pending",
          expires_at: "2026-08-01T00:05:00.000Z",
          interval: 5,
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      )
    }
    if (url.endsWith("/token") && init?.method === "POST") {
      return new Response(JSON.stringify(deviceTokenResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.endsWith("/identity/v1/device/sessions/dev-1")) {
      polls += 1
      return new Response(
        JSON.stringify({ session_id: "dev-1", user_code: "AB12", status: polls >= 2 ? "approved" : "pending", expires_at: "2026-08-01T00:05:00.000Z", interval: 5 }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    throw new Error(`unexpected url ${url}`)
  }

  const challenge = await startDeviceLogin({ baseUrl: "https://login.example", deviceName: "Kito on test-host" }, fetchImpl)
  expect(challenge.sessionId).toBe("dev-1")
  expect(challenge.userCode).toBe("AB12")
  expect(challenge.opaqueCode).toBe("opaque-ab12")
  expect(challenge.loginUrl).toContain("t.me/kt_official_service_bot")
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
    client_type: "kito_desktop",
    client_id: KITO_DEVICE_CLIENT_ID,
    device_name: "Kito on test-host",
  })
  expect(parseTelegramAuthorization(deviceAuthorizeView(challenge))).toEqual({
    url: "https://t.me/kt_official_service_bot?start=login_opaque-ab12",
    code: "AB12",
    bot: "kt_official_service_bot",
  })

  const session = await pollDeviceLogin(
    { sessionId: challenge.sessionId, opaqueCode: challenge.opaqueCode, baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000, deviceName: "Kito on test-host" },
    fetchImpl,
  )
  expect(session.token).toBe("device-access")
  expect(session.account.id).toBe("acc-2")
  expect(session.account.accountNo).toBe("KT260002")
  expect(session.session.expiresAt).toBe("2026-08-01T00:10:00.000Z")
  expect(session.device).toEqual({
    refreshToken: "refresh-1",
    refreshExpiresAt: "2026-08-31T00:00:00.000Z",
    deviceSessionId: "dev-1",
  })
  const exchange = calls.at(-1)
  expect(exchange?.url).toBe("https://login.example/identity/v1/device/sessions/dev-1/token")
  expect(JSON.parse(String(exchange?.init?.body))).toEqual({
    opaque_code: "opaque-ab12",
    client_id: KITO_DEVICE_CLIENT_ID,
    device_name: "Kito on test-host",
  })
})

test("pollDeviceLogin fails fast when the challenge is denied", async () => {
  await expect(
    pollDeviceLogin(
      { sessionId: "dev-denied", opaqueCode: "opaque-x", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
      async () => new Response(JSON.stringify({ status: "denied" }), { status: 200 }),
    ),
  ).rejects.toThrow("KT Identity device login denied")
})

test("pollDeviceLogin tolerates transient failures then completes", async () => {
  let polls = 0
  const session = await pollDeviceLogin(
    { sessionId: "dev-3", opaqueCode: "opaque-3", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
    async (input, init) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify(deviceTokenResponse), { status: 200 })
      }
      polls += 1
      if (polls === 1) throw new Error("socket hang up")
      if (polls === 2) return new Response("bad gateway", { status: 502 })
      if (polls === 3) return new Response(JSON.stringify({ status: "pending" }), { status: 429 })
      return new Response(JSON.stringify({ status: "approved" }), { status: 200 })
    },
  )
  expect(session.token).toBe("device-access")
  expect(polls).toBe(4)
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

  const file = identityFilePath()
  persistIdentitySession(session)
  const persisted = JSON.parse(fs.readFileSync(file, "utf8"))
  expect(persisted.expiresAt).toBeUndefined()
  expect(readPersistedIdentityToken()).toBe("no-expiry-token")
  if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600)
})

test("device sessions persist refresh fields alongside the access token", () => {
  const file = identityFilePath()
  persistIdentitySession({
    account: { id: "acc-11", accountNo: "KT260011" },
    token: "device-access",
    session: { id: "dev-11", tokenType: "Bearer", expiresAt: "2999-01-01T00:00:00.000Z" },
    device: {
      refreshToken: "refresh-11",
      refreshExpiresAt: "2999-02-01T00:00:00.000Z",
      deviceSessionId: "dev-11",
    },
  })
  const persisted = JSON.parse(fs.readFileSync(file, "utf8"))
  expect(persisted).toEqual({
    token: "device-access",
    accountId: "acc-11",
    expiresAt: "2999-01-01T00:00:00.000Z",
    refreshToken: "refresh-11",
    refreshExpiresAt: "2999-02-01T00:00:00.000Z",
    deviceSessionId: "dev-11",
  })
  expect(readPersistedIdentityToken()).toBe("device-access")
})

test("readPersistedIdentityToken rejects only a valid expired timestamp", () => {
  identityFilePath()

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

test("pollDeviceLogin fails fast on non-transient errors", async () => {
  let polls = 0
  await expect(
    pollDeviceLogin(
      { sessionId: "dev-4", opaqueCode: "opaque-4", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
      async () => {
        polls += 1
        return new Response(JSON.stringify({ message: "device session not found" }), { status: 404 })
      },
    ),
  ).rejects.toThrow("device session not found")
  expect(polls).toBe(1)
})

test("pollDeviceLogin gives up after repeated transient failures", async () => {
  let polls = 0
  await expect(
    pollDeviceLogin(
      { sessionId: "dev-5", opaqueCode: "opaque-5", baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 10_000 },
      async () => {
        polls += 1
        return new Response("bad gateway", { status: 502 })
      },
    ),
  ).rejects.toThrow("KT Identity device login poll failed (502)")
  expect(polls).toBe(5)
})

test("refreshDeviceTokens posts the refresh token and keeps the non-rotating credential", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const session = await refreshDeviceTokens(
    { refreshToken: "refresh-1", baseUrl: "https://login.example" },
    async (input, init) => {
      calls.push({ url: String(input), init })
      // 刷新响应按契约省略 refresh_token（非轮换语义），只滚动 refresh_expires_at。
      return new Response(
        JSON.stringify({
          access_token: "device-access-2",
          token_type: "Bearer",
          expires_at: "2026-08-01T01:00:00.000Z",
          username: "KT260002",
          subject: "acc-2",
          refresh_expires_at: "2026-08-31T01:00:00.000Z",
          device_session_id: "dev-1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  )
  expect(calls[0]?.url).toBe("https://login.example/identity/v1/device/token/refresh")
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ refresh_token: "refresh-1" })
  expect(session.token).toBe("device-access-2")
  expect(session.device).toEqual({
    refreshToken: "refresh-1",
    refreshExpiresAt: "2026-08-31T01:00:00.000Z",
    deviceSessionId: "dev-1",
  })
})

test("refreshDeviceTokens reports an invalid refresh token", async () => {
  const cause = await refreshDeviceTokens(
    { refreshToken: "refresh-dead", baseUrl: "https://login.example" },
    async () => new Response(JSON.stringify({ message: "refresh token expired" }), { status: 401 }),
  ).catch((error: unknown) => error)
  expect(cause).toBeInstanceOf(InvalidIdentityRefreshError)
  expect((cause as InvalidIdentityRefreshError).status).toBe(401)
})

test("ensureFreshIdentityToken refreshes an expired access token and persists it", async () => {
  const file = identityFilePath()
  fs.writeFileSync(
    file,
    JSON.stringify({
      token: "stale-access",
      accountId: "acc-2",
      expiresAt: "2000-01-01T00:00:00.000Z",
      refreshToken: "refresh-1",
      refreshExpiresAt: "2999-01-01T00:00:00.000Z",
      deviceSessionId: "dev-1",
    }),
  )

  const token = await ensureFreshIdentityToken(async (input, init) => {
    expect(String(input)).toBe("https://login.ktyun.cc/identity/v1/device/token/refresh")
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: "refresh-1" })
    return new Response(JSON.stringify({ ...deviceTokenResponse, access_token: "device-access-2" }), { status: 200 })
  })
  expect(token).toBe("device-access-2")
  const persisted = JSON.parse(fs.readFileSync(file, "utf8"))
  expect(persisted.token).toBe("device-access-2")
  expect(persisted.refreshToken).toBe("refresh-1")
  expect(persisted.deviceSessionId).toBe("dev-1")
})

test("ensureFreshIdentityToken returns a valid stored token without HTTP", async () => {
  const file = identityFilePath()
  fs.writeFileSync(
    file,
    JSON.stringify({ token: "still-valid", accountId: "acc-2", expiresAt: "2999-01-01T00:00:00.000Z", refreshToken: "refresh-1" }),
  )
  const token = await ensureFreshIdentityToken(async () => {
    throw new Error("no HTTP expected")
  })
  expect(token).toBe("still-valid")
})

test("ensureFreshIdentityToken clears the identity file when the refresh token is invalid", async () => {
  const file = identityFilePath()
  fs.writeFileSync(
    file,
    JSON.stringify({
      token: "stale-access",
      expiresAt: "2000-01-01T00:00:00.000Z",
      refreshToken: "refresh-dead",
    }),
  )
  const token = await ensureFreshIdentityToken(
    async () => new Response(JSON.stringify({ message: "refresh token expired" }), { status: 401 }),
  )
  expect(token).toBeUndefined()
  expect(fs.existsSync(file)).toBe(false)
})

test("ensureFreshIdentityToken keeps the identity file on transient refresh failures", async () => {
  const file = identityFilePath()
  fs.writeFileSync(
    file,
    JSON.stringify({
      token: "stale-access",
      expiresAt: "2000-01-01T00:00:00.000Z",
      refreshToken: "refresh-1",
    }),
  )
  const token = await ensureFreshIdentityToken(async () => {
    throw new Error("socket hang up")
  })
  expect(token).toBeUndefined()
  expect(fs.existsSync(file)).toBe(true)
})
