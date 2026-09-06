import { homedir } from "node:os"
import { join } from "node:path"

// The bundled CLI bakes OPENCODE_CHANNEL at build time and the CLI's service
// registration file is named per channel: latest/dev/beta/next share
// service.json, every other channel writes service-<channel>.json. The
// desktop app is built with channel "prod", so its Service.ensure must read
// the same file the CLI writes or it polls service.json forever and times
// out. Mirrors filename() in packages/cli/src/services/service-config.ts.
export function registrationFileName(channel: string, packaged: boolean) {
  if (!packaged) return undefined
  if (channel === "dev" || channel === "beta") return undefined
  const name = channel === "prod" ? "service-prod.json" : `service-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
  const state = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state")
  return join(state, "opencode", name)
}
