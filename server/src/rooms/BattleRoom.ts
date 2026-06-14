import { Room, Client } from '@colyseus/core';
import type { CharacterType, MapId, PlayerInput } from 'shared';
import { CHARACTER_CONFIGS, MAP_CONFIGS } from 'shared';
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
  characterType?: CharacterType;
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
      // Push state immediately on attacks/combos so the opponent sees the hit
      // without waiting up to one full tick (20 ms) for the next scheduled patch.
      if (input.attack || input.combo) {
        this.broadcastPatch();
      }
    });

    this.onMessage<{ team: 'A' | 'B' }>('select_team', (client, { team }) => {
      if (this.state.phase !== 'waiting') return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // bloqueia se o time já tem alguém
      let taken = false;
      this.state.players.forEach((p: PlayerSchema, id: string) => {
        if (id !== client.sessionId && p.team === team) taken = true;
      });
      if (taken) return;

      player.team    = team;
      player.isReady = false;
    });

    this.onMessage<{ characterType: CharacterType }>('select_character', (client, { characterType }) => {
      if (this.state.phase !== 'waiting') return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const cfg = CHARACTER_CONFIGS[characterType];
      if (!cfg) return;

      player.characterType = characterType;
      player.hp            = cfg.hp;
      player.maxHp         = cfg.hp;
      player.isReady       = false;
    });

    this.onMessage('player_ready', (client) => {
      if (this.state.phase !== 'waiting') return;
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.team) return; // precisa ter time escolhido

      player.isReady = true;
      this.tryStartCountdown();
    });

    this.onMessage('unready', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.isReady = false;
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const spawnIndex = this.state.players.size;
    addPlayer(this.state, client.sessionId, options.characterType ?? 'fighter', spawnIndex);
    console.log(`[BattleRoom] ${client.sessionId} joined (${options.characterType ?? 'fighter'})`);
    // NÃO inicia o jogo automaticamente — espera os dois ficarem prontos
  }

  onLeave(client: Client) {
    removePlayer(this.state, client.sessionId);
    console.log(`[BattleRoom] ${client.sessionId} left`);

    if (this.state.phase === 'battle' || this.state.phase === 'countdown') {
      this.state.phase = 'finished';
      this.state.players.forEach((p: PlayerSchema, id: string) => {
        if (!p.isDead) this.state.winner = id;
      });
    }
  }

  onDispose() {
    console.log(`[BattleRoom] ${this.roomId} disposed`);
  }

  private tryStartCountdown() {
    if (this.state.players.size < 2) return;

    let allReady = true;
    const teams = new Set<string>();
    this.state.players.forEach((p: PlayerSchema) => {
      if (!p.isReady || !p.team) allReady = false;
      teams.add(p.team);
    });

    // todos prontos e times distintos (A e B)
    if (allReady && teams.size === 2 && !teams.has('')) {
      this.startCountdown();
    }
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
