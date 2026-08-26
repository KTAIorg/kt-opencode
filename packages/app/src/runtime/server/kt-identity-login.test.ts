import { expect, test } from "bun:test"
import { parseTelegramAuthorization } from "./kt-identity-login"

test("reads the Identity verification code and Telegram bot from authorize", () => {
  expect(
    parseTelegramAuthorization({
      url: "https://t.me/kt_official_service_bot?start=login_OPAQUE",
      instructions: "Confirm Kito login in Telegram @kt_official_service_bot. Code: 758944",
    }),
  ).toEqual({
    url: "https://t.me/kt_official_service_bot?start=login_OPAQUE",
    code: "758944",
    bot: "kt_official_service_bot",
  })
})
