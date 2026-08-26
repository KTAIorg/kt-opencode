import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show, createMemo, createResource, onCleanup, onMount } from "solid-js"
import { openKtIdentityLogin } from "./dialog-kt-identity-login"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { formatKtaiBalance, titlebarAccountName, type KtaiAccountSummary } from "@/runtime/server/kt-account"
import { openKtWallet } from "./dialog-kt-wallet"

export function TitlebarAccountButton() {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
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
    const refresh = () => void accountActions.refetch()
    window.addEventListener("focus", refresh)
    window.addEventListener("kito-account-refresh", refresh)
    document.addEventListener("visibilitychange", refresh)
    onCleanup(() => {
      window.removeEventListener("focus", refresh)
      window.removeEventListener("kito-account-refresh", refresh)
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
    </div>
  )
}
