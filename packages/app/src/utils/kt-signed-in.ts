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
      .then((response) => {
        // 与 account 读取器同口径：本地服务 5xx/瞬态故障保留上次判定，不把
        // 已登录用户闪成"需登录"；只有明确的 401/403 才判未登录。
        if (response.ok) return response.json() as Promise<{ identity?: boolean }>
        if (response.status === 401 || response.status === 403) return { identity: false }
        return undefined
      })
      .then((payload) => {
        if (cancelled || payload === undefined) return
        setSignedIn(payload.identity === true)
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
// 上游 /ktai/account 串行 Ensure 最坏 60s+：读取必须有硬超时，否则 socket
// 挂起时 inflight 永真，后续所有刷新（含入金完成）被永久吞掉。
const ACCOUNT_TIMEOUT_MS = 30_000

type AccountLoad = { url: string; headers?: Record<string, string>; fetchImpl: typeof fetch; force?: boolean }

// 顶栏、错误卡片、额度弹窗会同时挂载，各自 fetch 会把一次刷新事件放大成 N 次
// /ktai/account，而每个请求都会让本地服务向上游 NewAPI 打一次 Ensure（签发与 active
// 都有硬上限，打满就是 409/429）。同一个 server 只保留一个读取器，非强制读取再加节流。
function createAccountReader() {
  const [account, setAccount] = createSignal<KtaiAccountSummary | undefined>()
  const [ready, setReady] = createSignal(false)
  let lastAt = 0
  let inflight = false
  let pending: AccountLoad | undefined

  const load = (input: AccountLoad) => {
    const now = Date.now()
    // inflight 期间的强制刷新（入金完成 markPaid、登录成功）不能丢：
    // 排队最新一次，等当前请求落地后立即追跑，余额才不会卡死不动。
    if (inflight) {
      if (input.force) pending = input
      return
    }
    if (!input.force && now - lastAt < ACCOUNT_THROTTLE_MS) return
    lastAt = now
    inflight = true
    void input
      .fetchImpl(`${input.url}/ktai/account`, {
        headers: input.headers,
        signal: AbortSignal.timeout(ACCOUNT_TIMEOUT_MS),
      })
      .then((response) => {
        // 4xx 视为真的未登录；5xx（上游 Identity 故障）与网络瞬态失败保留上次
        // 成功结果，不把已登录用户闪成离线。
        if (response.ok) return response.json() as Promise<KtaiAccountSummary>
        if (response.status >= 500) return account()
        return undefined
      })
      .then((payload) => {
        setAccount(payload)
        setReady(true)
      })
      .catch(() => setReady(true))
      .finally(() => {
        inflight = false
        const next = pending
        pending = undefined
        if (next) load(next)
      })
  }

  return {
    account,
    ready,
    reset: () => {
      setAccount(undefined)
      setReady(false)
    },
    load,
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
