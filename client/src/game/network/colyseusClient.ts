import { Client } from 'colyseus.js';
import type { Room } from 'colyseus.js';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL ?? 'ws://localhost:4000';

let client: Client | null = null;

function getClient(): Client {
  if (!client) client = new Client(SERVER_URL);
  return client;
}

// Colyseus.js 0.16 espera { room: { name, roomId }, sessionId, ... }
// mas o servidor 0.17 retorna { name, roomId, sessionId, ... } direto.
// Fazemos o fetch manual e transformamos a resposta.
async function fetchMatchmaker(path: string, body: object = {}): Promise<Room> {
  const httpUrl = SERVER_URL.replace(/^ws/, 'http');
  const res = await fetch(`${httpUrl}/matchmake/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();

  // Encapsula no formato que o cliente 0.16 espera
  const reservation = { room: data, ...data };
  return getClient().consumeSeatReservation(reservation) as Promise<Room>;
}

export async function createRoom(): Promise<Room> {
  return fetchMatchmaker('create/battle');
}

export async function joinRoom(code: string): Promise<Room> {
  return fetchMatchmaker(`joinById/${code}`);
}

export function leaveRoom(room: Room) {
  room.leave();
  client = null;
}
