import { describe, expect, test } from "bun:test"

import { isNushell, mergeShellEnv, parseShellEnv, resolveUserShell, sanitizeImportedEnv } from "./shell-env"

describe("shell env", () => {
  test("parseShellEnv supports null-delimited pairs", () => {
    const env = parseShellEnv(Buffer.from("PATH=/usr/bin:/bin\0FOO=bar=baz\0\0"))

    expect(env.PATH).toBe("/usr/bin:/bin")
    expect(env.FOO).toBe("bar=baz")
  })

  test("parseShellEnv ignores invalid entries", () => {
    const env = parseShellEnv(Buffer.from("INVALID\0=empty\0OK=1\0"))

    expect(Object.keys(env).length).toBe(1)
    expect(env.OK).toBe("1")
  })

  test("mergeShellEnv keeps explicit overrides", () => {
    const env = mergeShellEnv(
      {
        PATH: "/shell/path",
        HOME: "/tmp/home",
      },
      {
        PATH: "/desktop/path",
        OPENCODE_CLIENT: "desktop",
      },
    )

    expect(env.PATH).toBe("/desktop/path")
    expect(env.HOME).toBe("/tmp/home")
    expect(env.OPENCODE_CLIENT).toBe("desktop")
  })

  test("sanitizeImportedEnv drops host OpenCode and XDG roots", () => {
    const env = sanitizeImportedEnv({
      PATH: "/usr/bin",
      OPENCODE_CONFIG: "/Users/me/.config/opencode/config.json",
      OPENCODE_CONFIG_DIR: "/Users/me/.config/opencode",
      XDG_CONFIG_HOME: "/Users/me/.config",
      XDG_DATA_HOME: "/Users/me/.local/share",
      XDG_CACHE_HOME: "/Users/me/.cache",
      XDG_STATE_HOME: "/Users/me/.local/state",
      HOME: "/Users/me",
    })

    expect(env.PATH).toBe("/usr/bin")
    expect(env.HOME).toBe("/Users/me")
    expect(env.OPENCODE_CONFIG).toBeUndefined()
    expect(env.OPENCODE_CONFIG_DIR).toBeUndefined()
    expect(env.XDG_CONFIG_HOME).toBeUndefined()
    expect(env.XDG_DATA_HOME).toBeUndefined()
  })

  test("mergeShellEnv desktop XDG wins over shell XDG", () => {
    const env = mergeShellEnv(
      {
        XDG_CONFIG_HOME: "/Users/me/.config",
        OPENCODE_CONFIG: "/Users/me/.config/opencode/config.json",
        PATH: "/shell/path",
      },
      {
        XDG_CONFIG_HOME: "/tmp/ai.opencode.desktop.dev",
        XDG_DATA_HOME: "/tmp/ai.opencode.desktop.dev",
        XDG_CACHE_HOME: "/tmp/ai.opencode.desktop.dev",
        XDG_STATE_HOME: "/tmp/ai.opencode.desktop.dev",
        OPENCODE_CLIENT: "desktop",
      },
    )

    expect(env.XDG_CONFIG_HOME).toBe("/tmp/ai.opencode.desktop.dev")
    expect(env.XDG_DATA_HOME).toBe("/tmp/ai.opencode.desktop.dev")
    expect(env.OPENCODE_CONFIG).toBeUndefined()
    expect(env.OPENCODE_CLIENT).toBe("desktop")
  })

  test("resolveUserShell falls back to the login shell before /bin/sh", () => {
    expect(resolveUserShell("/custom/env-shell", "/bin/zsh")).toBe("/custom/env-shell")
    expect(resolveUserShell(undefined, "/bin/zsh")).toBe("/bin/zsh")
    expect(resolveUserShell(undefined, "unknown")).toBe("/bin/sh")
    expect(resolveUserShell(undefined, undefined)).toBe("/bin/sh")
  })

  test("isNushell handles path and binary name", () => {
    expect(isNushell("nu")).toBe(true)
    expect(isNushell("/opt/homebrew/bin/nu")).toBe(true)
    expect(isNushell("C:\\Program Files\\nu.exe")).toBe(true)
    expect(isNushell("/bin/zsh")).toBe(false)
  })
})
