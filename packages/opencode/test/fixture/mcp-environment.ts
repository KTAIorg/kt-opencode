import readline from "node:readline"

await Bun.write(process.env.MCP_ENV_OUTPUT!, JSON.stringify(process.env))

const lines = readline.createInterface({ input: process.stdin })
lines.on("close", () => process.exit(0))
lines.on("line", (line) => {
  const request = JSON.parse(line) as { id?: number; method: string; params?: { protocolVersion?: string } }
  if (request.method !== "initialize") return
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: request.params?.protocolVersion,
        capabilities: {},
        serverInfo: { name: "environment-test", version: "1" },
      },
    })}\n`,
  )
})
