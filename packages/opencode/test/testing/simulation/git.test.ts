import { describe, expect, test } from "bun:test"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { ManagedRuntime, Layer } from "effect"
import { InMemoryFs } from "just-bash"
import { Git } from "../../../src/git"
import { SimulationFileSystem } from "../../../src/testing/simulation/filesystem"
import { SimulationGit } from "../../../src/testing/simulation/git"

const patch = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-export const name = "old"
+export const name = "new"
 export const stable = true
diff --git a/docs/readme.md b/docs/readme.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/docs/readme.md
@@ -0,0 +1,2 @@
+# Demo
+Notes
`

async function withFakeGit<T>(body: (rt: ManagedRuntime.ManagedRuntime<Git.Service | AppFileSystem.Service, never>) => Promise<T>) {
  const fs = new InMemoryFs()
  const fsLayer = SimulationFileSystem.layer({ root: "/opencode", fs })
  const rt = ManagedRuntime.make(
    Layer.mergeAll(fsLayer, SimulationGit.layer.pipe(Layer.provide(fsLayer))),
  )
  try {
    return await body(rt)
  } finally {
    await rt.dispose()
  }
}

describe("SimulationGit", () => {
  test("loads diff data from _patches patch files", async () => {
    await withFakeGit(async (rt) => {
      await rt.runPromise(
        AppFileSystem.Service.use((fs) => fs.writeWithDirs("/opencode/_patches/changes.patch", patch)),
      )

      const [status, diff, stats, all] = await Promise.all([
        rt.runPromise(Git.Service.use((git) => git.status("/opencode"))),
        rt.runPromise(Git.Service.use((git) => git.diff("/opencode", "HEAD"))),
        rt.runPromise(Git.Service.use((git) => git.stats("/opencode", "HEAD"))),
        rt.runPromise(Git.Service.use((git) => git.patchAll("/opencode", "HEAD"))),
      ])

      expect(status).toEqual([
        { file: "src/app.ts", code: "M", status: "modified" },
        { file: "docs/readme.md", code: "A", status: "added" },
      ])
      expect(diff).toEqual(status)
      expect(stats).toEqual([
        { file: "src/app.ts", additions: 1, deletions: 1 },
        { file: "docs/readme.md", additions: 2, deletions: 0 },
      ])
      expect(all).toEqual({ text: patch, truncated: false })
    })
  })

  test("filters individual patches and keeps inert methods successful", async () => {
    await withFakeGit(async (rt) => {
      await rt.runPromise(
        AppFileSystem.Service.use((fs) => fs.writeWithDirs("/opencode/_patches/changes.patch", patch)),
      )

      const [filePatch, missingPatch, branch, applied] = await Promise.all([
        rt.runPromise(Git.Service.use((git) => git.patch("/opencode", "HEAD", "src/app.ts"))),
        rt.runPromise(Git.Service.use((git) => git.patch("/opencode", "HEAD", "missing.ts"))),
        rt.runPromise(Git.Service.use((git) => git.branch("/opencode"))),
        rt.runPromise(Git.Service.use((git) => git.applyPatch("/opencode", "not applied"))),
      ])

      expect(filePatch.text).toContain("diff --git a/src/app.ts b/src/app.ts")
      expect(filePatch.text).not.toContain("docs/readme.md")
      expect(missingPatch).toEqual({ text: "", truncated: false })
      expect(branch).toBe("main")
      expect(applied.exitCode).toBe(0)
    })
  })
})
