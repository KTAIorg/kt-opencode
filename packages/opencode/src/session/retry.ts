import type { NamedError } from "@opencode-ai/core/util/error"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"
import { iife } from "@/util/iife"
import { isRecord } from "@/util/record"

export type Err = ReturnType<NamedError["toObject"]>

/** @deprecated Prefer KT_TOPUP_* — kept as aliases for older call sites/tests. */
export const GO_UPSELL_MESSAGE = "Free usage exceeded. Top up on KT AI to continue with paid models."
export const GO_UPSELL_URL = "https://www.ktapi.cc/wallet"
export const KT_TOPUP_MESSAGE = GO_UPSELL_MESSAGE
export const KT_TOPUP_URL = GO_UPSELL_URL
/** Invalid / expired KT API key — same destination as top-up (register / wallet). */
export const KT_AUTH_MESSAGE =
  "API key is invalid or expired. Register or sign in on KT AI (ktapi.cc), create a valid key, or top up to continue."
export type RetryReason = "free_tier_limit" | "account_rate_limit" | "auth_billing" | (string & {})

export type Retryable = {
  message: string
  action?: {
    reason: RetryReason
    provider: string
    title: string
    message: string
    label: string
    link?: string
  }
}

const KT_CTA_PROVIDERS = new Set(["opencode", "opencode-go", "ktai", "ktapi"])

export function isKtCtaProvider(provider: string) {
  return KT_CTA_PROVIDERS.has(provider) || provider.startsWith("ktai") || provider.startsWith("ktapi")
}

/** Shared KT wallet CTA for Zen soft-quota + FreeUsageLimitError / balance. */
export function freeTierTopupAction(provider = "opencode"): NonNullable<Retryable["action"]> {
  return {
    reason: "free_tier_limit",
    provider,
    title: "Free limit reached",
    message:
      "Free model quota is used up. Top up on the KT AI platform to keep using paid models (KTAI / ktapi.cc).",
    label: "Top up",
    link: KT_TOPUP_URL,
  }
}

/** Invalid token / unauthorized on KT providers → register or top up. */
export function authBillingAction(provider = "ktai"): NonNullable<Retryable["action"]> {
  return {
    reason: "auth_billing",
    provider,
    title: "Sign in or top up required",
    message: KT_AUTH_MESSAGE,
    label: "Open KT AI",
    link: KT_TOPUP_URL,
  }
}

function errorText(error: Err) {
  const parts: string[] = []
  if (SessionV1.APIError.isInstance(error)) {
    parts.push(error.data.message ?? "")
    parts.push(error.data.responseBody ?? "")
    const meta = error.data.metadata
    if (meta) {
      for (const value of Object.values(meta)) {
        if (typeof value === "string") parts.push(value)
      }
    }
  } else if (isRecord(error.data) && typeof error.data.message === "string") {
    parts.push(error.data.message)
  }
  return parts.join("\n")
}

/**
 * Classify KT auth / billing failures that should guide users to ktapi.cc
 * (register, new key, or top-up) instead of dumping raw upstream text.
 */
export function classifyKtAccess(error: Err, provider: string): "auth" | "billing" | undefined {
  const text = errorText(error)
  const lower = text.toLowerCase()
  const status = SessionV1.APIError.isInstance(error) ? error.data.statusCode : undefined
  const hitsKtHost = /ktapi\.cc|www\.ktapi\.cc/i.test(text)
  if (!isKtCtaProvider(provider) && !hitsKtHost) return undefined

  if (lower.includes("freeusagelimiterror")) return "billing"
  if (
    lower.includes("insufficient") ||
    lower.includes("balance") ||
    lower.includes("quota") ||
    lower.includes("credit") ||
    lower.includes("prepayment") ||
    lower.includes("free usage exceeded") ||
    status === 402
  ) {
    return "billing"
  }

  if (
    status === 401 ||
    lower.includes("invalid token") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("token expired") ||
    lower.includes("api key is invalid")
  ) {
    return "auth"
  }

  return undefined
}

/**
 * User-facing CTA for KT auth/billing failures.
 * Separate from `retryable`: 401 must not be auto-retried, but still needs guidance.
 */
export function guidance(error: Err, provider: string): Retryable | undefined {
  if (SessionV1.APIError.isInstance(error) && error.data.responseBody?.includes("FreeUsageLimitError")) {
    return { message: KT_TOPUP_MESSAGE, action: freeTierTopupAction(provider) }
  }
  const kind = classifyKtAccess(error, provider)
  if (kind === "auth") return { message: KT_AUTH_MESSAGE, action: authBillingAction(provider) }
  if (kind === "billing") return { message: KT_TOPUP_MESSAGE, action: freeTierTopupAction(provider) }
  return undefined
}

/** Rewrite NamedError payloads so the timeline shows friendly copy, not raw upstream text. */
export function withGuidanceMessage(error: Err, message: string): Err {
  if (SessionV1.APIError.isInstance(error)) {
    return new SessionV1.APIError({
      message,
      statusCode: error.data.statusCode,
      isRetryable: false,
      responseHeaders: error.data.responseHeaders,
      responseBody: error.data.responseBody,
      metadata: error.data.metadata,
    }).toObject()
  }
  return { name: error.name || "UnknownError", data: { ...(isRecord(error.data) ? error.data : {}), message } }
}

export const RETRY_INITIAL_DELAY = 2000
export const RETRY_BACKOFF_FACTOR = 2
export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout

function cap(ms: number) {
  return Math.min(ms, RETRY_MAX_DELAY)
}

export function delay(attempt: number, error?: SessionV1.APIError) {
  if (error) {
    const headers = error.data.responseHeaders
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"]
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs)
        if (!Number.isNaN(parsedMs)) {
          return cap(parsedMs)
        }
      }

      const retryAfter = headers["retry-after"]
      if (retryAfter) {
        const parsedSeconds = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsedSeconds)) {
          // convert seconds to milliseconds
          return cap(Math.ceil(parsedSeconds * 1000))
        }
        // Try parsing as HTTP date format
        const parsed = Date.parse(retryAfter) - Date.now()
        if (!Number.isNaN(parsed) && parsed > 0) {
          return cap(Math.ceil(parsed))
        }
      }

      return cap(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1))
    }
  }

  return cap(Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS))
}

export function retryable(error: Err, provider: string) {
  // context overflow errors should not be retried
  if (SessionV1.ContextOverflowError.isInstance(error)) return undefined
  if (SessionV1.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (!error.data.isRetryable && !(status !== undefined && status >= 500)) return undefined
    if (error.data.responseBody?.includes("FreeUsageLimitError")) {
      return {
        message: KT_TOPUP_MESSAGE,
        action: freeTierTopupAction(provider),
      }
    }
    if (error.data.responseBody?.includes("GoUsageLimitError")) {
      const body = parseJSON(error.data.responseBody)
      const workspace = str(body?.metadata?.workspace)
      const limitName = str(body?.metadata?.limitName)
      const retryAfter = num(error.data.responseHeaders?.["retry-after"])
      const resetIn = iife(() => {
        if (retryAfter === undefined) return ""
        const seconds = Math.max(0, Math.ceil(retryAfter))
        const days = Math.floor(seconds / 86_400)
        const hours = Math.floor((seconds % 86_400) / 3_600)
        const minutes = Math.ceil((seconds % 3_600) / 60)
        const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? "" : "s"}`

        if (days > 0) return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day")
        if (hours > 0) return minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour")
        return minutes > 0 ? unit(minutes, "minute") : "less than a minute"
      })

      const message = `${limitName ? `${limitName} usage limit` : "Usage limit"} reached. It will reset in ${resetIn}. To continue using this model now, enable usage from your available balance`

      const link = `https://opencode.ai/workspace/${workspace}/go`
      return {
        message: `${message} - ${link}`,
        action: {
          reason: "account_rate_limit",
          provider,
          title: "Go limit reached",
          message,
          label: "open settings",
          link,
        },
      }
    }
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
  }

  // Check for rate limit patterns in plain text error messages
  const msg = isRecord(error.data) ? error.data.message : undefined
  if (typeof msg === "string") {
    const lower = msg.toLowerCase()
    if (
      lower.includes("rate increased too quickly") ||
      lower.includes("rate limit") ||
      lower.includes("too many requests")
    ) {
      return { message: msg }
    }
  }

  const json = parseJSON(msg)
  if (!json || typeof json !== "object") return undefined
  const code = typeof json.code === "string" ? json.code : ""

  if (json.type === "error" && json.error?.type === "too_many_requests") {
    return { message: "Too Many Requests" }
  }
  if (code.includes("exhausted") || code.includes("unavailable")) {
    return { message: "Provider is overloaded" }
  }
  if (json.type === "error" && typeof json.error?.code === "string" && json.error.code.includes("rate_limit")) {
    return { message: "Rate Limited" }
  }
  return undefined
}

function str(value: unknown) {
  if (value === undefined || value === null) return ""
  return String(value)
}

function num(value: unknown) {
  const parsed = Number.parseFloat(str(value))
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

function parseJSON(value: unknown) {
  return iife(() => {
    try {
      if (typeof value !== "string") return undefined
      return JSON.parse(value)
    } catch {
      return undefined
    }
  })
}

export function policy(opts: {
  provider: string
  parse: (error: unknown) => Err
  set: (input: { attempt: number; message: string; action?: Retryable["action"]; next: number }) => Effect.Effect<void>
}) {
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      const error = opts.parse(meta.input)
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)
      return Effect.gen(function* () {
        const wait = delay(meta.attempt, SessionV1.APIError.isInstance(error) ? error : undefined)
        const now = yield* Clock.currentTimeMillis
        yield* opts.set({
          attempt: meta.attempt,
          message: retry.message,
          action: retry.action,
          next: now + wait,
        })
        return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
      })
    }),
  )
}

export * as SessionRetry from "./retry"
