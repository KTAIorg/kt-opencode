import path from "node:path"

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : undefined

// Flags whose values may carry credentials or user data; they are masked before
// argv is written to log or trace files, which outlive the process and are
// readable by anything with data-dir access.
const SENSITIVE_ARG_FLAGS = new Set([
  "-H",
  "--header",
  "--prompt",
  "--token",
  "--password",
  "--api-key",
  "--auth-token",
  "--data",
  "--param",
])

export function redactArgs(args: string[]) {
  let redactNext = false
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false
      return "<redacted>"
    }
    const eq = arg.indexOf("=")
    const name = eq === -1 ? arg : arg.slice(0, eq)
    if (!SENSITIVE_ARG_FLAGS.has(name)) return arg
    if (eq !== -1) return `${name}=<redacted>`
    redactNext = true
    return arg
  })
}

export function selfCommand() {
  const runtime = path.basename(process.execPath, path.extname(process.execPath)).toLowerCase()
  if (runtime !== "bun" && runtime !== "node" && runtime !== "nodejs") return [process.execPath]
  if (!entrypoint) throw new Error("Failed to resolve CLI entrypoint")
  if (runtime === "node" || runtime === "nodejs") return [process.execPath, ...nodeFlags(), entrypoint]
  return [process.execPath, entrypoint]
}

function nodeFlags() {
  return process.execArgv.flatMap((arg, index, args) => {
    if (index > 0 && args[index - 1] === "--conditions") return []
    if (arg === "--conditions") return args[index + 1] ? [arg, args[index + 1]] : []
    if (arg.startsWith("--conditions=")) return [arg]
    if (
      arg === "--experimental-ffi" ||
      arg === "--use-system-ca" ||
      arg === "--enable-source-maps" ||
      arg === "--no-addons"
    )
      return [arg]
    if (arg === "--no-warnings" || arg.startsWith("--disable-warning=")) return [arg]
    return []
  })
}
