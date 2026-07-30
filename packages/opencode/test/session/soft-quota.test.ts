import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { SoftQuota } from "../../src/session/soft-quota"
import { SessionRetry } from "../../src/session/retry"

const tmpDirs: string[] = []

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-soft-quota-"))
  tmpDirs.push(dir)
  return path.join(dir, "soft-quota.json")
}

afterEach(() => {
  delete process.env.OPENCODE_DISABLE_SOFT_QUOTA
  delete process.env.OPENCODE_SOFT_QUOTA_LIMIT
  delete process.env.OPENCODE_SOFT_QUOTA_PATH
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("SoftQuota", () => {
  test("detects free Zen models only", () => {
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode", cost: { input: 0 } })).toBe(true)
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode", cost: { input: 1 } })).toBe(false)
    expect(SoftQuota.isZenFreeModel({ providerID: "ktai", cost: { input: 0 } })).toBe(false)
    expect(SoftQuota.isZenFreeModel({ providerID: "opencode-go", cost: { input: 0 } })).toBe(false)
    expect(SoftQuota.isZenFreeModel(undefined)).toBe(false)
  })

  test("persists counts and half-stops at limit", () => {
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

    const raw = JSON.parse(fs.readFileSync(file, "utf8"))
    expect(raw).toEqual({ version: 1, zenFreeChats: 3 })
  })

  test("default limit is 100", () => {
    expect(SoftQuota.DEFAULT_LIMIT).toBe(100)
    expect(SoftQuota.limit()).toBe(100)
  })

  test("can disable soft quota via env", () => {
    process.env.OPENCODE_DISABLE_SOFT_QUOTA = "1"
    const file = tempFile()
    for (let i = 0; i < 5; i++) SoftQuota.increment(file)
    expect(SoftQuota.exhausted(file)).toBe(false)
    expect(SoftQuota.limit()).toBe(Number.POSITIVE_INFINITY)
  })

  test("reset clears counter", () => {
    const file = tempFile()
    process.env.OPENCODE_SOFT_QUOTA_LIMIT = "1"
    SoftQuota.increment(file)
    expect(SoftQuota.exhausted(file)).toBe(true)
    SoftQuota.reset(file)
    expect(SoftQuota.count(file)).toBe(0)
    expect(SoftQuota.exhausted(file)).toBe(false)
  })

  test("retry status reuses KT wallet CTA", () => {
    const status = SoftQuota.retryStatus("opencode")
    expect(status.type).toBe("retry")
    expect(status.action).toEqual(SessionRetry.freeTierTopupAction("opencode"))
    expect(status.action?.link).toBe("https://www.ktapi.cc/wallet")
    expect(status.action?.reason).toBe("free_tier_limit")
  })
})
