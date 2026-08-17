import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"

export type DepositAddress = {
  chain: string
  asset: string
  address: string
}

type WalletTab = "fiat" | "crypto"

type KtpayInfo = {
  enabled: boolean
  methods: { name: string; type: string }[]
  minTopup: number
  maxTopup: number
  amountOptions: number[]
}

type KtpayOrder = {
  orderId: string
  cashierUrl: string
}

const DEFAULT_AMOUNTS = [10, 30, 50, 100]
const TERMINAL_FAILURE = new Set(["failed", "expired", "cancelled", "canceled"])

function qrUrl(address: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(address)}`
}

function normalizeMethod(type: string) {
  const value = type.startsWith("ktpay_") ? type.slice("ktpay_".length) : type
  if (value === "wechat" || value === "wxpay") return "wechat_pay"
  return value
}

export function DialogKtWallet(props: { onClose?: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [tab, setTab] = createSignal<WalletTab>("fiat")
  const [copied, setCopied] = createSignal(false)
  const [amount, setAmount] = createSignal(10)
  const [custom, setCustom] = createSignal("")
  const [paying, setPaying] = createSignal<string>()
  const [order, setOrder] = createSignal<KtpayOrder>()
  const [payError, setPayError] = createSignal<string>()
  const [paid, setPaid] = createSignal(false)

  const request = (path: string, init?: RequestInit) => {
    const sdk = serverSDK()
    const headers = new Headers(init?.headers)
    headers.set("accept", "application/json")
    if (sdk.server.http.username && sdk.server.http.password) {
      headers.set("authorization", `Basic ${btoa(`${sdk.server.http.username}:${sdk.server.http.password}`)}`)
    }
    return (platform.fetch ?? fetch)(`${sdk.url.replace(/\/+$/, "")}${path}`, { ...init, headers })
  }

  const [info] = createResource(async () => {
    const response = await request("/ktai/wallet/ktpay/info")
    const payload = (await response.json().catch(() => undefined)) as KtpayInfo & { error?: string } | undefined
    if (!response.ok) throw new Error(payload?.error || language.t("dialog.ktWallet.fiatError"))
    return payload
  })

  const [address] = createResource(
    () => (tab() === "crypto" ? "crypto" : undefined),
    async () => {
      const response = await request("/ktai/wallet/deposit-address")
      const payload = (await response.json().catch(() => undefined)) as DepositAddress & { error?: string } | undefined
      if (!response.ok) throw new Error(payload?.error || language.t("dialog.ktWallet.error"))
      if (!payload?.address) throw new Error(payload?.error || language.t("dialog.ktWallet.error"))
      return payload
    },
  )

  const amounts = createMemo(() => {
    const options = info()?.amountOptions?.filter((item) => Number.isFinite(item) && item > 0) ?? []
    return options.length ? options : DEFAULT_AMOUNTS
  })

  const methods = createMemo(() => {
    const rows = info()?.methods ?? []
    const normalized = rows
      .map((row) => ({ name: row.name, type: normalizeMethod(row.type) }))
      .filter((row) => row.type === "alipay" || row.type === "wechat_pay")
    if (normalized.length) return normalized
    return [
      { name: language.t("dialog.ktWallet.alipay"), type: "alipay" },
      { name: language.t("dialog.ktWallet.wechat"), type: "wechat_pay" },
    ]
  })

  const selectedAmount = createMemo(() => {
    const typed = Number(custom())
    if (custom().trim() && Number.isFinite(typed) && typed > 0) return Math.floor(typed)
    return amount()
  })

  createEffect(() => {
    const current = order()
    if (!current || paid()) return
    const timer = window.setInterval(() => {
      void request(`/ktai/wallet/ktpay/status/${encodeURIComponent(current.orderId)}`)
        .then((response) => response.json().catch(() => undefined))
        .then((payload: { localStatus?: string; status?: string } | undefined) => {
          if (payload?.localStatus === "success") {
            setPaid(true)
            window.dispatchEvent(new Event("kito-account-refresh"))
            showToast({
              variant: "success",
              icon: "circle-check",
              title: language.t("dialog.ktWallet.success"),
            })
            return
          }
          const remote = payload?.status?.toLowerCase()
          if (remote && TERMINAL_FAILURE.has(remote)) {
            setPayError(language.t(remote === "expired" ? "dialog.ktWallet.expired" : "dialog.ktWallet.failed"))
            setOrder(undefined)
          }
        })
    }, 2000)
    onCleanup(() => window.clearInterval(timer))
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

  const pay = async (method: string) => {
    setPayError()
    setPaid(false)
    setPaying(method)
    const response = await request("/ktai/wallet/ktpay/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: selectedAmount(), method }),
    })
    const payload = (await response.json().catch(() => undefined)) as (KtpayOrder & { error?: string }) | undefined
    setPaying()
    if (!response.ok || !payload?.orderId || !payload.cashierUrl) {
      setPayError(payload?.error || language.t("dialog.ktWallet.fiatError"))
      return
    }
    setOrder({ orderId: payload.orderId, cashierUrl: payload.cashierUrl })
  }

  return (
    <Dialog size="large" title={language.t("dialog.ktWallet.title")} description={language.t("dialog.ktWallet.lead")}>
      <div class="flex flex-col gap-4 px-6 pb-4">
        <div class="flex gap-1 rounded-lg bg-background-stronger p-1">
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-13-regular"
            classList={{
              "bg-background-base text-text-strong": tab() === "fiat",
              "text-text-weak": tab() !== "fiat",
            }}
            onClick={() => setTab("fiat")}
          >
            {language.t("dialog.ktWallet.tabFiat")}
          </button>
          <button
            type="button"
            class="flex-1 rounded-md px-3 py-1.5 text-13-regular"
            classList={{
              "bg-background-base text-text-strong": tab() === "crypto",
              "text-text-weak": tab() !== "crypto",
            }}
            onClick={() => setTab("crypto")}
          >
            {language.t("dialog.ktWallet.tabCrypto")}
          </button>
        </div>

        <Show when={tab() === "fiat"}>
          <Show when={info.loading}>
            <div class="flex items-center gap-3 text-14-regular text-text-base">
              <Spinner />
              <span>{language.t("dialog.ktWallet.fiatLoading")}</span>
            </div>
          </Show>
          <Show when={info.error}>
            <p class="text-14-regular text-text-base">
              {info.error instanceof Error ? info.error.message : language.t("dialog.ktWallet.fiatError")}
            </p>
          </Show>
          <Show when={info()?.enabled === false}>
            <p class="text-14-regular text-text-base">{language.t("dialog.ktWallet.fiatDisabled")}</p>
          </Show>
          <Show when={info()?.enabled && !order() && !paid()}>
            <div class="flex flex-col gap-3">
              <p class="text-12-regular text-text-weak">{language.t("dialog.ktWallet.fiatHint")}</p>
              <div class="flex flex-wrap gap-2">
                <For each={amounts()}>
                  {(value) => (
                    <Button
                      type="button"
                      size="small"
                      variant={custom().trim() ? "secondary" : amount() === value ? "primary" : "secondary"}
                      onClick={() => {
                        setCustom("")
                        setAmount(value)
                      }}
                    >
                      ${value}
                    </Button>
                  )}
                </For>
              </div>
              <input
                type="number"
                min={info()?.minTopup ?? 1}
                max={info()?.maxTopup ?? 500}
                value={custom()}
                placeholder={language.t("dialog.ktWallet.custom")}
                class="w-full rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-13-regular text-text-strong"
                onInput={(event) => setCustom(event.currentTarget.value)}
              />
              <Show when={payError()}>
                <p class="text-13-regular text-text-base">{payError()}</p>
              </Show>
              <div class="grid grid-cols-2 gap-2">
                <For each={methods()}>
                  {(method) => (
                    <Button
                      type="button"
                      variant="primary"
                      size="large"
                      disabled={Boolean(paying())}
                      onClick={() => void pay(method.type)}
                    >
                      {paying() === method.type ? language.t("dialog.ktWallet.paying") : method.name}
                    </Button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={order() && !paid()}>
            <div class="flex flex-col gap-3">
              <p class="text-13-regular text-text-weak">{language.t("dialog.ktWallet.waiting")}</p>
              <iframe
                src={order()?.cashierUrl}
                title={language.t("dialog.ktWallet.tabFiat")}
                class="h-[420px] w-full rounded-md bg-white"
              />
              <div class="flex justify-end gap-2">
                <Button variant="ghost" size="large" type="button" onClick={() => setOrder(undefined)}>
                  {language.t("dialog.ktWallet.back")}
                </Button>
                <Button
                  variant="secondary"
                  size="large"
                  type="button"
                  onClick={() => window.open(order()?.cashierUrl, "_blank", "noopener")}
                >
                  {language.t("dialog.ktWallet.openCashier")}
                </Button>
              </div>
            </div>
          </Show>
          <Show when={paid()}>
            <div class="flex flex-col gap-3">
              <p class="text-14-regular text-text-strong">{language.t("dialog.ktWallet.success")}</p>
              <div class="flex justify-end">
                <Button variant="primary" size="large" type="button" onClick={close}>
                  {language.t("dialog.ktAccess.switch.ack")}
                </Button>
              </div>
            </div>
          </Show>
        </Show>

        <Show when={tab() === "crypto"}>
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
