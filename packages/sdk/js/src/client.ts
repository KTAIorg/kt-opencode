export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
import { wrapClientError } from "./error-interceptor.js"
export { OpencodeClient }

type Fetch = (request: Request) => ReturnType<typeof fetch>
export type OpencodeClientConfig = Omit<Config, "fetch"> & { fetch?: Fetch; directory?: string }

function pick(value: string | null, fallback?: string) {
  if (!value) return
  if (!fallback) return value
  if (value === fallback) return fallback
  if (value === encodeURIComponent(fallback)) return fallback
  return value
}

function rewrite(request: Request, directory?: string) {
  if (request.method !== "GET" && request.method !== "HEAD") return request

  const value = pick(request.headers.get("x-opencode-directory"), directory)
  if (!value) return request

  const url = new URL(request.url)
  if (!url.searchParams.has("directory")) {
    url.searchParams.set("directory", value)
  }

  const next = new Request(url, request)
  next.headers.delete("x-opencode-directory")
  return next
}

function toFetch(input: Fetch | undefined): typeof fetch | undefined {
  if (!input) return
  return Object.assign(
    async (value: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      input(value instanceof Request && init === undefined ? value : new Request(value, init)),
    fetch,
  )
}

export function createOpencodeClient(config?: OpencodeClientConfig) {
  if (!config?.fetch) {
    const customFetch: Fetch = (req) => {
      // @ts-ignore
      req.timeout = false
      return fetch(req)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  if (config?.directory) {
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encodeURIComponent(config.directory),
    }
  }

  const client = createClient({ ...config, fetch: toFetch(config?.fetch) })
  client.interceptors.request.use((request) => rewrite(request, config?.directory))
  client.interceptors.error.use(wrapClientError)
  return new OpencodeClient({ client })
}
