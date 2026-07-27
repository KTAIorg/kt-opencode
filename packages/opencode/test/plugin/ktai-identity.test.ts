import { expect, test } from "bun:test"
import {
  identityBaseUrl,
  identityLoginInstructions,
  KT_IDENTITY_REFRESH_MARKER,
  passwordLogin,
  pollTelegramLogin,
  sessionExpiresAt,
  startTelegramLogin,
} from "@/plugin/ktai-identity"

test("identityBaseUrl defaults and trims trailing slash", () => {
  expect(identityBaseUrl({})).toBe("https://login.ktyun.cc")
  expect(identityBaseUrl({ KT_IDENTITY_BASE_URL: "https://login.example/ " })).toBe("https://login.example")
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
          telegram: { botUsername: "KTClientBot", qrUrl: "https://t.me/KTClientBot?start=ab12" },
          expiresAt: "2026-08-01T00:00:00.000Z",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      )
    }
    if (url.includes("/identity/v1/auth/telegram/poll/chal-1")) {
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

  const session = await pollTelegramLogin(
    { challengeId: challenge.challengeId, baseUrl: "https://login.example", intervalMs: 1, timeoutMs: 1_000 },
    fetchImpl,
  )
  expect(session.token).toBe("tg-token")
  expect(session.account.accountNo).toBe("KT260002")
  expect(KT_IDENTITY_REFRESH_MARKER).toBe("kt-identity")
})
