# Architecture Synthesis For Opencode Simulation

## Core Direction

The simulation system should be a real-app, TUI-driven, stateful model-based testing harness. It should not be a custom app command, a forked backend, or a broad reimplementation of opencode services.

The production app should run normally with one required flag:

```sh
OPENCODE_SIMULATION=1 bun run dev
```

That flag enables narrow foundational layer replacements and starts a frontend-owned simulation WebSocket server. The backend server remains the normal server; simulation-only backend controls are gated behind the flag and are only reached through the frontend control server.

## Control Surface

- Frontend TUI process owns the external control server.
- Protocol: JSON-RPC 2.0 over WebSocket.
- Bind loopback only.
- Start at port `40900`, scan upward if occupied, and log/display the actual URL.
- External drivers never talk directly to backend simulation routes.
- The frontend proxies backend simulation control over the same transport the TUI already uses.

Initial JSON-RPC method families:

- `ui.state`: screen, elements, focus, generated executable actions.
- `ui.action`: execute real user-level inputs through OpenTUI APIs.
- `ui.render`: force/wait for render and return state.
- `backend.filesystem.seed` / `backend.filesystem.write`.
- `backend.network.register`.
- `backend.llm.enqueue`.
- `backend.snapshot`.
- `trace.list` / `trace.clear` / `trace.export`.
- `run.stabilize`: wait for TUI/backend quiescence and return observations.

## Action Model

Actions must stay at real user-input level. The old branch's action vocabulary is the right starting point:

```ts
type UIAction =
  | { type: "typeText"; text: string }
  | { type: "pressKey"; key: string; modifiers?: KeyModifiers }
  | { type: "pressEnter" }
  | { type: "pressArrow"; direction: "up" | "down" | "left" | "right" }
  | { type: "focus"; target: number }
  | { type: "click"; target: number; x: number; y: number }
```

`ui.state` should return both:

- `elements`: focusable/clickable/editor renderables.
- `actions`: generated executable actions derived from those elements.

Fake OpenTUI renderer and visible terminal renderer should both adapt to this same action protocol.

## Foundational Layer Replacement

Simulation should plug into current `AppNodeBuilder.build(...)` and `AppNodeBuilderV1.build(...)` replacement seams.

Acceptable core boundaries to swap:

- `FileSystem.FileSystem` / `FSUtil.Service` where needed.
- `HttpClient.HttpClient`.
- `RequestExecutor` / `LLMClient` or equivalent lowest LLM boundary.
- Process spawner.
- Global paths / env / temp paths.
- Clock/random later, if needed.
- Database path or in-memory DB when simulation requires isolation.

Avoid replacing application services unless a core boundary is impossible:

- Do not replace `SessionPrompt`, `SessionProcessor`, `ToolRegistry`, route trees, or app-level provider abstractions as the default approach.
- Do not add a custom `simulate` command as the primary execution path.
- Do not implement a parallel fake app.

## Trace Model

The frontend simulation server owns an in-memory append-only trace log by default.

Trace records should include:

- Run metadata: app version, seed, renderer mode, simulation URL.
- Initial world setup: filesystem, config, environment, backend state.
- UI observations: screen, elements, generated actions, focused item.
- UI actions: command sent, concrete OpenTUI action, timestamp/order.
- Backend events: session events, provider requests, tool calls/results, permission decisions, status transitions.
- LLM scripts consumed and provider stream chunks.
- Filesystem and network operations/diffs.
- Stabilization boundaries and idle checks.
- Property checks and failures.
- Driver/model prompts and decisions when a model is driving exploration.

The trace must support:

- `trace.list`: query recent records.
- `trace.clear`: reset in-memory log.
- `trace.export`: produce JSON suitable for replay or test generation.

File writing is not required initially, but the trace schema should be JSONL-friendly.

## Model-Based Core

The architecture should distinguish five concepts:

```ts
type Scenario = InitialWorld & { actions: readonly Action[] }
type Action = UIAction | BackendControlAction | DriverAction
type Observation = UIObservation | BackendObservation | TraceObservation
type Model = abstract state machine over observable domains
type Property = (model, observations) => pass | fail | inconclusive
```

The model should be an executable specification, not a copy of production implementation.

Good model properties:

- Abstract.
- Observable.
- Finite nondeterminism.
- Explicit preconditions and postconditions.
- Valid transition relation.
- Allows multiple valid outcomes where opencode behavior is intentionally nondeterministic.

Bad model properties:

- Reimplements `SessionRunner` or provider streaming.
- Mirrors database internals exactly.
- Uses the same branch logic as production code.
- Requires complete knowledge of implementation scheduling.

## Quiescence

Quiescence is a first-class command, not a timeout hidden in tests.

`run.stabilize` should check, as far as possible:

- TUI render is idle.
- No active runner for the target session.
- No eligible durable input remains unprocessed unless intentionally queued.
- No running tool calls remain.
- Session status is stable.
- Projected transcript is stable across repeated reads.
- Backend event stream has no immediate pending event burst.

If quiescence cannot be proved, the command should return structured uncertainty instead of silently sleeping.

## Properties And Oracles

Initial built-in properties should be simple and high-signal:

- No frontend/backend crash.
- No unknown external network unless explicitly registered.
- No host filesystem escape.
- No duplicated visible message IDs.
- No orphan tool results.
- Durable prompt admission is not lost.
- Exact prompt retry reconciles or fails according to identity rules.
- Queue/steer promotion preserves documented delivery semantics.
- Interrupt/resume does not duplicate promoted inputs.
- Stabilized sessions have coherent status and transcript.

Use multiple oracle styles:

- Invariant checks after every step.
- Model/refinement checks against allowed abstract outcomes.
- Metamorphic checks across related runs.
- Differential checks across app versions, renderers, or storage modes.

## Generation Strategy

Start deterministic and structured.

Inputs to generate:

- Workspace filesystem shapes.
- Config variants.
- Auth/provider/model states.
- Session histories.
- Prompt text and delivery modes.
- LLM scripts with text, tool calls, errors, chunk boundaries.
- Tool outcomes and permission decisions.
- UI action sequences chosen from `ui.state.actions`.
- Interrupt/restart/crash points.

Use fast-check later for the external runner:

- `asyncProperty` for E2E simulation.
- `commands` for model-based command sequences.
- Seed/path replay.
- Shrinking action sequences.

Do not run huge property suites in CI by default. Use simulation to discover/minimize traces, then generate normal deterministic tests for CI.

## Coverage Guidance

The simulation server and runner should collect effectiveness signals from day one:

- UI element/action coverage.
- App route/screen coverage.
- Backend event type coverage.
- Session state transition coverage.
- Tool/permission outcome coverage.
- Network route coverage.
- Filesystem operation coverage.
- Error/retry/recovery coverage.
- Discarded/precondition-failed cases.

Later, preserve interesting traces as corpus seeds and mutate them structurally.

## Shrinking And Test Generation

Shrinking should operate on semantic trace structures:

- Remove actions.
- Reduce prompt text.
- Reduce filesystem size.
- Remove unrelated files/config fields.
- Simplify LLM scripts.
- Remove chunks while preserving tool-call validity.
- Move or remove interrupt/restart points.
- Reduce UI navigation before the failing action.

Generated normal tests should include:

- Minimal initial world.
- Explicit UI action sequence.
- Explicit LLM/tool/network scripts.
- Stabilization calls.
- Deterministic assertions over semantic observations.

## LLM/Agent Driver Feedback

The same WebSocket observations should support model-driven exploration.

Expose enough semantic context for a model to reason:

- Screen text.
- TUI elements with roles, labels, selectors, positions, capabilities.
- Available actions.
- Backend snapshot summaries.
- Recent trace records.
- Filesystem summary/diff.
- Network log.
- Session/message/tool summary.
- Property failures and uncertainty.

Generated properties from models should follow a lifecycle:

- Proposed from evidence.
- Translated to executable checks.
- Validity checked.
- Soundness checked on normal behavior.
- Coverage/adversarial checked where possible.
- Accepted, refined, or rejected with reason.

## First Implementation Milestone

Minimal useful milestone:

1. `OPENCODE_SIMULATION=1` activates simulation replacements and frontend control server.
2. Frontend starts JSON-RPC WebSocket on `127.0.0.1:40900+`.
3. `ui.state`, `ui.action`, `ui.render`, `trace.list`, `trace.clear`, `trace.export` work.
4. Fake and visible OpenTUI renderers share the same action protocol.
5. Backend simulation controls are proxied through frontend WebSocket.
6. Backend has gated control routes only when simulation flag is enabled.
7. In-memory trace records UI actions, observations, backend control calls, and backend snapshots.
8. Foundational replacements cover at least LLM and network denial/registration.
9. A simple driver can seed LLM response, type a prompt through the TUI, press enter, stabilize, and assert no crash plus response visible.
10. The resulting trace can be exported as deterministic JSON for later replay/test generation.
