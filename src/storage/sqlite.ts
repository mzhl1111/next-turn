import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { runs } from "./schema.js";

export interface RunArchiveInput {
  readonly source: string;
  readonly record: unknown;
  readonly artifacts?: readonly { name: string; path: string }[];
}

export interface ArchivedRun {
  readonly id: string;
  readonly createdAt: string;
  readonly source: string;
  readonly record: unknown;
  readonly artifacts: readonly { name: string; sha256: string; bytes: number }[];
}

/** Append-only archive contract; adapters own their database and artifact storage. */
export interface RunStore {
  save(input: RunArchiveInput): Promise<string>;
  get(id: string): Promise<ArchivedRun | undefined>;
  list(limit?: number): Promise<readonly string[]>;
  readArtifact(id: string, name: string): Promise<Uint8Array>;
  close(): void;
}

/** SQLite metadata plus immutable, content-addressed files in one portable root. */
export class SqliteRunStore implements RunStore {
  private readonly connection: Database.Database;
  private readonly db: BetterSQLite3Database;
  private readonly blobs: string;

  constructor(root: string) {
    const directory = resolve(root);
    this.blobs = join(directory, "blobs");
    mkdirSync(this.blobs, { recursive: true });
    this.connection = new Database(join(directory, "runs.sqlite"));
    this.connection.pragma("journal_mode=WAL");
    this.connection.pragma("busy_timeout=5000");
    this.db = drizzle(this.connection);
    const sourceMigrations = resolve(import.meta.dirname, "../../drizzle");
    try {
      migrate(this.db, { migrationsFolder: existsSync(sourceMigrations)
        ? sourceMigrations : resolve(import.meta.dirname, "../../../drizzle") });
    } catch (error) { this.connection.close(); throw error; }
  }

  async save(input: RunArchiveInput): Promise<string> {
    const names = new Set<string>();
    const artifacts = (input.artifacts ?? []).map(({ name, path }) => {
      if (!name || names.has(name)) throw new Error("Artifact names must be nonempty and unique");
      names.add(name);
      const data = readFileSync(path);
      const sha256 = createHash("sha256").update(data).digest("hex");
      return { name, sha256, bytes: data.length, data };
    });
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const archived: ArchivedRun = {
      id, createdAt, source: input.source, record: input.record,
      artifacts: artifacts.map(({ data: _data, ...metadata }) => metadata),
    };
    const payload = JSON.stringify(archived);
    // Publish files before committing metadata. A crash can leave an orphan blob,
    // but cannot publish a database record referring to an unwritten file.
    for (const artifact of artifacts) {
      const target = join(this.blobs, artifact.sha256);
      try {
        writeFileSync(target, artifact.data, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = readFileSync(target);
        if (createHash("sha256").update(existing).digest("hex") !== artifact.sha256) {
          throw new Error(`Corrupt artifact: ${artifact.sha256}`);
        }
      }
    }
    this.db.insert(runs).values({ id, createdAt, source: input.source, payload }).run();
    return id;
  }

  async get(id: string): Promise<ArchivedRun | undefined> {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    return row ? JSON.parse(String(row.payload)) as ArchivedRun : undefined;
  }

  async list(limit = 100): Promise<readonly string[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Limit must be 1–10000");
    return this.db.select({ id: runs.id }).from(runs).orderBy(sql`rowid DESC`).limit(limit).all().map(row => row.id);
  }

  async readArtifact(id: string, name: string): Promise<Uint8Array> {
    const artifact = (await this.get(id))?.artifacts.find(item => item.name === name);
    if (!artifact) throw new Error("Artifact not found");
    const data = readFileSync(join(this.blobs, artifact.sha256));
    if (createHash("sha256").update(data).digest("hex") !== artifact.sha256) throw new Error("Artifact checksum mismatch");
    return data;
  }

  close(): void { this.connection.close(); }
}
