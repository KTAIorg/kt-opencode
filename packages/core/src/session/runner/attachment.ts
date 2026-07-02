export * as SessionRunnerAttachment from "./attachment"

import { fileURLToPath } from "url"
import { Effect } from "effect"
import { Image } from "../../image"
import { AbsolutePath } from "../../schema"
import { ReadToolFileSystem } from "../../tool/read-filesystem"
import { SessionEvent } from "../event"
import type { FileAttachment, Prompt } from "../prompt"

export interface Services {
  readonly reader: ReadToolFileSystem.Interface
  readonly image: Image.Interface
}

/**
 * Capture model-visible content for a prompt's local `file:` attachments at
 * promotion time, so the durable user message snapshots what the user attached.
 *
 * Providers accept media content only for a narrow set of mimes, so lowering an
 * unresolved `file:` URI (or an `application/x-directory` attachment) as a media
 * part fails the provider turn. Directories resolve to an inline listing, text
 * files to inline content, and images to normalized data URLs. Every result is
 * bounded: reads cap at `MAX_READ_BYTES`/`MAX_READ_LINES`, listings at
 * `MAX_READ_LINES` entries, and images at the configured normalization limit.
 * Other URI schemes (data URLs, MCP resources) are skipped, and unreadable
 * attachments resolve to a model-visible note instead of failing promotion.
 */
export const resolutions = Effect.fn("SessionRunnerAttachment.resolutions")(function* (
  services: Services,
  prompt: Prompt,
) {
  const locals = (prompt.files ?? []).filter(local)
  const unique = [...new Map(locals.map((file) => [file.uri, file])).values()]
  return yield* Effect.forEach(unique, (file) =>
    resolve(services, file).pipe(
      Effect.map((resolved) => SessionEvent.AttachmentResolution.make({ uri: file.uri, resolved })),
    ),
  )
})

const local = (file: FileAttachment) => file.uri.startsWith("file:")

const wrap = (tag: string, path: string, body: string) => `<${tag} path=${JSON.stringify(path)}>\n${body}\n</${tag}>`

// Mirror V1's `?start`/`?end` line-range attachment parameters.
const pageFromRange = (url: URL) => {
  const start = parseInt(url.searchParams.get("start") ?? "", 10)
  if (!Number.isInteger(start) || start < 1) return undefined
  const end = parseInt(url.searchParams.get("end") ?? "", 10)
  return { offset: start, ...(end >= start ? { limit: end - start + 1 } : {}) }
}

const resolve = (services: Services, file: FileAttachment) =>
  Effect.gen(function* () {
    const { target, page } = yield* Effect.try({
      try: () => {
        const url = new URL(file.uri)
        const page = pageFromRange(url)
        url.search = ""
        url.hash = ""
        return { target: AbsolutePath.make(fileURLToPath(url)), page }
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    })
    const display = file.name ?? target
    const kind = yield* services.reader.inspect(target)
    if (kind === "directory") {
      const listing = yield* services.reader.list(target)
      const lines = [
        ...listing.entries.map((entry) => entry.path),
        ...(listing.truncated ? ["(listing truncated)"] : []),
      ]
      return wrap("attached-directory", display, lines.join("\n"))
    }
    const content = yield* services.reader.read(target, display, page)
    if (content instanceof ReadToolFileSystem.TextPage) {
      const truncated = content.truncated ? "\n(content truncated)" : ""
      return wrap("attached-file", display, content.content + truncated)
    }
    if (content.encoding === "base64") {
      const normalized = yield* services.image
        .normalize(display, { ...content, encoding: "base64" })
        .pipe(Effect.catchTag("Image.ResizerUnavailableError", () => Effect.succeed(content)))
      return `data:${normalized.mime};base64,${normalized.content}`
    }
    return wrap("attached-file", display, content.content)
  }).pipe(Effect.catch((error) => Effect.succeed(wrap("attachment-unavailable", file.name ?? file.uri, error.message))))
