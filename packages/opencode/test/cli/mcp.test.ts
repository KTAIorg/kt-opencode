import { describe, expect } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import { cliIt } from "../lib/cli-process"

describe("opencode mcp", () => {
  cliIt.live(
    "adds MCP servers from inline arguments",
    ({ home, opencode }) =>
      Effect.gen(function* () {
        const result = yield* opencode.spawn([
          "mcp",
          "add",
          "github",
          "https://api.githubcopilot.com/mcp",
          "--type",
          "remote",
          "--header",
          "Authorization: Bearer test-token",
          "--global",
        ])
        opencode.expectExit(result, 0, "opencode mcp add remote")

        expect(yield* Effect.promise(() => Bun.file(path.join(home, ".config/opencode/opencode.json")).json())).toEqual(
          {
            mcp: {
              github: {
                type: "remote",
                url: "https://api.githubcopilot.com/mcp",
                headers: {
                  Authorization: "Bearer test-token",
                },
              },
            },
          },
        )

        const local = yield* opencode.spawn([
          "mcp",
          "add",
          "everything",
          "--env",
          "FOO=bar",
          "--global",
          "--",
          "npx",
          "-y",
          "@modelcontextprotocol/server-everything",
        ])
        opencode.expectExit(local, 0, "opencode mcp add local")

        expect(
          yield* Effect.promise(() => Bun.file(path.join(home, ".config/opencode/opencode.json")).json()),
        ).toMatchObject({
          mcp: {
            everything: {
              type: "local",
              command: ["npx", "-y", "@modelcontextprotocol/server-everything"],
              environment: {
                FOO: "bar",
              },
            },
          },
        })

        const missingSeparator = yield* opencode.spawn(["mcp", "add", "bad-local", "node", "server.js", "--global"])
        expect(missingSeparator.exitCode).not.toBe(0)
        expect(missingSeparator.stderr).toContain("Local MCP commands must be passed after --")
      }),
    120_000,
  )
})
