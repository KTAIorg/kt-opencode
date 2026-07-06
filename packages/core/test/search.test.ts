import { beforeEach, describe, expect } from "bun:test"
import { Effect, Exit, Fiber, Layer, Scope } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Config } from "@opencode-ai/core/config"
import { ConfigSearch } from "@opencode-ai/core/config/search"
import { Credential } from "@opencode-ai/core/credential"
import { EventV2 } from "@opencode-ai/core/event"
import { Form } from "@opencode-ai/core/form"
import { Integration } from "@opencode-ai/core/integration"
import { Search } from "@opencode-ai/core/search"
import { testEffect } from "./lib/effect"

let entries: Config.Entry[] = []
const config = Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed(entries) }))
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Search.node, Integration.node, Credential.node, EventV2.node, Form.node]), [
    [Config.node, config],
  ]),
)

const register = (id: string, connection: "optional" | "required" = "optional") =>
  Effect.gen(function* () {
    const integrations = yield* Integration.Service
    const integrationID = Integration.ID.make(id)
    const calls: { input: Search.Input; credential?: Credential.Value; sessionID?: string }[] = []
    yield* integrations.transform((draft) => {
      draft.update(integrationID, (integration) => (integration.name = id.toUpperCase()))
      draft.capability.search.update({
        integrationID,
        capability: { type: "search", connection },
        execute: (input, context) =>
          Effect.sync(() => {
            calls.push({ input, ...context })
            return { text: `${id}: ${input.query}`, metadata: { id } }
          }),
      })
    })
    return { integrationID, calls }
  })

beforeEach(() => {
  entries = []
})

describe("Search", () => {
  it.effect("executes an explicit provider without changing the default", () =>
    Effect.gen(function* () {
      const provider = yield* register("exa")
      const search = yield* Search.Service
      const integrations = yield* Integration.Service

      expect(yield* search.query({ query: "effect", providerID: provider.integrationID })).toEqual(
        new Search.Result({
          providerID: provider.integrationID,
          text: "exa: effect",
          metadata: { id: "exa" },
        }),
      )
      expect(yield* integrations.capability.search.selected()).toBeUndefined()
      expect(provider.calls).toEqual([
        {
          input: { query: "effect", providerID: provider.integrationID },
          credential: undefined,
          sessionID: undefined,
        },
      ])
    }),
  )

  it.effect("uses the persisted integration capability selection", () =>
    Effect.gen(function* () {
      yield* register("exa")
      const parallel = yield* register("parallel")
      const integrations = yield* Integration.Service
      const search = yield* Search.Service
      yield* integrations.capability.search.select(parallel.integrationID)

      expect((yield* search.query({ query: "layers" })).providerID).toBe(parallel.integrationID)
      expect((yield* integrations.get(parallel.integrationID))?.capabilities).toEqual([
        { type: "search", connection: "optional", selected: true },
      ])
    }),
  )

  it.effect("prefers the location config over the global selection", () =>
    Effect.gen(function* () {
      const exa = yield* register("exa")
      const parallel = yield* register("parallel")
      const integrations = yield* Integration.Service
      const search = yield* Search.Service
      yield* integrations.capability.search.select(exa.integrationID)
      entries = [
        new Config.Document({
          type: "document",
          info: new Config.Info({ search: new ConfigSearch.Info({ provider: parallel.integrationID }) }),
        }),
      ]

      expect((yield* search.query({ query: "configured" })).providerID).toBe(parallel.integrationID)
    }),
  )

  it.effect("serializes concurrent first-use onboarding and persists the answer", () =>
    Effect.gen(function* () {
      const provider = yield* register("exa")
      const search = yield* Search.Service
      const forms = yield* Form.Service
      const integrations = yield* Integration.Service
      const first = yield* search.query({ query: "one", sessionID: "ses_search" }).pipe(Effect.forkChild)
      const second = yield* search.query({ query: "two", sessionID: "ses_search" }).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      const pending = yield* forms.list({ sessionID: "ses_search" })
      expect(pending).toHaveLength(1)
      const form = pending[0]
      if (!form) return yield* Effect.die("Expected an onboarding form")
      yield* forms.reply({ id: form.id, answer: { provider: provider.integrationID } })

      expect((yield* Fiber.join(first)).providerID).toBe(provider.integrationID)
      expect((yield* Fiber.join(second)).providerID).toBe(provider.integrationID)
      expect(yield* integrations.capability.search.selected()).toBe(provider.integrationID)
    }),
  )

  it.effect("requires a connection before invoking a required provider", () =>
    Effect.gen(function* () {
      const provider = yield* register("private", "required")
      const search = yield* Search.Service

      expect(
        yield* search.query({ query: "secret", providerID: provider.integrationID }).pipe(Effect.flip),
      ).toBeInstanceOf(Search.ConnectionRequiredError)
      expect(provider.calls).toEqual([])
    }),
  )

  it.effect("removes scoped provider registrations", () =>
    Effect.gen(function* () {
      const integrations = yield* Integration.Service
      const scope = yield* Scope.fork(yield* Scope.Scope)
      const provider = yield* register("temporary").pipe(Scope.provide(scope))
      expect(yield* integrations.capability.search.get(provider.integrationID)).toBeDefined()
      yield* Scope.close(scope, Exit.void)
      expect(yield* integrations.capability.search.get(provider.integrationID)).toBeUndefined()
    }),
  )
})
