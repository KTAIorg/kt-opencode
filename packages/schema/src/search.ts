export * as Search from "./search.js"

import { Schema } from "effect"
import { IntegrationID } from "./integration-id.js"
import { optional, PositiveInt } from "./schema.js"

export interface Input extends Schema.Schema.Type<typeof Input> {}
export const Input = Schema.Struct({
  query: Schema.String,
  providerID: IntegrationID.pipe(optional),
  numResults: PositiveInt.check(Schema.isLessThanOrEqualTo(20)).pipe(optional),
  livecrawl: Schema.Literals(["fallback", "preferred"]).pipe(optional),
  type: Schema.Literals(["auto", "fast", "deep"]).pipe(optional),
  contextMaxCharacters: PositiveInt.check(Schema.isLessThanOrEqualTo(50_000)).pipe(optional),
}).annotate({ identifier: "Search.Input" })

export interface ProviderOutput extends Schema.Schema.Type<typeof ProviderOutput> {}
export const ProviderOutput = Schema.Struct({
  text: Schema.String,
  metadata: Schema.Json.pipe(optional),
}).annotate({ identifier: "Search.ProviderOutput" })

export class Result extends Schema.Class<Result>("Search.Result")({
  providerID: IntegrationID,
  ...ProviderOutput.fields,
}) {}
