import type { APIRequestContext, Page } from "@playwright/test";

import type { ChatSessionRecord } from "../browser/chat-session.js";
import type { VisibleMessage } from "../core/types.js";

export interface AdapterTurn {
  readonly turnId: string;
  readonly assistantMessage: VisibleMessage;
}

export class PlaywrightChatAdapter {
  constructor(
    private readonly page: Page,
    private readonly request: APIRequestContext,
  ) {}

  async ready(): Promise<void> {
    await this.page.locator("[data-chat-ready='true']").waitFor();
  }

  async sendMessage(content: string): Promise<AdapterTurn> {
    const shell = this.page.locator("[data-chat-shell]");
    const turnId = await shell.getAttribute("data-next-turn-id");
    if (!turnId) throw new Error("chat page did not expose the next turn ID");

    await this.page.getByLabel("Your message").fill(content);
    await this.page.getByRole("button", { name: "Send" }).click();
    const completed = this.page.locator(
      `[data-role="assistant"][data-turn-id="${turnId}"][data-turn-status="complete"]`,
    );
    await completed.waitFor();
    const messageId = await completed.getAttribute("data-message-id");
    const turn = Number(await completed.getAttribute("data-turn-number"));
    return {
      turnId,
      assistantMessage: {
        id: messageId ?? `assistant-${turnId}`,
        role: "assistant",
        content: (await completed.textContent())?.trim() ?? "",
        turn,
      },
    };
  }

  async visibleMessages(): Promise<readonly VisibleMessage[]> {
    return this.page.locator("[data-message-id][data-turn-status='complete']").evaluateAll(
      (nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute("data-message-id") ?? "",
          role: node.getAttribute("data-role") as "user" | "assistant",
          content: node.textContent?.trim() ?? "",
          turn: Number(node.getAttribute("data-turn-number")),
        })),
    );
  }

  async record(): Promise<ChatSessionRecord> {
    const sessionId = await this.page
      .locator("[data-chat-shell]")
      .getAttribute("data-session-id");
    if (!sessionId) throw new Error("chat page did not expose a session ID");
    const response = await this.request.get(
      `/api/sessions/${encodeURIComponent(sessionId)}/record`,
    );
    if (!response.ok()) {
      throw new Error(`failed to read session record: ${response.status()}`);
    }
    return (await response.json()) as ChatSessionRecord;
  }
}
