import { describe, expect, test } from "bun:test"
import { ModelProbe } from "./model-probe"
import type { FetchLike } from "./model-probe"
import { Model } from "./model"
import { Provider } from "./provider"
import { Credential } from "./credential"
import { Integration } from "./integration"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const provider = (activation: Provider.Info["activation"] = "auto") =>
  ({ activation }) satisfies Pick<Provider.Info, "activation">

const model = (input: {
  package?: string
  settings?: Record<string, unknown>
  headers?: Record<string, string>
  body?: Record<string, unknown>
  modelID?: Model.ID
}) => ({
  ...Model.Info.default(Provider.ID.make("test"), Model.ID.make("m1")),
  ...input,
})

const keyCredential = (key: string) => Credential.Key.make({ type: "key", key })
const oauthCredential = (access: string) =>
  Credential.OAuth.make({
    type: "oauth",
    methodID: Integration.MethodID.make("m"),
    refresh: "r",
    access,
    expires: 0,
  })

describe("ModelProbe.target", () => {
  test("openai-compatible provider builds chat/completions target with bearer credential", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://relay.example.com/v1/" },
      }),
      provider(),
      keyCredential("sk-relay"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.url).toBe("https://relay.example.com/v1/chat/completions")
    expect(result.target.headers.authorization).toBe("Bearer sk-relay")
    expect(result.target.body.model).toBe("m1")
    expect(result.target.body.max_tokens).toBe(1)
  })

  test("uses modelID (api id) over catalog id when present", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://relay.example.com/v1" },
        modelID: Model.ID.make("real-api-id"),
      }),
      provider(),
      keyCredential("sk"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.body.model).toBe("real-api-id")
  })

  test("anthropic provider builds messages target with x-api-key and version header", () => {
    const result = ModelProbe.target(
      model({ package: "aisdk:@ai-sdk/anthropic" }),
      provider(),
      keyCredential("sk-ant"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.url).toBe("https://api.anthropic.com/v1/messages")
    expect(result.target.headers["x-api-key"]).toBe("sk-ant")
    expect(result.target.headers["anthropic-version"]).toBe("2023-06-01")
    expect(result.target.headers.authorization).toBeUndefined()
    expect(result.target.body.max_tokens).toBe(1)
  })

  test("anthropic oauth credential sends bearer instead of x-api-key", () => {
    const result = ModelProbe.target(
      model({ package: "aisdk:@ai-sdk/anthropic" }),
      provider(),
      oauthCredential("oauth-token"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.headers.authorization).toBe("Bearer oauth-token")
    expect(result.target.headers["x-api-key"]).toBeUndefined()
  })

  test("anthropic-compatible relay honors configured baseURL", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/anthropic",
        settings: { baseURL: "https://api.minimax.io/anthropic/v1" },
      }),
      provider(),
      keyCredential("sk-mm"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.url).toBe("https://api.minimax.io/anthropic/v1/messages")
  })

  test("google provider builds generateContent target with x-goog-api-key", () => {
    const result = ModelProbe.target(
      model({ package: "aisdk:@ai-sdk/google" }),
      provider(),
      keyCredential("goog-key"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent")
    expect(result.target.headers["x-goog-api-key"]).toBe("goog-key")
  })

  test("openai provider builds responses target", () => {
    const result = ModelProbe.target(
      model({ package: "aisdk:@ai-sdk/openai" }),
      provider(),
      keyCredential("sk-openai"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.url).toBe("https://api.openai.com/v1/responses")
    expect(result.target.body.max_output_tokens).toBe(16)
    expect(result.target.body.stream).toBe(false)
  })

  test("unsupported package reports unsupported-protocol", () => {
    const result = ModelProbe.target(
      model({ package: "aisdk:@ai-sdk/amazon-bedrock" }),
      provider(),
      keyCredential("sk"),
    )
    expect(result).toEqual({ ok: false, reason: "unsupported-protocol" })
  })

  test("missing package reports unsupported-protocol", () => {
    const result = ModelProbe.target(model({}), provider(), keyCredential("sk"))
    expect(result).toEqual({ ok: false, reason: "unsupported-protocol" })
  })

  test("openai-compatible without baseURL reports missing-base-url", () => {
    const result = ModelProbe.target(
      model({ package: "aisdk:@ai-sdk/openai-compatible" }),
      provider(),
      keyCredential("sk"),
    )
    expect(result).toEqual({ ok: false, reason: "missing-base-url" })
  })

  test("unresolved env placeholder in baseURL reports unresolved-variables", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://${PROBE_TEST_MISSING_HOST}/v1" },
      }),
      provider(),
      keyCredential("sk"),
    )
    expect(result).toEqual({ ok: false, reason: "unresolved-variables" })
  })

  test("env placeholder in baseURL resolves from process.env", () => {
    process.env.PROBE_TEST_BASE_HOST = "resolved.example.com"
    try {
      const result = ModelProbe.target(
        model({
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: { baseURL: "https://${PROBE_TEST_BASE_HOST}/v1" },
        }),
        provider(),
        keyCredential("sk"),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.target.url).toBe("https://resolved.example.com/v1/chat/completions")
    } finally {
      delete process.env.PROBE_TEST_BASE_HOST
    }
  })

  test("auto provider without credential reports missing-credential", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://relay.example.com/v1" },
      }),
      provider("auto"),
    )
    expect(result).toEqual({ ok: false, reason: "missing-credential" })
  })

  test("enabled provider without credential probes unauthenticated", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "http://127.0.0.1:11434/v1", apiKey: "" },
      }),
      provider("enabled"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.headers.authorization).toBeUndefined()
  })

  test("settings.apiKey is used when no credential exists", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://relay.example.com/v1", apiKey: "inline-key" },
      }),
      provider(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.headers.authorization).toBe("Bearer inline-key")
  })

  test("provider headers merge into the request and body overlay applies", () => {
    const result = ModelProbe.target(
      model({
        package: "aisdk:@ai-sdk/openai-compatible",
        settings: { baseURL: "https://zenmux.ai/api/v1" },
        headers: { "HTTP-Referer": "https://opencode.ai/" },
        body: { reasoningEffort: "high" },
      }),
      provider(),
      keyCredential("sk"),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.target.headers["HTTP-Referer"]).toBe("https://opencode.ai/")
    expect(result.target.body.reasoningEffort).toBe("high")
    expect(result.target.body.model).toBe("m1")
  })

  test("maxTokensField compatibility switches the token field", () => {
    const target = ModelProbe.target(
      {
        ...model({
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: { baseURL: "https://relay.example.com/v1" },
        }),
        compatibility: { maxTokensField: "max_completion_tokens" as const },
      },
      provider(),
      keyCredential("sk"),
    )
    expect(target.ok).toBe(true)
    if (!target.ok) return
    expect(target.target.body.max_completion_tokens).toBe(1)
    expect(target.target.body.max_tokens).toBeUndefined()
  })
})

describe("ModelProbe.probe", () => {
  test("returns per-model ok/fail from upstream responses", async () => {
    const calls: string[] = []
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input))
      const body = JSON.parse(String(init?.body ?? "{}")) as { model: string }
      if (body.model === "broken") return jsonResponse({ error: { message: "no channel for model" } }, 503)
      return jsonResponse({ choices: [{ message: { role: "assistant", content: "hi" } }] })
    }) as FetchLike

    const results = await ModelProbe.probe(
      [
        {
          modelID: "fine",
          target: {
            url: "https://relay.example.com/v1/chat/completions",
            headers: { authorization: "Bearer sk" },
            body: { model: "fine", max_tokens: 1 },
          },
        },
        {
          modelID: "broken",
          target: {
            url: "https://relay.example.com/v1/chat/completions",
            headers: { authorization: "Bearer sk" },
            body: { model: "broken", max_tokens: 1 },
          },
        },
      ],
      { fetchImpl: fakeFetch },
    )
    const byId = new Map(results.map((r) => [r.modelID, r]))
    expect(byId.get("fine")?.ok).toBe(true)
    expect(byId.get("broken")?.ok).toBe(false)
    expect(byId.get("broken")?.status).toBe(503)
    expect(byId.get("broken")?.error).toContain("no channel")
    expect(calls.length).toBe(2)
  })

  test("reports network failure as not ok without throwing", async () => {
    const failing = (async () => {
      throw new Error("connection refused")
    }) as FetchLike
    const results = await ModelProbe.probe(
      [{ modelID: "x", target: { url: "https://x/v1/chat/completions", headers: {}, body: {} } }],
      { fetchImpl: failing },
    )
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.error).toContain("connection refused")
  })
})
