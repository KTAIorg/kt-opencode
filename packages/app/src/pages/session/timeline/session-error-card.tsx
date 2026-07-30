import { Button } from "@opencode-ai/ui/button"
import { Card } from "@opencode-ai/ui/card"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { openKtAccessGuide } from "@/components/dialog-kt-access-guide"

export function classifySessionErrorCta(text: string): "auth" | "billing" | undefined {
  const lower = text.toLowerCase()
  if (
    lower.includes("api key is invalid") ||
    lower.includes("invalid token") ||
    lower.includes("sign in or top up") ||
    lower.includes("密钥无效") ||
    lower.includes("金鑰無效") ||
    lower.includes("configure a ktai") ||
    lower.includes("配置 ktai")
  ) {
    return "auth"
  }
  if (
    lower.includes("free usage exceeded") ||
    lower.includes("free model quota") ||
    lower.includes("ktapi.cc/wallet") ||
    lower.includes("余额不足") ||
    lower.includes("餘額不足") ||
    lower.includes("top up on kt") ||
    lower.includes("免费") ||
    lower.includes("免費")
  ) {
    return "billing"
  }
  return undefined
}

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
