import { expect, test } from "bun:test"
import { qrUrl } from "./qr"

test("qrUrl percent-encodes the payload into the qrserver image URL", () => {
  expect(qrUrl("https://t.me/KTClientBot?start=login_abc")).toBe(
    "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https%3A%2F%2Ft.me%2FKTClientBot%3Fstart%3Dlogin_abc",
  )
})
