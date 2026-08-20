export const KITO_APP_ID = "kito"
export const KITO_DEFAULT_CHANNEL = "stable"
export const KITO_PLATFORMS = ["win32", "darwin", "linux"] as const

export function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "")
}

export function normalizeId(value: string) {
  return value.trim().toLowerCase()
}

export function channelOrDefault(value?: string) {
  return value?.trim() ? normalizeId(value) : KITO_DEFAULT_CHANNEL
}

export function releaseId(appId: string, version: string, channel?: string) {
  return `rel_${normalizeId(appId).replaceAll("-", "_")}_${normalizeVersion(version).replaceAll(".", "_")}_${channelOrDefault(channel)}`
}

export function artifactId(release: string, platform: string, arch: string, kind?: string) {
  return `art_${release.replaceAll("-", "_")}_${normalizeId(platform)}_${normalizeId(arch)}_${normalizeId(kind || "installer") || "installer"}`
}

export function idempotencyKey(...parts: string[]) {
  return parts.join("-")
}
