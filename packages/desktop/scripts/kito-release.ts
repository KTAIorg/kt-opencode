#!/usr/bin/env bun

import { readdirSync } from "node:fs"
import { join } from "node:path"
import { createReleaseClient } from "../src/kito-release/client"
import { channelOrDefault, KITO_APP_ID, normalizeVersion, releaseId } from "../src/kito-release/ids"
import { ensureKitoApp, publishRolloutZero, registerKitoRelease } from "../src/kito-release/register"

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const client = createReleaseClient({
    adminBaseUrl: requiredAdminUrl(args.dryRun),
    publicBaseUrl: process.env.KT_RELEASE_SERVICE_CLIENT_BASE_URL ?? "https://updates.ktyun.cc",
    token: requiredToken(args.dryRun),
    dryRun: args.dryRun,
  })

  if (args.command === "ensure-app") {
    const app = await ensureKitoApp(client, args.appId)
    console.log(JSON.stringify({ appId: args.appId, reused: Boolean(app) }, null, 2))
    return
  }

  if (args.command === "publish-zero") {
    const published = await publishRolloutZero(client, {
      appId: args.appId,
      releaseId: releaseId(args.appId, args.version, args.channel),
      version: args.version,
    })
    console.log(JSON.stringify(published, null, 2))
    return
  }

  const result = await registerKitoRelease({
    client,
    appId: args.appId,
    version: args.version,
    channel: args.channel,
    repo: args.repo,
    tag: args.tag,
    notes: args.notes,
    artifacts: collectArtifacts(args.dir),
  })
  if (result.rolloutPercent !== 0) throw new Error("Kito CI must stop at rollout 0")
  console.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv: string[]) {
  const command = argv[0] === "ensure-app" || argv[0] === "publish-zero" || argv[0] === "register" ? argv[0] : "register"
  const rest = command === argv[0] ? argv.slice(1) : argv
  const flags = new Map<string, string>()
  rest.forEach((value, index, values) => {
    if (!value.startsWith("--")) return
    flags.set(value.slice(2), values[index + 1] && !values[index + 1].startsWith("--") ? values[index + 1] : "1")
  })
  const version = normalizeVersion(flags.get("version") ?? "")
  if (command !== "ensure-app" && !version) throw new Error("Missing --version")
  return {
    command,
    appId: flags.get("app") ?? KITO_APP_ID,
    version,
    channel: channelOrDefault(flags.get("channel")),
    repo: flags.get("repo") ?? process.env.GITHUB_REPOSITORY ?? "ktaiorg/kt-opencode",
    tag: flags.get("tag") ?? (version ? `v${version}` : ""),
    dir: flags.get("dir") ?? "",
    notes: flags.get("notes"),
    dryRun: flags.has("dry-run") || process.env.KT_RELEASE_SERVICE_DRY_RUN === "1",
  }
}

function collectArtifacts(dir: string) {
  if (!dir) throw new Error("Missing --dir with GitHub Release assets")
  return readdirSync(dir).map((fileName) => ({ path: join(dir, fileName), fileName }))
}

function requiredAdminUrl(dryRun: boolean) {
  const value = (
    process.env.KT_RELEASE_SERVICE_ADMIN_BASE_URL ??
    process.env.KT_RELEASE_SERVICE_BASE_URL ??
    ""
  ).trim()
  if (value) return value
  if (dryRun) return "https://release-admin.ktyun.cc"
  throw new Error("Missing KT_RELEASE_SERVICE_ADMIN_BASE_URL")
}

function requiredToken(dryRun: boolean) {
  const value = (process.env.KT_RELEASE_SERVICE_ADMIN_TOKEN ?? process.env.KT_RELEASE_SERVICE_TOKEN ?? "").trim()
  if (value) return value
  if (dryRun) return
  throw new Error("Missing KT_RELEASE_SERVICE_ADMIN_TOKEN")
}

await main()
