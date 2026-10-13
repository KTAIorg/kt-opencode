import { superviseService } from "./supervision"
import { CHANNEL } from "../constants"
import { registrationFileName } from "./registration-file"
import { app, BrowserWindow } from "electron"
import { Context, Effect, FileSystem, Layer, Path } from "effect"
import { BackgroundServiceState } from "./background-service-state"
import { cleanStages } from "./cli-stages"
import { DesktopCli } from "./desktop-cli"
import { SidecarCredentials } from "./sidecar-credentials"
import { sidecarProbe } from "./sidecar-probe"

export * as BackgroundService from "./background-service"

export interface Interface {
  readonly connection: Effect.Effect<SidecarCredentials.Data>
  readonly reconnect: Effect.Effect<SidecarCredentials.Data>
}

export class Service extends Context.Service<Service, Interface>()("opencode/desktop/BackgroundService") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const context = yield* Effect.context<FileSystem.FileSystem | Path.Path | DesktopCli.Service>()

    const state = yield* BackgroundServiceState.make({
      initial: connect("initial").pipe(Effect.provide(context)),
      reconnect: connect("reconnect").pipe(Effect.provide(context), Effect.orDie),
    })
    const runPromise = Effect.runPromiseWith(context)
    yield* state.connection.pipe(
      Effect.flatMap((ready) =>
        Effect.promise((signal) =>
          superviseService(
            {
              health: async (url, password) =>
                fetch(`${url}/api/info`, {
                  headers: password
                    ? { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}` }
                    : undefined,
                  signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
                }).then(
                  (response) => response.ok,
                  () => false,
                ),
              restart: () => runPromise(state.reconnect).catch(() => undefined),
              reloadWindows: () =>
                BrowserWindow.getAllWindows().forEach((win) => {
                  if (!win.isDestroyed()) win.webContents.reload()
                }),
              log: (message, meta) => Effect.runSync(Effect.logInfo(message, meta)),
              error: (message, meta) => Effect.runSync(Effect.logError(message, meta)),
              sleep: (ms) => Effect.runPromise(Effect.sleep(ms), { signal }).catch(() => undefined),
            },
            { value: ready },
            signal,
          ),
        ),
      ),
      Effect.catchCause((cause) => Effect.logError("local service supervision stopped", { cause })),
      Effect.forkScoped,
    )
    return Service.of(state)
  }),
)

const connect = Effect.fn("BackgroundService.connect")(function* (mode: "initial" | "reconnect") {
  yield* Effect.logInfo("starting v2 background service")
  const path = yield* Path.Path
  const desktopCli = yield* DesktopCli.Service
  const runFork = Effect.runForkWith(yield* Effect.context<FileSystem.FileSystem | Path.Path>())
  const isolated = !app.isPackaged && process.env.OPENCODE_DESKTOP_ISOLATED_SERVER === "1"
  const cli = yield* desktopCli.resolve
  const version = mode === "initial" ? cli.version : undefined

  if (isolated) process.env.XDG_STATE_HOME = app.getPath("userData")
  const client = yield* Effect.promise(() => import("@opencode/client/service"))

  const ensure = () =>
    client.Service.ensure({
      file:
        isolated && process.env.OPENCODE_DESKTOP_SERVER_CHANNEL === "local"
          ? path.join(app.getPath("userData"), "kito", "service-local.json")
          : registrationFileName(CHANNEL, app.isPackaged),
      version,
      // A fixed port makes a second contender fail to bind and back off; port 0 never collides, so two
      // services could boot against the same database.
      command: [
        ...cli.command,
        "serve",
        "--service",
        ...(isolated ? ["--hostname", "0.0.0.0", "--port", String(0x0c0c)] : []),
      ],
      onStart: (reason, previousVersion) =>
        runFork(Effect.logInfo("v2 CLI background service starting", { reason, previousVersion })),
    })

  // A compatible service the entry module already found is adopted at once; ensure() still runs
  // afterwards for its side effects (terminal handoff completion), off the renderer's path.
  const early = mode === "initial" && !isolated ? yield* Effect.promise(sidecarProbe) : undefined

  if (early) yield* Effect.sync(() => void ensure().catch(() => undefined))
  const service = early ?? (yield* Effect.tryPromise(ensure))

  if (service.auth?.type !== "basic") throw new Error("V2 CLI background service did not provide authentication")
  const url = new URL(service.url)

  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1"
  yield* Effect.logInfo("v2 CLI background service ready", {
    version,
    probed: !!early,
    ...endpoint(url.origin),
  })

  // Only packaged and isolated builds run a staged copy; any other binary sits in the source tree.
  // The service now runs the current version, so an older copy at most belongs to a process still exiting.
  if (mode === "initial" && (app.isPackaged || isolated) && cli.binary)
    runFork(
      cleanStages(cli.binary).pipe(
        Effect.catch((error) => Effect.logError("failed to clean staged v2 CLIs", { error })),
      ),
    )
  const ready = { url: url.origin, password: service.auth.password } satisfies SidecarCredentials.Data
  SidecarCredentials.set(ready)

  return ready
})

function endpoint(url: string | undefined) {
  if (!url || !URL.canParse(url)) return {}
  const parsed = new URL(url)

  return { url, hostname: parsed.hostname, port: parsed.port }
}
