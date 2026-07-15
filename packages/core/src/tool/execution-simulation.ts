export * as ToolExecutionSimulation from "./execution-simulation"

import type { ToolCall } from "@opencode-ai/llm"
import { Effect } from "effect"
import { Tool } from "./tool"

export interface Invocation {
  readonly tool: string
  readonly input: unknown
  readonly context: Tool.Context
}

export type Handler = (
  invocation: Invocation,
  passthrough: Effect.Effect<Tool.SettledOutput, Tool.Failure>,
) => Effect.Effect<Tool.SettledOutput, Tool.Failure>

const handlers = new Map<string, ReadonlyArray<{ readonly token: object; readonly handler: Handler }>>()

export const intercept = (tool: string, handler: Handler) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const token = {}
      handlers.set(tool, [...(handlers.get(tool) ?? []), { token, handler }])
      return token
    }),
    (token) =>
      Effect.sync(() => {
        const remaining = handlers.get(tool)?.filter((entry) => entry.token !== token) ?? []
        if (remaining.length > 0) handlers.set(tool, remaining)
        else handlers.delete(tool)
      }),
  ).pipe(Effect.asVoid)

export const settle = (tool: Tool.AnyTool, call: ToolCall, context: Tool.Context) => {
  const handler = handlers.get(call.name)?.at(-1)?.handler
  return Tool.settle(
    tool,
    call,
    context,
    handler ? (input, passthrough) => handler({ tool: call.name, input, context }, passthrough) : undefined,
  )
}
