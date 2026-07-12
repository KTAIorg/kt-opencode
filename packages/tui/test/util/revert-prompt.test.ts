import { describe, expect, test } from "bun:test"
import type { SessionMessageUser } from "@opencode-ai/client"
import { revertedPrompt } from "../../src/util/revert-prompt"

describe("reverted prompt", () => {
  test("restores message text and references", () => {
    const message = {
      id: "message-1",
      type: "user",
      text: "Fix @test.ts with @review",
      time: { created: 1 },
      files: [
        {
          mime: "text/typescript",
          name: "test.ts",
          description: "test file",
          data: "",
          source: { type: "uri", uri: "file:///repo/test.ts" },
          mention: { start: 4, end: 12, text: "@test.ts" },
        },
      ],
      agents: [{ name: "review", mention: { start: 18, end: 25, text: "@review" } }],
    } satisfies SessionMessageUser

    expect(revertedPrompt(message)).toEqual({
      text: "Fix @test.ts with @review",
      files: [
        {
          uri: "file:///repo/test.ts",
          name: "test.ts",
          description: "test file",
          mention: { start: 4, end: 12, text: "@test.ts" },
        },
      ],
      agents: [{ name: "review", mention: { start: 18, end: 25, text: "@review" } }],
      pasted: [],
    })
  })
})
