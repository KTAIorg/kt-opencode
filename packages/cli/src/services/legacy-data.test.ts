import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FILES, IDENTITY_FILE, legacyDataDirs, migrate } from "./legacy-data"

const roots: string[] = []

afterEach(() => {
  roots.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "legacy-data-"))
  roots.push(root)
  return {
    data: join(root, "xdg", "kito"),
    legacy: join(root, "xdg", "opencode"),
    home: join(root, "home"),
  }
}

function seed(dir: string, files: Record<string, string>) {
  Object.entries(files).forEach(([name, contents]) => {
    const file = join(dir, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, contents)
  })
}

describe("legacy data migration", () => {
  test("copies the Kito file set from the sibling opencode data root", () => {
    const { data, legacy, home } = fixture()
    seed(legacy, {
      [IDENTITY_FILE]: '{"token":"secret"}',
      "ktai-api-key.json": '{"key":"sk-1"}',
      "ktai-models.json": "[]",
      "ktai-spendable.json": "{}",
      "soft-quota.json": "{}",
      "auth.json": '{"openai":{"type":"api","key":"sk-x"}}',
      "opencode.db": "db",
    })

    const result = migrate({ data, home })

    expect(result.migrated).toBe(true)
    expect(result.source).toBe(legacy)
    expect(result.files.sort()).toEqual([...FILES].sort())
    FILES.forEach((name) => expect(existsSync(join(data, name))).toBe(true))
    expect(readFileSync(join(data, IDENTITY_FILE), "utf8")).toBe('{"token":"secret"}')
    // Credentials and databases that belong to OpenCode stay behind.
    expect(existsSync(join(data, "auth.json"))).toBe(false)
    expect(existsSync(join(data, "opencode.db"))).toBe(false)
  })

  test("copies, never moves, so OpenCode keeps its own files", () => {
    const { data, legacy, home } = fixture()
    seed(legacy, { [IDENTITY_FILE]: '{"token":"secret"}' })

    migrate({ data, home })

    expect(readFileSync(join(legacy, IDENTITY_FILE), "utf8")).toBe('{"token":"secret"}')
    expect(readFileSync(join(data, IDENTITY_FILE), "utf8")).toBe('{"token":"secret"}')
    expect(statSync(join(data, IDENTITY_FILE)).mode & 0o777).toBe(0o600)
  })

  test("is a no-op when the kito data root already has an identity file", () => {
    const { data, legacy, home } = fixture()
    seed(data, { [IDENTITY_FILE]: '{"token":"current"}' })
    seed(legacy, { [IDENTITY_FILE]: '{"token":"legacy"}', "ktai-api-key.json": "{}" })

    const result = migrate({ data, home })

    expect(result.migrated).toBe(false)
    expect(readFileSync(join(data, IDENTITY_FILE), "utf8")).toBe('{"token":"current"}')
    expect(existsSync(join(data, "ktai-api-key.json"))).toBe(false)
  })

  test("is a no-op when no legacy directory holds an identity file", () => {
    const { data, legacy, home } = fixture()
    seed(legacy, { "ktai-api-key.json": "{}" })

    const result = migrate({ data, home })

    expect(result.migrated).toBe(false)
    expect(existsSync(join(data, "ktai-api-key.json"))).toBe(false)
  })

  test("never overwrites files already present in the kito root", () => {
    const { data, legacy, home } = fixture()
    seed(data, { "ktai-models.json": '["new"]' })
    seed(legacy, { [IDENTITY_FILE]: "{}", "ktai-models.json": '["old"]' })

    const result = migrate({ data, home })

    expect(result.migrated).toBe(true)
    expect(result.files).not.toContain("ktai-models.json")
    expect(readFileSync(join(data, "ktai-models.json"), "utf8")).toBe('["new"]')
    expect(existsSync(join(data, IDENTITY_FILE))).toBe(true)
  })

  test("falls back to the canonical home data root when the base was reparented", () => {
    const root = mkdtempSync(join(tmpdir(), "legacy-data-"))
    roots.push(root)
    const data = join(root, ".kito", "share", "kito")
    const home = join(root, "home")
    const legacy = join(home, ".local", "share", "opencode")
    seed(legacy, { [IDENTITY_FILE]: "{}" })

    const result = migrate({ data, home })

    expect(result.migrated).toBe(true)
    expect(result.source).toBe(legacy)
  })

  test("legacyDataDirs dedupes the canonical and sibling candidates", () => {
    const home = join("home")
    const dirs = legacyDataDirs(join(home, ".local", "share", "kito"), home)
    expect(dirs).toEqual([join(home, ".local", "share", "opencode")])
  })
})
