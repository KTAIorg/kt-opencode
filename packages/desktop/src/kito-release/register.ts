import { githubDownloadUrl, hashFile, mapReleaseAsset } from "./artifact"
import { isAlreadyExists, isStateConflict, type ReleaseClient } from "./client"
import { channelOrDefault, idempotencyKey, KITO_APP_ID, KITO_PLATFORMS, normalizeVersion, releaseId } from "./ids"

export type RegisterArtifactInput = {
  path: string
  fileName?: string
}

export type RegisterReleaseInput = {
  client: ReleaseClient
  version: string
  repo: string
  artifacts: RegisterArtifactInput[]
  appId?: string
  channel?: string
  tag?: string
  notes?: string
}

export type RegisteredRelease = {
  appId: string
  version: string
  channel: string
  releaseId: string
  artifactIds: string[]
  status: string
  rolloutPercent: number
}

export async function ensureKitoApp(client: ReleaseClient, appId = KITO_APP_ID) {
  const existing = await findApp(client, appId)
  if (existing) return existing

  return client
    .request({
      method: "POST",
      path: "/api/v1/admin/apps",
      body: {
        appId,
        displayName: "Kito",
        supportedPlatforms: [...KITO_PLATFORMS],
        defaultChannel: "stable",
      },
    })
    .catch((error) => {
      if (!isAlreadyExists(error)) throw error
      return findApp(client, appId)
    })
}

export async function registerKitoRelease(input: RegisterReleaseInput): Promise<RegisteredRelease> {
  const appId = input.appId ?? KITO_APP_ID
  const version = normalizeVersion(input.version)
  const channel = channelOrDefault(input.channel)
  const id = releaseId(appId, version, channel)
  const tag = input.tag ?? `v${version}`
  const artifacts = input.artifacts.flatMap((artifact) => describeArtifact(artifact, input.repo, tag))
  if (artifacts.length === 0) throw new Error("No Kito desktop installers or archives found to register")

  await ensureKitoApp(input.client, appId)
  await createDraft(input.client, {
    appId,
    version,
    channel,
    notes: input.notes ?? `发布 ${version} 正式版本。`,
  })
  const artifactIds = (
    await Promise.all(
      artifacts.map((artifact) => registerArtifact(input.client, { appId, releaseId: id, version, artifact })),
    )
  ).filter((value): value is string => Boolean(value))
  const published = await publishRolloutZero(input.client, { appId, releaseId: id, version })
  return {
    appId,
    version,
    channel,
    releaseId: id,
    artifactIds,
    status: stringField(published, "status") ?? "published",
    rolloutPercent: numberField(published, "rolloutPercent") ?? 0,
  }
}

export async function publishRolloutZero(
  client: ReleaseClient,
  input: { appId: string; releaseId: string; version: string },
) {
  return client
    .request({
      method: "POST",
      path: `/api/v1/admin/apps/${encodeURIComponent(input.appId)}/releases/${encodeURIComponent(input.releaseId)}/publish`,
      body: {
        rolloutPercent: 0,
        reason: `publish ${input.appId} ${input.version} with rollout 0 after artifact verification`,
        idempotencyKey: idempotencyKey(input.appId, input.version, "publish-rollout-0"),
      },
    })
    .catch(async (error) => {
      if (!isStateConflict(error) && !isAlreadyExists(error)) throw error
      const current = await readRelease(client, input.appId, input.releaseId)
      if (numberField(current, "rolloutPercent") === 0 && stringField(current, "status") === "published") return current
      throw error
    })
}

async function findApp(client: ReleaseClient, appId: string) {
  const payload = await client.request({ method: "GET", path: "/api/v1/admin/apps" })
  return itemsOf(payload).find((item) => stringField(item, "appId") === appId)
}

async function createDraft(
  client: ReleaseClient,
  input: { appId: string; version: string; channel: string; notes: string },
) {
  return client
    .request({
      method: "POST",
      path: `/api/v1/admin/apps/${encodeURIComponent(input.appId)}/releases`,
      body: {
        version: input.version,
        channel: input.channel,
        releaseType: "standard",
        forceUpdate: false,
        releaseNotes: [
          {
            locale: "zh-CN",
            title: `${input.version} 更新`,
            items: [input.notes],
          },
        ],
        reason: `register ${input.appId} ${input.version} production release`,
        idempotencyKey: idempotencyKey(input.appId, input.version, "create-release"),
      },
    })
    .catch((error) => {
      if (!isAlreadyExists(error)) throw error
    })
}

async function registerArtifact(
  client: ReleaseClient,
  input: {
    appId: string
    releaseId: string
    version: string
    artifact: ReturnType<typeof describeArtifact>[number]
  },
) {
  const payload = await client
    .request({
      method: "POST",
      path: `/api/v1/admin/apps/${encodeURIComponent(input.appId)}/releases/${encodeURIComponent(input.releaseId)}/artifacts`,
      body: {
        platform: input.artifact.platform,
        arch: input.artifact.arch,
        kind: input.artifact.kind,
        fileName: input.artifact.fileName,
        downloadUrl: input.artifact.downloadUrl,
        sha256: input.artifact.sha256,
        sha512: input.artifact.sha512,
        size: input.artifact.size,
        signatureStatus: "unknown",
        reason: `register ${input.appId} ${input.version} ${input.artifact.platform} ${input.artifact.arch} ${input.artifact.kind}`,
        idempotencyKey: idempotencyKey(
          input.appId,
          input.version,
          "register",
          input.artifact.platform,
          input.artifact.arch,
          input.artifact.kind,
        ),
      },
    })
    .catch((error) => {
      if (!isAlreadyExists(error)) throw error
    })
  return stringField(payload, "artifactId")
}

async function readRelease(client: ReleaseClient, appId: string, id: string) {
  return client.request({
    method: "GET",
    path: `/api/v1/admin/apps/${encodeURIComponent(appId)}/releases/${encodeURIComponent(id)}`,
  })
}

function describeArtifact(input: RegisterArtifactInput, repo: string, tag: string) {
  const mapped = mapReleaseAsset(input.fileName ?? input.path)
  if (!mapped) return []
  const hash = hashFile(input.path)
  if (hash.size <= 0) throw new Error(`Artifact ${mapped.fileName} is empty`)
  return [
    {
      ...mapped,
      ...hash,
      downloadUrl: githubDownloadUrl(repo, tag, mapped.fileName),
    },
  ]
}

function itemsOf(payload: unknown) {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload) || !Array.isArray(payload.items)) return []
  return payload.items
}

function stringField(payload: unknown, key: string) {
  if (!isRecord(payload) || typeof payload[key] !== "string") return
  return payload[key]
}

function numberField(payload: unknown, key: string) {
  if (!isRecord(payload) || typeof payload[key] !== "number") return
  return payload[key]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
