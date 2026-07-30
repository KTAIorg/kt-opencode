import { Button } from "@opencode-ai/ui/button"
import { Card } from "@opencode-ai/ui/card"
import { useI18n } from "@opencode-ai/ui/context"
import { Show } from "solid-js"
import { usePlatform } from "@/context/platform"

const KT_WALLET_URL = "https://www.ktapi.cc/wallet"

export function classifySessionErrorCta(text: string): "auth" | "billing" | undefined {
  const lower = text.toLowerCase()
  if (
    lower.includes("api key is invalid") ||
    lower.includes("invalid token") ||
    lower.includes("sign in or top up") ||
    lower.includes("密钥无效") ||
    lower.includes("金鑰無效")
  ) {
    return "auth"
  }
  if (
    lower.includes("free usage exceeded") ||
    lower.includes("free model quota") ||
    lower.includes("ktapi.cc/wallet") ||
    lower.includes("余额不足") ||
    lower.includes("餘額不足") ||
    lower.includes("免费") ||
    lower.includes("免費")
  ) {
    return "billing"
  }
  return undefined
}

export function SessionErrorCard(props: { text: string }) {
  const platform = usePlatform()
  const { t } = useI18n()
  const kind = () => classifySessionErrorCta(props.text)

  return (
    <Card variant="error" class="error-card">
      <div class="flex flex-col gap-3">
        <div>{props.text}</div>
        <Show when={kind()}>
          {(k) => (
            <div class="flex justify-end">
              <Button
                variant="primary"
                size="small"
                onClick={() => platform.openLink(KT_WALLET_URL)}
              >
                {k() === "auth" ? t("ui.sessionTurn.error.openKt") : t("ui.sessionTurn.error.addCredits")}
              </Button>
            </div>
          )}
        </Show>
      </div>
    </Card>
  )
}
