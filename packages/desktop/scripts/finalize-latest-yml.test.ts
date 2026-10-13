import { expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../../core/test/fixture/tmpdir"

test.each([
  { version: "2.1.17", releaseTag: "kito-v2.1.17", expectedTag: "kito-v2.1.17" },
  { version: "2.0.27", releaseTag: undefined, expectedTag: "v2.0.27" },
])("uploads merged manifests to $expectedTag", async ({ version, releaseTag, expectedTag }) => {
  await using directory = await tmpdir("kito-release-manifests-")
  const capture = path.join(directory.path, "uploads.jsonl")
  const gh = path.join(directory.path, process.platform === "win32" ? "gh.exe" : "gh")
  const entry = path.join(directory.path, "gh.ts")
  await Bun.write(
    entry,
    `import fs from "node:fs"
const args = process.argv.slice(2)
if (args[0] !== "release" || args[1] !== "upload" || args[2] !== process.env.EXPECTED_RELEASE_TAG) {
  throw new Error("Unexpected release upload: " + JSON.stringify(args))
}
fs.appendFileSync(process.env.GH_CAPTURE, JSON.stringify({ args, content: fs.readFileSync(args[3], "utf8") }) + "\\n")
`,
  )

  const build = Bun.spawn([process.execPath, "build", entry, "--compile", "--outfile", gh], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const [buildCode, buildOut, buildError] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ])

  expect(buildCode, `${buildOut}\n${buildError}`).toBe(0)

  for (const [target, name, filename, hash, size] of [
    ["x86_64-pc-windows-msvc", "latest.yml", "windows.exe", "windows-hash", 100],
    ["x86_64-apple-darwin", "latest-mac.yml", "mac-x64.zip", "intel-hash", 200],
    ["aarch64-apple-darwin", "latest-mac.yml", "mac-arm64.zip", "arm-hash", 300],
  ] as const) {
    await Bun.write(
      path.join(directory.path, `latest-yml-${target}`, name),
      `version: ${version}\nfiles:\n  - url: ${filename}\n    sha512: ${hash}\n    size: ${size}\nreleaseDate: '2026-10-14T00:00:00Z'\n`,
    )
  }

  const child = Bun.spawn([process.execPath, path.join(import.meta.dirname, "finalize-latest-yml.ts")], {
    env: {
      PATH: directory.path,
      SystemRoot: process.env.SystemRoot,
      GH_REPO: "KTAIorg/kt-opencode",
      OPENCODE_VERSION: version,
      RELEASE_TAG: releaseTag,
      LATEST_YML_DIR: directory.path,
      RUNNER_TEMP: directory.path,
      EXPECTED_RELEASE_TAG: expectedTag,
      GH_CAPTURE: capture,
    },
    stdout: "pipe",
    stderr: "pipe",
  })

  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect(code, `${stdout}\n${stderr}`).toBe(0)

  // SAFETY: only the compiled fixture above writes this capture, with args and content fields.
  const uploads = (await Bun.file(capture).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { args: string[]; content: string })

  expect(uploads).toHaveLength(2)
  expect(uploads.map((upload) => path.basename(upload.args[3]!))).toEqual(["latest.yml", "latest-mac.yml"])

  for (const upload of uploads) {
    expect(upload.args).toEqual([
      "release",
      "upload",
      expectedTag,
      path.join(directory.path, path.basename(upload.args[3]!)),
      "--clobber",
      "--repo",
      "KTAIorg/kt-opencode",
    ])
    expect(upload.content).toContain(`version: ${version}`)
  }

  expect(uploads[0]!.content).toContain("url: windows.exe")
  expect(uploads[1]!.content).toContain("url: mac-arm64.zip")
  expect(uploads[1]!.content).toContain("url: mac-x64.zip")
  expect(uploads[1]!.content).toContain("sha512: arm-hash")
  expect(uploads[1]!.content).toContain("sha512: intel-hash")
})
