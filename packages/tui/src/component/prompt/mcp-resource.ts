import { Buffer } from "node:buffer"
import type { ServerMcpReadResourceOutput, SessionPromptInput } from "@opencode-ai/client/promise"
import type { LocationRef } from "@opencode-ai/sdk/v2"
import type { PromptFile } from "../../prompt/history"

type Files = NonNullable<SessionPromptInput["prompt"]["files"]>
type ResourceContent = NonNullable<ServerMcpReadResourceOutput["data"]>

export async function materializeMcpResources(
  files: PromptFile[] | undefined,
  read: (input: { server: string; uri: string; location: LocationRef }) => Promise<ResourceContent | null>,
): Promise<Files> {
  return (
    await Promise.all(
      (files ?? []).map(async (file): Promise<Files> => {
        if (!file.mcp) return [{ uri: file.uri, name: file.name, description: file.description, mention: file.mention }]
        const resource = await read(file.mcp)
        if (!resource) throw new Error(`Unable to read MCP resource: ${file.mcp.server}:${file.mcp.uri}`)
        if (resource.contents.length === 0)
          throw new Error(`MCP resource returned no content: ${file.mcp.server}:${file.mcp.uri}`)
        return resource.contents.map((content, index) => ({
          uri: `data:${content.mimeType ?? (content.type === "text" ? "text/plain" : "application/octet-stream")};base64,${
            content.type === "text" ? Buffer.from(content.text).toString("base64") : content.blob
          }`,
          name: index === 0 ? file.name : `${file.name ?? "resource"}-${index + 1}`,
          description: file.description,
          mention: index === 0 ? file.mention : undefined,
        }))
      }),
    )
  ).flat()
}
