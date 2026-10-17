export type DesktopLoginRequest = { port: number; request: string }

let handler: ((request: DesktopLoginRequest) => Promise<void>) | undefined
const pending = new Map<string, DesktopLoginRequest>()
const seen = new Set<string>()

export function parseDesktopLogin(raw: string): DesktopLoginRequest | undefined {
  if (!raw.startsWith("ktai://desktop-login?")) return
  const url = new URL(raw)
  const port = url.searchParams.get("port") ?? ""
  const request = url.searchParams.get("request") ?? ""
  if (url.username || url.password || url.hash || !/^\d{1,5}$/.test(port) || !/^[a-f0-9]{64}$/.test(request)) return
  if (Number(port) < 1 || Number(port) > 65535) return
  return { port: Number(port), request }
}

// Return true for malformed auth links too: these links must never enter the
// renderer's history, diagnostics or generic deep-link log.
export function receiveDesktopLogin(raw: string) {
  if (!raw.startsWith("ktai://desktop-login")) return false
  const request = parseDesktopLogin(raw)
  if (!request || seen.has(request.request)) return true
  seen.add(request.request)
  if (seen.size > 128) seen.delete(seen.values().next().value!)
  if (handler) void handler(request)
  else if (pending.size < 4) pending.set(request.request, request)
  return true
}

export function registerDesktopLoginHandler(next: (request: DesktopLoginRequest) => Promise<void>) {
  handler = next
  for (const request of pending.values()) void next(request)
  pending.clear()
}
