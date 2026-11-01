import type {
  SimulatorDecision,
  SimulatorInput,
  UserSimulator,
} from "../core/types.js";

export class FixedReplaySimulator implements UserSimulator {
  readonly name = "fixed-replay";

  constructor(private readonly turns: readonly string[]) {
    if (turns.length === 0) {
      throw new Error("fixed replay requires at least one user turn");
    }
  }

  async next(input: SimulatorInput): Promise<SimulatorDecision> {
    const content = this.turns[input.userTurn - 1];
    if (content === undefined) {
      return {
        kind: "stop",
        reason: "completed",
        rationale: "all recorded user turns were replayed",
      };
    }

    return {
      kind: "message",
      content,
      rationale: `replayed recorded user turn ${input.userTurn}`,
    };
  }
}

