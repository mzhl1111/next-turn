import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { SqliteRunStore } from "../src/storage/sqlite.js";

const root = resolve(import.meta.dirname, "..");
const store = new SqliteRunStore(resolve(root, process.env.NEXT_TURN_STORE_DIR ?? "artifacts/archive"));
let count = 0;
try {
  const evidenceDir = join(root, "artifacts/weekend3/evidence");
  if (existsSync(evidenceDir)) {
    for (const filename of await readdir(evidenceDir)) {
      if (!filename.endsWith(".json")) continue;
      const path = join(evidenceDir, filename);
      const record = JSON.parse(await readFile(path, "utf8"));
      const trace = resolve(root, record.tracePath);
      await store.save({ source: "weekend3-import", record, artifacts: [
        { name: "evidence.json", path },
        ...(existsSync(trace) ? [{ name: "trace.zip", path: trace }] : []),
      ] });
      count++;
    }
  }
  const simulations = join(root, ".tau2/tau2-bench/data/simulations");
  if (existsSync(simulations)) {
    for (const entry of await readdir(simulations, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(simulations, entry.name, "results.json");
      if (!existsSync(path)) continue;
      const record = JSON.parse(await readFile(path, "utf8"));
      await store.save({ source: "tau2-import", record, artifacts: [{ name: "results.json", path }] });
      count++;
    }
  }
  console.log(`Archived ${count} saved runs. Importing again creates new archive entries.`);
} finally { store.close(); }
