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

await app.whenReady()

const platform = await Effect.runPromise(make("prod", process.env.KITO_UPDATE_VERIFY_DEVICE_ID ?? "kito-updater-verifier"))

pkg.autoUpdater.forceDevUpdateConfig = true

pkg.autoUpdater.autoInstallOnAppQuit = false

const result = await Effect.runPromiseExit(
  Effect.gen(function* () {
    const update = yield* platform.checkForUpdate

    if (update?.version !== process.env.KITO_UPDATE_VERIFY_VERSION)
      throw new Error(`Expected ${process.env.KITO_UPDATE_VERIFY_VERSION}, received ${update?.version ?? "no update"}`)

    console.log(JSON.stringify({ phase: "check", currentVersion: app.getVersion(), update }))

    if (process.env.KITO_UPDATE_VERIFY_DOWNLOAD === "1") {
      yield* platform.stageUpdate({ differential: false })
      console.log(JSON.stringify({ phase: "download", version: update.version, verifiedByElectronUpdater: true }))
    }
  }),
)

if (Exit.isFailure(result)) console.error(JSON.stringify(result))

app.exit(Exit.isSuccess(result) ? 0 : 1)
