import { describe, expect, test } from "bun:test"

import { isSensitiveEnvName, sanitizeChildEnv } from "../src/kito-env.js"

describe("sanitizeChildEnv", () => {
  test("strips KTAI_* and credential-shaped KITO_*/OPENCODE_* entries", () => {
    const env = sanitizeChildEnv({
      PATH: "/usr/bin",
      HOME: "/home/me",
      KTAI_IDENTITY_TOKEN: "ktai-token",
      KTAI_API_KEY: "ktai-key",
      KTAI_MANAGED_TOKEN_NAME: "managed",
      KITO_DB: "/data/opencode.db",
      OPENCODE_DB: "/data/opencode.db",
      OPENCODE_API_KEY: "oc-key",
      OPENCODE_SERVER_PASSWORD: "oc-password",
      OPENCODE_AUTH_CONTENT: "{}",
      KITO_SERVER_PASSWORD: "kito-password",
      KITO_SESSION_SECRET: "kito-secret",
      KITO_TERMINAL: "1",
      OPENCODE_TERMINAL: "1",
      KITO_CONFIG_DIR: "/config",
      KITO_TEST_HOME: "/home/me",
      OPENCODE_VERSION: "1.0.0",
      AWS_SECRET_ACCESS_KEY: "ambient",
    })

    expect(env.PATH).toBe("/usr/bin")
    expect(env.HOME).toBe("/home/me")
    expect(env.KTAI_IDENTITY_TOKEN).toBeUndefined()
    expect(env.KTAI_API_KEY).toBeUndefined()
    expect(env.KTAI_MANAGED_TOKEN_NAME).toBeUndefined()
    expect(env.KITO_DB).toBeUndefined()
    expect(env.OPENCODE_DB).toBeUndefined()
    expect(env.OPENCODE_API_KEY).toBeUndefined()
    expect(env.OPENCODE_SERVER_PASSWORD).toBeUndefined()
    expect(env.OPENCODE_AUTH_CONTENT).toBeUndefined()
    expect(env.KITO_SERVER_PASSWORD).toBeUndefined()
    expect(env.KITO_SESSION_SECRET).toBeUndefined()
    // Terminal markers and non-credential selectors still propagate.
    expect(env.KITO_TERMINAL).toBe("1")
    expect(env.OPENCODE_TERMINAL).toBe("1")
    expect(env.KITO_CONFIG_DIR).toBe("/config")
    expect(env.KITO_TEST_HOME).toBe("/home/me")
    expect(env.OPENCODE_VERSION).toBe("1.0.0")
    // Non-namespaced ambient variables pass through untouched.
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("ambient")
  })
})

describe("isSensitiveEnvName", () => {
  test("matches credential-shaped names only", () => {
    for (const name of [
      "OPENAI_API_KEY",
      "GITHUB_TOKEN",
      "AWS_SECRET_ACCESS_KEY",
      "DB_PASSWORD",
      "OAUTH_CLIENT_CREDENTIALS",
      "MY_AUTH_HEADER",
    ]) {
      expect(isSensitiveEnvName(name)).toBe(true)
    }
    for (const name of ["PATH", "HOME", "LANG", "KITO_CONFIG_DIR", "OPENCODE_VERSION"]) {
      expect(isSensitiveEnvName(name)).toBe(false)
    }
  })
})
