export * as ConfigSearch from "./search"

import { Integration } from "@opencode-ai/schema/integration"
import { Schema } from "effect"

export class Info extends Schema.Class<Info>("ConfigSearch.Info")({
  provider: Integration.ID,
}) {}
