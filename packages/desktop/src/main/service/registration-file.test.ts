import { describe, expect, test } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import { registrationFileName } from "./registration-file"

// The bundled CLI bakes OPENCODE_CHANNEL=prod and names its registration file
// service-prod.json (packages/cli/src/services/service-config.ts). The desktop
// app must poll the same file or Service.ensure times out waiting for a
// healthy server that already exists.
describe("registration file name", () => {
  test("prod build reads service-prod.json in the XDG state dir", () => {
    expect(registrationFileName("prod", true)).toBe(
      join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "opencode", "service-prod.json"),
    )
  })

  test("dev and beta keep the shared service.json fallback", () => {
    expect(registrationFileName("dev", true)).toBeUndefined()
    expect(registrationFileName("beta", true)).toBeUndefined()
  })

  test("development builds keep the fallback", () => {
    expect(registrationFileName("local", false)).toBeUndefined()
    expect(registrationFileName("prod", false)).toBeUndefined()
  })
})
