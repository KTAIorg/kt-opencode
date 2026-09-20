import path from "path"
import fs from "fs"
import os from "os"
import { Context, Effect, Layer } from "effect"
// XDG on runtimes with a home directory; one tmp-rooted directory on workerd.
// The variants resolve through the `workerd` bundle condition, like the
// native-module stubs, so no runtime sniffing happens here.
import { roots } from "#global-roots"
import { Flock } from "./flock.js"
import { kitoDataEnv } from "./kito-env.js"
import { makeGlobalNode } from "./effect/app-node.js"

// Kito isolates its data, config, state, and cache directories from a co-installed
// OpenCode by rooting them under a "kito" leaf instead of sharing "opencode"
// (for example ~/.local/share/kito next to ~/.local/share/opencode). The XDG base
// directories still apply, so user-level XDG_*_HOME overrides move both trees.
const app = "kito"
const { data, cache, config, state, tmp } = roots(app)

const paths = {
  get home() {
    return kitoDataEnv("TEST_HOME") ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  // The acquired service canonicalizes default tmp; use it instead of Path.tmp for path comparisons.
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Path.config,
    state: Path.state,
    tmp: input.tmp ?? Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

const acquire = (input: Partial<Interface>) =>
  Effect.gen(function* () {
    const service = Service.of(make(input))
    yield* Effect.promise(() =>
      Promise.all(
        [service.data, service.config, service.state, service.log, service.bin, service.repos, service.tmp].map(
          (directory) => fs.promises.mkdir(directory, { recursive: true }),
        ),
      ),
    )
    // The data directory holds the session database, stored credentials, and
    // tool/shell output files; keep it private to the owning user. chmod is a
    // no-op on platforms without POSIX modes.
    yield* Effect.promise(() => fs.promises.chmod(service.data, 0o700)).pipe(Effect.catch(() => Effect.void))
    const canonicalTmp = yield* Effect.promise(() => fs.promises.realpath(service.tmp))
    return Service.of({ ...service, tmp: input.tmp ?? canonicalTmp })
  })

const layer = Layer.effect(
  Service,
  Effect.suspend(() => acquire({ config: kitoDataEnv("CONFIG_DIR") ?? Path.config })),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [] })

export const layerWith = (input: Partial<Interface>) => Layer.effect(Service, acquire(input))

export * as Global from "./global.js"
