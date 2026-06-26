export * as MCP from "./mcp"

import { Context, Effect, Exit, Layer, Scope, Schema, Semaphore } from "effect"
import { Config } from "./config"
import { ConfigMCP } from "./config/mcp"

export const ServerConfig = ConfigMCP.Server
export type ServerConfig = typeof ServerConfig.Type

export const Timeout = Schema.Struct({
  startup: Schema.Number,
  request: Schema.Number,
}).annotate({ identifier: "MCP.Timeout" })
export type Timeout = typeof Timeout.Type

export const StatusConnected = Schema.Struct({
  status: Schema.Literal("connected"),
}).annotate({ identifier: "MCP.Status.Connected" })
export type StatusConnected = typeof StatusConnected.Type

export const StatusDisabled = Schema.Struct({
  status: Schema.Literal("disabled"),
}).annotate({ identifier: "MCP.Status.Disabled" })
export type StatusDisabled = typeof StatusDisabled.Type

export const AuthReason = Schema.Literals(["missing", "expired", "unconfigured"])
export type AuthReason = typeof AuthReason.Type

export const StatusAuth = Schema.Struct({
  status: Schema.Literal("auth"),
  reason: AuthReason,
  message: Schema.String.pipe(Schema.optional),
}).annotate({ identifier: "MCP.Status.Auth" })
export type StatusAuth = typeof StatusAuth.Type

export const StatusFailed = Schema.Struct({
  status: Schema.Literal("failed"),
  message: Schema.String,
}).annotate({ identifier: "MCP.Status.Failed" })
export type StatusFailed = typeof StatusFailed.Type

export const Status = Schema.Union([StatusConnected, StatusDisabled, StatusAuth, StatusFailed]).pipe(
  Schema.toTaggedUnion("status"),
)
export type Status = typeof Status.Type

export const Server = Schema.Struct({
  name: Schema.String,
  config: ServerConfig,
  timeout: Timeout,
  status: Status.pipe(Schema.optional),
}).annotate({ identifier: "MCP.Server" })
export type Server = typeof Server.Type

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("MCP.NotFoundError", {
  name: Schema.String,
}) {}

export class DisabledError extends Schema.TaggedErrorClass<DisabledError>()("MCP.DisabledError", {
  name: Schema.String,
}) {}

export class ConnectionError extends Schema.TaggedErrorClass<ConnectionError>()("MCP.ConnectionError", {
  name: Schema.String,
  message: Schema.String,
}) {}

export type Client = object

export interface ConnectInput {
  readonly name: string
  readonly config: ServerConfig
  readonly timeout: Timeout
}

export interface ConnectorInterface {
  /** Connects one configured server and registers all transport cleanup in the provided Scope. */
  readonly connect: (input: ConnectInput) => Effect.Effect<Client, ConnectionError, Scope.Scope>
}

export class Connector extends Context.Service<Connector, ConnectorInterface>()("@opencode/v2/MCP/Connector") {}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Server | undefined>
  readonly list: () => Effect.Effect<Server[]>
  readonly connect: (name: string) => Effect.Effect<void, NotFoundError | DisabledError | ConnectionError>
  readonly disconnect: (name: string) => Effect.Effect<void, NotFoundError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/MCP") {}

type Entry = {
  config: ServerConfig
  timeout: Timeout
  status?: Status
  scope?: Scope.Closeable
  client?: Client
}

const DEFAULT_STARTUP_TIMEOUT = 30_000
const DEFAULT_REQUEST_TIMEOUT = 300_000

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const connector = yield* Connector
    const semaphore = Semaphore.makeUnsafe(1)
    const entries = new Map<string, Entry>()
    const configured = yield* loadConfig(config)

    for (const [name, server] of configured.servers) {
      entries.set(name, {
        config: server,
        timeout: Timeout.make({
          startup: server.timeout?.startup ?? configured.timeout.startup,
          request: server.timeout?.request ?? configured.timeout.request,
        }),
        status: server.disabled ? StatusDisabled.make({ status: "disabled" }) : undefined,
      })
    }

    const close = (entry: Entry) => {
      const scope = entry.scope
      entry.scope = undefined
      entry.client = undefined
      return scope ? Scope.close(scope, Exit.void) : Effect.void
    }

    yield* Effect.addFinalizer(() =>
      Effect.forEach(entries.values(), close, { discard: true }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            entries.clear()
          }),
        ),
      ),
    )

    const project = (name: string, entry: Entry) =>
      Server.make({ name, config: entry.config, timeout: entry.timeout, status: entry.status })

    const requireEntry = (name: string) => {
      const entry = entries.get(name)
      return entry ? Effect.succeed(entry) : Effect.fail(new NotFoundError({ name }))
    }

    return Service.of({
      get: Effect.fn("MCP.get")(function* (name) {
        const entry = entries.get(name)
        return entry && project(name, entry)
      }),
      list: Effect.fn("MCP.list")(function* () {
        return Array.from(entries, ([name, entry]) => project(name, entry))
      }),
      connect: Effect.fn("MCP.connect")(function* (name) {
        const entry = yield* requireEntry(name)
        if (entry.config.disabled) return yield* new DisabledError({ name })
        yield* semaphore.withPermit(
          Effect.gen(function* () {
            yield* close(entry)
            const scope = yield* Scope.make()
            const client = yield* connector.connect({ name, config: entry.config, timeout: entry.timeout }).pipe(
              Effect.provideService(Scope.Scope, scope),
              Effect.tapError((error) =>
                Effect.sync(() => {
                  entry.status = StatusFailed.make({ status: "failed", message: error.message })
                }),
              ),
              Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
            )
            entry.scope = scope
            entry.client = client
            entry.status = StatusConnected.make({ status: "connected" })
          }),
        )
      }),
      disconnect: Effect.fn("MCP.disconnect")(function* (name) {
        const entry = yield* requireEntry(name)
        yield* semaphore.withPermit(
          close(entry).pipe(
            Effect.andThen(
              Effect.sync(() => {
                entry.status = StatusDisabled.make({ status: "disabled" })
              }),
            ),
          ),
        )
      }),
    })
  }),
)

export const unimplementedConnectorLayer = Layer.succeed(
  Connector,
  Connector.of({
    connect: (input) =>
      Effect.fail(
        new ConnectionError({
          name: input.name,
          message: "MCP connector is not implemented",
        }),
      ),
  }),
)

export const locationLayer = layer.pipe(Layer.provide(unimplementedConnectorLayer), Layer.provide(Config.locationLayer))

function loadConfig(config: Config.Interface) {
  return Effect.gen(function* () {
    const timeout = { startup: DEFAULT_STARTUP_TIMEOUT, request: DEFAULT_REQUEST_TIMEOUT }
    const servers = new Map<string, ServerConfig>()
    for (const entry of yield* config.entries()) {
      if (entry.type !== "document" || !entry.info.mcp) continue
      if (entry.info.mcp.timeout?.startup !== undefined) timeout.startup = entry.info.mcp.timeout.startup
      if (entry.info.mcp.timeout?.request !== undefined) timeout.request = entry.info.mcp.timeout.request
      for (const [name, server] of Object.entries(entry.info.mcp.servers ?? {})) servers.set(name, server)
    }
    return { timeout, servers }
  })
}
