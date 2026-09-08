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

  test("does not classify bare 免费 substrings as billing", () => {
    // 模型名、渠道消息里出现裸"免费"不应触发充值引导，只有明确指向免费额度文案才匹配。
    expect(classifySessionErrorCta("模型 gpt-free-trial 不存在")).toBeUndefined()
    expect(classifySessionErrorCta("免費試用期已過，請升級")).toBeUndefined()
    expect(classifySessionErrorCta("免费额度已用完，请升级套餐")).toBe("billing")
    expect(classifySessionErrorCta("免費額度已用完，請升級方案")).toBe("billing")
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

  test("opens the wallet when balance is empty or unknown", () => {
    // balance undefined（未查到 / /ktai/account 读取失败）不能被当成"有余额"，
    // 否则会把"免费额度用尽"误引导去"切付费模型"。
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", true)).toBe("wallet")
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", true, 0)).toBe(
      "wallet",
    )
    expect(sessionBillingCta("Free usage exceeded. Top up on KT to continue with paid models.", false)).toBe("wallet")
  })

  test("does not push the wallet when a confirmed positive balance is rejected", () => {
    // 余额已确认 > 0 时仍报"额度不足"说明拒绝扣费与余额无关（网关分组/渠道问题），
    // 再弹充值是死循环：充值加的是账户 quota，解决不了分组路由。见 issue #86。
    expect(sessionBillingCta("用户额度不足,本次额度 $ 0.000000", true, 10)).toBe("none")
    expect(sessionBillingCta("insufficient balance", true, 50)).toBe("none")
    expect(sessionBillingCta("用户额度不足,本次额度 $ 0.000000", true, 0)).toBe("wallet")
    expect(sessionBillingCta("用户额度不足,本次额度 $ 0.000000", true)).toBe("wallet")
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

  test("uses service-issue copy when a confirmed positive balance is rejected", () => {
    expect(sessionBillingLeadKey("用户额度不足,本次额度 $ 0.000000", true, 50)).toBe(
      "dialog.ktAccess.billing.serviceIssue.lead",
    )
    expect(sessionBillingLeadKey("insufficient balance", true, 0.5)).toBe(
      "dialog.ktAccess.billing.serviceIssue.lead",
    )
  })
})
