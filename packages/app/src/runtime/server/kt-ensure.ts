export async function requestKtaiEnsure(input: {
  url: string
  username?: string
  password?: string
  fetchImpl?: typeof fetch
}) {
  const response = await (input.fetchImpl ?? fetch)(`${input.url.replace(/\/+$/, "")}/ktai/ensure`, {
    method: "POST",
    headers:
      input.username && input.password
        ? { authorization: `Basic ${btoa(`${input.username}:${input.password}`)}` }
        : undefined,
  })
  if (!response.ok) return { ok: false as const }
  const payload = (await response.json().catch(() => undefined)) as { ok?: boolean; updated?: boolean } | undefined
  return { ok: true as const, updated: payload?.updated === true }
}
