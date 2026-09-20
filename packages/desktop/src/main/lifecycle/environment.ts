import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import http from "node:http"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import { app } from "electron"
import contextMenu from "electron-context-menu"
import { Effect } from "effect"
import { CHANNEL, VERSION } from "../constants"
import { initCrashReporter, initLogging, type DesktopLogger } from "../native/logging"
import { applyShellEnvironment, getUserShell, HOST_PROVIDER_ENV_KEYS, loadShellEnv } from "../service/shell-env"
import { cleanupStoreFiles } from "../storage/cleanup"
import { registerRendererProtocol, setDockIcon } from "../windows"
import { initializeFirstLaunchOnboarding } from "./onboarding"

const appNames: Record<string, string> = {
  dev: "Kito Dev",
  beta: "Kito Beta",
  prod: "Kito",
}
// Keep these ids in sync with the packaged appId in electron-builder.config.ts.
// They root the Chromium userData directory and the single-instance lock, so
// sharing "ai.opencode.desktop" with a co-installed OpenCode desktop let each
// product see the other's persisted state and hijack the other's deep links.
// The old shared userData is intentionally not migrated: it only held window
// state and permissions that should never have been shared in the first place.
const appIDs: Record<string, string> = {
  dev: "cc.ktapi.desktop.dev",
  beta: "cc.ktapi.desktop.beta",
  prod: "cc.ktapi.desktop",
}
const testOnboarding = (process.env.KITO_TEST_ONBOARDING ?? process.env.OPENCODE_TEST_ONBOARDING) === "1"
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

export function configureApplication() {
  contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })
  try {
    process.chdir(homedir())
  } catch {}
  process.env.KITO_DISABLE_EMBEDDED_WEB_UI = "true"
  process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"

  const appID = app.isPackaged ? appIDs[CHANNEL] : "cc.ktapi.desktop.dev"
  const onboardingRoot = createOnboardingTestRoot()
  app.setName(app.isPackaged ? appNames[CHANNEL] : "Kito Dev")
  app.setAppUserModelId(appID)
  app.setPath("userData", onboardingRoot ? join(onboardingRoot, "desktop") : join(app.getPath("appData"), appID))
  if (onboardingRoot) app.setPath("sessionData", join(onboardingRoot, "session"))

  initializeFirstLaunchOnboarding(app.getPath("userData"))
  const logger = initLogging()
  initCrashReporter()
  loadSystemCertificates(logger)
  logger.log("app starting", {
    version: VERSION,
    packaged: app.isPackaged,
    onboardingTest: Boolean(onboardingRoot),
  })

  loadProxyEnvironment(logger)
  // Keep loopback traffic (the local sidecar, including its credentials) off
  // any configured system proxy. `<-loopback>` would do the opposite: it
  // removes Chromium's implicit loopback bypass.
  app.commandLine.appendSwitch("proxy-bypass-list", "127.0.0.1;localhost;[::1]")
  const features = app.commandLine.getSwitchValue("enable-features")
  app.commandLine.appendSwitch("enable-features", features ? `${jsCallStackFeature},${features}` : jsCallStackFeature)
  if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222")
  return logger
}

export function acquireApplicationLock() {
  if (app.requestSingleInstanceLock()) return true
  app.quit()
  return false
}

export function preferApplicationEnvironment(logger: DesktopLogger) {
  const shell = process.platform === "win32" ? null : getUserShell()
  const shellEnv = shell ? loadShellEnv(shell, logger) : null
  if (!shellEnv?.XDG_STATE_HOME) delete process.env.XDG_STATE_HOME
  const merged = applyShellEnvironment(process.env, shellEnv)
  Object.assign(process.env, merged, {
    // Exported under both names: in-repo readers go through the KITO_*
    // namespace while bundled upstream code paths may still read OPENCODE_*.
    KITO_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    KITO_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    KITO_CLIENT: "desktop",
    OPENCODE_CLIENT: "desktop",
  })
  for (const key of HOST_PROVIDER_ENV_KEYS) {
    if (!merged[key]) delete process.env[key]
  }
}

export function prepareDesktop(logger: DesktopLogger) {
  return Effect.gen(function* () {
    yield* Effect.promise(() => cleanupStoreFiles(app.getPath("userData"))).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (result.deleted.length === 0) return
          logger.log("cleaned scoped store files", { count: result.deleted.length, scanned: result.scanned })
        }),
      ),
      Effect.catch((error) => Effect.sync(() => logger.warn("failed to clean scoped store files", error))),
    )
    // ktai:// is Kito's scheme; opencode:// stays registered so legacy links
    // keep landing in Kito instead of a co-installed OpenCode.
    app.setAsDefaultProtocolClient("ktai")
    app.setAsDefaultProtocolClient("opencode")
    registerRendererProtocol()
    setDockIcon()
  })
}

export function loadProxyEnvironment(logger: DesktopLogger) {
  ensureLoopbackNoProxy()
  try {
    // Electron 41.2 has a newer Node API than the current @types/node package.
    const proxyAwareHttp = http as typeof http & { setGlobalProxyFromEnv(): void }
    proxyAwareHttp.setGlobalProxyFromEnv()
  } catch (error) {
    logger.warn("failed to load proxy environment", error)
  }
}

function createOnboardingTestRoot() {
  if (!testOnboarding) return undefined
  const root = join(tmpdir(), `opencode-onboarding-${randomUUID()}`)
  rmSync(root, { recursive: true, force: true })
  ;["data", "config", "cache", "state", "desktop", "session"].forEach((dir) =>
    mkdirSync(join(root, dir), { recursive: true }),
  )
  // KITO_DB only: kitoDataEnv reads KITO_* exclusively so an upstream
  // OPENCODE_DB can never repoint Kito's database.
  process.env.KITO_DB = ":memory:"
  process.env.XDG_DATA_HOME = join(root, "data")
  process.env.XDG_CONFIG_HOME = join(root, "config")
  process.env.XDG_CACHE_HOME = join(root, "cache")
  process.env.XDG_STATE_HOME = join(root, "state")
  return root
}

function loadSystemCertificates(logger: DesktopLogger) {
  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }
}

function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"]
  ;["NO_PROXY", "no_proxy"].forEach((key) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    loopback.forEach((host) => {
      if (!items.some((value) => value.toLowerCase() === host)) items.push(host)
    })
    process.env[key] = items.join(",")
  })
}
