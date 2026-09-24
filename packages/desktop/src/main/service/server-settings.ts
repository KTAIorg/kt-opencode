import { DEFAULT_SERVER_URL_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function isValidServerUrl(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === "http:" || url.protocol === "https:"
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    // Persisted renderer input; only real http(s) server URLs may be stored.
    if (!isValidServerUrl(url)) throw new Error(`Invalid server URL`)
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}
