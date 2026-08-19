import { describe, expect, test } from "bun:test"
import { compareKtaiModelOrder, ktaiModelOrderKey } from "./ktai-model-order"

describe("ktaiModelOrderKey", () => {
  test("follows curated family priority", () => {
    expect(ktaiModelOrderKey("kimi-k2.5")[0]).toBe(0)
    expect(ktaiModelOrderKey("MiniMax-M2.7")[0]).toBe(1)
    expect(ktaiModelOrderKey("deepseek-v4-flash")[0]).toBe(2)
    expect(ktaiModelOrderKey("gemini-2.5-flash")[0]).toBe(3)
    expect(ktaiModelOrderKey("gpt-5.6")[0]).toBe(4)
    expect(ktaiModelOrderKey("claude-sonnet-4.6")[0]).toBe(5)
  })

  test("sorts picker rows Kimi → MiniMax → … → Claude", () => {
    const rows = [
      { id: "claude-sonnet-4.6", name: "Claude Sonnet 4 6" },
      { id: "gpt-5.6", name: "Gpt 5 6" },
      { id: "kimi-k2.5", name: "Kimi K2 5" },
      { id: "MiniMax-M2.7", name: "MiniMax M2 7" },
      { id: "deepseek-v4-flash", name: "Deepseek V4 Flash" },
      { id: "gemini-2.5-flash", name: "Gemini 2 5 Flash" },
    ]
    expect([...rows].sort(compareKtaiModelOrder).map((row) => row.id)).toEqual([
      "kimi-k2.5",
      "MiniMax-M2.7",
      "deepseek-v4-flash",
      "gemini-2.5-flash",
      "gpt-5.6",
      "claude-sonnet-4.6",
    ])
  })
})
