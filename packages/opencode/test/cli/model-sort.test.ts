import { describe, expect, test } from "bun:test"
import { sortModelOptions } from "@/cli/util/model-sort"

function model(input: { modelID: string; title: string; releaseDate: string; free?: boolean }) {
  return {
    modelID: input.modelID,
    title: input.title,
    releaseDate: input.releaseDate,
    free: input.free ?? true,
  }
}

describe("sortModelOptions", () => {
  test("pins Big Pickle before free models sorted by release date", () => {
    expect(
      [
        model({ modelID: "older-free", title: "Older Free", releaseDate: "2026-01-01" }),
        model({ modelID: "paid", title: "Paid", releaseDate: "2026-05-01", free: false }),
        model({ modelID: "newer-free", title: "Newer Free", releaseDate: "2026-05-01" }),
        model({ modelID: "big-pickle", title: "Big Pickle", releaseDate: "2025-10-17" }),
      ].sort(sortModelOptions).map((item) => item.modelID),
    ).toEqual(["big-pickle", "newer-free", "older-free", "paid"])
  })
})
