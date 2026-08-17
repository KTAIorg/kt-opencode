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
    const k = kind()
    if (k === "auth" && /invalid token/i.test(props.text)) {
      return language.t("ui.sessionTurn.error.authFriendly")
    }
    return props.text
  }

  return (
    <Card variant="error" class="error-card">
      <div class="flex flex-col gap-3">
        <div>{displayText()}</div>
        <Show when={kind()}>
          {(k) => (
            <div class="flex justify-end">
              <Button
                variant="primary"
                size="small"
                onClick={() => {
                  if (k() !== "auth") {
                    openKtAccessGuide({ dialog, kind: k() })
                    return
                  }
                  void requestKtaiEnsure({
                    url: serverSDK().url,
                    username: serverSDK().server.http.username,
                    password: serverSDK().server.http.password,
                    fetchImpl: platform.fetch ?? fetch,
                  })
                    .then((result) => {
                      if (result.ok) {
                        showToast({
                          variant: "success",
                          icon: "circle-check",
                          title: language.t("provider.connect.toast.connected.title", { provider: "Kito" }),
                        })
                        return
                      }
                      openKtAccessGuide({ dialog, kind: "auth" })
                    })
                    .catch(() => openKtAccessGuide({ dialog, kind: "auth" }))
                }}
              >
                {language.t("ui.sessionTurn.error.configureKey")}
              </Button>
            </div>
          )}
        </Show>
      </div>
    </Card>
  )
}
