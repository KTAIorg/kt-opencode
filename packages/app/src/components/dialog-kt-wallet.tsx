import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Show, createResource, createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"

export type DepositAddress = {
  chain: string
  asset: string
  address: string
}

function qrUrl(address: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(address)}`
}

export function DialogKtWallet(props: { onClose?: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [copied, setCopied] = createSignal(false)
  const [address] = createResource(async () => {
    const sdk = serverSDK()
    const response = await (platform.fetch ?? fetch)(
      `${sdk.url.replace(/\/+$/, "")}/ktai/wallet/deposit-address`,
      {
        headers:
          sdk.server.http.username && sdk.server.http.password
            ? { authorization: `Basic ${btoa(`${sdk.server.http.username}:${sdk.server.http.password}`)}` }
            : undefined,
      },
    )
    const payload = (await response.json().catch(() => undefined)) as DepositAddress & { error?: string }
    if (!response.ok) throw new Error(payload?.error || language.t("dialog.ktWallet.error"))
    if (!payload.address) throw new Error(language.t("dialog.ktWallet.error"))
    return payload
  })

  const close = () => {
    props.onClose?.()
    dialog.close()
  }

  const copy = async () => {
    const value = address()?.address
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("dialog.ktWallet.copied"),
    })
  }

  return (
    <Dialog fit title={language.t("dialog.ktWallet.title")} description={language.t("dialog.ktWallet.lead")}>
      <div class="flex flex-col gap-4 px-6 pb-4">
        <Show when={address.loading}>
          <div class="flex items-center gap-3 text-14-regular text-text-base">
            <Spinner />
            <span>{language.t("dialog.ktWallet.loading")}</span>
          </div>
        </Show>
        <Show when={address.error}>
          <p class="text-14-regular text-text-base">
            {address.error instanceof Error ? address.error.message : language.t("dialog.ktWallet.error")}
          </p>
        </Show>
        <Show when={address()}>
          {(current) => (
            <div class="flex flex-col items-center gap-3">
              <img
                src={qrUrl(current().address)}
                alt={current().address}
                width={220}
                height={220}
                class="rounded-md bg-white p-2"
              />
              <div class="text-12-regular text-text-weak">
                {current().chain.toUpperCase()} · {current().asset}
              </div>
              <div class="w-full break-all font-mono text-13-regular text-text-strong">{current().address}</div>
              <p class="text-12-regular text-text-weak">{language.t("dialog.ktWallet.hint")}</p>
              <div class="flex w-full justify-end gap-2">
                <Button variant="ghost" size="large" type="button" onClick={close}>
                  {language.t("dialog.ktAccess.snooze")}
                </Button>
                <Button variant="primary" size="large" type="button" onClick={() => void copy()}>
                  {copied() ? language.t("dialog.ktWallet.copied") : language.t("dialog.ktWallet.copy")}
                </Button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </Dialog>
  )
}

export function openKtWallet(input: { dialog: ReturnType<typeof useDialog>; onClose?: () => void }) {
  void input.dialog.show(
    () => <DialogKtWallet onClose={input.onClose} />,
    () => input.onClose?.(),
  )
}
