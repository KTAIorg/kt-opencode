import { describe, expect, test } from "bun:test"
import {
  homeSessionActiveHeaderIndex,
  homeSessionListRows,
  homeSessionListRowSize,
  shouldLoadMoreHomeSessions,
} from "./home-session-list"

describe("homeSessionListRows", () => {
  test("flattens groups with stable headers and spacing metadata", () => {
    const rows = homeSessionListRows(
      [
        { id: "today", title: "Today", sessions: ["a", "b"] },
        { id: "older", title: "Older", sessions: ["c"] },
      ],
      (session) => `session:${session}`,
    )

    expect(rows.map((row) => row.key)).toEqual(["header:today", "session:a", "session:b", "header:older", "session:c"])
    expect(rows.map(homeSessionListRowSize)).toEqual([44, 41, 64, 44, 40])
    expect(rows[2]).toMatchObject({ type: "session", last: true, finalGroup: false })
    expect(rows[4]).toMatchObject({ type: "session", last: true, finalGroup: true })
    expect(homeSessionActiveHeaderIndex(rows, 2)).toBe(0)
    expect(homeSessionActiveHeaderIndex(rows, 4)).toBe(3)
  })
})

describe("shouldLoadMoreHomeSessions", () => {
  test("loads within the bottom threshold", () => {
    expect(shouldLoadMoreHomeSessions({ scrollTop: 601, scrollHeight: 1_400, clientHeight: 400, threshold: 400 })).toBe(
      true,
    )
    expect(shouldLoadMoreHomeSessions({ scrollTop: 600, scrollHeight: 1_400, clientHeight: 400, threshold: 400 })).toBe(
      false,
    )
  })

  test("fills a viewport taller than its content", () => {
    expect(shouldLoadMoreHomeSessions({ scrollTop: 0, scrollHeight: 300, clientHeight: 600, threshold: 400 })).toBe(true)
  })
})
