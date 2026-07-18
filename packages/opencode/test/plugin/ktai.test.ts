import { expect, test } from "bun:test"
import { createKTAIProviderConfig, KTAIProviderPlugin } from "@/plugin/ktai"

test("creates KTAI models from the pricing response", () => {
  const provider = createKTAIProviderConfig({
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

  expect(provider.api).toBe("https://ktapi.cc/v1")
  expect(provider.env).toEqual(["KTAI_API_KEY"])
  expect(provider.models?.["gpt-5.4"]?.cost).toEqual({ input: 4, output: 20 })
  expect(provider.models?.["gpt-5.4"]?.limit?.context).toBe(400_000)
})

test("exposes KTAI API key authentication", async () => {
  const hooks = await KTAIProviderPlugin()
  expect(hooks.auth?.provider).toBe("ktai")
  expect(hooks.auth?.methods[0]?.type).toBe("api")
})
