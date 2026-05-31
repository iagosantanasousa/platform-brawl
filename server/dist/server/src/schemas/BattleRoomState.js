"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BattleRoomState = void 0;
const schema_1 = require("@colyseus/schema");
const PlayerSchema_1 = require("./PlayerSchema");
const ProjectileSchema_1 = require("./ProjectileSchema");
class BattleRoomState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.mapId = 'arena';
        this.phase = 'waiting'; // waiting | countdown | battle | finished
        this.winner = '';
        this.countdown = 0;
        this.tick = 0;
        this.players = new schema_1.MapSchema();
        this.projectiles = new schema_1.MapSchema();
    }
}
exports.BattleRoomState = BattleRoomState;
__decorate([
    (0, schema_1.type)('string'),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "mapId", void 0);
__decorate([
    (0, schema_1.type)('string'),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "phase", void 0);
__decorate([
    (0, schema_1.type)('string'),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "winner", void 0);
__decorate([
    (0, schema_1.type)('uint8'),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "countdown", void 0);
__decorate([
    (0, schema_1.type)('int32'),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "tick", void 0);
__decorate([
    (0, schema_1.type)({ map: PlayerSchema_1.PlayerSchema }),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)({ map: ProjectileSchema_1.ProjectileSchema }),
    __metadata("design:type", Object)
], BattleRoomState.prototype, "projectiles", void 0);
