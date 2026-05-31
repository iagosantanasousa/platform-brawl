import { Room, Client } from '@colyseus/core';
import type { CharacterType, MapId, PlayerInput } from 'shared';
import { BattleRoomState } from '../schemas/BattleRoomState';
import { PlayerSchema } from '../schemas/PlayerSchema';
import { addPlayer, removePlayer, applyInput, tick } from '../simulation/ServerPhysics';

const TICK_MS = 20; // 50 Hz
const CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(len = 4) {
  let id = '';
  for (let i = 0; i < len; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)];
  return id;
}

interface JoinOptions {
  characterType: CharacterType;
  mapId?: MapId;
}

export class BattleRoom extends Room<{ state: BattleRoomState }> {
  maxClients = 2;

  private lastTickTime = Date.now();

  onCreate(options: JoinOptions) {
    this.roomId = genCode();
    this.setState(new BattleRoomState());
    this.state.mapId = options.mapId ?? 'arena';

    this.onMessage<PlayerInput>('input', (client, input) => {
      if (this.state.phase !== 'battle') return;
      applyInput(this.state, client.sessionId, input);
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const spawnIndex = this.state.players.size;
    addPlayer(this.state, client.sessionId, options.characterType, spawnIndex);
    console.log(`[BattleRoom] ${client.sessionId} joined (${options.characterType})`);

    if (this.state.players.size === 2) {
      this.startCountdown();
    }
  }

  onLeave(client: Client) {
    removePlayer(this.state, client.sessionId);
    console.log(`[BattleRoom] ${client.sessionId} left`);

    if (this.state.phase === 'battle') {
      this.state.phase = 'finished';
      this.state.players.forEach((p: PlayerSchema, id: string) => {
        if (!p.isDead) this.state.winner = id;
      });
    }
  }

  onDispose() {
    console.log(`[BattleRoom] ${this.roomId} disposed`);
  }

  private startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdown = 3;

    const interval = setInterval(() => {
      this.state.countdown--;
      if (this.state.countdown <= 0) {
        clearInterval(interval);
        this.startBattle();
      }
    }, 1000);
  }

  private startBattle() {
    this.state.phase = 'battle';
    this.lastTickTime = Date.now();

    this.setSimulationInterval(() => {
      const now = Date.now();
      const dt  = (now - this.lastTickTime) / 1000;
      this.lastTickTime = now;

      tick(this.state, dt);
      this.checkWinCondition();
    }, TICK_MS);
  }

  private checkWinCondition() {
    if (this.state.phase !== 'battle') return;

    let aliveCount = 0;
    let lastAlive  = '';
    this.state.players.forEach((p: PlayerSchema, id: string) => {
      if (!p.isDead) { aliveCount++; lastAlive = id; }
    });

    if (aliveCount <= 1 && this.state.players.size === 2) {
      this.state.phase  = 'finished';
      this.state.winner = lastAlive;
    }
  }
}
