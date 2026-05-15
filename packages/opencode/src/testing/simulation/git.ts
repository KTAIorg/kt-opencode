import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Effect, Layer } from "effect"
import path from "path"
import { Git } from "@/git"

const emptyResult = {
  exitCode: 0,
  text: () => "",
  stdout: Buffer.alloc(0),
  stderr: Buffer.alloc(0),
  truncated: false,
} satisfies Git.Result

const parsePathToken = (value: string) => {
  if (!value.startsWith('"')) return value.split("\t")[0]
  const match = /^"((?:\\.|[^"])*)"/.exec(value)
  return match?.[1]?.replace(/\\(["\\tnr])/g, (_all, char: string) => {
    if (char === "t") return "\t"
    if (char === "n") return "\n"
    if (char === "r") return "\r"
    return char
  })
}

const diffPath = (value: string | undefined) => {
  if (!value || value === "/dev/null") return
  const file = parsePathToken(value)
  if (!file) return
  if (file.startsWith("a/") || file.startsWith("b/")) return file.slice(2)
  return file
}

const splitPatch = (text: string) => {
  const starts = [...text.matchAll(/(?:^|\n)diff --git /g)].map((match) =>
    match[0].startsWith("\n") ? match.index + 1 : match.index,
  )
  if (starts.length === 0) return text.trim() ? [text] : []
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length))
}

const fileFromPatch = (patch: string) =>
  diffPath(/^\+\+\+ (.+)$/m.exec(patch)?.[1]) ?? diffPath(/^--- (.+)$/m.exec(patch)?.[1])

const statusFromPatch = (patch: string): Git.Kind => {
  if (/^--- \/dev\/null$/m.test(patch)) return "added"
  if (/^\+\+\+ \/dev\/null$/m.test(patch)) return "deleted"
  return "modified"
}

const codeFromStatus = (status: Git.Kind) => {
  if (status === "added") return "A"
  if (status === "deleted") return "D"
  return "M"
}

const statFromPatch = (file: string, patch: string) =>
  patch
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
    .reduce(
      (acc, line) => ({
        file,
        additions: acc.additions + (line.startsWith("+") ? 1 : 0),
        deletions: acc.deletions + (line.startsWith("-") ? 1 : 0),
      }),
      { file, additions: 0, deletions: 0 } satisfies Git.Stat,
    )

const cap = (text: string, options?: Git.PatchOptions) => {
  const truncated = options?.maxOutputBytes !== undefined && Buffer.byteLength(text) > options.maxOutputBytes
  return { text: truncated ? text.slice(0, options.maxOutputBytes) : text, truncated } satisfies Git.Patch
}

export const layer = Layer.effect(
  Git.Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const patches = Effect.fn("SimulationGit.patches")(function* (cwd: string) {
      const directory = path.join(cwd, "_patches")
      const files = yield* fs.readDirectory(directory, { recursive: true }).pipe(Effect.catch(() => Effect.succeed([])))
      const text = yield* Effect.forEach(
        files
          .filter((file) => file.endsWith(".patch"))
          .toSorted((a, b) => a.localeCompare(b)),
        (file) => fs.readFileString(path.join(directory, file)).pipe(Effect.catch(() => Effect.succeed(""))),
      )
      return splitPatch(text.filter(Boolean).join("\n"))
    })

    const items = Effect.fn("SimulationGit.items")(function* (cwd: string) {
      return (yield* patches(cwd)).flatMap((patch) => {
        const file = fileFromPatch(patch)
        if (!file) return []
        const status = statusFromPatch(patch)
        return [{ file, code: codeFromStatus(status), status } satisfies Git.Item]
      })
    })

    const patchFor = Effect.fn("SimulationGit.patchFor")(function* (cwd: string, file: string, options?: Git.PatchOptions) {
      return cap(
        (yield* patches(cwd))
          .filter((patch) => fileFromPatch(patch) === file)
          .join(""),
        options,
      )
    })

    return Git.Service.of({
      run: () => Effect.succeed(emptyResult),
      branch: () => Effect.succeed("main"),
      prefix: () => Effect.succeed(""),
      defaultBranch: () => Effect.succeed({ name: "main", ref: "main" }),
      hasHead: () => Effect.succeed(true),
      mergeBase: () => Effect.succeed("HEAD"),
      show: () => Effect.succeed(""),
      status: items,
      diff: items,
      stats: Effect.fn("SimulationGit.stats")(function* (cwd: string) {
        return (yield* patches(cwd)).flatMap((patch) => {
          const file = fileFromPatch(patch)
          if (!file) return []
          return [statFromPatch(file, patch)]
        })
      }),
      patch: (cwd, _ref, file, options) => patchFor(cwd, file, options),
      patchAll: Effect.fn("SimulationGit.patchAll")(function* (cwd: string, _ref: string, options?: Git.PatchOptions) {
        return cap((yield* patches(cwd)).join(""), options)
      }),
      patchUntracked: patchFor,
      statUntracked: Effect.fn("SimulationGit.statUntracked")(function* (cwd: string, file: string) {
        const patch = (yield* patches(cwd)).find((item) => fileFromPatch(item) === file)
        if (!patch) return
        return statFromPatch(file, patch)
      }),
      applyPatch: () => Effect.succeed(emptyResult),
    })
  }),
)

export * as SimulationGit from "./git"
