# V2 Desktop and Web API Migration

## Decision

Desktop and web should move from the legacy `@opencode-ai/sdk` transport to
`@opencode-ai/client` and the standalone V2 server. Metadata, lifecycle,
location, integration, and project-copy state should use V2 models directly.

The existing app timeline should remain on its V1 `Message` and `Part` shape
during this migration. A narrow app-side compatibility projection should map
V2 session messages and events into that shape. This is not runtime V1 support:
the app will call only V2 endpoints, and the standalone server will expose only
V2 APIs. The compatibility boundary exists solely to avoid rewriting the mature
timeline and message-part UI at the same time as the transport migration.

The migration is larger than changing HTTP paths. The important contract
changes are:

- A prompt is durable asynchronous admission, not a request that returns a
  completed assistant message.
- Session messages are V2 projections on the wire. The app adapter projects
  them into a legacy message plus parts without treating that shape as durable
  server state.
- The global event stream carries `{ type, data, location }`, not
  `{ directory, payload: { type, properties } }`.
- Location is explicit on requests and session placement is durable.
- Most mutations return `204`; read responses use `{ data }`, pagination uses
  `{ data, cursor }`, and location reads use `{ location, data }`.
- Provider authentication is integration and credential management.
- Revert is a staged operation.

This document compares the 125 legacy endpoints in `packages/opencode` with the
105 endpoints assembled by `packages/protocol/src/api.ts`. The standalone V2
server mounts the latter through `packages/server/src/routes.ts`.

## Current Architecture

The browser and desktop renderer both use `packages/app`. The app currently:

- creates `@opencode-ai/sdk/v2/client` clients in
  `packages/app/src/utils/server.ts`;
- creates implicit directory-scoped clients in
  `packages/app/src/context/server-sdk.tsx`;
- consumes the legacy `/global/event` envelope;
- stores legacy `Session`, `Message`, and `Part` values in
  `packages/app/src/context/server-session.ts` and global sync;
- submits with `/session/:id/prompt_async` and observes legacy message-part
  events.

The `v2` import path in `@opencode-ai/sdk` is the generated client for the V1
server API. It is not the client for the V2 architecture. The V2 Promise client
is exported by `@opencode-ai/client` from `packages/client/src/promise`.

Desktop embeds the same app but starts the V1 backend:

- `packages/desktop/electron.vite.config.ts` bundles
  `packages/opencode/dist/node/node.js`;
- `packages/desktop/src/main/sidecar.ts` calls legacy `Server.listen`;
- `packages/desktop/src/main/server.ts` probes `/global/health`.

The V2 process entry is `packages/server/src/process.ts`. It requires a
password, exposes `/api/health`, and returns an address plus a shutdown effect.

## Complete Endpoint Comparison

The tables group every public endpoint by domain. `Direct` means the app can
adopt the V2 operation after request and response shape changes. `Redesign`
means the user workflow exists but its semantics or state model changed.
`Gap` means V2 has no corresponding operation and a product or protocol
decision is required.

### Server, Configuration, and Discovery

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /global/health` | `GET /api/health` | Direct. V2 adds `pid`. |
| `POST /global/dispose`, `POST /instance/dispose` | `POST /api/service/stop` | Redesign. V2 stops a managed instance by `instanceID`; it does not expose location disposal as an app command. |
| `POST /global/upgrade` | None | Gap. Desktop updater should own application upgrades; remote server upgrade needs a separate decision. |
| `GET/PATCH /global/config`, `GET/PATCH /config` | None | Gap. Configuration editing is used throughout settings and provider UI. Add a V2 config group or remove those controls. |
| `GET /path` | `GET /api/location` | Redesign. V2 returns placement identity, not host config/state/home paths. |
| None | `GET /api/server` | New. Returns advertised server URLs. |
| None | `GET/DELETE /api/debug/location` | New diagnostics; not an app bootstrap dependency. |
| `POST /log` | None | Gap. Client telemetry should use its own transport rather than a compatibility route. |

### Catalog, Providers, and Integrations

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /agent` | `GET /api/agent` | Direct. |
| `GET /command` | `GET /api/command` | Direct. |
| `GET /skill` | `GET /api/skill` | Direct. |
| None | `GET /api/plugin`, `GET /api/reference` | New catalogs. |
| `GET /provider`, `GET /config/providers` | `GET /api/provider`, `GET /api/provider/:providerID`, `GET /api/model`, `GET /api/model/default` | Redesign around separate provider and model catalogs. |
| `GET /provider/auth`, `POST /provider/:id/oauth/authorize`, `POST /provider/:id/oauth/callback`, `PUT/DELETE /auth/:id` | Integration and credential routes below | Redesign. Do not carry legacy auth calls forward. |
| None | `GET /api/integration`, `GET /api/integration/:id` | New integration catalog and connection state. |
| None | `POST /api/experimental/integration/wellknown` | New discovery operation. |
| None | `POST /api/integration/:id/connect/key` | Replaces direct API-key storage. |
| None | `POST /api/integration/:id/connect/oauth`, `GET/DELETE /api/integration/:id/connect/oauth/:attemptID`, `POST /api/integration/:id/connect/oauth/:attemptID/complete` | Replaces legacy OAuth with explicit attempts. |
| None | `POST /api/integration/:id/connect/command`, `GET/DELETE /api/integration/:id/connect/command/:attemptID` | New command-based connection flow. |
| None | `PATCH/DELETE /api/credential/:credentialID` | New credential lifecycle. |
| None | `POST /api/generate` | New stateless generation endpoint. |

### Projects, Copies, Workspaces, and Sync

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /project`, `GET /project/current`, `GET /project/:id/directories` | Same operations under `/api` | Direct, with V2 response shapes and explicit location. |
| `PATCH /project/:id` | None | Gap. The app edits project name and icon. Add project metadata mutation if this remains a server-owned feature. |
| `POST /project/git/init` | None | Gap. Add a VCS initialization operation or remove the action. |
| `POST /experimental/project/:id/copy/generate-name` | None | Gap. Name generation can be client-side or a separate generation request. |
| `GET/POST/DELETE /experimental/worktree`, `POST /experimental/worktree/reset` | Project-copy routes below | Redesign around project copies and strategies. |
| None | `POST/DELETE /experimental/project/:id/copy`, `POST /experimental/project/:id/copy/refresh` | New project-copy model. These are currently missing the `/api` prefix and must be fixed before cutover. |
| All seven `/experimental/workspace*` endpoints | None | Gap by design unless remote workspace placement remains a product requirement. |
| All four `/sync/*` endpoints | Native V2 durable storage and location | Remove. These are V1 synchronization internals, not client API equivalents. |
| `POST /experimental/control-plane/move-session` | `POST /api/session/:id/move` | Direct at the session API level. |

### Sessions and Messages

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /session` | `GET /api/session` | Direct with cursor pagination and different filters. |
| `GET /session/status` | `GET /api/session/active` | Redesign. V2 reports process-local active drains, not a status for every session. Idle state comes from projection and events. |
| `GET /session/:id` | `GET /api/session/:id` | Direct. |
| `GET /session/:id/children` | `GET /api/session?parentID=...` | Direct through list filtering. |
| `POST /session` | `POST /api/session` | Direct; pass durable location, agent, and model. |
| `DELETE /session/:id` | `DELETE /api/session/:id` | Direct; V2 also removes children. |
| `PATCH /session/:id` | `POST /api/session/:id/rename`, `/agent`, `/model`, `/move` | Redesign. Metadata, permission, and archive mutation have no equivalent. |
| `POST /session/:id/fork` | `POST /api/session/:id/fork` | Direct. |
| `POST /session/:id/abort` | `POST /api/session/:id/interrupt` | Redesign. Interrupt is an idle-safe, process-local operation returning `204`. |
| `POST /session/:id/init` | None | Gap. Remove AGENTS generation or add it as a named V2 command/workflow. |
| `POST/DELETE /session/:id/share` | None | Gap. Sharing needs a V2 design rather than retaining V1 session mutation. |
| `POST /session/:id/summarize` | `POST /api/session/:id/compact` | Redesign around durable compaction. |
| `POST /session/:id/message`, `POST /session/:id/prompt_async` | `POST /api/session/:id/prompt` | Redesign. V2 returns admitted pending input; completion is observed asynchronously. |
| `POST /session/:id/command` | `POST /api/session/:id/command` | Redesign request fields and delivery semantics. |
| `POST /session/:id/shell` | `POST /api/session/:id/shell` | Redesign. V2 emits shell lifecycle events and returns `204`. |
| None | `POST /api/session/:id/skill`, `/synthetic`, `/background`, `/wait` | New session operations. |
| `POST /session/:id/revert`, `/unrevert` | `POST /api/session/:id/revert/stage`, `/clear`, `/commit` | Redesign the undo UI around staged revert. |
| `GET /session/:id/message` | `GET /api/session/:id/message` | Redesign around `SessionMessage.Info[]` and body cursors. |
| `GET /session/:id/message/:messageID` | Same operation under `/api` | Direct after adopting V2 message types. |
| `DELETE /session/:id/message/:messageID`, `DELETE/PATCH .../part/:partID` | None | Remove. V2 projections are not directly mutable transcript storage. |
| `GET /session/:id/diff` | `GET /api/vcs/diff` only | Gap. Decide whether the review UI needs a session-scoped derived diff endpoint. |
| None | `GET /api/session/:id/context`, `/pending` | New projection and inbox reads. |
| None | `GET/PUT/DELETE /api/session/:id/instructions/entries[/key]` | New durable instruction entries. |
| None | `GET /api/experimental/session/:id/log` | New durable event log for diagnostics/recovery views. |

### Permission, Question, and Form

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /permission` | `GET /api/permission/request` | Direct for cross-location bootstrap. |
| Deprecated `POST /session/:id/permissions/:permissionID` and `POST /permission/:requestID/reply` | `POST /api/session/:id/permission/:requestID/reply` | Redesign around current replies and required session identity. |
| None | `POST/GET /api/session/:id/permission`, `GET .../:requestID` | New session-scoped request API. |
| None | `GET /api/permission/saved`, `DELETE /api/permission/saved/:id` | New saved decisions. |
| `GET /question`, `POST /question/:id/reply`, `POST /question/:id/reject` | `GET /api/question/request`, `GET /api/session/:id/question`, session-scoped reply/reject | Direct after adding session identity and new types. |
| None | `GET /api/form/request`, all six `/api/session/:id/form*` operations | New structured interaction surface. |

### Filesystem and VCS

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /file` | `GET /api/fs/list` | Direct with new entry types. |
| `GET /file/content` | `GET /api/fs/read/*` | Redesign. V2 returns bytes; the app must decode text and model binary/media content. |
| `GET /find/file` | `GET /api/fs/find` | Direct with a unified entry result. |
| `GET /find`, `GET /find/symbol` | None | Gap. Add text/symbol search only if required by current UI. |
| `GET /file/status` | `GET /api/vcs/status` | Direct. |
| `GET /vcs/status`, `GET /vcs/diff` | Same operations under `/api` | Direct. |
| `GET /vcs`, `GET /vcs/diff/raw`, `POST /vcs/apply` | None | Gap. Branch display, raw patch, and apply actions need explicit V2 endpoints or removal. |
| `GET /lsp`, `GET /formatter` | None | Gap. Status UI must be removed or supported by new read models. |

### PTY and Shell

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET/POST /pty`, `GET/PUT/DELETE /pty/:id` | Same operations under `/api` | Direct with explicit location and location envelopes. |
| `POST /pty/:id/connect-token`, `GET /pty/:id/connect` | Same operations under `/api` | Direct. Require ticket flow and remove legacy query-auth fallback. |
| `GET /pty/shells` | None | Gap. Use a client default shell or add server shell discovery. |
| None | `GET/POST /api/shell`, `GET /api/shell/:id`, `PATCH .../timeout`, `GET .../output`, `DELETE .../:id` | New background noninteractive shell API. |

### MCP, Events, and Experimental Controls

| V1 endpoints | V2 endpoints | Result |
| --- | --- | --- |
| `GET /mcp` | `GET /api/mcp` | Redesign around server catalog values rather than a status map. |
| `GET /experimental/resource` | `GET /api/mcp/resource` | Direct with a location envelope. |
| The seven V1 MCP add/connect/disconnect/auth endpoints | None | Redesign through integrations. Add MCP-specific mutations only for behavior integrations cannot represent. |
| `GET /global/event`, `GET /event` | `GET /api/event` | Redesign event routing and reducers. V2 intentionally uses one global cross-location stream. |
| All twelve `/tui/*` endpoints | None | Remove from desktop/web scope. They are TUI remote-control APIs. |
| `/experimental/capabilities`, `/console*`, `/tool*`, global experimental session/background endpoints | Session background and catalog APIs where applicable | Remove or redesign per feature. These are not general app bootstrap contracts. |

## Required Protocol Work Before Cutover

The app cannot reach feature parity against the current V2 surface. Resolve
these items before switching production desktop/web:

1. Add V2 configuration read/update operations, or deliberately remove server
   configuration editing from the app.
2. Decide whether project metadata mutation and git initialization remain app
   features; add narrow V2 operations if they do.
3. Decide archive semantics. Do not encode archive as a hidden compatibility
   field on session rename.
4. Decide whether sharing is part of V2. Remove the UI until a V2 sharing model
   exists.
5. Decide whether session-derived diffs are required. VCS working-tree diff is
   not equivalent to a session range diff.
6. Decide whether branch, LSP, formatter, text-search, symbol-search, and shell
   discovery status remain visible in the app.
7. Move project-copy routes from `/experimental/project/...` to
   `/api/experimental/project/...`. They are currently the only V2 group outside
   the V2 namespace and are normalized as legacy routes by the combined server.

Missing features should be removed or implemented as native V2 contracts. They
should not be routed through `packages/opencode`, which is V1 reference code.

## Application Design

### Client and Location

Replace `@opencode-ai/sdk` for runtime calls with `@opencode-ai/client` in
`packages/app`. `createSdkForServer` should construct the generated Promise
client with the existing Basic authorization and platform fetch behavior. Keep
the V1 session types as a type-only compatibility dependency while the existing
timeline consumes them.

Keep one server client. Replace implicit directory clients with a small
application context containing:

```ts
{
  client: OpenCodeClient
  location: Location.Ref
}
```

Every location-scoped call should pass that location. Session-scoped calls use
the session's durable placement and should not infer placement from the active
route after creation.

### Event Stream

Subscribe with `client.event.subscribe()`. Route an event to location state by
`event.location?.directory`, with a separate global channel when location is
absent. Preserve the current bounded UI batching and reconnect behavior, but
remove conversion to legacy `payload.properties`.

Metadata reducers should consume V2 definitions directly. Transcript events
should go through the timeline adapter, which updates its V1-shaped projection
from session step, text, reasoning, tool, input, retry, compaction, and
execution events. Do not manufacture legacy `message.*` events and feed them
back through the old reducer; apply the V2 event once at the compatibility
boundary and replace only the affected projected message and parts.

The live stream is lossy across disconnects. On reconnect, reload active
session projections and request lists rather than assuming event replay. The
durable experimental session log is useful for diagnostics but should not be a
hidden replacement for projection reads.

### Session Store and Timeline

Keep the legacy normalized `Message` and `Part` stores and existing timeline
components. Add the compatibility boundary at
`packages/app/src/context/v2/session-timeline-adapter.ts`. Paging should call the
V2 message endpoint with body cursors, then replace the adapter from the returned
`SessionMessage.Info[]` projection.

The adapter should expose a complete projection for one session:

```ts
type LegacyTimelineProjection = {
  messages: Message[]
  parts: Record<string, Part[]>
  status: SessionStatus
  notices: SessionMessageInfo[]
}

type TimelineAdapter = {
  replace(messages: readonly SessionMessageInfo[]): LegacyTimelineProjection
  apply(event: OpenCodeEvent): LegacyTimelineProjection
  sourceMessageID(legacyID: string): string | undefined
  legacyMessageID(sourceID: string): string | undefined
  reset(): void
}
```

Use `packages/core/src/session/message-updater.ts` as the authoritative event
fold and `packages/tui/src/context/data.tsx` as the browser-side live-update
reference. There is currently no reusable V2-to-V1 converter.

Projection rules:

- Preserve V2 user and assistant IDs where doing so does not violate app
  ordering assumptions. Map user text, files, and agents to the corresponding
  V1 parts.
- Map assistant text and reasoning content to V1 text and reasoning parts. V2
  content has no part ID, so derive a stable part ID from source message ID and
  absolute content index.
- Map V2 tool `streaming`, `running`, `completed`, and `error` states to V1
  `pending`, `running`, `completed`, and `error`. Preserve the V2 tool ID as the
  V1 `callID`; derive the V1 part ID independently.
- Serialize textual tool content into V1 output and map file content to
  attachments. Preserve structured values and V2-only state under compatibility
  metadata only when an existing component needs it.
- Map V2 retry state to a V1 retry part and retry session status. Map assistant
  errors to the closest V1 error type while retaining the source error type.
- Map V2 compaction to a synthetic V1 user message with a compaction part so the
  existing divider remains intact.
- Keep agent/model switches as adapter selection state. Do not fabricate false
  user turns for them.
- Keep synthetic, system, skill, and shell messages in `notices` until a narrow
  display mapping is defined. Fabricating user messages for them would corrupt
  assistant parent and turn semantics.

The conversion is intentionally lossy for historical path, parent identity,
structured tool result values, and some provider error details. These fields do
not have V2 equivalents. Defaults should be isolated in the adapter and tested,
not spread through timeline components.

V2 projection order is authoritative and is not guaranteed to match message ID
order. Queued input may be promoted after a later steer, and compaction may
reuse an admitted ID. `server-session.ts` currently uses sorted-ID binary
searches, so it must preserve array order independently of IDs. If a generated
legacy ID is needed, retain a bidirectional source-ID map for fork, revert, deep
links, and optimistic reconciliation.

With this boundary, most files under
`packages/app/src/pages/session/timeline/` and the legacy message-part renderers
can remain unchanged. Necessary changes are concentrated in:

- `packages/app/src/context/server-session.ts`;
- `packages/app/src/context/global-sync/event-reducer.ts`;
- `packages/app/src/context/global-sync/types.ts` for V2 session metadata while
  retaining V1 transcript types;
- `packages/app/src/context/server-sdk.tsx`;
- `packages/app/src/context/sync.tsx`.

### Prompt and Execution

Build V2 prompt input as text plus file and agent attachments. Map the existing
steer/queue UI directly to `delivery`. Use `session.prompt` for admission and
observe execution through projection/events. Use `session.interrupt`, staged
revert operations, and `session.compact` for their corresponding controls.

The app must not wait for prompt HTTP completion to obtain the assistant
message. An optional `session.wait` is suitable for explicit blocking workflows,
not the interactive composer.

### Integrations and Requests

Rebuild provider settings around integration connection methods and credential
records. Migrate permission and question bootstrap to cross-location request
lists, while replies use session-scoped endpoints. Add form handling as a new
request-dock type rather than forcing forms into question types.

### Files and Terminals

Decode `fs.read` bytes according to the UI use case and preserve binary/media
detection in one application boundary. Move terminal HTTP and WebSocket paths
to `/api/pty`, pass nested location query values, and require connect tickets.

## Desktop Design

Desktop should bundle a V2 entry that runs `ServerProcess.start`, not the V1
`Server.listen`. The sidecar needs a narrow Promise-facing wrapper that:

1. builds and runs the Effect server layer in the worker;
2. reports ready only after `ServerProcess.start` returns its bound address;
3. retains the running fiber/scope for shutdown;
4. passes the existing password, loopback hostname, selected port, and desktop
   origin CORS policy;
5. preserves the existing sidecar worker isolation and crash reporting.

Then update desktop health checks to `/api/health`. The renderer remains a
normal authenticated HTTP client and does not need a new preload API.

Likely files:

- `packages/desktop/electron.vite.config.ts`;
- `packages/desktop/src/main/env.d.ts`;
- `packages/desktop/src/main/sidecar.ts`;
- `packages/desktop/src/main/server.ts`;
- `packages/desktop/package.json`.

The standalone server currently receives CORS through its route construction,
so the wrapper must verify `oc://renderer` is accepted before replacing the V1
sidecar.

## Migration Sequence

1. Resolve the protocol gaps required for the retained product scope, fix the
   project-copy namespace, and regenerate `packages/client`.
2. Add V2 client construction, explicit location context, `/api/health`, and the
   native event subscription behind a development-only entry point.
3. Add the V2-to-V1 timeline adapter, switch transcript paging and live events
   to V2, and retain the existing timeline renderers. Record the required
   production timeline benchmark baseline before this step and compare it
   afterward.
4. Migrate prompt, command, shell, interrupt, compact, fork, revert, permission,
   question, and form workflows.
5. Migrate filesystem, VCS, PTY, projects, project copies, catalogs, integrations,
   and credentials.
6. Switch desktop packaging and lifecycle to the V2 server process.
7. Remove runtime `@opencode-ai/sdk` calls, V1 event handling, directory-scoped
   SDK clients, fallback endpoint probes, and unsupported V1-only UI. Retain
   only the type-level V1 transcript compatibility surface used by the adapter.
8. Remove transitional V1 event definitions from the V2 public event manifest
   after all current consumers stop depending on them, then regenerate clients.

This order isolates the deliberate V1 timeline shape behind one V2 projection
boundary. Transcript and event conversion is the highest-risk work and should
land before the broad set of mechanical endpoint migrations.

## Verification

Each migration slice should verify:

- generated Promise client request and response types;
- app typecheck and focused state/timeline tests;
- event reconnect followed by projection reconciliation;
- simultaneous sessions in different locations;
- prompt steer, queue, interrupt, retry, tool, permission, question, and form
  flows;
- PTY ticket connection and reconnect;
- desktop worker startup, authenticated `/api/health`, graceful shutdown, and
  crash recovery;
- browser and desktop behavior on both mobile-sized and desktop viewports.

Run package checks from their package directories. Public Protocol or Server
`HttpApi` changes require `bun run generate` from `packages/client`; generated
files must not be edited directly.
