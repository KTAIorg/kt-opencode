export function hasExistingAppState(entries: Array<{ name: string; isDirectory: () => boolean }>) {
  return entries.some((entry) => {
    if (entry.name === "opencode.settings") return true
    if (entry.name.endsWith(".dat")) return true
    if (/^window-state-.+\.json$/.test(entry.name)) return true
    // The sidecar state directory was "opencode" before the data roots moved to
    // the "kito" leaf; recognize both so upgrades still count as existing installs.
    return entry.isDirectory() && (entry.name === "kito" || entry.name === "opencode")
  })
}
