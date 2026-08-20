import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { basename } from "node:path"

export type ArtifactKind = "installer" | "archive"
export type ArtifactPlatform = "win32" | "darwin" | "linux"
export type ArtifactArch = "x64" | "arm64"

export type MappedArtifact = {
  platform: ArtifactPlatform
  arch: ArtifactArch
  kind: ArtifactKind
  fileName: string
}

export function mapReleaseAsset(fileName: string): MappedArtifact | undefined {
  const name = basename(fileName)
  if (shouldSkipAsset(name)) return

  const ext = extensionOf(name)
  const kind = kindForExtension(ext)
  const platform = platformOf(name)
  const arch = archOf(name)
  if (!kind || !platform || !arch) return
  return { platform, arch, kind, fileName: name }
}

export function hashFile(path: string) {
  const bytes = readFileSync(path)
  return {
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sha512: createHash("sha512").update(bytes).digest("base64"),
  }
}

export function githubDownloadUrl(repo: string, tag: string, fileName: string) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(fileName)}`
}

function shouldSkipAsset(name: string) {
  if (/uninstall/i.test(name)) return true
  if (/\.(blockmap|ya?ml)$/i.test(name)) return true
  if (/^(latest.*|builder-debug\.yml|builder-effective-config\.yaml)$/i.test(name)) return true
  return false
}

function extensionOf(name: string) {
  if (name.endsWith(".app.tar.gz")) return "app.tar.gz"
  const dot = name.lastIndexOf(".")
  if (dot < 0) return ""
  return name.slice(dot + 1).toLowerCase()
}

function kindForExtension(ext: string): ArtifactKind | undefined {
  if (ext === "exe" || ext === "dmg" || ext === "appimage") return "installer"
  if (ext === "zip" || ext === "app.tar.gz") return "archive"
}

function platformOf(name: string): ArtifactPlatform | undefined {
  const lower = name.toLowerCase()
  if (lower.includes("-win-") || lower.includes("-win32-") || lower.includes("windows")) return "win32"
  if (lower.includes("-mac-") || lower.includes("-darwin-") || lower.includes("macos")) return "darwin"
  if (lower.includes("-linux-")) return "linux"
}

function archOf(name: string): ArtifactArch | undefined {
  const lower = name.toLowerCase()
  if (lower.includes("arm64") || lower.includes("aarch64")) return "arm64"
  if (lower.includes("x64") || lower.includes("x86_64") || lower.includes("amd64")) return "x64"
}
