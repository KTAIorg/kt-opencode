import { Button } from "@opencode-ai/ui/button"
import { Card } from "@opencode-ai/ui/card"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show } from "solid-js"
import { openKtAccessGuide } from "@/components/dialog-kt-access-guide"
import { openKtWallet } from "@/components/dialog-kt-wallet"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { requestKtaiEnsure } from "@/utils/kt-ensure"
import { useKtaiAccount, useKtaiSignedIn } from "@/utils/kt-signed-in"
import { showToast } from "@/utils/toast"
import {
  classifySessionErrorCta,
  sessionAuthCta,
  sessionAuthLeadKey,
  sessionBillingCta,
  sessionBillingLeadKey,
} from "./session-error-cta"

export function SessionErrorCard(props: { text: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const signedIn = useKtaiSignedIn()
  const account = useKtaiAccount()
  const kind = () => classifySessionErrorCta(props.text)
  const authCta = () => sessionAuthCta(props.text, signedIn())
  const billingCta = () => sessionBillingCta(props.text, signedIn(), account.balance())
  const displayText = () => {
    const lead =
      sessionAuthLeadKey(props.text, signedIn()) ??
      sessionBillingLeadKey(props.text, signedIn(), account.balance())
    return lead ? language.t(lead) : props.text
  }

  const refreshKey = () =>
    requestKtaiEnsure({
      url: serverSDK.url,
      username: serverSDK.server.http.username,
      password: serverSDK.server.http.password,
      fetchImpl: platform.fetch ?? fetch,
    })
      .then((result) => {
        if (result.ok) {
          showToast({
            variant: "success",
            title: language.t("provider.connect.toast.connected.title", { provider: "Kito" }),
          })
          return
        }
        if (signedIn()) {
          showToast({
            variant: "error",
            title: language.t("dialog.ktAccess.refreshKey.failed"),
          })
          return
        }
        openKtAccessGuide({ dialog, kind: "auth" })
      })
      .catch(() => {
        if (signedIn()) {
          showToast({
            variant: "error",
            title: language.t("dialog.ktAccess.refreshKey.failed"),
          })
          return
        }
        openKtAccessGuide({ dialog, kind: "auth" })
      })

  return (
    <Card variant="error" class="error-card">
      <div class="flex flex-col gap-3">
        <div>{displayText()}</div>
        <Show when={kind() === "billing" || authCta()}>
          <div class="flex justify-end">
            <Button
              variant="contrast"
              size="small"
              onClick={() => {
                if (kind() !== "auth") {
                  if (billingCta() === "switch") {
                    openKtAccessGuide({ dialog, kind: "billing" })
                    return
                  }
                  openKtWallet({ dialog })
                  return
                }
                void refreshKey()
              }}
            >
              {authCta() === "refresh"
                ? language.t("dialog.ktAccess.refreshKey")
                : kind() === "auth"
                  ? language.t("dialog.ktAccess.telegram")
                  : billingCta() === "switch"
                    ? language.t("dialog.ktAccess.pickPaidModel")
                    : language.t("dialog.ktAccess.openWallet")}
            </Button>
          </div>
        </Show>
      </div>
    </Card>
  )
}
