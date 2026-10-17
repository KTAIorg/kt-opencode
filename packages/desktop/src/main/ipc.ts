export * as Ipc from "./ipc"

import { app, BrowserWindow, MessageChannelMain } from "electron"
import { Effect, Layer } from "effect"
import { RpcServer } from "effect/rpc"
import { DesktopRpcs } from "../shared/ipc-rpc"
import { DragCancelEvent, IpcTransportPort } from "../shared/ipc-transport"
import { Extensions } from "./extension"
import { DesktopFiles, openExternalURL } from "./files"
import { appHandlers } from "./ipc-handlers/app"
import { eventHandlers } from "./ipc-handlers/events"
import { extensionHandlers } from "./ipc-handlers/extensions"
import { fileHandlers } from "./ipc-handlers/files"
import { menuHandlers } from "./ipc-handlers/menu"
import { storageHandlers } from "./ipc-handlers/storage"
import { windowHandlers } from "./ipc-handlers/window"
import { IpcPortHandoff, IpcServerProtocolLive } from "./ipc-transport"
import { ApplicationLifecycle } from "./lifecycle"
import { showCliInstaller } from "./native/install-cli"
import { createMenu, sendMenuCommand } from "./native/menu"
import { DesktopCli } from "./service/desktop-cli"
import { BackgroundService } from "./service/background-service"
import { registerDesktopLoginHandler } from "./lifecycle/desktop-login"
import { getLastFocusedWindow } from "./windows"

const services = Layer.mergeAll(DesktopFiles.layer, Extensions.layer)

const handlers = Layer.mergeAll(
  appHandlers,
  storageHandlers,
  fileHandlers,
  windowHandlers,
  menuHandlers,
  eventHandlers,
  extensionHandlers,
)

export const layer = RpcServer.layer(DesktopRpcs, { disableFatalDefects: true }).pipe(
  Layer.provide(handlers),
  Layer.provideMerge(IpcServerProtocolLive),
  Layer.provideMerge(services),
)

export const registerIpcHandlers = Effect.gen(function* () {
  const handoff = yield* IpcPortHandoff
  const lifecycle = yield* ApplicationLifecycle.Service
  const desktopCli = yield* DesktopCli.Service
  const background = yield* BackgroundService.Service
  const runPromise = Effect.runPromiseWith(yield* Effect.context())
  yield* Effect.sync(() =>
    registerDesktopLoginHandler(async (request) => {
      try {
        const sidecar = await runPromise(background.connection)
        const response = await fetch(`${sidecar.url}/ktai/desktop-login`, {
          method: "POST",
          signal: AbortSignal.timeout(120_000),
          headers: {
            "content-type": "application/json",
            ...(sidecar.password
              ? { authorization: `Basic ${Buffer.from(`opencode:${sidecar.password}`).toString("base64")}` }
              : {}),
          },
          body: JSON.stringify(request),
        })
        if (!response.ok) throw new Error("Desktop sign-in failed")
      } catch {
        // Report a fixed code; neither local endpoint nor nonce belongs in logs.
        await fetch(`http://127.0.0.1:${request.port}/kito/${request.request}/complete`, {
          method: "POST",
          signal: AbortSignal.timeout(3000),
          redirect: "error",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "failed", code: "kito_login_failed" }),
        }).catch(() => undefined)
      }
    }),
  )
  const runFork = Effect.runForkWith(yield* Effect.context())

  const menu = {
    trigger: (id: string) => {
      const win = getLastFocusedWindow()

      if (win) sendMenuCommand(win, id)
    },
    installCli: () => runFork(showCliInstaller(desktopCli)),
    createWindow: lifecycle.createWindow,
    openExternal: (url: string) => runFork(openExternalURL(url)),
    relaunch: lifecycle.relaunch,
  }

  const wire = (win: BrowserWindow) => {
    win.webContents.on("before-input-event", (_event, input) => {
      if (input.type !== "keyDown" || input.key !== "Escape") return
      win.webContents.send(DragCancelEvent)
    })

    const post = () => {
      if (win.isDestroyed() || win.webContents.isDestroyed()) return
      const channel = new MessageChannelMain()
      handoff.bind(win.webContents, channel.port1)
      win.webContents.postMessage(IpcTransportPort, null, [channel.port2])
    }

    win.webContents.on("did-finish-load", post)

    // The first window starts loading before the layers exist and may already be done.
    if (!win.webContents.isLoading() && win.webContents.getURL()) post()
  }

  const onWindowCreated = (_event: Electron.Event, win: BrowserWindow) => wire(win)

  yield* Effect.sync(() => {
    app.on("browser-window-created", onWindowCreated)
    BrowserWindow.getAllWindows().forEach((win) => wire(win))
  })
  yield* Effect.addFinalizer(() => Effect.sync(() => app.off("browser-window-created", onWindowCreated)))

  return {
    installMenu: () => createMenu(menu),
  }
})
