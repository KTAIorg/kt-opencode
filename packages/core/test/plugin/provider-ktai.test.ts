import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { ProviderPlugins } from "@opencode-ai/core/plugin/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

describe("KtaiPlugin", () => {
  it.effect("is registered as a built-in provider plugin", () =>
    Effect.sync(() => expect(ProviderPlugins.map((item) => item.id)).toContain("opencode.provider.ktai")),
  )
})
