import { randomUUID } from "node:crypto";

import {
  ControlledRetailAgent,
  type ControlledRetailBehavior,
} from "../agents/controlled-retail-agent.js";
import type {
  RecordedToolEvent,
  TargetAgent,
  VisibleMessage,
} from "../core/types.js";

export interface ChatTurnResult {
  readonly turnId: string;
  readonly status: "complete";
  readonly userMessage: VisibleMessage;
  readonly assistantMessage: VisibleMessage;
}

export interface ChatSessionRecord {
  readonly sessionId: string;
  readonly behavior: ControlledRetailBehavior;
  readonly messages: readonly VisibleMessage[];
  readonly toolEvents: readonly RecordedToolEvent[];
}

export class ChatSession {
  readonly sessionId = randomUUID();
  readonly messages: VisibleMessage[] = [];
  readonly toolEvents: RecordedToolEvent[] = [];
  private readonly seenTurnIds = new Set<string>();
  private nextTurn = 1;

  constructor(
    readonly behavior: ControlledRetailBehavior,
    private readonly agent: TargetAgent = new ControlledRetailAgent(behavior),
  ) {}

  async send(turnId: string, content: string): Promise<ChatTurnResult> {
    if (!turnId || this.seenTurnIds.has(turnId)) {
      throw new Error(`turn ID must be non-empty and unique: ${turnId}`);
    }
    if (!content.trim()) throw new Error("message content must not be empty");

    const turn = this.nextTurn;
    this.nextTurn += 1;
    this.seenTurnIds.add(turnId);
    const userMessage: VisibleMessage = {
      id: `user-${turnId}`,
      role: "user",
      content: content.trim(),
      turn,
    };
    this.messages.push(userMessage);

    const response = await this.agent.respond({ messages: [...this.messages] });
    const assistantMessage: VisibleMessage = {
      id: `assistant-${turnId}`,
      role: "assistant",
      content: response.content,
      turn,
    };
    this.messages.push(assistantMessage);
    for (const event of response.toolEvents) {
      this.toolEvents.push({
        ...event,
        sequence: this.toolEvents.length + 1,
        assistantTurn: turn,
      });
    }

    return { turnId, status: "complete", userMessage, assistantMessage };
  }

  record(): ChatSessionRecord {
    return {
      sessionId: this.sessionId,
      behavior: this.behavior,
      messages: [...this.messages],
      toolEvents: [...this.toolEvents],
    };
  }
}
