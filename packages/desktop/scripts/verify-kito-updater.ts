// Run with Electron from the isolated harness in verify-kito-updater.yml.
import { app } from "electron"
import { mkdirSync } from "node:fs"
import pkg from "electron-updater"
import { Effect, Exit } from "effect"
import { make } from "../../gui-extensions/src/updater/platform"

app.disableHardwareAcceleration()

const profile = process.env.KITO_UPDATE_VERIFY_PROFILE ?? `${app.getPath("temp")}/kito-updater-verification`

mkdirSync(profile, { recursive: true })

app.setPath("userData", profile)

// Awaiting readiness at ESM module scope blocks Electron's ready event.
void Effect.runPromiseExit(
  Effect.gen(function* () {
    yield* Effect.promise(() => app.whenReady())
    const platform = yield* make("prod", process.env.KITO_UPDATE_VERIFY_DEVICE_ID ?? "kito-updater-verifier")
    pkg.autoUpdater.forceDevUpdateConfig = true
    const update = yield* platform.checkForUpdate

    if (!update || update.mode === "hold" || update.version !== process.env.KITO_UPDATE_VERIFY_VERSION)
      throw new Error(`Expected an assignment for ${process.env.KITO_UPDATE_VERIFY_VERSION}`)

    console.log(JSON.stringify({ phase: "check", currentVersion: app.getVersion(), update }))

    if (update.mode === "external") {
      console.log(JSON.stringify({ phase: "manual-install-required", version: update.version, url: update.url }))

      return
    }

    if (process.env.KITO_UPDATE_VERIFY_DOWNLOAD === "1") {
      yield* platform.stageUpdate({ differential: false })
      console.log(JSON.stringify({ phase: "download", version: update.version, verifiedByElectronUpdater: true }))
    }

    if (process.env.KITO_UPDATE_VERIFY_INSTALL === "1") {
      const assigned = yield* platform.checkForUpdate

      if (!assigned || assigned.mode !== "restart" || assigned.version !== update.version)
        throw new Error("Kito update assignment changed before installation")
      console.log(JSON.stringify({ phase: "install-request", version: assigned.version }))
      yield* platform.installAndRestart
    }
  }),
).then((result) => {
  if (Exit.isFailure(result)) console.error(JSON.stringify(result))
  app.exit(Exit.isSuccess(result) ? 0 : 1)
})
