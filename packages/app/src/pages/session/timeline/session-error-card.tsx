import { Button } from "@opencode-ai/ui/button"
import { Card } from "@opencode-ai/ui/card"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { openKtAccessGuide } from "@/components/dialog-kt-access-guide"
import { classifySessionErrorCta } from "./session-error-cta"

export function SessionErrorCard(props: { text: string }) {
  const dialog = useDialog()
  const language = useLanguage()
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
                onClick={() => openKtAccessGuide({ dialog, kind: k() })}
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
