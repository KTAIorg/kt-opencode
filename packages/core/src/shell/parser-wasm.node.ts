import { createRequire } from "node:module"
import { kitoDataEnv } from "@opencode-ai/util/kito-env"

const require = createRequire(import.meta.url)

export const shellParserWasm = {
  runtime: kitoDataEnv("TREE_SITTER_WASM_PATH") ?? require.resolve("web-tree-sitter/tree-sitter.wasm"),
  bash: kitoDataEnv("TREE_SITTER_BASH_WASM_PATH") ?? require.resolve("tree-sitter-bash/tree-sitter-bash.wasm"),
  powershell:
    kitoDataEnv("TREE_SITTER_POWERSHELL_WASM_PATH") ??
    require.resolve("tree-sitter-powershell/tree-sitter-powershell.wasm"),
}
