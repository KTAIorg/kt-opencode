import { expect, test } from "bun:test"
import {
  createKtpayOrder,
  ensureManagedToken,
  fetchDepositAddress,
  fetchKtpayInfo,
  fetchKtpayStatus,
  KTAI_MANAGED_TOKEN_NAME,
  normalizeDepositChain,
} from "@opencode-ai/core/ktai/newapi"

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

test("normalizes deposit chain aliases onto Casio names", () => {
  expect(normalizeDepositChain("TRC20")).toBe("tron")
  expect(normalizeDepositChain("erc20")).toBe("ethereum")
  expect(normalizeDepositChain("ETH")).toBe("ethereum")
  expect(normalizeDepositChain()).toBe("tron")
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

test("requests one Ethereum address for ERC20 USDT and USDC", async () => {
  const address = await fetchDepositAddress("identity-bearer", {
    chain: "erc20",
    asset: "USDC",
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      expect(String(input)).toBe("https://newapi.test/api/iam/deposit-address?chain=ethereum&asset=USDC")
      return new Response(
        JSON.stringify({
          success: true,
          data: { chain: "ethereum", asset: "USDC", address: "0xExampleAddress", assets: ["USDT", "USDC"] },
        }),
        { status: 200 },
      )
    },
  })
  expect(address).toEqual({ chain: "ethereum", asset: "USDC", address: "0xExampleAddress" })
})

test("falls back to the test NewAPI wallet host when production IAM 404s", async () => {
  const hosts: string[] = []
  const info = await fetchKtpayInfo("identity-bearer", {
    fetchImpl: async (input) => {
      const url = String(input)
      hosts.push(url)
      if (url.startsWith("https://ktapi.cc")) {
        return new Response(JSON.stringify({ error: { message: "Invalid URL (GET /api/iam/ktpay/info)" } }), {
          status: 404,
        })
      }
      expect(url).toBe("https://newapi-test.ktyun.cc/api/iam/ktpay/info")
      return new Response(
        JSON.stringify({
          success: true,
          data: { enabled: true, methods: [], min_topup: 5, max_topup: 10, amount_options: [10] },
        }),
        { status: 200 },
      )
    },
  })
  expect(info.enabled).toBe(true)
  expect(hosts[0]).toContain("https://ktapi.cc")
  expect(hosts.at(-1)).toBe("https://newapi-test.ktyun.cc/api/iam/ktpay/info")
})

test("surfaces NewAPI Invalid URL errors instead of a generic missing-route message", async () => {
  let failed = false
  try {
    await fetchKtpayInfo("identity-bearer", {
      baseUrl: "https://ktapi.test",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "Invalid URL (GET /api/iam/ktpay/info)" } }), { status: 404 }),
    })
  } catch (error) {
    failed = true
    expect(error instanceof Error && error.message).toContain("Invalid URL (GET /api/iam/ktpay/info)")
  }
  expect(failed).toBe(true)
})

test("reads KTPay info from the Identity-gated NewAPI route", async () => {
  const info = await fetchKtpayInfo("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      expect(String(input)).toBe("https://newapi.test/api/iam/ktpay/info")
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            enabled: true,
            methods: [{ name: "支付宝", type: "alipay" }],
            min_topup: 1,
            max_topup: 500,
            amount_options: [10, 50],
          },
        }),
        { status: 200 },
      )
    },
  })
  expect(info).toEqual({
    enabled: true,
    methods: [{ name: "支付宝", type: "alipay" }],
    minTopup: 1,
    maxTopup: 500,
    amountOptions: [10, 50],
    appId: undefined,
    defaultLang: undefined,
    sdkUrl: undefined,
  })
})

test("creates a KTPay cashier order through the Identity route", async () => {
  const order = await createKtpayOrder("identity-bearer", {
    amount: 10,
    method: "wechat_pay",
    baseUrl: "https://newapi.test",
    fetchImpl: async (input, init) => {
      expect(String(input)).toBe("https://newapi.test/api/iam/ktpay/pay")
      expect(init?.method).toBe("POST")
      expect(JSON.parse(String(init?.body))).toEqual({ amount: 10, method: "wechat_pay" })
      return new Response(
        JSON.stringify({
          success: true,
          data: { order_id: "ord_1", cashier_url: "https://ktpay.test/c/1", amount: 10, requested: 10, status: "pending" },
        }),
        { status: 200 },
      )
    },
  })
  expect(order).toEqual({
    orderId: "ord_1",
    cashierUrl: "https://ktpay.test/c/1",
    amount: 10,
    requested: 10,
    status: "pending",
  })
})

test("reads KTPay status from the Identity-gated NewAPI route", async () => {
  const status = await fetchKtpayStatus("identity-bearer", "ord_1", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      expect(String(input)).toBe("https://newapi.test/api/iam/ktpay/status/ord_1")
      return new Response(
        JSON.stringify({ success: true, data: { order_id: "ord_1", status: "paid", local_status: "success", settled: true } }),
        { status: 200 },
      )
    },
  })
  expect(status).toEqual({ orderId: "ord_1", status: "paid", localStatus: "success", settled: true })
})
