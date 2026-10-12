export const deepLinkEvent = "opencode:deep-link"

const parseUrl = (input: string) => {
  // ktai:// is Kito's scheme; opencode:// remains accepted for legacy links.
  if (!input.startsWith("ktai://") && !input.startsWith("opencode://")) return
  if (typeof URL.canParse === "function" && !URL.canParse(input)) return
  try {
    return new URL(input)
  } catch {
    return
  }
}

export const parseDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "open-project") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  return directory
}

export const parseNewSessionDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "new-session") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  const prompt = url.searchParams.get("prompt") || undefined
  if (!prompt) return { directory }
  return { directory, prompt }
}

export const collectOpenProjectDeepLinks = (urls: string[]) =>
  urls.map(parseDeepLink).filter((directory): directory is string => !!directory)

export const collectNewSessionDeepLinks = (urls: string[]) =>
  urls.map(parseNewSessionDeepLink).filter((link): link is { directory: string; prompt?: string } => !!link)

export type DeepLinkAction =
  | { type: "open-project"; directory: string }
  | { type: "new-session"; directory: string; prompt?: string }

// Only absolute paths are actionable: a relative directory would silently open
// an unexpected location, so links without one are dropped here.
const isAbsoluteDirectory = (directory: string) =>
  directory.startsWith("/") || directory.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(directory)

export const parseDeepLinkAction = (input: string): DeepLinkAction | undefined => {
  const session = parseNewSessionDeepLink(input)
  if (session && isAbsoluteDirectory(session.directory)) {
    return session.prompt
      ? { type: "new-session", directory: session.directory, prompt: session.prompt }
      : { type: "new-session", directory: session.directory }
  }
  const directory = parseDeepLink(input)
  if (directory && isAbsoluteDirectory(directory)) return { type: "open-project", directory }
  return undefined
}

export const readDeepLinkEventDetail = (event: Event): string[] => {
  if (!(event instanceof CustomEvent)) return []
  const detail: unknown = event.detail
  if (!detail || typeof detail !== "object" || !("urls" in detail)) return []
  const urls = detail.urls
  if (!Array.isArray(urls)) return []
  return urls.filter((url): url is string => typeof url === "string")
}

export const collectDeepLinkActions = (urls: string[]) =>
  urls.flatMap((url) => {
    const action = parseDeepLinkAction(url)
    return action ? [action] : []
  })

// A URL is delivered through both the buffered list and the live event; each
// raw link is only surfaced to the user once.
export const filterFreshDeepLinks = (seen: Set<string>, urls: string[]) => {
  const fresh = urls.filter((url) => !seen.has(url))
  for (const url of fresh) seen.add(url)
  return fresh
}

// External links can point the agent at any directory with any prompt, so every
// action is routed through confirm() — the caller is responsible for showing the
// user the directory and prompt and only invoking approve() on acceptance.
export function createDeepLinkGate(input: {
  confirm: (link: DeepLinkAction, approve: () => void) => void
  open: (link: DeepLinkAction) => void
}) {
  const seen = new Set<string>()
  return {
    handle(urls: string[]) {
      for (const link of collectDeepLinkActions(filterFreshDeepLinks(seen, urls))) {
        input.confirm(link, () => input.open(link))
      }
    },
  }
}

type OpenCodeWindow = Window & {
  __OPENCODE__?: {
    deepLinks?: string[]
  }
}

export const drainPendingDeepLinks = (target: OpenCodeWindow) => {
  const pending = target.__OPENCODE__?.deepLinks ?? []
  if (pending.length === 0) return []
  if (target.__OPENCODE__) target.__OPENCODE__.deepLinks = []
  return pending
}
