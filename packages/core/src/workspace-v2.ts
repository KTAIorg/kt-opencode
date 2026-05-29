export * as WorkspaceV2 from "./workspace-v2"

import { Context, Effect, Schema } from "effect"
import { Project } from "./project"
import { AbsolutePath, RelativePath } from "./schema"

export const Type = Schema.Literals(["directory", "worktree"])
export type Type = typeof Type.Type

export class Info extends Schema.Class<Info>("WorkspaceV2.Info")({
  projectID: Project.ID,
  path: AbsolutePath,
  type: Type,
  primary: Schema.Boolean,
}) {}

export const ListInput = Schema.Struct({
  projectID: Project.ID,
}).annotate({ identifier: "WorkspaceV2.ListInput" })
export type ListInput = typeof ListInput.Type

export const SubpathsInput = Schema.Struct({
  projectID: Project.ID,
  path: AbsolutePath,
}).annotate({ identifier: "WorkspaceV2.SubpathsInput" })
export type SubpathsInput = typeof SubpathsInput.Type

export const FuzzyInput = Schema.Struct({
  projectID: Project.ID,
  path: AbsolutePath,
  query: Schema.String,
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
}).annotate({ identifier: "WorkspaceV2.FuzzyInput" })
export type FuzzyInput = typeof FuzzyInput.Type

export class Subpath extends Schema.Class<Subpath>("WorkspaceV2.Subpath")({
  path: RelativePath,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("WorkspaceV2.NotFoundError", {
  projectID: Project.ID,
  path: AbsolutePath,
}) {}

export interface Interface {
  readonly list: (input: ListInput) => Effect.Effect<Info[]>
  readonly subpaths: (input: SubpathsInput) => Effect.Effect<Subpath[], NotFoundError>
  readonly fuzzy: (input: FuzzyInput) => Effect.Effect<Subpath[], NotFoundError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WorkspaceV2") {}
