export * as LegacyData from "./legacy-data"

import { Global } from "@opencode-ai/util/global"
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

// Kito's data, config, state, and cache roots moved from the shared "opencode"
// leaf to a "kito" leaf (packages/util/src/global.ts). The first time a server
// boots against the fresh kito data directory, carry the Kito-owned files over
// from the legacy opencode data directory so an upgrading user stays signed in.
//
// Copy, never move: a co-installed OpenCode keeps its own copy and keeps
// working. Only the Kito files are carried; opencode.db, storage/, auth.json,
// and the config tree are intentionally left behind so the two products keep
// separate sessions, credentials, and settings from here on (clean break — the
// database and storage are not migrated).
//
// Writers of these filenames live in packages/core/src/ktai (identity.ts,
// newapi.ts, catalog.ts, soft-quota.ts); they are duplicated here because the
// CLI package does not depend on @opencode-ai/core.
export const IDENTITY_FILE = "ktai-identity.json"
export const FILES = [
  IDENTITY_FILE,
  "ktai-api-key.json",
  "ktai-models.json",
  "ktai-spendable.json",
  "soft-quota.json",
] as const

/** Legacy opencode data directories to pull Kito files from, in priority order. */
export function legacyDataDirs(data: string, home: string) {
  return [
    // Sibling of the current data root: the legacy "opencode" leaf under the
    // same XDG base, so a user-level XDG_DATA_HOME override is respected.
    join(dirname(data), "opencode"),
    // The canonical default data root, for setups whose XDG base was
    // reparented (for example the WSL sidecar's $HOME/.kito roots).
    join(home, ".local", "share", "opencode"),
  ].filter((dir, index, all) => all.indexOf(dir) === index && dir !== data)
}

/**
 * Copy the Kito file set into `data` when it has no identity file yet and a
 * legacy opencode data directory has one. Idempotent: existing files in the
 * new root are never overwritten, and later runs find the identity file and
 * stop early.
 */
export function migrate(input: { data?: string; home?: string } = {}) {
  const data = input.data ?? Global.Path.data
  const home = input.home ?? Global.Path.home
  if (existsSync(join(data, IDENTITY_FILE))) return { migrated: false, files: [] as string[] }
  const source = legacyDataDirs(data, home).find((dir) => existsSync(join(dir, IDENTITY_FILE)))
  if (!source) return { migrated: false, files: [] as string[] }
  mkdirSync(data, { recursive: true })
  const files = FILES.filter((name) => existsSync(join(source, name)) && !existsSync(join(data, name)))
  for (const name of files) {
    copyFileSync(join(source, name), join(data, name))
    chmodSync(join(data, name), 0o600)
  }
  return { migrated: true, source, files }
}
