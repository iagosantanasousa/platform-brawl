import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { BattleRoom } from './rooms/BattleRoom';

const gameServer = new Server({
  transport: new WebSocketTransport(),
  // Let Colyseus own the HTTP server so /matchmake/* routes bind correctly.
  // Custom routes are added here via the express callback.
  express: async (app) => {
    app.get('/health', (_req: any, res: any) => res.json({ ok: true }));
  },
});

gameServer.define('battle', BattleRoom);

const PORT = Number(process.env.PORT ?? 4000);
gameServer.listen(PORT).then(() => {
  console.log(`Colyseus server running on port ${PORT}`);
});
