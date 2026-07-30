import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import { DialogConnectProvider, useProviderConnectController } from "./dialog-connect-provider"

export const KT_WALLET_URL = "https://www.ktapi.cc/wallet"

export type DialogKtAccessGuideProps = {
  /** auth = invalid token; billing = quota / balance */
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}

/** Guided KT onboarding: get key on web → paste into Desktop (not a cold wallet dump). */
export function DialogKtAccessGuide(props: DialogKtAccessGuideProps) {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const serverSync = useServerSync()
  const kind = () => props.kind ?? "auth"
  const providerConnect = useProviderConnectController()

  const close = (dontShowAgain?: boolean) => {
    props.onClose?.(dontShowAgain)
    dialog.close()
  }

  const openWallet = () => {
    platform.openLink(KT_WALLET_URL)
  }

  const pasteKey = () => {
    props.onClose?.(false)
    // Drop stale method list (Identity options) so connect auto-opens API paste.
    const next = { ...serverSync().data.provider_auth }
    delete next.ktai
    serverSync().set("provider_auth", next)
    providerConnect.select("ktai")
    // Only one method (API key) → ProviderConnection auto-selects the paste field.
    void dialog.show(() => <DialogConnectProvider controller={providerConnect} />)
  }

  return (
    <Dialog
      fit
      title={
        kind() === "billing"
          ? language.t("dialog.ktAccess.billing.title")
          : language.t("dialog.ktAccess.auth.title")
      }
      description={
        kind() === "billing"
          ? language.t("dialog.ktAccess.billing.lead")
          : language.t("dialog.ktAccess.auth.lead")
      }
    >
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <ol class="list-decimal pl-5 flex flex-col gap-2 text-14-regular text-text-base">
          <li>{language.t("dialog.ktAccess.step1")}</li>
          <li>{language.t("dialog.ktAccess.step2")}</li>
          <li>{language.t("dialog.ktAccess.step3")}</li>
        </ol>
        <p class="text-12-regular text-text-weak">{language.t("dialog.ktAccess.hint")}</p>
        <div class="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => close(true)}>
            {language.t("dialog.ktAccess.dismiss")}
          </Button>
          <Button variant="secondary" size="large" onClick={openWallet}>
            {language.t("dialog.ktAccess.openWallet")}
          </Button>
          <Button variant="primary" size="large" autofocus onClick={pasteKey}>
            {language.t("dialog.ktAccess.pasteKey")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Open the guided connect flow for KTAI API key (used by error cards / CTAs). */
export function openKtAccessGuide(input: {
  dialog: ReturnType<typeof useDialog>
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}) {
  void input.dialog.show(() => <DialogKtAccessGuide kind={input.kind} onClose={input.onClose} />)
}
