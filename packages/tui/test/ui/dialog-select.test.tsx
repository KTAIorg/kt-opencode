/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createSignal, onCleanup, type JSX } from "solid-js"
import { ConfigProvider } from "../../src/config"
import { ThemeProvider } from "../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { DialogProvider } from "../../src/ui/dialog"
import { DialogSelect } from "../../src/ui/dialog-select"
import { ToastProvider } from "../../src/ui/toast"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

async function mountDialogSelect(content: () => JSX.Element) {
  const config = createTuiResolvedConfig()

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const off = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(off)

    return (
      <TestTuiContexts>
        <OpencodeKeymapProvider keymap={keymap}>
          <ConfigProvider config={config}>
            <ThemeProvider mode="dark" source={{ discover: () => Promise.resolve({}) }}>
              <ToastProvider>
                <DialogProvider>{content()}</DialogProvider>
              </ToastProvider>
            </ThemeProvider>
          </ConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 80, height: 20 })
  app.renderer.start()
  return app
}

test("distinguishes loading, unfiltered empty, and filtered no-match states", async () => {
  const [loading, setLoading] = createSignal(true)
  const app = await mountDialogSelect(() => (
    <DialogSelect title="Skills" options={[]} loading={loading()} emptyView={<text>Could not load skills</text>} />
  ))
  try {
    await app.waitForFrame((frame) => frame.includes("Loading..."))

    setLoading(false)
    await app.waitForFrame((frame) => frame.includes("Could not load skills"))

    await app.mockInput.typeText("missing")
    await app.waitForFrame((frame) => frame.includes("No matching results"))
    expect(app.captureCharFrame()).not.toContain("Could not load skills")
  } finally {
    app.renderer.destroy()
  }
})

test("uses a generic fallback for an unfiltered empty list", async () => {
  const app = await mountDialogSelect(() => <DialogSelect title="Items" options={[]} />)
  try {
    await app.waitForFrame((frame) => frame.includes("No items"))
  } finally {
    app.renderer.destroy()
  }
})
