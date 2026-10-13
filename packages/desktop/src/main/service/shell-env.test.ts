import { describe, expect, test } from "bun:test"
import { NodePath } from "@effect/platform-node"
import { Effect } from "effect"

import { applyShellEnvironment, sanitizeImportedEnv, isNushell, parseShellEnv, resolveUserShell } from "./shell-env"

describe("shell env", () => {
  test("parseShellEnv reads null-delimited pairs and ignores invalid entries", () => {
    expect(parseShellEnv(Buffer.from("PATH=/usr/bin:/bin\0FOO=bar=baz\0\0INVALID\0=empty\0OK=1\0"))).toEqual({
      PATH: "/usr/bin:/bin",
      FOO: "bar=baz",
      OK: "1",
    })
  })

  test("sanitizeImportedEnv drops host OpenCode, XDG roots, and AI API keys", () => {
    const env = sanitizeImportedEnv({
      PATH: "/usr/bin",
      KITO_CONFIG: "/Users/me/.config/opencode/config.json",
      KITO_CONFIG_DIR: "/Users/me/.config/opencode",
      KITO_DB: "/Users/me/.local/share/opencode/opencode.db",
      OPENCODE_CONFIG: "/Users/me/.config/opencode/config.json",
      OPENCODE_CONFIG_DIR: "/Users/me/.config/opencode",
      XDG_CONFIG_HOME: "/Users/me/.config",
      XDG_DATA_HOME: "/Users/me/.local/share",
      XDG_CACHE_HOME: "/Users/me/.cache",
      XDG_STATE_HOME: "/Users/me/.local/state",
      OPENAI_API_KEY: "sk-host",
      OPENAI_BASE_URL: "https://sub2api.example/v1",
      KTAI_API_KEY: "sk-ktai-host",
      ANTHROPIC_API_KEY: "sk-ant-host",
      OPENROUTER_API_KEY: "sk-or-host",
      HOME: "/Users/me",
    })

    expect(env.PATH).toBe("/usr/bin")
    expect(env.HOME).toBe("/Users/me")
    expect(env.KITO_CONFIG).toBeUndefined()
    expect(env.KITO_CONFIG_DIR).toBeUndefined()
    expect(env.KITO_DB).toBeUndefined()
    expect(env.OPENCODE_CONFIG).toBeUndefined()
    expect(env.OPENCODE_CONFIG_DIR).toBeUndefined()
    expect(env.XDG_CONFIG_HOME).toBeUndefined()
    expect(env.XDG_DATA_HOME).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBeUndefined()
    expect(env.KTAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.OPENROUTER_API_KEY).toBeUndefined()
  })

  test("mergeShellEnv desktop XDG wins over shell XDG", () => {
    const env = applyShellEnvironment(
      {},
      {
        XDG_CONFIG_HOME: "/Users/me/.config",
        OPENCODE_CONFIG: "/Users/me/.config/opencode/config.json",
        PATH: "/shell/path",
      },
      {
        XDG_CONFIG_HOME: "/tmp/cc.ktapi.desktop.dev",
        XDG_DATA_HOME: "/tmp/cc.ktapi.desktop.dev",
        XDG_CACHE_HOME: "/tmp/cc.ktapi.desktop.dev",
        XDG_STATE_HOME: "/tmp/cc.ktapi.desktop.dev",
        OPENCODE_CLIENT: "desktop",
      },
    )

    expect(env.XDG_CONFIG_HOME).toBe("/tmp/cc.ktapi.desktop.dev")
    expect(env.XDG_DATA_HOME).toBe("/tmp/cc.ktapi.desktop.dev")
    expect(env.OPENCODE_CONFIG).toBeUndefined()
    expect(env.OPENCODE_CLIENT).toBe("desktop")
  })

  test("resolveUserShell falls back to the login shell before /bin/sh", () => {
    expect(resolveUserShell("/custom/env-shell", "/bin/zsh")).toBe("/custom/env-shell")
    expect(resolveUserShell(undefined, "/bin/zsh")).toBe("/bin/zsh")
    expect(resolveUserShell(undefined, "unknown")).toBe("/bin/sh")
    expect(resolveUserShell(undefined, undefined)).toBe("/bin/sh")
  })

  test("applyShellEnvironment drops host OpenAI keys from the login shell", () => {
    const env = applyShellEnvironment(
      { PATH: "/usr/bin", HOME: "/tmp/home" },
      {
        PATH: "/shell/path",
        OPENAI_API_KEY: "sk-from-zsh",
        OPENAI_BASE_URL: "https://sub2api.ktyun.cc/v1",
      },
    )

    expect(env.PATH).toBe("/shell/path")
    expect(env.HOME).toBe("/tmp/home")
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.OPENAI_BASE_URL).toBeUndefined()
  })

  test("applyShellEnvironment drops host OpenCode and XDG roots from the login shell", () => {
    const env = applyShellEnvironment(
      { PATH: "/desktop/path", HOME: "/tmp/home" },
      {
        PATH: "/shell/path",
        XDG_DATA_HOME: "/Users/me/.local/share",
        XDG_STATE_HOME: "/Users/me/.local/state",
        KITO_CONFIG: "/Users/me/.config/opencode/config.json",
        KITO_CONFIG_DIR: "/Users/me/.config/opencode",
        KITO_DB: "/Users/me/.local/share/opencode/opencode.db",
        OPENCODE_CONFIG: "/Users/me/.config/opencode/config.json",
        OPENCODE_CONFIG_DIR: "/Users/me/.config/opencode",
        OPENCODE_DB: "/Users/me/.local/share/opencode/opencode.db",
      },
    )

    expect(env.PATH).toBe("/shell/path")
    expect(env.XDG_DATA_HOME).toBeUndefined()
    expect(env.XDG_STATE_HOME).toBeUndefined()
    expect(env.KITO_CONFIG).toBeUndefined()
    expect(env.KITO_CONFIG_DIR).toBeUndefined()
    expect(env.KITO_DB).toBeUndefined()
    expect(env.OPENCODE_CONFIG).toBeUndefined()
    expect(env.OPENCODE_CONFIG_DIR).toBeUndefined()
    expect(env.OPENCODE_DB).toBeUndefined()
  })

  test("applyShellEnvironment keeps keys already set on the process", () => {
    const env = applyShellEnvironment(
      { OPENAI_API_KEY: "sk-explicit" },
      { OPENAI_API_KEY: "sk-from-zsh", OPENAI_BASE_URL: "https://sub2api.ktyun.cc/v1" },
    )

    expect(env.OPENAI_API_KEY).toBe("sk-explicit")
    expect(env.OPENAI_BASE_URL).toBeUndefined()
  })

  test("isNushell handles path and binary name", () => {
    const check = (shell: string) => Effect.runSync(isNushell(shell).pipe(Effect.provide(NodePath.layer)))
    expect(check("nu")).toBe(true)
    expect(check("/opt/homebrew/bin/nu")).toBe(true)
    expect(check("C:\\Program Files\\nu.exe")).toBe(true)
    expect(check("/bin/zsh")).toBe(false)
  })
})
