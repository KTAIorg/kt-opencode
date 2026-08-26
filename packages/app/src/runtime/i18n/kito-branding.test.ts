import { describe, expect, test } from "bun:test"

const locales = ["en", "zh", "zht"] as const

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
})
