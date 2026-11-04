import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqliteRunStore } from "../src/storage/sqlite.js";
import type { RunDescriptor } from "../src/storage/types.js";

const descriptor: RunDescriptor = {
  source: "browser",
  experimentId: "storage-test",
  scenario: { id: "example", version: "1" },
  adapter: { name: "playwright" },
  simulator: { name: "test-user", model: "test-model" },
  promptHash: "sha256:prompt",
};

function temporaryRoot(): string {
  return mkdtempSync(join(tmpdir(), "next-turn-store-"));
}

test("persists lifecycle checkpoints and interrupts unfinished runs", async () => {
  const root = temporaryRoot();
  let store = new SqliteRunStore(root);
  try {
    const run = await store.begin(descriptor);
    await store.appendEvent(run.id, "conversation.checkpoint", {
      messages: [{ role: "user", content: "hello" }],
    });
    await store.checkpoint(run.id, { messages: ["partial"] });
    store.close();

    store = new SqliteRunStore(root);
    assert.equal(await store.interruptRunning("process restarted"), 1);
    const stored = await store.get(run.id);
    assert.equal(stored?.run.status, "interrupted");
    assert.equal(stored?.run.outcome, "infrastructure_error");
    assert.deepEqual(stored?.run.record, { messages: ["partial"] });
    assert.deepEqual(stored?.events.map(({ type }) => type), [
      "conversation.checkpoint",
      "run.interrupted",
    ]);
    await assert.rejects(
      store.finalize(run.id, { status: "interrupted", outcome: "pass" }),
      /cannot have a passing outcome/,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("redacts durable JSON and keeps artifacts immutable", async () => {
  const root = temporaryRoot();
  const store = new SqliteRunStore(root);
  try {
    const trace = join(root, "trace.zip");
    const json = join(root, "result.json");
    writeFileSync(trace, "original trace");
    writeFileSync(json, JSON.stringify({ authorization: "Bearer abc123", note: "sk-or-v1-secret" }));
    const run = await store.begin({
      ...descriptor,
      metadata: { apiKey: "should-not-persist" },
    });
    await store.appendEvent(run.id, "provider.response", {
      token: "secret",
      text: "Bearer abc123",
    });
    await store.addArtifact(run.id, { name: "trace.zip", path: trace });
    await store.addArtifact(run.id, {
      name: "result.json",
      path: json,
      redactJson: true,
    });
    writeFileSync(trace, "replacement trace");
    await store.finalize(run.id, {
      status: "completed",
      outcome: "pass",
      record: { password: "secret", visible: "ok" },
    });

    const stored = await store.get(run.id);
    assert.deepEqual(stored?.run.metadata, { apiKey: "[REDACTED]" });
    assert.deepEqual(stored?.run.record, { password: "[REDACTED]", visible: "ok" });
    assert.deepEqual(stored?.events[0]?.data, {
      token: "[REDACTED]",
      text: "[REDACTED]",
    });
    assert.equal(Buffer.from(await store.readArtifact(run.id, "trace.zip")).toString(), "original trace");
    assert.deepEqual(
      JSON.parse(Buffer.from(await store.readArtifact(run.id, "result.json")).toString()),
      { authorization: "[REDACTED]", note: "[REDACTED]" },
    );
    await assert.rejects(
      store.addArtifact(run.id, { name: "trace.zip", path: trace }),
    );
    await assert.rejects(store.readArtifact(run.id, "../runs.sqlite"));
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("imports idempotently, preserves attempts, deletes and prunes", async () => {
  const root = temporaryRoot();
  const store = new SqliteRunStore(root);
  try {
    const evidence = join(root, "evidence.json");
    writeFileSync(evidence, JSON.stringify({ passed: true }));
    const input = {
      importKey: "fixture:attempt-1",
      descriptor: { ...descriptor, sourceIdentity: "attempt-1" },
      final: {
        status: "completed" as const,
        outcome: "pass" as const,
        record: { passed: true },
      },
      artifacts: [{ name: "evidence.json", path: evidence, redactJson: true }],
    };
    const first = await store.import(input);
    const duplicate = await store.import(input);
    const second = await store.import({
      ...input,
      importKey: "fixture:attempt-2",
      descriptor: { ...descriptor, sourceIdentity: "attempt-2" },
    });
    assert.equal(first.created, true);
    assert.deepEqual(duplicate, { id: first.id, created: false });
    assert.equal(second.created, true);
    assert.notEqual(second.id, first.id);
    assert.equal((await store.list()).length, 2);
    assert.equal(await store.delete(first.id), true);
    assert.equal(await store.delete(second.id), true);
    assert.equal(await store.pruneOrphanArtifacts(), 0);
    assert.equal(existsSync(join(root, "blobs")), true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("rolls back missing artifacts and creates a restorable backup", async () => {
  const root = temporaryRoot();
  const backup = temporaryRoot();
  rmSync(backup, { recursive: true, force: true });
  const store = new SqliteRunStore(root);
  try {
    await assert.rejects(
      store.import({
        importKey: "missing",
        descriptor,
        final: { status: "failed", outcome: "infrastructure_error" },
        artifacts: [{ name: "missing.zip", path: join(root, "missing.zip") }],
      }),
    );
    assert.equal((await store.list()).length, 0);

    const artifact = join(root, "trace.zip");
    writeFileSync(artifact, "trace");
    const run = await store.begin(descriptor);
    await store.addArtifact(run.id, { name: "trace.zip", path: artifact });
    await store.finalize(run.id, { status: "completed", outcome: "pass" });
    await store.backup(backup);
    const restored = new SqliteRunStore(backup);
    try {
      assert.equal((await restored.get(run.id))?.run.outcome, "pass");
      assert.equal(Buffer.from(await restored.readArtifact(run.id, "trace.zip")).toString(), "trace");
      assert.match(readFileSync(join(backup, "manifest.json"), "utf8"), /"artifacts": 1/);
    } finally {
      restored.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
  }
});

test("detects corrupted artifacts and removes abandoned files", async () => {
  const root = temporaryRoot();
  const store = new SqliteRunStore(root);
  try {
    const artifact = join(root, "trace.zip");
    writeFileSync(artifact, "verified trace");
    const run = await store.begin(descriptor);
    const reference = await store.addArtifact(run.id, { name: "trace.zip", path: artifact });
    await store.finalize(run.id, { status: "completed", outcome: "pass" });

    writeFileSync(join(root, "blobs", reference.sha256), "corrupted trace");
    await assert.rejects(store.readArtifact(run.id, "trace.zip"), /checksum mismatch/);

    writeFileSync(join(root, "blobs", "unreferenced"), "orphan");
    writeFileSync(join(root, "blobs", ".tmp-abandoned"), "partial");
    assert.equal(await store.pruneOrphanArtifacts(), 2);
    assert.equal(existsSync(join(root, "blobs", "unreferenced")), false);
    assert.equal(existsSync(join(root, "blobs", ".tmp-abandoned")), false);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("exports shareable evidence by default and private evidence explicitly", async () => {
  const root = temporaryRoot();
  const publicExport = join(tmpdir(), `next-turn-export-public-${Date.now()}`);
  const privateExport = join(tmpdir(), `next-turn-export-private-${Date.now()}`);
  const store = new SqliteRunStore(root);
  try {
    const publicArtifact = join(root, "result.json");
    const privateArtifact = join(root, "trace.zip");
    writeFileSync(publicArtifact, JSON.stringify({ passed: true }));
    writeFileSync(privateArtifact, "private provider trace");
    const run = await store.begin(descriptor);
    await store.addArtifact(run.id, {
      name: "result.json",
      path: publicArtifact,
      visibility: "shareable",
      redactJson: true,
    });
    await store.addArtifact(run.id, { name: "trace.zip", path: privateArtifact });
    await store.finalize(run.id, { status: "completed", outcome: "pass" });

    await store.exportRun(run.id, publicExport);
    assert.equal(existsSync(join(publicExport, "artifacts", "result.json")), true);
    assert.equal(existsSync(join(publicExport, "artifacts", "trace.zip")), false);
    assert.match(readFileSync(join(publicExport, "run.json"), "utf8"), /"privateArtifactsExcluded": 1/);

    await store.exportRun(run.id, privateExport, { includePrivate: true });
    assert.equal(existsSync(join(privateExport, "artifacts", "trace.zip")), true);
    await assert.rejects(store.exportRun(run.id, privateExport), /already exists/);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(publicExport, { recursive: true, force: true });
    rmSync(privateExport, { recursive: true, force: true });
  }
});

test("supports separate writers sharing content-addressed artifacts", async () => {
  const root = temporaryRoot();
  const firstStore = new SqliteRunStore(root);
  const secondStore = new SqliteRunStore(root);
  try {
    const artifact = join(root, "shared.json");
    writeFileSync(artifact, JSON.stringify({ shared: true }));
    const [first, second] = await Promise.all([
      firstStore.begin({ ...descriptor, sourceIdentity: "writer-1" }),
      secondStore.begin({ ...descriptor, sourceIdentity: "writer-2" }),
    ]);
    await Promise.all([
      firstStore.addArtifact(first.id, { name: "shared.json", path: artifact, redactJson: true }),
      secondStore.addArtifact(second.id, { name: "shared.json", path: artifact, redactJson: true }),
    ]);
    await Promise.all([
      firstStore.finalize(first.id, { status: "completed", outcome: "pass" }),
      secondStore.finalize(second.id, { status: "completed", outcome: "pass" }),
    ]);
    assert.equal((await firstStore.list()).length, 2);
    assert.deepEqual(
      Buffer.from(await secondStore.readArtifact(first.id, "shared.json")),
      Buffer.from(await firstStore.readArtifact(second.id, "shared.json")),
    );
  } finally {
    firstStore.close();
    secondStore.close();
    rmSync(root, { recursive: true, force: true });
  }
});
