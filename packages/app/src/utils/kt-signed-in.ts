import { createEffect, createSignal, onCleanup } from "solid-js"
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

  createEffect(() => {
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

  return signedIn
}

export function useKtaiAccount() {
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [account, setAccount] = createSignal<KtaiAccountSummary | undefined>()
  const [ready, setReady] = createSignal(false)

  createEffect(() => {
    if (serverSDK.connection.status() !== "connected") {
      setAccount(undefined)
      setReady(false)
      return
    }
    const url = serverSDK.url.replace(/\/+$/, "")
    const username = serverSDK.server.http.username
    const password = serverSDK.server.http.password
    let cancelled = false
    void (platform.fetch ?? fetch)(`${url}/ktai/account`, {
      headers: ktaiHeaders(username, password),
    })
      .then((response) => (response.ok ? (response.json() as Promise<KtaiAccountSummary>) : undefined))
      .then((payload) => {
        if (cancelled) return
        setAccount(payload)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setAccount(undefined)
        setReady(true)
      })
    onCleanup(() => {
      cancelled = true
    })
  })

  return {
    account,
    signedIn: () => (ready() ? Boolean(account()) : undefined),
    balance: () => account()?.balance,
  }
}
