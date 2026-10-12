import { describe, expect, test } from "bun:test"
import { collapseProviderMarks, resolveVisibility, type VisibilityMark } from "./model-visibility"

describe("resolveVisibility", () => {
  test("explicit user marks win over provider preference and defaults", () => {
    expect(resolveVisibility({ userMark: "hide", providerPref: "show", latest: true })).toBe(false)
    expect(resolveVisibility({ userMark: "show", providerPref: "hide" })).toBe(true)
  })

  test("provider preference wins over default rules", () => {
    expect(resolveVisibility({ providerPref: "hide", latest: true, zenFree: true })).toBe(false)
    expect(resolveVisibility({ providerPref: "show" })).toBe(true)
  })

  test("zen free models are always visible regardless of recency", () => {
    expect(resolveVisibility({ zenFree: true, latest: false, releaseValid: true })).toBe(true)
  })

  test("default rules: latest within window visible, stale or dated hidden, undated visible", () => {
    expect(resolveVisibility({ latest: true })).toBe(true)
    expect(resolveVisibility({ latest: false, releaseValid: true })).toBe(false)
    expect(resolveVisibility({ releaseValid: false })).toBe(true)
    expect(resolveVisibility({})).toBe(true)
  })
})

describe("collapseProviderMarks", () => {
  const models = (providerID: string, ids: string[]) => ids.map((modelID) => ({ providerID, modelID }))

  test("collapses an all-hide provider into a provider-level preference and clears marks", () => {
    const result = collapseProviderMarks(models("ktai", ["a", "b"]), [
      { providerID: "ktai", modelID: "a", visibility: "hide" },
      { providerID: "ktai", modelID: "b", visibility: "hide" },
    ])
    expect(result.provider).toEqual({ ktai: "hide" })
    expect(result.keep).toEqual([])
  })

  test("collapses an all-show provider", () => {
    const result = collapseProviderMarks(models("opencode", ["a", "b", "c"]), [
      { providerID: "opencode", modelID: "a", visibility: "show" },
      { providerID: "opencode", modelID: "b", visibility: "show" },
      { providerID: "opencode", modelID: "c", visibility: "show" },
    ])
    expect(result.provider).toEqual({ opencode: "show" })
    expect(result.keep).toEqual([])
  })

  test("keeps mixed marks and partially marked providers untouched", () => {
    const user: VisibilityMark[] = [
      { providerID: "ktai", modelID: "a", visibility: "hide" },
      { providerID: "ktai", modelID: "b", visibility: "show" },
      { providerID: "openai", modelID: "x", visibility: "hide" },
    ]
    const result = collapseProviderMarks([...models("ktai", ["a", "b"]), ...models("openai", ["x", "y"])], user)
    expect(result.provider).toEqual({})
    expect(result.keep).toEqual(user)
  })

  test("marks for models missing from the catalog do not force a collapse", () => {
    const result = collapseProviderMarks(models("ktai", ["a"]), [
      { providerID: "ktai", modelID: "a", visibility: "hide" },
      { providerID: "ktai", modelID: "removed-model", visibility: "hide" },
    ])
    // a is marked but removed-model is not in the catalog: only catalog models participate,
    // so ktai fully marked → collapse still happens for the catalog subset.
    expect(result.provider).toEqual({ ktai: "hide" })
  })
})
