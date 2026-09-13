import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import type { KtaiAccountSummary } from "@/utils/kt-account"

function ktaiHeaders(username?: string, password?: string) {
  if (!username || !password) return
  return { authorization: `Basic ${btoa(`${username}:${password}`)}` }
}

export function useKtaiSignedIn() {
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [signedIn, setSignedIn] = createSignal<boolean | undefined>()
  const [refresh, setRefresh] = createSignal(0)

  createEffect(() => {
    refresh() // 订阅：kito-account-refresh 自增触发重拉（登录/登出后必须重查 credential）
    if (serverSDK.connection.status() !== "connected") {
      setSignedIn(undefined)
      return
    }
    const url = serverSDK.url.replace(/\/+$/, "")
    const username = serverSDK.server.http.username
    const password = serverSDK.server.http.password
    let cancelled = false
    void (platform.fetch ?? fetch)(`${url}/ktai/credential`, {
      headers: ktaiHeaders(username, password),
    })
      .then((response) => (response.ok ? (response.json() as Promise<{ identity?: boolean }>) : undefined))
      .then((payload) => {
        if (!cancelled) setSignedIn(payload?.identity === true)
      })
      .catch(() => {
        if (!cancelled) setSignedIn(undefined)
      })
    onCleanup(() => {
      cancelled = true
    })
  })

  onMount(() => {
    const bump = () => setRefresh((n) => n + 1)
    window.addEventListener("kito-account-refresh", bump)
    onCleanup(() => window.removeEventListener("kito-account-refresh", bump))
  })

  return signedIn
}

const ACCOUNT_THROTTLE_MS = 15_000

// 顶栏、错误卡片、额度弹窗会同时挂载，各自 fetch 会把一次刷新事件放大成 N 次
// /ktai/account，而每个请求都会让本地服务向上游 NewAPI 打一次 Ensure（签发与 active
// 都有硬上限，打满就是 409/429）。同一个 server 只保留一个读取器，非强制读取再加节流。
function createAccountReader() {
  const [account, setAccount] = createSignal<KtaiAccountSummary | undefined>()
  const [ready, setReady] = createSignal(false)
  let lastAt = 0
  let inflight = false

  return {
    account,
    ready,
    reset: () => {
      setAccount(undefined)
      setReady(false)
    },
    load: (input: { url: string; headers?: Record<string, string>; fetchImpl: typeof fetch; force?: boolean }) => {
      const now = Date.now()
      if (inflight) return
      if (!input.force && now - lastAt < ACCOUNT_THROTTLE_MS) return
      lastAt = now
      inflight = true
      void input
        .fetchImpl(`${input.url}/ktai/account`, { headers: input.headers })
        .then((response) => (response.ok ? (response.json() as Promise<KtaiAccountSummary>) : undefined))
        .then((payload) => {
          setAccount(payload)
          setReady(true)
        })
        .catch(() => {
          setAccount(undefined)
          setReady(true)
        })
        .finally(() => {
          inflight = false
        })
    },
  }
}

const accountReaders = new Map<string, ReturnType<typeof createAccountReader>>()

function accountReader(key: string) {
  const existing = accountReaders.get(key)
  if (existing) return existing
  const created = createAccountReader()
  accountReaders.set(key, created)
  return created
}

export function useKtaiAccount() {
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [refresh, setRefresh] = createSignal(0)

  createEffect(() => {
    // 事件触发的重拉（登录、到账）要穿透节流；首次挂载不能，否则会跟着别人一起放大。
    const forced = refresh() > 0
    const url = serverSDK.url.replace(/\/+$/, "")
    const reader = accountReader(url)
    if (serverSDK.connection.status() !== "connected") {
      reader.reset()
      return
    }
    reader.load({
      url,
      headers: ktaiHeaders(serverSDK.server.http.username, serverSDK.server.http.password),
      fetchImpl: platform.fetch ?? fetch,
      force: forced,
    })
  })

  onMount(() => {
    const bump = () => setRefresh((n) => n + 1)
    window.addEventListener("kito-account-refresh", bump)
    onCleanup(() => window.removeEventListener("kito-account-refresh", bump))
  })

  const reader = () => accountReader(serverSDK.url.replace(/\/+$/, ""))

  return {
    account: reader().account,
    // ready 在成功和失败两条路径上都会置位：true 表示 /ktai/account 已经查完，可以按
    // balance 的实际情况做判断；false 表示还在查，此时 balance 一定是 undefined。
    resolved: reader().ready,
    signedIn: () => (reader().ready() ? Boolean(reader().account()) : undefined),
    balance: () => reader().account()?.balance,
  }
}
