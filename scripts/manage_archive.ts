import { resolve } from "node:path";

import { SqliteRunStore } from "../src/storage/sqlite.js";

const projectDir = resolve(import.meta.dirname, "..");
const store = new SqliteRunStore(
  resolve(projectDir, process.env.NEXT_TURN_STORE_DIR ?? "artifacts/archive"),
);
const [command, first, second] = process.argv.slice(2);

try {
  switch (command) {
    case "list":
      process.stdout.write(`${JSON.stringify(await store.list({ limit: 1_000 }), null, 2)}\n`);
      break;
    case "backup":
      if (!first) throw new Error("Usage: npm run archive:manage -- backup <directory>");
      await store.backup(resolve(first));
      process.stdout.write(`Archive backed up to ${resolve(first)}\n`);
      break;
    case "export":
      if (!first || !second) {
        throw new Error("Usage: npm run archive:manage -- export <run-id> <directory> [--include-private]");
      }
      await store.exportRun(first, resolve(second), {
        includePrivate: process.argv.includes("--include-private"),
      });
      process.stdout.write(`Run ${first} exported to ${resolve(second)}\n`);
      break;
    case "delete":
      if (!first) throw new Error("Usage: npm run archive:manage -- delete <run-id>");
      if (!await store.delete(first)) throw new Error(`Run not found: ${first}`);
      process.stdout.write(`Deleted run ${first} and unreferenced artifacts.\n`);
      break;
    case "prune":
      process.stdout.write(`Removed ${await store.pruneOrphanArtifacts()} orphan artifacts.\n`);
      break;
    case "interrupt":
      process.stdout.write(`Interrupted ${await store.interruptRunning(first ?? "manual recovery")} active runs.\n`);
      break;
    default:
      throw new Error("Commands: list, backup, export, delete, prune, interrupt");
  }
} finally {
  store.close();
}
