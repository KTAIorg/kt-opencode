import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { Catalog } from "@opencode-ai/core/catalog"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { ProviderPlugins } from "@opencode-ai/core/plugin/provider"
import { KtaiPlugin, parseCatalog } from "@opencode-ai/core/plugin/provider/ktai"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* () {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  yield* KtaiPlugin.effect(host)
})

describe("KtaiPlugin", () => {
  it.effect("is registered in ProviderPlugins", () =>
    Effect.sync(() => expect(ProviderPlugins.map((item) => item.id)).toContain(PluginV2.ID.make("ktai"))),
  )

  it.effect("registers the ktai provider pointing at the new-api gateway", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* addPlugin()
      const provider = yield* catalog.provider.get(ProviderV2.ID.make("ktai"))
      expect(provider?.name).toBe("KTAI")
      expect(provider?.api).toMatchObject({
        type: "aisdk",
        package: "@ai-sdk/openai-compatible",
        url: "https://ktapi.cc/v1",
      })
    }),
  )

  it.effect("maps new-api pricing tags to capabilities (no pricing math)", () =>
    Effect.sync(() => {
      const models = parseCatalog([
        {
          model_name: "gpt-5.4",
          name: "GPT-5.4",
          tags: "Reasoning,Tools,Vision,Files,400K",
          enable_groups: ["ktai"],
          supported_endpoint_types: ["openai"],
          // pricing fields intentionally present but ignored
          quota_type: 0,
          model_ratio: 2,
          completion_ratio: 5,
        },
      ])
      expect(models).toHaveLength(1)
      const model = models[0]!
      expect(model.id).toBe("gpt-5.4")
      expect(model.name).toBe("GPT-5.4")
      expect(model.tools).toBe(true)
      expect(model.reasoning).toBe(true)
      expect(model.input).toEqual(["text", "image", "pdf"])
      expect(model.context).toBe(400_000)
      expect(model).not.toHaveProperty("cost")
    }),
  )

  it.effect("skips rows outside the ktai group or without an openai endpoint", () =>
    Effect.sync(() => {
      const models = parseCatalog([
        { model_name: "other-group", tags: "Tools", enable_groups: ["not-ktai"], supported_endpoint_types: ["openai"] },
        { model_name: "wrong-endpoint", tags: "Tools", enable_groups: ["ktai"], supported_endpoint_types: ["image"] },
        { model_name: "kept", tags: "Tools", enable_groups: ["ktai"], supported_endpoint_types: ["openai-response"] },
      ])
      expect(models.map((item) => item.id)).toEqual(["kept"])
    }),
  )

  it.effect("falls back to a static catalog when the source is empty or unreachable", () =>
    Effect.sync(() => {
      const fromNull = parseCatalog(null)
      const fromEmpty = parseCatalog([])
      expect(fromNull.length).toBeGreaterThan(0)
      expect(fromEmpty).toEqual(fromNull)
      expect(fromNull.some((item) => item.id === "gpt-5.4")).toBe(true)
    }),
  )
})
