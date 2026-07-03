import { describe, expect, test } from "bun:test"
import { MAX_BODY_BYTES, readJsonBody } from "../src/routes/zen/util/body"
import { BodyLimitError } from "../src/routes/zen/util/error"

function post(body: BodyInit, headers?: Record<string, string>) {
  return new Request("https://opencode.ai/zen/v1/chat/completions", { method: "POST", body, headers })
}

function streamOf(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk)
      c.close()
    },
  })
}

describe("readJsonBody", () => {
  test("parses a body within the limit", async () => {
    const body = await readJsonBody(post(JSON.stringify({ model: "test", messages: [] })))
    expect(body).toEqual({ model: "test", messages: [] })
  })

  test("parses a body of exactly the limit", async () => {
    const wrapper = '{"padding":""}'
    const json = `{"padding":"${"x".repeat(MAX_BODY_BYTES - wrapper.length)}"}`
    const body = await readJsonBody(post(json))
    expect(body.padding.length).toBe(MAX_BODY_BYTES - wrapper.length)
  })

  test("parses a streamed body split mid multi-byte character", async () => {
    const bytes = new TextEncoder().encode('{"name":"café"}')
    // 13 splits the two-byte "é", exercising incremental decoding
    const body = await readJsonBody(post(streamOf(bytes.slice(0, 13), bytes.slice(13))))
    expect(body).toEqual({ name: "café" })
  })

  test("rejects when the declared content-length exceeds the limit", async () => {
    const request = post("{}", { "content-length": String(MAX_BODY_BYTES + 1) })
    await expect(readJsonBody(request)).rejects.toThrow(BodyLimitError)
  })

  test("rejects an oversized stream without a content-length header", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1024 * 1024))
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent > MAX_BODY_BYTES) return c.close()
        sent += chunk.length
        c.enqueue(chunk)
      },
    })
    await expect(readJsonBody(post(stream))).rejects.toThrow(BodyLimitError)
  })
})
