import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { URL } from 'url';
import { verifyAccessToken } from '@kapmeta/auth';

const JWT_SECRET: string = process.env.JWT_SECRET || "dev_jwt_secret_key_minimum_32_characters_long";

type OutletSocket = WebSocket & { outletId?: string };

let wss: WebSocketServer | null = null;

export function setupWebSockets(server: http.Server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url || '', 'http://internal');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== '/ws') return; // not ours; leave for other upgrade handlers

    const token = url.searchParams.get('token') || '';
    const claims = token ? verifyAccessToken(token, JWT_SECRET) : null;
    const outletId = claims?.outletIds?.[0];
    if (!claims || !outletId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, (ws) => {
      (ws as OutletSocket).outletId = outletId;
      wss!.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: OutletSocket) => {
    console.log(`[api] WebSocket connected (outlet ${ws.outletId})`);
    ws.on('message', (message) => {
      console.log('[api] Received message:', message.toString());
    });
  });
}

export function broadcast(outletId: string, topic: string, data: any) {
  if (!wss) return;
  const payload = JSON.stringify({ topic, data });
  for (const client of wss.clients as Set<OutletSocket>) {
    if (client.readyState === WebSocket.OPEN && client.outletId === outletId) {
      client.send(payload);
    }
  }
}
