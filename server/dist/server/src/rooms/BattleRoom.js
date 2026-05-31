"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattleRoom = void 0;
const core_1 = require("@colyseus/core");
const BattleRoomState_1 = require("../schemas/BattleRoomState");
const ServerPhysics_1 = require("../simulation/ServerPhysics");
const TICK_MS = 20; // 50 Hz
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(len = 4) {
    let id = '';
    for (let i = 0; i < len; i++)
        id += CHARS[Math.floor(Math.random() * CHARS.length)];
    return id;
}
class BattleRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 2;
        this.lastTickTime = Date.now();
    }
    onCreate(options) {
        this.roomId = genCode();
        this.setState(new BattleRoomState_1.BattleRoomState());
        this.state.mapId = options.mapId ?? 'arena';
        this.onMessage('input', (client, input) => {
            if (this.state.phase !== 'battle')
                return;
            (0, ServerPhysics_1.applyInput)(this.state, client.sessionId, input);
        });
    }
    onJoin(client, options) {
        const spawnIndex = this.state.players.size;
        (0, ServerPhysics_1.addPlayer)(this.state, client.sessionId, options.characterType, spawnIndex);
        console.log(`[BattleRoom] ${client.sessionId} joined (${options.characterType})`);
        if (this.state.players.size === 2) {
            this.startCountdown();
        }
    }
    onLeave(client) {
        (0, ServerPhysics_1.removePlayer)(this.state, client.sessionId);
        console.log(`[BattleRoom] ${client.sessionId} left`);
        if (this.state.phase === 'battle') {
            this.state.phase = 'finished';
            this.state.players.forEach((p, id) => {
                if (!p.isDead)
                    this.state.winner = id;
            });
        }
    }
    onDispose() {
        console.log(`[BattleRoom] ${this.roomId} disposed`);
    }
    startCountdown() {
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
    startBattle() {
        this.state.phase = 'battle';
        this.lastTickTime = Date.now();
        this.setSimulationInterval(() => {
            const now = Date.now();
            const dt = (now - this.lastTickTime) / 1000;
            this.lastTickTime = now;
            (0, ServerPhysics_1.tick)(this.state, dt);
            this.checkWinCondition();
        }, TICK_MS);
    }
    checkWinCondition() {
        if (this.state.phase !== 'battle')
            return;
        let aliveCount = 0;
        let lastAlive = '';
        this.state.players.forEach((p, id) => {
            if (!p.isDead) {
                aliveCount++;
                lastAlive = id;
            }
        });
        if (aliveCount <= 1 && this.state.players.size === 2) {
            this.state.phase = 'finished';
            this.state.winner = lastAlive;
        }
    }
}
exports.BattleRoom = BattleRoom;
