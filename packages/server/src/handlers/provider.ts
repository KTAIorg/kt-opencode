import { Provider } from "@opencode/core/provider"
import { Model } from "@opencode/core/model"
import { Integration } from "@opencode/core/integration"
import { ModelProbe } from "@opencode/core/model-probe"
import { InvalidRequestError, ProviderNotFoundError, ServiceUnavailableError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const providers = yield* Provider.Service
          return yield* response(providers.available())
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const providers = yield* Provider.Service
          const provider = yield* providers.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          return yield* response(Effect.succeed(provider))
        }),
      )
      .handle(
        "provider.models.probe",
        Effect.fn(function* (ctx) {
          const providers = yield* Provider.Service
          const models = yield* Model.Service
          const integrations = yield* Integration.Service
          const provider = yield* providers.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          const ids = [...new Set(ctx.payload.modelIDs.map((id) => id.trim()).filter(Boolean))]
          if (!ids.length || ids.length > 100)
            return yield* new InvalidRequestError({
              message: "modelIDs must contain between 1 and 100 models",
              kind: "provider_models_probe",
            })
          return yield* response(ModelProbe.probeProvider(models, integrations, provider, ids)).pipe(
            Effect.catchCause((cause) => Effect.fail(new ServiceUnavailableError({ message: String(cause) }))),
          )
        }),
      )
  }),
)
