import Store from "electron-store"
import electron from "electron"
import { rmSync } from "node:fs"
import { join } from "node:path"

import { deleteStoreFileIfEmpty } from "./cleanup"
import { SETTINGS_STORE } from "./keys"

const cache = new Map<string, Store>()

// Renderer-generated names embed a sanitized directory/draft head that keeps
// original case (e.g. "opencode.workspace.-Users-fuwuq.1a2b.dat"), so allow
// upper-case letters while still rejecting anything that is not a flat
// filename.
const storeNamePattern = /^[A-Za-z0-9_.-]{1,200}$/

// Store names can come from the renderer over IPC and land directly inside the
// userData directory via join/resolve. Keep them flat filenames so a crafted
// name can never escape it.
export function assertStoreName(name: string) {
  if (storeNamePattern.test(name) && !name.includes("..") && name !== ".") return
  throw new Error(`Invalid store name`)
}

// We cannot instantiate the electron-store at module load time because
// module import hoisting causes this to run before app.setPath("userData", ...)
// in index.ts has executed, which would result in files being written to the default directory
// (e.g. bad: %APPDATA%\@opencode-ai\desktop\opencode.settings vs good: %APPDATA%\cc.ktapi.desktop.dev\opencode.settings).
export function getStore(name = SETTINGS_STORE) {
  assertStoreName(name)
  const cached = cache.get(name)
  if (cached) return cached
  const next = new Store({
    name,
    cwd: electron.app.getPath("userData"),
    fileExtension: "",
    accessPropertiesByDotNotation: false,
  })
  cache.set(name, next)
  return next
}

export async function removeStoreFileIfEmpty(name: string) {
  assertStoreName(name)
  if (await deleteStoreFileIfEmpty(electron.app.getPath("userData"), name)) cache.delete(name)
}

export function removeStoreFile(name: string) {
  assertStoreName(name)
  rmSync(join(electron.app.getPath("userData"), name), { force: true })
  cache.delete(name)
}
