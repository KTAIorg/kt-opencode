import { app } from "electron"
import type { WebContents } from "electron"
import type { WslServerConfig, WslServersState } from "@opencode-ai/app/wsl/types"
import { Ipc, sendIpcEvent } from "../../shared/ipc-contract"
import type { WslServersController } from "./servers"
import { isValidWslDistroName } from "./distro"
import { nativeT } from "../native/translations"

export type WslIpc = {
  subscribe(sender: WebContents): void
  unsubscribe(id: number): void
  getState(): WslServersState
  probeRuntime(): Promise<void>
  refreshDistros(): Promise<void>
  installWsl(): Promise<void>
  installDistro(value: string): Promise<void>
  probeAddable(value: string[]): Promise<void>
  installOpencode(value: string): Promise<void>
  openTerminal(value: string): Promise<void>
  addServer(value: string): Promise<WslServerConfig>
  removeServer(value: string): Promise<void>
  startServer(value: string): Promise<void>
}

export function createWslIpc(controller?: WslServersController): WslIpc {
  if (!controller) return createUnavailableWslIpc()

  const subscriptions = new Map<number, () => void>()
  const unsubscribe = (id: number) => {
    const off = subscriptions.get(id)
    if (!off) return
    off()
    subscriptions.delete(id)
  }

  app.once("will-quit", () => {
    subscriptions.forEach((off) => off())
    subscriptions.clear()
  })

  return {
    subscribe(sender) {
      const id = sender.id
      if (subscriptions.has(id)) return
      subscriptions.set(
        id,
        controller.subscribe((payload) => {
          if (sender.isDestroyed()) {
            unsubscribe(id)
            return
          }
          sendIpcEvent(sender, Ipc.wsl.event, payload)
        }),
      )
      sender.once("destroyed", () => unsubscribe(id))
    },
    unsubscribe,
    getState: () => controller.getState(),
    probeRuntime: () => controller.probeRuntime(),
    refreshDistros: () => controller.refreshDistros(),
    installWsl: () => controller.installWsl(),
    installDistro: (value) => controller.installDistro(requireWslIpcDistro("distro", value)),
    probeAddable: (value) => controller.probeAddable(requireWslIpcDistros("distro", value)),
    installOpencode: (value) => controller.installOpencode(requireWslIpcDistro("distro", value)),
    openTerminal: (value) => controller.openTerminal(requireWslIpcDistro("distro", value)),
    addServer: (value) => controller.addServer(requireWslIpcDistro("distro", value)),
    removeServer: (value) => controller.removeServer(requireWslIpcString("server id", value)),
    startServer: (value) => controller.startServer(requireWslIpcString("server id", value)),
  }
}

function createUnavailableWslIpc(): WslIpc {
  const unavailable = () => {
    throw new Error(nativeT("desktop.wsl.error.windowsOnly"))
  }
  const state = (): WslServersState => ({
    runtime: {
      available: false,
      version: null,
      error: nativeT("desktop.wsl.error.windowsOnly"),
    },
    installed: [],
    online: [],
    distroProbes: {},
    opencodeChecks: {},
    pendingRestart: false,
    servers: [],
    job: null,
  })

  return {
    subscribe: (sender) => sendIpcEvent(sender, Ipc.wsl.event, { type: "state", state: state() }),
    unsubscribe: () => undefined,
    getState: state,
    probeRuntime: unavailable,
    refreshDistros: unavailable,
    installWsl: unavailable,
    installDistro: unavailable,
    probeAddable: unavailable,
    installOpencode: unavailable,
    openTerminal: unavailable,
    addServer: unavailable,
    removeServer: unavailable,
    startServer: unavailable,
  }
}

function requireWslIpcString(name: string, value: unknown) {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(`Invalid ${name}`)
}

// Distro names are interpolated into wsl.exe and cmd.exe command lines, so
// they must be plain name tokens — not arbitrary strings.
function requireWslIpcDistro(name: string, value: unknown) {
  const distro = requireWslIpcString(name, value)
  if (!isValidWslDistroName(distro)) throw new Error(`Invalid ${name}`)
  return distro
}

function requireWslIpcDistros(name: string, value: unknown) {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}`)
  const values = value.map((item) => requireWslIpcDistro(name, item))
  if (values.length) return values
  throw new Error(`Invalid ${name}`)
}
