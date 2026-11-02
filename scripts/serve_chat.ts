import { createChatServer } from "../src/browser/chat-server.js";

const host = process.env.CHAT_HOST ?? "127.0.0.1";
const port = Number(process.env.CHAT_PORT ?? "4174");
const server = createChatServer();

server.listen(port, host, () => {
  process.stdout.write(`Task 1 chat ready at http://${host}:${port}\n`);
});

function close(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
