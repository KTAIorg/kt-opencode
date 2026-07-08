import { describe, expect } from "bun:test"
import { LLM, LLMError, LLMEvent, Model, TransportReason } from "@opencode-ai/llm"
import * as OpenAIChat from "@opencode-ai/llm/protocols/openai-chat"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { it } from "./lib/effect"
import { RunnerScenario } from "./lib/runner-scenario"

const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const request = (text: string) => LLM.request({ model, prompt: text })
const textOf = (events: ReadonlyArray<LLMEvent>) => events.filter(LLMEvent.is.textDelta).map((event) => event.text)

describe("RunnerScenario", () => {
  it.effect("drives provider requests in execution order", () =>
    Effect.gen(function* () {
      const output: LLMEvent[][] = []
      const scenario = yield* RunnerScenario.make((llm) =>
        Effect.gen(function* () {
          output.push(Array.from(yield* LLM.stream(request("Echo this")).pipe(Stream.runCollect)))
          output.push(Array.from(yield* LLM.stream(request("Continue")).pipe(Stream.runCollect)))
        }).pipe(Effect.provide(llm.layer)),
      )

      yield* scenario.run(function* () {
        const first = yield* scenario.llm.next()
        expect(first.request.messages[0]?.content).toEqual([{ type: "text", text: "Echo this" }])
        yield* first.respond.toolCall("echo", { text: "hello" })

        const second = yield* scenario.llm.next()
        expect(second.request.messages[0]?.content).toEqual([{ type: "text", text: "Continue" }])
        yield* second.respond.text("Done")
      })

      expect(output[0]?.find(LLMEvent.is.toolCall)).toMatchObject({ name: "echo", input: { text: "hello" } })
      expect(textOf(output[1] ?? [])).toEqual(["Done"])
    }),
  )

  it.effect("pauses the runner until the pending request receives a response", () =>
    Effect.gen(function* () {
      const completed = yield* Deferred.make<void>()
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Wait")).pipe(
          Stream.runDrain,
          Effect.andThen(Deferred.succeed(completed, undefined)),
          Effect.provide(llm.layer),
        ),
      )

      yield* scenario.run(function* () {
        const call = yield* scenario.llm.next()
        expect(Deferred.isDoneUnsafe(completed)).toBe(false)
        yield* call.respond.stop()
      })

      expect(Deferred.isDoneUnsafe(completed)).toBe(true)
    }),
  )

  it.effect("accepts raw failing streams for lifecycle edge cases", () =>
    Effect.gen(function* () {
      const failure = new LLMError({
        module: "test",
        method: "stream",
        reason: new TransportReason({ message: "unavailable" }),
      })
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Fail")).pipe(Stream.runDrain, Effect.provide(llm.layer)),
      )

      expect(
        yield* scenario
          .run(function* () {
            const call = yield* scenario.llm.next()
            yield* call.respond.stream(
              Stream.concat(Stream.make(LLMEvent.stepStart({ index: 0 })), Stream.fail(failure)),
            )
          })
          .pipe(Effect.flip),
      ).toBe(failure)
    }),
  )

  it.effect("fails when an interaction leaves a request unanswered", () =>
    Effect.gen(function* () {
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Wait")).pipe(Stream.runDrain, Effect.provide(llm.layer)),
      )

      const failure = yield* scenario
        .run(function* () {
          yield* scenario.llm.next()
        })
        .pipe(Effect.flip)

      expect(failure).toMatchObject({ message: "Runner LLM request #1 was not handled by the interaction" })
    }),
  )

  it.effect("fails when the runner starts another request before the interaction finishes", () =>
    Effect.gen(function* () {
      const scenario = yield* RunnerScenario.make((llm) =>
        Effect.gen(function* () {
          yield* LLM.stream(request("First")).pipe(Stream.runDrain)
          yield* LLM.stream(request("Unexpected")).pipe(Stream.runDrain)
        }).pipe(Effect.provide(llm.layer)),
      )

      const failure = yield* scenario
        .run(function* () {
          const call = yield* scenario.llm.next()
          yield* call.respond.stop()
        })
        .pipe(Effect.flip)

      expect(failure).toMatchObject({ message: "Runner LLM request #2 was not handled by the interaction" })
    }),
  )

  it.effect("rejects a second response to the same request", () =>
    Effect.gen(function* () {
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Once")).pipe(Stream.runDrain, Effect.provide(llm.layer)),
      )
      let duplicate: Error | undefined

      yield* scenario.run(function* () {
        const call = yield* scenario.llm.next()
        yield* call.respond.stop()
        duplicate = yield* call.respond.stop().pipe(Effect.flip, Effect.orDie)
      })
      expect(duplicate?.message).toBe("Runner LLM request #1 is no longer awaiting a response")
    }),
  )

  it.effect("does not wait for the runner after a duplicate response", () =>
    Effect.gen(function* () {
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Once")).pipe(Stream.runDrain, Effect.andThen(Effect.never), Effect.provide(llm.layer)),
      )

      expect(
        yield* scenario
          .run(function* () {
            const call = yield* scenario.llm.next()
            yield* call.respond.stop()
            yield* call.respond.stop()
          })
          .pipe(Effect.flip),
      ).toMatchObject({ message: "Runner LLM request #1 is no longer awaiting a response" })
    }),
  )

  it.effect("surfaces a runner failure while waiting for its next request", () =>
    Effect.gen(function* () {
      const failure = new Error("runner failed")
      const scenario = yield* RunnerScenario.make(() => Effect.fail<Error>(failure))

      expect(
        yield* scenario
          .run(function* () {
            yield* scenario.llm.next()
          })
          .pipe(Effect.flip),
      ).toBe(failure)
    }),
  )

  it.effect("preserves a runner failure when its pending request closes", () =>
    Effect.gen(function* () {
      const fail = yield* Deferred.make<void>()
      const closed = yield* Deferred.make<void>()
      const failure = new Error("runner failed")
      const scenario = yield* RunnerScenario.make((llm) =>
        Effect.raceFirst(
          LLM.stream(request("Fail pending")).pipe(
            Stream.runDrain,
            Effect.ensuring(Deferred.succeed(closed, undefined)),
          ),
          Deferred.await(fail).pipe(Effect.andThen(Effect.fail(failure))),
        ).pipe(Effect.provide(llm.layer)),
      )

      expect(
        yield* scenario
          .run(function* () {
            const call = yield* scenario.llm.next()
            yield* Deferred.succeed(fail, undefined)
            yield* Deferred.await(closed)
            expect((yield* call.respond.stop().pipe(Effect.flip)).message).toBe(
              "Runner LLM request #1 is no longer awaiting a response",
            )
            yield* scenario.llm.next()
          })
          .pipe(Effect.flip),
      ).toBe(failure)
    }),
  )

  it.effect("rejects a stale response after the runner closes a request", () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const closed = yield* Deferred.make<void>()
      const scenario = yield* RunnerScenario.make((llm) =>
        Effect.raceFirst(
          LLM.stream(request("Close pending")).pipe(
            Stream.runDrain,
            Effect.ensuring(Deferred.succeed(closed, undefined)),
          ),
          Deferred.await(release),
        ).pipe(Effect.provide(llm.layer)),
      )

      yield* scenario.run(function* () {
        const call = yield* scenario.llm.next()
        yield* Deferred.succeed(release, undefined)
        yield* Deferred.await(closed)
        expect((yield* call.respond.stop().pipe(Effect.flip)).message).toBe(
          "Runner LLM request #1 is no longer awaiting a response",
        )
      })
    }),
  )

  it.effect("interrupts a runner that hangs after its final response", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Hang")).pipe(
          Stream.runDrain,
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          Effect.provide(llm.layer),
        ),
      )
      const run = yield* scenario
        .run(function* () {
          const call = yield* scenario.llm.next()
          yield* call.respond.stop()
        })
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)

      yield* Fiber.interrupt(run)

      expect(Deferred.isDoneUnsafe(interrupted)).toBe(true)
      expect(run.pollUnsafe()).toBeDefined()
    }),
  )

  it.effect("runs one scenario sequentially while retaining request history", () =>
    Effect.gen(function* () {
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Once")).pipe(Stream.runDrain, Effect.provide(llm.layer)),
      )
      yield* scenario.run(function* () {
        yield* (yield* scenario.llm.next()).respond.stop()
      })
      yield* scenario.run(function* () {
        yield* (yield* scenario.llm.next()).respond.stop()
      })

      expect(yield* scenario.llm.requests).toHaveLength(2)
    }),
  )

  it.effect("rejects concurrent runs of one scenario", () =>
    Effect.gen(function* () {
      const scenario = yield* RunnerScenario.make((llm) =>
        LLM.stream(request("Once")).pipe(Stream.runDrain, Effect.provide(llm.layer)),
      )
      const active = yield* scenario
        .run(function* () {
          yield* scenario.llm.next()
          yield* Effect.never
        })
        .pipe(Effect.forkChild)
      yield* Effect.yieldNow

      const failure = yield* scenario.run(function* (): Effect.gen.Return<void> {}).pipe(Effect.exit)
      expect(failure._tag).toBe("Failure")
      if (failure._tag !== "Failure") throw new Error("Expected concurrent run to fail")
      const error = failure.cause.reasons.find((reason) => reason._tag === "Fail")
      expect(error?._tag).toBe("Fail")
      if (error?._tag !== "Fail") throw new Error("Expected a typed failure")
      expect(error.error).toMatchObject({ message: "RunnerScenario.run is already active" })
      yield* Fiber.interrupt(active)
    }),
  )
})
