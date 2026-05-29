import { createOpencodeClient, type OpencodeClient, type Project, type Workspace } from "@opencode-ai/sdk/v2"

const client = createOpencodeClient({
  baseUrl: process.env.OPENCODE_URL ?? "http://localhost:4096",
})


// directory



// dir1 -> resolves to project A
sdk.project.resolve({ directory: dir1 })

// dir2 -> resolves to project A
sdk.project.resolve({ directory: dir2 })

// worktree -> resolves to project A
const project = sdk.project.resolve({ directory: worktree })





// listing
sdk.project.workspaces()
// -> dir1
// -> dir2
// -> worktree









subpaths(host, workspace)
valid(host, workspace, path)
fuzzy(host, workspace)



sdk.files.subpaths()
sdk.files.fuzzy()


session table:
- project id
- host id
- workspace directory
- relative path



sdk.host.list()






sdk.route({ hostID }, () => {
  sdk.project.workspaces({ projectID })
})
  













/**
 * The current API has no explicit `project.create()` endpoint. Opening a
 * directory through `project.current()` resolves and registers its project.
 */
export async function createProject(
  sdk: OpencodeClient,
  input: { directory: string; name?: string },
): Promise<Project> {
  const project = (await sdk.project.current({ directory: input.directory }, { throwOnError: true })).data
  if (!input.name) return project

  sdk.project.list()

  return (
    await sdk.project.update(
      {
        projectID: project.id,
        directory: input.directory,
        name: input.name,
      },
      { throwOnError: true },
    )
  ).data
}

export async function createWorkspace(
  sdk: OpencodeClient,
  input: { projectDirectory: string; type: string; branch?: string | null },
): Promise<Workspace> {
  return (
    await sdk.experimental.workspace.create(
      {
        directory: input.projectDirectory,
        type: input.type,
        branch: input.branch ?? null,
      },
      { throwOnError: true },
    )
  ).data
}

export async function createWorktreeWorkspace(sdk: OpencodeClient, project: Project): Promise<Workspace> {
  return createWorkspace(sdk, {
    projectDirectory: project.worktree,
    type: "worktree",
    branch: null,
  })
}

export async function example() {
  const project = await createProject(client, {
    directory: "/Users/james/projects/opencode",
    name: "opencode",
  })

  const workspace = await createWorktreeWorkspace(client, project)

  console.log({ project, workspace })
}
