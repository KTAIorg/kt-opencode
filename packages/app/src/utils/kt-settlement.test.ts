import { expect, test } from "bun:test"
import {
  customerFacingProviderName,
  isCustomerFacingProvider,
  KT_SETTLEMENT_APPLICATION_ID,
  KT_WALLET_URL,
} from "./kt-settlement"

test("keeps only ktapi, ktai, and Zen as customer-facing providers", () => {
  expect(isCustomerFacingProvider("ktai")).toBe(true)
  expect(isCustomerFacingProvider("ktapi")).toBe(true)
  expect(isCustomerFacingProvider("ktai-go")).toBe(true)
  expect(isCustomerFacingProvider("opencode")).toBe(true)
  expect(isCustomerFacingProvider("anthropic")).toBe(false)
  expect(isCustomerFacingProvider("openai")).toBe(false)
  expect(isCustomerFacingProvider("openrouter")).toBe(false)
})

test("shows Kito instead of internal ktai/KTAI names", () => {
  expect(customerFacingProviderName("ktai", "KTAI")).toBe("Kito")
  expect(customerFacingProviderName("ktai", "KT OpenCode")).toBe("Kito")
  expect(customerFacingProviderName("opencode", "OpenCode Zen")).toBe("Zen")
  expect(customerFacingProviderName("opencode", "Zen")).toBe("Zen")
  expect(customerFacingProviderName("anthropic", "Anthropic")).toBe("Anthropic")
})

test("pins the settlement application used for ktapi top-up", () => {
  expect(KT_SETTLEMENT_APPLICATION_ID).toBe("2088777044511035392")
  expect(KT_WALLET_URL).toBe("https://www.ktapi.cc/wallet")
})
