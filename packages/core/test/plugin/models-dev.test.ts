import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Catalog } from "@opencode-ai/core/catalog"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { ModelV2 } from "@opencode-ai/core/model"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { ModelsDevPlugin } from "@opencode-ai/core/plugin/models-dev"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"

const reasoningOptions: ModelsDev.ReasoningOption[] = [
  { type: "toggle" },
  { type: "effort", values: [null, "low", "ultrathink"], default: "low" },
  { type: "budget_tokens", min: 1024, future: true },
  { type: "future_dynamic_budget", curve: { min: 1, max: 10 }, enabled: true },
]

const modelsDev = Layer.succeed(
  ModelsDev.Service,
  ModelsDev.Service.of({
    get: () =>
      Effect.succeed({
        acme: {
          id: "acme",
          name: "Acme",
          env: [],
          models: {
            "acme-1": {
              id: "acme-1",
              name: "Acme One",
              release_date: "2026-01-01",
              attachment: false,
              reasoning: true,
              reasoning_options: reasoningOptions,
              temperature: true,
              tool_call: true,
              limit: { context: 128_000, output: 8_192 },
            },
          },
        },
      }),
    refresh: () => Effect.void,
  }),
)
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make("test") })),
)
const catalog = Catalog.locationLayer.pipe(Layer.provideMerge(EventV2.defaultLayer), Layer.provideMerge(locationLayer))
const it = testEffect(Layer.merge(catalog, modelsDev))

describe("ModelsDevPlugin", () => {
  it.effect("maps known reasoning options into typed V2 capabilities", () =>
    Effect.gen(function* () {
      yield* ModelsDevPlugin.effect
      const model = yield* (yield* Catalog.Service).model.get(ProviderV2.ID.make("acme"), ModelV2.ID.make("acme-1"))

      expect(model.capabilities.reasoningOptions).toEqual([
        { type: "toggle" },
        { type: "effort", values: ["low", "ultrathink"] },
        { type: "budget_tokens", min: 1024 },
      ])
    }),
  )
})
