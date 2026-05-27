export * as ConfigV2 from "./schema"

import { Schema } from "effect"
import { ConfigProvider } from "./provider"

export class Info extends Schema.Class<Info>("ConfigV2.Info")({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation",
  }),
  providers: Schema.Record(Schema.String, ConfigProvider.Info).pipe(Schema.optional),
}) {}

export class FileSource extends Schema.Class<FileSource>("ConfigV2.FileSource")({
  type: Schema.Literal("file"),
  path: Schema.String,
}) {}

export class MemorySource extends Schema.Class<MemorySource>("ConfigV2.MemorySource")({
  type: Schema.Literal("memory"),
}) {}

export const Source = Schema.Union([FileSource, MemorySource]).pipe(Schema.toTaggedUnion("type"))
export type Source = typeof Source.Type

export class Loaded extends Schema.Class<Loaded>("ConfigV2.Loaded")({
  source: Source,
  info: Info,
}) {}
