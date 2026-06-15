import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { BattleRoom } from './rooms/BattleRoom';

const app = express();

// Health check — used by cron-job.org to keep the Render free-tier instance awake
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: require('http').createServer(app) }),
});

gameServer.define('battle', BattleRoom);

const PORT = Number(process.env.PORT) || 4000;

gameServer.listen(PORT)
  .then(() => console.log(`[Colyseus] listening on port ${PORT}`))
  .catch((err) => { console.error('[Colyseus] failed to start:', err); process.exit(1); });
