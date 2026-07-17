import { describe, expect, test } from "bun:test"
import { webHandler } from "../src/routes"

describe("server CORS", () => {
  test("adds CORS headers to /api/health 404 responses", async () => {
    const response = await webHandler().handler(
      new Request("http://localhost/api/health", {
        method: "POST",
        headers: { origin: "https://app.opencode.ai" },
      }),
    )

    expect(response.status).toBe(404)
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.opencode.ai")
    expect(response.headers.get("vary")).toContain("Origin")
  })
})
