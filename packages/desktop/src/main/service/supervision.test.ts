import { describe, expect, test } from "bun:test"

import type { ServerReadyData } from "../../shared/ipc-contract"
import {
  SERVICE_FAILURES_BEFORE_RESTART,
  SERVICE_HEALTH_INTERVAL,
  SERVICE_HEALTH_INTERVAL_MAX,
  superviseService,
} from "./supervision"

const ready = (url: string, password: string | null): ServerReadyData => ({ url, username: "opencode", password })

type Harness = {
  current: { value: ServerReadyData | undefined }
  sleeps: number[]
  restarts: number
  reloads: number
  failures: number[]
}

async function run(options: {
  initial?: ServerReadyData
  health: boolean[]
  restart?: ServerReadyData | undefined
  stopAfter: number
}): Promise<Harness> {
  const state: Harness = {
    current: { value: options.initial },
    sleeps: [],
    restarts: 0,
    reloads: 0,
    failures: [],
  }
  const aborted = new AbortController()
  let checks = 0
  await superviseService(
    {
      health: async () => {
        const result = options.health[checks] ?? options.health.at(-1) ?? false
        checks += 1
        return result
      },
      restart: async () => {
        state.restarts += 1
        return options.restart
      },
      reloadWindows: () => {
        state.reloads += 1
      },
      log: (message, meta) => {
        if (message === "local service health check failed") state.failures.push(Number(meta?.failures))
      },
      error: () => {},
      sleep: async (ms) => {
        state.sleeps.push(ms)
        if (state.sleeps.length >= options.stopAfter) aborted.abort()
      },
    },
    state.current,
    aborted.signal,
  )
  return state
}

describe("service supervision", () => {
  test("leaves a healthy service alone", async () => {
    const state = await run({ initial: ready("http://127.0.0.1:1", "a"), health: [true, true], stopAfter: 2 })
    expect(state.restarts).toBe(0)
    expect(state.reloads).toBe(0)
    expect(state.sleeps).toEqual([SERVICE_HEALTH_INTERVAL, SERVICE_HEALTH_INTERVAL])
  })

  test("restarts only after repeated failures", async () => {
    const state = await run({
      initial: ready("http://127.0.0.1:1", "a"),
      health: [false, false],
      restart: ready("http://127.0.0.1:1", "a"),
      stopAfter: 3,
    })
    expect(state.failures).toEqual([1, SERVICE_FAILURES_BEFORE_RESTART])
    expect(state.restarts).toBe(1)
  })

  test("reloads windows when the restarted service moves", async () => {
    const state = await run({
      initial: ready("http://127.0.0.1:1", "a"),
      health: [false, false],
      restart: ready("http://127.0.0.1:2", "b"),
      stopAfter: 3,
    })
    expect(state.reloads).toBe(1)
    expect(state.current.value).toEqual(ready("http://127.0.0.1:2", "b"))
  })

  test("keeps the current endpoint when the restarted service reuses it", async () => {
    const state = await run({
      initial: ready("http://127.0.0.1:1", "a"),
      health: [false, false],
      restart: ready("http://127.0.0.1:1", "a"),
      stopAfter: 3,
    })
    expect(state.reloads).toBe(0)
  })

  test("does not reload when the restart failed", async () => {
    const state = await run({
      initial: ready("http://127.0.0.1:1", "a"),
      health: [false, false],
      restart: undefined,
      stopAfter: 3,
    })
    expect(state.restarts).toBe(1)
    expect(state.reloads).toBe(0)
  })

  test("backs off between restarts and caps the interval", async () => {
    const state = await run({
      initial: ready("http://127.0.0.1:1", "a"),
      health: [false],
      restart: ready("http://127.0.0.1:2", "b"),
      stopAfter: 12,
    })
    expect(state.sleeps[0]).toBe(SERVICE_HEALTH_INTERVAL)
    expect(state.sleeps[1]).toBe(SERVICE_HEALTH_INTERVAL)
    expect(state.sleeps.at(-1)).toBe(SERVICE_HEALTH_INTERVAL_MAX)
    expect(Math.max(...state.sleeps)).toBe(SERVICE_HEALTH_INTERVAL_MAX)
  })

  test("waits for the endpoint before checking", async () => {
    const state = await run({ health: [false], stopAfter: 2 })
    expect(state.failures).toEqual([])
    expect(state.restarts).toBe(0)
  })
})
