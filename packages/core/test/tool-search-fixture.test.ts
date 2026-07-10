import { expect } from "bun:test"
import { AgentV2 } from "@opencode-ai/core/agent"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { SearchFixtureTool } from "@opencode-ai/core/tool/search-fixture"
import { Effect, Layer } from "effect"
import { testEffect } from "./lib/effect"
import { registerToolPlugin } from "./lib/tool"

const outputStore = Layer.mock(ToolOutputStore.Service, {
  bound: (input) => Effect.succeed({ output: input.output, outputPaths: [] }),
})
const it = testEffect(AppNodeBuilder.build(ToolRegistry.node, [[ToolOutputStore.node, outputStore]]))

it.effect("registers 200 searchable no-op tools across namespaces", () =>
  Effect.gen(function* () {
    expect(SearchFixtureTool.catalog).toHaveLength(20)
    expect(SearchFixtureTool.catalog.flatMap((group) => group.operations)).toHaveLength(200)

    yield* registerToolPlugin(SearchFixtureTool.Plugin)
    const registry = yield* ToolRegistry.Service
    const tools = yield* registry.materialize()
    expect(tools.definitions.map((tool) => tool.name)).toEqual(["execute"])

    const invoke = (code: string, id: string) =>
      tools.settle({
        sessionID: SessionV2.ID.make("ses_search_fixture"),
        agent: AgentV2.ID.make("build"),
        assistantMessageID: SessionMessage.ID.make("msg_search_fixture"),
        call: { type: "tool-call", id, name: "execute", input: { code } },
      })

    const searched = yield* invoke(
      'return await tools.$codemode.search({ query: "refund payment", namespace: "stripe" })',
      "call_search_fixture",
    )
    expect(searched.result.type).toBe("text")
    if (searched.result.type !== "text") return
    expect(JSON.parse(String(searched.result.value)).items[0]).toMatchObject({
      path: "tools.stripe.refund_payment",
      description: "Refund payment in Stripe.",
    })

    const completed = yield* invoke("return await tools.stripe.refund_payment({})", "call_run_fixture")
    expect(completed.result).toEqual({ type: "text", value: "Completed refund payment." })
  }),
)
