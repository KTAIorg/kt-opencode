import { expect, test } from "bun:test"
import {
  catalogModels,
  pickDefaultVisibleModelIDs,
  pricingIndex,
  pricingModels,
  resolveKtaiModels,
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
    "kimi-for-coding",
    "k3",
    "kimi-k2.5",
    "kimi-k2.6",
    "MiniMax-M2.7",
    "MiniMax-M3",
    "deepseek-v4-flash-vision-exp",
    "deepseek-v4-flash",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "grok-4.6",
    "grok-4.5",
    "gpt-5.6",
    "gpt-5.4-mini",
    "anthropic/claude-sonnet-4.6",
    "claude-sonnet-5",
    "gpt-4o-mini",
    "amazon.titan-embed-text-v2:0",
  ])
  expect([...picked].sort()).toEqual(
    ["k3", "MiniMax-M2.7", "deepseek-v4-flash-vision-exp", "grok-4.6", "gpt-5.6"].sort(),
  )
  expect(picked.has("gemini-3.5-flash")).toBe(false)
  expect(picked.has("claude-sonnet-5")).toBe(false)
  expect(picked.has("gpt-5.4-mini")).toBe(false)

  const visible = withDefaultVisibility(
    [...picked, "amazon.titan-embed-text-v2:0"].map((id) => ({ id, input: 1, output: 1 })),
  )
  expect(visible.find((model) => model.id === "gpt-5.6")?.defaultVisible).toBe(true)
  expect(visible.find((model) => model.id === "amazon.titan-embed-text-v2:0")?.defaultVisible).toBe(false)
})

test("does not surface MiniMax when the live default catalog omits it", () => {
  const picked = pickDefaultVisibleModelIDs([
    "k3",
    "deepseek-v4-flash-vision-exp",
    "grok-4.6",
    "gpt-5.6",
    "gemini-2.5-flash",
  ])
  expect(picked.has("MiniMax-M2.7")).toBe(false)
  const visible = withDefaultVisibility(
    ["k3", "deepseek-v4-flash-vision-exp", "grok-4.6", "gpt-5.6", "gemini-2.5-flash"].map((id) => ({
      id,
      input: 1,
      output: 1,
    })),
  )
  expect(visible.find((model) => model.id === "gemini-2.5-flash")?.defaultVisible).toBe(false)
})

test("empty live catalog does not invent models", () => {
  expect(catalogModels({ data: [] }, new Map())).toEqual([])
  expect(resolveKtaiModels({ catalog: { data: [] }, pricing: { data: [] } })).toEqual([])
})

test("uses the last server catalog when live fetch is empty", () => {
  const models = resolveKtaiModels({
    catalog: { data: [] },
    cached: [
      { id: "grok-4.6", input: 0.3, output: 1.5 },
      { id: "gpt-5.6", input: 2, output: 10 },
      { id: "gemini-2.5-flash", input: 0.1, output: 0.4 },
    ],
  })
  expect(models.map((model) => model.id)).toEqual(["grok-4.6", "gpt-5.6", "gemini-2.5-flash"])
  expect(models.find((model) => model.id === "grok-4.6")?.defaultVisible).toBe(true)
  expect(models.find((model) => model.id === "gemini-2.5-flash")?.defaultVisible).toBe(false)
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
