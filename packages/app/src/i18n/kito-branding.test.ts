import { describe, expect, test } from "bun:test"
import { DESKTOP_NATIVE_ENGLISH } from "./desktop-native"

const locales = ["en", "zh", "zht"] as const

const wslOpencodeKeys = [
  "desktop.wsl.error.installOpencode",
  "desktop.wsl.error.opencodeMissing",
  "desktop.wsl.error.opencodeCannotRun",
  "desktop.wsl.error.opencodeNotInstalled",
] as const satisfies readonly (keyof typeof DESKTOP_NATIVE_ENGLISH)[]

describe("Kito customer-facing copy", () => {
  test("primary locales do not advertise other providers on home or getting started", async () => {
    const pitch = /75\+|75 |claude|gpt|gemini|any provider|任意提供|任意提供者/i
    for (const locale of locales) {
      const module: { dict: Record<string, string> } = await import(`./${locale}.ts`)
      expect(module.dict["app.name.desktop"]).toBe("Kito")
      expect(module.dict["home.providerTip"]).toContain("Kito")
      expect(module.dict["sidebar.gettingStarted.line1"]).toContain("Kito")
      expect(module.dict["sidebar.gettingStarted.line2"]).toContain("Kito")
      expect(pitch.test(module.dict["home.providerTip"])).toBe(false)
      expect(pitch.test(module.dict["sidebar.gettingStarted.line2"])).toBe(false)
    }
  })

  test("desktop product name is Kito across app locales", async () => {
    const files = new Bun.Glob("*.ts").scanSync({ cwd: import.meta.dir })
    for (const file of files) {
      if (file.endsWith(".test.ts") || file === "desktop-native.ts") continue
      const module: { dict?: Record<string, string> } = await import(`./${file}`)
      if (!module.dict?.["app.name.desktop"]) continue
      expect({ file, name: module.dict["app.name.desktop"] }).toEqual({ file, name: "Kito" })
    }
  })

  test("WSL install/run errors name Kito, never opencode, in every locale", async () => {
    for (const key of wslOpencodeKeys) {
      const value = DESKTOP_NATIVE_ENGLISH[key]
      expect({ key, value }).toEqual({ key, value: expect.stringContaining("Kito") })
      expect(/opencode/i.test(value)).toBe(false)
    }
    const files = new Bun.Glob("*.ts").scanSync({ cwd: import.meta.dir })
    for (const file of files) {
      if (file.endsWith(".test.ts") || file === "desktop-native.ts") continue
      const module: { dict?: Record<string, string> } = await import(`./${file}`)
      for (const key of wslOpencodeKeys) {
        const value = module.dict?.[key]
        // Locales without an override fall back to DESKTOP_NATIVE_ENGLISH above.
        if (!value) continue
        expect({ file, key, value }).toEqual({ file, key, value: expect.stringContaining("Kito") })
        expect({ file, key, residual: /opencode/i.test(value) }).toEqual({ file, key, residual: false })
      }
    }
  })
})
