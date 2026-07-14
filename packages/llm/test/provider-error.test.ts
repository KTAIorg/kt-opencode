import { describe, expect, test } from "bun:test"
import { HttpContext, HttpRequestDetails, classifyApiFailure, isContextOverflow } from "../src"

describe("provider error classification", () => {
  test("classifies Z.AI GLM token limit messages as context overflow", () => {
    expect(isContextOverflow("tokens in request more than max tokens allowed")).toBe(true)
  })

  test("extracts provider codes from HTTP response bodies", () => {
    expect(
      classifyApiFailure({
        message: "Request failed",
        status: 400,
        http: new HttpContext({
          request: new HttpRequestDetails({ method: "POST", url: "https://provider.test", headers: {} }),
          body: JSON.stringify({ error: { code: "billing_error" } }),
        }),
      }),
    ).toMatchObject({ _tag: "LLM.QuotaExceeded", code: "billing_error" })
  })

  test("classifies HTTP request timeouts", () => {
    expect(classifyApiFailure({ message: "Request timed out", status: 408 })).toMatchObject({
      _tag: "LLM.TimeoutError",
    })
  })

  test("retains the Cerebras no-body overflow heuristic", () => {
    expect(classifyApiFailure({ message: "413 status code (no body)", status: 413 })).toMatchObject({
      _tag: "LLM.ContextOverflow",
    })
  })
})
