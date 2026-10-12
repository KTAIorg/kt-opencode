const wslDistroNamePattern = /^[A-Za-z0-9._-]+$/

// Distro names arrive from the renderer and land on wsl.exe / cmd.exe command
// lines; a leading "-" turns into a flag and anything outside this shape is
// not a real distro name.
export function isValidWslDistroName(name: string) {
  return wslDistroNamePattern.test(name) && !name.startsWith("-")
}
