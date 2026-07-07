export * as ServerProcess from "./process"

import { NodeHttpClient, NodeHttpServer } from "@effect/platform-node"
import { Credential } from "@opencode-ai/core/credential"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionSaved } from "@opencode-ai/core/permission/saved"
import { Project } from "@opencode-ai/core/project"
import { HealthGroup } from "@opencode-ai/protocol/groups/health"
import { Context, Effect, Layer, Option } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiClient } from "effect/unstable/httpapi"
import { createServer, type Server } from "node:http"
import { ServerAuth } from "./auth"
import { createRoutes } from "./routes"

export type Options = {
  readonly hostname: string
  readonly port: Option.Option<number>
  readonly password: string
  readonly replacements?: (server: Server) => LayerNode.Replacements
}

const ReadinessApi = HttpApi.make("readiness").add(HealthGroup)

export const start = Effect.fn("ServerProcess.start")(function* (options: Options) {
  if (!options.password) return yield* Effect.fail(new Error("Missing server password"))
  const address = yield* listen(options)
  yield* Effect.gen(function* () {
    const client = yield* HttpApiClient.make(ReadinessApi, {
      baseUrl: HttpServer.formatAddress(address),
      transformClient: HttpClient.mapRequest((request) =>
        HttpClientRequest.setHeader(
          request,
          "authorization",
          ServerAuth.header({ username: "opencode", password: options.password }) ?? "",
        ),
      ),
    })
    yield* client["server.health"]["health.get"]({})
  }).pipe(Effect.provide(NodeHttpClient.layerNodeHttp))
  return address
})

function listen(options: Options) {
  if (Option.isSome(options.port)) return bind(options, options.port.value)
  const next = (port: number): ReturnType<typeof bind> =>
    bind(options, port).pipe(
      Effect.catch((error) => (port === 65_535 ? Effect.fail(error) : next(port + 1))),
    )
  return next(4096)
}

function bind(options: Options, port: number) {
  const server = createServer()
  return Layer.build(
    HttpRouter.serve(createRoutes(options.password, options.replacements?.(server)), {
      disableListenLog: true,
    }).pipe(
      Layer.provideMerge(NodeHttpServer.layer(() => server, { port, host: options.hostname })),
      Layer.provide(AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node, Project.node]))),
    ),
  ).pipe(
    Effect.tap(() => Effect.addFinalizer(() => Effect.sync(() => server.closeAllConnections()))),
    Effect.map((context) => Context.get(context, HttpServer.HttpServer).address),
  )
}
