import { MCP } from "@opencode-ai/core/mcp/index"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { McpServerNotFoundError } from "@opencode-ai/protocol/errors"
import { response } from "../location"

export const McpHandler = HttpApiBuilder.group(Api, "server.mcp", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "mcp.list",
        Effect.fn(function* () {
          const service = yield* MCP.Service
          return yield* response(
            service
              .servers()
              .pipe(
                Effect.map((servers) =>
                  servers.map((info) => ({ name: info.name, status: info.status, integrationID: info.integrationID })),
                ),
              ),
          )
        }),
      )
      .handle(
        "mcp.resource.catalog",
        Effect.fn(function* () {
          const service = yield* MCP.Service
          return yield* response(service.resourceCatalog())
        }),
      )
      .handle(
        "mcp.resource.read",
        Effect.fn(function* (ctx) {
          const service = yield* MCP.Service
          return yield* response(
            service.readResource({ server: ctx.payload.server, uri: ctx.payload.uri }).pipe(
              Effect.map((result) => result ?? null),
              Effect.mapError((error) => new McpServerNotFoundError({ server: error.server, message: error.message })),
            ),
          )
        }),
      )
  }),
)
