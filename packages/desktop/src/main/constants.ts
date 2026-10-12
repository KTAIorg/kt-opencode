import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Kito Dev",
  beta: "Kito Beta",
  prod: "Kito",
}

const appIDs: Record<string, string> = {
  dev: "cc.ktapi.desktop.dev",
  beta: "cc.ktapi.desktop.beta",
  prod: "cc.ktapi.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "Kito Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "cc.ktapi.desktop.dev"
