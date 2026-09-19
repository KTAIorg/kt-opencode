/**
 * Centralized reads for Kito-namespaced environment variables.
 *
 * Kito renames OpenCode's OPENCODE_* surface to KITO_* so a co-installed
 * OpenCode cannot redirect Kito's data roots or toggles through its own
 * environment. Two read modes exist:
 *
 * - kitoEnv() reads KITO_<name> first and falls back to OPENCODE_<name> for
 *   compatibility. Use it for plain toggles, credentials, and other values
 *   where honoring a legacy setting is safe.
 * - kitoDataEnv() reads KITO_<name> only. Use it for every variable that
 *   selects a data or file path (config dir, database, config file/content,
 *   spendable/quota caches, asset and wasm overrides): an upstream
 *   OPENCODE_* value must never repoint Kito's stores or binaries.
 */

export function kitoEnv(name: string) {
  return process.env[`KITO_${name}`] ?? process.env[`OPENCODE_${name}`]
}

export function kitoDataEnv(name: string) {
  return process.env[`KITO_${name}`]
}
