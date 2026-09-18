import { Provider } from "@opencode-ai/schema/provider"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError, ProviderNotFoundError, ServiceUnavailableError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const ProviderModelProbeResult = Schema.Struct({
  modelID: Schema.String,
  ok: Schema.Boolean,
  status: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
}).annotate({ identifier: "ProviderModelProbeResult" })

export const ProviderModelProbe = Schema.Struct({
  results: Schema.Array(ProviderModelProbeResult),
  probedAt: Schema.Number,
}).annotate({ identifier: "ProviderModelProbe" })

export const ProviderGroup = HttpApiGroup.make("server.provider")
  .add(
    HttpApiEndpoint.get("provider.list", "/api/provider", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Provider.Info)),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.list",
          summary: "List providers",
          description: "Retrieve active AI providers so clients can show provider availability and configuration.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("provider.get", "/api/provider/:providerID", {
      params: { providerID: Provider.ID },
      query: LocationQuery,
      success: Location.response(Provider.Info),
      error: [ProviderNotFoundError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.get",
          summary: "Get provider",
          description: "Retrieve a single AI provider so clients can inspect its availability and endpoint settings.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("provider.models.probe", "/api/provider/:providerID/models/probe", {
      params: { providerID: Provider.ID },
      query: LocationQuery,
      payload: Schema.Struct({
        modelIDs: Schema.Array(Schema.String),
      }),
      success: Location.response(ProviderModelProbe),
      error: [ProviderNotFoundError, InvalidRequestError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.models.probe",
          summary: "Probe provider models",
          description:
            "Send a minimal request per requested model through the provider's resolved endpoint and credentials, and report per-model availability. Kito models use /ktai/models/probe instead.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "provider",
      description: "Experimental provider routes.",
    }),
  )
