import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { SimulationActions } from "./actions"
import { SimulationRenderer } from "./renderer"
import { SimulationServer } from "./server"

/**
 * Simulation-mode renderer entry point.
 *
 * Creates the renderer (fake when OPENCODE_SIMULATION_RENDERER=fake, a
 * visible terminal renderer otherwise) and starts the simulation control
 * server against it. The server stops when the renderer is destroyed, so the
 * caller only manages the renderer lifecycle.
 */
export async function createSimulation(): Promise<CliRenderer> {
  const renderer =
    process.env.OPENCODE_SIMULATION_RENDERER === "fake"
      ? await SimulationRenderer.create()
      : await createCliRenderer({
          externalOutputMode: "passthrough",
          targetFps: 60,
          gatherStats: false,
          exitOnCtrlC: false,
          useKittyKeyboard: {},
          autoFocus: false,
          openConsoleOnError: false,
        })
  const server = SimulationServer.start(SimulationActions.createHarness(renderer))
  if (server) {
    process.stderr.write(`opencode simulation websocket: ${server.url}\n`)
    renderer.once("destroy", () => server.stop())
  }
  return renderer
}

export * as Simulation from "./simulation"
