import { afterAll, beforeEach, expect } from "bun:test"
import { Effect } from "effect"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { testEffect } from "../lib/effect"

const directory = await mkdtemp(path.join(tmpdir(), "kito-desktop-login-contract-"))
const nativeFetch = globalThis.fetch
const previousEnv = {
  identity: process.env.KT_IDENTITY_BASE_URL,
  newapi: process.env.KTAI_NEWAPI_BASE_URL,
  file: process.env.KITO_KTAI_IDENTITY_PATH,
  key: process.env.KITO_KTAI_API_KEY_PATH,
}
const previousRoots = Object.fromEntries(
  ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"].map((key) => [key, process.env[key]]),
)
for (const key of Object.keys(previousRoots)) process.env[key] = path.join(directory, key.toLowerCase())
const nonce = "d".repeat(64)
const state = {
  source: "B",
  allowSwitch: false,
  cancelled: false,
  cancelAtEnsure: false,
  revoked: false,
  challenges: 0,
  approvals: 0,
  revocations: 0,
  generation: 1,
}
const challenges = new Map<string, string>()
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    const route = url.pathname
    if (route === `/kito/${nonce}`) return Response.json({ accountId: state.source, allowSwitch: state.allowSwitch })
    if (route === `/kito/${nonce}/complete`) return Response.json({ ok: true })
    if (route === `/kito/${nonce}/commit`) return Response.json({}, { status: state.cancelled ? 410 : 200 })
    if (route === `/kito/${nonce}/approve`) {
      const input = (await request.json()) as { sessionId: string; userCode: string; opaqueCode?: string }
      expect(input.opaqueCode).toBeUndefined()
      expect(challenges.has(input.sessionId)).toBe(true)
      state.approvals++
      return Response.json({ status: "approved" })
    }
    if (route === "/identity/v1/device/sessions") {
      state.challenges++
      const id = crypto.randomUUID()
      challenges.set(id, `proof-${id}`)
      return Response.json({
        session_id: id,
        opaque_code: challenges.get(id)!,
        user_code: "246810",
        login_url: "https://t.me/fixture",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        interval: 1,
      })
    }
    if (route.startsWith("/identity/v1/device/sessions/") && route.endsWith("/token")) {
      const id = route.split("/").at(-2)!
      const body = (await request.json()) as { opaque_code: string }
      expect(body.opaque_code).toBe(challenges.get(id)!)
      return Response.json({
        access_token: `new-${state.source}`,
        subject: state.source,
        username: state.source,
        refresh_token: `refresh-${state.source}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        refresh_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        device_session_id: id,
      })
    }
    if (route.startsWith("/identity/v1/device/device-sessions/") && request.method === "DELETE") {
      state.revocations++
      return Response.json({ ok: true })
    }
    if (route === "/identity/v1/account/me") {
      const token = request.headers.get("authorization") ?? ""
      if (state.revoked && token === "Bearer old-A") return Response.json({}, { status: 401 })
      return Response.json({ account: { id: token.endsWith("A") ? "A" : "B", accountNo: "fixture" } })
    }
    if (route === "/identity/v1/device/token/refresh")
      return Response.json({ error: "invalid_refresh_token" }, { status: 401 })
    if (route === "/api/iam/token/ensure") {
      if (state.cancelAtEnsure) state.cancelled = true
      const account = (request.headers.get("authorization") ?? "").endsWith("A") ? "A" : "B"
      return Response.json({
        success: true,
        data: { key: `sk-${account}-${state.generation}`, name: "kito", created: true },
      })
    }
    if (route === "/v1/models") return Response.json({ data: [{ id: "gpt-5.6", name: "gpt-5.6" }] })
    if (route === "/api/pricing") return Response.json({ data: [] })
    return Response.json({}, { status: 404 })
  },
})
process.env.KT_IDENTITY_BASE_URL = server.url.origin
process.env.KTAI_NEWAPI_BASE_URL = server.url.origin
process.env.KITO_KTAI_IDENTITY_PATH = path.join(directory, "identity.json")
process.env.KITO_KTAI_API_KEY_PATH = path.join(directory, "key.json")
// Catalog URLs are production constants. Replacing only the HTTP transport is
// necessary here so the actual Kito provider runs against local wire fixtures;
// no fixture key is ever sent to a production service.
globalThis.fetch = Object.assign(
  (input: string | URL | Request, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw)
    if (["ktapi.cc", "login.ktyun.cc"].includes(url.hostname))
      return nativeFetch(`${server.url.origin}${url.pathname}${url.search}`, init)
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
      return Promise.reject(new Error("External test request refused"))
    return nativeFetch(input, init)
  },
  { preconnect: nativeFetch.preconnect },
)

const { PluginTestLayer } = await import("../plugin/fixture")
const { Bus } = await import("@opencode/core/bus")
const { Plugin } = await import("@opencode/core/plugin")
const { KtaiPlugin } = await import("@opencode/core/plugin/provider/ktai")
const { Credential } = await import("@opencode/core/credential")
const { Integration } = await import("@opencode/core/integration")
const { Provider } = await import("@opencode/core/provider")
const { desktopLogin } = await import("@opencode/core/ktai/desktop-login")
const { persistIdentityToken, readPersistedIdentityToken } = await import("@opencode/core/ktai/identity")
const { persistManagedApiKey } = await import("@opencode/core/ktai/newapi")
const it = testEffect(PluginTestLayer)

beforeEach(async () => {
  Object.assign(state, {
    source: "B",
    allowSwitch: false,
    cancelled: false,
    cancelAtEnsure: false,
    revoked: false,
    challenges: 0,
    approvals: 0,
    revocations: 0,
    generation: 1,
  })
  challenges.clear()
  await rm(path.join(directory, "identity.json"), { force: true })
  await rm(path.join(directory, "key.json"), { force: true })
})
afterAll(async () => {
  server.stop(true)
  globalThis.fetch = nativeFetch
  for (const [name, value] of [
    ["KT_IDENTITY_BASE_URL", previousEnv.identity],
    ["KTAI_NEWAPI_BASE_URL", previousEnv.newapi],
    ["KITO_KTAI_IDENTITY_PATH", previousEnv.file],
    ["KITO_KTAI_API_KEY_PATH", previousEnv.key],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  for (const [name, value] of Object.entries(previousRoots)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  await rm(directory, { recursive: true, force: true })
})

const seed = Effect.fn(function* (expired = false) {
  const plugins = yield* Plugin.Service
  const bus = yield* Bus.Service
  // Internal plugins capture Core dependencies before the host isolates scope.
  yield* plugins.activate([
    {
      ...KtaiPlugin,
      id: Plugin.ID.make(KtaiPlugin.id),
      revision: "desktop-login-contract",
      effect: (host) => KtaiPlugin.effect(host).pipe(Effect.provideService(Bus.Service, bus)),
    },
  ])
  yield* Plugin.awaitActivation
  expect((yield* plugins.list()).map((item) => ({ id: String(item.id), state: item.state }))).toEqual([
    { id: "opencode.provider.ktai", state: { status: "active" } },
  ])
  const credentials = yield* Credential.Service
  const expiry = new Date(Date.now() + (expired ? -3_600_000 : 3_600_000)).toISOString()
  persistIdentityToken("old-A", { accountId: "A", expiresAt: expiry, refreshToken: "old-refresh-A" })
  yield* Effect.promise(() => persistManagedApiKey("sk-A-1"))
  const saved = yield* credentials.create({
    integrationID: Integration.ID.make("ktai"),
    value: Credential.OAuth.make({
      type: "oauth",
      methodID: Integration.MethodID.make("telegram"),
      access: "old-A",
      refresh: "old-refresh-A",
      expires: Date.parse(expiry),
      metadata: { accountId: "A", expiresAt: expiry },
    }),
  })
  return saved
})

it.live(
  "cross-account requests preserve both the original credential and on-disk data without consent",
  () =>
    Effect.gen(function* () {
      const saved = yield* seed()
      const credentials = yield* Credential.Service
      const before = yield* Effect.promise(() => readFile(path.join(directory, "identity.json"), "utf8"))
      const result = yield* desktopLogin({ port: server.port!, request: nonce })
      expect(result.status).toBe("account_conflict")
      expect(state.challenges).toBe(0)
      expect(yield* credentials.get(saved.id)).toEqual(saved)
      expect(yield* Effect.promise(() => readFile(path.join(directory, "identity.json"), "utf8"))).toBe(before)
    }),
  15_000,
)

it.live(
  "switching to B waits for B's provider key, preserves A, and refreshes a reissued same-account key",
  () =>
    Effect.gen(function* () {
      const saved = yield* seed()
      state.allowSwitch = true
      const credentials = yield* Credential.Service
      const provider = yield* Provider.Service
      const sentinel = path.join(directory, "existing-project-and-chat.txt")
      yield* Effect.promise(() => writeFile(sentinel, "keep existing data"))
      expect((yield* desktopLogin({ port: server.port!, request: nonce })).status).toBe("signed_in")
      expect((yield* provider.get(Provider.ID.make("ktai")))?.settings?.apiKey).toBe("sk-B-1")
      expect(readPersistedIdentityToken()).toBe("new-B")
      expect(yield* credentials.get(saved.id)).toEqual(saved)
      expect(yield* Effect.promise(() => readFile(sentinel, "utf8"))).toBe("keep existing data")
      state.generation = 2
      expect((yield* desktopLogin({ port: server.port!, request: nonce })).status).toBe("reused")
      expect((yield* provider.get(Provider.ID.make("ktai")))?.settings?.apiKey).toBe("sk-B-2")
      expect(state.challenges).toBe(1)
    }),
  15_000,
)

it.live(
  "cancellation before commit preserves A and revokes the unused target device",
  () =>
    Effect.gen(function* () {
      const saved = yield* seed()
      state.allowSwitch = true
      state.cancelAtEnsure = true
      const credentials = yield* Credential.Service
      const exit = yield* desktopLogin({ port: server.port!, request: nonce }).pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      expect(readPersistedIdentityToken()).toBe("old-A")
      expect(yield* credentials.get(saved.id)).toEqual(saved)
      expect((yield* credentials.list(Integration.ID.make("ktai"))).length).toBe(1)
      expect(state.revocations).toBe(1)
    }),
  15_000,
)

it.live(
  "a revoked locally unexpired session is replaced through a fresh Desktop-approved device",
  () =>
    Effect.gen(function* () {
      yield* seed()
      state.source = "A"
      state.revoked = true
      const result = yield* desktopLogin({ port: server.port!, request: nonce })
      expect(result.status).toBe("signed_in")
      expect(readPersistedIdentityToken()).toBe("new-A")
      expect(state.challenges).toBe(1)
      expect(state.approvals).toBe(1)
    }),
  15_000,
)

it.live(
  "expired access and revoked refresh do not block a fresh same-account approval",
  () =>
    Effect.gen(function* () {
      yield* seed(true)
      state.source = "A"
      const result = yield* desktopLogin({ port: server.port!, request: nonce })
      expect(result.status).toBe("signed_in")
      expect(readPersistedIdentityToken()).toBe("new-A")
      expect(state.approvals).toBe(1)
    }),
  15_000,
)
