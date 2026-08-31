import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { Spinner } from "@opencode-ai/ui/spinner"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { isKtpayPaid, readKtpayStatus } from "./dialog-kt-wallet-status"
import { showToast } from "@/utils/toast"

export type DepositAddress = {
  chain: string
  asset: string
  address: string
}

type WalletTab = "fiat" | "crypto"
type CryptoNetwork = "tron" | "ethereum"

const CRYPTO_NETWORKS: { id: CryptoNetwork; label: "dialog.ktWallet.networkTrc20" | "dialog.ktWallet.networkErc20" }[] = [
  { id: "tron", label: "dialog.ktWallet.networkTrc20" },
  { id: "ethereum", label: "dialog.ktWallet.networkErc20" },
]

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
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(address)}`
}

function acceptedAssets(network: CryptoNetwork) {
  return network === "ethereum" ? ["USDT", "USDC"] : ["USDT"]
}

function addressLooksLikeNetwork(network: CryptoNetwork, address: string) {
  if (network === "ethereum") return address.toLowerCase().startsWith("0x")
  return address.startsWith("T")
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
  const [network, setNetwork] = createSignal<CryptoNetwork>("tron")
  const [copied, setCopied] = createSignal(false)
  const [amount, setAmount] = createSignal(10)
  const [custom, setCustom] = createSignal("")
  const [paying, setPaying] = createSignal<string>()
  const [order, setOrder] = createSignal<KtpayOrder>()
  const [payError, setPayError] = createSignal<string>()
  const [paid, setPaid] = createSignal(false)
  const [checking, setChecking] = createSignal(false)

  const request = (path: string, init?: RequestInit) => {
    const sdk = serverSDK
    const headers = new Headers(init?.headers)
    headers.set("accept", "application/json")
    if (sdk.server.http.username && sdk.server.http.password) {
      headers.set("authorization", `Basic ${btoa(`${sdk.server.http.username}:${sdk.server.http.password}`)}`)
    }
    return (platform.fetch ?? fetch)(`${sdk.url.replace(/\/+$/, "")}${path}`, { ...init, headers })
  }

  const [info, setInfo] = createSignal<KtpayInfo>()
  const [infoError, setInfoError] = createSignal<Error>()
  const [infoLoading, setInfoLoading] = createSignal(true)
  const [address, setAddress] = createSignal<DepositAddress>()
  const [addressError, setAddressError] = createSignal<Error>()
  const [addressLoading, setAddressLoading] = createSignal(false)

  onMount(() => {
    void request("/ktai/wallet/ktpay/info")
      .then(async (response) => {
        const payload = (await response.json().catch(() => undefined)) as (KtpayInfo & { error?: string }) | undefined
        if (!response.ok) throw new Error(payload?.error || language.t("dialog.ktWallet.fiatError"))
        setInfo(payload)
      })
      .catch((error) => {
        setInfoError(error instanceof Error ? error : new Error(language.t("dialog.ktWallet.fiatError")))
      })
      .finally(() => setInfoLoading(false))
  })

  createEffect(() => {
    const selected = tab() === "crypto" ? network() : undefined
    if (!selected) {
      setAddress()
      setAddressError()
      setAddressLoading(false)
      return
    }
    setAddressLoading(true)
    setAddressError()
    let cancelled = false
    void request(`/ktai/wallet/deposit-address?${new URLSearchParams({ chain: selected, asset: "USDT" })}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => undefined)) as
          | (DepositAddress & { error?: string; message?: string })
          | undefined
        if (!response.ok) {
          const message = payload?.error || payload?.message || ""
          if (message.includes("does not match the requested network")) {
            throw new Error(language.t("dialog.ktWallet.networkMismatch"))
          }
          if (message.includes("429") || /rate limit/i.test(message)) {
            throw new Error(language.t("dialog.ktWallet.rateLimited"))
          }
          throw new Error(message || language.t("dialog.ktWallet.error"))
        }
        if (!payload?.address) throw new Error(payload?.error || language.t("dialog.ktWallet.error"))
        if (!addressLooksLikeNetwork(selected, payload.address)) {
          throw new Error(language.t("dialog.ktWallet.networkMismatch"))
        }
        if (!cancelled) setAddress(payload)
      })
      .catch((error) => {
        if (cancelled) return
        setAddress()
        setAddressError(error instanceof Error ? error : new Error(language.t("dialog.ktWallet.error")))
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false)
      })
    onCleanup(() => {
      cancelled = true
    })
  })

  const visibleAddress = createMemo(() => {
    if (addressLoading() || addressError()) return
    const row = address()
    if (!row || !addressLooksLikeNetwork(network(), row.address)) return
    return row
  })

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

  const markPaid = () => {
    if (paid()) return
    setPaid(true)
    window.dispatchEvent(new Event("kito-account-refresh"))
    showToast({
      variant: "success",
      title: language.t("dialog.ktWallet.success"),
    })
  }

  const checkOrder = (current: KtpayOrder, quiet = true) =>
    request(`/ktai/wallet/ktpay/status/${encodeURIComponent(current.orderId)}`).then(async (response) => {
      const payload = await response.json().catch(() => undefined)
      if (isKtpayPaid(payload)) {
        markPaid()
        return true
      }
      const remote = readKtpayStatus(payload)?.status.toLowerCase()
      if (response.ok && remote && TERMINAL_FAILURE.has(remote)) {
        setPayError(language.t(remote === "expired" ? "dialog.ktWallet.expired" : "dialog.ktWallet.failed"))
        setOrder(undefined)
        return false
      }
      if (!quiet) showToast({ variant: "error", title: language.t("dialog.ktWallet.confirmPaid.waiting") })
      return false
    })

  createEffect(() => {
    const current = order()
    if (!current || paid()) return
    void checkOrder(current)
    const timer = window.setInterval(() => void checkOrder(current), 2000)
    onCleanup(() => window.clearInterval(timer))
  })

  const close = () => {
    props.onClose?.()
    dialog.close()
  }

  // crypto 到账检测：轮询轻量 /ktai/wallet/crypto/status（只查 Identity ledger，不打 NewAPI，
  // 避免烧 NewAPI Ensure 限流桶）。到账（ledger 增加）→ 成功提示 + 刷新顶栏 + 关窗。
  createEffect(() => {
    if (tab() !== "crypto" || !visibleAddress() || paid() || addressError()) return
    let baseline: number | undefined
    let stopped = false
    const tick = async () => {
      if (stopped || paid() || tab() !== "crypto" || !visibleAddress()) return
      const response = await request("/ktai/wallet/crypto/status").catch(() => undefined)
      if (!response?.ok) return
      const payload = (await response.json().catch(() => undefined)) as { ledgerBalance?: number } | undefined
      const ledger = payload?.ledgerBalance
      if (typeof ledger !== "number") return
      if (baseline === undefined) {
        baseline = ledger
        return
      }
      if (ledger > baseline) {
        baseline = ledger
        markPaid()
        close()
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 3000)
    onCleanup(() => {
      stopped = true
      window.clearInterval(timer)
    })
  })

  createEffect(() => {
    network()
    setCopied(false)
  })

  const copy = async () => {
    const value = visibleAddress()?.address
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    showToast({
      variant: "success",
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
    <Dialog fit containerClass="!h-auto max-h-[min(92vh,760px)] !w-[min(calc(100vw-32px),520px)]">
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("dialog.ktWallet.title")}
          description={
            order() && !paid() ? language.t("dialog.ktWallet.waiting") : language.t("dialog.ktWallet.lead")
          }
        />
      </DialogHeader>
      <DialogBody class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex min-h-0 flex-col gap-3 px-6 pb-2">
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
          <Show when={infoLoading()}>
            <div class="flex items-center gap-3 text-14-regular text-text-base">
              <Spinner />
              <span>{language.t("dialog.ktWallet.fiatLoading")}</span>
            </div>
          </Show>
          <Show when={infoError()}>
            <p class="text-14-regular text-text-base">
              {infoError()?.message || language.t("dialog.ktWallet.fiatError")}
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
                      variant={custom().trim() ? "outline" : amount() === value ? "contrast" : "outline"}
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
                      variant="contrast"
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
            <iframe
              src={order()?.cashierUrl}
              title={language.t("dialog.ktWallet.tabFiat")}
              class="h-[min(38vh,360px)] w-full rounded-md bg-white"
              onLoad={() => {
                const current = order()
                if (current) void checkOrder(current)
              }}
            />
          </Show>
          <Show when={paid()}>
            <p class="text-14-regular text-text-strong">{language.t("dialog.ktWallet.success")}</p>
          </Show>
        </Show>

        <Show when={tab() === "crypto"}>
          <div class="flex flex-col gap-3">
            <div class="flex gap-1 rounded-lg bg-background-stronger p-1">
              <For each={CRYPTO_NETWORKS}>
                {(item) => (
                  <button
                    type="button"
                    class="flex-1 rounded-md px-3 py-1.5 text-13-regular"
                    classList={{
                      "bg-background-base text-text-strong": network() === item.id,
                      "text-text-weak": network() !== item.id,
                    }}
                    onClick={() => setNetwork(item.id)}
                  >
                    {language.t(item.label)}
                  </button>
                )}
              </For>
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <For each={acceptedAssets(network())}>
                  {(asset) => (
                    <span class="rounded-full border border-border-weak-base px-2 py-0.5 text-12-regular text-text-strong">
                      {asset}
                    </span>
                  )}
                </For>
                <span class="text-12-regular text-text-weak">
                  {language.t(network() === "ethereum" ? "dialog.ktWallet.networkEthereum" : "dialog.ktWallet.networkTron")}
                </span>
              </div>
              <Show when={network() === "ethereum"}>
                <p class="text-12-regular text-text-weak">{language.t("dialog.ktWallet.sharedAddress")}</p>
              </Show>
            </div>
          </div>
          <Show when={addressLoading()}>
            <div class="flex items-center gap-3 text-14-regular text-text-base">
              <Spinner />
              <span>{language.t("dialog.ktWallet.loading")}</span>
            </div>
          </Show>
          <Show when={addressError()}>
            <p class="text-14-regular text-text-base">
              {addressError()?.message || language.t("dialog.ktWallet.error")}
            </p>
          </Show>
          <Show when={visibleAddress()}>
            {(current) => (
              <div class="flex flex-col items-center gap-2">
                <img
                  src={qrUrl(current().address)}
                  alt=""
                  width={160}
                  height={160}
                  class="rounded-md bg-white p-1.5"
                />
                <div class="flex w-full items-start gap-2 rounded-md bg-background-stronger px-2.5 py-2">
                  <code class="min-w-0 flex-1 break-all font-mono text-[11px] leading-4 text-text-strong">
                    {current().address}
                  </code>
                  <Button
                    class="shrink-0"
                    variant="contrast"
                    size="small"
                    type="button"
                    onClick={() => void copy()}
                  >
                    {copied() ? language.t("dialog.ktWallet.copied") : language.t("dialog.ktWallet.copy")}
                  </Button>
                </div>
                <p class="w-full text-12-regular text-text-weak">
                  {network() === "ethereum"
                    ? language.t("dialog.ktWallet.hintErc20")
                    : language.t("dialog.ktWallet.hintTrc20")}
                </p>
              </div>
            )}
          </Show>
        </Show>
      </div>
      </DialogBody>
      <Show when={order() && !paid()}>
        <DialogFooter>
          <Button variant="ghost" size="large" type="button" onClick={() => setOrder(undefined)}>
            {language.t("dialog.ktWallet.back")}
          </Button>
          <Button
            variant="contrast"
            size="large"
            type="button"
            disabled={checking()}
            onClick={() => {
              const current = order()
              if (!current) return
              setChecking(true)
              void checkOrder(current, false).finally(() => setChecking(false))
            }}
          >
            {language.t("dialog.ktWallet.confirmPaid")}
          </Button>
        </DialogFooter>
      </Show>
      <Show when={paid()}>
        <DialogFooter>
          <Button variant="contrast" size="large" type="button" onClick={close}>
            {language.t("dialog.ktAccess.switch.ack")}
          </Button>
        </DialogFooter>
      </Show>
    </Dialog>
  )
}

export function openKtWallet(input: { dialog: ReturnType<typeof useDialog>; onClose?: () => void }) {
  void input.dialog.show(
    () => <DialogKtWallet onClose={input.onClose} />,
    () => input.onClose?.(),
  )
}
