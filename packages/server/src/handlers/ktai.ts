import { fetchAccountSummary, externalIdentity, readPersistedIdentityToken, signOutIdentity } from "@opencode-ai/core/ktai/identity"
import {
  clearManagedApiKey,
  createKtpayOrder,
  fetchDepositAddress,
  fetchKtpayInfo,
  fetchKtpayStatus,
  fetchNewapiSpendable,
  readCachedSpendable,
  readManagedApiKey,
  syncManagedToken,
} from "@opencode-ai/core/ktai/newapi"
import {
  BadGatewayError,
  InvalidRequestError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

const identityToken = Effect.fn("ktai.identityToken")(function* () {
  const token = externalIdentity()?.token ?? readPersistedIdentityToken()
  if (token) return token
  return yield* new UnauthorizedError({ message: "KT Identity is unavailable" })
})

function upstream(error: unknown, fallback: string) {
  return new BadGatewayError({
    message: error instanceof Error && error.message ? error.message : fallback,
    service: "ktai",
  })
}

export const KtaiHandler = HttpApiBuilder.group(Api, "server.ktai", (handlers) =>
  handlers
    .handle("ktai.account.get", () =>
      Effect.gen(function* () {
        const token = yield* identityToken()
        const summary = yield* Effect.tryPromise({
          try: async () => {
            const current = await fetchAccountSummary(token)
            if (!(await readManagedApiKey())) await syncManagedToken(token).catch(() => undefined)
            const spendable = await fetchNewapiSpendable(token).catch(() => undefined)
            const balance = spendable ?? (await readCachedSpendable()) ?? 0
            return { ...current, balance }
          },
          catch: (error) =>
            new ServiceUnavailableError({
              message: error instanceof Error && error.message ? error.message : "KT Identity is unavailable",
              service: "ktai",
            }),
        })
        return summary
      }),
    )
    .handle("ktai.ensure", () =>
      Effect.gen(function* () {
        const token = yield* identityToken()
        const result = yield* Effect.tryPromise({
          try: () => syncManagedToken(token),
          catch: (error) => upstream(error, "NewAPI ensure failed"),
        })
        return {
          ok: true as const,
          updated: result.updated,
          created: result.created,
          keyPresent: true as const,
        }
      }),
    )
    .handle("ktai.credential.get", () =>
      Effect.gen(function* () {
        const token = externalIdentity()?.token ?? readPersistedIdentityToken()
        const key = yield* Effect.promise(() => readManagedApiKey())
        return {
          identity: Boolean(token),
          keyPresent: Boolean(key),
        }
      }),
    )
    .handle("ktai.logout", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => signOutIdentity())
        yield* Effect.promise(() => clearManagedApiKey())
        return { ok: true as const }
      }),
    )
    .handle("ktai.wallet.depositAddress", (ctx) =>
      Effect.gen(function* () {
        const token = yield* identityToken()
        return yield* Effect.tryPromise({
          try: () => fetchDepositAddress(token, { chain: ctx.query.chain, asset: ctx.query.asset }),
          catch: (error) => upstream(error, "Deposit address is unavailable"),
        })
      }),
    )
    .handle("ktai.wallet.ktpay.info", () =>
      Effect.gen(function* () {
        const token = yield* identityToken()
        return yield* Effect.tryPromise({
          try: () => fetchKtpayInfo(token),
          catch: (error) => upstream(error, "KTPay is unavailable"),
        })
      }),
    )
    .handle("ktai.wallet.ktpay.pay", (ctx) =>
      Effect.gen(function* () {
        const token = yield* identityToken()
        if (!Number.isFinite(ctx.payload.amount) || ctx.payload.amount <= 0 || !ctx.payload.method.trim()) {
          return yield* new InvalidRequestError({
            message: "amount and method are required",
            kind: "ktai_ktpay_pay",
          })
        }
        return yield* Effect.tryPromise({
          try: () => createKtpayOrder(token, { amount: ctx.payload.amount, method: ctx.payload.method.trim() }),
          catch: (error) => upstream(error, "KTPay order failed"),
        })
      }),
    )
    .handle("ktai.wallet.ktpay.status", (ctx) =>
      Effect.gen(function* () {
        const token = yield* identityToken()
        if (!ctx.params.order_id) {
          return yield* new InvalidRequestError({
            message: "order_id is required",
            kind: "ktai_ktpay_status",
          })
        }
        return yield* Effect.tryPromise({
          try: () => fetchKtpayStatus(token, ctx.params.order_id),
          catch: (error) => upstream(error, "KTPay status failed"),
        })
      }),
    ),
)
