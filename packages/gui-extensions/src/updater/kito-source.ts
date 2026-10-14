import { Schema } from "effect"

export type KitoUpdaterSource = { kind: "hold" } | { kind: "generic"; baseUrl: string; version: string }

export type SelectKitoUpdaterSourceInput = {
  currentVersion: string
  platform: string
  arch: string
  channel?: string
  deviceId?: string
  publicBaseUrl?: string
}

const Assignment = Schema.Struct({
  decision: Schema.String,
  targetVersion: Schema.optional(Schema.String),
})

const decodeAssignment = Schema.decodeUnknownSync(Schema.Struct({ data: Assignment }))

export async function selectKitoUpdaterSource(input: SelectKitoUpdaterSourceInput): Promise<KitoUpdaterSource> {
  const baseUrl = (input.publicBaseUrl ?? "https://updates.ktyun.cc").replace(/\/+$/, "")

  const response = await fetch(`${baseUrl}/api/v1/apps/kito/updates/resolve`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      traceId: `kito-updater-${crypto.randomUUID()}`,
      currentVersion: input.currentVersion,
      channel: input.channel?.trim().toLowerCase() || "stable",
      platform: input.platform,
      arch: input.arch,
      deviceId: input.deviceId,
      locale: "zh-CN",
    }),
  })

  // A failed control-plane check must never bypass a paused or rollout-0 release.
  if (!response.ok) throw new Error(`Kito update assignment failed: ${response.status}`)
  const assignment = decodeAssignment(await response.json()).data

  if (assignment.decision !== "update_available" && assignment.decision !== "force_update") return { kind: "hold" }
  const version = assignment.targetVersion

  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("Kito update assignment has an invalid target version")

  // Pin the manifest to the assigned immutable Kito tag. The legacy service
  // feed points at KT Desktop; GitHub's latest feed can skip rollout gates.
  return {
    kind: "generic",
    baseUrl: `https://github.com/KTAIorg/kt-opencode/releases/download/kito-v${version}/`,
    version,
  }
}
