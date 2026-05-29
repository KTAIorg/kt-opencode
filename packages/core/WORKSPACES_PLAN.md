# Local Workspace V2 Plan

## Goal

A **workspace V2** is a local checkout directory for a project. A project may have one primary workspace V2 and any number of additional local checkouts, whether they were created by `git worktree`, `git clone`, or another mechanism. Remote execution and synchronization are not part of this concept.

`Project.resolve` already provides the key prerequisite: separate clones and linked worktrees with the same normalized Git remote resolve to the same project ID.

## Current Boundaries

- `packages/core/src/project.ts` resolves project identity, but intentionally does not persist a project or its opened directory.
- `packages/opencode/src/project/project.ts` currently persists projects and is the current durable boundary after core resolves an opened directory.
- `packages/opencode/src/control-plane/workspace.ts` and its `workspace` table describe the existing remote/control-plane feature. They should not become the storage or API for local workspace V2.
- Sessions already retain both the checkout directory and a relative `path`, which can supply known subpaths during migration.
- Existing file search uses ripgrep to enumerate paths and fuzzy ranking in the file service; the new API should reuse that capability rather than create a second search system.

## Domain Shape

Add a new `WorkspaceV2` namespace in `packages/core` for local workspace concepts only. Until the old workspace feature is deprecated, all newly introduced implementation names should retain the `V2` suffix so the two domains cannot be confused.

Suggested public value:

```ts
WorkspaceV2.Info {
  projectID: Project.ID
  path: AbsolutePath
  type: "directory" | "worktree"
  primary: boolean
}
```

Use the canonical checkout root as `path`, not the subdirectory from which opencode was launched. `type: "directory"` represents a regular local directory or normal clone; `type: "worktree"` represents a linked Git worktree. Add further local types only when a checkout mechanism requires different behavior.

Reuse the existing `workspace` table as the shared persistence model. It already has `type`, `directory`, and `project_id`; add a `primary` boolean field and enforce at most one primary row per project. `WorkspaceV2` is the new local-only service/API interpretation of rows whose `type` is a local type; legacy control-plane code can continue using the same table during transition.

Do not add discovery provenance. Local workspace identity is the canonical `directory` within a project, while `type` describes its checkout mechanism. Pruning can validate that non-primary local paths still exist rather than retaining source ownership metadata.

## Primary Location And Reconciliation

The `WorkspaceV2` service should persist checkouts as they become known and reconcile additional checkouts from enumerators in the background. Each enumerator represents one mechanism by which workspace paths can be found and owns cleanup of paths found only through that mechanism.

- Keep `Project.resolve` focused on mapping an opened directory to project identity.
- In the existing persisted project-open flow, upsert the resolved checkout root as a local `workspace` row. This is how separately cloned directories become known after being opened.
- The first stored checkout for a project becomes `primary: true` transactionally; subsequent opened or discovered paths do not change it.
- Add an initial Git worktree reconciler that runs `git worktree list --porcelain` from a stored Git workspace, upserts its current linked worktree paths as `type: "worktree"`, and prunes unavailable non-primary local rows safely.
- Normalize, deduplicate, and validate all stored or discovered paths; a discovered path equal to the primary path remains a single primary workspace.
- Additional mechanisms, such as scanning configured clone roots, can be added without changing the public workspace API.

An unavailable primary raises a policy decision: reconciliation cannot select a replacement without a user-facing rule. Recommended first behavior is to retain the primary row until a replacement operation exists, while pruning unavailable non-primary rows that are owned by an enumerator or fail validation when accessed.

## API Shape

The new methods should use object inputs and core `Schema` values, matching the existing Effect service pattern.

```ts
workspaceV2.list({ projectID })
// Effect<WorkspaceV2.Info[]>

workspaceV2.subpaths({ projectID, path })
// Effect<Array<{ path: string }>>

workspaceV2.fuzzy({ projectID, path, query, limit? })
// Effect<Array<{ path: string }>>
```

Validate that `path` exists in the stored workspace set for `projectID` and still refers to an available directory before returning subpaths or searching it. All returned subpaths and fuzzy results should use slash-separated paths relative to the workspace root.

## Listing And Discovery

`workspaceV2.list` should read stored workspace V2 rows and return immediately. It should not wait for Git commands or filesystem scanning.

Recommended synchronization model:

- Store the current opened checkout synchronously as part of the project-open persistence flow, so the active workspace is immediately visible.
- Run reconciliation once when an instance/project is bootstrapped. The current `InstanceBootstrap`/scoped background-work pattern is a suitable lifecycle hook while workspaces are associated with open instances.
- When a workspace list is requested, trigger the same deduplicated reconciliation in the background and return existing rows immediately.
- Emit a local workspace-updated event only when reconciliation changes stored rows, allowing an open picker to reload without blocking its initial response.
- Keep failures non-destructive: log an enumerator failure and retain prior stored rows rather than hiding workspaces on a transient Git failure.

For the first version, synchronization should be event-triggered rather than a perpetual timer: project open/bootstrap and list access are enough to keep active projects fresh without introducing polling lifetime and battery-use concerns. If global project browsing later needs fresh state without opening a project, add a scoped global scheduler then.

Independent `git clone` directories cannot be found from Git worktree metadata alone. They become stored workspaces when opened and resolved; discovering unopened clones later would require another enumerator with a defined source of candidate paths.

## Subpaths

`workspaceV2.subpaths` returns distinct prior session roots within a local workspace V2:

- Query sessions for the project and workspace checkout directory.
- Use the existing relative session `path` value, normalizing the workspace root as `""` or `"."` consistently in the public contract.
- Exclude paths that escape the workspace root or are no longer directories.
- Sort results deterministically and deduplicate them.

This requires resolving the existing session persistence boundary: session rows currently live in `packages/opencode`, not core. During migration the core workspace contract will need a session-subpath storage adapter, or the endpoint composition must remain in opencode until session persistence is moved.

## Fuzzy Paths

`workspaceV2.fuzzy` supports selecting a subpath by searching file and directory names beneath one stored, available workspace V2. It should accept a query and limit so the API does not transmit an unbounded repository listing.

- Reuse ripgrep-backed file enumeration and current fuzzy ranking behavior from the existing file feature.
- Include directory results, because the user is selecting a session root; directories may be derived from matched file paths as the existing file cache already does.
- Scope scanning to the requested workspace root and respect ignored/generated paths in the same way as existing file search.
- Treat indexing/caching as a later performance refinement; the first implementation can follow existing instance-level search behavior.

Because ripgrep and fuzzy file search currently live in `packages/opencode`, moving this method directly into core either requires moving that reusable capability first or introducing a narrow search dependency supplied by opencode.

## Migration Notes

- Persist the opened checkout root during the existing project-open flow, where opencode already performs project upserts after core identity resolution.
- Treat existing `Project.Info.worktree` as the primary location only where compatibility is needed while consumers move to the new local-workspace records.
- Do not migrate or consult `project.sandboxes` for local workspace enumeration.
- Do not migrate or rename remote/control-plane workspaces into workspace V2 records; they represent a different domain and may need a separate future name.
- Do not use existing session `workspace_id` for local checkout identity while it still denotes remote/control-plane workspace routing; use explicitly V2-named storage or references if a persistent association is introduced.

## Coexistence With Legacy Workspace

Both implementations can run at the same time because they own different responsibilities:

| Area | Existing `Workspace` / worktree behavior | `WorkspaceV2` during migration |
| --- | --- | --- |
| Purpose | Remote/control-plane targets, workspace routing, sync, and existing local worktree adapter | Local checkout inventory and local subpath selection |
| Persistence | `workspace` table and `session.workspace_id` | Local-typed rows in the same `workspace` table, with new `primary` field |
| API | `/experimental/workspace` and `/experimental/worktree` | New V2-only endpoints when exposed |
| Routing | `?workspace=`, `WorkspaceRef`, proxy/fence/sync behavior | No routing participation initially |
| Worktree creation/removal | Existing APIs remain authoritative | Reconciliation observes resulting directories |

Compatibility rules:

- Do not change legacy route semantics, sync behavior, feature flag behavior, or existing SDK contracts as part of initial WorkspaceV2 work.
- Reuse local legacy `type: "worktree"` rows when they already describe local checkouts. Do not interpret remote adapter types as local WorkspaceV2 entries.
- A shared local worktree row may be used by both implementations during migration. WorkspaceV2 reads only its local checkout fields; legacy behavior continues to own routing and sync behavior associated with old APIs.
- Existing worktree create/remove calls continue through the current `Worktree` and legacy adapter implementation. WorkspaceV2 discovers their paths asynchronously and must not become a prerequisite for those operations.
- Existing sessions keep their current `workspace_id` semantics. Sessions created during the first V2 phases continue to store directory/path as today; do not add a WorkspaceV2 session foreign key until a concrete session-query requirement demands it.

### Rollout Phases

1. **Shared-table extension**: add `workspace.primary`, write the actively opened local checkout after successful project resolution, and reconcile Git worktrees in the background. No existing UI, routing, or session behavior changes yet.
2. **V2 read API**: expose separately named WorkspaceV2 list/subpath/fuzzy endpoints and SDK methods. Consumers opt in; existing workspace and worktree APIs remain unchanged.
3. **UI adoption for local selection**: move only local checkout/subpath selection UI to WorkspaceV2. Keep remote selection, session warping, proxying, and sync on legacy Workspace.
4. **Legacy split/deprecation**: once no consumer treats the legacy API as the local checkout picker, rename or deprecate the old remote/control-plane workspace surface independently. Remove V2 naming only in this deliberate cutover.

### Failure And Rollback Rules

- V2 write or reconciliation failure must not prevent opening a project or using legacy workspace/worktree functionality during initial rollout.
- Reconciliation must not delete remote/control-plane `workspace` rows or alter `session.workspace_id` values; it may reconcile rows representing local checkout types.
- Disabling V2 consumers should be sufficient rollback: legacy APIs and data remain authoritative until an explicit later cutover.

## Transitional Naming

Use the V2 suffix for every newly introduced local-workspace implementation artifact while both workspace domains coexist:

- Core namespace and service: `WorkspaceV2`, `@opencode/WorkspaceV2`.
- Source module: `packages/core/src/workspace-v2.ts` unless the final module convention establishes another V2-explicit location.
- New service/API names use V2; the reused persistence table remains `workspace`, with the added `primary` column, because shared storage is intentional.
- Methods and endpoints: `workspaceV2.list`, `workspaceV2.subpaths`, and `workspaceV2.fuzzy`.
- Events, errors, runtime adapters, and reconciler names: prefix or namespace them with `WorkspaceV2`.

The suffix is transitional. Remove or rename it only as part of the deliberate removal/deprecation of the old remote workspace API, not incrementally during implementation.

## Open Decisions

- What user-facing operation changes the primary workspace when it is deleted or no longer available?
- What enumerator, if any, should discover unopened separately cloned repositories, since Git only enumerates linked worktrees from a checkout?
- Should core define the workspace/store contracts while opencode supplies its database-backed and instance-bootstrap integration during migration, or should moving persistence into core be part of this work?
- How should non-Git project directories obtain stable project identity if multiple copies should ever be grouped together?
- Should initial V2 writes be permanently best-effort during coexistence, or become required only after the UI/API cutover is complete?

## Implementation Checklist

- [x] Use `WorkspaceV2` naming for new service/API code while intentionally retaining the shared `workspace` persistence table.
- [x] Define core `WorkspaceV2.Info`, object-shaped method inputs, typed errors, and service interface.
- [x] Extend shared `workspace` persistence with a `primary` field and one-primary-per-project constraint, using `type` for local checkout kinds.
- [x] Upsert the opened checkout root during the existing project-open/upsert flow and make first-path primary selection transactional.
- [ ] Define the reconciliation interface and implement the first Git worktree reconciler.
- [ ] Trigger deduplicated background reconciliation from project bootstrap and workspace-list access, emitting an update event only when rows change.
- [ ] Implement `workspaceV2.list({ projectID })` as a fast stored read with canonicalization and safe pruning behavior.
- [ ] Implement `workspaceV2.subpaths({ projectID, path })` from distinct valid session-relative paths.
- [ ] Implement `workspaceV2.fuzzy({ projectID, path, query, limit? })` by reusing the existing file enumeration/fuzzy search capability.
- [ ] Add focused tests for clone-open persistence, primary selection, Git worktree reconciliation, unavailable-path pruning, update emission, session subpaths, and fuzzy result scoping.
- [ ] Expose the agreed methods through server/SDK surfaces only after the core contract and migration behavior are approved.
- [ ] Keep legacy `/experimental/workspace`, `/experimental/worktree`, and `session.workspace_id` behavior unchanged throughout shared-table and V2 read-API rollout.
- [ ] Add rollout tests proving V2 failures do not break legacy local worktree and remote workspace flows.
