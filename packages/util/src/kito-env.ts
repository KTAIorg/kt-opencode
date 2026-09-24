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

/**
 * Names that look like credentials (API keys, tokens, secrets, passwords, auth
 * material). Used both to strip inherited environment before spawning child
 * processes and to refuse `{env:NAME}` substitutions that would leak secrets
 * into remote wellknown configuration.
 */
const SENSITIVE_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i

export function isSensitiveEnvName(name: string) {
  return SENSITIVE_ENV_NAME.test(name)
}

/**
 * Filters an environment about to be inherited by a spawned child process
 * (shell tool, PTY, MCP stdio server, auth command, VCS/formatter helpers).
 * Kito's own credentials must not leak into every child:
 *
 * - All `KTAI_*` identity/billing credentials are dropped.
 * - `KITO_DB`/`OPENCODE_DB` are dropped; they select the session database.
 * - Other `KITO_*`/`OPENCODE_*` entries survive only when not
 *   credential-shaped, so markers like `KITO_TERMINAL`/`OPENCODE_TERMINAL` and
 *   selectors like `KITO_CONFIG_DIR` still propagate.
 *
 * Explicit `env` entries on a spawn are applied after this filter, so callers
 * that deliberately pass a credential still can.
 */
export function sanitizeChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => {
      if (/^KTAI_/i.test(name)) return false
      if (/^(KITO|OPENCODE)_DB$/i.test(name)) return false
      return !(/^(KITO|OPENCODE)_/i.test(name) && isSensitiveEnvName(name))
    }),
  )
}
