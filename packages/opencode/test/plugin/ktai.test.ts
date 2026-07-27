import { expect, test } from "bun:test"
import {
  catalogModels,
  createKTAIProviderConfig,
  KTAIProviderPlugin,
  pricingIndex,
  pricingModels,
} from "@/plugin/ktai"

test("builds KTAI models from /v1/models catalog enriched by pricing", () => {
  const costs = pricingIndex({
    data: [
      {
        model_name: "gpt-5.4",
        name: "GPT-5.4",
        enable_groups: ["ktai"],
        supported_endpoint_types: ["openai"],
        quota_type: 0,
        model_ratio: 2,
        completion_ratio: 5,
        tags: "Reasoning,Tools,Vision,Files,400K",
      },
    ],
  })
  const provider = createKTAIProviderConfig(
    catalogModels(
      {
        data: [{ id: "gpt-5.4", object: "model", supported_endpoint_types: ["openai"] }],
      },
      costs,
    ),
  )

  expect(provider.api).toBe("https://ktapi.cc/v1")
  expect(provider.env).toEqual(["KTAI_API_KEY"])
  expect(provider.models?.["gpt-5.4"]?.cost).toEqual({ input: 4, output: 20 })
  expect(provider.models?.["gpt-5.4"]?.limit?.context).toBe(400_000)
})

test("pricing fallback still filters to ktai + openai endpoints", () => {
  const list = pricingModels({
    data: [
      {
        model_name: "skip-me",
        enable_groups: ["default"],
        supported_endpoint_types: ["openai"],
        model_price: 1,
        quota_type: 1,
      },
      {
        model_name: "gpt-5.4",
        enable_groups: ["ktai"],
        supported_endpoint_types: ["openai"],
        quota_type: 0,
        model_ratio: 2,
        completion_ratio: 5,
      },
    ],
  })
  expect(list.map((m) => m.id)).toEqual(["gpt-5.4"])
})

test("exposes KT Identity login methods plus API key fallback", async () => {
  const hooks = await KTAIProviderPlugin()
  expect(hooks.auth?.provider).toBe("ktai")
  expect(hooks.auth?.methods.map((method) => method.label)).toEqual([
    "KT Identity (Telegram)",
    "KT Identity (password)",
    "KTAI API key",
  ])
  expect(hooks.auth?.methods[0]?.type).toBe("oauth")
  expect(hooks.auth?.methods[1]?.type).toBe("oauth")
  expect(hooks.auth?.methods[2]?.type).toBe("api")
  expect(typeof hooks.auth?.loader).toBe("function")
})

test("identity oauth loader does not send Identity Bearer to NewAPI", async () => {
  const hooks = await KTAIProviderPlugin()
  const previous = process.env.KTAI_API_KEY
  delete process.env.KTAI_API_KEY
  try {
    const options = await hooks.auth!.loader!(
      async () =>
        ({
          type: "oauth",
          access: "identity-bearer",
          refresh: "kt-identity",
          expires: Date.now() + 60_000,
          accountId: "acc-1",
        }) as never,
      {} as never,
    )
    expect(options.apiKey).toBe("opencode-oauth-dummy-key")
  } finally {
    if (previous === undefined) delete process.env.KTAI_API_KEY
    else process.env.KTAI_API_KEY = previous
  }
})
