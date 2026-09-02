import { expect, test } from "bun:test"
import {
  addressLooksLikeChain,
  assetsForChain,
  clearNewapiSpendableCache,
  createKtpayOrder,
  ensureManagedToken,
  fetchDepositAddress,
  fetchKtpayInfo,
  fetchKtpayStatus,
  fetchNewapiSpendable,
  KTAI_MANAGED_TOKEN_NAME,
  newapiQuotaToUsd,
  normalizeDepositChain,
  pinEnsuredUserToDefault,
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
  expect(assetsForChain("ethereum")).toEqual(["USDT", "USDC"])
  expect(assetsForChain("tron")).toEqual(["USDT"])
  expect(addressLooksLikeChain("0xAbc", "ethereum")).toBe(true)
  expect(addressLooksLikeChain("TAbc", "ethereum")).toBe(false)
  expect(addressLooksLikeChain("TAbc", "tron")).toBe(true)
})

test("skips a rate-limited IAM host and uses Casio", async () => {
  const address = await fetchDepositAddress("identity-bearer", {
    chain: "tron",
    baseUrl: "https://newapi.test",
    settlementBaseUrl: "https://casio.test",
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.includes("/api/iam/deposit-address") || url.includes("/wallet/v1/deposit-address")) {
        return new Response("", { status: 429 })
      }
      if (url.includes("/identity/v1/account/me")) {
        return new Response(JSON.stringify({ id: "8b5efc41-9914-4f9d-86f1-ac9e4d75d8c5", accountNo: "KT1" }), {
          status: 200,
        })
      }
      if (url.includes("/api/v1/address/list")) {
        return new Response(
          JSON.stringify({ code: 0, data: { list: [{ address: "TExampleAddress", chain: "tron" }] } }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected ${url}`)
    },
  })
  expect(address).toEqual({ chain: "tron", asset: "USDT", address: "TExampleAddress" })
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

test("ignores a TRON address returned for Ethereum and uses the next matching host", async () => {
  const hosts: string[] = []
  const address = await fetchDepositAddress("identity-bearer", {
    chain: "ethereum",
    baseUrl: "https://stale.test",
    settlementBaseUrl: "https://casio.test",
    fetchImpl: async (input, init) => {
      const url = String(input)
      hosts.push(url)
      if (url.includes("/identity/v1/account/me")) {
        return new Response(JSON.stringify({ id: "8b5efc41-9914-4f9d-86f1-ac9e4d75d8c5", accountNo: "KT260702" }), {
          status: 200,
        })
      }
      if (url.includes("/api/iam/deposit-address") || url.includes("/wallet/v1/deposit-address")) {
        return new Response(
          JSON.stringify({ success: true, data: { chain: "ethereum", asset: "USDT", address: "TStaleTronAddress" } }),
          { status: 200 },
        )
      }
      if (url.includes("/api/v1/address/list")) {
        expect(url).toContain("chain=eth")
        expect(url).toContain("tenant_id=8b5efc4199144f9d86f1ac9e4d75d8c5")
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              list: [
                { address: "TStaleTronAddress", chain: "tron" },
                { address: "0xSharedErc20Address", chain: "ethereum" },
              ],
            },
          }),
          { status: 200 },
        )
      }
      throw new Error(`unexpected ${url} ${init?.method}`)
    },
  })
  expect(address).toEqual({ chain: "ethereum", asset: "USDT", address: "0xSharedErc20Address" })
  expect(hosts.some((url) => url.includes("/api/v1/address/create"))).toBe(false)
})

test("creates one Ethereum address for ERC20 USDT and USDC when Casio has none", async () => {
  clearNewapiSpendableCache()
  const address = await fetchDepositAddress("identity-bearer", {
    chain: "erc20",
    asset: "USDC",
    baseUrl: "https://stale.test",
    settlementBaseUrl: "https://casio.test",
    fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes("/identity/v1/account/me")) {
        return new Response(JSON.stringify({ account: { id: "8b5efc41-9914-4f9d-86f1-ac9e4d75d8c5", accountNo: "KT1" } }), {
          status: 200,
        })
      }
      if (url.includes("/api/iam/deposit-address") || url.includes("/wallet/v1/deposit-address")) {
        return new Response(
          JSON.stringify({ success: true, data: { chain: "ethereum", asset: "USDC", address: "TStaleTronAddress" } }),
          { status: 200 },
        )
      }
      if (url.includes("/api/v1/address/list")) {
        return new Response(JSON.stringify({ code: 0, data: { list: [{ address: "TStaleTronAddress", chain: "tron" }] } }), {
          status: 200,
        })
      }
      expect(url).toBe("https://casio.test/api/v1/address/create")
      expect(init?.method).toBe("POST")
      expect(JSON.parse(String(init?.body))).toMatchObject({
        chain: "eth",
        tenant_id: "8b5efc4199144f9d86f1ac9e4d75d8c5",
      })
      return new Response(JSON.stringify({ code: 0, data: { address: "0xCreatedErc20", chain: "ethereum" } }), {
        status: 200,
      })
    },
  })
  expect(address).toEqual({ chain: "ethereum", asset: "USDC", address: "0xCreatedErc20" })
})

test("reuses the cached deposit address without calling the network again", async () => {
  clearNewapiSpendableCache()
  const calls: string[] = []
  const fetchImpl = async (input: string | URL | Request) => {
    calls.push(String(input))
    return new Response(
      JSON.stringify({ success: true, data: { chain: "tron", asset: "USDT", address: "TCachedAddress" } }),
      { status: 200 },
    )
  }
  const first = await fetchDepositAddress("identity-bearer", {
    chain: "tron",
    baseUrl: "https://newapi.test",
    fetchImpl,
  })
  const second = await fetchDepositAddress("identity-bearer", {
    chain: "tron",
    baseUrl: "https://newapi.test",
    fetchImpl,
  })
  expect(first).toEqual({ chain: "tron", asset: "USDT", address: "TCachedAddress" })
  expect(second).toEqual(first)
  expect(calls).toEqual(["https://newapi.test/api/iam/deposit-address?chain=tron&asset=USDT"])
})

test("keeps KTPay on production NewAPI and does not call the test host", async () => {
  const hosts: string[] = []
  const info = await fetchKtpayInfo("identity-bearer", {
    fetchImpl: async (input) => {
      const url = String(input)
      hosts.push(url)
      expect(url.startsWith("https://ktapi.cc")).toBe(true)
      expect(url.includes("newapi-test")).toBe(false)
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
  expect(hosts).toEqual(["https://ktapi.cc/api/iam/ktpay/info"])
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

test("converts NewAPI remaining quota to the wallet USD the console shows", () => {
  expect(newapiQuotaToUsd(5_070_855_823)).toBe(10141.71)
})

function isolatedSpendablePath() {
  clearNewapiSpendableCache()
  process.env.OPENCODE_KTAI_SPENDABLE_PATH = `/tmp/ktai-spendable-${crypto.randomUUID()}.json`
}

test("reads spendable balance from Identity-gated Ensure", async () => {
  isolatedSpendablePath()
  const spendable = await fetchNewapiSpendable("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      expect(String(input)).toBe("https://newapi.test/api/iam/ensure")
      return new Response(JSON.stringify({ success: true, data: { id: 370, quota: 5_070_855_823, group: "default" } }), {
        status: 200,
      })
    },
  })
  expect(spendable).toBe(10141.71)
})

test("reads spendable balance from /api/user/self when Ensure omits quota", async () => {
  isolatedSpendablePath()
  const calls: string[] = []
  const spendable = await fetchNewapiSpendable("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith("/api/iam/ensure")) {
        return new Response(JSON.stringify({ success: true, data: { id: 370, group: "default", username: "KT260520XS3ADS" } }), {
          status: 200,
          headers: { "set-cookie": "session=abc; Path=/" },
        })
      }
      expect(url).toBe("https://newapi.test/api/user/self")
      return new Response(JSON.stringify({ success: true, data: { id: 370, quota: 5_070_849_219, used_quota: 4_150_781 } }), {
        status: 200,
      })
    },
  })
  expect(spendable).toBe(10141.7)
  expect(calls).toEqual(["https://newapi.test/api/iam/ensure", "https://newapi.test/api/user/self"])
})

test("reuses the Ensure session instead of calling Ensure again", async () => {
  isolatedSpendablePath()
  const calls: string[] = []
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith("/api/iam/ensure")) {
      return new Response(JSON.stringify({ success: true, data: { id: 370, quota: 5_070_855_823, group: "default" } }), {
        status: 200,
        headers: { "set-cookie": "session=abc; Path=/" },
      })
    }
    expect(url).toBe("https://newapi.test/api/user/self")
    return new Response(JSON.stringify({ success: true, data: { id: 370, quota: 5_070_849_219 } }), { status: 200 })
  }
  expect(await fetchNewapiSpendable("identity-bearer", { baseUrl: "https://newapi.test", fetchImpl })).toBe(10141.71)
  expect(await fetchNewapiSpendable("identity-bearer", { baseUrl: "https://newapi.test", fetchImpl })).toBe(10141.7)
  expect(calls).toEqual(["https://newapi.test/api/iam/ensure", "https://newapi.test/api/user/self"])
})

test("keeps the last spendable balance when Ensure is rate limited", async () => {
  isolatedSpendablePath()
  const first = await fetchNewapiSpendable("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async () =>
      new Response(JSON.stringify({ success: true, data: { id: 370, quota: 5_070_855_823 } }), { status: 200 }),
  })
  expect(first).toBe(10141.71)
  const again = await fetchNewapiSpendable("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  })
  expect(again).toBe(10141.71)
})

test("pins an Ensure user that still has ox-free back to default", async () => {
  const calls: string[] = []
  const result = await pinEnsuredUserToDefault("identity-bearer", {
    baseUrl: "https://newapi.test",
    fetchImpl: async (input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (url.endsWith("/api/iam/ensure")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 370, username: "KT260520XS3ADS", display_name: "芒 果果", group: "default,ox-free" },
          }),
          { status: 200, headers: { "set-cookie": "session=abc; Path=/" } },
        )
      }
      expect(url).toBe("https://newapi.test/api/user/")
      expect(init?.method).toBe("PUT")
      expect(JSON.parse(String(init?.body))).toMatchObject({ id: 370, group: "default" })
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    },
  })
  expect(result).toEqual({ pinned: true, group: "default" })
  expect(calls).toEqual(["POST https://newapi.test/api/iam/ensure", "PUT https://newapi.test/api/user/"])
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
