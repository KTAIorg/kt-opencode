import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { Integration } from "../integration"

export const IntegrationCapabilityTable = sqliteTable("integration_capability", {
  capability: text().$type<Integration.Capability["type"]>().primaryKey(),
  integration_id: text().$type<Integration.ID>().notNull(),
  ...Timestamps,
})
