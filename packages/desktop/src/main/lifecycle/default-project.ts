import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, parse, resolve } from "node:path"
import { promisify } from "node:util"
import { app } from "electron"
import { writeLog } from "../native/logging"

const execFileAsync = promisify(execFile)
const DEFAULT_PROJECT_DIR = "Kito"
const INIT_TIMEOUT_MS = 10_000

/**
 * Create the default project directory when a session needs a directory and the user
 * has no project yet, then return it.
 *
 * Returns null when the directory cannot be prepared, so callers keep their existing
 * "no project" behaviour instead of starting a session in an unsafe location.
 */
export async function ensureDefaultProject(override?: string) {
  const directory = defaultProjectDirectory(override)
  if (!directory) return null
  try {
    await mkdir(directory, { recursive: true })
    await initializeRepository(directory)
    writeLog("default-project", "default project ready", { directory })
    return directory
  } catch (error) {
    writeLog("default-project", "could not prepare default project", { directory, error: String(error) }, "error")
    return null
  }
}

function defaultProjectDirectory(override?: string) {
  const candidate = override?.trim() || join(app.getPath("home"), DEFAULT_PROJECT_DIR)
  const directory = resolve(candidate)
  // Sessions run their tools in this directory, so a filesystem root or the home
  // directory itself would hand the agent far more than the user asked for.
  if (directory === parse(directory).root) return null
  if (directory === resolve(homedir())) return null
  return directory
}

async function initializeRepository(directory: string) {
  if (existsSync(join(directory, ".git"))) return
  // The server derives project identity from the repository; a directory without one
  // resolves to the filesystem root. Best effort: a missing git binary must not stop
  // the user from starting a session.
  try {
    await execFileAsync("git", ["init"], { cwd: directory, timeout: INIT_TIMEOUT_MS })
  } catch (error) {
    writeLog("default-project", "git init failed", { directory, error: String(error) }, "warn")
  }
}
