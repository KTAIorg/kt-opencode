import { expect } from "bun:test"
import { Effect, Fiber, Stream } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { KV } from "@opencode-ai/core/kv"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Bus } from "@opencode-ai/core/bus"
import { WellKnown } from "@opencode-ai/core/wellknown"
import { testEffect } from "./lib/effect"

const it = testEffect(FetchHttpClient.layer)
const serviceIt = testEffect(LayerNode.compile(LayerNode.group([WellKnown.node, KV.node, Bus.node])))

it.live("loads embedded and remote configuration", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch(request) {
          const url = new URL(request.url)
          if (url.pathname === "/.well-known/opencode") {
            return Response.json({
              auth: { command: ["login"], env: "TOKEN" },
              config: { model: "embedded/model" },
              remote_config: {
                url: `${url.origin}/config/{env:TOKEN}`,
                headers: { authorization: "Bearer {env:TOKEN}" },
              },
            })
          }
          if (url.pathname === "/config/secret" && request.headers.get("authorization") === "Bearer secret") {
            return Response.json({ config: { model: "remote/model" } })
          }
          return new Response("Not found", { status: 404 })
        },
      }),
    ),
    (server) =>
      Effect.gen(function* () {
        const origin = server.url.origin
        expect(yield* WellKnown.inspect(`${origin}/`)).toEqual({
          auth: { command: ["login"], env: "TOKEN" },
          config: { model: "embedded/model" },
          remote_config: {
            url: `${origin}/config/{env:TOKEN}`,
            headers: { authorization: "Bearer {env:TOKEN}" },
          },
        })
        expect(yield* WellKnown.resolve({ origin, variables: { TOKEN: "secret" } })).toEqual([
          { model: "embedded/model" },
          { model: "remote/model" },
        ])
      }),
    (server) => Effect.promise(() => server.stop(true)),
  ),
)

it.live("restricts remote config env fallback to a non-sensitive allowlist", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = {
        host: process.env.KITO_WELLKNOWN_TEST_HOST,
        token: process.env.KITO_WELLKNOWN_TEST_TOKEN,
        other: process.env.WELLKNOWN_TEST_OTHER,
      }
      process.env.KITO_WELLKNOWN_TEST_HOST = "safe-value"
      process.env.KITO_WELLKNOWN_TEST_TOKEN = "top-secret"
      process.env.WELLKNOWN_TEST_OTHER = "other-value"
      const server = Bun.serve({
        port: 0,
        fetch(request) {
          const url = new URL(request.url)
          if (url.pathname === "/.well-known/opencode") {
            return Response.json({
              remote_config: {
                url: `${url.origin}/config/{env:KITO_WELLKNOWN_TEST_HOST}`,
                headers: {
                  "x-token": "{env:KITO_WELLKNOWN_TEST_TOKEN}",
                  "x-other": "{env:WELLKNOWN_TEST_OTHER}",
                  "x-home": "{env:HOME}",
                },
              },
            })
          }
          if (url.pathname === "/config/safe-value") {
            return Response.json({
              token: request.headers.get("x-token"),
              other: request.headers.get("x-other"),
              home: request.headers.get("x-home"),
            })
          }
          return new Response("Not found", { status: 404 })
        },
      })
      const restore = () => {
        if (previous.host === undefined) delete process.env.KITO_WELLKNOWN_TEST_HOST
        else process.env.KITO_WELLKNOWN_TEST_HOST = previous.host
        if (previous.token === undefined) delete process.env.KITO_WELLKNOWN_TEST_TOKEN
        else process.env.KITO_WELLKNOWN_TEST_TOKEN = previous.token
        if (previous.other === undefined) delete process.env.WELLKNOWN_TEST_OTHER
        else process.env.WELLKNOWN_TEST_OTHER = previous.other
      }
      return { server, restore }
    }),
    ({ server }) =>
      Effect.gen(function* () {
        const configs = yield* WellKnown.resolve({ origin: server.url.origin, variables: {} })
        // Non-credential KITO_* and allowlisted names resolve; credential-shaped
        // and arbitrary names resolve empty.
        expect(configs).toEqual([{ token: "", other: "", home: process.env.HOME ?? null }])
      }),
    ({ server, restore }) =>
      Effect.promise(() => {
        restore()
        return server.stop(true)
      }),
  ),
)

it.live("honors caller-supplied variables for sensitive names", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch(request) {
          const url = new URL(request.url)
          if (url.pathname === "/.well-known/opencode") {
            return Response.json({
              remote_config: {
                url: `${url.origin}/config`,
                headers: { "x-key": "{env:WELLKNOWN_TEST_SECRET_KEY}" },
              },
            })
          }
          if (url.pathname === "/config") {
            return Response.json({ key: request.headers.get("x-key") })
          }
          return new Response("Not found", { status: 404 })
        },
      }),
    ),
    (server) =>
      Effect.gen(function* () {
        const configs = yield* WellKnown.resolve({
          origin: server.url.origin,
          variables: { WELLKNOWN_TEST_SECRET_KEY: "explicit-value" },
        })
        expect(configs).toEqual([{ key: "explicit-value" }])
      }),
    (server) => Effect.promise(() => server.stop(true)),
  ),
)

serviceIt.live("persists sources in one KV value", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: () => Response.json({ auth: { command: ["login"], env: "TOKEN" } }),
      }),
    ),
    (server) =>
      Effect.gen(function* () {
        const wellknown = yield* WellKnown.Service
        const kv = yield* KV.Service
        const bus = yield* Bus.Service
        const changed = yield* bus
          .subscribe(WellKnown.Event.Updated)
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped({ startImmediately: true }))
        const entry = yield* wellknown.add(`${server.url.origin}/`)

        expect(entry.origin).toBe(server.url.origin)
        expect(yield* kv.get("wellknown:sources")).toEqual([server.url.origin])
        expect(yield* wellknown.entries()).toEqual([entry])
        expect(yield* Fiber.join(changed)).toHaveLength(1)

        yield* wellknown.remove(server.url.origin)
        expect(yield* kv.get("wellknown:sources")).toEqual([])
        expect(yield* wellknown.entries()).toEqual([])
      }),
    (server) => Effect.promise(() => server.stop(true)),
  ),
)

serviceIt.live("refreshes changed manifests", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      let command = "first"
      return {
        server: Bun.serve({
          port: 0,
          fetch: () => Response.json({ auth: { command: [command], env: "TOKEN" } }),
        }),
        update: () => {
          command = "second"
        },
      }
    }),
    ({ server, update }) =>
      Effect.gen(function* () {
        const wellknown = yield* WellKnown.Service
        const bus = yield* Bus.Service
        yield* wellknown.add(server.url.origin)
        expect(yield* wellknown.refresh()).toBe(false)

        const changed = yield* bus
          .subscribe(WellKnown.Event.Updated)
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped({ startImmediately: true }))
        update()
        expect(yield* wellknown.refresh()).toBe(true)
        expect(yield* Fiber.join(changed)).toHaveLength(1)
        expect(wellknown.snapshot()[0]?.manifest.auth?.command).toEqual(["second"])
      }),
    ({ server }) => Effect.promise(() => server.stop(true)),
  ),
)
