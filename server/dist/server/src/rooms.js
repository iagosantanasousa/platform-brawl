"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoomHandlers = registerRoomHandlers;
const gameState_1 = require("./gameState");
const rooms = new Map();
function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++)
        id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}
function registerRoomHandlers(io, socket) {
    socket.on('room:create', ({ characterType, mapId }) => {
        let roomId = generateRoomId();
        while (rooms.has(roomId))
            roomId = generateRoomId();
        const gameState = new gameState_1.ServerGameState(roomId, mapId, (state) => {
            io.to(roomId).emit('game:state', state);
        });
        const room = {
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
        const roomId = socket.data.roomId;
        if (!roomId)
            return;
        const room = rooms.get(roomId);
        if (!room || !room.started)
            return;
        room.gameState.applyInput(socket.id, input);
    });
    socket.on('room:leave', () => handleLeave(socket));
    socket.on('disconnect', () => handleLeave(socket));
}
function handleLeave(socket) {
    const roomId = socket.data.roomId;
    if (!roomId)
        return;
    const room = rooms.get(roomId);
    if (!room)
        return;
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
