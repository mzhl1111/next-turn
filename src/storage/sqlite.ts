import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import Database from "better-sqlite3";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { redactValue, type RedactionOptions } from "./redaction.js";
import { runArtifacts, runEvents, runs } from "./schema.js";
import {
  RUN_SCHEMA_VERSION,
  type AddArtifactInput,
  type ArtifactReference,
  type BeginRunInput,
  type FinalizeRunInput,
  type ImportResult,
  type ImportRunInput,
  type RunEnvelope,
  type RunEvent,
  type RunListFilter,
  type RunOutcome,
  type RunStatus,
  type RunStore,
  type RunSummary,
  type StoredRun,
} from "./types.js";

export interface SqliteRunStoreOptions {
  readonly redaction?: RedactionOptions;
}

function json(value: unknown, redaction: RedactionOptions): string {
  return JSON.stringify(redactValue(value, redaction));
}

function mediaTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".json": return "application/json";
    case ".zip": return "application/zip";
    case ".png": return "image/png";
    case ".md": return "text/markdown";
    default: return "application/octet-stream";
  }
}

function assertFinal(input: FinalizeRunInput): void {
  if (input.status !== "completed" && input.outcome === "pass") {
    throw new Error(`${input.status} runs cannot have a passing outcome`);
  }
}

/** Drizzle/SQLite metadata with immutable, content-addressed artifacts. */
export class SqliteRunStore implements RunStore {
  private readonly connection: Database.Database;
  private readonly db: BetterSQLite3Database;
  private readonly root: string;
  private readonly blobs: string;
  private readonly redaction: RedactionOptions;

  constructor(root: string, options: SqliteRunStoreOptions = {}) {
    this.root = resolve(root);
    this.blobs = join(this.root, "blobs");
    this.redaction = options.redaction ?? {};
    mkdirSync(this.blobs, { recursive: true });
    this.connection = new Database(join(this.root, "runs.sqlite"));
    this.connection.pragma("foreign_keys=ON");
    this.connection.pragma("journal_mode=WAL");
    this.connection.pragma("busy_timeout=5000");
    this.db = drizzle(this.connection);
    const sourceMigrations = resolve(import.meta.dirname, "../../drizzle");
    const builtMigrations = resolve(import.meta.dirname, "../../../drizzle");
    try {
      migrate(this.db, {
        migrationsFolder: existsSync(sourceMigrations) ? sourceMigrations : builtMigrations,
      });
      this.connection
        .prepare("UPDATE runs SET updated_at = created_at WHERE updated_at = ''")
        .run();
      this.backfillLegacyArtifacts();
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  private backfillLegacyArtifacts(): void {
    const legacy = this.connection
      .prepare("SELECT id, payload FROM runs WHERE id NOT IN (SELECT DISTINCT run_id FROM run_artifacts)")
      .all() as { id: string; payload: string }[];
    const insert = this.connection.prepare(
      "INSERT OR IGNORE INTO run_artifacts (run_id, name, sha256, bytes, media_type, visibility) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const transaction = this.connection.transaction(() => {
      for (const row of legacy) {
        const parsed = JSON.parse(row.payload) as { artifacts?: ArtifactReference[] };
        for (const artifact of parsed.artifacts ?? []) {
          insert.run(
            row.id,
            artifact.name,
            artifact.sha256,
            artifact.bytes,
            artifact.mediaType ?? "application/octet-stream",
            artifact.visibility ?? "private",
          );
        }
      }
    });
    transaction();
  }

  async begin(input: BeginRunInput): Promise<RunEnvelope> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const run: RunEnvelope = {
      schemaVersion: RUN_SCHEMA_VERSION,
      id,
      createdAt: now,
      updatedAt: now,
      source: input.source,
      ...(input.sourceIdentity ? { sourceIdentity: input.sourceIdentity } : {}),
      ...(input.experimentId ? { experimentId: input.experimentId } : {}),
      scenario: input.scenario,
      adapter: input.adapter,
      simulator: input.simulator,
      ...(input.promptHash ? { promptHash: input.promptHash } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      status: "running",
    };
    const safeRun = JSON.parse(json(run, this.redaction)) as RunEnvelope;
    this.db.insert(runs).values({
      id,
      schemaVersion: RUN_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      source: input.source,
      importKey: input.importKey,
      scenarioId: input.scenario.id,
      status: "running",
      payload: JSON.stringify(safeRun),
    }).run();
    return safeRun;
  }

  async appendEvent(id: string, type: string, data: unknown): Promise<RunEvent> {
    if (!type.trim()) throw new Error("Event type is required");
    let event: RunEvent | undefined;
    this.db.transaction((tx) => {
      const row = tx.select().from(runs).where(eq(runs.id, id)).get();
      if (!row) throw new Error(`Run not found: ${id}`);
      const current = tx
        .select({ maximum: sql<number>`coalesce(max(${runEvents.sequence}), 0)` })
        .from(runEvents)
        .where(eq(runEvents.runId, id))
        .get();
      const createdAt = new Date().toISOString();
      event = {
        sequence: Number(current?.maximum ?? 0) + 1,
        createdAt,
        type,
        data: redactValue(data, this.redaction),
      };
      tx.insert(runEvents).values({
        runId: id,
        sequence: event.sequence,
        createdAt,
        type,
        payload: JSON.stringify(event.data),
      }).run();
      const updated = { ...this.parseRun(row), updatedAt: createdAt } satisfies RunEnvelope;
      tx.update(runs).set({ updatedAt: createdAt, payload: JSON.stringify(updated) })
        .where(eq(runs.id, id)).run();
    });
    if (!event) throw new Error("Event transaction did not complete");
    return event;
  }

  async checkpoint(id: string, record: unknown): Promise<void> {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!row) throw new Error(`Run not found: ${id}`);
    const run = this.parseRun(row);
    if (run.status !== "running") throw new Error("Only running runs can be checkpointed");
    const updatedAt = new Date().toISOString();
    const updated: RunEnvelope = {
      ...run,
      updatedAt,
      record: redactValue(record, this.redaction),
    };
    this.db.update(runs).set({ updatedAt, payload: JSON.stringify(updated) })
      .where(eq(runs.id, id)).run();
  }

  async addArtifact(id: string, input: AddArtifactInput): Promise<ArtifactReference> {
    if (!input.name.trim() || basename(input.name) !== input.name) {
      throw new Error("Artifact name must be a nonempty filename");
    }
    if (!this.db.select({ id: runs.id }).from(runs).where(eq(runs.id, id)).get()) {
      throw new Error(`Run not found: ${id}`);
    }
    let data = readFileSync(input.path);
    if (input.redactJson) {
      const parsed: unknown = JSON.parse(data.toString("utf8"));
      data = Buffer.from(`${json(parsed, this.redaction)}\n`, "utf8");
    }
    const sha256 = createHash("sha256").update(data).digest("hex");
    const target = join(this.blobs, sha256);
    if (!existsSync(target)) {
      const temporary = join(this.blobs, `.tmp-${randomUUID()}`);
      try {
        writeFileSync(temporary, data, { flag: "wx", mode: 0o600 });
        renameSync(temporary, target);
      } catch (error) {
        rmSync(temporary, { force: true });
        if (!existsSync(target)) throw error;
      }
    }
    const stored = readFileSync(target);
    if (createHash("sha256").update(stored).digest("hex") !== sha256) {
      throw new Error(`Artifact checksum mismatch while publishing ${input.name}`);
    }
    const reference: ArtifactReference = {
      name: input.name,
      sha256,
      bytes: data.length,
      mediaType: input.mediaType ?? mediaTypeFor(input.path),
      visibility: input.visibility ?? "private",
    };
    try {
      this.db.insert(runArtifacts).values({ runId: id, ...reference }).run();
    } catch (error) {
      await this.pruneOrphanArtifacts();
      throw error;
    }
    return reference;
  }

  async finalize(id: string, input: FinalizeRunInput): Promise<RunEnvelope> {
    assertFinal(input);
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!row) throw new Error(`Run not found: ${id}`);
    const run = this.parseRun(row);
    if (run.status !== "running") throw new Error(`Run is already ${run.status}`);
    const updatedAt = new Date().toISOString();
    const updated: RunEnvelope = {
      ...run,
      updatedAt,
      status: input.status,
      outcome: input.outcome,
      ...(input.terminationReason ? { terminationReason: input.terminationReason } : {}),
      ...(input.usage ? { usage: input.usage } : {}),
      ...(input.evaluation !== undefined
        ? { evaluation: redactValue(input.evaluation, this.redaction) }
        : {}),
      ...(input.record !== undefined
        ? { record: redactValue(input.record, this.redaction) }
        : {}),
    };
    this.db.update(runs).set({
      updatedAt,
      status: input.status,
      outcome: input.outcome,
      payload: JSON.stringify(updated),
    }).where(eq(runs.id, id)).run();
    return updated;
  }

  async import(input: ImportRunInput): Promise<ImportResult> {
    const existing = this.db.select({ id: runs.id }).from(runs)
      .where(eq(runs.importKey, input.importKey)).get();
    if (existing) return { id: existing.id, created: false };
    let run: RunEnvelope;
    try {
      run = await this.begin({ ...input.descriptor, importKey: input.importKey });
    } catch (error) {
      const concurrent = this.db.select({ id: runs.id }).from(runs)
        .where(eq(runs.importKey, input.importKey)).get();
      if (concurrent) return { id: concurrent.id, created: false };
      throw error;
    }
    try {
      for (const event of input.events ?? []) await this.appendEvent(run.id, event.type, event.data);
      for (const artifact of input.artifacts ?? []) await this.addArtifact(run.id, artifact);
      await this.finalize(run.id, input.final);
      return { id: run.id, created: true };
    } catch (error) {
      await this.delete(run.id);
      throw error;
    }
  }

  async interruptRunning(reason: string): Promise<number> {
    const active = this.db.select().from(runs).where(eq(runs.status, "running")).all();
    for (const row of active) {
      await this.appendEvent(row.id, "run.interrupted", { reason });
      await this.finalize(row.id, {
        status: "interrupted",
        outcome: "infrastructure_error",
        terminationReason: reason,
      });
    }
    return active.length;
  }

  private parseRun(row: typeof runs.$inferSelect): RunEnvelope {
    const parsed = JSON.parse(row.payload) as Partial<RunEnvelope> & { record?: unknown };
    if (parsed.schemaVersion === RUN_SCHEMA_VERSION && parsed.scenario && parsed.adapter) {
      return parsed as RunEnvelope;
    }
    return {
      schemaVersion: RUN_SCHEMA_VERSION,
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt || row.createdAt,
      source: row.source,
      scenario: { id: row.scenarioId, version: "legacy" },
      adapter: { name: "legacy-import" },
      simulator: { name: "unknown" },
      status: row.status as RunStatus,
      ...(row.outcome ? { outcome: row.outcome as RunOutcome } : {}),
      record: parsed.record ?? parsed,
    };
  }

  async get(id: string): Promise<StoredRun | undefined> {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!row) return undefined;
    const events: RunEvent[] = this.db.select().from(runEvents)
      .where(eq(runEvents.runId, id)).orderBy(runEvents.sequence).all()
      .map((event) => ({
        sequence: event.sequence,
        createdAt: event.createdAt,
        type: event.type,
        data: JSON.parse(event.payload),
      }));
    const artifacts: ArtifactReference[] = this.db.select().from(runArtifacts)
      .where(eq(runArtifacts.runId, id)).all()
      .map(({ name, sha256, bytes, mediaType, visibility }) => ({
        name,
        sha256,
        bytes,
        mediaType,
        visibility: visibility as ArtifactReference["visibility"],
      }));
    return { run: this.parseRun(row), events, artifacts };
  }

  async list(filter: RunListFilter = {}): Promise<readonly RunSummary[]> {
    const limit = filter.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
      throw new Error("Limit must be an integer from 1 to 10000");
    }
    const conditions = [
      ...(filter.source ? [eq(runs.source, filter.source)] : []),
      ...(filter.status ? [eq(runs.status, filter.status)] : []),
    ];
    return this.db.select({
      id: runs.id,
      createdAt: runs.createdAt,
      updatedAt: runs.updatedAt,
      source: runs.source,
      scenarioId: runs.scenarioId,
      status: runs.status,
      outcome: runs.outcome,
    }).from(runs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(limit)
      .all()
      .map((row): RunSummary => ({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        source: row.source,
        scenarioId: row.scenarioId,
        status: row.status as RunStatus,
        ...(row.outcome ? { outcome: row.outcome as RunOutcome } : {}),
      }));
  }

  async readArtifact(id: string, name: string): Promise<Uint8Array> {
    const artifact = this.db.select().from(runArtifacts)
      .where(and(eq(runArtifacts.runId, id), eq(runArtifacts.name, name))).get();
    if (!artifact) throw new Error("Artifact not found");
    const data = readFileSync(join(this.blobs, artifact.sha256));
    if (createHash("sha256").update(data).digest("hex") !== artifact.sha256) {
      throw new Error("Artifact checksum mismatch");
    }
    return data;
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.delete(runs).where(eq(runs.id, id)).run();
    if (result.changes > 0) await this.pruneOrphanArtifacts();
    return result.changes > 0;
  }

  async pruneOrphanArtifacts(): Promise<number> {
    const referenced = new Set(
      this.db.select({ sha256: runArtifacts.sha256 }).from(runArtifacts).all()
        .map(({ sha256 }) => sha256),
    );
    let removed = 0;
    for (const name of readdirSync(this.blobs)) {
      if (name.startsWith(".tmp-") || !referenced.has(name)) {
        rmSync(join(this.blobs, name), { force: true });
        removed += 1;
      }
    }
    return removed;
  }

  async backup(destination: string): Promise<void> {
    const target = resolve(destination);
    if (relative(this.root, target) === "" || !relative(this.root, target).startsWith("..")) {
      throw new Error("Backup destination must be outside the live archive");
    }
    const databasePath = join(target, "runs.sqlite");
    if (existsSync(databasePath)) throw new Error("Backup destination already contains runs.sqlite");
    mkdirSync(join(target, "blobs"), { recursive: true });
    await this.connection.backup(databasePath);
    const snapshot = new Database(databasePath, { readonly: true });
    try {
      const references = snapshot.prepare("SELECT DISTINCT sha256 FROM run_artifacts").all() as {
        sha256: string;
      }[];
      for (const { sha256 } of references) {
        const source = join(this.blobs, sha256);
        const destinationBlob = join(target, "blobs", sha256);
        copyFileSync(source, destinationBlob);
        const copiedHash = createHash("sha256").update(readFileSync(destinationBlob)).digest("hex");
        if (statSync(source).size !== statSync(destinationBlob).size || copiedHash !== sha256) {
          throw new Error(`Incomplete backup artifact: ${sha256}`);
        }
      }
      writeFileSync(join(target, "manifest.json"), `${JSON.stringify({
        schemaVersion: RUN_SCHEMA_VERSION,
        createdAt: new Date().toISOString(),
        artifacts: references.length,
      }, null, 2)}\n`);
    } finally {
      snapshot.close();
    }
  }

  async exportRun(
    id: string,
    destination: string,
    options: { readonly includePrivate?: boolean } = {},
  ): Promise<void> {
    const stored = await this.get(id);
    if (!stored) throw new Error(`Run not found: ${id}`);
    const target = resolve(destination);
    if (existsSync(target)) throw new Error("Export destination already exists");
    mkdirSync(join(target, "artifacts"), { recursive: true });
    const artifacts = stored.artifacts.filter(
      ({ visibility }) => visibility === "shareable" || options.includePrivate === true,
    );
    for (const artifact of artifacts) {
      writeFileSync(
        join(target, "artifacts", artifact.name),
        await this.readArtifact(id, artifact.name),
        { mode: 0o600 },
      );
    }
    writeFileSync(join(target, "run.json"), `${JSON.stringify({
      ...stored,
      artifacts,
      privateArtifactsExcluded: stored.artifacts.length - artifacts.length,
    }, null, 2)}\n`, { mode: 0o600 });
  }

  close(): void {
    this.connection.close();
  }
}
