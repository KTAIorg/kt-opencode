import { Effect, ManagedRuntime } from "effect"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { type InstanceContext } from "./instance-context"
import { InstanceLayer } from "./instance-layer"
import { InstanceStore, type LoadInput } from "./instance-store"

// Bridge for Promise/ALS callers that cannot yet yield InstanceStore.Service.
// Delete this module once those callers are migrated to Effect boundaries that
// provide InstanceStore directly.

const runtime = ManagedRuntime.make(InstanceLayer.layer, { memoMap })

const run = <A, E>(fn: (store: InstanceStore.Interface) => Effect.Effect<A, E>) =>
  runtime.runPromise(InstanceStore.Service.use(fn))

export const load = (input: LoadInput) => run((store) => store.load(input))
export const disposeInstance = (ctx: InstanceContext) => run((store) => store.dispose(ctx))
export const disposeAllInstances = () => run((store) => store.disposeAll())
export const reloadInstance = (input: LoadInput) => run((store) => store.reload(input))

export * as InstanceRuntime from "./instance-runtime"
