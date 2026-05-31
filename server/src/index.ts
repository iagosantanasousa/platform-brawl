import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { createServer } from 'http';
import { BattleRoom } from './rooms/BattleRoom';

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('battle', BattleRoom);

const PORT = Number(process.env.PORT ?? 4000);
gameServer.listen(PORT).then(() => {
  console.log(`Colyseus server running on port ${PORT}`);
});
