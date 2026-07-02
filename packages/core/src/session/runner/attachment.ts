export * as SessionRunnerAttachment from "./attachment"

import { fileURLToPath } from "url"
import { Effect } from "effect"
import { AbsolutePath } from "../../schema"
import { ReadToolFileSystem } from "../../tool/read-filesystem"
import { SessionMessage } from "../message"
import type { FileAttachment } from "../prompt"

/**
 * Materialize local `file:` attachments during per-turn request assembly.
 *
 * Providers accept media content only for a narrow set of mimes, so lowering an
 * unresolved `file:` URI (or an `application/x-directory` attachment) as a media
 * part fails the provider turn. Directories become an inline listing, text files
 * become inline content, and images are re-encoded as data URLs. Other URI
 * schemes (data URLs, MCP resources) pass through unchanged, and unreadable
 * attachments degrade to a model-visible note instead of failing the turn. The
 * durable projected message is never modified.
 */
export const materialize = Effect.fn("SessionRunnerAttachment.materialize")(function* (
  reader: ReadToolFileSystem.Interface,
  messages: readonly SessionMessage.Message[],
) {
  return yield* Effect.forEach(messages, (message) => {
    if (message.type !== "user" || !message.files?.some(local)) return Effect.succeed(message)
    return Effect.forEach(message.files, (file) => materializeFile(reader, file)).pipe(
      Effect.map((results) =>
        SessionMessage.User.make({
          ...message,
          text: [
            message.text,
            ...results.flatMap((result) => (result.expansion === undefined ? [] : [result.expansion])),
          ].join("\n\n"),
          files: results.flatMap((result) => (result.file === undefined ? [] : [result.file])),
        }),
      ),
    )
  })
})

const local = (file: FileAttachment) => file.uri.startsWith("file:")

interface Materialized {
  readonly file?: FileAttachment
  readonly expansion?: string
}

const wrap = (tag: string, path: string, body: string) => `<${tag} path=${JSON.stringify(path)}>\n${body}\n</${tag}>`

const unavailable = (path: string, reason: string): Materialized => ({
  expansion: wrap("attachment-unavailable", path, reason),
})

// Mirror V1's `?start`/`?end` line-range attachment parameters.
const pageFromRange = (url: URL) => {
  const start = url.searchParams.get("start")
  if (start === null) return undefined
  const offset = Math.max(parseInt(start, 10) || 1, 1)
  const end = url.searchParams.get("end")
  const parsedEnd = end === null ? Number.NaN : parseInt(end, 10)
  return { offset, ...(parsedEnd >= offset ? { limit: parsedEnd - offset + 1 } : {}) }
}

const materializeFile = (reader: ReadToolFileSystem.Interface, file: FileAttachment) => {
  if (!local(file)) return Effect.succeed<Materialized>({ file })
  const resolved = Effect.try({
    try: () => {
      const url = new URL(file.uri)
      const page = pageFromRange(url)
      url.search = ""
      url.hash = ""
      return { target: AbsolutePath.make(fileURLToPath(url)), page }
    },
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
  return Effect.gen(function* () {
    const { target, page } = yield* resolved
    const display = file.name ?? target
    const kind = yield* reader.inspect(target)
    if (kind === "directory") {
      const listing = yield* reader.list(target)
      const lines = [
        ...listing.entries.map((entry) => entry.path),
        ...(listing.truncated ? ["(listing truncated)"] : []),
      ]
      return { expansion: wrap("attached-directory", display, lines.join("\n")) } satisfies Materialized
    }
    const content = yield* reader.read(target, display, page)
    if ("encoding" in content && content.encoding === "base64")
      return {
        file: { ...file, uri: `data:${content.mime};base64,${content.content}`, mime: content.mime },
      } satisfies Materialized
    const truncated = "truncated" in content && content.truncated ? "\n(content truncated)" : ""
    return { expansion: wrap("attached-file", display, content.content + truncated) } satisfies Materialized
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(unavailable(file.name ?? file.uri, error instanceof Error ? error.message : String(error))),
    ),
  )
}
