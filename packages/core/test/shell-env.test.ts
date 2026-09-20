import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Global } from "@opencode-ai/util/global"
import { Location } from "@opencode-ai/core/location"
import { Shell } from "@opencode-ai/core/shell"
import { tempGlobalLayer } from "./fixture/global"
import { tempLocationLayer } from "./fixture/location"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Shell.node]), [
    [Location.node, tempLocationLayer],
    [Global.node, tempGlobalLayer],
  ]),
)

describe("shell", () => {
  it.live("does not leak Kito credentials into spawned commands", () =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const previous = {
            token: process.env.KTAI_IDENTITY_TOKEN,
            db: process.env.KITO_DB,
            key: process.env.OPENCODE_API_KEY,
            password: process.env.KITO_SERVER_PASSWORD,
          }
          process.env.KTAI_IDENTITY_TOKEN = "shell-secret"
          process.env.KITO_DB = "/tmp/shell-secret.db"
          process.env.OPENCODE_API_KEY = "shell-secret"
          process.env.KITO_SERVER_PASSWORD = "shell-secret"
          return previous
        }),
        (previous) =>
          Effect.sync(() => {
            for (const [name, value] of [
              ["KTAI_IDENTITY_TOKEN", previous.token],
              ["KITO_DB", previous.db],
              ["OPENCODE_API_KEY", previous.key],
              ["KITO_SERVER_PASSWORD", previous.password],
            ] as const) {
              if (value === undefined) delete process.env[name]
              else process.env[name] = value
            }
          }),
      )

      const shell = yield* Shell.Service
      const info = yield* shell.create({
        command:
          'printf "t=%s|d=%s|k=%s|p=%s|m=%s|end\\n" "${KTAI_IDENTITY_TOKEN-unset}" "${KITO_DB-unset}" "${OPENCODE_API_KEY-unset}" "${KITO_SERVER_PASSWORD-unset}" "${OPENCODE_TERMINAL-unset}"',
        timeout: 30_000,
      })
      yield* shell.wait(info.id)
      const out = yield* shell.output(info.id)
      expect(out.output).toContain("t=unset|d=unset|k=unset|p=unset|m=1|end")
      // Captured command output can hold secrets; the spill file must be owner-only.
      if (process.platform !== "win32") {
        const stat = yield* Effect.promise(() => fs.stat(info.file))
        expect(stat.mode & 0o777).toBe(0o600)
      }
    }),
  )
})
