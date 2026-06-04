import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260604153000_session_message_identity",
  up(tx) {
    return Effect.gen(function* () {
      // These tables remain disposable until workspace sync and V2 Sessions launch.
      // Preserve canonical V1 session, message, and part rows.
      yield* tx.run(`DELETE FROM \`session_input\`;`)
      yield* tx.run(`DELETE FROM \`session_message\`;`)
      yield* tx.run(`DELETE FROM \`event\`;`)
      yield* tx.run(`DELETE FROM \`event_sequence\`;`)
    })
  },
} satisfies DatabaseMigration.Migration
