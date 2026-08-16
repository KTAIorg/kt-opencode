import { expect, test } from "bun:test"
import {
  catalogModels,
  createKTAIProviderConfig,
  KTAIProviderPlugin,
  pickDefaultVisibleModelIDs,
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

  expect(provider.name).toBe("KT")
  expect(provider.api).toBe("https://ktapi.cc/v1")
  expect(provider.env).toEqual(["KTAI_API_KEY"])
  expect(provider.models?.["gpt-5.4"]?.cost).toEqual({ input: 4, output: 20 })
  expect(provider.models?.["gpt-5.4"]?.limit?.context).toBe(400_000)
})

test("picks a curated default-visible set from the catalog", () => {
  const picked = pickDefaultVisibleModelIDs([
    "kimi-k2.5",
    "kimi-k2.6",
    "MiniMax-M2.7",
    "MiniMax-M3",
    "deepseek-v4-flash",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gpt-5.6",
    "gpt-5.4-mini",
    "anthropic/claude-sonnet-4.6",
    "claude-sonnet-5",
    "anthropic/claude-opus-4.8",
    "claude-haiku-4-5",
    "gpt-4o-mini",
    "amazon.titan-embed-text-v2:0",
  ])
  // One per family, cost-friendly order priority; newest alias wins inside group.
  expect([...picked].sort()).toEqual(
    [
      "kimi-k2.6",
      "MiniMax-M3",
      "deepseek-v4-flash",
      "gemini-3.5-flash",
      "gpt-5.6",
      "claude-sonnet-5",
    ].sort(),
  )
  // High-end Claude variants and GPT mini stay out of the default set.
  expect(picked.has("anthropic/claude-opus-4.8")).toBe(false)
  expect(picked.has("claude-haiku-4-5")).toBe(false)
  expect(picked.has("gpt-5.4-mini")).toBe(false)

  const provider = createKTAIProviderConfig(
    [...picked, "amazon.titan-embed-text-v2:0"].map((id) => ({ id, input: 1, output: 1 })),
  )
  expect(provider.models?.["gpt-5.6"]?.release_date).toBeUndefined()
  expect(provider.models?.["amazon.titan-embed-text-v2:0"]?.release_date).toBe("2020-01-01")
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

test("exposes Telegram Identity login before the API key fallback", async () => {
  const hooks = await KTAIProviderPlugin()
  expect(hooks.auth?.provider).toBe("ktai")
  expect(hooks.auth?.methods.map((method) => method.label)).toEqual(["KT Identity (Telegram)", "KT API key"])
  expect(hooks.auth?.methods[0]?.type).toBe("oauth")
  expect(hooks.auth?.methods[1]?.type).toBe("api")
  expect(typeof hooks.auth?.loader).toBe("function")
})

test("embedded injected identity still exposes Telegram login plus API key", async () => {
  const previous = {
    embedded: process.env.OPENCODE_EMBEDDED,
    token: process.env.KTAI_IDENTITY_TOKEN,
    expiresAt: process.env.KTAI_IDENTITY_EXPIRES_AT,
  }
  process.env.OPENCODE_EMBEDDED = "true"
  process.env.KTAI_IDENTITY_TOKEN = "injected-identity-token"
  process.env.KTAI_IDENTITY_EXPIRES_AT = "2099-01-01T00:00:00.000Z"
  try {
    const hooks = await KTAIProviderPlugin()
    expect(hooks.auth?.methods.map((method) => method.label)).toEqual(["KT Identity (Telegram)", "KT API key"])
    expect(hooks.auth?.methods[0]?.type).toBe("oauth")
  } finally {
    if (previous.embedded === undefined) delete process.env.OPENCODE_EMBEDDED
    else process.env.OPENCODE_EMBEDDED = previous.embedded
    if (previous.token === undefined) delete process.env.KTAI_IDENTITY_TOKEN
    else process.env.KTAI_IDENTITY_TOKEN = previous.token
    if (previous.expiresAt === undefined) delete process.env.KTAI_IDENTITY_EXPIRES_AT
    else process.env.KTAI_IDENTITY_EXPIRES_AT = previous.expiresAt
  }
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
