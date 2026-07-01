# Paper Analyses For Simulation Architecture

This document extracts implementation-relevant lessons from the local paper corpus. The focus is opencode's proposed simulation system: real TUI-driven execution, narrow foundational layer replacement, WebSocket control, trace recording, model-based/property-based exploration, and generated deterministic tests.

## 2016: Mysteries of Dropbox

**Main idea:** stateful PBT can find bugs in real, black-box, nondeterministic distributed systems by generating action sequences, recording observations, and checking whether the observation trace has some valid explanation under a small model.

Useful techniques:

- Generate commands separately from observed effects.
- Model hidden nondeterministic events explicitly, even when the SUT does not expose them.
- Accept traces if there exists a sequence of hidden events that makes observations valid.
- Maintain possible model states, not a single expected state.
- Make quiescence explicit with a `STABILIZE` command.
- Re-run flaky failures during shrinking when nondeterminism cannot be fully controlled.

Pitfalls:

- Quiescence detection can lie.
- A model that is too permissive can explain away real bugs.
- Timing-dependent failures need either scheduler control or repeated validation.
- Raw happens-before modeling can become elegant but impractical.

Implications for opencode:

- Do not compare raw transcripts only. Compare observed behavior against allowed abstract outcomes.
- Represent hidden runtime transitions like prompt promotion, session wake, provider turn continuation, tool completion, retries, interrupt delivery, and event projection.
- Add a `drainUntilIdle` or `stabilize` simulation command with strict checks.
- Record all generated commands, UI actions, backend events, provider scripts, tool results, and snapshots in an append-only trace.
- Shrinking should preserve semantic validity and revalidate nondeterministic failures.

## 2019: Coverage Guided, Property Based Testing

**Main idea:** plain random generators often fail when valid inputs have sparse semantic preconditions. Coverage-guided PBT keeps interesting inputs and mutates structured values to explore deeper states.

Useful techniques:

- Maintain a corpus of inputs that improve coverage.
- Mutate typed structures rather than raw bytes.
- Keep both successful seeds and promising discarded seeds.
- Fall back to random generation when mutation stalls.
- Use coverage and progress counters, not only binary edge coverage.

Pitfalls:

- Instrumenting irrelevant framework code hurts performance.
- Generic mutators can explode in search space.
- Expert handwritten generators still outperform generic mutation but are expensive.

Implications for opencode:

- Preserve interesting `Scenario` and `Trace` seeds.
- Add structured mutators for prompts, tool calls, provider chunks, permission decisions, filesystems, config, interrupt timing, crash/restart points, and scheduler actions.
- Track semantic novelty: event types, session states, tool outcomes, permission branches, replay/recovery paths, and UI routes.
- Avoid byte fuzzing as the core; use it only inside fields that are naturally bytes/text.

## 2021: Model-Based Testing In Practice

**Main idea:** MBT works in industrial E2E systems when models are pragmatic, visible, and integrated into normal automation. Graph-like models are useful because actions and assertions are explicit and coverage is understandable.

Useful techniques:

- Model nodes as states/checkpoints and edges as actions.
- Split large systems into small composable models.
- Use traversal strategies, weights, and stop conditions.
- Report paths, coverage, and model transitions.

Pitfalls:

- Heavy formal models reduce adoption.
- Auto-inferred models can be noisy and costly to clean up.
- Coverage metrics must be live and inspectable.

Implications for opencode:

- Start with a small simulation DSL, not a complete formal model.
- Model domains separately: session lifecycle, prompt admission, queue/steer, tool execution, permissions, interrupts, compaction, crash/restart.
- Track command coverage, transition coverage, property coverage, and failure-mode coverage.
- Keep generated failure output readable: model path, user inputs, app observations, violated invariant.

## 2022: Property-Based Testing For Metamorphic Testing

**Main idea:** metamorphic testing helps when exact expected outputs are unavailable. It checks relations between multiple executions or transformed inputs.

Useful techniques:

- Generate source cases, derive follow-up cases, and compare related outputs.
- Use generators and shrinkers that preserve relation validity.
- Combine multiple metamorphic relations.

Pitfalls:

- Weak metamorphic relations miss real faults.
- Naive shrinkers can break validity.
- Reimplementing production logic in the oracle makes the test useless.

Implications for opencode:

- Use metamorphic relations for nondeterministic model behavior.
- Examples:
  - Same prompt ID and same delivery mode should reconcile exactly on retry.
  - Queueing independent prompts should preserve durable admission order.
  - Interrupt/resume should not duplicate promoted user messages or orphan tool results.
  - Crash after durable admission should not invent provider work unless recovery explicitly permits it.
  - Fake renderer and visible renderer should agree on semantic action results.
  - Two app versions should satisfy the same semantic invariants for the same trace.

## 2022: Climbing The Stairway To Verification

**Main idea:** PBT becomes stronger when it mirrors a refinement/specification structure. The test asks whether implementation behavior refines an executable abstract model.

Useful techniques:

- Generate one canonical test case and project it into abstract and concrete worlds.
- Compare implementation output to a finite set of model-allowed outcomes.
- Keep models abstract and observable.
- Use executable specs as cheaper, incremental versions of formal proofs.

Pitfalls:

- The model can become a second implementation.
- Strong preconditions plus random generation cause excessive discarded tests.
- Overly abstract nondeterminism can explode.

Implications for opencode:

- Build simulation around `scenario -> model outcomes -> real app run -> relation check`.
- The model should represent visible session, message, tool, provider, permission, event, status, and filesystem effects.
- The model must not reimplement `SessionRunner`, provider streaming, tool registry, or Effect scheduling.
- Generate concrete scenarios and derive abstract model inputs from them.

## 2023: QuickerCheck

**Main idea:** PBT and shrinking can be parallelized, especially for expensive properties, if workers have isolated state and reproducible seeds.

Useful techniques:

- Give each worker its own PRNG seed and size schedule.
- Stop all workers after the first counterexample.
- Run cleanup/finalizers for interrupted effectful properties.
- Use greedy parallel shrinking when deterministic minimality is less important than speed.

Pitfalls:

- Shared filesystem/global state breaks parallel PBT.
- Cancellation can leave processes, files, sockets, or locks behind.
- Parallel shrinking can be slower for cheap properties.

Implications for opencode:

- Design simulation workers as isolated from the start: workspace, DB, ports, fake providers, random seeds, trace buffers.
- Use `(campaignSeed, workerID, caseIndex)` for reproducibility.
- Separate fast local runs from long parallel campaigns.
- Add cleanup boundaries for every case.

## 2024: Can Large Language Models Write Good Property-Based Tests?

**Main idea:** LLMs can synthesize useful PBTs, but generated tests must be validated for validity, soundness, and property coverage. Two-stage prompting outperforms monolithic generation.

Useful techniques:

- First extract properties, then generate tests for one property at a time.
- Classify failures as invalid test, unsound property, weak property, or real bug.
- Use mutation/property coverage to check whether a property actually detects violations.

Pitfalls:

- Passing generated tests can be weak.
- LLMs overgeneralize documentation and miss implicit preconditions.
- Mutation coverage can be noisy if mutants are invalid or equivalent.

Implications for opencode:

- Treat model-generated simulation properties as candidates.
- Store property lifecycle: proposed, executable, validity-checked, soundness-checked, coverage-scored, accepted, rejected.
- Generate small focused properties, not one huge “test opencode” property.
- Expose enough observations for a model to validate its own property assumptions.

## 2024: Property-Based Testing In Practice

**Main idea:** experienced developers use PBT in a small number of high-leverage patterns. The hardest parts are writing useful properties, writing generators, shrinking, and knowing whether passing tests mean anything.

Useful techniques:

- High-leverage patterns include differential testing, model-based tests, round trips, catastrophic failure properties, and invariants.
- Developers validate PBT effectiveness through mutation testing, example inspection, code coverage, property coverage, and supplementary example tests.
- Passing tests need inspectable generated examples and distribution feedback.

Pitfalls:

- Derived generators can create false confidence.
- Shrinkers can violate invariants.
- Slow PBTs get removed.

Implications for opencode:

- Provide built-in property families instead of requiring every contributor to invent properties.
- Show generator stats: action distribution, trace length, discarded cases, transition coverage, example traces.
- Make failure output a concise, reviewable artifact.
- Support “promote minimized trace to normal test.”

## 2026: Agentic PBT

**Main idea:** an agentic loop can generate better PBTs than one-shot prompting by inspecting code/docs, proposing evidence-backed properties, running tests, triaging failures, refining false alarms, and reporting only reproducible bugs.

Useful techniques:

- Use a structured loop: inspect, propose, execute, triage, refine, report.
- Prefer high-value property patterns: invariants, round trips, inverse operations, multiple implementations, laws, confluence, metamorphic relations, and no-crash parser entrypoints.
- Keep an evidence chain for every property.

Pitfalls:

- Intent ambiguity is the main false-positive source.
- Internal helpers often have implicit preconditions.
- Extreme generated inputs can be unrealistic.

Implications for opencode:

- The simulation system should be friendly to model-driven exploration, not just batch tests.
- Store prompts, observations, selected actions, available actions, traces, refinements, and final classifications.
- Add a triage workflow before surfacing model-generated failures as bugs.

## 2026: Evolution Of Python Tests Into PBT

**Main idea:** existing example and parameterized tests often evolve naturally into PBTs. Generated deterministic tests and PBTs should be connected, not treated as separate worlds.

Useful techniques:

- Convert constants/parameter tables into generators.
- Keep explicit examples for known edge cases.
- Adjust generators/settings over time as tests mature.

Pitfalls:

- Coverage can be inflated by harness/generator code.
- PBTs can fail early and cover fewer later assertions.
- Slow PBTs are removed.

Implications for opencode:

- Use existing tests as simulation corpus seeds.
- Convert minimized simulation traces into normal deterministic tests.
- Keep SUT coverage separate from simulation harness coverage.
- Store generated regressions as explicit fixtures.

## 2026: Natural Language To Executable Properties For Mobile Apps

**Main idea:** natural-language app properties can become executable UI properties if the system first performs semantic grounding of UI elements.

Useful techniques:

- Decompose property synthesis into UI semantic grounding and executable property synthesis.
- Represent properties as precondition, interaction scenario, postcondition.
- Enrich each widget with text, ID, type, semantic label, functionality, screenshot/crop, and provenance.

Pitfalls:

- Similar widgets cause grounding errors.
- Free-form natural language is less reliable than structured Given/When/Then descriptions.
- Incorrect preconditions/postconditions are more common than incorrect interactions.

Implications for opencode:

- Expose semantic TUI state, not just screen text and coordinates.
- Elements/actions should have stable IDs, roles, labels, capabilities, focus/click/edit metadata, visibility, and provenance.
- Generated properties should use a precondition/action/postcondition structure.

## 2026: PropGen Mobile App Testing

**Main idea:** properties can be generated from runtime behavioral evidence. The loop is exploration, evidence collection, property synthesis, executable translation, testing, feedback, and refinement.

Useful techniques:

- Record condition-action-outcome traces.
- Use functionality-guided exploration plus random exploration fallback.
- Refine imprecise properties by classifying whether the problem is precondition, interaction, or postcondition.

Pitfalls:

- Single traces cause overfitting.
- Generated properties can assert incidental UI details.
- Refinement can overfit unless anchored to original evidence.

Implications for opencode:

- Record rich traces with before-state, action intent, concrete action, model/provider/tool effects, after-state, state diff, and outcome label.
- Let models derive properties from observed behavior, then validate and refine them.
- Use both model-guided goals and stochastic action exploration.
