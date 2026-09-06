#!/usr/bin/env bun
import { $ } from "bun"

import { copyBuiltCliToResources, downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

if (channel === "dev") await downloadCliToResources()
if (Bun.env.OPENCODE_CLI_DIST) await copyBuiltCliToResources(Bun.env.OPENCODE_CLI_DIST)
if (channel !== "dev" && !Bun.env.OPENCODE_CLI_DIST) throw new Error(`${channel} desktop builds require OPENCODE_CLI_DIST (run packages/cli/script/build.ts first)`)
