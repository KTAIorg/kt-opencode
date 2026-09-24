import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Show, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useData } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { requestKtaiEnsure } from "@/utils/kt-ensure"
import { parseTelegramAuthorization } from "@/utils/kt-identity-login"
import { qrUrl } from "@/utils/qr"
import { showToast } from "@/utils/toast"

// 登录弹窗全局去重：401 引导、顶栏点击、钱包引导可能同时触发，只允许开一个。
let loginOpen = false

export function DialogKtIdentityLogin(props: { onClose?: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const data = useData()
  const [state, setState] = createStore({
    authorization: undefined as { url: string; instructions: string; attemptID?: string } | undefined,
    error: undefined as string | undefined,
    creating: true,
    copied: false,
  })
  const parsed = createMemo(() => {
    const current = state.authorization
    return current ? parseTelegramAuthorization(current) : undefined
  })
  const alive = { value: true }
  const run = { current: 0 }
  const attempt = { id: undefined as string | undefined }

  // 弹窗关闭/重试时取消服务端仍在轮询的旧 attempt，避免旧挑战继续占额度
  // 或用户点了旧链接后 token 落到无人等待的 attempt 上。
  const cancelAttempt = () => {
    const id = attempt.id
    attempt.id = undefined
    if (!id) return
    void serverSDK.api.integration.oauth
      .cancel({ integrationID: "ktai", attemptID: id })
      .catch(() => undefined)
  }

  const close = () => {
    cancelAttempt()
    props.onClose?.()
    dialog.close()
  }

  const finish = async () => {
    const ensured = await requestKtaiEnsure({
      url: serverSDK.url,
      username: serverSDK.server.http.username,
      password: serverSDK.server.http.password,
      fetchImpl: platform.fetch ?? fetch,
    })
      .then(() => true)
      .catch(() => false)
    data.location.integration.invalidate()
    data.location.provider.invalidate()
    data.location.model.invalidate()
    await Promise.all([data.location.integration.sync(), data.location.provider.sync(), data.location.model.sync()]).catch(
      () => undefined,
    )
    window.dispatchEvent(new Event("kito-account-refresh"))
    attempt.id = undefined
    close()
    // 登录成功与 ensure 失败合并为一条 toast：双 toast 既吵又让成功提示看着像误报。
    // ensure 失败（Ensure 限流/网关故障）时把警示放进同一条的描述里如实告知。
    showToast({
      variant: "success",
      title: language.t("provider.connect.toast.connected.title", { provider: "Kito" }),
      description: ensured
        ? language.t("provider.connect.toast.connected.description", { provider: "Kito" })
        : language.t("dialog.ktIdentity.ensureFailed"),
    })
  }

  const start = async () => {
    const current = ++run.current
    cancelAttempt()
    setState({ creating: true, error: undefined, authorization: undefined, copied: false })
    const integration = await serverSDK.api.integration
      .get({ integrationID: "ktai" })
      .then((result) => result.data)
      .catch(() => undefined)
    const method = integration?.methods.find((item) => item.type === "oauth")
    if (!method || method.type !== "oauth") {
      if (!alive.value || current !== run.current) return
      setState({ creating: false, error: language.t("common.requestFailed") })
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
      setState({ creating: false, error: result.error })
      return
    }
    attempt.id = result.authorization.attemptID
    setState({
      authorization: {
        url: result.authorization.url,
        instructions: result.authorization.instructions,
        attemptID: result.authorization.attemptID,
      },
      creating: false,
    })
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
        setState("error", status.error)
        return
      }
      if (status.status.status === "complete") {
        await finish()
        return
      }
      if (status.status.status === "failed") {
        attempt.id = undefined
        setState("error", status.status.message)
        return
      }
      if (status.status.status === "expired") {
        // attempt 消失（服务端重启/已取消/超时）时服务端也按 expired 返回，
        // 统一走"已过期请重试"而不是生错误原文或笼统的 requestFailed。
        attempt.id = undefined
        setState("error", language.t("dialog.ktIdentity.expired"))
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  onMount(() => {
    loginOpen = true
    void start()
    onCleanup(() => {
      loginOpen = false
      alive.value = false
      cancelAttempt()
    })
  })

  const openTelegram = () => {
    const url = parsed()?.url
    if (!url) return
    platform.openExternal(url)
  }

  const copyLink = async () => {
    const url = parsed()?.url
    if (!url) return
    const ok = await navigator.clipboard.writeText(url).then(
      () => true,
      () => false,
    )
    if (!ok) {
      showToast({ variant: "error", title: language.t("dialog.ktIdentity.copyFailed") })
      return
    }
    setState("copied", true)
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={language.t("dialog.ktIdentity.title")} description={language.t("dialog.ktIdentity.lead")} />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-5 px-6 pb-4">
          <Show when={state.creating}>
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
            {(url) => (
              <div class="flex flex-col gap-3">
                <div class="flex flex-col items-center gap-2">
                  <img
                    src={qrUrl(url())}
                    alt={language.t("dialog.ktIdentity.scanQr")}
                    width={160}
                    height={160}
                    class="rounded-md bg-white p-1.5"
                  />
                  <p class="text-center text-12-regular text-text-weak">{language.t("dialog.ktIdentity.scanQr")}</p>
                </div>
                <div class="flex gap-2">
                  <Button variant="contrast" size="large" type="button" class="flex-1" onClick={openTelegram}>
                    {parsed()?.bot
                      ? language.t("dialog.ktIdentity.openTelegram", { bot: parsed()!.bot! })
                      : language.t("dialog.ktIdentity.openTelegramFallback")}
                  </Button>
                  <Button variant="outline" size="large" type="button" onClick={() => void copyLink()}>
                    {state.copied ? language.t("dialog.ktIdentity.copied") : language.t("dialog.ktIdentity.copyLink")}
                  </Button>
                </div>
                <p class="text-12-regular text-text-weak">{language.t("dialog.ktIdentity.noTelegram")}</p>
              </div>
            )}
          </Show>
          <Show when={!state.creating && !state.error && parsed()?.url}>
            <div class="flex items-center gap-3 text-14-regular text-text-base">
              <Spinner />
              <span>{language.t("dialog.ktIdentity.waiting")}</span>
            </div>
          </Show>
          <Show when={state.error}>
            <div class="flex flex-col gap-3">
              <p class="text-14-regular text-text-base">{state.error}</p>
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

export function openKtIdentityLogin(input: {
  dialog: ReturnType<typeof useDialog>
  onClose?: () => void
  /** push 把登录框叠在当前弹窗（如模型管理）之上，关闭后回到原弹窗；默认 show 替换整个弹窗栈。 */
  push?: boolean
}) {
  if (loginOpen) return
  const open = input.push ? input.dialog.push.bind(input.dialog) : input.dialog.show.bind(input.dialog)
  void open(
    () => <DialogKtIdentityLogin onClose={input.onClose} />,
    () => input.onClose?.(),
  )
}
