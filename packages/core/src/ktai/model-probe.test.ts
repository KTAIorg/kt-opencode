import { describe, expect, test } from "bun:test"
import { probeKtaiModels } from "./model-probe"
import type { FetchLike } from "./model-probe"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

describe("probeKtaiModels", () => {
  test("returns per-model ok/fail from upstream responses", async () => {
    const calls: string[] = []
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { model: string }
      calls.push(body.model)
      if (body.model === "broken") return jsonResponse({ error: { message: "no channel for model" } }, 503)
      return jsonResponse({ choices: [{ message: { role: "assistant", content: "hi" } }] })
    }) as FetchLike

    const result = await probeKtaiModels(["fine-a", "fine-b", "broken"], "sk-test", {
      fetchImpl: fakeFetch,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const byId = new Map(result.results.map((r) => [r.modelID, r]))
    expect(byId.get("fine-a")?.ok).toBe(true)
    expect(byId.get("fine-b")?.ok).toBe(true)
    expect(byId.get("broken")?.ok).toBe(false)
    expect(byId.get("broken")?.status).toBe(503)
    expect(byId.get("broken")?.error).toContain("no channel")
    expect(calls.length).toBe(3)
  })

  test("reports network failure as not ok without throwing", async () => {
    const failing = (async () => {
      throw new Error("connection refused")
    }) as FetchLike
    const result = await probeKtaiModels(["x"], "sk-test", { fetchImpl: failing })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results[0]?.ok).toBe(false)
    expect(result.results[0]?.error).toContain("connection refused")
  })

  test("reports missing api key without calling upstream", async () => {
    let called = false
    const tracking = (async () => {
      called = true
      return jsonResponse({})
    }) as FetchLike
    const result = await probeKtaiModels(["x"], "", { fetchImpl: tracking })
    expect(result.ok).toBe(false)
    expect(called).toBe(false)
  })
})
