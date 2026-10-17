import { expect } from "bun:test"
import { Effect } from "effect"
import { it } from "../../core/test/lib/effect"
import { ServerFetch } from "../src/fetch"

it.live("Desktop handoff uses the existing authenticated sidecar and validates its JSON contract", () =>
  Effect.gen(function* () {
    const handler = yield* ServerFetch.make({
      password: "synthetic-sidecar-password",
      app: { version: "test" },
      database: { path: ":memory:" },
      config: { project: false },
      models: { fetch: false },
      fs: { filewatcher: false },
    })
    const request = (authorized: boolean) =>
      new Request("http://opencode.local/ktai/desktop-login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authorized ? { authorization: `Basic ${btoa("opencode:synthetic-sidecar-password")}` } : {}),
        },
        body: JSON.stringify({ port: "invalid", request: "fixture" }),
      })
    const denied = yield* Effect.promise(() => handler(request(false)))
    expect(denied.status).toBe(401)
    const invalid = yield* Effect.promise(() => handler(request(true)))
    expect(invalid.status).toBe(400)
    expect(yield* Effect.promise(() => invalid.text())).not.toContain("synthetic-sidecar-password")
  }),
)
