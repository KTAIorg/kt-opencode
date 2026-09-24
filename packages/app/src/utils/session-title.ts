import type { SessionInfo } from "@opencode-ai/client/promise"
import { displayLabel } from "@opencode-ai/util/session-title-fallback"
import type { useLanguage } from "@/context/language"

const pattern = /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

type Language = ReturnType<typeof useLanguage>

export function sessionLabel(session: Pick<SessionInfo, "title" | "parentID">, language?: Language) {
  const label = displayLabel(session)
  if (!language) return label
  if (label === "New session") return language.t("session.title.new")
  if (label === "Child session") return language.t("session.title.child")
  return label
}

export function sessionTitle(title?: string) {
  if (!title) return title
  const match = title.match(pattern)
  return match?.[1] ?? title
}
