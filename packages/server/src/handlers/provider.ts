import { Catalog } from "@opencode-ai/core/catalog"
import { Integration } from "@opencode-ai/core/integration"
import { ModelProbe } from "@opencode-ai/core/model-probe"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { InvalidRequestError, ProviderNotFoundError } from "@opencode-ai/protocol/errors"
import { response } from "../location"

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  handlers
    .handle(
      "provider.list",
      Effect.fn(function* () {
        const catalog = yield* Catalog.Service
        return yield* response(catalog.provider.available())
      }),
    )
    .handle(
      "provider.get",
      Effect.fn(function* (ctx) {
        const catalog = yield* Catalog.Service
        const provider = yield* catalog.provider.get(ctx.params.providerID)
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
        const catalog = yield* Catalog.Service
        const integrations = yield* Integration.Service
        const provider = yield* catalog.provider.get(ctx.params.providerID)
        if (!provider)
          return yield* new ProviderNotFoundError({
            providerID: ctx.params.providerID,
            message: `Provider not found: ${ctx.params.providerID}`,
          })
        const ids = [...new Set(ctx.payload.modelIDs.map((id) => id.trim()).filter(Boolean))]
        if (ids.length === 0) {
          return yield* new InvalidRequestError({
            message: "modelIDs must not be empty",
            kind: "provider_models_probe",
          })
        }
        if (ids.length > 100) {
          return yield* new InvalidRequestError({
            message: "modelIDs is limited to 100 per probe",
            kind: "provider_models_probe",
          })
        }
        // 缺凭据等失败由 probeProvider 汇报为 per-model 结果，而不是 401 整个接口。
        return yield* response(
          ModelProbe.probeProvider(catalog, integrations, provider, ids),
        )
      }),
    ),
)
