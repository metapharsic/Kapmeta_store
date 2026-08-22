import http from 'http';
import { createApp } from './app';
import { setupWebSockets } from './websockets';

const app = createApp();

const server = http.createServer(app);
setupWebSockets(server);

// Real API Gateway port per brain/SYSTEM_ARCHITECTURE.md and .env (API_PORT).
// NOTE: PORT in .env (4444) belongs to apps/pos-web, not this service — do
// not fall back to it here.
const port = Number(process.env.API_PORT ?? 4001);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Kapmeta API listening on port ${port}`);
});
