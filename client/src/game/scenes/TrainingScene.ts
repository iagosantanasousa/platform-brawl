import Phaser from 'phaser';
import type { GameConfig } from '../../App';
import { BaseScene } from './BaseScene';
import { Player } from '../entities/Player';
import { Dummy } from '../entities/Dummy';
import { Projectile } from '../entities/Projectile';
import { CHARACTER_CONFIGS, MAP_CONFIGS } from 'shared';
import { touchInput } from '../touchInput';

const WALL_SLIDE_SPEED = 70;   // max downward px/s while wall sliding
const WALL_JUMP_VX     = 340;  // horizontal launch px/s on wall jump
const WALL_JUMP_GRACE  = 250;  // ms before player can re-grab same wall
const SLIDE_DURATION   = 320;  // ms
const SLIDE_COOLDOWN   = 5000; // ms

export class TrainingScene extends BaseScene {
  private player!: Player;
  private dummy!: Dummy;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cooldownText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private restartKey!: Phaser.Input.Keyboard.Key;

  constructor(config: GameConfig, onBack: () => void) {
    super('TrainingScene', config, onBack);
  }

  create() {
    this.buildMap();
    this.buildDecorations();
    this.setupControls();
    this.drawMapLabel();

    const map = MAP_CONFIGS[this.config.mapId];
    const spawn = map.spawnPoints[0];

    this.player = new Player(this, spawn.x, spawn.y - 40, this.config.characterType, true, 'VOCÊ');
    this.dummy = new Dummy(this, map.width / 2, 300);

    this.projectiles = this.physics.add.group({
      classType: Projectile,
      runChildUpdate: false,
    });

    // Player ↔ platforms
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.dummy, this.platforms);

    // Combo dash ↔ dummy (runner only)
    this.physics.add.overlap(
      this.player,
      this.dummy,
      () => {
        if (this.player.comboState === 'dashing' && !this.player.getData('comboHit')) {
          this.player.setData('comboHit', true);
          const cfg = CHARACTER_CONFIGS[this.config.characterType];
          const kbDir = this.player.comboDashVx >= 0 ? 1 : -1;
          this.dummy.hitDummy(cfg.comboDamage ?? 32, kbDir * cfg.knockbackForce * 1.5);
          this.player.endCombo();
        }
      },
    );

    // Projectile ↔ platforms
    this.physics.add.collider(
      this.projectiles,
      this.platforms,
      (proj) => (proj as Projectile).destroy(),
    );

    // Projectile ↔ dummy — checked manually each frame (see checkProjectileHits)

    // UI — setScrollFactor(0) keeps them fixed on screen regardless of camera
    this.modeText = this.add.text(map.width / 2, 16, 'MODO TREINO', {
      fontSize: '13px',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);

    this.hpText = this.add.text(map.width - 12, map.height - 12, '', {
      fontSize: '12px',
      color: '#aaaaaa',
    }).setOrigin(1, 1).setDepth(100).setScrollFactor(0);

    this.cooldownText = this.add.text(map.width / 2, map.height - 12, '', {
      fontSize: '12px',
      color: '#aaaaaa',
    }).setOrigin(0.5, 1).setDepth(100).setScrollFactor(0);

    // Controls help
    this.add.text(12, map.height - 12, 'WASD/Setas: mover  W/↑/Espaço: pular  Z/J: atacar  Q: combo (no ar)  R: resetar', {
      fontSize: '10px',
      color: '#555577',
    }).setOrigin(0, 1).setDepth(100).setScrollFactor(0);

    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Escape to lobby
    this.input.keyboard!.on('keydown-ESC', () => this.onBack());

    // Camera follows the local player
    this.setupCamera(this.player);
  }

  update(_time: number, delta: number) {
    const cfg = CHARACTER_CONFIGS[this.config.characterType];
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const comboState = this.player.comboState;

    // Consume slide flag every frame so it never carries over to a wrong state.
    const wantsSlide = this.isSlide();

    this.handleCombo();
    this.tickMovementTimers(delta);

    if (comboState === 'dashing') {
      // velocity driven by Player.update()

    } else if (this.player.isSliding) {
      // Ground slide: let velocity carry, decelerate gradually
      body.setVelocityX(body.velocity.x * 0.93);

    } else if (comboState === 'aiming') {
      // Aiming: WASD only (arrow keys reserved for combo aim)
      const moveLeft  = this.wasd.left.isDown  || touchInput.left;
      const moveRight = this.wasd.right.isDown || touchInput.right;
      if (moveLeft)       { body.setVelocityX(-cfg.speed); this.player.facing = 'left'; }
      else if (moveRight) { body.setVelocityX(cfg.speed);  this.player.facing = 'right'; }
      else                { body.setVelocityX(body.velocity.x * 0.75); }
      this.updateWallSlide();

    } else {
      // Normal state
      if (this.isLeft())       { body.setVelocityX(-cfg.speed); this.player.facing = 'left'; }
      else if (this.isRight()) { body.setVelocityX(cfg.speed);  this.player.facing = 'right'; }
      else                     { body.setVelocityX(body.velocity.x * 0.75); }

      // Jump / wall jump
      if (this.isJump()) {
        if (this.player.isWallSliding) {
          this.doWallJump();
        } else if (this.player.jumpsUsed < 2) {
          body.setVelocityY(cfg.jumpForce);
          this.player.jumpsUsed++;
        }
      }

      // Attack — archer uses hold-to-aim, others use press
      if (this.config.characterType === 'archer') {
        this.handleArcherAim(cfg);
      } else if (this.isAttack() && this.player.attackCooldown <= 0) {
        const cooldownMult = this.performAttack();
        this.player.attackCooldown = cfg.attackCooldown * cooldownMult;
      }

      // Ground slide trigger — no velocity requirement, direction from facing.
      if (this.player.isGrounded && this.player.comboCooldown <= 0 && wantsSlide) {
        this.startGroundSlide();
      }

      this.updateWallSlide();
    }

    // Out of bounds respawn
    const map = MAP_CONFIGS[this.config.mapId];
    if (this.player.y > map.height + 60) {
      if (this.player.comboState !== 'none') this.player.endCombo();
      const spawn = map.spawnPoints[0];
      this.player.setPosition(spawn.x, spawn.y - 60);
      body.setVelocity(0, 0);
      this.player.hp = this.player.maxHp;
    }

    // Restart
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.resetPlayer();
    }

    this.player.update(delta);
    this.dummy.update(delta);
    this.checkProjectileHits();

    // Update UI
    const cd = Math.max(0, this.player.attackCooldown);
    const comboReady = this.player.comboCooldown <= 0;
    const curComboState = this.player.comboState;
    const comboStr = curComboState === 'aiming' ? '  |  Combo: MIRANDO'
      : curComboState === 'dashing' ? '  |  Combo: DASH!'
      : comboReady ? '  |  Combo: PRONTO' : `  |  Combo CD: ${(this.player.comboCooldown / 1000).toFixed(1)}s`;
    this.cooldownText.setText(
      (cd > 0 ? `Ataque CD: ${(cd / 1000).toFixed(1)}s` : 'Ataque: PRONTO') + comboStr,
    );
    this.hpText.setText(`HP: ${this.player.hp}/${this.player.maxHp}`);
  }

  private tickMovementTimers(delta: number) {
    if (this.player.wallJumpCooldown > 0) this.player.wallJumpCooldown -= delta;
    if (this.player.isSliding) {
      this.player.slideDuration -= delta;
      if (this.player.slideDuration <= 0) this.player.isSliding = false;
    }
  }

  private updateWallSlide() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const base = !this.player.isGrounded
      && this.player.wallJumpCooldown <= 0
      && this.player.comboState === 'none';

    // Already sliding: keep going as long as still touching a wall.
    // Starting: additionally requires falling (not rising) and no slide yet this jump.
    const canCheck = base && (
      this.player.isWallSliding ||
      (body.velocity.y > 0 && !this.player.wallSlideUsed)
    );

    const side = canCheck ? this.wallableAdjacentSide(body) : null;

    if (side) {
      if (!this.player.isWallSliding) this.player.wallSlideUsed = true;
      this.player.isWallSliding = true;
      this.player.wallSide = side;
      if (body.velocity.y > WALL_SLIDE_SPEED) body.setVelocityY(WALL_SLIDE_SPEED);
    } else {
      this.player.isWallSliding = false;
      this.player.wallSide = null;
    }
  }

  private doWallJump() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const cfg  = CHARACTER_CONFIGS[this.config.characterType];
    const dir  = this.player.wallSide === 'left' ? 1 : -1;

    body.setVelocityX(dir * WALL_JUMP_VX);
    body.setVelocityY(cfg.jumpForce);
    this.player.jumpsUsed = 2;
    this.player.facing = dir === 1 ? 'right' : 'left';
    this.player.isWallSliding = false;
    this.player.wallSide = null;
    this.player.wallJumpCooldown = WALL_JUMP_GRACE;
    this.player.triggerWallJumpAnim();
  }

  private startGroundSlide() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const cfg  = CHARACTER_CONFIGS[this.config.characterType];
    const dir  = this.player.facing === 'right' ? 1 : -1;

    this.player.isSliding       = true;
    this.player.slideDuration   = SLIDE_DURATION;
    this.player.comboCooldown   = SLIDE_COOLDOWN;
    body.setVelocityX(dir * cfg.speed * 1.8);
    this.player.triggerSlideAnim();
  }

  private handleCombo() {
    const player = this.player;
    const isHeld = this.isComboHeld();

    if (player.comboState === 'none') {
      if (isHeld && !player.isGrounded && player.comboCooldown <= 0) {
        player.startComboAim();
        player.setData('comboHit', false);
      }
    } else if (player.comboState === 'aiming') {
      if (!isHeld) {
        // Execute with the last stored aim — do NOT update direction on release frame,
        // because comboAimX/Y are already zeroed when comboHeld flips false.
        player.executeCombo();
      } else if (player.isGrounded) {
        player.endCombo();
      } else {
        // Still held: update aim direction from input.
        const { dx, dy } = this.getComboAimDir(player.facing);
        player.updateComboAim(dx, dy);
      }
    }
    // 'dashing' ticks inside Player.update()
  }

  private checkProjectileHits() {
    if (!this.dummy.active) return;
    const cfg = CHARACTER_CONFIGS[this.config.characterType];
    const dBody = this.dummy.body as Phaser.Physics.Arcade.Body;
    const dr = new Phaser.Geom.Rectangle(dBody.x, dBody.y, dBody.width, dBody.height);

    this.projectiles.getChildren().forEach(go => {
      const p = go as Projectile;
      if (!p.active || p.getData('hit')) return;
      const pBody = p.body as Phaser.Physics.Arcade.Body;
      const pr = new Phaser.Geom.Rectangle(pBody.x, pBody.y, pBody.width, pBody.height);
      if (Phaser.Geom.Rectangle.Overlaps(pr, dr)) {
        p.setData('hit', true);
        const kbDir = pBody.velocity.x >= 0 ? 1 : -1;
        this.dummy.hitDummy(p.damage, cfg.knockbackForce * kbDir);
        p.destroy();
      }
    });
  }

  private handleArcherAim(cfg: (typeof CHARACTER_CONFIGS)[keyof typeof CHARACTER_CONFIGS]) {
    const held = this.isArcherAimHeld();

    if (held && this.player.attackCooldown <= 0) {
      if (!this.player.archerAiming) {
        this.player.startArcherAim(this.player.facing === 'right');
      }
      const { dx, dy } = this.getArcherAimDir(this.player.facing);
      this.player.updateArcherAim(dx, dy);
    } else if (!held && this.player.archerAiming) {
      this.fireArrow(cfg);
      this.player.cancelArcherAim();
      this.player.attackCooldown = cfg.attackCooldown;
    }
  }

  private fireArrow(cfg: (typeof CHARACTER_CONFIGS)[keyof typeof CHARACTER_CONFIGS]) {
    const speed = cfg.projectileSpeed ?? 750;
    const len = Math.sqrt(this.player.archerAimDx ** 2 + this.player.archerAimDy ** 2) || 1;
    const vx = (this.player.archerAimDx / len) * speed;
    const vy = (this.player.archerAimDy / len) * speed;

    const proj = new Projectile(
      this,
      this.player.x + (vx > 0 ? 16 : -16),
      this.player.y - 10,
      'archer',
      'player',
      vx,
      vy,
    );
    this.projectiles.add(proj, false);

    // Re-apply after group.add() resets the physics body via world.enableBody()
    const body = proj.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(vx, vy);
  }

  private performAttack(): number {
    const cfg = CHARACTER_CONFIGS[this.config.characterType];

    // Trigger attack animation — returns cooldown multiplier (0.5 for attack1, 1 for attack2)
    const cooldownMult = this.player.triggerAttackAnim();

    if (cfg.isRanged) {
      const projSpeed = cfg.projectileSpeed ?? 600;
      const vx = this.player.facing === 'right' ? projSpeed : -projSpeed;
      const proj = new Projectile(
        this,
        this.player.x,
        this.player.y - 10,
        this.config.characterType,
        'player',
        vx,
      );
      this.projectiles.add(proj, false);
    } else {
      // Melee: show attack range indicator
      this.showMeleeEffect();

      const dx = this.dummy.x - this.player.x;
      const dist = Math.abs(dx);
      const dirMatch = this.player.facing === 'right' ? dx > 0 : dx < 0;

      if (dist <= cfg.attackRange && dirMatch && this.dummy.active) {
        const kbDir = dx > 0 ? 1 : -1;
        this.dummy.hitDummy(cfg.attackDamage, kbDir * cfg.knockbackForce * 0.4);
      }
    }
    return cooldownMult;
  }

  private showMeleeEffect() {
    const cfg = CHARACTER_CONFIGS[this.config.characterType];
    const dir = this.player.facing === 'right' ? 1 : -1;
    const ex = this.player.x + dir * cfg.attackRange * 0.6;
    const ey = this.player.y;

    const gfx = this.add.graphics().setDepth(15);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(ex, ey, cfg.attackRange * 0.5);

    this.time.delayedCall(80, () => gfx.destroy());
  }

  private resetPlayer() {
    const map = MAP_CONFIGS[this.config.mapId];
    const spawn = map.spawnPoints[0];
    this.player.setPosition(spawn.x, spawn.y - 60);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.player.hp = this.player.maxHp;
    this.player.attackCooldown = 0;
    this.player.comboCooldown = 0;
  }
}
