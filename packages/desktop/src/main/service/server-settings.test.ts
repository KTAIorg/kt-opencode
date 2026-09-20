import { describe, expect, test } from "bun:test"
import { isValidServerUrl, setDefaultServerUrl } from "./server-settings"

describe("isValidServerUrl", () => {
  test("accepts http and https URLs", () => {
    expect(isValidServerUrl("http://127.0.0.1:4096")).toBe(true)
    expect(isValidServerUrl("https://example.com/api")).toBe(true)
    expect(isValidServerUrl("https://user:pass@example.com:8443/path?q=1")).toBe(true)
  })

  test("rejects non-web schemes and unparseable input", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ws://example.com",
      "ftp://example.com",
      "opencode://evil",
      "not a url",
      "example.com",
      "",
    ]) {
      expect(isValidServerUrl(url)).toBe(false)
    }
  })
})

describe("setDefaultServerUrl", () => {
  test("rejects non-http(s) URLs before persisting", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ws://example.com", "not a url"]) {
      expect(() => setDefaultServerUrl(url)).toThrow("Invalid server URL")
    }
  })
})
