import type { SessionMessageUser } from "@opencode-ai/client"
import type { PromptInfo } from "../prompt/history"

export function revertedPrompt(message: SessionMessageUser): PromptInfo {
  return {
    text: message.text,
    files: message.files?.map((file) => ({
      uri: file.source.type === "uri" ? file.source.uri : `data:${file.mime};base64,${file.data}`,
      name: file.name,
      description: file.description,
      mention: file.mention ? { ...file.mention } : undefined,
    })),
    agents: message.agents?.map((agent) => ({
      name: agent.name,
      mention: agent.mention ? { ...agent.mention } : undefined,
    })),
    pasted: [],
  }
}
