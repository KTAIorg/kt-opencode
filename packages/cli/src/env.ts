import { Config } from "effect"

// Every environment variable the CLI reads, in one place. Consumers yield
// these instead of touching process.env so the full surface stays visible,
// typed, and redacted where secret.

// The Kito server password: sent by clients connecting to an explicit
// --server, and adopted by a manually run or standalone server. KITO_* names
// win; the legacy OPENCODE_* names are still honored for compatibility.
export const password = Config.redacted("KITO_PASSWORD").pipe(
  Config.orElse(() => Config.redacted("KITO_SERVER_PASSWORD")),
  Config.orElse(() => Config.redacted("OPENCODE_PASSWORD")),
  Config.orElse(() => Config.redacted("OPENCODE_SERVER_PASSWORD")),
  Config.withDefault(undefined),
)

export function session() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        entry[0] !== "KITO_PASSWORD" &&
        entry[0] !== "KITO_SERVER_PASSWORD" &&
        entry[0] !== "OPENCODE_PASSWORD" &&
        entry[0] !== "OPENCODE_SERVER_PASSWORD",
    ),
  )
}

export * as Env from "./env"
