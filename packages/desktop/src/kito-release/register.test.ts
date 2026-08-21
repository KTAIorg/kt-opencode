import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ReleaseHttpError, type ReleaseClient, type ReleaseRequest } from "./client"
import { registerKitoRelease } from "./register"

test("registers every mapped artifact and publishes only rollout 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kito-release-"))
  const win = join(dir, "opencode-desktop-win-x64.exe")
  const mac = join(dir, "opencode-desktop-mac-arm64.dmg")
  writeFileSync(win, "windows-installer")
  writeFileSync(mac, "mac-installer")

  const calls: ReleaseRequest[] = []
  const client = fakeClient(calls, {
    "GET /api/v1/admin/apps": { items: [] },
    "POST /api/v1/admin/apps": { appId: "kito" },
    "POST /api/v1/admin/apps/kito/releases": { releaseId: "rel_kito_1_2_3_stable" },
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/artifacts": { artifactId: "art" },
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/publish": {
      status: "published",
      rolloutPercent: 0,
    },
  })

  const result = await registerKitoRelease({
    client,
    version: "v1.2.3",
    repo: "ktaiorg/kt-opencode",
    artifacts: [{ path: win }, { path: mac }, { path: join(dir, "latest.yml") }],
  })

  expect(result).toEqual({
    appId: "kito",
    version: "1.2.3",
    channel: "stable",
    releaseId: "rel_kito_1_2_3_stable",
    artifactIds: ["art", "art"],
    status: "published",
    rolloutPercent: 0,
  })
  expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
    "GET /api/v1/admin/apps",
    "POST /api/v1/admin/apps",
    "POST /api/v1/admin/apps/kito/releases",
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/artifacts",
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/artifacts",
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/publish",
  ])
  expect(calls[1]?.body).toEqual({
    appId: "kito",
    displayName: "Kito",
    supportedPlatforms: ["win32", "darwin", "linux"],
    defaultChannel: "stable",
  })
  expect(asRecord(calls[5]?.body)?.rolloutPercent).toBe(0)
  expect(asRecord(calls[5]?.body)?.confirmHighRisk).toBeUndefined()
})

test("reuses an existing kito app and already-registered rows", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "kito-release-")), "opencode-desktop-linux-x64.AppImage")
  writeFileSync(path, "linux-installer")
  const calls: ReleaseRequest[] = []
  const client = fakeClient(calls, {
    "GET /api/v1/admin/apps": { items: [{ appId: "kito", displayName: "Kito" }] },
    "POST /api/v1/admin/apps/kito/releases": new ReleaseHttpError(409, "already_exists", "release already exists"),
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/artifacts": new ReleaseHttpError(
      409,
      "already_exists",
      "artifact already exists",
    ),
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/publish": {
      status: "published",
      rolloutPercent: 0,
    },
  })

  const result = await registerKitoRelease({
    client,
    version: "1.2.3",
    repo: "ktaiorg/kt-opencode",
    artifacts: [{ path }],
  })
  expect(result.rolloutPercent).toBe(0)
  expect(calls.some((call) => call.path === "/api/v1/admin/apps" && call.method === "POST")).toBe(false)
})

test("treats an already-published rollout 0 release as success", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "kito-release-")), "opencode-desktop-win-x64.exe")
  writeFileSync(path, "windows-installer")
  const client = fakeClient([], {
    "GET /api/v1/admin/apps": { items: [{ appId: "kito" }] },
    "POST /api/v1/admin/apps/kito/releases": { releaseId: "rel_kito_1_2_3_stable" },
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/artifacts": { artifactId: "art_win" },
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/publish": new ReleaseHttpError(
      409,
      "state_conflict",
      "release cannot be published from published",
    ),
    "GET /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable": { status: "published", rolloutPercent: 0 },
  })

  const result = await registerKitoRelease({
    client,
    version: "1.2.3",
    repo: "ktaiorg/kt-opencode",
    artifacts: [{ path }],
  })
  expect(result.rolloutPercent).toBe(0)
  expect(result.status).toBe("published")
})

test("does not publish when an existing release is already above rollout 0", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "kito-release-")), "opencode-desktop-win-x64.exe")
  writeFileSync(path, "windows-installer")
  const client = fakeClient([], {
    "GET /api/v1/admin/apps": { items: [{ appId: "kito" }] },
    "POST /api/v1/admin/apps/kito/releases": { releaseId: "rel_kito_1_2_3_stable" },
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/artifacts": { artifactId: "art_win" },
    "POST /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable/publish": new ReleaseHttpError(
      409,
      "state_conflict",
      "release cannot be published from published",
    ),
    "GET /api/v1/admin/apps/kito/releases/rel_kito_1_2_3_stable": { status: "published", rolloutPercent: 100 },
  })

  await expect(
    registerKitoRelease({
      client,
      version: "1.2.3",
      repo: "ktaiorg/kt-opencode",
      artifacts: [{ path }],
    }),
  ).rejects.toBeInstanceOf(ReleaseHttpError)
})

function fakeClient(calls: ReleaseRequest[], routes: Record<string, unknown>): ReleaseClient {
  return {
    async request(request) {
      calls.push(request)
      const result = routes[`${request.method} ${request.path}`]
      if (result instanceof Error) throw result
      if (result !== undefined) return result
      throw new Error(`unexpected ${request.method} ${request.path}`)
    },
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
}
