export function parseTelegramAuthorization(input: { url: string; instructions: string }) {
  const code = /Code:\s*(\S+)/.exec(input.instructions)?.[1]
  const bot = /t\.me\/([^/?#]+)/.exec(input.url)?.[1]
  return {
    url: input.url,
    code,
    bot,
  }
}
