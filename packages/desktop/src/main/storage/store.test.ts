import { describe, expect, test } from "bun:test"
import { assertStoreName, getStore } from "./store"

describe("store name validation", () => {
  test("accepts the flat store names the renderer uses", () => {
    for (const name of [
      "opencode.settings",
      "opencode.updater",
      "opencode.global.dat",
      "opencode.window.3f6d4b8e-5c9f-4e57-a3b2-1234567890ab.dat",
      "opencode.workspace.a1b2c3.d4e5f6.dat",
      "opencode.draft.a1b2c3.d4e5f6.dat",
      "opencode.workspace.-Users-fuwuq.1a2b3c.dat",
      "opencode.draft.My-Draft-ID.2z9x.dat",
    ]) {
      expect(() => assertStoreName(name)).not.toThrow()
    }
  })

  test("rejects names that could escape the userData directory", () => {
    for (const name of [
      "..",
      "../outside",
      "..\\outside",
      "a/b",
      "a\\b",
      "opencode..dat",
      "a..b",
      "",
      ".",
      "has space",
      "name%",
      "name?",
    ]) {
      expect(() => assertStoreName(name)).toThrow("Invalid store name")
    }
  })

  test("getStore refuses traversal names before touching the filesystem", () => {
    for (const name of ["../evil", "..\\evil", "nested/store"]) {
      expect(() => getStore(name)).toThrow("Invalid store name")
    }
  })
})
