import { describe, expect, test } from "bun:test"
import { applyDesktopXdgIsolation, desktopXdgEnv } from "./desktop-xdg"

describe("desktop XDG isolation", () => {
  test("points all XDG roots at userData", () => {
    expect(desktopXdgEnv("/tmp/ai.opencode.desktop.dev")).toEqual({
      XDG_DATA_HOME: "/tmp/ai.opencode.desktop.dev",
      XDG_CONFIG_HOME: "/tmp/ai.opencode.desktop.dev",
      XDG_CACHE_HOME: "/tmp/ai.opencode.desktop.dev",
      XDG_STATE_HOME: "/tmp/ai.opencode.desktop.dev",
    })
  })

  test("overwrites leaked host paths and clears config overrides", () => {
    const env: Record<string, string | undefined> = {
      XDG_CONFIG_HOME: "/Users/me/.config",
      XDG_DATA_HOME: "/Users/me/.local/share",
      OPENCODE_CONFIG: "/Users/me/.config/opencode/config.json",
      OPENCODE_CONFIG_DIR: "/Users/me/.config/opencode",
      PATH: "/usr/bin",
    }

    applyDesktopXdgIsolation(env, "/tmp/ai.opencode.desktop.dev")

    expect(env.XDG_CONFIG_HOME).toBe("/tmp/ai.opencode.desktop.dev")
    expect(env.XDG_DATA_HOME).toBe("/tmp/ai.opencode.desktop.dev")
    expect(env.XDG_CACHE_HOME).toBe("/tmp/ai.opencode.desktop.dev")
    expect(env.XDG_STATE_HOME).toBe("/tmp/ai.opencode.desktop.dev")
    expect(env.OPENCODE_CONFIG).toBeUndefined()
    expect(env.OPENCODE_CONFIG_DIR).toBeUndefined()
    expect(env.PATH).toBe("/usr/bin")
  })
})
