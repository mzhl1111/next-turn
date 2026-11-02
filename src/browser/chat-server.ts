import { readFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import type { ControlledRetailBehavior } from "../agents/controlled-retail-agent.js";
import { ChatSession } from "./chat-session.js";

const behaviors: readonly ControlledRetailBehavior[] = [
  "correct",
  "correct-question-order",
  "correct-split-questions",
  "wrong-items",
  "claim-without-write",
  "write-before-confirmation",
];

const contentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export interface ChatServerOptions {
  readonly webRoot?: string;
}

export function createChatServer(options: ChatServerOptions = {}): http.Server {
  const webRoot = options.webRoot ?? path.resolve("web/chat");
  const sessions = new Map<string, ChatSession>();

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { status: "ok" });
      }

      if (request.method === "POST" && url.pathname === "/api/sessions") {
        const body = await readJson(request);
        const behavior = body.behavior;
        if (
          typeof behavior !== "string" ||
          !behaviors.includes(behavior as ControlledRetailBehavior)
        ) {
          return sendJson(response, 400, { error: "unknown behavior" });
        }
        const session = new ChatSession(behavior as ControlledRetailBehavior);
        sessions.set(session.sessionId, session);
        return sendJson(response, 201, {
          sessionId: session.sessionId,
          behavior: session.behavior,
        });
      }

      const messageMatch = url.pathname.match(
        /^\/api\/sessions\/([^/]+)\/messages$/,
      );
      if (request.method === "POST" && messageMatch) {
        const session = sessions.get(messageMatch[1] ?? "");
        if (!session) return sendJson(response, 404, { error: "session not found" });
        const body = await readJson(request);
        if (typeof body.turnId !== "string" || typeof body.content !== "string") {
          return sendJson(response, 400, { error: "turnId and content are required" });
        }
        return sendJson(response, 200, await session.send(body.turnId, body.content));
      }

      const recordMatch = url.pathname.match(
        /^\/api\/sessions\/([^/]+)\/record$/,
      );
      if (request.method === "GET" && recordMatch) {
        const session = sessions.get(recordMatch[1] ?? "");
        if (!session) return sendJson(response, 404, { error: "session not found" });
        return sendJson(response, 200, session.record());
      }

      if (request.method !== "GET") {
        return sendJson(response, 405, { error: "method not allowed" });
      }

      const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!/^[a-zA-Z0-9._/-]+$/.test(relativePath) || relativePath.includes("..")) {
        return sendJson(response, 400, { error: "invalid path" });
      }
      const filePath = path.join(webRoot, relativePath);
      try {
        const content = await readFile(filePath);
        response.writeHead(200, {
          "content-type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
        });
        response.end(content);
      } catch {
        sendJson(response, 404, { error: "not found" });
      }
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
