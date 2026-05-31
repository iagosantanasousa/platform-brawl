import type { Socket, Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, CharacterType, MapId } from '../../shared/src/index';
import { ServerGameState } from './gameState';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

interface Room {
  id: string;
  mapId: MapId;
  players: Map<string, { socket: GameSocket; characterType: CharacterType }>;
  gameState: ServerGameState;
  started: boolean;
}

const rooms = new Map<string, Room>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function registerRoomHandlers(io: GameServer, socket: GameSocket) {
  socket.on('room:create', ({ characterType, mapId }) => {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) roomId = generateRoomId();

    const gameState = new ServerGameState(roomId, mapId, (state) => {
      io.to(roomId).emit('game:state', state);
    });

    const room: Room = {
      id: roomId,
      mapId,
      players: new Map(),
      gameState,
      started: false,
    };
    rooms.set(roomId, room);

    room.players.set(socket.id, { socket, characterType });
    gameState.addPlayer(socket.id, characterType, 0);
    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.emit('room:joined', { roomId, playerId: socket.id, mapId });
    console.log(`Room ${roomId} created by ${socket.id}`);
  });

  socket.on('room:join', ({ roomId, characterType }) => {
    const room = rooms.get(roomId.toUpperCase());

    if (!room) {
      socket.emit('room:error', { message: 'Sala não encontrada.' });
      return;
    }
    if (room.players.size >= 2) {
      socket.emit('room:error', { message: 'Sala cheia.' });
      return;
    }

    const spawnIdx = room.players.size;
    room.players.set(socket.id, { socket, characterType });
    room.gameState.addPlayer(socket.id, characterType, spawnIdx);
    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.emit('room:joined', { roomId, playerId: socket.id, mapId: room.mapId });

    if (room.players.size === 2 && !room.started) {
      room.started = true;
      room.gameState.start();
      console.log(`Room ${roomId} started`);
    }
  });

  socket.on('player:input', (input) => {
    const roomId = socket.data.roomId as string | undefined;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    room.gameState.applyInput(socket.id, input);
  });

  socket.on('room:leave', () => handleLeave(socket));
  socket.on('disconnect', () => handleLeave(socket));
}

function handleLeave(socket: GameSocket) {
  const roomId = socket.data.roomId as string | undefined;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.players.delete(socket.id);
  room.gameState.removePlayer(socket.id);
  socket.leave(roomId);
  socket.data.roomId = undefined;

  if (room.players.size === 0) {
    room.gameState.stop();
    rooms.delete(roomId);
    console.log(`Room ${roomId} closed`);
  }
}
