import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { openKtIdentityLogin } from "@/components/dialog-kt-identity-login"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { formatKtaiBalance, titlebarAccountName, type KtaiAccountSummary } from "@/utils/kt-account"
import { openKtWallet } from "@/components/dialog-kt-wallet"

export function TitlebarAccountButton() {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [signingOut, setSigningOut] = createSignal(false)
  const [account, accountActions] = createResource(
    () => {
      if (serverSDK.connection.status() !== "connected") return
      return {
        url: serverSDK.url.replace(/\/+$/, ""),
        username: serverSDK.server.http.username,
        password: serverSDK.server.http.password,
      }
    },
    (input) =>
      (platform.fetch ?? fetch)(`${input.url}/ktai/account`, {
        headers:
          input.username && input.password
            ? { authorization: `Basic ${btoa(`${input.username}:${input.password}`)}` }
            : undefined,
      })
        .then((response) => (response.ok ? (response.json() as Promise<KtaiAccountSummary>) : undefined))
        .catch(() => undefined),
  )
  const signedIn = createMemo(() => Boolean(account()))
  const signedInLabel = createMemo(() => {
    const current = account()
    const name = titlebarAccountName(current)
    if (!name || !current) return
    return language.t("titlebar.account.signedIn", { name, balance: formatKtaiBalance(current.balance) })
  })

  onMount(() => {
    let lastRefresh = 0
    const refresh = () => {
      const now = Date.now()
      if (now - lastRefresh < 15_000) return
      lastRefresh = now
      void accountActions.refetch()
    }
    const forceRefresh = () => {
      lastRefresh = 0
      refresh()
    }
    window.addEventListener("focus", refresh)
    window.addEventListener("kito-account-refresh", forceRefresh)
    document.addEventListener("visibilitychange", refresh)
    onCleanup(() => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("kito-account-refresh", forceRefresh)
      document.removeEventListener("visibilitychange", refresh)
    })
  })

  const onClick = () => {
    if (!signedIn()) {
      openKtIdentityLogin({ dialog })
      return
    }
    openKtWallet({ dialog })
  }

  const onSignOut = async () => {
    if (signingOut()) return
    const input = {
      url: serverSDK.url.replace(/\/+$/, ""),
      username: serverSDK.server.http.username,
      password: serverSDK.server.http.password,
    }
    setSigningOut(true)
    await (platform.fetch ?? fetch)(`${input.url}/ktai/logout`, {
      method: "POST",
      headers:
        input.username && input.password
          ? { authorization: `Basic ${btoa(`${input.username}:${input.password}`)}` }
          : undefined,
    }).catch(() => undefined)
    accountActions.mutate(undefined)
    window.dispatchEvent(new Event("kito-account-refresh"))
    setSigningOut(false)
  }

  return (
    <div data-slot="titlebar-account" class="flex shrink-0 items-center gap-1.5 mr-1.5">
      <Show when={signedIn() && signedInLabel()}>
        <span class="hidden sm:inline max-w-36 truncate text-[11px] tabular-nums text-v2-text-text-muted">
          {signedInLabel()}
        </span>
      </Show>
      <Button type="button" size="small" variant="contrast" class="shrink-0 px-2" onClick={onClick}>
        {signedIn() ? language.t("titlebar.account.topUp") : language.t("titlebar.account.signIn")}
      </Button>
      <Show when={signedIn()}>
        <Button
          type="button"
          size="small"
          variant="ghost"
          class="shrink-0 px-2"
          disabled={signingOut()}
          onClick={() => void onSignOut()}
        >
          {language.t("titlebar.account.signOut")}
        </Button>
      </Show>
    </div>
  )
}
