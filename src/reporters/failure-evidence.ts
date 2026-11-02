import type {
  EvaluationResult,
  AssertionResult,
} from "../evaluators/tau2-retail-task-1.js";
import type { RunRecord } from "../core/types.js";

export type EvidenceCategory =
  | "business"
  | "process"
  | "simulator"
  | "harness";

export interface FailureItem {
  readonly category: EvidenceCategory;
  readonly id: string;
  readonly evidence: string;
}

export interface FailureEvidence {
  readonly caseId: string;
  readonly passed: boolean;
  readonly stopReason: RunRecord["stopReason"];
  readonly failures: readonly FailureItem[];
  readonly visibleMessages: RunRecord["messages"];
  readonly toolEvents: RunRecord["toolEvents"];
  readonly assertions: readonly AssertionResult[];
  readonly tracePath: string;
}

function simulatorFailures(run: RunRecord): FailureItem[] {
  const violations: FailureItem[] = [];
  for (const message of run.messages.filter(({ role }) => role === "user")) {
    if (/my email (?:is|address is)\s+\S+@\S+/i.test(message.content)) {
      violations.push({
        category: "simulator",
        id: "simulator.invented_unknown_email",
        evidence: `${message.id} supplied an email that the scenario marks unknown`,
      });
    }
  }
  if (run.error?.source === "simulator") {
    violations.push({
      category: "simulator",
      id: "simulator.execution_error",
      evidence: run.error.message,
    });
  }
  return violations;
}

function harnessFailures(run: RunRecord): FailureItem[] {
  if (run.error?.source === "harness") {
    return [
      {
        category: "harness",
        id: "harness.execution_error",
        evidence: run.error.message,
      },
    ];
  }
  if (run.stopReason === "max_user_turns") {
    return [
      {
        category: "harness",
        id: "harness.turn_limit",
        evidence: "the conversation reached its user-turn limit",
      },
    ];
  }
  return [];
}

export function buildFailureEvidence(options: {
  readonly caseId: string;
  readonly run: RunRecord;
  readonly evaluation: EvaluationResult;
  readonly tracePath: string;
}): FailureEvidence {
  const { caseId, run, evaluation, tracePath } = options;
  const assertionFailures: FailureItem[] = evaluation.assertions
    .filter(({ passed }) => !passed)
    .map(({ id, category, evidence }) => ({ category, id, evidence }));
  const failures = [
    ...assertionFailures,
    ...simulatorFailures(run),
    ...harnessFailures(run),
  ];
  return {
    caseId,
    passed: failures.length === 0,
    stopReason: run.stopReason,
    failures,
    visibleMessages: run.messages,
    toolEvents: run.toolEvents,
    assertions: evaluation.assertions,
    tracePath,
  };
}
