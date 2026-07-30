import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { Persist, persisted } from "@/utils/persist"
import { SessionStatus } from "@opencode-ai/sdk/v2"
import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useSessionLayout } from "./session-layout"
import { useDialog } from "@opencode-ai/ui/context"
import { DialogUsageExceeded } from "@/components/dialog-usage-exceeded"
import { DialogKtAccessGuide } from "@/components/dialog-kt-access-guide"
import { useI18n } from "@opencode-ai/ui/context"

const KT_AUTH_BILLING_LAST_SEEN_AT = "kt_auth_billing_last_seen_at"
const KT_AUTH_BILLING_DONT_SHOW = "kt_auth_billing_dont_show"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT = "go_upsell_account_rate_limit_last_seen_at"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW = "go_upsell_account_rate_limit_dont_show"
/** Kept for migrate/read of older free-tier persist keys (no longer written). */
const KT_TOPUP_FREE_TIER_LAST_SEEN_AT = "kt_topup_last_seen_at"
const KT_TOPUP_FREE_TIER_DONT_SHOW = "kt_topup_dont_show"
const UPSELL_WINDOW = 86_400_000 // 24 hrs
/** Providers that should surface KT wallet / register CTA. */
const KT_CTA_PROVIDERS = new Set(["opencode", "opencode-go", "ktai", "ktapi"])

/**
 * In-memory episode dedupe for soft-quota / free-tier dialogs.
 * Persist 24h snooze was blocking re-tests and “send again” after dismiss;
 * each soft-quota block gets a fresh `status.next`, so a new episode re-opens the guide.
 */
const freeTierShownEpisodes = new Set<string>()

function freeTierEpisodeKey(sessionID: string, status: Extract<SessionStatus, { type: "retry" }>) {
  return `${sessionID}:free_tier_limit:${status.next}:${status.attempt}`
}

function isKtCtaProvider(provider: string) {
  return KT_CTA_PROVIDERS.has(provider) || provider.startsWith("ktai") || provider.startsWith("ktapi")
}

type UpsellKind = "free_tier_limit" | "auth_billing" | "account_rate_limit"
type UpsellStoreKey =
  | typeof KT_AUTH_BILLING_LAST_SEEN_AT
  | typeof KT_AUTH_BILLING_DONT_SHOW
  | typeof GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT
  | typeof GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW

function upsellKeys(status: SessionStatus):
  | { lastSeenAt: UpsellStoreKey; dontShow: UpsellStoreKey; kind: UpsellKind }
  | { kind: "free_tier_limit" }
  | undefined {
  if (status.type !== "retry" || !status.action) return
  const { action } = status
  if (!isKtCtaProvider(action.provider) && action.reason !== "account_rate_limit") return
  if (action.reason === "free_tier_limit") {
    return { kind: "free_tier_limit" }
  }
  if (action.reason === "auth_billing") {
    return {
      lastSeenAt: KT_AUTH_BILLING_LAST_SEEN_AT,
      dontShow: KT_AUTH_BILLING_DONT_SHOW,
      kind: "auth_billing",
    }
  }
  if (action.reason === "account_rate_limit") {
    return {
      lastSeenAt: GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT,
      dontShow: GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW,
      kind: "account_rate_limit",
    }
  }
}

export function useUsageExceededDialogs() {
  const sdk = useSDK()
  const sync = useSync()
  const dialog = useDialog()
  const { params } = useSessionLayout()
  const { t, locale } = useI18n()
  const isEnglish = () => locale() === "en"

  const [upsellState, setUpsellState] = persisted(
    Persist.global("kt-topup-upsell"),
    createStore({
      // Legacy free-tier keys retained so older profiles don't throw on hydrate.
      [KT_TOPUP_FREE_TIER_LAST_SEEN_AT]: null as null | number,
      [KT_TOPUP_FREE_TIER_DONT_SHOW]: null as null | number,
      [KT_AUTH_BILLING_LAST_SEEN_AT]: null as null | number,
      [KT_AUTH_BILLING_DONT_SHOW]: null as null | number,
      [GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT]: null as null | number,
      [GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW]: null as null | number,
    }),
  )

  const maybeShow = (sessionID: string | undefined, status: SessionStatus | undefined) => {
    if (!sessionID || !status) return
    if (status.type !== "retry") return
    const { action } = status
    if (!action) return
    if (dialog.active) return

    const keys = upsellKeys(status)
    if (!keys) return

    if (keys.kind === "free_tier_limit") {
      const episode = freeTierEpisodeKey(sessionID, status)
      if (freeTierShownEpisodes.has(episode)) return
      freeTierShownEpisodes.add(episode)
      void dialog.show(
        () => <DialogKtAccessGuide kind="billing" />,
        undefined,
      )
      return
    }

    const seen = upsellState[keys.lastSeenAt]
    if (seen && Date.now() - seen < UPSELL_WINDOW) return
    if (upsellState[keys.dontShow]) return

    const onClose = (dontShowAgain?: boolean) => {
      setUpsellState(keys.lastSeenAt, Date.now())
      if (dontShowAgain) {
        setUpsellState(keys.dontShow, Date.now())
      }
    }

    // Pass show(onClose) so X / overlay / Escape also snooze (fixes reopen loops).
    if (keys.kind === "auth_billing") {
      void dialog.show(
        () => <DialogKtAccessGuide kind="auth" onClose={onClose} />,
        () => onClose(false),
      )
      return
    }

    if (keys.kind === "account_rate_limit") {
      void dialog.show(
        () => (
          <DialogUsageExceeded
            title={isEnglish() ? action.title : t("dialog.usageExceeded.accountRateLimit.title")}
            description={isEnglish() ? action.message : t("dialog.usageExceeded.accountRateLimit.description")}
            actionLabel={isEnglish() ? action.label : t("dialog.usageExceeded.accountRateLimit.actionLabel")}
            link={action.link}
            onClose={onClose}
          />
        ),
        () => onClose(false),
      )
    }
  }

  // Live events (normal path) — includes a brief retry→idle flash for non-retryable 401s.
  onCleanup(
    sdk().event.on("session.status", (evt) => {
      if (evt.properties.sessionID !== params.id) return
      maybeShow(evt.properties.sessionID, evt.properties.status)
    }),
  )

  // Also react to store status: soft-quota can set retry before/without a UI turn,
  // and createEffect catches navigations onto an already-blocked session.
  createEffect(() => {
    const id = params.id
    if (!id) return
    maybeShow(id, sync().data.session_status[id])
  })
}
