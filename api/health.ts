import type { IncomingMessage, ServerResponse } from "http";

export default function handler(
  _req: IncomingMessage,
  res: ServerResponse
) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ok: true,
    message: "API is working",
    timestamp: Date.now(),
  }));
}
