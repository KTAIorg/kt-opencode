import { expect, test } from "bun:test"
import { isCustomerFacingProvider, KT_SETTLEMENT_APPLICATION_ID, KT_WALLET_URL } from "./kt-settlement"

test("keeps only ktapi, ktai, and Zen as customer-facing providers", () => {
  expect(isCustomerFacingProvider("ktai")).toBe(true)
  expect(isCustomerFacingProvider("ktapi")).toBe(true)
  expect(isCustomerFacingProvider("ktai-go")).toBe(true)
  expect(isCustomerFacingProvider("opencode")).toBe(true)
  expect(isCustomerFacingProvider("anthropic")).toBe(false)
  expect(isCustomerFacingProvider("openai")).toBe(false)
  expect(isCustomerFacingProvider("openrouter")).toBe(false)
})

test("pins the settlement application used for ktapi top-up", () => {
  expect(KT_SETTLEMENT_APPLICATION_ID).toBe("2088777044511035392")
  expect(KT_WALLET_URL).toBe("https://www.ktapi.cc/wallet")
})
