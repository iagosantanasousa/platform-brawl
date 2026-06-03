import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { BattleRoom } from './rooms/BattleRoom';

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

gameServer.define('battle', BattleRoom);

const PORT = Number(process.env.PORT ?? 4000);

gameServer.listen(PORT)
  .then(() => console.log(`[Colyseus] listening on port ${PORT}`))
  .catch((err) => { console.error('[Colyseus] failed to start:', err); process.exit(1); });
