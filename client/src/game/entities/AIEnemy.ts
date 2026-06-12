import Phaser from 'phaser';
import { Player } from './Player';
import { CHARACTER_CONFIGS } from 'shared';
import type { CharacterType } from 'shared';

const RESPAWN_DELAY    = 5000;
const ATTACK_RANGE     = 68;
const JUMP_COOLDOWN    = 1200;
const SPEED_MULT       = 0.65;
const ARCHER_PREF_DIST = 350; // preferred kiting distance
const ARCHER_TOO_CLOSE = 180; // retreat if target gets this close
const ARCHER_SHOOT_MAX = 560; // maximum firing range
const VISION_RANGE     = 750; // distance at which the NPC spots an enemy for the first time
const AGGRO_PERSIST    = 3500; // ms to stay aggroed after losing sight of all targets
const DANCE_RANGE      = 150; // px: melee NPCs slow to a cautious approach in this radius

export class AIEnemy extends Player {
  private spawnX: number;
  private spawnY: number;
  private dead      = false;
  private respawnCD = 0;
  private jumpTimer = 0;
  private aggroTimer    = 0; // >0 means currently aggroed
  private meleeBackTimer = 0; // countdown after attacking: back off from target
  private respawnLabel!: Phaser.GameObjects.Text;

  isAttackFrame = false;

  // Team battle support
  team: 0 | 1 = 0;
  lastAttackerId: string | null = null;
  onDied?: (victim: AIEnemy) => void;
  onFireProjectile?: (x: number, y: number, vx: number, vy: number, ownerName: string) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    characterType: CharacterType = 'fighter',
    label = 'INIMIGO',
  ) {
    super(scene, x, y, characterType, false, label);
    this.spawnX = x;
    this.spawnY = y;
    if (!this.usesSprite) this.setTint(0xff5555);

    this.respawnLabel = scene.add.text(x, y - 60, '', {
      fontSize: '13px', color: '#ff9944', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30).setScrollFactor(1);
  }

  takeHit(damage: number, knockbackX: number, attackerId?: string) {
    if (this.dead) return;
    if (attackerId !== undefined) this.lastAttackerId = attackerId;
    this.hp = Math.max(0, this.hp - damage);

    if (this.usesSprite) this.triggerHurtAnim();

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);
    body.setVelocityY(-180);

    const ty = this.usesSprite ? this.y - 44 : this.y - 20;
    const t = this.scene.add.text(this.x, ty, `-${damage}`, {
      fontSize: '14px', color: '#ff4444', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    this.scene.tweens.add({
      targets: t, y: ty - 40, alpha: 0, duration: 700, ease: 'Power2',
      onComplete: () => t.destroy(),
    });

    if (this.hp <= 0) this.die();
  }

  private die() {
    this.dead         = true;
    this.isAttackFrame = false;
    this.respawnCD    = RESPAWN_DELAY;
    if (this.usesSprite) this.playFighter('death');
    this.setVisible(false);
    this.setActive(false);
    (this.body as Phaser.Physics.Arcade.Body).setEnable(false);
    this.onDied?.(this);
  }

  private respawn() {
    this.dead = false;
    this.hp   = this.maxHp;
    this.lastAttackerId = null;
    this.setPosition(this.spawnX, this.spawnY - 60);
    this.setVisible(true);
    this.setActive(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setEnable(true);
    body.setVelocity(0, 0);
    this.attackCooldown  = 0;
    this.jumpTimer       = 0;
    this.aggroTimer      = 0;
    this.meleeBackTimer  = 0;
    this.respawnLabel.setText('');
    if (!this.usesSprite) this.setTint(0xff5555);
  }

  get isDead() { return this.dead; }

  updateAI(targets: Array<{ x: number; y: number }>, delta: number) {
    if (this.dead) {
      this.isAttackFrame = false; // never deal damage while dead
      this.respawnCD -= delta;
      this.respawnLabel
        .setPosition(this.spawnX, this.spawnY - 80)
        .setText(`Respawn ${Math.ceil(this.respawnCD / 1000)}s`);
      if (this.respawnCD <= 0) this.respawn();
      return;
    }

    this.respawnLabel.setText('');

    // Vision: any target within VISION_RANGE triggers (and refreshes) aggro
    for (const t of targets) {
      if (Math.hypot(t.x - this.x, t.y - this.y) <= VISION_RANGE) {
        this.aggroTimer = AGGRO_PERSIST;
        break;
      }
    }
    if (this.aggroTimer > 0) this.aggroTimer -= delta;

    // Not aggroed — advance slowly toward nearest target (no combat tactics yet)
    if (this.aggroTimer <= 0) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      const cfg  = CHARACTER_CONFIGS[this.characterType];
      let adv = targets[0];
      let advDist = Infinity;
      for (const t of targets) {
        const d = Math.hypot(t.x - this.x, t.y - this.y);
        if (d < advDist) { advDist = d; adv = t; }
      }
      if (adv) {
        const dir = adv.x > this.x ? 1 : -1;
        body.setVelocityX(dir * cfg.speed * SPEED_MULT);
        this.facing = dir === 1 ? 'right' : 'left';
        this.tickJump(adv, delta);
      }
      super.update(delta);
      return;
    }

    // Pick nearest target (full list — NPC remembers last known area when aggroed)
    let nearest = targets[0];
    let bestDist = Infinity;
    for (const t of targets) {
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      if (d < bestDist) { bestDist = d; nearest = t; }
    }
    if (!nearest) { super.update(delta); return; }

    if (this.characterType === 'archer') {
      this.updateArcherAI(nearest, delta);
    } else {
      this.updateMeleeAI(nearest, delta);
    }

    super.update(delta);
  }

  // ── Melee AI (fighter / tank) ─────────────────────────────────────────────

  private updateMeleeAI(target: { x: number; y: number }, delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const cfg  = CHARACTER_CONFIGS[this.characterType];
    const dx     = target.x - this.x;
    const distH  = Math.abs(dx);
    const dist2D = Math.sqrt(dx * dx + (target.y - this.y) ** 2);
    const dir    = dx > 0 ? 1 : -1;

    this.isAttackFrame = false;
    this.facing = dir === 1 ? 'right' : 'left';

    if (this.meleeBackTimer > 0) this.meleeBackTimer -= delta;

    if (this.attackCooldown > 0) {
      // After an attack: back off while cooldown runs, then stop coasting
      if (this.meleeBackTimer > 0) {
        body.setVelocityX(-dir * cfg.speed * SPEED_MULT * 0.55);
      } else {
        body.setVelocityX(body.velocity.x * 0.82);
      }

    } else if (dist2D <= ATTACK_RANGE && distH <= ATTACK_RANGE) {
      // In range — strike, then set back-off timer
      this.isAttackFrame  = true;
      this.attackCooldown = cfg.attackCooldown;
      this.triggerAttackAnim();
      body.setVelocityX(0);
      this.meleeBackTimer = 300 + Math.random() * 250; // 300–550 ms back-off (randomised so NPCs don't sync)

    } else if (distH <= DANCE_RANGE) {
      // Close range — slow, deliberate approach
      body.setVelocityX(dir * cfg.speed * SPEED_MULT * 0.45);

    } else {
      // Far — full approach speed
      body.setVelocityX(dir * cfg.speed * SPEED_MULT);
    }

    this.tickJump(target, delta);
  }

  // ── Archer AI — kite and shoot ────────────────────────────────────────────

  private updateArcherAI(target: { x: number; y: number }, delta: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const cfg  = CHARACTER_CONFIGS[this.characterType];
    const dx   = target.x - this.x;
    const dy   = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dir  = dx > 0 ? 1 : -1;

    this.isAttackFrame = false;
    this.facing = dir === 1 ? 'right' : 'left';

    if (dist < ARCHER_TOO_CLOSE) {
      // Too close — run away
      body.setVelocityX(-dir * cfg.speed * SPEED_MULT);
    } else if (dist > ARCHER_PREF_DIST + 80) {
      // Too far — close in slowly
      body.setVelocityX(dir * cfg.speed * SPEED_MULT * 0.5);
    } else {
      // Sweet spot — slow to a stop and hold position
      body.setVelocityX(body.velocity.x * 0.8);
    }

    // Fire when in range and cooldown expired
    if (dist <= ARCHER_SHOOT_MAX && this.attackCooldown <= 0) {
      const speed = cfg.projectileSpeed ?? 700;
      const len   = dist || 1;
      const vx    = (dx / len) * speed;
      const vy    = (dy / len) * speed;
      this.attackCooldown = cfg.attackCooldown;
      this.triggerAttackAnim();
      this.onFireProjectile?.(this.x + dir * 20, this.y - 20, vx, vy, this.name);
    }

    this.tickJump(target, delta);
  }

  // ── Shared jump logic ─────────────────────────────────────────────────────

  private tickJump(target: { x: number; y: number }, delta: number) {
    const body  = this.body as Phaser.Physics.Arcade.Body;
    const cfg   = CHARACTER_CONFIGS[this.characterType];
    const dy    = target.y - this.y;
    const distH = Math.abs(target.x - this.x);

    if (this.jumpTimer <= 0 && this.jumpsUsed < 2) {
      const stuck     = this.isGrounded && Math.abs(body.velocity.x) < 15 && distH > ATTACK_RANGE + 20;
      const needsJump = this.isGrounded ? (dy < -80 || stuck) : (dy < -160 && this.jumpsUsed < 2);
      if (needsJump) {
        body.setVelocityY(cfg.jumpForce * (this.isGrounded ? 0.95 : 0.85));
        this.jumpsUsed = this.isGrounded ? 1 : 2;
        this.jumpTimer = JUMP_COOLDOWN;
      }
    }
    if (this.jumpTimer > 0) this.jumpTimer -= delta;
  }

  destroy(fromScene?: boolean) {
    this.respawnLabel?.destroy();
    super.destroy(fromScene);
  }
}
