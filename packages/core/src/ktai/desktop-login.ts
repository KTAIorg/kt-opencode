import { Effect, Semaphore } from "effect"
import { Bus } from "../bus.js"
import { Credential } from "../credential.js"
import { Integration } from "../integration.js"
import { Provider } from "../provider.js"
import {
  ensureFreshIdentityToken,
  exchangeDeviceTokens,
  fetchAccountMe,
  identityBaseUrl,
  InvalidIdentityRefreshError,
  persistIdentitySession,
  readPersistedIdentityAccountId,
  sessionExpiresAt,
  startDeviceLogin,
  type IdentityBearerSession,
} from "./identity.js"
import { ensureManagedToken, persistManagedApiKey } from "./newapi.js"

export type DesktopLoginInput = { port: number; request: string }
export type DesktopLoginResult = {
  status: "signed_in" | "reused" | "account_conflict"
  accountId: string
  accountName?: string
}
const integrationID = Integration.ID.make("ktai")
const lock = Semaphore.makeUnsafe(1)

async function callbackJSON(callback: string, path: string, body?: unknown) {
  const response = await fetch(`${callback}${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error("Desktop login is no longer authorized")
  return response.json() as Promise<unknown>
}

const refreshProvider = Effect.fn("Ktai.desktopLogin.refreshProvider")(function* (
  credentialID: Credential.ID,
  key: string,
) {
  const bus = yield* Bus.Service
  const provider = yield* Provider.Service
  yield* bus.publish(Credential.Event.Switched, { integrationID, credentialID }, { global: true })
  const expected = key.startsWith("sk-") ? key : `sk-${key}`
  for (let attempt = 0; attempt < 100; attempt++) {
    const active = yield* provider.get(Provider.ID.make("ktai"))
    if (active?.settings?.apiKey === expected) return
    yield* Effect.sleep("50 millis")
  }
  throw new Error("Kito model provider did not finish switching accounts")
})

async function reusableToken(accountId: string) {
  const token = await ensureFreshIdentityToken().catch((cause: unknown) => {
    if (cause instanceof InvalidIdentityRefreshError) return undefined
    throw cause
  })
  if (!token) return
  const response = await fetch(`${identityBaseUrl()}/identity/v1/account/me`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 401 || response.status === 403) return
  if (!response.ok) throw new Error("Kito account verification is unavailable")
  const account = await fetchAccountMe(token)
  if (account.id !== accountId) return
  return { token, account }
}

const runDesktopLogin = Effect.fn("Ktai.desktopLogin")(function* (input: DesktopLoginInput) {
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535 || !/^[a-f0-9]{64}$/.test(input.request))
    throw new Error("Invalid Desktop login request")
  if (process.env.KTAI_API_KEY?.trim()) throw new Error("Desktop sign-in requires a personal model credential")
  const callback = `http://127.0.0.1:${input.port}/kito/${input.request}`
  const source = yield* Effect.promise(async () => {
    const data = await callbackJSON(callback, "")
    if (
      !data ||
      typeof data !== "object" ||
      !("accountId" in data) ||
      typeof data.accountId !== "string" ||
      !("allowSwitch" in data) ||
      typeof data.allowSwitch !== "boolean"
    )
      throw new Error("Invalid Desktop account")
    return { accountId: data.accountId, allowSwitch: data.allowSwitch }
  })
  const report = (result: DesktopLoginResult) =>
    Effect.promise(async () => {
      await callbackJSON(callback, "/complete", result)
      return result
    })
  const integration = yield* Integration.Service
  const active = yield* integration.connection.active(integrationID)
  // Inspect the saved owner without refreshing the previous account before
  // consent. Revoked refresh tokens must not prevent a new Desktop approval.
  const credentials = yield* Credential.Service
  const credential = active?.type === "credential" ? (yield* credentials.get(active.id))?.value : undefined
  const previous =
    credential?.type === "oauth" && typeof credential.metadata?.accountId === "string"
      ? credential.metadata.accountId
      : credential && credential.type !== "oauth"
        ? undefined
        : readPersistedIdentityAccountId()
  // A manually configured key has no verified owner. Do not associate it with
  // an old Identity sidecar or silently replace it on the first Desktop click.
  if (((previous && previous !== source.accountId) || (credential && !previous)) && !source.allowSwitch)
    return yield* report({ status: "account_conflict", accountId: previous ?? "unknown" })
  const current =
    previous === source.accountId ? yield* Effect.promise(() => reusableToken(source.accountId)) : undefined
  if (current && active?.type === "credential") {
    const managed = yield* Effect.promise(() => ensureManagedToken(current.token))
    yield* Effect.promise(() => callbackJSON(callback, "/commit", { accountId: source.accountId, status: "reused" }))
    yield* Effect.promise(() => persistManagedApiKey(managed.key))
    yield* refreshProvider(active.id, managed.key)
    return yield* report({
      status: "reused",
      accountId: current.account.id,
      accountName: current.account.displayName ?? current.account.accountNo,
    })
  }

  const challenge = yield* Effect.promise(() => startDeviceLogin())
  yield* Effect.promise(() =>
    callbackJSON(callback, "/approve", { sessionId: challenge.sessionId, userCode: challenge.userCode }),
  )
  const session = yield* Effect.promise(() =>
    exchangeDeviceTokens({ sessionId: challenge.sessionId, opaqueCode: challenge.opaqueCode }),
  )
  let committed = false
  return yield* Effect.gen(function* () {
    if (session.account.id !== source.accountId) throw new Error("Approved Kito account does not match Desktop")
    const managed = yield* Effect.promise(() => ensureManagedToken(session.token))
    // Acknowledge that cancellation has not won before touching target storage.
    // Desktop disables cancellation for the following short credential commit.
    yield* Effect.promise(() => callbackJSON(callback, "/commit", { accountId: source.accountId, status: "signed_in" }))
    const credentials = yield* Credential.Service
    const value = Credential.OAuth.make({
      type: "oauth",
      methodID: Integration.MethodID.make("telegram"),
      access: session.token,
      refresh: session.device?.refreshToken ?? session.token,
      expires: sessionExpiresAt(session),
      metadata: {
        accountId: session.account.id,
        ...(session.session.expiresAt ? { expiresAt: session.session.expiresAt } : {}),
        ...(session.device?.refreshExpiresAt ? { refreshExpiresAt: session.device.refreshExpiresAt } : {}),
        ...(session.device?.deviceSessionId ? { deviceSessionId: session.device.deviceSessionId } : {}),
      },
    })
    const existing = (yield* credentials.list(integrationID)).find(
      (item) => item.value.type === "oauth" && item.value.metadata?.accountId === session.account.id,
    )
    // B's model key must exist before any B activation event reaches Provider.
    yield* Effect.promise(async () => {
      await persistManagedApiKey(managed.key)
      persistIdentitySession(session)
    })
    const stored =
      existing ??
      (yield* credentials.create({
        integrationID,
        value,
        label: session.account.displayName ?? session.account.accountNo,
      }))
    if (existing) yield* credentials.update(existing.id, { value })
    yield* credentials.activate(stored.id)
    committed = true
    yield* refreshProvider(stored.id, managed.key)
    return yield* report({
      status: "signed_in",
      accountId: session.account.id,
      accountName: session.account.displayName ?? session.account.accountNo,
    })
  }).pipe(Effect.ensuring(Effect.promise(() => (committed ? Promise.resolve() : revokeUnusedSession(session)))))
})

async function revokeUnusedSession(session: IdentityBearerSession) {
  if (!session.device?.deviceSessionId) return
  await fetch(
    `${identityBaseUrl()}/identity/v1/device/device-sessions/${encodeURIComponent(session.device.deviceSessionId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${session.token}` },
      signal: AbortSignal.timeout(5000),
    },
  ).catch(() => undefined)
}

export const desktopLogin = (input: DesktopLoginInput) => lock.withPermits(1)(runDesktopLogin(input))
