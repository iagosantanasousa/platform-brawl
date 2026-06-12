import type { CharacterType, PlayerInput, MapId } from 'shared';
import { CHARACTER_CONFIGS, MAP_CONFIGS } from 'shared';
import { BattleRoomState } from '../schemas/BattleRoomState';
import { PlayerSchema } from '../schemas/PlayerSchema';
import { ProjectileSchema } from '../schemas/ProjectileSchema';

const GRAVITY = 900;

let projCounter = 0;
function nextProjId() { return `p${++projCounter}`; }

// Cache CHARACTER_CONFIGS per player to avoid repeated string lookups in the hot tick loop
import type { CharacterConfig } from 'shared';
const cfgCache = new Map<string, CharacterConfig>();

export function addPlayer(
  state: BattleRoomState,
  id: string,
  characterType: CharacterType,
  spawnIndex: number,
) {
  const cfg = CHARACTER_CONFIGS[characterType];
  cfgCache.set(id, cfg);
  const map = MAP_CONFIGS[state.mapId as MapId];
  const spawn = map.spawnPoints[spawnIndex % map.spawnPoints.length];

  const p = new PlayerSchema();
  p.id            = id;
  p.characterType = characterType;
  p.x             = spawn.x;
  p.y             = spawn.y;
  p.velocityX     = 0;
  p.velocityY     = 0;
  p.hp            = cfg.hp;
  p.maxHp         = cfg.hp;
  p.facing        = spawnIndex === 0 ? 'right' : 'left';
  p.isGrounded    = false;
  p.jumpsUsed     = 0;
  p.attackCooldown = 0;
  p.isDead        = false;
  p.knockbackX    = 0;
  state.players.set(id, p);
}

export function removePlayer(state: BattleRoomState, id: string) {
  state.players.delete(id);
  cfgCache.delete(id);
}

export function applyInput(state: BattleRoomState, playerId: string, input: PlayerInput) {
  const player = state.players.get(playerId);
  if (!player || player.isDead) return;

  const cfg = cfgCache.get(playerId) ?? CHARACTER_CONFIGS[player.characterType as CharacterType];

  if (input.left) {
    player.velocityX = -cfg.speed;
    player.facing = 'left';
  } else if (input.right) {
    player.velocityX = cfg.speed;
    player.facing = 'right';
  } else {
    player.velocityX *= 0.7;
  }

  if (input.jump && player.jumpsUsed < 2) {
    player.velocityY = cfg.jumpForce;
    player.isGrounded = false;
    player.jumpsUsed++;
  }

  if (input.attack && player.attackCooldown <= 0) {
    player.attackCooldown = cfg.attackCooldown;
    player.attackCount    = (player.attackCount + 1) % 256;
    resolveAttack(state, player);
  }

  if (Math.abs(player.knockbackX) > 1) {
    player.velocityX += player.knockbackX;
    player.knockbackX *= 0.5;
  } else {
    player.knockbackX = 0;
  }
}

function resolveAttack(state: BattleRoomState, attacker: PlayerSchema) {
  const cfg = CHARACTER_CONFIGS[attacker.characterType as CharacterType];

  if (cfg.isRanged) {
    const id = nextProjId();
    const speed = cfg.projectileSpeed ?? 600;
    const proj = new ProjectileSchema();
    proj.id        = id;
    proj.ownerId   = attacker.id;
    proj.x         = attacker.x;
    proj.y         = attacker.y - 10;
    proj.velocityX = attacker.facing === 'right' ? speed : -speed;
    proj.velocityY = 0;
    proj.damage    = cfg.attackDamage;
    state.projectiles.set(id, proj);
    return;
  }

  state.players.forEach((target) => {
    if (target.id === attacker.id || target.isDead) return;
    const dx = target.x - attacker.x;
    const dist = Math.abs(dx);
    const dirMatch = attacker.facing === 'right' ? dx > 0 : dx < 0;
    if (dist <= cfg.attackRange && dirMatch) {
      applyDamage(target, attacker.x, cfg.attackDamage, cfg.knockbackForce);
    }
  });
}

function applyDamage(
  target: PlayerSchema,
  attackerX: number,
  damage: number,
  knockback: number,
) {
  if (target.isDead) return;
  target.hp = Math.max(0, target.hp - damage);
  const dir = target.x > attackerX ? 1 : -1;
  target.knockbackX = dir * knockback * 0.3;
  target.velocityY  = -250;

  if (target.hp <= 0) {
    target.isDead    = true;
    target.velocityX = 0;
    target.velocityY = 0;
  }
}

export function tick(state: BattleRoomState, dt: number) {
  const map = MAP_CONFIGS[state.mapId as MapId];

  state.players.forEach((player) => {
    if (player.isDead) return;

    player.velocityY += GRAVITY * dt;
    player.x += player.velocityX * dt;
    player.y += player.velocityY * dt;

    if (player.attackCooldown > 0) player.attackCooldown -= Math.round(dt * 1000);

    const cfg = cfgCache.get(player.id) ?? CHARACTER_CONFIGS[player.characterType as CharacterType];
    const pw = cfg.width / 2;
    const ph = cfg.height / 2;

    player.isGrounded = false;

    for (const plat of map.platforms) {
      const pr = plat.x + plat.width;
      const pb = plat.y + plat.height;
      const ox = player.x + pw > plat.x && player.x - pw < pr;
      const oy = player.y + ph > plat.y && player.y - ph < pb;

      if (ox && oy) {
        if (player.velocityY >= 0 && player.y - ph < plat.y && player.y + ph >= plat.y) {
          player.y = plat.y - ph;
          player.velocityY = 0;
          player.isGrounded = true;
        } else if (player.velocityY < 0 && player.y + ph > pb && player.y - ph <= pb) {
          player.y = pb + ph;
          player.velocityY = 0;
        } else if (player.velocityX > 0 && player.x - pw < plat.x) {
          player.x = plat.x - pw;
          player.velocityX = 0;
        } else if (player.velocityX < 0 && player.x + pw > pr) {
          player.x = pr + pw;
          player.velocityX = 0;
        }
      }
    }

    if (player.isGrounded) player.jumpsUsed = 0;

    if (player.x - pw < 0) { player.x = pw; player.velocityX = 0; }
    if (player.x + pw > map.width) { player.x = map.width - pw; player.velocityX = 0; }

    if (player.y > map.height + 50) {
      respawnPlayer(state, player);
    }
  });

  const toDelete: string[] = [];
  state.projectiles.forEach((proj, id) => {
    proj.x += proj.velocityX * dt;
    proj.y += proj.velocityY * dt;

    if (proj.x < 0 || proj.x > map.width || proj.y < 0 || proj.y > map.height) {
      toDelete.push(id);
      return;
    }

    let hitPlatform = false;
    for (const plat of map.platforms) {
      if (proj.x > plat.x && proj.x < plat.x + plat.width &&
          proj.y > plat.y && proj.y < plat.y + plat.height) {
        hitPlatform = true;
        break;
      }
    }
    if (hitPlatform) { toDelete.push(id); return; }

    state.players.forEach((player) => {
      if (player.id === proj.ownerId || player.isDead) return;
      const cfg = cfgCache.get(player.id) ?? CHARACTER_CONFIGS[player.characterType as CharacterType];
      const dx = Math.abs(proj.x - player.x);
      const dy = Math.abs(proj.y - player.y);
      if (dx < cfg.width / 2 + 8 && dy < cfg.height / 2 + 8) {
        const kbForce = (cfgCache.get(proj.ownerId) ?? CHARACTER_CONFIGS['fighter']).knockbackForce;
        applyDamage(player, proj.x, proj.damage, kbForce);
        toDelete.push(id);
      }
    });
  });

  for (const id of toDelete) state.projectiles.delete(id);
}

function respawnPlayer(state: BattleRoomState, player: PlayerSchema) {
  const map = MAP_CONFIGS[state.mapId as MapId];
  let idx = 0;
  state.players.forEach((_, key) => { if (key === player.id) return; idx++; });
  const spawn = map.spawnPoints[idx % map.spawnPoints.length];
  const cfg   = cfgCache.get(player.id) ?? CHARACTER_CONFIGS[player.characterType as CharacterType];

  player.x             = spawn.x;
  player.y             = spawn.y - 50;
  player.velocityX     = 0;
  player.velocityY     = 0;
  player.hp            = cfg.hp;
  player.isDead        = false;
  player.attackCooldown = 0;
  player.jumpsUsed     = 0;
  player.knockbackX    = 0;
}
