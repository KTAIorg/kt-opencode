import { describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import path from "node:path"
import opencodeTheme from "./themes/opencode.json"

describe("built-in desktop themes", () => {
  test("opencode theme keeps its id but presents the Kito Classic name", () => {
    expect(opencodeTheme.id).toBe("opencode")
    expect(opencodeTheme.name).toBe("Kito Classic")
  })

  test("no bundled theme is named OpenCode", () => {
    const dir = path.join(import.meta.dir, "themes")
    const themes = readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => Bun.file(path.join(dir, file)).json() as Promise<{ name?: string }>)
    return Promise.all(themes).then((all) => {
      for (const theme of all) expect(theme.name ?? "").not.toContain("OpenCode")
    })
  })
})
