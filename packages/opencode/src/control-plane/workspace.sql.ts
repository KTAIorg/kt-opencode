import { sql } from "drizzle-orm"
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import type { ProjectID } from "../project/schema"
import type { WorkspaceID } from "./schema"

export const WorkspaceTable = sqliteTable("workspace", {
  id: text().$type<WorkspaceID>().primaryKey(),
  type: text().notNull(),
  name: text().notNull().default(""),
  branch: text(),
  directory: text(),
  extra: text({ mode: "json" }),
  primary: integer({ mode: "boolean" }).notNull().default(false),
  project_id: text()
    .$type<ProjectID>()
    .notNull()
    .references(() => ProjectTable.id, { onDelete: "cascade" }),
  time_used: integer()
    .notNull()
    .$default(() => Date.now()),
}, (table) => [
  uniqueIndex("workspace_project_primary_idx")
    .on(table.project_id)
    .where(sql`${table.primary} = 1`),
])
