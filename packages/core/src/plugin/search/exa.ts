export * as SearchExa from "./exa"

import { define } from "@opencode-ai/plugin/v2/effect"
import { Effect, Schema, Scope } from "effect"
import { HttpClient } from "effect/unstable/http"
import { SearchMcp } from "./mcp"

export const endpoint = "https://mcp.exa.ai/mcp"

const Args = Schema.Struct({
  query: Schema.String,
  type: Schema.String,
  numResults: Schema.Number,
  livecrawl: Schema.String,
  contextMaxCharacters: Schema.optional(Schema.Number),
})

const url = (apiKey: string | undefined) => {
  if (!apiKey) return endpoint
  const value = new URL(endpoint)
  value.searchParams.set("exaApiKey", apiKey)
  return value.toString()
}

export const Plugin = define<HttpClient.HttpClient | Scope.Scope>({
  id: "opencode.search.exa",
  effect: Effect.fn("SearchExa.Plugin")(function* (ctx) {
    const http = yield* HttpClient.HttpClient
    yield* ctx.integration.transform((draft) => {
      draft.update("exa", (integration) => (integration.name = "Exa"))
      draft.method.update({ integrationID: "exa", method: { type: "key", label: "API key (optional)" } })
      draft.method.update({ integrationID: "exa", method: { type: "env", names: ["EXA_API_KEY"] } })
      draft.capability.search.update({
        integrationID: "exa",
        capability: { type: "search", connection: "optional" },
        execute: (input, context) =>
          SearchMcp.call(
            http,
            url(context.credential?.type === "key" ? context.credential.key : undefined),
            "web_search_exa",
            Args,
            {
              query: input.query,
              type: input.type ?? "auto",
              numResults: input.numResults ?? 8,
              livecrawl: input.livecrawl ?? "fallback",
              contextMaxCharacters: input.contextMaxCharacters,
            },
          ).pipe(Effect.map((text) => ({ text: text ?? "" }))),
      })
    })
  }),
})
