import { app, BrowserWindow } from "electron"
import type { Event } from "electron"
import { Ipc, sendIpcEvent } from "../../shared/ipc-contract"
import { writeLog, type DesktopLogger } from "../native/logging"
import { safeWebContentsURL } from "../windows/state"
import { getLastFocusedWindow, restoreMainWindows, setAppQuitting, setRelaunchHandler } from "../windows"
import { createDeepLinkOutbox, deepLinksFromArgv } from "./deep-links"

export function createApplicationLifecycle(logger: DesktopLogger) {
  const deepLinks = createDeepLinkOutbox()
  const wsl = { stop: async () => {} }
  const emitDeepLinks = (urls: string[]) => {
    const win = getLastFocusedWindow()
    // A window that is still loading has no IPC listener yet; buffer instead of dropping.
    if (win && !win.webContents.isLoading()) {
      deepLinks.emit(urls, (next) => sendIpcEvent(win.webContents, Ipc.app.deepLink, next))
      return
    }
    deepLinks.emit(urls)
  }
  const relaunch = () => {
    setAppQuitting()
    void wsl.stop().finally(() => {
      app.relaunch()
      app.quit()
    })
  }

  // Windows/Linux launches the app directly with the URL as an argv entry, so
  // cold-start links arrive here rather than through open-url/second-instance.
  const initial = deepLinksFromArgv(process.argv)
  if (initial.length) {
    logger.log("deep link received via argv", { urls: initial })
    emitDeepLinks(initial)
  }

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = deepLinksFromArgv(argv)
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls })
      emitDeepLinks(urls)
    }
    const win = getLastFocusedWindow()
    if (!win) return
    win.show()
    win.focus()
  })
  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    logger.log("deep link received via open-url", { url })
    emitDeepLinks([url])
  })
  app.on("before-quit", () => {
    setAppQuitting()
    void wsl.stop()
  })
  app.on("will-quit", () => {
    setAppQuitting()
    void wsl.stop()
  })
  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })
  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: safeWebContentsURL(webContents), details }, "error")
  })
  setRelaunchHandler(relaunch)
  ;(["SIGINT", "SIGTERM"] as const).forEach((signal) => {
    process.on(signal, () => {
      setAppQuitting()
      void wsl.stop().finally(() => app.quit())
    })
  })

  return {
    relaunch,
    prepareToRestart: () => wsl.stop(),
    setWslShutdown(stop: () => Promise<void>) {
      wsl.stop = stop
    },
    consumeInitialDeepLinks: () => deepLinks.consume(),
    restoreWindows() {
      app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit()
      })
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) restoreMainWindows()
      })
      return restoreMainWindows()
    },
  }
}
