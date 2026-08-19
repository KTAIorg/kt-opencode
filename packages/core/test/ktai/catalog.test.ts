import { expect, test } from "bun:test"
import {
  catalogModels,
  pickDefaultVisibleModelIDs,
  pricingIndex,
  pricingModels,
  withDefaultVisibility,
} from "../../src/ktai/catalog"

test("builds Kito models from /v1/models catalog enriched by pricing", () => {
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
  const models = catalogModels(
    {
      data: [{ id: "gpt-5.4", object: "model", supported_endpoint_types: ["openai"] }],
    },
    costs,
  )
  expect(models[0]?.id).toBe("gpt-5.4")
  expect(models[0]?.name).toBe("GPT-5.4")
  expect(models[0]?.input).toBe(4)
  expect(models[0]?.output).toBe(20)
  expect(models[0]?.context).toBe(400_000)
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
  expect([...picked].sort()).toEqual(
    ["kimi-k2.6", "MiniMax-M3", "deepseek-v4-flash", "gemini-3.5-flash", "gpt-5.6", "claude-sonnet-5"].sort(),
  )
  expect(picked.has("anthropic/claude-opus-4.8")).toBe(false)
  expect(picked.has("claude-haiku-4-5")).toBe(false)
  expect(picked.has("gpt-5.4-mini")).toBe(false)

  const visible = withDefaultVisibility(
    [...picked, "amazon.titan-embed-text-v2:0"].map((id) => ({ id, input: 1, output: 1 })),
  )
  expect(visible.find((model) => model.id === "gpt-5.6")?.defaultVisible).toBe(true)
  expect(visible.find((model) => model.id === "amazon.titan-embed-text-v2:0")?.defaultVisible).toBe(false)
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
  expect(list.map((model) => model.id)).toEqual(["gpt-5.4"])
})
