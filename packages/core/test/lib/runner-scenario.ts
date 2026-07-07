import {
  LLMClient,
  LLMEvent,
  type LLMClientShape,
  type LLMClientService,
  type LLMError,
  type LLMRequest,
} from "@opencode-ai/llm"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Queue, Ref, Stream } from "effect"

class RunnerEndedError extends Error {
  constructor() {
    super("Runner completed before the next LLM request")
  }
}

class RunnerScenarioUsedError extends Error {
  constructor() {
    super("RunnerScenario.run may only be called once")
  }
}

class RunnerLLMRequestError extends Error {
  constructor(readonly id: number) {
    super(`Runner LLM request #${id} was not handled by the interaction`)
  }
}

class RunnerLLMResponseClosedError extends Error {
  constructor(readonly id: number) {
    super(`Runner LLM request #${id} is no longer awaiting a response`)
  }
}

export interface RunnerLLMCall {
  readonly request: LLMRequest
  readonly respond: {
    readonly stop: () => Effect.Effect<void, Error>
    readonly text: (text: string, options?: { readonly id?: string }) => Effect.Effect<void, Error>
    readonly toolCall: (
      name: string,
      input: unknown,
      options?: { readonly id?: string; readonly providerExecuted?: boolean },
    ) => Effect.Effect<void, Error>
    readonly events: (...events: ReadonlyArray<LLMEvent>) => Effect.Effect<void, Error>
    readonly stream: (stream: Stream.Stream<LLMEvent, LLMError>) => Effect.Effect<void, Error>
    readonly fail: (error: LLMError) => Effect.Effect<void, Error>
  }
}

interface State {
  readonly started: boolean
  readonly accepting: boolean
  readonly ended: boolean
  readonly nextID: number
  readonly calls: ReadonlyMap<number, "pending" | "responded" | "closed">
  readonly requests: ReadonlyArray<LLMRequest>
}

type Registration =
  | { readonly _tag: "Registered"; readonly id: number }
  | { readonly _tag: "Unexpected"; readonly error: Error }

interface PendingCall {
  readonly id: number
  readonly call: RunnerLLMCall
}

interface RunnerLLMInternal {
  readonly llm: RunnerLLM
  readonly begin: Effect.Effect<void, RunnerScenarioUsedError>
  readonly finishInteraction: Effect.Effect<void, Error>
  readonly end: Effect.Effect<void>
}

export interface RunnerLLM {
  readonly layer: Layer.Layer<LLMClientService>
  readonly next: () => Effect.Effect<RunnerLLMCall, Error>
  readonly requests: Effect.Effect<ReadonlyArray<LLMRequest>>
}

const events = (...events: ReadonlyArray<LLMEvent>) => Stream.fromIterable(events)

const stop = () =>
  events(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )

const text = (value: string, options?: { readonly id?: string }) => {
  const id = options?.id ?? "text"
  return events(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.textStart({ id }),
    LLMEvent.textDelta({ id, text: value }),
    LLMEvent.textEnd({ id }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )
}

const toolCall = (
  name: string,
  input: unknown,
  options?: { readonly id?: string; readonly providerExecuted?: boolean },
) => {
  const id = options?.id ?? `call-${name}`
  return events(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.toolCall({ id, name, input, providerExecuted: options?.providerExecuted }),
    LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
    LLMEvent.finish({ reason: "tool-calls" }),
  )
}

const makeRunnerLLM = Effect.gen(function* () {
  const calls = yield* Queue.unbounded<PendingCall, Cause.Done>()
  const state = yield* Ref.make<State>({
    started: false,
    accepting: false,
    ended: false,
    nextID: 1,
    calls: new Map(),
    requests: [],
  })

  const respond = (
    id: number,
    response: Deferred.Deferred<Stream.Stream<LLMEvent, LLMError>>,
    stream: Stream.Stream<LLMEvent, LLMError>,
  ) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        const pending = yield* Ref.modify(state, (current) => {
          if (current.calls.get(id) !== "pending") return [false, current]
          return [true, { ...current, calls: new Map(current.calls).set(id, "responded") }]
        })
        if (!pending) return yield* Effect.fail(new RunnerLLMResponseClosedError(id))
        yield* Deferred.succeed(response, stream)
      }),
    )

  const stream = (request: LLMRequest) =>
    Stream.unwrap(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const response = yield* Deferred.make<Stream.Stream<LLMEvent, LLMError>>()
          const registered = yield* Ref.modify<State, Registration>(state, (current) => {
            if (!current.accepting) {
              const error = new RunnerLLMRequestError(current.nextID)
              return [
                { _tag: "Unexpected" as const, error },
                { ...current, nextID: current.nextID + 1, requests: [...current.requests, request] },
              ]
            }
            return [
              { _tag: "Registered" as const, id: current.nextID },
              {
                ...current,
                nextID: current.nextID + 1,
                calls: new Map(current.calls).set(current.nextID, "pending"),
                requests: [...current.requests, request],
              },
            ]
          })
          if (registered._tag === "Unexpected") return yield* Effect.fail(registered.error)
          const reply = (stream: Stream.Stream<LLMEvent, LLMError>) => respond(registered.id, response, stream)
          yield* Queue.offer(calls, {
            id: registered.id,
            call: {
              request,
              respond: {
                stop: () => reply(stop()),
                text: (value, options) => reply(text(value, options)),
                toolCall: (name, input, options) => reply(toolCall(name, input, options)),
                events: (...input) => reply(events(...input)),
                stream: reply,
                fail: (error) => reply(Stream.fail(error)),
              },
            },
          })
          return yield* restore(Deferred.await(response)).pipe(
            Effect.onInterrupt(() =>
              Ref.update(state, (current) =>
                current.calls.get(registered.id) === "pending"
                  ? { ...current, calls: new Map(current.calls).set(registered.id, "closed") }
                  : current,
              ),
            ),
          )
        }),
      ),
    )

  const next = (): Effect.Effect<RunnerLLMCall, Error> =>
    Effect.gen(function* () {
      if ((yield* Ref.get(state)).ended) return yield* Effect.fail(new RunnerEndedError())
      const pending = yield* Queue.take(calls).pipe(Effect.mapError(() => new RunnerEndedError()))
      const current = yield* Ref.get(state)
      if (current.ended) return yield* Effect.fail(new RunnerEndedError())
      if (current.calls.get(pending.id) === "pending") return pending.call
      return yield* next()
    })

  return {
    llm: {
      layer: Layer.succeed(
        LLMClient.Service,
        LLMClient.Service.of({
          prepare: () => Effect.die("RunnerLLM.prepare is not implemented"),
          stream: stream as LLMClientShape["stream"],
          generate: () => Effect.die("RunnerLLM.generate is not implemented"),
        }),
      ),
      next,
      requests: Ref.get(state).pipe(Effect.map((state) => state.requests)),
    },
    begin: Ref.modify<State, Effect.Effect<void, RunnerScenarioUsedError>>(state, (current) =>
      current.started
        ? [Effect.fail(new RunnerScenarioUsedError()), current]
        : [Effect.void, { ...current, started: true, accepting: true }],
    ).pipe(Effect.flatten),
    finishInteraction: Effect.gen(function* () {
      const unanswered = yield* Ref.modify(state, (current) => [
        [...current.calls].find(([, status]) => status === "pending")?.[0],
        { ...current, accepting: false },
      ])
      if (unanswered !== undefined) return yield* Effect.fail(new RunnerLLMRequestError(unanswered))
    }),
    end: Effect.gen(function* () {
      yield* Ref.update(state, (current) => ({ ...current, accepting: false, ended: true }))
      yield* Queue.end(calls)
    }),
  } satisfies RunnerLLMInternal
})

export interface RunnerScenario<RunError, RunRequirements> {
  readonly llm: RunnerLLM
  readonly run: <A, E, R>(
    interaction: () => Effect.gen.Return<A, E, R>,
  ) => Effect.Effect<A, RunError | E | Error, RunRequirements | R>
}

export namespace RunnerScenario {
  export const make = <RunResult, RunError, RunRequirements>(
    start: (llm: RunnerLLM) => Effect.Effect<RunResult, RunError, RunRequirements>,
  ): Effect.Effect<RunnerScenario<RunError, RunRequirements>> =>
    Effect.gen(function* () {
      const internal = yield* makeRunnerLLM
      const run = <A, E, R>(
        interaction: () => Effect.gen.Return<A, E, R>,
      ): Effect.Effect<A, RunError | E | Error, RunRequirements | R> =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            yield* internal.begin
            const runner = yield* start(internal.llm).pipe(Effect.ensuring(internal.end), Effect.forkChild)
            return yield* restore(
              Effect.gen(function* () {
                const interactionExit = yield* Effect.gen(interaction).pipe(Effect.exit)
                if (Exit.isSuccess(interactionExit)) {
                  yield* internal.finishInteraction
                  yield* Fiber.join(runner)
                  return interactionExit.value
                }
                const error = Cause.findErrorOption(interactionExit.cause)
                if (Option.isSome(error) && error.value instanceof RunnerEndedError) yield* Fiber.join(runner)
                return yield* Effect.failCause(interactionExit.cause)
              }),
            ).pipe(Effect.ensuring(Fiber.interrupt(runner).pipe(Effect.andThen(internal.end))))
          }),
        )
      return {
        llm: internal.llm,
        run,
      }
    })
}
