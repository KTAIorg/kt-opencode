import type { IntegrationOAuthMethodRegistration } from "@opencode/plugin/effect/integration"
import { define } from "@opencode/plugin/effect/plugin"
import { Money } from "@opencode/schema/money"
import { Effect, Stream, type Types } from "effect"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import { HIDDEN_RELEASE_DATE, KTAI_API_URL, loadKtaiModels, type RawModel } from "../../ktai/catalog.js"
import {
  clearPersistedIdentity,
  InvalidIdentityRefreshError,
  type IdentityBearerSession,
  persistIdentitySession,
  persistIdentityToken,
  pollDeviceLogin,
  refreshDeviceTokens,
  sessionExpiresAt,
  startDeviceLogin,
} from "../../ktai/identity.js"
import { readManagedApiKey, syncManagedToken } from "../../ktai/newapi.js"
import { Model } from "@opencode/schema/model"
import { Provider } from "../../provider.js"
import type { PluginInternal } from "../internal.js"

const providerID = Provider.ID.make("ktai")
const integrationID = Integration.ID.make("ktai")
const methodID = Integration.MethodID.make("telegram")

function capabilities(tags: string) {
  const image = /(?:^|,)Vision(?:,|$)/i.test(tags)
  const pdf = /(?:^|,)Files(?:,|$)/i.test(tags)
  const input = ["text", ...(image ? ["image"] : []), ...(pdf ? ["pdf"] : [])]
  return {
    tools: /(?:^|,)Tools(?:,|$)/i.test(tags),
    input,
    output: ["text"],
  }
}

function applyModel(model: RawModel, draft: Types.DeepMutable<Model.Info>) {
  const tags = model.tags ?? ""
  const visible = model.defaultVisible !== false
  draft.modelID = Model.ID.make(model.id)
  draft.name = model.name ?? model.id
  draft.family = Model.Family.make(visible ? `ktai:${model.id}` : "ktai")
  draft.capabilities = capabilities(tags)
  draft.limit = {
    context: model.context ?? 131_072,
    output: 32_768,
  }
  draft.cost = [
    {
      input: Money.USDPerMillionTokens.make(model.input),
      output: Money.USDPerMillionTokens.make(model.output),
      cache: {
        read: Money.USDPerMillionTokens.zero,
        write: Money.USDPerMillionTokens.zero,
      },
    },
  ]
  draft.status = "active"
  // Keep every catalog model selectable in Manage Models. The picker still
  // hides non-defaults via the stale release date until the user turns them on.
  draft.enabled = true
  draft.time.released = visible ? Date.now() : Date.parse(HIDDEN_RELEASE_DATE)
}

const telegram = (): IntegrationOAuthMethodRegistration => ({
  integrationID,
  method: {
    id: methodID,
    type: "oauth",
    label: "Telegram",
  },
  authorize: () =>
    Effect.gen(function* () {
      const challenge = yield* Effect.tryPromise({
        try: () => startDeviceLogin(),
        catch: (cause) => (cause instanceof Error ? cause : new Error("KT Identity device login start failed")),
      })
      return {
        mode: "auto" as const,
        url: challenge.loginUrl,
        // instructions 格式是 app 端 parseTelegramAuthorization 的解析契约。
        instructions: `Confirm Kito login in Telegram @${telegramBotFromUrl(challenge.loginUrl)}. Code: ${challenge.userCode}`,
        callback: Effect.tryPromise({
          try: () => {
            // 轮询窗口对齐 challenge 服务端过期时间（+30s 宽限），解析失败回落默认 180s。
            const deadline = Date.parse(challenge.expiresAt)
            const timeoutMs = Number.isFinite(deadline) ? Math.max(deadline + 30_000 - Date.now(), 60_000) : 180_000
            return pollDeviceLogin({ sessionId: challenge.sessionId, opaqueCode: challenge.opaqueCode, timeoutMs })
          },
          catch: (cause) => (cause instanceof Error ? cause : new Error("KT Identity device login failed")),
        }).pipe(
          Effect.tap((session) =>
            Effect.sync(() => persistIdentitySession(session)).pipe(
              Effect.andThen(
                Effect.tryPromise({
                  try: () => syncManagedToken(session.token),
                  catch: () => undefined,
                }).pipe(Effect.catch(() => Effect.void)),
              ),
            ),
          ),
          Effect.map((session) => identityCredential(session)),
        ),
      }
    }),
  // OpenCode core 在 access 临期 5 分钟内带锁调用：换新 access 并落盘
  // ktai-identity.json（UI 的登录态来源），托管 NewAPI key 的 ensure 有
  // 自身节流，此处直接触发即可。refresh 面失效时清空本地登录态（托管
  // key 保留），下一次 load 自然回落到 key 模式。
  refresh: (credential) =>
    Effect.tryPromise({
      try: async () => {
        const session = await refreshDeviceTokens({ refreshToken: credential.refresh }).catch((cause: unknown) => {
          if (cause instanceof InvalidIdentityRefreshError) clearPersistedIdentity()
          throw cause
        })
        persistIdentitySession(session)
        void syncManagedToken(session.token).catch(() => undefined)
        return identityCredential(session)
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error("KT Identity refresh failed")),
    }),
})

function identityCredential(session: IdentityBearerSession) {
  return Credential.OAuth.make({
    type: "oauth",
    methodID,
    refresh: session.device?.refreshToken ?? session.token,
    access: session.token,
    expires: sessionExpiresAt(session),
    // Keep the server-provided expiry in metadata: `expires` may be a
    // runtime estimate when Identity omits expiresAt, and only the
    // real value may be written back to ktai-identity.json.
    metadata: {
      accountId: session.account.id,
      ...(session.session.expiresAt ? { expiresAt: session.session.expiresAt } : {}),
      ...(session.device?.refreshExpiresAt ? { refreshExpiresAt: session.device.refreshExpiresAt } : {}),
      ...(session.device?.deviceSessionId ? { deviceSessionId: session.device.deviceSessionId } : {}),
    },
  })
}

function telegramBotFromUrl(url: string) {
  return /t\.me\/([^/?#]+)/.exec(url)?.[1] ?? "bot"
}

export const KtaiPlugin = define({
  id: "opencode.provider.ktai",
  effect: Effect.fn(function* (ctx) {
    const bus = yield* Bus.Service
    const loaded: { models: RawModel[]; apiKey?: string } = { models: [] }

    const load = Effect.fn("KtaiPlugin.load")(function* () {
      const connection = yield* ctx.integration.connection.active("ktai")
      const credential = connection
        ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.catch(() => Effect.succeed(undefined)))
        : undefined
      if (credential?.type === "oauth" && credential.access)
        persistIdentityToken(credential.access, {
          accountId: typeof credential.metadata?.accountId === "string" ? credential.metadata.accountId : undefined,
          // `credential.expires` can be an estimate, so persist only the
          // server-provided expiresAt stored in metadata. Omitting it keeps a
          // token without server expiry valid instead of inventing a logout.
          expiresAt: typeof credential.metadata?.expiresAt === "string" ? credential.metadata.expiresAt : undefined,
          refreshToken: credential.refresh,
          refreshExpiresAt:
            typeof credential.metadata?.refreshExpiresAt === "string"
              ? credential.metadata.refreshExpiresAt
              : undefined,
          deviceSessionId:
            typeof credential.metadata?.deviceSessionId === "string" ? credential.metadata.deviceSessionId : undefined,
        })
      const managed = yield* Effect.promise(() => readManagedApiKey())
      const apiKey =
        managed ?? process.env.KTAI_API_KEY?.trim() ?? (credential?.type === "key" ? credential.key : undefined)
      loaded.apiKey = apiKey
      loaded.models = yield* Effect.promise(() => loadKtaiModels(apiKey)).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("failed to load Kito catalog", { cause }).pipe(Effect.as(loaded.models)),
        ),
      )
    })

    yield* ctx.integration.transform((draft) => {
      draft.update("ktai", (integration) => {
        integration.name = "Kito"
      })
      draft.method.update(telegram())
      draft.method.update({
        integrationID,
        method: { type: "key", label: "API key" },
      })
    })

    yield* ctx.provider.transform((providers) => {
      providers.update(providerID, (provider) => {
        provider.name = "Kito"
        provider.activation = "enabled"
        provider.package = "@opencode/ai/providers/openai-compatible"
        provider.integrationID = integrationID
        provider.settings = {
          baseURL: KTAI_API_URL,
          provider: "ktai",
          apiKey: loaded.apiKey ?? "",
          includeUsage: true,
        }
      })
      const seen = new Set(loaded.models.map((model) => model.id))
      const existing = providers.get(providerID)
      if (existing) {
        for (const id of existing.models.keys()) {
          if (!seen.has(id)) providers.models.remove(providerID, id)
        }
      }
      for (const item of loaded.models) {
        providers.models.update(providerID, item.id, (model) => applyModel(item, model))
      }
    })
    yield* ctx.model.transform((models) => {
      const first = loaded.models.find((model) => model.defaultVisible !== false)
      if (first) models.default.set(providerID, first.id)
    })

    const refresh = () => load().pipe(Effect.andThen(ctx.provider.reload()))
    yield* bus.subscribe(Credential.Event.Switched).pipe(
      Stream.filter((event) => event.data.integrationID === integrationID),
      Stream.runForEach(refresh),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* Effect.gen(function* () {
      yield* refresh()
      for (const delay of ["5 seconds", "15 seconds", "30 seconds"] as const) {
        if (loaded.models.length) return
        yield* Effect.sleep(delay)
        yield* refresh()
      }
    }).pipe(Effect.forkScoped)
  }),
} satisfies PluginInternal.InternalPlugin)
