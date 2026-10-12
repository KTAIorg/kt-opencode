import { describe, expect, test } from "bun:test"
import { compareKtaiModelOrder, isKtaiProviderID, ktaiModelOrderKey } from "./ktai-model-order"

describe("ktaiModelOrderKey", () => {
  test("follows curated family priority", () => {
    expect(ktaiModelOrderKey("grok-4.6")[0]).toBe(0)
    expect(ktaiModelOrderKey("gpt-5.6")[0]).toBe(1)
    expect(ktaiModelOrderKey("k3")[0]).toBe(2)
    expect(ktaiModelOrderKey("deepseek-v4-flash-vision-exp")[0]).toBe(3)
    expect(ktaiModelOrderKey("MiniMax-M2.7")[0]).toBe(4)
    expect(ktaiModelOrderKey("gemini-2.5-flash")[0]).toBe(5)
  })

  test("sorts picker rows Grok → GPT → K3 → DeepSeek → MiniMax", () => {
    const rows = [
      { id: "MiniMax-M2.7", name: "MiniMax M2 7" },
      { id: "deepseek-v4-flash-vision-exp", name: "Deepseek V4 Flash Vision Exp" },
      { id: "k3", name: "K3" },
      { id: "gpt-5.6", name: "Gpt 5 6" },
      { id: "grok-4.6", name: "Grok 4 6" },
    ]
    expect([...rows].sort(compareKtaiModelOrder).map((row) => row.id)).toEqual([
      "grok-4.6",
      "gpt-5.6",
      "k3",
      "deepseek-v4-flash-vision-exp",
      "MiniMax-M2.7",
    ])
  })
})

describe("isKtaiProviderID", () => {
  test("matches ktai/ktapi ids only with a separator boundary", () => {
    expect(isKtaiProviderID("ktai")).toBe(true)
    expect(isKtaiProviderID("ktapi")).toBe(true)
    expect(isKtaiProviderID("ktai-api")).toBe(true)
    expect(isKtaiProviderID("ktai-go")).toBe(true)
    expect(isKtaiProviderID("ktaiextra")).toBe(false)
    expect(isKtaiProviderID("ktapiv2")).toBe(false)
    expect(isKtaiProviderID("anthropic")).toBe(false)
  })
})
