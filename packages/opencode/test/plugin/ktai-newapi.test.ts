import { expect, test } from "bun:test"
import { ensureManagedToken, fetchDepositAddress, KTAI_MANAGED_TOKEN_NAME } from "@/plugin/ktai-newapi"

test("uses dedicated token ensure when NewAPI has the route", async () => {
  const calls: string[] = []
  const token = await ensureManagedToken("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      const url = String(input)
      calls.push(url)
      expect(url).toBe("https://newapi.test/api/iam/token/ensure")
      return new Response(
        JSON.stringify({ success: true, data: { name: "kito", key: "abc123", created: true } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    },
  })
  expect(token).toEqual({ key: "sk-abc123", created: true, name: KTAI_MANAGED_TOKEN_NAME })
  expect(calls).toEqual(["https://newapi.test/api/iam/token/ensure"])
})

test("falls back to Ensure session + named token APIs", async () => {
  let listed = 0
  const token = await ensureManagedToken("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.endsWith("/api/iam/token/ensure")) return new Response("not found", { status: 404 })
      if (url.endsWith("/api/iam/ensure")) {
        return new Response(JSON.stringify({ success: true, data: { id: 42, username: "KT260001" } }), {
          status: 200,
          headers: { "set-cookie": "session=abc; Path=/" },
        })
      }
      if (url.includes("/api/token/?p=")) {
        listed += 1
        expect((init?.headers as Record<string, string>)["New-Api-User"]).toBe("42")
        const items = listed === 1 ? [] : [{ id: 9, name: "kito" }]
        return new Response(JSON.stringify({ success: true, data: { items } }), { status: 200 })
      }
      if (url.endsWith("/api/token/") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          name: "kito",
          unlimited_quota: true,
          expired_time: -1,
        })
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
      if (url.endsWith("/api/token/9/key")) {
        return new Response(JSON.stringify({ success: true, data: { key: "sk-live" } }), { status: 200 })
      }
      throw new Error(`unexpected ${url}`)
    },
  })
  expect(token.key).toBe("sk-live")
  expect(token.created).toBe(true)
})

test("skips HTML wallet pages until the Identity deposit route exists", async () => {
  let failed = false
  try {
    await fetchDepositAddress("identity-bearer", {
      baseUrl: "https://newapi.test",
      fetchImpl: async (input) => {
        const url = String(input)
        if (url.includes("/api/iam/deposit-address")) return new Response("not found", { status: 404 })
        return new Response("<!doctype html><title>New API</title>", { status: 200 })
      },
    })
  } catch (error) {
    failed = true
    expect(error instanceof Error && error.message).toContain("not available")
  }
  expect(failed).toBe(true)
})

test("reads deposit address from the Identity-gated NewAPI route", async () => {
  const address = await fetchDepositAddress("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      expect(String(input)).toBe("https://newapi.test/api/iam/deposit-address?chain=tron&asset=USDT")
      return new Response(
        JSON.stringify({ success: true, data: { chain: "tron", asset: "USDT", address: "TExampleAddress" } }),
        { status: 200 },
      )
    },
  })
  expect(address).toEqual({ chain: "tron", asset: "USDT", address: "TExampleAddress" })
})
