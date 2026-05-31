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
exports.PlayerSchema = void 0;
const schema_1 = require("@colyseus/schema");
class PlayerSchema extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = '';
        this.characterType = 'fighter';
        this.x = 0;
        this.y = 0;
        this.velocityX = 0;
        this.velocityY = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.facing = 'right';
        this.isGrounded = false;
        this.jumpsUsed = 0;
        this.attackCooldown = 0;
        this.isDead = false;
        this.knockbackX = 0;
    }
}
exports.PlayerSchema = PlayerSchema;
__decorate([
    (0, schema_1.type)('string'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)('string'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "characterType", void 0);
__decorate([
    (0, schema_1.type)('float32'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)('float32'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)('float32'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "velocityX", void 0);
__decorate([
    (0, schema_1.type)('float32'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "velocityY", void 0);
__decorate([
    (0, schema_1.type)('int16'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "hp", void 0);
__decorate([
    (0, schema_1.type)('int16'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "maxHp", void 0);
__decorate([
    (0, schema_1.type)('string'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "facing", void 0);
__decorate([
    (0, schema_1.type)('boolean'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "isGrounded", void 0);
__decorate([
    (0, schema_1.type)('uint8'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "jumpsUsed", void 0);
__decorate([
    (0, schema_1.type)('int32'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "attackCooldown", void 0);
__decorate([
    (0, schema_1.type)('boolean'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "isDead", void 0);
__decorate([
    (0, schema_1.type)('float32'),
    __metadata("design:type", Object)
], PlayerSchema.prototype, "knockbackX", void 0);
