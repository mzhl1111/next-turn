import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqliteRunStore } from "../src/storage/sqlite.js";

test("archive survives reopen and source overwrite, preserves separate attempts", async () => {
  const root = mkdtempSync(join(tmpdir(), "next-turn-store-"));
  let store = new SqliteRunStore(root);
  try {
    const trace = join(root, "trace.zip");
    writeFileSync(trace, "original trace");
    const id = await store.save({ source: "browser", record: { passed: false }, artifacts: [{ name: "trace", path: trace }] });
    const second = await store.save({ source: "browser", record: { passed: true } });
    writeFileSync(trace, "replacement trace");
    store.close();
    store = new SqliteRunStore(root);
    assert.deepEqual((await store.get(id))?.record, { passed: false });
    assert.equal(Buffer.from(await store.readArtifact(id, "trace")).toString(), "original trace");
    assert.deepEqual(await store.list(), [second, id]);
    await assert.rejects(store.save({ source: "browser", record: {}, artifacts: [{ name: "missing", path: join(root, "absent") }] }));
    assert.equal((await store.list()).length, 2);
    await assert.rejects(store.readArtifact(id, "../runs.sqlite"));
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});
