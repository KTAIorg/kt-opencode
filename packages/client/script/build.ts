import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitPromise, write } from "@opencode-ai/httpapi-codegen"
import { Api } from "@opencode-ai/server/api"
import { Effect } from "effect"
import { fileURLToPath } from "url"
import { endpointNames, groupNames } from "../src/contract"

const contract = compile(Api, { groupNames, endpointNames })

await Effect.runPromise(
  Effect.all(
    [
      write(emitPromise(contract), fileURLToPath(new URL("../src/generated", import.meta.url))),
      write(
        emitEffectImported(contract, { module: "../contract", api: "Api" }),
        fileURLToPath(new URL("../src/generated-effect", import.meta.url)),
      ),
    ],
    { concurrency: 2, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)
