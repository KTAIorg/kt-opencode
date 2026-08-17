import { expect, test } from "bun:test"
import {
  formatKtaiBalance,
  hasKitoCredential,
  isKitoProviderId,
  titlebarAccountAction,
  titlebarAccountName,
} from "./kt-account"

test("treats ktai and ktapi ids as Kito", () => {
  expect(isKitoProviderId("ktai")).toBe(true)
  expect(isKitoProviderId("ktapi")).toBe(true)
  expect(isKitoProviderId("ktai-go")).toBe(true)
  expect(isKitoProviderId("opencode")).toBe(false)
})

test("requires a real Kito credential, not catalog-only discovery", () => {
  expect(hasKitoCredential([{ id: "ktai", source: "config" }])).toBe(false)
  expect(hasKitoCredential([{ id: "ktai", source: "api", key: "sk-test" }])).toBe(true)
  expect(hasKitoCredential([{ id: "ktai", source: "oauth" }])).toBe(true)
  expect(hasKitoCredential([{ id: "ktai", source: "env" }])).toBe(true)
  expect(hasKitoCredential([{ id: "ktai", key: "sk-test" }])).toBe(true)
  expect(hasKitoCredential([{ id: "opencode", source: "api", key: "zen" }])).toBe(false)
})

test("titlebar shows sign-in until Identity or a real key exists", () => {
  expect(titlebarAccountAction({ hasCredential: false })).toBe("signIn")
  expect(titlebarAccountAction({ hasCredential: true })).toBe("topUp")
  expect(
    titlebarAccountAction({
      hasCredential: false,
      account: { account: { accountNo: "KT1" }, balance: 12 },
    }),
  ).toBe("topUp")
})

test("prefers display name and formats balance", () => {
  expect(titlebarAccountName({ account: { accountNo: "KT1", displayName: " Ada " }, balance: 1 })).toBe("Ada")
  expect(titlebarAccountName({ account: { accountNo: "KT1" }, balance: 1 })).toBe("KT1")
  expect(formatKtaiBalance(12)).toBe("12")
  expect(formatKtaiBalance(12.5)).toBe("12.50")
})
