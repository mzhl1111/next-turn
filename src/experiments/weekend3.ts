import type { ControlledRetailBehavior } from "../agents/controlled-retail-agent.js";

export type ExperimentInputType = "fixed" | "dynamic";
export type ExperimentOutcome =
  | "true-positive"
  | "true-negative"
  | "false-positive"
  | "false-negative";

export interface ExperimentConfiguration {
  readonly id: string;
  readonly behavior: ControlledRetailBehavior;
  readonly expectedPass: boolean;
}

export const weekend3Configurations: readonly ExperimentConfiguration[] = [
  { id: "normal", behavior: "correct", expectedPass: true },
  {
    id: "question-order",
    behavior: "correct-question-order",
    expectedPass: true,
  },
  {
    id: "split-questions",
    behavior: "correct-split-questions",
    expectedPass: true,
  },
  { id: "wrong-items", behavior: "wrong-items", expectedPass: false },
  {
    id: "claim-without-write",
    behavior: "claim-without-write",
    expectedPass: false,
  },
  {
    id: "write-before-confirmation",
    behavior: "write-before-confirmation",
    expectedPass: false,
  },
];

export interface ExperimentRunSummary {
  readonly id: string;
  readonly inputType: ExperimentInputType;
  readonly configurationId: string;
  readonly repetition: number;
  readonly expectedPass: boolean;
  readonly observedPass: boolean;
  readonly outcome: ExperimentOutcome;
  readonly simulatorViolation: boolean;
  readonly durationMs: number;
  readonly costUsd: number;
  readonly evidencePath: string;
  readonly tracePath: string;
}

export interface ExperimentAggregate {
  readonly runs: number;
  readonly successes: number;
  readonly truePositives: number;
  readonly trueNegatives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly correctPathPasses: number;
  readonly correctPathRuns: number;
  readonly errorDetections: number;
  readonly errorRuns: number;
  readonly simulatorViolations: number;
  readonly durationMs: number;
  readonly costUsd: number;
}

export interface Weekend3Summary {
  readonly totals: ExperimentAggregate;
  readonly byInput: Readonly<Record<ExperimentInputType, ExperimentAggregate>>;
  readonly byConfiguration: Readonly<Record<string, ExperimentAggregate>>;
}

export function classifyExperimentOutcome(
  expectedPass: boolean,
  observedPass: boolean,
): ExperimentOutcome {
  if (expectedPass) return observedPass ? "true-positive" : "false-negative";
  return observedPass ? "false-positive" : "true-negative";
}

function aggregate(runs: readonly ExperimentRunSummary[]): ExperimentAggregate {
  return {
    runs: runs.length,
    successes: runs.filter(({ observedPass }) => observedPass).length,
    truePositives: runs.filter(({ outcome }) => outcome === "true-positive").length,
    trueNegatives: runs.filter(({ outcome }) => outcome === "true-negative").length,
    falsePositives: runs.filter(({ outcome }) => outcome === "false-positive").length,
    falseNegatives: runs.filter(({ outcome }) => outcome === "false-negative").length,
    correctPathPasses: runs.filter(
      ({ expectedPass, observedPass }) => expectedPass && observedPass,
    ).length,
    correctPathRuns: runs.filter(({ expectedPass }) => expectedPass).length,
    errorDetections: runs.filter(
      ({ expectedPass, observedPass }) => !expectedPass && !observedPass,
    ).length,
    errorRuns: runs.filter(({ expectedPass }) => !expectedPass).length,
    simulatorViolations: runs.filter(({ simulatorViolation }) => simulatorViolation)
      .length,
    durationMs: runs.reduce((total, run) => total + run.durationMs, 0),
    costUsd: runs.reduce((total, run) => total + run.costUsd, 0),
  };
}

export function summarizeWeekend3(
  runs: readonly ExperimentRunSummary[],
): Weekend3Summary {
  const byInput = Object.fromEntries(
    (["fixed", "dynamic"] satisfies ExperimentInputType[]).map((inputType) => [
      inputType,
      aggregate(runs.filter((run) => run.inputType === inputType)),
    ]),
  ) as unknown as Record<ExperimentInputType, ExperimentAggregate>;
  const byConfiguration = Object.fromEntries(
    weekend3Configurations.map(({ id }) => [
      id,
      aggregate(runs.filter(({ configurationId }) => configurationId === id)),
    ]),
  );
  return { totals: aggregate(runs), byInput, byConfiguration };
}
