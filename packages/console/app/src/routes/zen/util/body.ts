import { BodyLimitError } from "./error"

export const MAX_BODY_BYTES = 10 * 1024 * 1024

/**
 * Parses a JSON request body while enforcing a maximum size so callers cannot
 * send arbitrarily large context payloads. Rejects on the declared
 * content-length before reading anything, but does not trust it: chunked
 * requests can omit or understate the header, so bytes are also counted while
 * consuming the stream. Chunks are decoded as they arrive so the body is never
 * buffered twice.
 */
export async function readJsonBody(request: Request) {
  const declared = Number(request.headers.get("content-length"))
  if (declared > MAX_BODY_BYTES) throw tooLarge()

  const reader = request.body?.getReader()
  if (!reader) return request.json()

  const decoder = new TextDecoder()
  let received = 0
  let text = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) return JSON.parse(text + decoder.decode())
    received += value.length
    if (received > MAX_BODY_BYTES) {
      await reader.cancel()
      throw tooLarge()
    }
    text += decoder.decode(value, { stream: true })
  }
}

function tooLarge() {
  return new BodyLimitError(`Request body exceeds ${MAX_BODY_BYTES} bytes`)
}
