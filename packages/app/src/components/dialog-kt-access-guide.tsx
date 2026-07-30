import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"

export const KT_WALLET_URL = "https://www.ktapi.cc/wallet"

export type DialogKtAccessGuideProps = {
  /** auth = invalid token; billing = quota / balance */
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}

/** Guided KT onboarding: get key on web → paste here in the same dialog. */
export function DialogKtAccessGuide(props: DialogKtAccessGuideProps) {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const kind = () => props.kind ?? "auth"
  const [form, setForm] = createStore({
    value: "",
    error: undefined as string | undefined,
    saving: false,
  })

  const close = (dontShowAgain?: boolean) => {
    props.onClose?.(dontShowAgain)
    dialog.close()
  }

  const openWallet = () => {
    platform.openLink(KT_WALLET_URL)
  }

  const saveKey = async (e: SubmitEvent) => {
    e.preventDefault()
    const apiKey = form.value.trim()
    if (!apiKey) {
      setForm("error", language.t("provider.connect.apiKey.required"))
      return
    }
    setForm({ error: undefined, saving: true })
    try {
      await serverSDK().client.auth.set({
        providerID: "ktai",
        auth: { type: "api", key: apiKey },
      })
      await serverSDK().client.global.dispose()
      props.onClose?.(false)
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: "KTAI" }),
        description: language.t("provider.connect.toast.connected.description", { provider: "KTAI" }),
      })
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : language.t("provider.connect.apiKey.required")
      setForm({ error: message, saving: false })
    }
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
      <form class="flex flex-col gap-4 pl-6 pr-2.5 pb-3" onSubmit={saveKey}>
        <ol class="list-decimal pl-5 flex flex-col gap-2 text-14-regular text-text-base">
          <li>{language.t("dialog.ktAccess.step1")}</li>
          <li>{language.t("dialog.ktAccess.step2")}</li>
          <li>{language.t("dialog.ktAccess.step3")}</li>
        </ol>
        <TextField
          autofocus
          type="text"
          label={language.t("provider.connect.apiKey.label", { provider: "KTAI" })}
          placeholder={language.t("provider.connect.apiKey.placeholder")}
          name="apiKey"
          value={form.value}
          onChange={(v) => setForm({ value: v, error: undefined })}
          validationState={form.error ? "invalid" : undefined}
          error={form.error}
        />
        <p class="text-12-regular text-text-weak">{language.t("dialog.ktAccess.hint")}</p>
        <div class="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="large" type="button" onClick={() => close(true)}>
            {language.t("dialog.ktAccess.dismiss")}
          </Button>
          <Button variant="secondary" size="large" type="button" onClick={openWallet}>
            {language.t("dialog.ktAccess.openWallet")}
          </Button>
          <Button variant="primary" size="large" type="submit" disabled={form.saving}>
            {language.t("dialog.ktAccess.saveKey")}
          </Button>
        </div>
      </form>
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
