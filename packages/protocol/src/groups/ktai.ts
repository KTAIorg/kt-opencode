import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { BadGatewayError, InvalidRequestError, ServiceUnavailableError, UnauthorizedError } from "../errors.js"

export const KtaiAccount = Schema.Struct({
  account: Schema.Struct({
    id: Schema.String,
    accountNo: Schema.String,
    displayName: Schema.optional(Schema.String),
  }),
  balance: Schema.optional(Schema.Number),
  memberSince: Schema.optional(Schema.String),
  joinedDays: Schema.optional(Schema.Number),
}).annotate({ identifier: "KtaiAccount" })

export const KtaiEnsure = Schema.Struct({
  ok: Schema.Literal(true),
  updated: Schema.Boolean,
  created: Schema.Boolean,
  keyPresent: Schema.Literal(true),
}).annotate({ identifier: "KtaiEnsure" })

export const KtaiCredential = Schema.Struct({
  identity: Schema.Boolean,
  keyPresent: Schema.Boolean,
}).annotate({ identifier: "KtaiCredential" })

export const KtaiLogout = Schema.Struct({
  ok: Schema.Literal(true),
}).annotate({ identifier: "KtaiLogout" })

export const KtaiDepositAddress = Schema.Struct({
  chain: Schema.String,
  asset: Schema.String,
  address: Schema.String,
}).annotate({ identifier: "KtaiDepositAddress" })

export const KtaiCryptoStatus = Schema.Struct({
  ledgerBalance: Schema.Number,
}).annotate({ identifier: "KtaiCryptoStatus" })

export const KtaiKtpayInfo = Schema.Struct({
  enabled: Schema.Boolean,
  methods: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
    }),
  ),
  minTopup: Schema.Number,
  maxTopup: Schema.Number,
  amountOptions: Schema.Array(Schema.Number),
  appId: Schema.optional(Schema.String),
  defaultLang: Schema.optional(Schema.String),
  sdkUrl: Schema.optional(Schema.String),
}).annotate({ identifier: "KtaiKtpayInfo" })

export const KtaiKtpayOrder = Schema.Struct({
  orderId: Schema.String,
  cashierUrl: Schema.String,
  amount: Schema.Number,
  requested: Schema.Number,
  status: Schema.String,
}).annotate({ identifier: "KtaiKtpayOrder" })

export const KtaiKtpayStatus = Schema.Struct({
  orderId: Schema.String,
  status: Schema.String,
  localStatus: Schema.String,
  settled: Schema.Boolean,
}).annotate({ identifier: "KtaiKtpayStatus" })

const identityErrors = [UnauthorizedError, ServiceUnavailableError] as const
const walletErrors = [UnauthorizedError, ServiceUnavailableError, BadGatewayError] as const

export const KtaiGroup = HttpApiGroup.make("server.ktai")
  .add(
    HttpApiEndpoint.get("ktai.account.get", "/ktai/account", {
      success: KtaiAccount,
      error: [...identityErrors],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.account.get",
        summary: "Get Kito account",
        description: "Return the signed-in KT Identity account and the NewAPI spendable balance when it is readable.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("ktai.ensure", "/ktai/ensure", {
      success: KtaiEnsure,
      error: [...identityErrors, BadGatewayError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.ensure",
        summary: "Ensure Kito API key",
        description: "Create or refresh the managed NewAPI token named kito.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("ktai.credential.get", "/ktai/credential", {
      success: KtaiCredential,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.credential.get",
        summary: "Get Kito credential flags",
        description: "Report whether Identity and the managed API key are present.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("ktai.logout", "/ktai/logout", {
      success: KtaiLogout,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.logout",
        summary: "Sign out of Kito",
        description: "Revoke the current KT Identity session and clear the local Kito key.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("ktai.wallet.depositAddress", "/ktai/wallet/deposit-address", {
      query: Schema.Struct({
        chain: Schema.optional(Schema.String),
        asset: Schema.optional(Schema.String),
      }),
      success: KtaiDepositAddress,
      error: [...walletErrors],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.wallet.depositAddress",
        summary: "Get deposit address",
        description: "Return a per-account deposit address for the requested chain.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("ktai.wallet.cryptoStatus", "/ktai/wallet/crypto/status", {
      success: KtaiCryptoStatus,
      error: [...walletErrors],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.wallet.cryptoStatus",
        summary: "Get crypto recharge status",
        description: "Return the Identity ledger balance used to detect an on-chain deposit.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("ktai.wallet.ktpay.info", "/ktai/wallet/ktpay/info", {
      success: KtaiKtpayInfo,
      error: [...walletErrors],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.wallet.ktpay.info",
        summary: "Get KTPay info",
        description: "Return WeChat and Alipay cashier options.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("ktai.wallet.ktpay.pay", "/ktai/wallet/ktpay/pay", {
      payload: Schema.Struct({
        amount: Schema.Number,
        method: Schema.String,
      }),
      success: KtaiKtpayOrder,
      error: [...walletErrors, InvalidRequestError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.wallet.ktpay.pay",
        summary: "Create KTPay order",
        description: "Create a WeChat or Alipay cashier order.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("ktai.wallet.ktpay.status", "/ktai/wallet/ktpay/status/:order_id", {
      params: { order_id: Schema.String },
      success: KtaiKtpayStatus,
      error: [...walletErrors, InvalidRequestError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.ktai.wallet.ktpay.status",
        summary: "Get KTPay status",
        description: "Return the current status of a KTPay cashier order.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "ktai" }))
