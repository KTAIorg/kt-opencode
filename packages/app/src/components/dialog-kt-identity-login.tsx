import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useData } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { requestKtaiEnsure } from "@/utils/kt-ensure"
import { parseTelegramAuthorization } from "@/utils/kt-identity-login"
import { showToast } from "@/utils/toast"

export function DialogKtIdentityLogin(props: { onClose?: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const data = useData()
  const [authorization, setAuthorization] = createSignal<{ url: string; instructions: string; attemptID?: string }>()
  const [error, setError] = createSignal<string>()
  const [creating, setCreating] = createSignal(true)
  const parsed = createMemo(() => {
    const current = authorization()
    return current ? parseTelegramAuthorization(current) : undefined
  })
  const alive = { value: true }
  const run = { current: 0 }

  const close = () => {
    props.onClose?.()
    dialog.close()
  }

  const finish = async () => {
    await requestKtaiEnsure({
      url: serverSDK.url,
      username: serverSDK.server.http.username,
      password: serverSDK.server.http.password,
      fetchImpl: platform.fetch ?? fetch,
    }).catch(() => undefined)
    data.location.integration.invalidate()
    data.location.provider.invalidate()
    data.location.model.invalidate()
    await Promise.all([data.location.integration.sync(), data.location.provider.sync(), data.location.model.sync()]).catch(
      () => undefined,
    )
    window.dispatchEvent(new Event("kito-account-refresh"))
    close()
    showToast({
      variant: "success",
      title: language.t("provider.connect.toast.connected.title", { provider: "Kito" }),
      description: language.t("provider.connect.toast.connected.description", { provider: "Kito" }),
    })
  }

  const start = async () => {
    const current = ++run.current
    setCreating(true)
    setError(undefined)
    setAuthorization(undefined)
    const integration = await serverSDK.api.integration
      .get({ integrationID: "ktai" })
      .then((result) => result.data)
      .catch(() => undefined)
    const method = integration?.methods.find((item) => item.type === "oauth")
    if (!method || method.type !== "oauth") {
      if (!alive.value || current !== run.current) return
      setCreating(false)
      setError(language.t("common.requestFailed"))
      return
    }
    const result = await serverSDK.api.integration.oauth
      .connect({
        integrationID: "ktai",
        methodID: method.id,
      })
      .then((value) => ({ ok: true as const, authorization: value.data }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error && err.message ? err.message : language.t("common.requestFailed"),
      }))
    if (!alive.value || current !== run.current) return
    if (!result.ok) {
      setCreating(false)
      setError(result.error)
      return
    }
    setAuthorization({
      url: result.authorization.url,
      instructions: result.authorization.instructions,
      attemptID: result.authorization.attemptID,
    })
    setCreating(false)
    while (alive.value && current === run.current) {
      const status = await serverSDK.api.integration.oauth
        .status({
          integrationID: "ktai",
          attemptID: result.authorization.attemptID,
        })
        .then((value) => ({ ok: true as const, status: value.data }))
        .catch((err: unknown) => ({
          ok: false as const,
          error: err instanceof Error && err.message ? err.message : language.t("common.requestFailed"),
        }))
      if (!alive.value || current !== run.current) return
      if (!status.ok) {
        setError(status.error)
        return
      }
      if (status.status.status === "complete") {
        await finish()
        return
      }
      if (status.status.status === "failed") {
        setError(status.status.message)
        return
      }
      if (status.status.status === "expired") {
        setError(language.t("common.requestFailed"))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  onMount(() => {
    void start()
    onCleanup(() => {
      alive.value = false
    })
  })

  const openTelegram = () => {
    const url = parsed()?.url
    if (!url) return
    platform.openExternal(url)
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={language.t("dialog.ktIdentity.title")} description={language.t("dialog.ktIdentity.lead")} />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-5 px-6 pb-4">
          <Show when={creating()}>
            <div class="flex items-center gap-3 text-14-regular text-text-base">
              <Spinner />
              <span>{language.t("dialog.ktIdentity.creating")}</span>
            </div>
          </Show>
          <Show when={parsed()?.code}>
            <div class="flex flex-col gap-2">
              <div class="text-12-regular text-text-weak">{language.t("dialog.ktIdentity.codeLabel")}</div>
              <div class="font-mono text-[28px] leading-none tracking-[0.18em] text-text-strong">{parsed()?.code}</div>
              <p class="text-12-regular text-text-weak">{language.t("dialog.ktIdentity.codeHint")}</p>
            </div>
          </Show>
          <Show when={parsed()?.url}>
            <div class="flex flex-col gap-2">
              <Button variant="contrast" size="large" type="button" onClick={openTelegram}>
                {parsed()?.bot
                  ? language.t("dialog.ktIdentity.openTelegram", { bot: parsed()!.bot! })
                  : language.t("dialog.ktIdentity.openTelegramFallback")}
              </Button>
              <p class="text-12-regular text-text-weak">{language.t("dialog.ktIdentity.noTelegram")}</p>
            </div>
          </Show>
          <Show when={!creating() && !error() && parsed()?.url}>
            <div class="flex items-center gap-3 text-14-regular text-text-base">
              <Spinner />
              <span>{language.t("dialog.ktIdentity.waiting")}</span>
            </div>
          </Show>
          <Show when={error()}>
            <div class="flex flex-col gap-3">
              <p class="text-14-regular text-text-base">{error()}</p>
              <div class="flex justify-end">
                <Button variant="contrast" size="large" type="button" onClick={() => void start()}>
                  {language.t("dialog.ktIdentity.retry")}
                </Button>
              </div>
            </div>
          </Show>
        </div>
      </DialogBody>
    </Dialog>
  )
}

export function openKtIdentityLogin(input: { dialog: ReturnType<typeof useDialog>; onClose?: () => void }) {
  void input.dialog.show(
    () => <DialogKtIdentityLogin onClose={input.onClose} />,
    () => input.onClose?.(),
  )
}
