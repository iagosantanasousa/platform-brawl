"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@colyseus/core");
const ws_transport_1 = require("@colyseus/ws-transport");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const BattleRoom_1 = require("./rooms/BattleRoom");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
app.use(express_1.default.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
const gameServer = new core_1.Server({
    transport: new ws_transport_1.WebSocketTransport({ server: httpServer }),
});
gameServer.define('battle', BattleRoom_1.BattleRoom);
const PORT = Number(process.env.PORT ?? 4000);
gameServer.listen(PORT).then(() => {
    console.log(`Colyseus server running on port ${PORT}`);
});
