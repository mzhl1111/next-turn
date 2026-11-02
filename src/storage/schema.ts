import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  source: text("source").notNull(),
  payload: text("payload").notNull(),
});
