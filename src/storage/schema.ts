import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull().default(""),
  source: text("source").notNull(),
  importKey: text("import_key"),
  scenarioId: text("scenario_id").notNull().default("unknown"),
  status: text("status").notNull().default("completed"),
  outcome: text("outcome"),
  payload: text("payload").notNull(),
}, (table) => [uniqueIndex("runs_import_key_unique").on(table.importKey)]);

export const runEvents = sqliteTable("run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  createdAt: text("created_at").notNull(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
}, (table) => [uniqueIndex("run_events_sequence_unique").on(table.runId, table.sequence)]);

export const runArtifacts = sqliteTable("run_artifacts", {
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sha256: text("sha256").notNull(),
  bytes: integer("bytes").notNull(),
  mediaType: text("media_type").notNull(),
  visibility: text("visibility").notNull(),
}, (table) => [primaryKey({ columns: [table.runId, table.name] })]);
