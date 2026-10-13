import { describe, expect, test } from "bun:test"
import { isValidWslDistroName } from "./distro"

describe("isValidWslDistroName", () => {
  test("accepts real distro names", () => {
    for (const name of ["Ubuntu", "Ubuntu-24.04", "Debian", "kali-linux", "docker-desktop", "openSUSE.Tumbleweed"]) {
      expect(isValidWslDistroName(name)).toBe(true)
    }
  })

  test("rejects flags, separators, and shell metacharacters", () => {
    for (const name of [
      "-d",
      "--status",
      "-Ubuntu",
      "a b",
      "a&calc.exe",
      "a|b",
      "a/b",
      "a\\b",
      "",
      'a"b',
      "a$b",
      "a;b",
    ]) {
      expect(isValidWslDistroName(name)).toBe(false)
    }
  })
})
