import { describe, expect } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, FileSystem } from "effect"
import { LayerNodePlatform } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Image } from "@opencode-ai/core/image"
import { Prompt } from "@opencode-ai/core/session/prompt"
import { SessionRunnerAttachment } from "@opencode-ai/core/session/runner/attachment"
import { ReadToolFileSystem } from "@opencode-ai/core/tool/read-filesystem"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([ReadToolFileSystem.node, LayerNodePlatform.filesystem])))

// The resizer-unavailable stub exercises the raw-content fallback deterministically.
const image = Image.Service.of({ normalize: () => Effect.fail(new Image.ResizerUnavailableError()) })

const fixture = Effect.gen(function* () {
  const services = { reader: yield* ReadToolFileSystem.Service, image }
  const files = yield* FileSystem.FileSystem
  const directory = yield* files.makeTempDirectoryScoped()
  return { services, files, directory }
})

const prompt = (files: NonNullable<Prompt["files"]>) => Prompt.make({ text: "Look at this", files })

describe("SessionRunnerAttachment.resolutions", () => {
  it.effect("resolves a directory attachment to a listing", () =>
    Effect.gen(function* () {
      const { services, files, directory } = yield* fixture
      yield* files.makeDirectory(path.join(directory, "src"))
      yield* files.writeFileString(path.join(directory, "package.json"), "{}")
      const uri = pathToFileURL(directory + path.sep).href

      const result = yield* SessionRunnerAttachment.resolutions(
        services,
        prompt([{ uri, mime: "application/x-directory", name: "project/" }]),
      )

      expect(result).toHaveLength(1)
      expect(result[0].uri).toBe(uri)
      expect(result[0].resolved).toContain('<attached-directory path="project/">')
      expect(result[0].resolved).toContain("src/")
      expect(result[0].resolved).toContain("package.json")
    }),
  )

  it.effect("resolves a text file attachment to inline content", () =>
    Effect.gen(function* () {
      const { services, files, directory } = yield* fixture
      const file = path.join(directory, "notes.md")
      yield* files.writeFileString(file, "first line\nsecond line\nthird line\n")

      const result = yield* SessionRunnerAttachment.resolutions(
        services,
        prompt([{ uri: pathToFileURL(file).href, mime: "text/markdown", name: "notes.md" }]),
      )

      expect(result[0].resolved).toContain('<attached-file path="notes.md">')
      expect(result[0].resolved).toContain("second line")
    }),
  )

  it.effect("honors ?start/?end line-range parameters", () =>
    Effect.gen(function* () {
      const { services, files, directory } = yield* fixture
      const file = path.join(directory, "notes.md")
      yield* files.writeFileString(file, "first line\nsecond line\nthird line\nfourth line\n")

      const result = yield* SessionRunnerAttachment.resolutions(
        services,
        prompt([{ uri: pathToFileURL(file).href + "?start=2&end=3", mime: "text/markdown", name: "notes.md#2-3" }]),
      )

      expect(result[0].resolved).toContain("second line")
      expect(result[0].resolved).toContain("third line")
      expect(result[0].resolved).not.toContain("first line")
      expect(result[0].resolved).not.toContain("fourth line")
    }),
  )

  it.effect("resolves an image attachment to a data URL", () =>
    Effect.gen(function* () {
      const { services, files, directory } = yield* fixture
      const file = path.join(directory, "pixel.png")
      const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
      yield* files.writeFile(file, png)

      const result = yield* SessionRunnerAttachment.resolutions(
        services,
        prompt([{ uri: pathToFileURL(file).href, mime: "image/png", name: "pixel.png" }]),
      )

      expect(result[0].resolved).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`)
    }),
  )

  it.effect("resolves unreadable attachments to a model-visible note instead of failing", () =>
    Effect.gen(function* () {
      const { services, directory } = yield* fixture

      const result = yield* SessionRunnerAttachment.resolutions(
        services,
        prompt([
          { uri: pathToFileURL(path.join(directory, "missing.txt")).href, mime: "text/plain", name: "missing.txt" },
        ]),
      )

      expect(result[0].resolved).toContain('<attachment-unavailable path="missing.txt">')
    }),
  )

  it.effect("skips data URLs and deduplicates repeated URIs", () =>
    Effect.gen(function* () {
      const { services, files, directory } = yield* fixture
      const file = path.join(directory, "notes.md")
      yield* files.writeFileString(file, "content\n")
      const uri = pathToFileURL(file).href

      const result = yield* SessionRunnerAttachment.resolutions(
        services,
        prompt([
          { uri: "data:image/png;base64,aGVsbG8=", mime: "image/png", name: "hello.png" },
          { uri, mime: "text/plain", name: "notes.md" },
          { uri, mime: "text/plain", name: "notes.md" },
        ]),
      )

      expect(result).toHaveLength(1)
      expect(result[0].uri).toBe(uri)
    }),
  )
})
