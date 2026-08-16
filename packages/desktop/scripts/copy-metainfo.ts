import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

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

  <developer id="cc.ktapi">
    <name>Kito</name>
  </developer>

  <description>
    <p>
      Kito is an AI coding agent with Telegram login and wallet top-up.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/KTAIorg/kt-opencode/issues</url>
  <url type="homepage">https://www.ktapi.cc</url>
  <url type="vcs-browser">https://github.com/KTAIorg/kt-opencode</url>

  <screenshots>
    <screenshot type="default">
      <image>https://raw.githubusercontent.com/anomalyco/opencode/b75d4d1c5ec449585d515c756fc81f080a157a9a/packages/web/src/assets/lander/screenshot.png</image>
    </screenshot>
  </screenshots>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
