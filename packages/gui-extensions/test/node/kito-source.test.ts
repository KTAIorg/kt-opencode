import { expect, test } from "bun:test"
import { selectKitoUpdaterSource } from "../../src/updater/kito-source"

const cases = [
  { decision: "no_update", version: undefined, expected: { kind: "hold" } },
  { decision: "blocked", version: "2.1.19", expected: { kind: "hold" } },
  {
    decision: "update_available",
    version: "2.1.19",
    expected: {
      kind: "generic",
      version: "2.1.19",
      baseUrl: "https://github.com/KTAIorg/kt-opencode/releases/download/kito-v2.1.19/",
    },
  },
  {
    decision: "force_update",
    version: "2.1.20-beta.1",
    expected: {
      kind: "generic",
      version: "2.1.20-beta.1",
      baseUrl: "https://github.com/KTAIorg/kt-opencode/releases/download/kito-v2.1.20-beta.1/",
    },
  },
] as const

test.each([...cases])("Kito assignment $decision pins its target manifest", async ({ decision, version, expected }) => {
  const requests: { currentVersion: string; channel: string; platform: string; arch: string; deviceId: string }[] = []

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(request.method).toBe("POST")
      expect(new URL(request.url).pathname).toBe("/api/v1/apps/kito/updates/resolve")
      requests.push(await request.json())

      return Response.json({
        data: { decision, targetVersion: version, feed: { baseUrl: "https://download.ktai.im/kt/win10" } },
      })
    },
  })

  try {
    expect(
      await selectKitoUpdaterSource({
        currentVersion: "2.1.16",
        channel: " Stable ",
        platform: "win32",
        arch: "x64",
        deviceId: "installation-1",
        publicBaseUrl: server.url.href,
      }),
    ).toEqual(expected)
    expect(requests).toEqual([
      expect.objectContaining({
        currentVersion: "2.1.16",
        channel: "stable",
        platform: "win32",
        arch: "x64",
        deviceId: "installation-1",
      }),
    ])
  } finally {
    await server.stop(true)
  }
})

test.each([undefined, "../../official", "2.1.19/evil"])(
  "rejects invalid assigned version %s",
  async (targetVersion) => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ data: { decision: "update_available", targetVersion } }),
    })

    try {
      await expect(
        selectKitoUpdaterSource({
          currentVersion: "2.1.16",
          platform: "darwin",
          arch: "arm64",
          publicBaseUrl: server.url.href,
        }),
      ).rejects.toThrow("invalid target version")
    } finally {
      await server.stop(true)
    }
  },
)

test("assignment failure cannot fall back to an ungated latest release", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status: 503 }) })

  try {
    await expect(
      selectKitoUpdaterSource({
        currentVersion: "2.1.16",
        platform: "win32",
        arch: "x64",
        publicBaseUrl: server.url.href,
      }),
    ).rejects.toThrow("503")
  } finally {
    await server.stop(true)
  }
})
