/*
 * Portions adapted from Test262 at revision 250f204f23a9249ff204be2baec29600faae7b75:
 * - test/built-ins/Promise/all/S25.4.4.1_A1.1_T1.js
 * - test/built-ins/Promise/all/S25.4.4.1_A2.1_T1.js
 * - test/built-ins/Promise/all/S25.4.4.1_A2.3_T1.js
 * - test/built-ins/Promise/all/S25.4.4.1_A2.3_T2.js
 * - test/built-ins/Promise/all/S25.4.4.1_A2.3_T3.js
 * - test/built-ins/Promise/all/S25.4.4.1_A7.1_T1.js
 * - test/built-ins/Promise/all/S25.4.4.1_A8.2_T1.js
 * - test/built-ins/Promise/all/S25.4.4.1_A8.2_T2.js
 * - test/built-ins/Promise/all/iter-arg-is-number-reject.js
 * - test/built-ins/Promise/all/resolve-non-thenable.js
 * - test/built-ins/Promise/allSettled/is-function.js
 * - test/built-ins/Promise/allSettled/returns-promise.js
 * - test/built-ins/Promise/allSettled/resolves-empty-array.js
 * - test/built-ins/Promise/allSettled/resolves-to-array.js
 * - test/built-ins/Promise/allSettled/resolved-all-fulfilled.js
 * - test/built-ins/Promise/allSettled/resolved-all-mixed.js
 * - test/built-ins/Promise/allSettled/resolved-all-rejected.js
 * - test/built-ins/Promise/allSettled/iter-arg-is-number-reject.js
 * - test/built-ins/Promise/allSettled/resolve-non-thenable.js
 * - test/built-ins/Promise/race/S25.4.4.3_A1.1_T1.js
 * - test/built-ins/Promise/race/S25.4.4.3_A7.1_T1.js
 * - test/built-ins/Promise/race/S25.4.4.3_A7.1_T2.js
 * - test/built-ins/Promise/race/S25.4.4.3_A7.1_T3.js
 * - test/built-ins/Promise/race/S25.4.4.3_A7.2_T1.js
 * - test/built-ins/Promise/race/S25.4.4.3_A7.3_T1.js
 * - test/built-ins/Promise/race/S25.4.4.3_A7.3_T2.js
 * - test/built-ins/Promise/race/iter-arg-is-number-reject.js
 * - test/built-ins/Promise/resolve/S25.4.4.5_A1.1_T1.js
 * - test/built-ins/Promise/resolve/S25.4.4.5_A2.1_T1.js
 * - test/built-ins/Promise/resolve/resolve-non-obj.js
 * - test/built-ins/Promise/resolve/resolve-non-thenable.js
 * - test/built-ins/Promise/reject/S25.4.4.4_A1.1_T1.js
 * - test/built-ins/Promise/reject/S25.4.4.4_A2.1_T1.js
 * - test/built-ins/Array/from/from-array.js
 * - test/language/statements/async-function/declaration-returns-promise.js
 * - test/language/statements/async-function/evaluation-body-that-returns.js
 * - test/language/statements/async-function/evaluation-body-that-returns-after-await.js
 * - test/language/statements/async-function/evaluation-body-that-throws.js
 * - test/language/statements/async-function/evaluation-body-that-throws-after-await.js
 *
 * Copyright 2014 Cubane Canada, Inc.  All rights reserved.
 * Copyright (C) 2016 the V8 project authors. All rights reserved.
 * Copyright (C) 2019 Leo Balter. All rights reserved.
 * Copyright (C) 2018 Rick Waldron. All rights reserved.
 * Copyright 2015 Microsoft Corporation. All rights reserved.
 * Copyright 2016 Microsoft, Inc. All rights reserved.
 * Test262 portions are governed by the BSD license in LICENSE.test262.
 */
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeMode } from "../src/index.js"

const value = async (code: string) => {
  const result = await Effect.runPromise(CodeMode.execute({ code, tools: {} }))
  if (!result.ok) throw new Error(`expected success, got ${result.error.kind}: ${result.error.message}`)
  return result.value
}

describe("Test262 Promise static adaptations", () => {
  test("Promise statics are callable", async () => {
    expect(
      await value(
        `return [typeof Promise.all, typeof Promise.allSettled, typeof Promise.race, typeof Promise.resolve, typeof Promise.reject]`,
      ),
    ).toEqual(["function", "function", "function", "function", "function"])
  })

  test("invalid combinator inputs return rejected TypeError promises", async () => {
    expect(
      await value(`
        const observe = async (run) => {
          let returned = false
          try {
            const promise = run()
            returned = promise instanceof Promise
            await promise
            return [returned, "fulfilled"]
          } catch (error) {
            return [returned, error.name]
          }
        }
        return await Promise.all([
          observe(() => Promise.all(42)),
          observe(() => Promise.allSettled(42)),
          observe(() => Promise.race(42)),
        ])
      `),
    ).toEqual([
      [true, "TypeError"],
      [true, "TypeError"],
      [true, "TypeError"],
    ])
  })

  test("Promise.all returns a promise and creates a fresh empty array", async () => {
    expect(
      await value(`
        const input = []
        const promise = Promise.all(input)
        const result = await promise
        return [promise instanceof Promise, result instanceof Array, result.length, result !== input]
      `),
    ).toEqual([true, true, 0, true])
  })

  test("Promise.all preserves values and input order", async () => {
    expect(
      await value(`
        const first = { id: 1 }
        const second = { id: 2 }
        const result = await Promise.all([Promise.resolve(3), first, Promise.resolve(second)])
        return [result.length, result[0], result[1] === first, result[2] === second]
      `),
    ).toEqual([3, 3, true, true])
  })

  test("Promise.all adopts rejection from either input position", async () => {
    expect(
      await value(`
        const observe = async (promise) => {
          try { await promise; return "fulfilled" } catch (reason) { return reason }
        }
        return await Promise.all([
          observe(Promise.all([Promise.reject(1), Promise.resolve(2)])),
          observe(Promise.all([Promise.resolve(1), Promise.reject(2)])),
        ])
      `),
    ).toEqual([1, 2])
  })

  test("Promise.all treats sparse positions as undefined values", async () => {
    expect(
      await value(`
        const input = []
        input[1] = 1
        const result = await Promise.all(input)
        return [result.length, result[0] === undefined, result[1]]
      `),
    ).toEqual([2, true, 1])
  })

  test("Promise.allSettled returns a promise and a fresh array", async () => {
    expect(
      await value(`
        const input = []
        const promise = Promise.allSettled(input)
        const result = await promise
        return [promise instanceof Promise, result instanceof Array, result.length, result !== input]
      `),
    ).toEqual([true, true, 0, true])
  })

  test("Promise.allSettled preserves order and settlement shapes", async () => {
    expect(
      await value(`
        const reason = { id: 4 }
        const result = await Promise.allSettled([
          Promise.resolve(1),
          Promise.reject(2),
          3,
          Promise.reject(reason),
        ])
        return [result, result.map((item) => Object.keys(item))]
      `),
    ).toEqual([
      [
        { status: "fulfilled", value: 1 },
        { status: "rejected", reason: 2 },
        { status: "fulfilled", value: 3 },
        { status: "rejected", reason: { id: 4 } },
      ],
      [
        ["status", "value"],
        ["status", "reason"],
        ["status", "value"],
        ["status", "reason"],
      ],
    ])
  })

  test("Promise.allSettled preserves input order across settlement timing", async () => {
    expect(
      await value(`
        const slow = async () => { await Promise.resolve(); return "slow" }
        return await Promise.allSettled([slow(), Promise.resolve("fast")])
      `),
    ).toEqual([
      { status: "fulfilled", value: "slow" },
      { status: "fulfilled", value: "fast" },
    ])
  })

  test("Promise.allSettled adopts a non-thenable object", async () => {
    expect(
      await value(`
        const object = { id: 1 }
        const result = await Promise.allSettled([object])
        return [result, result[0].value === object]
      `),
    ).toEqual([[{ status: "fulfilled", value: { id: 1 } }], true])
  })

  test("Promise.allSettled treats sparse positions as undefined values", async () => {
    expect(
      await value(`
        const input = []
        input[1] = 1
        const result = await Promise.allSettled(input)
        return [result.length, result[0].status, result[0].value === undefined, result[1]]
      `),
    ).toEqual([2, "fulfilled", true, { status: "fulfilled", value: 1 }])
  })

  test("Promise.race returns a promise and settles from its first input", async () => {
    expect(
      await value(`
        const rejected = Promise.reject(2)
        const fulfilled = Promise.resolve(1)
        const promise = Promise.race([fulfilled, rejected])
        return [promise instanceof Promise, await promise]
      `),
    ).toEqual([true, 1])
  })

  test("Promise.race preserves primitive fulfillment and rejection", async () => {
    expect(
      await value(`
        const fulfilled = await Promise.race([23])
        let rejected
        try { await Promise.race([Promise.reject(7)]) } catch (reason) { rejected = reason }
        return [fulfilled, rejected]
      `),
    ).toEqual([23, 7])
  })

  test("Promise.race observes later fulfillment and rejection", async () => {
    expect(
      await value(`
        const slow = async () => { await Promise.resolve(); await Promise.resolve(); return 1 }
        const rejectSoon = async () => { await Promise.resolve(); throw 2 }
        try { await Promise.race([slow(), rejectSoon()]); return "fulfilled" } catch (reason) { return reason }
      `),
    ).toBe(2)
  })

  test("Promise.race selects fulfilled and rejected inputs by settlement order", async () => {
    expect(
      await value(`
        const delayed = async (value) => { await Promise.resolve(); return value }
        const first = await Promise.race([Promise.resolve(1), Promise.resolve(2)])
        const second = await Promise.race([Promise.resolve(1), delayed(9)])
        const third = await Promise.race([delayed(9), Promise.resolve(2)])
        let fourth
        try { await Promise.race([Promise.reject(1), Promise.resolve(2)]) } catch (reason) { fourth = reason }
        return [first, second, third, fourth]
      `),
    ).toEqual([1, 1, 2, 1])
  })

  test("Promise.race treats a sparse first position as undefined", async () => {
    expect(
      await value(`
        const input = []
        input[1] = 1
        return (await Promise.race(input)) === undefined
      `),
    ).toBe(true)
  })

  test("Promise.resolve adopts values and nested promises", async () => {
    expect(
      await value(`
        const object = { id: 1 }
        return [
          await Promise.resolve(42),
          await Promise.resolve(Promise.resolve("nested")),
          (await Promise.resolve(object)) === object,
        ]
      `),
    ).toEqual([42, "nested", true])
  })

  test("Promise.resolve preserves promise identity", async () => {
    expect(
      await value(`
        const promise = Promise.resolve(1)
        const identities = new Map([[promise, "same"]])
        return identities.get(Promise.resolve(promise))
      `),
    ).toBe("same")
  })

  test("Promise.reject preserves primitive and object reasons", async () => {
    expect(
      await value(`
        const object = { reason: true }
        const reasons = [undefined, null, false, true, 0, "", 42, object]
        const observe = async (reason) => {
          try { await Promise.reject(reason); return false } catch (caught) { return caught === reason }
        }
        return await Promise.all(reasons.map(observe))
      `),
    ).toEqual([true, true, true, true, true, true, true, true])
  })
})

describe("Test262 async function adaptations", () => {
  test("async functions return promises and adopt returned values", async () => {
    expect(
      await value(`
        const plain = async () => 42
        const afterAwait = async () => { await Promise.resolve(); return 43 }
        const first = plain()
        const second = afterAwait()
        return [first instanceof Promise, second instanceof Promise, await first, await second]
      `),
    ).toEqual([true, true, 42, 43])
  })

  test("async functions reject for throws before and after await", async () => {
    expect(
      await value(`
        const throwsBefore = async () => { throw 1 }
        const throwsAfter = async () => { await Promise.resolve(); throw 2 }
        const observe = async (promise) => {
          try { await promise; return "fulfilled" } catch (reason) { return reason }
        }
        return await Promise.all([observe(throwsBefore()), observe(throwsAfter())])
      `),
    ).toEqual([1, 2])
  })
})
