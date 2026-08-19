import { Button } from "@opencode-ai/ui/button"
import { Card } from "@opencode-ai/ui/card"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { openKtAccessGuide } from "@/components/dialog-kt-access-guide"
import { requestKtaiEnsure } from "@/utils/kt-ensure"
import { showToast } from "@/utils/toast"
import { classifySessionErrorCta } from "./session-error-cta"

export function SessionErrorCard(props: { text: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const kind = () => classifySessionErrorCta(props.text)
  const displayText = () => {
    const current = kind()
    if (current === "auth" && /invalid token/i.test(props.text)) {
      return language.t("dialog.ktAccess.auth.lead")
    }
    return props.text
  }

  return (
    <Card variant="error" class="error-card">
      <div class="flex flex-col gap-3">
        <div>{displayText()}</div>
        <Show when={kind()}>
          {(current) => (
            <div class="flex justify-end">
              <Button
                variant="contrast"
                size="small"
                onClick={() => {
                  if (current() !== "auth") {
                    openKtAccessGuide({ dialog, kind: current() })
                    return
                  }
                  void requestKtaiEnsure({
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
                      openKtAccessGuide({ dialog, kind: "auth" })
                    })
                    .catch(() => openKtAccessGuide({ dialog, kind: "auth" }))
                }}
              >
                {current() === "auth" ? language.t("dialog.ktAccess.telegram") : language.t("dialog.ktAccess.openWallet")}
              </Button>
            </div>
          )}
        </Show>
      </div>
    </Card>
  )
}
