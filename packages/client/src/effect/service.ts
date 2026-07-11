import { Effect, FileSystem, Option, Schedule, Schema } from "effect"
import { spawn } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

// Find, start, and stop the local opencode background service.
//
// The service daemon advertises itself through a registration file in the
// user's state directory: url, pid, version, and the private password, with
// 0600 permissions. That file is the complete discovery contract — reading it
// is all a client needs to connect. The daemon's own configuration (port,
// persisted password) is CLI-owned and never read here.

export type Endpoint = {
  readonly url: string
  readonly auth?: {
    readonly type: "basic"
    readonly username: string
    readonly password: string
  }
}

export type Options = {
  // Absolute path to the service registration file. Defaults to
  // opencode/service.json in the XDG state directory.
  readonly file?: string
  // When set, discovery only returns a server reporting this exact version,
  // and start() replaces a healthy server whose version differs.
  readonly version?: string
  // Argv used to spawn the service. Defaults to ["opencode", "serve",
  // "--service"] resolved from PATH.
  readonly command?: ReadonlyArray<string>
}

export type StartReason = "missing" | "version-mismatch"

export type StartOptions = Options & {
  readonly onStart?: (reason: StartReason) => void
}

type Registration = {
  readonly url: string
  readonly pid: number
  readonly version?: string
}

export type Status =
  | { readonly status: "stopped" }
  | { readonly status: "invalid"; readonly reason: "unreadable" | "malformed" }
  | {
      readonly status: "unhealthy"
      readonly reason: "unreachable" | "invalid-response"
      readonly registration: Registration
    }
  | {
      readonly status: "unhealthy"
      readonly reason: "http-error"
      readonly registration: Registration
      readonly statusCode: number
    }
  | { readonly status: "legacy"; readonly registration: Registration }
  | {
      readonly status: "inconsistent"
      readonly fields: readonly ["pid" | "version", ...Array<"pid" | "version">]
      readonly registration: Registration
      readonly health: { readonly pid: number; readonly version: string }
    }
  | {
      readonly status: "running"
      readonly url: string
      readonly pid: number
      readonly version: string
      readonly compatible?: boolean
    }

export const status = Effect.fn("service.status")(function* (options: Options = {}) {
  const registration = yield* inspectRegistration(options.file)
  if (registration._tag === "Missing") return { status: "stopped" } as const
  if (registration._tag === "Unreadable") return { status: "invalid", reason: "unreadable" } as const
  if (registration._tag === "Malformed") return { status: "invalid", reason: "malformed" } as const

  const info = registration.info
  const health = yield* inspectHealth(info)
  if (health._tag !== "Healthy") {
    if (health.reason === "legacy-response") {
      return { status: "legacy", registration: publicRegistration(info) } as const
    }
    if (health.reason === "http-error") {
      return {
        status: "unhealthy",
        reason: health.reason,
        registration: publicRegistration(info),
        statusCode: health.statusCode,
      } as const
    }
    return {
      status: "unhealthy",
      reason: health.reason,
      registration: publicRegistration(info),
    } as const
  }
  const fields = [
    ...(health.pid === info.pid ? [] : (["pid"] as const)),
    ...(info.version === undefined || health.version === info.version ? [] : (["version"] as const)),
  ]
  if (fields[0] !== undefined) {
    return {
      status: "inconsistent",
      fields: [fields[0], ...fields.slice(1)],
      registration: publicRegistration(info),
      health: { pid: health.pid, version: health.version },
    } as const
  }
  return {
    status: "running",
    url: info.url,
    pid: health.pid,
    version: health.version,
    ...(options.version === undefined ? {} : { compatible: health.version === options.version }),
  } satisfies Status
})

// Read-only lookup: registration file plus health check and version gate.
// Never spawns; escalation to start() is the caller's policy.
export const discover = Effect.fn("service.discover")(function* (options: Options = {}) {
  return (yield* discoverLocal(options))?.endpoint
})

const discoverLocal = Effect.fnUntraced(function* (options: Options) {
  const info = yield* read(options.file)
  if (info === undefined) return undefined
  if (options.version !== undefined && info.version !== options.version) return undefined
  return yield* probe(info, options.version)
})

// Idempotent ensure-running: reuses a healthy compatible server, replaces a
// version-mismatched one, and otherwise spawns the service command detached.
export const start = Effect.fn("service.start")(function* (options: StartOptions = {}) {
  const compatible = yield* discover(options)
  if (compatible !== undefined) return compatible
  const mismatched = yield* find(options)
  yield* Effect.sync(() => options.onStart?.(mismatched === undefined ? "missing" : "version-mismatch"))
  if (mismatched !== undefined) yield* kill(mismatched.info, options).pipe(Effect.ignore)

  const [command, ...args] = options.command ?? ["opencode", "serve", "--service"]
  if (command === undefined) return yield* Effect.fail(new Error("Missing service command"))
  const child = yield* Effect.try({
    try: () => {
      const child = spawn(command, args, { detached: true, stdio: "ignore" })
      child.unref()
      return child
    },
    catch: (cause) => new Error("Failed to start server", { cause }),
  })

  return yield* discoverLocal(options).pipe(
    Effect.flatMap((found) =>
      found === undefined ? Effect.fail(new Error("Server is not ready")) : Effect.succeed(found),
    ),
    Effect.retry(poll),
    Effect.tap((found) =>
      found.info.pid === child.pid
        ? Effect.void
        : Effect.sync(() => {
            child.kill("SIGTERM")
          }),
    ),
    Effect.map((found) => found.endpoint),
    Effect.tapError(() => Effect.try({ try: () => child.kill("SIGTERM"), catch: () => undefined }).pipe(Effect.ignore)),
    Effect.mapError(() => new Error("Failed to start server")),
  )
})

export const stop = Effect.fn("service.stop")(function* (options: Options = {}) {
  const fs = yield* FileSystem.FileSystem
  const existing = yield* find(options)
  if (existing !== undefined) yield* kill(existing.info, options)
  yield* fs.remove(options.file ?? fallback()).pipe(Effect.ignore)
})

function fallback() {
  const state = process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state")
  return join(state, "opencode", "service.json")
}

export function headers(endpoint: Endpoint): RequestInit["headers"] {
  if (endpoint.auth === undefined) return undefined
  return { authorization: "Basic " + btoa(endpoint.auth.username + ":" + endpoint.auth.password) }
}

export const Info = Schema.Struct({
  id: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  url: Schema.String,
  pid: Schema.Int.check(Schema.isGreaterThan(0)),
  password: Schema.optional(Schema.String),
})
export type Info = typeof Info.Type

const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(Info))
const decodeHealth = Schema.decodeUnknownOption(
  Schema.Struct({ healthy: Schema.Literal(true), version: Schema.String, pid: Schema.Int }),
)
const decodeLegacyHealth = Schema.decodeUnknownOption(Schema.Struct({ healthy: Schema.Literal(true) }))

const inspectRegistration = Effect.fnUntraced(function* (file?: string) {
  const fs = yield* FileSystem.FileSystem
  const text = yield* fs.readFileString(file ?? fallback()).pipe(
    Effect.map((value) => ({ _tag: "Found", value }) as const),
    Effect.catch((error) =>
      Effect.succeed(
        error.reason._tag === "NotFound" ? ({ _tag: "Missing" } as const) : ({ _tag: "Unreadable" } as const),
      ),
    ),
  )
  if (text._tag !== "Found") return text
  const info = yield* decode(text.value).pipe(Effect.option)
  if (Option.isNone(info)) return { _tag: "Malformed" } as const
  return { _tag: "Valid", info: info.value } as const
})

// Lifecycle operations intentionally treat missing and corrupt registrations
// alike; only status exposes that diagnostic distinction.
const read = Effect.fnUntraced(function* (file?: string) {
  const registration = yield* inspectRegistration(file)
  return registration._tag === "Valid" ? registration.info : undefined
})

type LocalService = {
  readonly info: Info
  readonly endpoint: Endpoint
}

const inspectHealth = Effect.fnUntraced(function* (info: Info) {
  const response = yield* Effect.tryPromise(() =>
    fetch(new URL("/api/health", info.url), {
      headers: headers(endpoint(info)),
      signal: AbortSignal.timeout(2_000),
    }),
  ).pipe(Effect.option)
  if (Option.isNone(response)) return { _tag: "Unhealthy", reason: "unreachable" } as const
  if (!response.value.ok) return { _tag: "Unhealthy", reason: "http-error", statusCode: response.value.status } as const
  const body = yield* Effect.tryPromise(() => response.value.json()).pipe(Effect.option)
  if (Option.isNone(body)) return { _tag: "Unhealthy", reason: "invalid-response" } as const
  const health = decodeHealth(body.value)
  if (Option.isSome(health)) return { _tag: "Healthy", ...health.value } as const
  if (
    Option.isSome(decodeLegacyHealth(body.value)) &&
    !(typeof body.value === "object" && body.value !== null && ("version" in body.value || "pid" in body.value))
  )
    return { _tag: "Unhealthy", reason: "legacy-response" } as const
  return { _tag: "Unhealthy", reason: "invalid-response" } as const
})

const probe = Effect.fnUntraced(function* (info: Info, version?: string, allowLegacy = false) {
  const health = yield* inspectHealth(info)
  if (health._tag === "Healthy") {
    if (health.pid !== info.pid) return undefined
    if (info.version !== undefined && health.version !== info.version) return undefined
    if (version !== undefined && health.version !== version) return undefined
    return { info, endpoint: endpoint(info) } satisfies LocalService
  }
  if (!allowLegacy || health.reason !== "legacy-response") return undefined
  return { info, endpoint: endpoint(info) } satisfies LocalService
})

function endpoint(info: Info) {
  return {
    url: info.url,
    auth:
      info.password === undefined
        ? undefined
        : { type: "basic" as const, username: "opencode", password: info.password },
  } satisfies Endpoint
}

function publicRegistration(info: Info): Registration {
  return { url: info.url, pid: info.pid, version: info.version }
}

// Health-checked lookup without the version gate: lifecycle operations must be
// able to see (and replace or stop) a server from a different version.
const find = Effect.fnUntraced(function* (options: Options) {
  const info = yield* read(options.file)
  if (info === undefined) return undefined
  return yield* probe(info, undefined, true)
})

// 50ms cadence bounded at ~5s, shared by stop escalation and start readiness.
const poll = Schedule.spaced("50 millis").pipe(Schedule.both(Schedule.recurs(100)))

const signal = (pid: number, name: NodeJS.Signals) =>
  Effect.try({ try: () => process.kill(pid, name), catch: (cause) => cause }).pipe(Effect.ignore)

const stopped = Effect.fnUntraced(function* (pid: number) {
  const running = yield* Effect.try({ try: () => process.kill(pid, 0), catch: () => false }).pipe(
    Effect.orElseSucceed(() => false),
  )
  if (!running) return true
  return yield* Effect.fail(new Error(`Server process ${pid} is still running`))
})

function same(left: Info, right: Info) {
  return left.id === right.id && left.version === right.version && left.url === right.url && left.pid === right.pid
}

const kill = Effect.fnUntraced(function* (info: Info, options: Options) {
  // A stale registration may point at a PID that has since been reused by
  // another process. Only signal the PID after authenticating the server.
  const current = yield* find(options)
  if (current === undefined || !same(current.info, info)) return

  yield* signal(info.pid, "SIGTERM")
  const done = yield* stopped(info.pid).pipe(Effect.retry(poll), Effect.option)
  if (Option.isSome(done)) return

  const latest = yield* find(options)
  if (latest === undefined || !same(latest.info, info)) return
  yield* signal(info.pid, "SIGKILL")
  yield* stopped(info.pid).pipe(Effect.retry(poll))
})

export * as Service from "./service.js"
