# Plan 2: reusable conversational testing component

Date: 2026-11-02

Status: active implementation sequence. Milestone 1 is complete on
`codex/sqlite-persistence`; it is not yet part of the main release.
This plan follows [PLAN.md](./PLAN.md), which records the original MVP experiment.

## Objective

Let a developer describe a user's goal and constraints, connect an application,
run an adaptive conversation, and inspect independently verified results and
durable evidence. A new domain should require scenario data, an application
adapter, and evaluators, without changes to the core runner.

The next release is a local TypeScript component with HTTP and Playwright
adapters. It does not require a hosted service or account system.

## Proven baseline and limitations

- One pinned public tau2 retail scenario has isolated environment validation,
  independent business/process checks, and browser integration.
- The controlled 60-run experiment passed 15/15 correct dynamic paths and
  detected 15/15 injected errors for dynamic input. Fixed replay passed 5/15
  correct paths. These deterministic repetitions do not prove generalization.
- The latest real GLM run achieved reward 1.0, database match, and five matched
  action checks. Both README screenshots represent that same saved run.
- The custom TypeScript simulator still hardcodes retail facts and phrases.
  Real LLM user simulation currently runs through upstream tau2, not through a
  general LLM implementation of our TypeScript simulator interface.
- The Playwright adapter depends on our demo's selectors, turn attributes, and
  session-record endpoint. The real-model conversation page is a read-only replay.
- Existing runners save evidence to files that can be overwritten by later runs.
  The dashboard selects the newest file rather than an explicit stable run ID.
- The larger configurable timeout accommodates latency; it does not implement
  cancellation of an in-flight model request or guarantee a hard wall-clock bound.
- External developer trials remain pending and user-owned.

## Design decisions

Reuse established packages for infrastructure. Use Drizzle ORM and its migration
tooling with SQLite through better-sqlite3 initially. Keep a narrow storage
interface so another database can be added without changing simulator logic.
Changing SQL dialects still requires an adapter/schema migration; an ORM does
not make that automatic.

Keep Playwright's native trace ZIP format and viewer. Store artifact metadata in
the database and large trace/screenshot files in a managed artifact directory.
Consider OpenTelemetry for exporting runtime spans after the run/event model is
stable; spans do not replace browser replay artifacts or evaluator evidence.

Own the scenario contracts, run lifecycle, information boundaries, assertions,
and links between evidence. Avoid building a new database engine, migration
framework, browser trace viewer, or general model SDK.

## Milestone 1: durable run history

Implementation branch: `codex/sqlite-persistence`.

The completed implementation includes Drizzle schema/migrations, a SQLite
RunStore, lifecycle events and checkpoints, immutable artifacts addressed by
hash, idempotent import, backup/export/deletion commands, redaction, and stable
run-ID retrieval in both views. The verification suite passes 27 tests and a
fresh 12-case browser matrix; all 24 artifacts from that matrix were read back
with verified checksums. These counts are development evidence, not a reliability
claim about an LLM.

- [x] Separate database-independent storage contracts from SQLite implementation.
- [x] Define a versioned run envelope: run ID, experiment ID, scenario/version,
  adapter, simulator/model configuration, prompt hash, timestamps, outcome,
  termination reason, usage, and evaluation results.
- [x] Persist lifecycle events and partial conversations incrementally so a crash
  does not erase everything before finalization. Distinguish running, completed,
  failed, cancelled, and interrupted runs.
- [x] Automatically archive real tau2 runs and browser setup/transport failures.
- [x] Make imports idempotent using source identity or content hashes, while
  preserving genuinely separate attempts as separate runs.
- [x] Publish artifact files atomically; test interrupted writes, checksum
  corruption, missing files, duplicate artifacts, and concurrent writers.
- [x] Define consistent backup/export, retention, and explicit deletion behavior.
  Handle orphan artifacts without deleting evidence still referenced by a run.
- [x] Apply configurable redaction before durable recording and export. Do not
  persist API keys or authorization headers. Distinguish visible messages from
  raw provider responses that may contain additional sensitive content.
- [x] Resolve or document development dependency advisories. The production
  dependency audit is clean. Four moderate development-only advisories remain
  through `drizzle-kit -> @esbuild-kit -> esbuild`; npm's offered fix is a
  breaking drizzle-kit downgrade, so the README records the scope and mitigation.
- [x] Add retrieval by run ID and migrate dashboard/conversation views to the
  same selected run. Support browsing successes and failures.

Acceptance: repeated executions never overwrite earlier attempts; after reopening
the store, each completed run has readable, verified artifacts; interrupted runs
retain partial evidence and cannot appear as passed. Conversation and evaluator
views share a stable run ID. Backups restore both metadata and artifacts.

Acceptance evidence: idempotent imports return the original run while distinct
attempt identities create new runs; restore tests open a backup and verify its
artifact; corruption and missing-file tests fail closed; multi-writer tests share
one content-addressed blob safely; and both dashboard views preserve the selected
archive ID. Milestone 2 can now depend on the database-independent `RunStore`
contract.

## Milestone 2: application integration contracts

- [ ] Introduce a transport-neutral adapter interface for session start/reset,
  send, completion observation, visible history, cancellation, and cleanup.
- [ ] Make the core runner depend on that interface rather than a concrete
  Playwright adapter. Share lifecycle handling between HTTP and browser paths.
- [ ] Provide an HTTP adapter and configurable Playwright selectors/completion
  hooks. Preserve explicit turn correlation and avoid fixed sleeps.
- [ ] Collect private tool/state evidence through an independent provider hook;
  do not require every application to implement our demo record endpoint.
- [ ] Document which capabilities are optional and what evidence is unavailable
  when a system exposes only visible conversation.

Acceptance: one unrelated HTTP application and one existing browser chat can
connect without modifications to the runner or reliance on the demo server.

## Milestone 3: reusable constrained user simulation

- [ ] Validate scenario data: goal, known/unknown facts, constraints, disclosure
  rules, confirmation requirements, and turn limits.
- [ ] Keep fixed replay and deterministic simulators as useful baselines.
- [ ] Implement an LLM UserSimulator using an existing model client, structured
  decisions, bounded validation retries, and explicit simulator-error outcomes.
- [ ] Maintain stable user state; validate generated facts and confirmation scope.
  Preserve the boundary between simulator-visible information and evaluator data.
- [ ] Record model/prompt configuration, usage, and validation failures without
  requiring or exposing private model reasoning.

Acceptance: the same simulator implementation handles retail and an unrelated
scenario; tests detect invented unknown facts, relaxed constraints, and invalid
confirmation. Simulator failures are distinguishable from application failures.

## Milestone 4: independent evaluation and bounded execution

- [ ] Expose application-owned evaluators for final state, tool effects, and
  sequencing, with pass/fail/inconclusive/infrastructure-error outcomes.
- [ ] Preserve multiple failure categories and evidence instead of collapsing
  everything into a single cause. A stop or success claim is not proof of success.
- [ ] Add per-turn and total deadlines, cancellation propagation, tool/turn
  limits, and cost accounting. Document provider-dependent limits on cancelling
  already submitted requests and knowing final billed cost.
- [ ] Avoid automatic retries of state-changing target operations without an
  explicit idempotency contract. Retain retry attempts and partial failures.
- [ ] Distinguish replaying recorded evidence from re-executing a test.

Acceptance: stalled operations end predictably with partial evidence and cleanup;
unavailable state checks produce an explicit limitation; injected incorrect
actions fail even when the agent claims success.

## Milestone 5: packaging and portability evidence

- [ ] Package a small TypeScript library with documented entry points, optional
  browser/storage integrations, versioned report schemas, and migration policy.
- [ ] Provide runnable HTTP and browser examples plus CI-friendly JSON/JUnit
  output and documented process exit codes.
- [ ] Validate two independent domains, such as support-ticket creation and
  appointment booking, with application-owned state assertions.
- [ ] Compare fixed and adaptive inputs under the same initial state and checks.
  Report all attempts, including timeouts and simulator errors; selected README
  examples must not be described as overall reliability measurements.
- [ ] Have 2–3 external developers follow setup and integration documentation.
  Record setup time, required code changes, confusing steps, and diagnostic value.
  The project owner chooses recipients and authorizes outreach.

Acceptance: at least two external developers can integrate the component and
diagnose an introduced failure using the saved evidence. Use that feedback to
decide whether remote storage, more adapters, or hosted features are warranted.

## Delivery order and branch discipline

1. Finish and review durable storage on `codex/sqlite-persistence`.
2. Establish generic adapter contracts and one unrelated application integration.
3. Add constrained LLM simulation and evaluator/lifecycle improvements.
4. Complete package examples, cross-domain evaluation, and external trials.

Keep changes in focused commits: schema/migrations, archive lifecycle, runner
integration, dashboard retrieval, and documentation/evidence. Run offline tests
by default; keep live model trials explicitly bounded and record their cost.

The initial persistence commit was preserved on its branch and reverted on main
to honor separate development. Before eventual integration, account for that
revert explicitly (for example, revert the revert on an integration branch and
merge subsequent persistence work). A plain merge alone will not restore a
commit that main already contains and later reverted. Never force-rewrite shared
history to resolve this.

## References

- [Original experiment plan](./PLAN.md)
- [Controlled experiment report](./docs/runs/2026-11-02-weekend3-controlled-experiment.md)
- [Drizzle SQLite documentation](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [Drizzle migration generation](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
