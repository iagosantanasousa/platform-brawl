import { Client, Room } from 'colyseus.js';
import type { CharacterType, MapId } from 'shared';

// Mirrors BattleRoomState fields for client-side type safety
export interface RemotePlayerState {
  id: string;
  characterType: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  hp: number;
  maxHp: number;
  facing: string;
  isGrounded: boolean;
  jumpsUsed: number;
  attackCooldown: number;
  isDead: boolean;
  knockbackX: number;
}

export interface RemoteProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
}

export interface RemoteBattleState {
  mapId: string;
  phase: string;
  winner: string;
  countdown: number;
  tick: number;
  players: { forEach: (cb: (v: RemotePlayerState, k: string) => void) => void };
  projectiles: { forEach: (cb: (v: RemoteProjectileState, k: string) => void) => void };
}

const RAW_URL = (import.meta as any).env?.VITE_SERVER_URL ?? 'wss://platform-brawl-server.onrender.com';
const HTTP_URL = RAW_URL.replace(/^ws(s?)/, 'http$1');

class ColyseusClientWrapper {
  private client = new Client(RAW_URL);
  private room: Room<RemoteBattleState> | null = null;

  async createRoom(characterType: CharacterType, mapId: MapId): Promise<Room<RemoteBattleState>> {
    const raw = await this.fetchMatchmaker('create', 'battle', { characterType, mapId });
    this.room = await (this.client as any).consumeSeatReservation(
      this.toV016Format(raw),
    ) as Room<RemoteBattleState>;
    return this.room;
  }

  async joinRoom(roomId: string, characterType: CharacterType): Promise<Room<RemoteBattleState>> {
    const raw = await this.fetchMatchmaker('joinById', roomId, { characterType });
    this.room = await (this.client as any).consumeSeatReservation(
      this.toV016Format(raw),
    ) as Room<RemoteBattleState>;
    return this.room;
  }

  getRoom(): Room<RemoteBattleState> | null {
    return this.room;
  }

  async leave() {
    if (this.room) {
      await this.room.leave();
      this.room = null;
    }
  }

  // Direct matchmaker fetch — bypasses colyseus.js internal HTTP so we can
  // intercept the response before consumeSeatReservation reads it.
  private async fetchMatchmaker(method: string, roomName: string, options: object) {
    const res = await fetch(`${HTTP_URL}/matchmake/${method}/${roomName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(options),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
    return data;
  }

  // Colyseus 0.17 server returns flat { name, roomId, sessionId, processId }.
  // colyseus.js 0.16 consumeSeatReservation expects { room: { name, roomId, ... }, sessionId }.
  private toV016Format(raw: any) {
    return {
      room: {
        name:          raw.name,
        roomId:        raw.roomId,
        processId:     raw.processId,
        publicAddress: raw.publicAddress,
      },
      sessionId:        raw.sessionId,
      reconnectionToken: raw.reconnectionToken,
      devMode:          raw.devMode,
      protocol:         raw.protocol,
    };
  }
}

export const colyseusClient = new ColyseusClientWrapper();
