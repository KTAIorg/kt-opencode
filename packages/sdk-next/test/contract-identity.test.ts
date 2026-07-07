import { expect, test } from "bun:test"
import { Agent } from "@opencode-ai/schema/agent"
import { Model } from "@opencode-ai/schema/model"
import { Mcp } from "@opencode-ai/schema/mcp"
import { Session } from "@opencode-ai/schema/session"

const SDK = await import("../src/index")

test("re-exports canonical contracts directly from Schema", () => {
  expect(SDK.Agent).toBe(Agent)
  expect(SDK.Model).toBe(Model)
  expect(SDK.Mcp).toBe(Mcp)
  expect(SDK.Session).toBe(Session)
  expect(Object.keys(SDK).sort()).toEqual([
    "AbsolutePath",
    "Agent",
    "ClientError",
    "Command",
    "Credential",
    "FileSystem",
    "Integration",
    "Location",
    "Mcp",
    "Model",
    "OpenCode",
    "Permission",
    "PermissionSaved",
    "Project",
    "ProjectCopy",
    "Prompt",
    "PromptInput",
    "Provider",
    "Pty",
    "Question",
    "Reference",
    "RelativePath",
    "Session",
    "SessionInput",
    "SessionMessage",
    "Skill",
    "Tool",
  ])
})
