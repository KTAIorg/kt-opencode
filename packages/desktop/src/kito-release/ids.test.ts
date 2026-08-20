import { expect, test } from "bun:test"
import { artifactId, channelOrDefault, idempotencyKey, normalizeVersion, releaseId } from "./ids"

test("strips a leading v from versions", () => {
  expect(normalizeVersion("v1.18.15")).toBe("1.18.15")
})

test("defaults the Kito channel to stable", () => {
  expect(channelOrDefault()).toBe("stable")
  expect(channelOrDefault("Beta")).toBe("beta")
})

test("builds Release Service ids for the kito app", () => {
  expect(releaseId("kito", "v1.18.15")).toBe("rel_kito_1_18_15_stable")
  expect(artifactId("rel_kito_1_18_15_stable", "win32", "x64", "installer")).toBe(
    "art_rel_kito_1_18_15_stable_win32_x64_installer",
  )
  expect(idempotencyKey("kito", "1.18.15", "publish-rollout-0")).toBe("kito-1.18.15-publish-rollout-0")
})
