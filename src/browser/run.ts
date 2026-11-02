import type { PlaywrightChatAdapter } from "../adapters/playwright-chat.js";
import type {
  RecordedSimulatorDecision,
  RunError,
  RunRecord,
  RunStopReason,
  UserScenario,
  UserSimulator,
  VisibleMessage,
} from "../core/types.js";

export interface BrowserRunOptions {
  readonly scenario: UserScenario;
  readonly simulator: UserSimulator;
  readonly adapter: PlaywrightChatAdapter;
  readonly agentName: string;
}

export interface BrowserRunResult {
  readonly run: RunRecord;
  readonly turnIds: readonly string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runBrowserConversation(
  options: BrowserRunOptions,
): Promise<BrowserRunResult> {
  const { scenario, simulator, adapter, agentName } = options;
  const simulatorDecisions: RecordedSimulatorDecision[] = [];
  const turnIds: string[] = [];
  let messages: readonly VisibleMessage[] = [];
  let stopReason: RunStopReason = "max_user_turns";
  let error: RunError | undefined;

  try {
    await adapter.ready();
  } catch (cause) {
    stopReason = "harness_error";
    error = { source: "harness", message: errorMessage(cause) };
  }

  if (!error) {
    for (let userTurn = 1; userTurn <= scenario.maxUserTurns; userTurn += 1) {
      let decision;
      try {
        decision = await simulator.next({ scenario, messages, userTurn });
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

      try {
        const turn = await adapter.sendMessage(decision.content);
        turnIds.push(turn.turnId);
        messages = await adapter.visibleMessages();
      } catch (cause) {
        stopReason = "harness_error";
        error = { source: "harness", message: errorMessage(cause) };
        break;
      }
    }
  }

  let toolEvents = [] as RunRecord["toolEvents"];
  if (!error || messages.length > 0) {
    try {
      const record = await adapter.record();
      const visibleRecord = JSON.stringify(record.messages);
      if (visibleRecord !== JSON.stringify(messages)) {
        throw new Error("browser-visible messages differ from the server record");
      }
      toolEvents = record.toolEvents;
    } catch (cause) {
      stopReason = "harness_error";
      error = { source: "harness", message: errorMessage(cause) };
    }
  }

  const base = {
    scenario: { id: scenario.id, version: scenario.version },
    simulator: simulator.name,
    agent: agentName,
    messages,
    simulatorDecisions,
    toolEvents,
    stopReason,
  } satisfies Omit<RunRecord, "error">;
  return {
    run: error ? { ...base, error } : base,
    turnIds,
  };
}
