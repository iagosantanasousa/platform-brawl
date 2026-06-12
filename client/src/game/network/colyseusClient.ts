import { Client } from '@colyseus/sdk';
import type { Room } from '@colyseus/sdk';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:4000';

let client: Client | null = null;

function getClient(): Client {
  if (!client) client = new Client(SERVER_URL);
  return client;
}

export async function createRoom(): Promise<Room> {
  return getClient().create('battle');
}

export async function joinRoom(code: string): Promise<Room> {
  return getClient().joinById(code);
}

export function leaveRoom(room: Room) {
  room.leave();
  client = null;
}
