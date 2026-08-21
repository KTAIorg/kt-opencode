import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { githubDownloadUrl, hashFile, mapReleaseAsset } from "./artifact"

test("maps electron-builder desktop assets onto Release Service slots", () => {
  expect(mapReleaseAsset("ktai-desktop-1.18.3-win-x64.exe")).toEqual({
    platform: "win32",
    arch: "x64",
    kind: "installer",
    fileName: "ktai-desktop-1.18.3-win-x64.exe",
  })
  expect(mapReleaseAsset("opencode-desktop-win-x64.exe")).toEqual({
    platform: "win32",
    arch: "x64",
    kind: "installer",
    fileName: "opencode-desktop-win-x64.exe",
  })
  expect(mapReleaseAsset("opencode-desktop-mac-arm64.dmg")).toEqual({
    platform: "darwin",
    arch: "arm64",
    kind: "installer",
    fileName: "opencode-desktop-mac-arm64.dmg",
  })
  expect(mapReleaseAsset("opencode-desktop-linux-x64.AppImage")).toEqual({
    platform: "linux",
    arch: "x64",
    kind: "installer",
    fileName: "opencode-desktop-linux-x64.AppImage",
  })
  expect(mapReleaseAsset("opencode-desktop-mac-x64.zip")).toEqual({
    platform: "darwin",
    arch: "x64",
    kind: "archive",
    fileName: "opencode-desktop-mac-x64.zip",
  })
  expect(mapReleaseAsset("opencode-desktop-mac-arm64.app.tar.gz")).toEqual({
    platform: "darwin",
    arch: "arm64",
    kind: "archive",
    fileName: "opencode-desktop-mac-arm64.app.tar.gz",
  })
})

test("skips updater metadata, Linux packages, and uninstallers", () => {
  expect(mapReleaseAsset("latest.yml")).toBeUndefined()
  expect(mapReleaseAsset("opencode-desktop-win-x64.exe.blockmap")).toBeUndefined()
  expect(mapReleaseAsset("opencode-desktop-linux-x64.deb")).toBeUndefined()
  expect(mapReleaseAsset("opencode-desktop-win-x64-uninstall.exe")).toBeUndefined()
})

test("hashes bytes and builds a GitHub download URL", () => {
  const path = join(mkdtempSync(join(tmpdir(), "kito-release-")), "opencode-desktop-win-x64.exe")
  writeFileSync(path, "kito")
  expect(hashFile(path)).toEqual({
    size: 4,
    sha256: "8c434260eafabe928a1ddf9e20e2f622e0a902f2f958c2229c45873aa48de381",
    sha512: "bAh91605vQyD94frjVfYs+TSC3kZ2xSXD8IduKvoJnm0G7f2q52Hz0/G/2ThHYyKIKc1Inphp8DilZhQ9oz2og==",
  })
  expect(githubDownloadUrl("ktaiorg/kt-opencode", "v1.18.15", "opencode-desktop-win-x64.exe")).toBe(
    "https://github.com/ktaiorg/kt-opencode/releases/download/v1.18.15/opencode-desktop-win-x64.exe",
  )
})
