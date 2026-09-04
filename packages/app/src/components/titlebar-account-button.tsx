import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Menu } from "@opencode-ai/ui/menu"
import { Show, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { openKtIdentityLogin } from "@/components/dialog-kt-identity-login"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { formatKtaiBalance, titlebarAccountName, type KtaiAccountSummary } from "@/utils/kt-account"
import { openKtWallet } from "@/components/dialog-kt-wallet"

const KITO_CONSOLE_URL = "https://ktapi.cc"

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
    // NewAPI 额度读不到时只显示名字：不显示 Identity ledger，也不显示假 0。
    if (typeof current.balance !== "number") return name
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

  const openConsole = () => {
    platform.openExternal(KITO_CONSOLE_URL)
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
      <Show when={signedIn()} fallback={<Show when={signedInLabel()}><span class="hidden sm:inline max-w-36 truncate text-[11px] tabular-nums text-v2-text-text-muted">{signedInLabel()}</span></Show>}>
        <Menu placement="bottom-end" gutter={6}>
          <Menu.Trigger
            as="button"
            type="button"
            class="hidden sm:flex max-w-36 items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] tabular-nums text-v2-text-text-muted outline-none hover:text-v2-text-text-base focus-visible:text-v2-text-text-base"
            title={signedInLabel()}
          >
            <span class="truncate">{signedInLabel()}</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content class="min-w-44 p-1">
              <Menu.Item onSelect={openConsole}>{language.t("titlebar.account.console")}</Menu.Item>
              <Menu.Item onSelect={() => openKtWallet({ dialog })}>{language.t("titlebar.account.topUp")}</Menu.Item>
              <Menu.Separator />
              <Menu.Item disabled={signingOut()} onSelect={() => void onSignOut()}>
                {signingOut() ? language.t("titlebar.account.signingOut") : language.t("titlebar.account.signOut")}
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </Show>
      <Show when={signedIn()}>
        <Button type="button" size="small" variant="contrast" class="shrink-0 px-2" onClick={() => openKtWallet({ dialog })}>
          {language.t("titlebar.account.topUp")}
        </Button>
      </Show>
      <Show when={!signedIn()}>
        <Button type="button" size="small" variant="contrast" class="shrink-0 px-2" onClick={onClick}>
          {language.t("titlebar.account.signIn")}
        </Button>
      </Show>
    </div>
  )
}
