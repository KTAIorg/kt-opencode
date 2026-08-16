import { describe, expect, test } from "bun:test"

const locales = [
  "en",
  "ar",
  "br",
  "bs",
  "da",
  "de",
  "es",
  "fr",
  "ja",
  "ko",
  "no",
  "pl",
  "ru",
  "uk",
  "th",
  "tr",
  "zh",
  "zht",
] as const

const allowed = /opencode\.ai\/zen|opencode\.json/g
const otherProviderPitch = /75\+|75 |claude|gpt|gemini|any provider|任意提供|任意提供者|herhangi bir sağlayıcı/i

describe("Kito customer-facing copy", () => {
  test("locale values do not say OpenCode", async () => {
    for (const locale of locales) {
      const module: { dict: Record<string, string> } = await import(`./${locale}.ts`)
      for (const [key, value] of Object.entries(module.dict)) {
        const stripped = value.replace(allowed, "")
        expect({ locale, key, openCode: stripped.includes("OpenCode") }).toEqual({
          locale,
          key,
          openCode: false,
        })
      }
    }
  })

  test("home tip and getting started do not advertise other providers", async () => {
    for (const locale of locales) {
      const module: { dict: Record<string, string> } = await import(`./${locale}.ts`)
      for (const key of ["home.providerTip", "sidebar.gettingStarted.line2"] as const) {
        expect(module.dict[key]).toBeDefined()
        expect({ locale, key, pitchesOtherProviders: otherProviderPitch.test(module.dict[key]) }).toEqual({
          locale,
          key,
          pitchesOtherProviders: false,
        })
      }
    }
  })

  test("desktop product name is Kito", async () => {
    for (const locale of locales) {
      const module: { dict: Record<string, string> } = await import(`./${locale}.ts`)
      expect(module.dict["app.name.desktop"]).toBe("Kito")
    }
  })

  test("desktop updater and CLI copy do not say OpenCode", async () => {
    const desktopLocales = locales.filter((locale) => locale !== "th" && locale !== "tr")
    for (const locale of desktopLocales) {
      const module: { dict: Record<string, string> } = await import(
        `../../../desktop/src/renderer/i18n/${locale}.ts`
      )
      for (const [key, value] of Object.entries(module.dict)) {
        expect({ locale, key, openCode: value.includes("OpenCode") }).toEqual({
          locale,
          key,
          openCode: false,
        })
      }
    }
  })
})
