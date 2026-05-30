import { describe, expect, test } from "bun:test"
import { sortModels } from "./model-sort"

function model(input: { id: string; name: string; release_date: string; cost?: number }) {
  return {
    id: input.id,
    name: input.name,
    release_date: input.release_date,
    provider: { id: "opencode" },
    cost: { input: input.cost ?? 0 },
  }
}

describe("sortModels", () => {
  test("pins Big Pickle before free models sorted by release date", () => {
    expect(
      [
        model({ id: "older-free", name: "Older Free", release_date: "2026-01-01" }),
        model({ id: "paid", name: "Paid", release_date: "2026-05-01", cost: 1 }),
        model({ id: "newer-free", name: "Newer Free", release_date: "2026-05-01" }),
        model({ id: "big-pickle", name: "Big Pickle", release_date: "2025-10-17" }),
      ].sort(sortModels).map((item) => item.id),
    ).toEqual(["big-pickle", "newer-free", "older-free", "paid"])
  })
})
