// Express + Socket.IO entry point. Serves the static client and the WS layer.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as IOServer } from 'socket.io';
import { attachSocketHandlers } from './socket-handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '..', 'client');

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: '*' },
  pingTimeout: 30_000,
});

app.use(express.static(CLIENT_DIR, { extensions: ['html'] }));
app.get('/health', (_req, res) => res.json({ ok: true, t: Date.now() }));

attachSocketHandlers(io);

const PORT = process.env.PORT || 3000;
// Set ADELINE_BIND_HOST explicitly on container or managed hosts that require ingress.
const HOST = process.env.ADELINE_BIND_HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Adeline server listening on ${HOST}:${PORT}`);
});
