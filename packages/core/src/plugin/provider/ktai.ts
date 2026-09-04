import type { IntegrationOAuthMethodRegistration } from "@opencode-ai/plugin/effect/integration"
import { define } from "@opencode-ai/plugin/effect/plugin"
import { Money } from "@opencode-ai/schema/money"
import { Effect, Stream } from "effect"
import { Bus } from "../../bus.js"
import { Credential } from "../../credential.js"
import { Integration } from "../../integration.js"
import {
  HIDDEN_RELEASE_DATE,
  KTAI_API_URL,
  loadKtaiModels,
  type RawModel,
} from "../../ktai/catalog.js"
import {
  KT_IDENTITY_REFRESH_MARKER,
  persistIdentitySession,
  persistIdentityToken,
  pollTelegramLogin,
  sessionExpiresAt,
  startTelegramLogin,
} from "../../ktai/identity.js"
import { readManagedApiKey, syncManagedToken } from "../../ktai/newapi.js"
import { Model } from "../../model.js"
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

function applyModel(model: RawModel, draft: Model.MutableInfo) {
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
        try: () => startTelegramLogin(),
        catch: (cause) => (cause instanceof Error ? cause : new Error("KT Identity Telegram start failed")),
      })
      return {
        mode: "auto" as const,
        url: challenge.telegram.qrUrl,
        instructions: `Confirm Kito login in Telegram @${challenge.telegram.botUsername}. Code: ${challenge.displayCode}`,
        callback: Effect.tryPromise({
          try: () => pollTelegramLogin({ challengeId: challenge.challengeId, opaqueCode: challenge.opaqueCode }),
          catch: (cause) => (cause instanceof Error ? cause : new Error("KT Identity Telegram login failed")),
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
          Effect.map((session) =>
            Credential.OAuth.make({
              type: "oauth",
              methodID,
              refresh: KT_IDENTITY_REFRESH_MARKER,
              access: session.token,
              expires: sessionExpiresAt(session),
              metadata: { accountId: session.account.id },
            }),
          ),
        ),
      }
    }),
})

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
      if (credential?.type === "oauth" && credential.access) persistIdentityToken(credential.access)
      const managed = yield* Effect.promise(() => readManagedApiKey())
      const apiKey =
        managed ??
        process.env.KTAI_API_KEY?.trim() ??
        (credential?.type === "key" ? credential.key : undefined)
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

    yield* ctx.catalog.transform((catalog) => {
      catalog.provider.update(providerID, (provider) => {
        provider.name = "Kito"
        provider.activation = "enabled"
        provider.package = Provider.aisdk("@ai-sdk/openai-compatible")
        provider.integrationID = integrationID
        provider.settings = {
          baseURL: KTAI_API_URL,
          provider: "ktai",
          apiKey: loaded.apiKey ?? "",
          includeUsage: true,
        }
      })
      const seen = new Set(loaded.models.map((model) => model.id))
      const existing = catalog.provider.get(providerID)
      if (existing) {
        for (const id of existing.models.keys()) {
          if (!seen.has(id)) catalog.model.remove(providerID, id)
        }
      }
      for (const item of loaded.models) {
        catalog.model.update(providerID, item.id, (model) => applyModel(item, model))
      }
      const first = loaded.models.find((model) => model.defaultVisible !== false)
      if (first) catalog.model.default.set(providerID, first.id)
    })

    const refresh = () => load().pipe(Effect.andThen(ctx.catalog.reload()))
    yield* bus.subscribe(Integration.Event.ConnectionUpdated).pipe(
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
