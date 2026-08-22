import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

let wss: WebSocketServer | null = null;

export function setupWebSockets(server: http.Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[api] WebSocket connected');
    ws.on('message', (message) => {
      console.log('[api] Received message:', message.toString());
    });
  });
}

export function broadcast(topic: string, data: any) {
  if (!wss) return;
  const payload = JSON.stringify({ topic, data });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}
