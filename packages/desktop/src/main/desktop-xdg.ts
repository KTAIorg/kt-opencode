/**
 * Isolate KT OpenCode Desktop from the host OpenCode CLI profile.
 *
 * Same approach as ktai-opencode: point all XDG roots at Electron userData
 * so config/models/sessions never read ~/.config/opencode or ~/.local/share/opencode.
 */
export function desktopXdgEnv(userDataPath: string): Record<string, string> {
  return {
    XDG_DATA_HOME: userDataPath,
    XDG_CONFIG_HOME: userDataPath,
    XDG_CACHE_HOME: userDataPath,
    XDG_STATE_HOME: userDataPath,
  }
}

/** Host AI keys that must never ride into Desktop via process/shell env. */
const BLOCKED_HOST_AI_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "KTAI_API_KEY",
  "KTAI_IDENTITY_TOKEN",
  "KTAI_IDENTITY_EXPIRES_AT",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
] as const

/** Apply XDG isolation onto an env map (mutates and returns it). */
export function applyDesktopXdgIsolation<T extends Record<string, string | undefined>>(
  env: T,
  userDataPath: string,
): T {
  const xdg = desktopXdgEnv(userDataPath)
  for (const [key, value] of Object.entries(xdg)) {
    env[key as keyof T] = value as T[keyof T]
  }
  // Host CLI overrides must not leak into the desktop sidecar.
  delete env.OPENCODE_CONFIG
  delete env.OPENCODE_CONFIG_DIR
  for (const key of BLOCKED_HOST_AI_KEYS) {
    delete env[key]
  }
  return env
}
