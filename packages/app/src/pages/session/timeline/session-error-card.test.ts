import { describe, expect, test } from "bun:test"
import { classifySessionErrorCta, sessionErrorText } from "./session-error-cta"

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

  test("classifies invalid key copy as auth", () => {
    expect(classifySessionErrorCta("API key is invalid or expired. Register or sign in on KT AI")).toBe("auth")
  })
})
