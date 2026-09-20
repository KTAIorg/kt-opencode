export const isDeepLink = (arg: string) => arg.startsWith("ktai://") || arg.startsWith("opencode://")

export const deepLinksFromArgv = (argv: readonly string[]) => argv.filter(isDeepLink)

// Delivers each deep link exactly once: straight to a ready window when one is
// available, otherwise buffered until the next renderer consumes the backlog
// through consumeInitialDeepLinks.
export function createDeepLinkOutbox() {
  const pending: string[] = []
  return {
    emit(urls: string[], send?: (urls: string[]) => void) {
      pending.push(...urls.filter((url) => !pending.includes(url)))
      if (!send || pending.length === 0) return
      send(pending.splice(0))
    },
    consume: () => pending.splice(0),
  }
}
