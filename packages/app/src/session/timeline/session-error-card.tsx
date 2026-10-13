import { Button } from "@opencode/ui/button"
import { Card } from "@opencode/ui/card"
import { useDialog } from "@opencode/ui/context/dialog"
import { Show } from "solid-js"
import { openKtAccessGuide } from "@/shell/titlebar/dialog-kt-access-guide"
import { openKtWallet } from "@/shell/titlebar/dialog-kt-wallet"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { requestKtaiEnsure } from "@/runtime/server/kt-ensure"
import { useKtaiAccount, useKtaiSignedIn } from "@/runtime/server/kt-signed-in"
import { showToast } from "@/shell/notifications/toast"
import {
  classifySessionErrorCta,
  sessionAuthCta,
  sessionAuthLeadKey,
  sessionBillingCta,
  sessionBillingLeadKey,
  sessionModelLeadKey,
} from "./session-error-cta"

export function SessionErrorCard(props: { text: string; type?: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const signedIn = useKtaiSignedIn()
  const account = useKtaiAccount()
  const kind = () => classifySessionErrorCta(props.text)
  const authCta = () => sessionAuthCta(props.text, signedIn())
  const billingCta = () => sessionBillingCta(props.text, signedIn(), account.balance(), account.resolved())
  // 余额还在查时 billingCta() 是 undefined：不要先渲染一个（可能错的）充值/切模型按钮。
  const billingAction = () => {
    const cta = billingCta()
    return cta === "none" ? undefined : cta
  }
  const displayText = () => {
    const lead =
      sessionAuthLeadKey(props.text, signedIn()) ??
      sessionBillingLeadKey(props.text, signedIn(), account.balance(), account.resolved()) ??
      sessionModelLeadKey(props.type)
    return lead ? language.t(lead) : props.text
  }
  // 命中模型/工具类错误映射时，原始技术文案降级为次要行保留（便于截图反馈客服排查）。
  const detailText = () => {
    if (!sessionModelLeadKey(props.type)) return
    if (
      sessionAuthLeadKey(props.text, signedIn()) ??
      sessionBillingLeadKey(props.text, signedIn(), account.balance(), account.resolved())
    )
      return
    return props.text
  }

  // 「选择付费模型」不再弹挂空锚点的选择器，改为打开居中的管理模型弹窗（那里也能直接使用模型）。
  const openManageModels = () => {
    void import("@/providers/models/manage").then((module) => module.openManageModels({ dialog }))
  }

  const refreshKey = () =>
    requestKtaiEnsure({
      url: serverSDK.url,
      username: "opencode",
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
        <Show when={detailText()}>
          <div class="text-12-regular text-text-weak">{detailText()}</div>
        </Show>
        <Show when={authCta() || (kind() === "billing" && billingAction())}>
          <div class="flex justify-end">
            <Button
              variant="contrast"
              size="small"
              onClick={() => {
                if (kind() !== "auth") {
                  if (billingCta() === "switch") {
                    openManageModels()
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
