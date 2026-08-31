import { describe, expect, test } from "bun:test"
import {
  classifySessionErrorCta,
  sessionAuthCta,
  sessionAuthLeadKey,
  sessionBillingCta,
  sessionBillingLeadKey,
  sessionErrorText,
} from "./session-error-cta"

describe("sessionErrorText", () => {
  test("reads nested API error payloads", () => {
    expect(sessionErrorText({ data: { message: "Free usage exceeded. Top up on KT AI" } })).toBe(
      "Free usage exceeded. Top up on KT AI",
    )
  })

  test("reads a plain message", () => {
    expect(sessionErrorText({ message: "API key is invalid or expired" })).toBe("API key is invalid or expired")
  })
})

describe("classifySessionErrorCta", () => {
  test("classifies free-tier copy as billing", () => {
    expect(classifySessionErrorCta("Free usage exceeded. Top up on KT AI to continue with paid models.")).toBe(
      "billing",
    )
  })

  test("classifies NewAPI remaining-quota copy as billing", () => {
    expect(classifySessionErrorCta("用户额度不足,本次额度 $ 0.000000 (request id: abc)")).toBe("billing")
  })

  test("classifies invalid key copy as auth", () => {
    expect(classifySessionErrorCta("API key is invalid or expired. Register or sign in on KT AI")).toBe("auth")
  })

  test("classifies provider invalid token as auth", () => {
    expect(classifySessionErrorCta("Invalid token")).toBe("auth")
  })

  test("classifies leftover OpenAI key errors as auth", () => {
    expect(classifySessionErrorCta("Incorrect API key provided: sk-test")).toBe("auth")
  })
})

describe("sessionAuthCta", () => {
  test("asks for Telegram only when Identity is missing", () => {
    expect(sessionAuthCta("Invalid token", false)).toBe("telegram")
    expect(sessionAuthCta("Invalid token", true)).toBe("refresh")
    expect(sessionAuthCta("Invalid token", undefined)).toBeUndefined()
  })
})

describe("sessionAuthLeadKey", () => {
  test("does not rewrite Invalid token as Telegram login when already signed in", () => {
    expect(sessionAuthLeadKey("Invalid token", false)).toBe("dialog.ktAccess.auth.lead")
    expect(sessionAuthLeadKey("Invalid token", true)).toBe("dialog.ktAccess.auth.signedIn.lead")
    expect(sessionAuthLeadKey("Invalid token", undefined)).toBeUndefined()
  })
})

describe("sessionBillingCta", () => {
  test("opens the model switcher when signed in with a confirmed positive balance", () => {
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", true, 10)).toBe(
      "switch",
    )
  })

  test("opens the wallet when balance is empty, unknown, or the error is a paid-quota miss", () => {
    // balance undefined（未查到 / /ktai/account 读取失败）不能被当成"有余额"，
    // 否则会把"免费额度用尽"误引导去"切付费模型"。
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", true)).toBe("wallet")
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", true, 0)).toBe(
      "wallet",
    )
    expect(sessionBillingCta("用户额度不足,本次额度 $ 0.000000", true, 10)).toBe("wallet")
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", false)).toBe("wallet")
  })
})

describe("sessionBillingLeadKey", () => {
  test("uses signed-in billing copy after free chats are exhausted", () => {
    expect(sessionBillingLeadKey("Free usage exceeded. Top up on KT to continue with paid models.", false)).toBe(
      "dialog.ktAccess.billing.lead",
    )
    expect(sessionBillingLeadKey("Free usage exceeded. Top up on KT to continue with paid models.", true, 10)).toBe(
      "dialog.ktAccess.switch.lead",
    )
    expect(sessionBillingLeadKey("Free usage exceeded. Top up on KT to continue with paid models.", true, 0)).toBe(
      "dialog.ktAccess.billing.paid.lead",
    )
    expect(
      sessionBillingLeadKey("Free usage exceeded. Top up on KT to continue with paid models.", undefined),
    ).toBeUndefined()
  })

  test("uses paid-balance copy for NewAPI quota errors when signed in", () => {
    expect(sessionBillingLeadKey("用户额度不足,本次额度 $ 0.000000", true)).toBe("dialog.ktAccess.billing.paid.lead")
    expect(sessionBillingLeadKey("用户额度不足,本次额度 $ 0.000000", false)).toBe("dialog.ktAccess.billing.lead")
  })
})
