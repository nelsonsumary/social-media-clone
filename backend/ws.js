import { WebSocketServer } from "ws";

const clients = new Map();

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const userId = url.searchParams.get("userId");
    if (!userId) { ws.close(); return; }

    clients.set(userId, ws);

    ws.on("close", () => {
      if (clients.get(userId) === ws) clients.delete(userId);
    });
  });

  return wss;
}

export function sendToUser(userId, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}
