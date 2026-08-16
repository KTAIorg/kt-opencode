import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Show, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useLocal } from "@/context/local"
import { useProviders } from "@/hooks/use-providers"
import { showToast } from "@/utils/toast"
import { KT_WALLET_URL } from "@/utils/kt-settlement"
import { ModelList } from "@/components/dialog-select-model"
import { DialogConnectProvider, useProviderConnectController } from "@/components/dialog-connect-provider"

export { KT_WALLET_URL }

export type DialogKtAccessGuideProps = {
  /** auth = invalid token; billing = quota / balance */
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}

/** Guided KT onboarding: Telegram Identity login, wallet, or paste key. */
export function DialogKtAccessGuide(props: DialogKtAccessGuideProps) {
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()
  const serverSDK = useServerSDK()
  const local = useLocal()
  const providers = useProviders()
  const providerConnect = useProviderConnectController()
  const kind = () => props.kind ?? "auth"
  const [showPaste, setShowPaste] = createSignal(false)
  /** Real credential — not the config-only discovery catalog (always present without a key). */
  const ktaiHasCredential = () =>
    providers.connected().some((p) => {
      if (!(p.id === "ktai" || p.id === "ktapi" || p.id.startsWith("ktai"))) return false
      if (p.source === "api" || p.source === "env") return true
      return Boolean(p.key)
    })
  /** Soft-quota with an existing key → pick a paid KTAI model in-dialog (not text-only steps). */
  const switchMode = () => kind() === "billing" && ktaiHasCredential()
  const ktaiModelCount = createMemo(
    () =>
      local.model
        .list()
        .filter((m) => m.provider.id === "ktai" || m.provider.id === "ktapi" || m.provider.id.startsWith("ktai"))
        .filter((m) => local.model.visible({ modelID: m.id, providerID: m.provider.id })).length,
  )

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

  const startTelegramLogin = () => {
    providerConnect.select("ktai")
    void dialog.show(() => <DialogConnectProvider controller={providerConnect} />)
  }

  const openFullModelPicker = async () => {
    const { DialogSelectModel } = await import("@/components/dialog-select-model")
    void dialog.show(() => <DialogSelectModel provider="ktai" />)
  }

  const saveKey = async (e: SubmitEvent) => {
    e.preventDefault()
    const apiKey = form.value.trim()
    if (!apiKey) {
      setForm("error", language.t("provider.connect.apiKey.required"))
      return
    }
    setForm({ error: undefined, saving: true })
    await serverSDK()
      .client.auth.set({
        providerID: "ktai",
        auth: { type: "api", key: apiKey },
      })
      .then(async () => {
        await serverSDK().client.global.dispose()
        props.onClose?.(false)
        dialog.close()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("provider.connect.toast.connected.title", { provider: "ktapi" }),
          description: language.t("provider.connect.toast.connected.description", { provider: "ktapi" }),
        })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error && err.message ? err.message : language.t("provider.connect.apiKey.required")
        setForm({ error: message, saving: false })
      })
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
          <form class="flex flex-col gap-4 pl-6 pr-2.5 pb-3" onSubmit={saveKey}>
            <ol class="list-decimal pl-5 flex flex-col gap-2 text-14-regular text-text-base">
              <li>{language.t("dialog.ktAccess.step1")}</li>
              <li>{language.t("dialog.ktAccess.step2")}</li>
              <li>{language.t("dialog.ktAccess.step3")}</li>
            </ol>
            <Show when={showPaste()}>
              <TextField
                autofocus
                type="text"
                label={language.t("provider.connect.apiKey.label", { provider: "ktapi" })}
                placeholder={language.t("provider.connect.apiKey.placeholder")}
                name="apiKey"
                value={form.value}
                onChange={(v) => setForm({ value: v, error: undefined })}
                validationState={form.error ? "invalid" : undefined}
                error={form.error}
              />
            </Show>
            <p class="text-12-regular text-text-weak">{language.t("dialog.ktAccess.hint")}</p>
            <div class="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="large" type="button" onClick={() => close(kind() !== "billing")}>
                {kind() === "billing"
                  ? language.t("dialog.ktAccess.snooze")
                  : language.t("dialog.ktAccess.dismiss")}
              </Button>
              <Button variant="ghost" size="large" type="button" onClick={() => setShowPaste(true)}>
                {language.t("dialog.ktAccess.pasteKey")}
              </Button>
              <Button variant="secondary" size="large" type="button" onClick={openWallet}>
                {language.t("dialog.ktAccess.openWallet")}
              </Button>
              <Show
                when={showPaste()}
                fallback={
                  <Button variant="primary" size="large" type="button" onClick={startTelegramLogin}>
                    {language.t("dialog.ktAccess.telegram")}
                  </Button>
                }
              >
                <Button variant="primary" size="large" type="submit" disabled={form.saving}>
                  {language.t("dialog.ktAccess.saveKey")}
                </Button>
              </Show>
            </div>
          </form>
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

/** Open the guided connect flow for ktapi (used by error cards / CTAs). */
export function openKtAccessGuide(input: {
  dialog: ReturnType<typeof useDialog>
  kind?: "auth" | "billing"
  onClose?: (dontShowAgain?: boolean) => void
}) {
  void input.dialog.show(
    () => <DialogKtAccessGuide kind={input.kind} onClose={input.onClose} />,
    () => input.onClose?.(false),
  )
}
