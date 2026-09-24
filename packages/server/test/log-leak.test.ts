import { expect } from "bun:test"
import { Effect, Logger } from "effect"
import { CurrentLogAnnotations } from "effect/References"
import { HttpServer } from "effect/unstable/http"
import { it } from "../../core/test/lib/effect"
import { ServerProcess } from "../src/process"

// The server password can ride in the URL as ?auth_token= for browser
// clients. Request logs must mask credential-looking query values while
// keeping harmless parameters for debugging.
it.live("auth_token credentials do not reach request logs", () =>
  Effect.gen(function* () {
    const entries: { message: string; annotations: Record<string, unknown> }[] = []
    const server = yield* ServerProcess.start<never, never>(
      {
        hostname: "127.0.0.1",
        port: 0,
        password: "secret",
        app: { version: "test-version" },
        database: { path: ":memory:" },
      },
    ).pipe(
      Effect.provideService(
        Logger.CurrentLoggers,
        new Set([
          Logger.make((entry) => {
            entries.push({
              message: JSON.stringify(entry.message),
              annotations: entry.fiber.getRef(CurrentLogAnnotations),
            })
          }),
        ]),
      ),
    )
    const base = HttpServer.formatAddress(server.address)
    const token = "c2VjcmV0"
    const res = yield* Effect.promise(() =>
      fetch(new URL(`/api/health?auth_token=${token}&password=hunter2&key=abc&project=demo`, base)).then(
        (r) => r.status,
      ),
    )
    expect(res).toBe(401)
    yield* Effect.sleep("200 millis")
    expect(entries.length).toBeGreaterThan(0)
    const rendered = entries.map((entry) => `${entry.message} ${JSON.stringify(entry.annotations)}`).join("\n")
    expect(rendered).not.toContain(token)
    expect(rendered).not.toContain("hunter2")
    expect(rendered).not.toContain("key=abc")
    expect(rendered).toContain("auth_token=REDACTED")
    expect(rendered).toContain("project=demo")
  }),
)

it.live("requests without secrets keep their query string in logs", () =>
  Effect.gen(function* () {
    const entries: { message: string; annotations: Record<string, unknown> }[] = []
    const server = yield* ServerProcess.start<never, never>(
      {
        hostname: "127.0.0.1",
        port: 0,
        password: "secret",
        app: { version: "test-version" },
        database: { path: ":memory:" },
      },
    ).pipe(
      Effect.provideService(
        Logger.CurrentLoggers,
        new Set([
          Logger.make((entry) => {
            entries.push({
              message: JSON.stringify(entry.message),
              annotations: entry.fiber.getRef(CurrentLogAnnotations),
            })
          }),
        ]),
      ),
    )
    const base = HttpServer.formatAddress(server.address)
    const res = yield* Effect.promise(() =>
      fetch(new URL("/api/health?verbose=1&stream=x", base)).then((r) => r.status),
    )
    expect(res).toBe(401)
    yield* Effect.sleep("200 millis")
    const rendered = entries.map((entry) => `${entry.message} ${JSON.stringify(entry.annotations)}`).join("\n")
    expect(rendered).toContain("verbose=1")
    expect(rendered).toContain("stream=x")
  }),
)
