import { describe, expect, test } from "bun:test"
import { materializeMcpResources } from "../../../src/component/prompt/mcp-resource"

describe("MCP resource prompt attachments", () => {
  test("materializes text and blob content while preserving one mention", async () => {
    const calls: Array<{ server: string; uri: string; location: { directory: string } }> = []
    const files = await materializeMcpResources(
      [
        {
          uri: "docs://readme",
          name: "Readme",
          description: "Project docs",
          mention: { start: 0, end: 7, text: "@Readme" },
          mcp: { server: "docs", uri: "docs://readme", location: { directory: "/tmp/project" } },
        },
      ],
      async (input) => {
        calls.push(input)
        return {
          server: input.server,
          uri: input.uri,
          contents: [
            { type: "text", uri: input.uri, text: "hello", mimeType: "text/plain" },
            { type: "blob", uri: "docs://logo", blob: "aGVsbG8=", mimeType: "image/png" },
          ],
        }
      },
    )

    expect(calls).toEqual([{ server: "docs", uri: "docs://readme", location: { directory: "/tmp/project" } }])
    expect(files).toEqual([
      {
        uri: "data:text/plain;base64,aGVsbG8=",
        name: "Readme",
        description: "Project docs",
        mention: { start: 0, end: 7, text: "@Readme" },
      },
      {
        uri: "data:image/png;base64,aGVsbG8=",
        name: "Readme-2",
        description: "Project docs",
        mention: undefined,
      },
    ])
  })

  test("fails when a resource is unavailable", async () => {
    await expect(
      materializeMcpResources(
        [
          {
            uri: "docs://missing",
            mcp: { server: "docs", uri: "docs://missing", location: { directory: "/tmp/project" } },
          },
        ],
        async () => null,
      ),
    ).rejects.toThrow("Unable to read MCP resource: docs:docs://missing")
  })
})
