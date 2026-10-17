import { expect, test } from "bun:test"
import { parseDesktopLogin, receiveDesktopLogin, registerDesktopLoginHandler } from "./desktop-login"

test("native Desktop handoffs accept only fixed loopback rendezvous parameters and consume auth links", async () => {
  const request = "a".repeat(64)
  for (const [url, accepted] of [
    [`ktai://desktop-login?port=12345&request=${request}`, true],
    [`ktai://desktop-login?port=0&request=${request}`, false],
    [`ktai://desktop-login?port=65536&request=${request}`, false],
    ["ktai://desktop-login?port=12345&request=short", false],
    [`https://desktop-login?port=12345&request=${request}`, false],
    [`ktai://desktop-login?port=12345&request=${request}#secret`, false],
  ] as const)
    expect(!!parseDesktopLogin(url)).toBe(accepted)
  const received: unknown[] = []
  registerDesktopLoginHandler(async (value) => {
    received.push(value)
  })
  expect(receiveDesktopLogin(`ktai://desktop-login?port=12345&request=${request}`)).toBe(true)
  expect(receiveDesktopLogin(`ktai://desktop-login?port=12345&request=${request}`)).toBe(true)
  expect(receiveDesktopLogin("ktai://desktop-login?port=invalid")).toBe(true)
  expect(receiveDesktopLogin("ktai://open-project?directory=/tmp")).toBe(false)
  expect(received).toEqual([{ port: 12345, request }])
})
