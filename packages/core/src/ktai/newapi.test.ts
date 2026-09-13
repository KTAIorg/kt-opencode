import { beforeEach, describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { clearNewapiSpendableCache, fetchNewapiSpendable } from "./newapi"
import type { FetchLike } from "./newapi"

const BASE = "https://newapi.test"

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

function countingFetch(handler: (url: string) => Response) {
  const calls: string[] = []
  const impl = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(url)
    return handler(url)
  }) as FetchLike
  return { calls, impl }
}

const ensureCalls = (calls: string[]) => calls.filter((url) => url.endsWith("/api/iam/ensure")).length

beforeEach(() => {
  process.env.OPENCODE_KTAI_SPENDABLE_PATH = path.join(os.tmpdir(), `ktai-spendable-${crypto.randomUUID()}.json`)
  clearNewapiSpendableCache()
})

describe("fetchNewapiSpendable", () => {
  test("keeps the ensured session instead of ensuring again when /api/user/self rejects", async () => {
    const { calls, impl } = countingFetch((url) => {
      if (url.endsWith("/api/iam/ensure")) {
        return jsonResponse({ data: { user: { id: 370, quota: 4_908_519_373 } } }, 200, {
          "set-cookie": "session=abc; Path=/",
        })
      }
      return jsonResponse({ message: "unauthorized" }, 401)
    })

    expect(await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })).toBe(9817.04)
    expect(await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })).toBe(9817.04)
    expect(await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })).toBe(9817.04)
    expect(ensureCalls(calls)).toBe(1)
  })

  test("backs off after a rejected ensure instead of retrying on every read", async () => {
    const { calls, impl } = countingFetch(() => jsonResponse({ message: "AUTH_SESSION_LIMIT" }, 409))

    await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })
    await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })
    await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })

    expect(ensureCalls(calls)).toBe(1)
  })

  test("refreshes the balance from /api/user/self without ensuring again", async () => {
    let quota = 4_908_519_373
    const { calls, impl } = countingFetch((url) => {
      if (url.endsWith("/api/iam/ensure")) {
        return jsonResponse({ data: { user: { id: 370, quota } } }, 200, { "set-cookie": "session=abc; Path=/" })
      }
      return jsonResponse({ data: { id: 370, quota } })
    })

    expect(await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })).toBe(9817.04)
    quota += 2_500_000
    expect(await fetchNewapiSpendable("token", { baseUrl: BASE, fetchImpl: impl })).toBe(9822.04)
    expect(ensureCalls(calls)).toBe(1)
  })
})
