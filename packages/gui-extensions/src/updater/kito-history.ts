import { Schema } from "effect"
import { compare, valid } from "semver"

const History = Schema.Struct({
  data: Schema.Struct({
    appId: Schema.Literal("kito"),
    channel: Schema.String,
    items: Schema.Array(Schema.Struct({ version: Schema.String, notes: Schema.Array(Schema.String) })),
  }),
})

const decode = Schema.decodeUnknownSync(History)

/** Kito's published notes between the last seen and installed versions, newest first. */
export async function loadKitoReleaseHighlights(input: {
  previous: string
  current: string
  channel: string
  locale: string
  signal: AbortSignal
  publicBaseUrl?: string
}) {
  const current = valid(input.current.replace(/^kito-v/i, ""))
  const previous = valid(input.previous.replace(/^kito-v/i, ""))

  if (!current || !previous) throw new Error("Invalid Kito release history version")
  if (compare(current, previous) <= 0) return []

  const url = new URL("/api/v1/apps/kito/releases/history", input.publicBaseUrl ?? "https://updates.ktyun.cc")
  url.searchParams.set("channel", input.channel)
  url.searchParams.set("locale", input.locale)

  const response = await fetch(url, {
    signal: AbortSignal.any([input.signal, AbortSignal.timeout(15_000)]),
    headers: { Accept: "application/json" },
  })

  if (!response.ok) throw new Error(`Kito release history failed: ${response.status}`)
  const history = decode(await response.json()).data

  if (history.channel !== input.channel) throw new Error("Kito release history channel does not match")

  const seen = new Set<string>()

  return history.items
    .flatMap((item) => {
      const version = valid(item.version.replace(/^kito-v/i, ""))
      const description = item.notes
        .map((note) => note.trim())
        .filter(Boolean)
        .join("\n")

      // Paused old versions may be absent from history; compare SemVer instead of list indices.
      if (!version || !description || compare(version, previous) <= 0 || compare(version, current) > 0) return []
      if (seen.has(version)) return []

      seen.add(version)
      return [{ version, description }]
    })
    .sort((left, right) => compare(right.version, left.version))
    .slice(0, 5)
}
