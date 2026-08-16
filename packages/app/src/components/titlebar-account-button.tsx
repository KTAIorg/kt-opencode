import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Show, createMemo, createResource, onCleanup, onMount } from "solid-js"
import { DialogConnectProvider, useProviderConnectController } from "@/components/dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useProviders } from "@/hooks/use-providers"
import {
  formatKtaiBalance,
  hasKitoCredential,
  titlebarAccountAction,
  titlebarAccountName,
  type KtaiAccountSummary,
} from "@/utils/kt-account"
import { KT_WALLET_URL } from "@/utils/kt-settlement"

export function TitlebarAccountButton(props: { variant: "legacy" | "v2" }) {
  const language = useLanguage()
  const dialog = useDialog()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const providers = useProviders()
  const providerConnect = useProviderConnectController()
  const connectedKey = createMemo(() =>
    providers
      .connected()
      .map((provider) => `${provider.id}:${"source" in provider ? provider.source : ""}`)
      .join(","),
  )
  const [account, accountActions] = createResource(
    () => ({
      url: serverSDK().url.replace(/\/+$/, ""),
      username: serverSDK().server.http.username,
      password: serverSDK().server.http.password,
      connected: connectedKey(),
    }),
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
  const action = createMemo(() =>
    titlebarAccountAction({
      account: account(),
      hasCredential: hasKitoCredential(providers.connected()),
    }),
  )
  const signedInLabel = createMemo(() => {
    const current = account()
    const name = titlebarAccountName(current)
    if (!name || !current) return
    return language.t("titlebar.account.signedIn", { name, balance: formatKtaiBalance(current.balance) })
  })

  onMount(() => {
    const refresh = () => void accountActions.refetch()
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    onCleanup(() => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    })
  })

  const signIn = () => {
    providerConnect.select("ktai")
    void dialog.show(() => <DialogConnectProvider controller={providerConnect} />)
  }

  const topUp = () => {
    platform.openLink(KT_WALLET_URL)
  }

  const onClick = () => {
    if (action() === "signIn") return signIn()
    topUp()
  }

  const label = () =>
    action() === "signIn" ? language.t("titlebar.account.signIn") : language.t("titlebar.account.topUp")

  return (
    <div data-slot="titlebar-account" class="flex shrink-0 items-center gap-1.5 mr-1.5">
      <Show when={action() === "topUp" && signedInLabel()}>
        <span
          classList={{
            "hidden sm:inline max-w-36 truncate text-[11px] tabular-nums": true,
            "text-v2-text-text-muted": props.variant === "v2",
            "text-text-weak": props.variant !== "v2",
          }}
        >
          {signedInLabel()}
        </span>
      </Show>
      <Show
        when={props.variant === "v2"}
        fallback={
          <Button type="button" size="small" variant="primary" class="shrink-0 px-2" onClick={onClick}>
            {label()}
          </Button>
        }
      >
        <ButtonV2 type="button" size="small" variant="contrast" class="shrink-0" onClick={onClick}>
          {label()}
        </ButtonV2>
      </Show>
    </div>
  )
}
