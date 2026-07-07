/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onMount } from "solid-js"
import { ArgsProvider } from "../../../src/context/args"
import { DataProvider } from "../../../src/context/data"
import { KVProvider } from "../../../src/context/kv"
import { LocalProvider, useLocal } from "../../../src/context/local"
import { PermissionProvider } from "../../../src/context/permission"
import { ProjectProvider } from "../../../src/context/project"
import { RouteProvider } from "../../../src/context/route"
import { SDKProvider } from "../../../src/context/sdk"
import { SyncProvider } from "../../../src/context/sync"
import { ThemeProvider } from "../../../src/context/theme"
import { TuiConfigProvider } from "../../../src/config"
import { ToastProvider } from "../../../src/ui/toast"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { createApi, createClient, createEventStream, createFetch, directory, json } from "../../fixture/tui-sdk"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

test("follows durable model switches for the active session", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const events = createEventStream()
  const session = {
    id: "ses_test",
    projectID: "proj_test",
    agent: "build",
    model: { providerID: "repro", id: "alpha" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
    title: "Test session",
    location: { directory },
  }
  const calls = createFetch((url) => {
    if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
    if (url.pathname === "/api/model")
      return json({
        location: { directory, project: { id: "proj_test", directory } },
        data: [
          { providerID: "repro", id: "alpha", name: "Alpha" },
          { providerID: "repro", id: "beta", name: "Beta" },
          { providerID: "repro", id: "gamma", name: "Gamma", variants: [{ id: "high" }] },
        ],
      })
    if (url.pathname === "/api/agent")
      return json({
        location: { directory, project: { id: "proj_test", directory } },
        data: [{ id: "build", mode: "primary", hidden: false }],
      })
    return undefined
  }, events)
  let local!: ReturnType<typeof useLocal>
  let mounted!: () => void
  const ready = new Promise<void>((resolve) => {
    mounted = resolve
  })

  function Probe() {
    local = useLocal()
    onMount(mounted)
    return <text>{local.model.current()?.modelID}</text>
  }

  const app = await testRender(() => (
    <TestTuiContexts directory={tmp.path} paths={{ state }}>
      <ArgsProvider>
        <KVProvider>
          <ToastProvider>
            <RouteProvider initialRoute={{ type: "session", sessionID: session.id }}>
              <TuiConfigProvider config={createTuiResolvedConfig()}>
                <SDKProvider client={createClient(calls.fetch)} api={createApi(calls.fetch)}>
                  <PermissionProvider>
                    <ProjectProvider>
                      <SyncProvider>
                        <DataProvider>
                          <ThemeProvider mode="dark">
                            <LocalProvider>
                              <Probe />
                            </LocalProvider>
                          </ThemeProvider>
                        </DataProvider>
                      </SyncProvider>
                    </ProjectProvider>
                  </PermissionProvider>
                </SDKProvider>
              </TuiConfigProvider>
            </RouteProvider>
          </ToastProvider>
        </KVProvider>
      </ArgsProvider>
    </TestTuiContexts>
  ))

  try {
    await ready
    await wait(() => local.model.ready && local.model.current()?.modelID === "alpha")
    local.model.set({ providerID: "repro", modelID: "beta" })

    events.emit({
      id: "evt_model_alpha",
      created: 1,
      type: "session.model.selected",
      durable: { aggregateID: session.id, seq: 1, version: 1 },
      location: { directory },
      data: {
        sessionID: session.id,
        model: { providerID: "repro", id: "alpha" },
      },
    })
    await Bun.sleep(20)
    expect(local.model.current()?.modelID).toBe("beta")

    events.emit({
      id: "evt_model_gamma",
      created: 2,
      type: "session.model.selected",
      durable: { aggregateID: session.id, seq: 2, version: 1 },
      location: { directory },
      data: {
        sessionID: session.id,
        model: { providerID: "repro", id: "gamma", variant: "high" },
      },
    })

    await wait(() => local.model.current()?.modelID === "gamma")
    expect(local.model.current()).toEqual({ providerID: "repro", modelID: "gamma" })
    expect(local.model.variant.current()).toBe("high")
  } finally {
    app.renderer.destroy()
  }
})
