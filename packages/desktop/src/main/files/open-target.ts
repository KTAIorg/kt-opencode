import { win32 } from "node:path"

// Extensions the OS executes rather than displays when a path is "opened".
// Paths like these are revealed in the file manager instead of launched.
const executableExtensions = new Set([
  "app",
  "bat",
  "cmd",
  "com",
  "command",
  "cpl",
  "exe",
  "hta",
  "jar",
  "js",
  "jse",
  "lnk",
  "msc",
  "msi",
  "msp",
  "pif",
  "ps1",
  "reg",
  "scf",
  "scr",
  "sh",
  "vbe",
  "vbs",
  "ws",
  "wsf",
  "wsh",
])

export function isExecutablePath(path: string) {
  return executableExtensions.has(win32.extname(path).slice(1).toLowerCase())
}

// Applications the renderer may hand a path to (the "open in" menu). Keys are
// normalized — basename minus executable extension, lowercase alphanumerics —
// so the display name ("Visual Studio Code"), the command name ("code"), and a
// resolved binary ("Code.exe") all match the same entry.
const openAppKeys = new Set([
  "antigravity",
  "androidstudio",
  "code",
  "cursor",
  "ghostty",
  "iterm",
  "powershell",
  "sublimetext",
  "terminal",
  "textmate",
  "visualstudiocode",
  "warp",
  "xcode",
  "zed",
])

export function isAllowedOpenApp(app: string, platform = process.platform, roots = windowsAppRoots()) {
  if (!/[/\\]/.test(app)) return openAppKeys.has(openAppKey(app))
  // On Windows the renderer resolves an app name to an installed binary; only
  // an absolute .exe for a known app under a program install root is honored.
  if (platform !== "win32") return false
  if (!win32.isAbsolute(app) || win32.extname(app).toLowerCase() !== ".exe") return false
  if (!openAppKeys.has(openAppKey(app))) return false
  return roots.some((root) => {
    const rel = win32.relative(win32.resolve(root), app)
    return rel !== "" && !rel.startsWith("..") && !win32.isAbsolute(rel)
  })
}

function openAppKey(app: string) {
  return win32
    .basename(app)
    .replace(/\.(app|exe|cmd|bat)$/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
}

function windowsAppRoots() {
  const env = process.env
  return [
    env.ProgramFiles,
    env["ProgramFiles(x86)"],
    env.LOCALAPPDATA ? win32.join(env.LOCALAPPDATA, "Programs") : undefined,
    env.ProgramData ? win32.join(env.ProgramData, "chocolatey") : undefined,
    env.USERPROFILE ? win32.join(env.USERPROFILE, "scoop") : undefined,
    env.SystemRoot ? win32.join(env.SystemRoot, "System32") : undefined,
  ].filter((root): root is string => Boolean(root))
}
