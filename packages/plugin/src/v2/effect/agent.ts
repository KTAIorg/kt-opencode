import type { Agent } from "@opencode-ai/schema/agent"
import type { Types } from "effect"
import type { Hooks } from "./registration.js"

export interface AgentDraft {
  list(): readonly Types.DeepMutable<Agent.Info>[]
  get(id: string): Types.DeepMutable<Agent.Info> | undefined
  default(id: string | undefined): void
  update(id: string, update: (agent: Types.DeepMutable<Agent.Info>) => void): void
  remove(id: string): void
}

export type AgentHooks = Hooks<{
  transform: AgentDraft
}>
