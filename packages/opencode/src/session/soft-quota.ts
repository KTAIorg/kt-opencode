import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { SessionRetry } from "./retry"

/** Product default: local soft quota for free Zen chats (half-stop at limit). */
export const DEFAULT_LIMIT = 100
export const FILE_NAME = "soft-quota.json"

export type State = {
  version: 1
  /** Successful free Zen chat rounds (user send → model response). */
  zenFreeChats: number
}

export type ModelLike = {
  providerID: string
  cost?: { input?: number }
}

export function filePath(override = process.env.OPENCODE_SOFT_QUOTA_PATH) {
  if (override?.trim()) return path.resolve(override.trim())
  return path.join(Global.Path.data, FILE_NAME)
}

export function disabled() {
  const raw = process.env.OPENCODE_DISABLE_SOFT_QUOTA?.trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes"
}

export function limit() {
  if (disabled()) return Number.POSITIVE_INFINITY
  const raw = process.env.OPENCODE_SOFT_QUOTA_LIMIT?.trim()
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return DEFAULT_LIMIT
}

/** Free OpenCode Zen channel: provider `opencode` with zero input cost. */
export function isZenFreeModel(model: ModelLike | undefined | null) {
  if (!model) return false
  if (model.providerID !== "opencode") return false
  return (model.cost?.input ?? 0) === 0
}

export function empty(): State {
  return { version: 1, zenFreeChats: 0 }
}

export function read(file = filePath()): State {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<State>
    const zenFreeChats = Number(raw.zenFreeChats)
    return {
      version: 1,
      zenFreeChats: Number.isFinite(zenFreeChats) && zenFreeChats > 0 ? Math.floor(zenFreeChats) : 0,
    }
  } catch {
    return empty()
  }
}

export function write(state: State, file = filePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const next: State = {
    version: 1,
    zenFreeChats: Math.max(0, Math.floor(state.zenFreeChats)),
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 })
  return next
}

export function count(file = filePath()) {
  return read(file).zenFreeChats
}

export function exhausted(file = filePath()) {
  const max = limit()
  if (!Number.isFinite(max)) return false
  return count(file) >= max
}

export function increment(file = filePath()) {
  const state = read(file)
  state.zenFreeChats += 1
  return write(state, file)
}

export function reset(file = filePath()) {
  return write(empty(), file)
}

export function freeTierAction(provider = "opencode") {
  return SessionRetry.freeTierTopupAction(provider)
}

export function retryStatus(provider = "opencode") {
  return {
    type: "retry" as const,
    attempt: 1,
    message: SessionRetry.KT_TOPUP_MESSAGE,
    action: freeTierAction(provider),
    next: Date.now(),
  }
}

export * as SoftQuota from "./soft-quota"
