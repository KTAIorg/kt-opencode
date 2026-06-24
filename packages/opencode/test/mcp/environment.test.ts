import path from "node:path"
import { expect } from "bun:test"
import { Effect } from "effect"
import { MCP } from "../../src/mcp/index"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(MCP.defaultLayer)

it.instance(
  "local subprocess receives only baseline and configured environment",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const values = {
        APPDATA: path.join(test.directory, "appdata"),
        LC_TIME: "C",
        OPENCODE_MCP_PARENT_SECRET: "parent-secret",
        PATHEXT: ".EXE;.CMD",
        SYSTEMROOT: path.join(test.directory, "windows"),
        TMPDIR: test.directory,
      }
      const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
      Object.assign(process.env, values)

      yield* MCP.Service.use((mcp) =>
        Effect.gen(function* () {
          const output = path.join(test.directory, "environment.json")
          const result = yield* mcp.add("environment", {
            type: "local",
            command: [process.execPath, path.join(import.meta.dir, "../fixture/mcp-environment.ts")],
            environment: {
              MCP_ENV_OUTPUT: output,
              MCP_EXPLICIT_TOKEN: "configured-token",
            },
          })

          expect(result.status.environment).toEqual({ status: "connected" })
          const env = (yield* Effect.promise(() => Bun.file(output).json())) as Record<string, string>
          expect(env.OPENCODE_MCP_PARENT_SECRET).toBeUndefined()
          expect(env.MCP_EXPLICIT_TOKEN).toBe("configured-token")
          expect(env.PATH).toBe(process.env.PATH!)
          expect(env.HOME).toBe(process.env.HOME!)
          expect(env.TMPDIR).toBe(values.TMPDIR)
          expect(env.LC_TIME).toBe(values.LC_TIME)
          expect(env.APPDATA).toBe(values.APPDATA)
          expect(env.PATHEXT).toBe(values.PATHEXT)
          expect(env.SYSTEMROOT).toBe(values.SYSTEMROOT)
        }).pipe(Effect.ensuring(mcp.disconnect("environment").pipe(Effect.ignore))),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            Object.entries(previous).forEach(([key, value]) => {
              if (value === undefined) delete process.env[key]
              else process.env[key] = value
            })
          }),
        ),
      )
    }),
  { config: { mcp: {} } },
)
