import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

// Must match the packaged appId in electron-builder.config.ts so the generated
// file lands where the deb/rpm fpm mappings expect it.
const appId = channel === "prod" ? "cc.ktapi.desktop" : `cc.ktapi.desktop.${channel}`
const productName = channel === "prod" ? "Kito" : `Kito ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `AI coding agent${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="ly.anoma">
    <name>Anomaly Innovations Inc.</name>
  </developer>

  <description>
    <p>
      Kito is an AI coding agent for your desktop.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/KTAIorg/kt-opencode/issues</url>
  <url type="homepage">https://kito.ktai.im</url>
  <url type="vcs-browser">https://github.com/KTAIorg/kt-opencode</url>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
