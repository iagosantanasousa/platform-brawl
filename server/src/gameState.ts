import type {
  GameState,
  PlayerState,
  ProjectileState,
  PlayerInput,
  MapId,
  CharacterType,
} from '../../shared/src/index';
import { CHARACTER_CONFIGS } from '../../shared/src/index';
import { MAP_CONFIGS } from '../../shared/src/index';

const TICK_RATE = 20; // ms per tick (50 ticks/s)
const GRAVITY = 900;

let projCounter = 0;

function nextProjId() {
  return `p${++projCounter}`;
}

export class ServerGameState {
  state: GameState;
  private lastTick = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onUpdate: (state: GameState) => void;

  constructor(roomId: string, mapId: MapId, onUpdate: (state: GameState) => void) {
    this.onUpdate = onUpdate;
    this.state = {
      roomId,
      mapId,
      players: {},
      projectiles: {},
      tick: 0,
    };
  }

  addPlayer(id: string, characterType: CharacterType, spawnIndex: number) {
    const cfg = CHARACTER_CONFIGS[characterType];
    const map = MAP_CONFIGS[this.state.mapId];
    const spawn = map.spawnPoints[spawnIndex % map.spawnPoints.length];

    this.state.players[id] = {
      id,
      characterType,
      x: spawn.x,
      y: spawn.y,
      velocityX: 0,
      velocityY: 0,
      hp: cfg.hp,
      maxHp: cfg.hp,
      facing: spawnIndex === 0 ? 'right' : 'left',
      isGrounded: false,
      jumpsUsed: 0,
      attackCooldown: 0,
      isDead: false,
      knockbackX: 0,
      knockbackY: 0,
    };
  }

  removePlayer(id: string) {
    delete this.state.players[id];
  }

  applyInput(playerId: string, input: PlayerInput) {
    const player = this.state.players[playerId];
    if (!player || player.isDead) return;

    const cfg = CHARACTER_CONFIGS[player.characterType];
    const now = Date.now();
    const dt = TICK_RATE / 1000;

    // Horizontal movement
    if (input.left) {
      player.velocityX = -cfg.speed;
      player.facing = 'left';
    } else if (input.right) {
      player.velocityX = cfg.speed;
      player.facing = 'right';
    } else {
      player.velocityX *= 0.7; // friction
    }

    // Jump (double jump allowed)
    if (input.jump && player.jumpsUsed < 2) {
      player.velocityY = cfg.jumpForce;
      player.isGrounded = false;
      player.jumpsUsed++;
    }

    // Attack
    if (input.attack && player.attackCooldown <= 0) {
      player.attackCooldown = cfg.attackCooldown;
      this.resolveAttack(player);
    }

    // Apply knockback decay
    if (Math.abs(player.knockbackX) > 1) {
      player.velocityX += player.knockbackX;
      player.knockbackX *= 0.5;
    } else {
      player.knockbackX = 0;
    }
  }

  private resolveAttack(attacker: PlayerState) {
    const cfg = CHARACTER_CONFIGS[attacker.characterType];

    if (cfg.isRanged) {
      const id = nextProjId();
      const speed = cfg.projectileSpeed ?? 600;
      this.state.projectiles[id] = {
        id,
        ownerId: attacker.id,
        x: attacker.x,
        y: attacker.y - 10,
        velocityX: attacker.facing === 'right' ? speed : -speed,
        velocityY: 0,
        damage: cfg.attackDamage,
      };
      return;
    }

    // Melee: check each player
    for (const target of Object.values(this.state.players)) {
      if (target.id === attacker.id || target.isDead) continue;

      const dx = target.x - attacker.x;
      const dist = Math.abs(dx);
      const dirMatch = attacker.facing === 'right' ? dx > 0 : dx < 0;

      if (dist <= cfg.attackRange && dirMatch) {
        this.applyDamage(target, attacker, cfg.attackDamage, cfg.knockbackForce);
      }
    }
  }

  private applyDamage(target: PlayerState, attacker: PlayerState, damage: number, knockback: number) {
    if (target.isDead) return;
    target.hp = Math.max(0, target.hp - damage);

    const dir = target.x > attacker.x ? 1 : -1;
    target.knockbackX = dir * knockback * 0.3;
    target.velocityY = -250;

    if (target.hp <= 0) {
      target.isDead = true;
      target.velocityX = 0;
      target.velocityY = 0;
    }
  }

  start() {
    this.lastTick = Date.now();
    this.intervalId = setInterval(() => this.tick(), TICK_RATE);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.state.tick++;

    const map = MAP_CONFIGS[this.state.mapId];

    // Update players
    for (const player of Object.values(this.state.players)) {
      if (player.isDead) continue;

      // Gravity
      player.velocityY += GRAVITY * dt;

      // Move
      player.x += player.velocityX * dt;
      player.y += player.velocityY * dt;

      // Attack cooldown
      if (player.attackCooldown > 0) player.attackCooldown -= TICK_RATE;

      // Platform collision (simple AABB)
      player.isGrounded = false;
      const cfg = CHARACTER_CONFIGS[player.characterType];
      const pw = cfg.width / 2;
      const ph = cfg.height / 2;

      for (const plat of map.platforms) {
        const platRight = plat.x + plat.width;
        const platBottom = plat.y + plat.height;

        const overlapX = player.x + pw > plat.x && player.x - pw < platRight;
        const overlapY = player.y + ph > plat.y && player.y - ph < platBottom;

        if (overlapX && overlapY) {
          // Landing on top
          if (
            player.velocityY >= 0 &&
            player.y - ph < plat.y &&
            player.y + ph >= plat.y
          ) {
            player.y = plat.y - ph;
            player.velocityY = 0;
            player.isGrounded = true;
          }
          // Hitting bottom
          else if (
            player.velocityY < 0 &&
            player.y + ph > platBottom &&
            player.y - ph <= platBottom
          ) {
            player.y = platBottom + ph;
            player.velocityY = 0;
          }
          // Hitting left wall
          else if (player.velocityX > 0 && player.x - pw < plat.x) {
            player.x = plat.x - pw;
            player.velocityX = 0;
          }
          // Hitting right wall
          else if (player.velocityX < 0 && player.x + pw > platRight) {
            player.x = platRight + pw;
            player.velocityX = 0;
          }
        }
      }

      // Reset double jump on landing
      if (player.isGrounded) player.jumpsUsed = 0;

      // World bounds
      if (player.x - pw < 0) { player.x = pw; player.velocityX = 0; }
      if (player.x + pw > map.width) { player.x = map.width - pw; player.velocityX = 0; }

      // Fall out of bounds → respawn
      if (player.y > map.height + 50) {
        this.respawnPlayer(player);
      }
    }

    // Update projectiles
    for (const [id, proj] of Object.entries(this.state.projectiles)) {
      proj.x += proj.velocityX * dt;
      proj.y += proj.velocityY * dt;

      // Check wall collision
      if (proj.x < 0 || proj.x > map.width || proj.y < 0 || proj.y > map.height) {
        delete this.state.projectiles[id];
        continue;
      }

      // Check platform collision
      let hitPlatform = false;
      for (const plat of map.platforms) {
        if (
          proj.x > plat.x && proj.x < plat.x + plat.width &&
          proj.y > plat.y && proj.y < plat.y + plat.height
        ) {
          hitPlatform = true;
          break;
        }
      }
      if (hitPlatform) { delete this.state.projectiles[id]; continue; }

      // Check player hit
      for (const player of Object.values(this.state.players)) {
        if (player.id === proj.ownerId || player.isDead) continue;
        const cfg = CHARACTER_CONFIGS[player.characterType];
        const dx = Math.abs(proj.x - player.x);
        const dy = Math.abs(proj.y - player.y);
        if (dx < cfg.width / 2 + 8 && dy < cfg.height / 2 + 8) {
          const attacker = this.state.players[proj.ownerId];
          const kbForce = attacker ? CHARACTER_CONFIGS[attacker.characterType].knockbackForce : 200;
          this.applyDamage(player, { x: proj.x, y: proj.y } as PlayerState, proj.damage, kbForce);
          delete this.state.projectiles[id];
          break;
        }
      }
    }

    this.onUpdate(this.state);
  }

  private respawnPlayer(player: PlayerState) {
    const map = MAP_CONFIGS[this.state.mapId];
    const idx = Object.keys(this.state.players).indexOf(player.id);
    const spawn = map.spawnPoints[idx % map.spawnPoints.length];
    const cfg = CHARACTER_CONFIGS[player.characterType];

    player.x = spawn.x;
    player.y = spawn.y - 50;
    player.velocityX = 0;
    player.velocityY = 0;
    player.hp = cfg.hp;
    player.isDead = false;
    player.attackCooldown = 0;
    player.jumpsUsed = 0;
    player.knockbackX = 0;
  }
}
