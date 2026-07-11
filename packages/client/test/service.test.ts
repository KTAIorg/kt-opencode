import { NodeFileSystem } from "@effect/platform-node"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Service } from "../src/effect/index"

test("service status distinguishes registration and health states", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-service-inspection-"))
  const file = path.join(root, "service.json")
  const expectedVersion = "0.0.0-client"
  let response = Response.json({ healthy: true, version: expectedVersion, pid: process.pid })
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => response.clone() })
  const inspect = (version: string | null = expectedVersion) =>
    Effect.runPromise(
      Service.status({ file, ...(version === null ? {} : { version }) }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  const discover = (version: string | null) =>
    Effect.runPromise(
      Service.discover({ file, ...(version === null ? {} : { version }) }).pipe(Effect.provide(NodeFileSystem.layer)),
    )
  const registration = (input: { url?: string; pid?: number; version?: string } = {}) => ({
    url: input.url ?? server.url.toString(),
    pid: input.pid ?? process.pid,
    version: input.version ?? expectedVersion,
  })
  const register = (input?: Parameters<typeof registration>[0]) => Bun.write(file, JSON.stringify(registration(input)))

  try {
    expect(await inspect()).toEqual({ status: "stopped" })

    await Bun.write(file, "{")
    expect(await inspect()).toEqual({ status: "invalid", reason: "malformed" })

    await fs.rm(file)
    await fs.mkdir(file)
    expect(await inspect()).toEqual({ status: "invalid", reason: "unreadable" })
    await fs.rm(file, { recursive: true })

    await register({ url: "http://127.0.0.1:1" })
    expect(await inspect()).toEqual({
      status: "unhealthy",
      reason: "unreachable",
      registration: registration({ url: "http://127.0.0.1:1" }),
    })

    await register()
    response = new Response("Unavailable", { status: 503 })
    expect(await inspect()).toEqual({
      status: "unhealthy",
      reason: "http-error",
      registration: registration(),
      statusCode: 503,
    })

    response = new Response("not json")
    expect(await inspect()).toEqual({
      status: "unhealthy",
      reason: "invalid-response",
      registration: registration(),
    })

    response = Response.json({ healthy: true })
    expect(await inspect()).toEqual({ status: "legacy", registration: registration() })

    response = Response.json({ healthy: true, version: "0.0.0-server", pid: process.pid + 1 })
    expect(await inspect()).toEqual({
      status: "inconsistent",
      fields: ["pid", "version"],
      registration: registration(),
      health: { pid: process.pid + 1, version: "0.0.0-server" },
    })

    response = Response.json({ healthy: true, version: "0.0.0-server", pid: process.pid })
    await register({ version: "0.0.0-server" })
    expect(await inspect()).toEqual({
      status: "running",
      url: server.url.toString(),
      pid: process.pid,
      version: "0.0.0-server",
      compatible: false,
    })
    expect(await inspect("0.0.0-server")).toEqual({
      status: "running",
      url: server.url.toString(),
      pid: process.pid,
      version: "0.0.0-server",
      compatible: true,
    })
    expect(await inspect(null)).toEqual({
      status: "running",
      url: server.url.toString(),
      pid: process.pid,
      version: "0.0.0-server",
    })
    expect(await discover(expectedVersion)).toBeUndefined()
    expect((await discover("0.0.0-server"))?.url).toBe(server.url.toString())
    expect((await discover(null))?.url).toBe(server.url.toString())
  } finally {
    server.stop(true)
    await fs.rm(root, { recursive: true, force: true })
  }
})
