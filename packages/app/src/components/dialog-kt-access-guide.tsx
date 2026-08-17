import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useProviders } from "@/hooks/use-providers"
import { hasKitoCredential } from "@/utils/kt-account"
import { openKtWallet } from "@/components/dialog-kt-wallet"
import { ModelList } from "@/components/dialog-select-model"
import { openKtIdentityLogin } from "@/components/dialog-kt-identity-login"

export type DialogKtAccessGuideProps = {
  /** auth = invalid token; billing = quota / balance */
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}

/** Guided KT onboarding: Telegram Identity login or wallet. */
export function DialogKtAccessGuide(props: DialogKtAccessGuideProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const local = useLocal()
  const providers = useProviders()
  const kind = () => props.kind ?? "auth"
  /** Real credential — not the config-only discovery catalog (always present without a key). */
  const ktaiHasCredential = () => hasKitoCredential(providers.connected())
  /** Soft-quota with an existing key → pick a paid KTAI model in-dialog (not text-only steps). */
  const switchMode = () => kind() === "billing" && ktaiHasCredential()
  const ktaiModelCount = createMemo(
    () =>
      local.model
        .list()
        .filter((m) => m.provider.id === "ktai" || m.provider.id === "ktapi" || m.provider.id.startsWith("ktai"))
        .filter((m) => local.model.visible({ modelID: m.id, providerID: m.provider.id })).length,
  )

  const close = (dontShowAgain?: boolean) => {
    props.onClose?.(dontShowAgain)
    dialog.close()
  }

  const openWallet = () => {
    openKtWallet({ dialog, onClose: () => props.onClose?.(false) })
  }

  const startTelegramLogin = () => {
    openKtIdentityLogin({ dialog, onClose: () => props.onClose?.(false) })
  }

  const openFullModelPicker = async () => {
    const { DialogSelectModel } = await import("@/components/dialog-select-model")
    void dialog.show(() => <DialogSelectModel provider="ktai" />)
  }

  return (
    <Show
      when={switchMode()}
      fallback={
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
              <Button variant="ghost" size="large" type="button" onClick={() => close(kind() !== "billing")}>
                {kind() === "billing"
                  ? language.t("dialog.ktAccess.snooze")
                  : language.t("dialog.ktAccess.dismiss")}
              </Button>
              <Button variant="secondary" size="large" type="button" onClick={openWallet}>
                {language.t("dialog.ktAccess.openWallet")}
              </Button>
              <Button variant="primary" size="large" type="button" onClick={startTelegramLogin}>
                {language.t("dialog.ktAccess.telegram")}
              </Button>
            </div>
          </div>
        </Dialog>
      }
    >
      <Dialog
        size="large"
        title={language.t("dialog.ktAccess.switch.title")}
        description={language.t("dialog.ktAccess.switch.lead")}
      >
        <div class="flex flex-col gap-3 pb-3 min-h-0">
          <p class="px-6 text-13-regular text-text-weak">{language.t("dialog.ktAccess.switch.pickHint")}</p>
          <Show
            when={ktaiModelCount() > 0}
            fallback={
              <div class="px-6 flex flex-col gap-3">
                <p class="text-14-regular text-text-base">{language.t("dialog.ktAccess.switch.empty")}</p>
                <div class="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="large" type="button" onClick={() => close(false)}>
                    {language.t("dialog.ktAccess.snooze")}
                  </Button>
                  <Button variant="secondary" size="large" type="button" onClick={openWallet}>
                    {language.t("dialog.ktAccess.openWallet")}
                  </Button>
                  <Button variant="primary" size="large" type="button" autofocus onClick={() => void openFullModelPicker()}>
                    {language.t("dialog.ktAccess.switch.browseAll")}
                  </Button>
                </div>
              </div>
            }
          >
            <div class="min-h-[220px] max-h-[360px] flex flex-col">
              <ModelList provider="ktai" onSelect={() => close(false)} />
            </div>
            <div class="flex flex-wrap justify-between gap-2 px-6 pt-1">
              <Button variant="ghost" size="large" type="button" onClick={() => void openFullModelPicker()}>
                {language.t("dialog.ktAccess.switch.browseAll")}
              </Button>
              <div class="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="large" type="button" onClick={() => close(false)}>
                  {language.t("dialog.ktAccess.snooze")}
                </Button>
                <Button variant="secondary" size="large" type="button" onClick={openWallet}>
                  {language.t("dialog.ktAccess.openWallet")}
                </Button>
              </div>
            </div>
          </Show>
        </div>
      </Dialog>
    </Show>
  )
}

/** Open the guided connect flow for KT (used by error cards / CTAs). */
export function openKtAccessGuide(input: {
  dialog: ReturnType<typeof useDialog>
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}) {
  if ((input.kind ?? "auth") === "auth") {
    openKtIdentityLogin({ dialog: input.dialog, onClose: () => input.onClose?.(false) })
    return
  }
  void input.dialog.show(
    () => <DialogKtAccessGuide kind={input.kind} onClose={input.onClose} />,
    () => input.onClose?.(false),
  )
}
