import { expect, test } from "bun:test"
import { selectKitoUpdaterSource } from "./feed"

test("keeps GitHub updates before Release Service has a published history", async () => {
  const source = await selectKitoUpdaterSource({
    currentVersion: "1.0.0",
    platform: "win32",
    arch: "x64",
    fetchImpl: async (input) => {
      expect(String(input)).toContain("/apps/kito/releases/history")
      return json({ items: [] })
    },
  })
  expect(source).toEqual({ kind: "github" })
})

test("holds when Release Service is live but the device is outside rollout", async () => {
  const source = await selectKitoUpdaterSource({
    currentVersion: "1.0.0",
    platform: "darwin",
    arch: "arm64",
    channel: "stable",
    fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes("/releases/history")) return json({ items: [{ version: "1.2.3" }] })
      expect(url).toContain("/updates/resolve")
      expect(JSON.parse(String(init?.body))).toMatchObject({
        currentVersion: "1.0.0",
        channel: "stable",
        platform: "darwin",
        arch: "arm64",
      })
      return json({ decision: "no_update" })
    },
  })
  expect(source).toEqual({ kind: "hold" })
})

test("uses the Release Service generic feed when an update is assigned", async () => {
  const source = await selectKitoUpdaterSource({
    currentVersion: "1.0.0",
    platform: "linux",
    arch: "x64",
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.includes("/releases/history")) return json({ data: { items: [{ version: "1.2.3" }] } })
      return json({
        data: {
          decision: "update_available",
          targetVersion: "1.2.3",
          feed: { provider: "generic", baseUrl: "https://download.example/kito/1.2.3/" },
        },
      })
    },
  })
  expect(source).toEqual({
    kind: "generic",
    baseUrl: "https://download.example/kito/1.2.3/",
    version: "1.2.3",
  })
})

test("falls back to GitHub when the public Release Service entry is unreachable", async () => {
  const source = await selectKitoUpdaterSource({
    currentVersion: "1.0.0",
    platform: "win32",
    arch: "x64",
    fetchImpl: async () => {
      throw new Error("network")
    },
  })
  expect(source).toEqual({ kind: "github" })
})

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}
