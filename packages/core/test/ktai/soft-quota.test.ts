import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { SoftQuota } from "../../src/ktai/soft-quota"

const files: string[] = []

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-soft-quota-"))
  files.push(dir)
  return path.join(dir, "soft-quota.json")
}

afterEach(() => {
  delete process.env.OPENCODE_SOFT_QUOTA_LIMIT
  delete process.env.OPENCODE_DISABLE_SOFT_QUOTA
  for (const dir of files.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("SoftQuota", () => {
  test("only counts free Zen models", () => {
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode", cost: { input: 0 } })).toBe(true)
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode", cost: [{ input: 0 }] })).toBe(true)
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode", cost: { input: 1 } })).toBe(false)
    expect(SoftQuota.isZenFreeModel({ providerID: "ktai", cost: { input: 0 } })).toBe(false)
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode-go", cost: { input: 0 } })).toBe(false)
    expect(SoftQuota.isZenFreeModel(undefined)).toBe(false)
  })

  test("counts chats until the local limit", () => {
    const file = tempFile()
    process.env.OPENCODE_SOFT_QUOTA_LIMIT = "3"
    expect(SoftQuota.count(file)).toBe(0)
    expect(SoftQuota.exhausted(file)).toBe(false)
    SoftQuota.increment(file)
    SoftQuota.increment(file)
    expect(SoftQuota.count(file)).toBe(2)
    expect(SoftQuota.exhausted(file)).toBe(false)
    SoftQuota.increment(file)
    expect(SoftQuota.count(file)).toBe(3)
    expect(SoftQuota.exhausted(file)).toBe(true)
  })

  test("defaults to 100 chats", () => {
    expect(SoftQuota.DEFAULT_LIMIT).toBe(100)
    expect(SoftQuota.limit()).toBe(100)
  })

  test("can be disabled", () => {
    const file = tempFile()
    process.env.OPENCODE_DISABLE_SOFT_QUOTA = "1"
    for (let i = 0; i < 5; i++) SoftQuota.increment(file)
    expect(SoftQuota.exhausted(file)).toBe(false)
    expect(SoftQuota.limit()).toBe(Number.POSITIVE_INFINITY)
  })

  test("reset clears the counter", () => {
    const file = tempFile()
    process.env.OPENCODE_SOFT_QUOTA_LIMIT = "1"
    SoftQuota.increment(file)
    expect(SoftQuota.exhausted(file)).toBe(true)
    SoftQuota.reset(file)
    expect(SoftQuota.count(file)).toBe(0)
    expect(SoftQuota.exhausted(file)).toBe(false)
  })
})
