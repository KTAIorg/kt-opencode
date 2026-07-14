/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ConfigProvider } from "../../../src/config"
import { Reconnecting } from "../../../src/component/reconnecting"
import { Keymap } from "../../../src/context/keymap"
import { ThemeProvider } from "../../../src/context/theme"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

function render(restart: (signal?: AbortSignal) => Promise<void>) {
  return testRender(() => (
    <TestTuiContexts>
      <ConfigProvider config={createTuiResolvedConfig()}>
        <Keymap.Provider>
          <ThemeProvider mode="dark" source={{ discover: () => Promise.resolve({}) }}>
            <Reconnecting status={{ type: "unresponsive" }} restart={restart} />
          </ThemeProvider>
        </Keymap.Provider>
      </ConfigProvider>
    </TestTuiContexts>
  ))
}

test("restarts an unresponsive service when r is pressed", async () => {
  let restarts = 0
  let complete!: () => void
  const restarting = new Promise<void>((resolve) => {
    complete = resolve
  })
  const app = await render(() => {
    restarts += 1
    return restarting
  })
  app.renderer.start()

  try {
    await app.waitForFrame((frame) => frame.includes("[r] Restart service"))
    app.mockInput.pressKey("r")
    await app.waitForFrame((frame) => frame.includes("Restarting background service..."))
    app.mockInput.pressKey("r")
    expect(restarts).toBe(1)
    complete()
    await Bun.sleep(0)
    app.mockInput.pressKey("r")
    expect(restarts).toBe(1)
  } finally {
    complete()
    app.renderer.destroy()
  }
})

test("cancels recovery when the reconnecting overlay unmounts", async () => {
  let aborted = false
  const app = await render(
    (signal) =>
      new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          aborted = true
          reject(signal.reason)
        })
      }),
  )
  app.renderer.start()

  await app.waitForFrame((frame) => frame.includes("[r] Restart service"))
  app.mockInput.pressKey("r")
  await app.waitForFrame((frame) => frame.includes("Restarting background service..."))
  app.renderer.destroy()
  await Bun.sleep(0)

  expect(aborted).toBe(true)
})
