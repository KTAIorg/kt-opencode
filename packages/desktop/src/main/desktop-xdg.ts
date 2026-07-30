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
  return env
}
