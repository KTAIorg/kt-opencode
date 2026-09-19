import { expect, test } from "bun:test"
import { redactArgs } from "../src/util/process"

test("masks credential-bearing flag values in argv", () => {
  expect(
    redactArgs([
      "serve",
      "--password",
      "hunter2",
      "--token=abc123",
      "-H",
      "Authorization: Bearer sk-secret",
      "--header=X-Thing: 1",
      "positional",
    ]),
  ).toEqual([
    "serve",
    "--password",
    "<redacted>",
    "--token=<redacted>",
    "-H",
    "<redacted>",
    "--header=<redacted>",
    "positional",
  ])
})

test("leaves non-sensitive args untouched", () => {
  expect(redactArgs(["serve", "--port", "4096", "--verbose"])).toEqual([
    "serve",
    "--port",
    "4096",
    "--verbose",
  ])
})
