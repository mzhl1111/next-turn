import type {
  RunError,
  RunRecord,
  RunStopReason,
  RecordedToolEvent,
  TargetAgent,
  UserScenario,
  UserSimulator,
  VisibleMessage,
  RecordedSimulatorDecision,
} from "./types.js";

export interface RunOptions {
  readonly scenario: UserScenario;
  readonly simulator: UserSimulator;
  readonly agent: TargetAgent;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runConversation(options: RunOptions): Promise<RunRecord> {
  const { scenario, simulator, agent } = options;
  const messages: VisibleMessage[] = [];
  const simulatorDecisions: RecordedSimulatorDecision[] = [];
  const toolEvents: RecordedToolEvent[] = [];
  let stopReason: RunStopReason = "max_user_turns";
  let error: RunError | undefined;

  for (let userTurn = 1; userTurn <= scenario.maxUserTurns; userTurn += 1) {
    let decision;
    try {
      decision = await simulator.next({
        scenario,
        messages: [...messages],
        userTurn,
      });
    } catch (cause) {
      stopReason = "simulator_error";
      error = { source: "simulator", message: errorMessage(cause) };
      break;
    }

    simulatorDecisions.push({ userTurn, decision });
    if (decision.kind === "stop") {
      stopReason =
        decision.reason === "completed"
          ? "simulator_completed"
          : "simulator_cannot_continue";
      break;
    }

    messages.push({
      id: `user-${userTurn}`,
      role: "user",
      content: decision.content,
      turn: userTurn,
    });

    let response;
    try {
      response = await agent.respond({ messages: [...messages] });
    } catch (cause) {
      stopReason = "agent_error";
      error = { source: "agent", message: errorMessage(cause) };
      break;
    }

    messages.push({
      id: `assistant-${userTurn}`,
      role: "assistant",
      content: response.content,
      turn: userTurn,
    });
    for (const event of response.toolEvents) {
      toolEvents.push({
        ...event,
        sequence: toolEvents.length + 1,
        assistantTurn: userTurn,
      });
    }
  }

  const base = {
    scenario: { id: scenario.id, version: scenario.version },
    simulator: simulator.name,
    agent: agent.name,
    messages,
    simulatorDecisions,
    toolEvents,
    stopReason,
  } satisfies Omit<RunRecord, "error">;

  return error === undefined ? base : { ...base, error };
}
