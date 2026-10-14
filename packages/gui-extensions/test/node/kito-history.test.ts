import { expect, test } from "bun:test"
import { loadKitoReleaseHighlights } from "../../src/updater/kito-history"

const input = {
  previous: "2.1.18",
  current: "2.1.21",
  channel: "stable",
  locale: "zh-CN",
  signal: new AbortController().signal,
}

test("Kito notes use the requested locale and channel, excluding future and already-seen versions", async () => {
  const requests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests.push(request.url)
      return Response.json({
        data: {
          appId: "kito",
          channel: "stable",
          items: [
            { version: "2.1.22", notes: ["future release"] },
            { version: "2.1.19", notes: ["恢复 Kito 更新源"] },
            { version: "2.1.18", notes: ["already seen"] },
            { version: "kito-v2.1.21", notes: ["  Kito 自有发行说明  ", "", "保留现有数据"] },
            { version: "2.1.17", notes: ["old release"] },
            { version: "2.1.21", notes: ["duplicate"] },
            { version: "invalid", notes: ["malformed"] },
            { version: "2.1.20", notes: [" "] },
          ],
        },
      })
    },
  })

  try {
    expect(await loadKitoReleaseHighlights({ ...input, publicBaseUrl: server.url.href })).toEqual([
      { version: "2.1.21", description: "Kito 自有发行说明\n保留现有数据" },
      { version: "2.1.19", description: "恢复 Kito 更新源" },
    ])
    const url = new URL(requests[0]!)
    expect(url.pathname).toBe("/api/v1/apps/kito/releases/history")
    expect(url.searchParams.get("channel")).toBe("stable")
    expect(url.searchParams.get("locale")).toBe("zh-CN")
    expect(requests).toHaveLength(1)
  } finally {
    await server.stop(true)
  }
})

test.each(["2.1.21", "2.1.22"])("same-version or rollback from %s has no new notes", async (previous) => {
  expect(await loadKitoReleaseHighlights({ ...input, previous, publicBaseUrl: "http://127.0.0.1:1" })).toEqual([])
})

test("numeric and prerelease versions are ordered by SemVer, with at most five releases", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        data: {
          appId: "kito",
          channel: "beta",
          items: ["2.1.9", "2.1.10", "2.1.11", "2.1.12", "2.1.13-beta.1", "2.1.13", "2.1.8"].map((version) => ({
            version,
            notes: [version],
          })),
        },
      }),
  })

  try {
    const notes = await loadKitoReleaseHighlights({
      ...input,
      previous: "v2.1.7",
      current: "v2.1.13-beta.1",
      channel: "beta",
      publicBaseUrl: server.url.href,
    })
    expect(notes.map((note) => note.version)).toEqual(["2.1.13-beta.1", "2.1.12", "2.1.11", "2.1.10", "2.1.9"])
  } finally {
    await server.stop(true)
  }
})

test.each([
  { appId: "opencode", channel: "stable", items: [] },
  { appId: "kito", channel: "beta", items: [] },
  { appId: "kito", channel: "stable", items: [{ version: "2.1.21", notes: "invalid" }] },
])("foreign or malformed release history is rejected", async (data) => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ data }) })

  try {
    await expect(loadKitoReleaseHighlights({ ...input, publicBaseUrl: server.url.href })).rejects.toThrow()
  } finally {
    await server.stop(true)
  }
})

test("history HTTP failures are rejected so the UI can retry next start", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status: 503 }) })

  try {
    await expect(loadKitoReleaseHighlights({ ...input, publicBaseUrl: server.url.href })).rejects.toThrow("503")
  } finally {
    await server.stop(true)
  }
})

test("an aborted renderer cannot finish fetching release notes", async () => {
  const signal = AbortSignal.abort()
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({}) })

  try {
    await expect(loadKitoReleaseHighlights({ ...input, signal, publicBaseUrl: server.url.href })).rejects.toThrow()
  } finally {
    await server.stop(true)
  }
})
