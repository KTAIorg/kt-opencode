import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

const legacyDesktopEntry = "resources/linux/opencode-desktop.desktop"

const channels = [
  { channel: "dev", appId: "cc.ktapi.desktop.dev", productName: "KTAI Dev" },
  { channel: "beta", appId: "cc.ktapi.desktop.beta", productName: "KTAI Beta" },
  { channel: "prod", appId: "cc.ktapi.desktop", productName: "KTAI" },
] as const

for (const channel of channels) {
  test(`uses the KTAI identity for ${channel.channel}`, async () => {
    const previous = process.env.OPENCODE_CHANNEL
    process.env.OPENCODE_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.OPENCODE_CHANNEL
    else process.env.OPENCODE_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.productName).toBe(channel.productName)
    expect(config.artifactName).toBe("ktai-desktop-${os}-${arch}.${ext}")
    expect(config.protocols).toEqual({ name: channel.productName, schemes: ["ktai"] })
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
  })
}

test("disables signing and notarization for unsigned builds", async () => {
  const previousChannel = process.env.OPENCODE_CHANNEL
  const previousUnsigned = process.env.KTAI_UNSIGNED_BUILD
  process.env.OPENCODE_CHANNEL = "prod"
  process.env.KTAI_UNSIGNED_BUILD = "1"

  const module = await import("./electron-builder.config.ts?unsigned=prod")
  const config = module.default as Configuration

  if (previousChannel === undefined) delete process.env.OPENCODE_CHANNEL
  else process.env.OPENCODE_CHANNEL = previousChannel
  if (previousUnsigned === undefined) delete process.env.KTAI_UNSIGNED_BUILD
  else process.env.KTAI_UNSIGNED_BUILD = previousUnsigned

  expect(config.mac?.identity).toBeNull()
  expect(config.mac?.notarize).toBe(false)
  expect(config.dmg?.sign).toBe(false)
})

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const previous = process.env.OPENCODE_CHANNEL
  process.env.OPENCODE_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?compat=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.OPENCODE_CHANNEL
  else process.env.OPENCODE_CHANNEL = previous

  expect(config.deb?.fpm?.[0]).toEndWith(`${legacyDesktopEntry}=/usr/share/applications/opencode-desktop.desktop`)
  expect(config.rpm?.fpm?.[0]).toEndWith(`${legacyDesktopEntry}=/usr/share/applications/opencode-desktop.desktop`)

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/OpenCode/ai.opencode.desktop %U")
  expect(desktop).toContain("Icon=ai.opencode.desktop")
  expect(desktop).toContain("StartupWMClass=ai.opencode.desktop")
  expect(desktop).toContain("NoDisplay=true")
})
