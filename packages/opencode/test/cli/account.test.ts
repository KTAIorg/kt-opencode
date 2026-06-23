import { describe, expect, test } from "bun:test"
import stripAnsi from "strip-ansi"

import { defaultConsoleUrl, formatAccountLabel, formatOrgLine, hasBrowserOpener } from "../../src/cli/cmd/account"

describe("console account display", () => {
  test("uses console.opencode.ai as the default login URL", () => {
    expect(defaultConsoleUrl).toBe("https://console.opencode.ai")
  })

  test("skips automatic browser launch on Linux when xdg-open is unavailable", () => {
    expect(hasBrowserOpener("linux", null)).toBe(false)
    expect(hasBrowserOpener("linux", "/usr/bin/xdg-open")).toBe(true)
    expect(hasBrowserOpener("darwin", null)).toBe(true)
  })

  test("includes the account url in account labels", () => {
    expect(stripAnsi(formatAccountLabel({ email: "one@example.com", url: "https://one.example.com" }, false))).toBe(
      "one@example.com https://one.example.com",
    )
  })

  test("includes the active marker in account labels", () => {
    expect(stripAnsi(formatAccountLabel({ email: "one@example.com", url: "https://one.example.com" }, true))).toBe(
      "one@example.com https://one.example.com (active)",
    )
  })

  test("includes the account url in org rows", () => {
    expect(
      stripAnsi(
        formatOrgLine({ email: "one@example.com", url: "https://one.example.com" }, { id: "org-1", name: "One" }, true),
      ),
    ).toBe("  ● One  one@example.com  https://one.example.com  org-1")
  })
})
