import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { openKtWallet } from "@/components/dialog-kt-wallet"
import { openKtIdentityLogin } from "@/components/dialog-kt-identity-login"

export type DialogKtAccessGuideProps = {
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}

export function DialogKtAccessGuide(props: DialogKtAccessGuideProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const kind = () => props.kind ?? "auth"

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
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
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
        />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <ol class="list-decimal pl-5 flex flex-col gap-2 text-14-regular text-text-base">
            <li>{language.t("dialog.ktAccess.step1")}</li>
            <li>{language.t("dialog.ktAccess.step2")}</li>
            <li>{language.t("dialog.ktAccess.step3")}</li>
          </ol>
          <p class="text-12-regular text-text-weak">{language.t("dialog.ktAccess.hint")}</p>
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="large" type="button" onClick={() => close(kind() !== "billing")}>
              {kind() === "billing" ? language.t("dialog.ktAccess.snooze") : language.t("dialog.ktAccess.dismiss")}
            </Button>
            <Button variant="outline" size="large" type="button" onClick={() => void openFullModelPicker()}>
              {language.t("dialog.ktAccess.switch.browseAll")}
            </Button>
            <Button variant="outline" size="large" type="button" onClick={openWallet}>
              {language.t("dialog.ktAccess.openWallet")}
            </Button>
            <Button variant="contrast" size="large" type="button" onClick={startTelegramLogin}>
              {language.t("dialog.ktAccess.telegram")}
            </Button>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  )
}

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
