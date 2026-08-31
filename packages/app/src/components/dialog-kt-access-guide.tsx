import { For, Show, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { openKtWallet } from "@/components/dialog-kt-wallet"
import { openKtIdentityLogin } from "@/components/dialog-kt-identity-login"
import { compareKtaiModelOrder, isKtaiProviderID } from "@/utils/ktai-model-order"
import { useKtaiSignedIn } from "@/utils/kt-signed-in"

export type DialogKtAccessGuideProps = {
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}

export function DialogKtAccessGuide(props: DialogKtAccessGuideProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const local = useLocal()
  const kind = () => props.kind ?? "auth"
  const signedIn = useKtaiSignedIn()
  const billingSignedIn = () => kind() === "billing" && signedIn() === true
  const kitoModels = createMemo(() =>
    local.model
      .list()
      .filter((item) => isKtaiProviderID(item.provider.id))
      .toSorted(compareKtaiModelOrder),
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

  const pickModel = (item: ReturnType<typeof kitoModels>[number]) => {
    local.model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
    close(false)
  }

  const openAllModels = () => {
    close(false)
    void import("./dialog-select-model").then((x) => {
      dialog.show(() => <x.DialogSelectModel provider="ktai" />)
    })
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={
            billingSignedIn()
              ? language.t("dialog.ktAccess.switch.title")
              : kind() === "billing"
                ? language.t("dialog.ktAccess.billing.title")
                : language.t("dialog.ktAccess.auth.title")
          }
          description={
            billingSignedIn()
              ? language.t("dialog.ktAccess.switch.lead")
              : kind() === "billing"
                ? language.t("dialog.ktAccess.billing.lead")
                : language.t("dialog.ktAccess.auth.lead")
          }
        />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
          <Show
            when={billingSignedIn()}
            fallback={
              <>
                <ol class="list-decimal pl-5 flex flex-col gap-2 text-14-regular text-text-base">
                  <li>{language.t("dialog.ktAccess.step1")}</li>
                  <li>{language.t("dialog.ktAccess.step2")}</li>
                  <li>{language.t("dialog.ktAccess.step3")}</li>
                </ol>
                <p class="text-12-regular text-text-weak">{language.t("dialog.ktAccess.hint")}</p>
              </>
            }
          >
            <p class="text-12-regular text-text-weak">{language.t("dialog.ktAccess.switch.pickHint")}</p>
            <Show
              when={kitoModels().length > 0}
              fallback={<p class="text-14-regular text-text-base">{language.t("dialog.ktAccess.switch.empty")}</p>}
            >
              <div class="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                <For each={kitoModels()}>
                  {(item) => (
                    <button
                      type="button"
                      class="flex w-full items-center rounded-md px-3 py-2 text-left text-14-regular text-text-base hover:bg-surface-raised-base-hover"
                      onClick={() => pickModel(item)}
                    >
                      <span class="min-w-0 truncate">{item.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="large" type="button" onClick={() => close(kind() !== "billing")}>
              {kind() === "billing" ? language.t("dialog.ktAccess.snooze") : language.t("dialog.ktAccess.dismiss")}
            </Button>
            <Show when={billingSignedIn()}>
              <Button variant="ghost" size="large" type="button" onClick={openAllModels}>
                {language.t("dialog.ktAccess.switch.browseAll")}
              </Button>
              <Button variant="outline" size="large" type="button" onClick={openWallet}>
                {language.t("dialog.ktAccess.openWallet")}
              </Button>
            </Show>
            <Show when={kind() === "billing" && signedIn() === false}>
              <Button variant="contrast" size="large" type="button" onClick={startTelegramLogin}>
                {language.t("dialog.ktAccess.telegram")}
              </Button>
            </Show>
            <Show when={kind() !== "billing"}>
              <Button variant="outline" size="large" type="button" onClick={openWallet}>
                {language.t("dialog.ktAccess.openWallet")}
              </Button>
              <Button variant="contrast" size="large" type="button" onClick={startTelegramLogin}>
                {language.t("dialog.ktAccess.telegram")}
              </Button>
            </Show>
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
