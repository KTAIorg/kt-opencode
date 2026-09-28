import type { ServerReadyData } from "../../shared/ipc-contract"

export type ServiceSupervision = {
  health(url: string, password: string | null): Promise<boolean>
  restart(): Promise<ServerReadyData | undefined>
  reloadWindows(): void
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  sleep(ms: number): Promise<void>
}

export const SERVICE_HEALTH_INTERVAL = 15_000
export const SERVICE_HEALTH_INTERVAL_MAX = 120_000
export const SERVICE_FAILURES_BEFORE_RESTART = 2

// The local service runs detached from the app so it survives restarts, which
// also means nothing notices when it exits. Poll it and bring it back instead of
// leaving every window reconnecting to a dead port forever.
export async function superviseService(
  deps: ServiceSupervision,
  current: { value: ServerReadyData | undefined },
  signal: AbortSignal,
): Promise<void> {
  let failures = 0
  let interval = SERVICE_HEALTH_INTERVAL
  while (!signal.aborted) {
    await deps.sleep(interval)
    if (signal.aborted) return
    const ready = current.value
    if (!ready) continue
    if (await deps.health(ready.url, ready.password)) {
      failures = 0
      interval = SERVICE_HEALTH_INTERVAL
      continue
    }
    failures += 1
    deps.log("local service health check failed", { url: ready.url, failures })
    if (failures < SERVICE_FAILURES_BEFORE_RESTART) continue
    failures = 0
    // Back off while the service keeps dying so recovery cannot turn into a
    // restart and reload storm.
    interval = Math.min(interval * 2, SERVICE_HEALTH_INTERVAL_MAX)
    const restarted = await deps.restart()
    if (!restarted) continue
    const changed = restarted.url !== ready.url || restarted.password !== ready.password
    current.value = restarted
    deps.log("local service restarted", { url: restarted.url, changed })
    // Renderers resolve their server once during initialization, so a moved
    // endpoint only reaches them through a fresh load.
    if (changed) deps.reloadWindows()
  }
}
