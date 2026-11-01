export type MessageRole = "user" | "assistant";

export interface VisibleMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly turn: number;
}

export interface UserScenario {
  readonly id: string;
  readonly version: string;
  readonly goal: string;
  readonly knownFacts: Readonly<Record<string, string>>;
  readonly unknownFacts: readonly string[];
  readonly constraints: readonly string[];
  readonly maxUserTurns: number;
}

export interface SimulatorInput {
  readonly scenario: UserScenario;
  readonly messages: readonly VisibleMessage[];
  readonly userTurn: number;
}

export type SimulatorDecision =
  | {
      readonly kind: "message";
      readonly content: string;
      readonly rationale: string;
    }
  | {
      readonly kind: "stop";
      readonly reason: "completed" | "cannot_continue";
      readonly rationale: string;
    };

export interface UserSimulator {
  readonly name: string;
  next(input: SimulatorInput): Promise<SimulatorDecision>;
}

export interface ToolEvent {
  readonly name: string;
  readonly kind: "read" | "write";
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly result?: unknown;
}

export interface AgentInput {
  readonly messages: readonly VisibleMessage[];
}

export interface AgentTurn {
  readonly content: string;
  readonly toolEvents: readonly ToolEvent[];
}

export interface TargetAgent {
  readonly name: string;
  respond(input: AgentInput): Promise<AgentTurn>;
}

export interface RecordedSimulatorDecision {
  readonly userTurn: number;
  readonly decision: SimulatorDecision;
}

export type RunStopReason =
  | "simulator_completed"
  | "simulator_cannot_continue"
  | "max_user_turns"
  | "simulator_error"
  | "agent_error";

export interface RunError {
  readonly source: "simulator" | "agent";
  readonly message: string;
}

export interface RunRecord {
  readonly scenario: {
    readonly id: string;
    readonly version: string;
  };
  readonly simulator: string;
  readonly agent: string;
  readonly messages: readonly VisibleMessage[];
  readonly simulatorDecisions: readonly RecordedSimulatorDecision[];
  readonly toolEvents: readonly ToolEvent[];
  readonly stopReason: RunStopReason;
  readonly error?: RunError;
}

