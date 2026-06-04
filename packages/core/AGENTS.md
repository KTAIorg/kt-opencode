# Core database migrations

## V2 beta reset boundary

During the pre-launch V2 beta period, these unreleased tables may be truncated
by an ordinary compatibility migration:

- `session_message`: disposable V2 timeline projection.
- `session_input`: disposable V2 prompt-admission inbox. Truncating it may drop
  accepted but unpromoted beta prompts, so call that out explicitly.
- `event`: unreleased workspace synchronization history.
- `event_sequence`: unreleased workspace synchronization cursor and owner state.

Resetting `event` and `event_sequence` intentionally makes existing Sessions
non-warpable until new replayable history is recorded. Call that out explicitly.

Do not truncate these tables as part of a V2 compatibility migration:

- `session`, `message`, `part`: canonical V1 Session history.

If a proposed V2 schema change appears to require resetting anything outside
the wipeable beta tables, stop and design an explicit compatibility or
fresh-database cutover plan instead.
