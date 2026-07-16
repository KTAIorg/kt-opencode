import path from "node:path"
import { mkdir } from "node:fs/promises"

const root = path.resolve(import.meta.dir, "../../../../..")
const themes = path.resolve(Bun.argv[2] ?? path.join(import.meta.dir, "themes"))
const screenshots = path.resolve(Bun.argv[3] ?? path.join(import.meta.dir, "screenshots"))
const scenario = path.join(import.meta.dir, "scenario.ts")
const files = await Array.fromAsync(new Bun.Glob("**/*.json").scan({ cwd: themes, absolute: true }))

if (!files.length) {
  console.error(`No JSON themes found in ${themes}`)
  process.exit(1)
}

await mkdir(screenshots, { recursive: true })

const failures: string[] = []
const slugs = new Set<string>()

for (const file of files.sort()) {
  const source = await Bun.file(file).json().catch(() => undefined)
  const slug = path.basename(file, ".json").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  if (!slug) {
    failures.push(`${file}: filename does not produce a usable theme prefix`)
    continue
  }
  if (slugs.has(slug)) {
    failures.push(`${file}: duplicate theme prefix "${slug}"`)
    continue
  }
  slugs.add(slug)

  if (!isRecord(source)) {
    failures.push(`${file}: invalid JSON theme object`)
    continue
  }
  if (source.version === 2) {
    failures.push(`${file}: native V2 theme loading is not supported by the TUI yet`)
    continue
  }
  if (!isRecord(source.theme)) {
    failures.push(`${file}: expected a V1 theme with a "theme" object`)
    continue
  }

  for (const mode of ["light", "dark"] as const) {
    const name = `theme-gallery-${slug}-${mode}-${process.pid}`
    console.log(`\n[${slug}/${mode}] capturing screenshots`)
    const child = Bun.spawn(
      ["opencode-drive", "start", "--name", name, "--script", scenario, "--dev", root],
      {
        cwd: root,
        env: {
          ...process.env,
          OPENCODE_THEME_GALLERY_FILE: file,
          OPENCODE_THEME_GALLERY_MODE: mode,
          OPENCODE_THEME_GALLERY_OUTPUT: screenshots,
          OPENCODE_THEME_GALLERY_SLUG: slug,
        },
        stdout: "inherit",
        stderr: "inherit",
      },
    )
    const exit = await child.exited
    if (exit !== 0) failures.push(`${file} (${mode}): OpenCode Drive exited with ${exit}`)
  }
}

if (failures.length) {
  console.error("\nTheme gallery completed with errors:")
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`\nScreenshots written to ${screenshots}`)

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
