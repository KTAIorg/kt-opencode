import { describe, expect, test } from "bun:test"
import { isKtpayPaid, readKtpayStatus } from "./dialog-kt-wallet-status"

describe("readKtpayStatus", () => {
  test("reads camelCase and snake_case", () => {
    expect(readKtpayStatus({ status: "paid", localStatus: "success", settled: true })).toEqual({
      status: "paid",
      localStatus: "success",
      settled: true,
    })
    expect(readKtpayStatus({ data: { status: "PAID", local_status: "success" } })).toEqual({
      status: "PAID",
      localStatus: "success",
      settled: false,
    })
  })
})

describe("isKtpayPaid", () => {
  test("accepts paid, success, and settled", () => {
    expect(isKtpayPaid({ status: "paid" })).toBe(true)
    expect(isKtpayPaid({ local_status: "success" })).toBe(true)
    expect(isKtpayPaid({ settled: true, status: "pending" })).toBe(true)
    expect(isKtpayPaid({ status: "TRADE_SUCCESS" })).toBe(true)
    expect(isKtpayPaid({ status: "pending" })).toBe(false)
    expect(isKtpayPaid({ message: "订单不存在或无权访问" })).toBe(false)
  })
})

