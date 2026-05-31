import Phaser from 'phaser';
import type { CharacterType } from 'shared';
import { CHARACTER_CONFIGS } from 'shared';
import { gameState } from '../gameState';

// Character sprites: each frame is 256×256 px, rendered at scale 0.5 → 128×128 display.
// Phaser arcade body sync: body.pos = sprite.pos + scale * (offset - displayOrigin)
//   displayOriginX = 0.5 * 256 = 128,  displayOriginY = 0.5 * 256 = 128
// Pixel analysis of idle.png frame 0 (alpha > 0):
//   head_row=93, feet_row=160, center_x=133.5
//   feet offset from sprite.y = -64 + 0.5*160 = +16.0
//   center offset from sprite.x = -64 + 0.5*133.5 = +2.75
// F_BODY_OY: 0.5*(OY - 128) + 48 = 16  → OY = 64
// F_BODY_OX: 0.5*(OX - 128) + 18 = 2.75 → OX ≈ 98
// F_HEAD_Y:  head at sprite.y - 17.5 → labelBaseY = sprite.y - F_HEAD_Y → F_HEAD_Y = 18
const F_BODY_OX  = 98;
const F_BODY_OY  = 64;
const F_HEAD_Y   = 18;

// Wall-slide body: aligned to the actual visual pixel bounds of the wall_slide sprite.
// idle/wall_slide frame pixel bounds: x=[113-115, 154-156] (source px, center ~134).
// Normal body covers source x=[98,170] → extends 17px beyond visual on left, 14px on right.
// WS body covers source x=[115,141] (flipped) → zero gap on both walls.
// WS_BODY_OX aligns body.left with visual.left (source 115).
// WS_BODY_W gives body.right = visual.right when flipped (source 256-115=141).
// Derived: OX=115 → body.x = sprite.x - 6.5 ; W=26src → body.right = sprite.x + 6.5
const WS_BODY_OX = 115;
const WS_BODY_W  = 26;
// Sprite position delta when entering/exiting wall slide so body stays flush with wall.
// Enter right: +14.5 (body.right was sprite.x+21, now must be sprite.x+6.5).
// Enter left : -8.5  (body.left  was sprite.x-15, now must be sprite.x-6.5).
const WS_ENTER_DELTA_RIGHT =  14.5;
const WS_ENTER_DELTA_LEFT  = -8.5;

const COMBO_DASH_SPEED    = 700;  // px/s
const COMBO_DASH_DURATION = 300;  // ms
const COMBO_COOLDOWN      = 5000; // ms — shared with ground slide

export class Player extends Phaser.Physics.Arcade.Sprite {
  characterType: CharacterType;
  hp: number;
  maxHp: number;
  attackCooldown = 0;
  isGrounded = false;
  jumpsUsed = 0;
  facing: 'left' | 'right' = 'right';

  // Combo
  comboState: 'none' | 'aiming' | 'dashing' = 'none';
  comboAimDx = 0;
  comboAimDy = 0;
  comboDashVx = 0;
  comboDashVy = 0;
  comboCooldown = 0;
  private comboDashTimer = 0;

  // Wall slide / wall jump
  isWallSliding = false;
  wallSide: 'left' | 'right' | null = null;
  wallJumpCooldown = 0;
  wallSlideUsed = false;  // resets on landing; prevents wall sliding more than once per jump

  // Ground slide
  isSliding = false;
  slideDuration = 0;
  slideCooldown = 0;

  protected usesSprite = false;

  private wasGrounded = false;
  private wasWallSliding = false;
  private lastWallSide: 'left' | 'right' | null = null;
  private hpBar!: Phaser.GameObjects.Graphics;
  private nameLabel!: Phaser.GameObjects.Text;
  private flashTimer = 0;
  readonly isLocal: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    characterType: CharacterType,
    isLocal: boolean,
    label = '',
  ) {
    const cfg = CHARACTER_CONFIGS[characterType];

    // All character types share the same sprite sheet (fighter assets).
    const hasFighterSprite = scene.textures.exists('fighter_idle');
    let texKey: string;

    if (hasFighterSprite) {
      texKey = 'fighter_idle';
    } else {
      texKey = `char_${characterType}`;
      if (!scene.textures.exists(texKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(cfg.color);
        g.fillRect(0, 0, cfg.width, cfg.height);
        g.fillStyle(0xffffff, 0.3);
        g.fillRect(0, 0, cfg.width, 4);
        g.generateTexture(texKey, cfg.width, cfg.height);
        g.destroy();
      }
    }

    super(scene, x, y, texKey);
    scene.add.existing(this);

    if (hasFighterSprite) this.setScale(0.5);

    scene.physics.add.existing(this);

    this.characterType = characterType;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.isLocal = isLocal;
    this.usesSprite = hasFighterSprite;

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Phaser scales sourceWidth/Height by scaleX/Y: body.width = sourceWidth * scaleX.
    // To get cfg.width world pixels, pass cfg.width / scaleX as the source size.
    const sx = hasFighterSprite ? 0.5 : 1;
    body.setSize(cfg.width / sx, cfg.height / sx);
    body.setCollideWorldBounds(false);

    if (hasFighterSprite) {
      body.setOffset(F_BODY_OX, F_BODY_OY);
      Player.setupFighterAnims(scene);
      this.playFighter('fighter_idle');
    }

    // HP bar
    this.hpBar = scene.add.graphics();
    this.updateHpBar();

    // Name label — positioned relative to the character's visual head
    const labelY = this.labelBaseY - 28;
    this.nameLabel = scene.add.text(x, labelY, label || characterType.toUpperCase(), {
      fontSize: '10px',
      color: isLocal ? '#ffffff' : '#ff8888',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.setDepth(10);
    this.hpBar.setDepth(11);
    this.nameLabel.setDepth(12);
  }

  // ─── Animation setup ────────────────────────────────────────────────────────

  private static setupFighterAnims(scene: Phaser.Scene) {
    if (scene.anims.exists('fighter_idle')) return;

    const a = scene.anims;
    // Idle   – 4 frames  (1024 / 256)
    a.create({ key: 'fighter_idle',   frames: a.generateFrameNumbers('fighter_idle',   { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
    // Run    – 10 frames (2560 / 256)
    a.create({ key: 'fighter_run',    frames: a.generateFrameNumbers('fighter_run',    { start: 0, end: 9  }), frameRate: 14, repeat: -1 });
    // Jump   – 6 frames  (1536 / 256) – play once, hold last frame
    a.create({ key: 'fighter_jump',   frames: a.generateFrameNumbers('fighter_jump',   { start: 0, end: 5  }), frameRate: 10, repeat: 0  });
    // Fall   – 4 frames  (1024 / 256) – loop
    a.create({ key: 'fighter_fall',   frames: a.generateFrameNumbers('fighter_fall',   { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
    // Attack – 3 frames  (768 / 256)  – play once
    a.create({ key: 'fighter_attack', frames: a.generateFrameNumbers('fighter_attack', { start: 0, end: 2  }), frameRate: 15, repeat: 0  });
    // Hurt   – 6 frames  (1536 / 256) – play once
    a.create({ key: 'fighter_hurt',       frames: a.generateFrameNumbers('fighter_hurt',       { start: 0, end: 5  }), frameRate: 12, repeat: 0  });
    // Death  – 23 frames (5888 / 256) – play once
    a.create({ key: 'fighter_death',      frames: a.generateFrameNumbers('fighter_death',      { start: 0, end: 22 }), frameRate: 10, repeat: 0  });
    // Wall slide – 4 frames – loop
    a.create({ key: 'fighter_wall_slide', frames: a.generateFrameNumbers('fighter_wall_slide', { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
    // Wall jump  – 4 frames – play once
    a.create({ key: 'fighter_wall_jump',  frames: a.generateFrameNumbers('fighter_wall_jump',  { start: 0, end: 3  }), frameRate: 12, repeat: 0  });
    // Ground slide – 8 frames – play once (matches 320 ms slide duration)
    a.create({ key: 'fighter_slide',      frames: a.generateFrameNumbers('fighter_slide',      { start: 0, end: 7  }), frameRate: 25, repeat: 0  });
  }

  // ─── Animation helper ────────────────────────────────────────────────────────

  // Plays a fighter animation. Frames are pre-scaled to 128×88 — no runtime scale needed.
  protected playFighter(key: string, ignoreIfPlaying = false) {
    this.play(key, ignoreIfPlaying);
  }

  // ─── Public animation triggers ───────────────────────────────────────────────

  triggerAttackAnim() {
    if (this.usesSprite) this.playFighter('fighter_attack');
  }

  triggerDeathAnim() {
    if (this.usesSprite) this.playFighter('fighter_death');
  }

  triggerWallJumpAnim() {
    if (this.usesSprite) this.playFighter('fighter_wall_jump');
  }

  triggerSlideAnim() {
    if (this.usesSprite) this.playFighter('fighter_slide');
  }

  // ─── HP bar ──────────────────────────────────────────────────────────────────

  private get labelBaseY(): number {
    // Returns the Y coordinate of the character's visual head
    if (this.usesSprite) return this.y - F_HEAD_Y;
    return this.y - CHARACTER_CONFIGS[this.characterType].height / 2;
  }

  private updateHpBar() {
    const cfg = CHARACTER_CONFIGS[this.characterType];
    const barW = (this.usesSprite ? 48 : cfg.width) + 8;
    const barH = 5;
    const x = this.x - barW / 2;
    const y = this.labelBaseY - 14;

    this.hpBar.clear();
    this.hpBar.fillStyle(0x333333);
    this.hpBar.fillRect(x, y, barW, barH);
    const pct = Math.max(0, this.hp / this.maxHp);
    const color = pct > 0.5 ? 0x2ecc71 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
    this.hpBar.fillStyle(color);
    this.hpBar.fillRect(x, y, barW * pct, barH);
  }

  // ─── Damage ──────────────────────────────────────────────────────────────────

  takeDamage(amount: number, knockbackX = 0) {
    this.hp = Math.max(0, this.hp - amount);
    this.flashTimer = 200;

    if (this.usesSprite) {
      this.playFighter(this.hp <= 0 ? 'fighter_death' : 'fighter_hurt');
    } else {
      this.setTint(0xff4444);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(body.velocity.x + knockbackX);
    body.setVelocityY(-250);

    this.updateHpBar();

    if (!this.usesSprite) {
      const dmgText = this.scene.add.text(this.x, this.y - 20, `-${amount}`, {
        fontSize: '14px', color: '#ff4444', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);
      this.scene.tweens.add({
        targets: dmgText, y: this.y - 60, alpha: 0, duration: 700, ease: 'Power2',
        onComplete: () => dmgText.destroy(),
      });
    } else {
      // Floating damage number works above the sprite
      const dmgText = this.scene.add.text(this.x, this.y - F_HEAD_Y - 10, `-${amount}`, {
        fontSize: '14px', color: '#ff4444', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);
      this.scene.tweens.add({
        targets: dmgText, y: this.y - F_HEAD_Y - 50, alpha: 0, duration: 700, ease: 'Power2',
        onComplete: () => dmgText.destroy(),
      });
    }
  }

  setHp(hp: number) {
    if (hp < this.hp) {
      this.flashTimer = 200;
      if (!this.usesSprite) this.setTint(0xff4444);
    }
    this.hp = hp;
    this.updateHpBar();
  }

  // ─── Per-frame update ────────────────────────────────────────────────────────

  update(dt: number) {
    // Flash tint (only for rectangle sprites)
    if (!this.usesSprite) {
      if (this.flashTimer > 0) {
        this.flashTimer -= dt;
        if (this.flashTimer <= 0) this.clearTint();
      }
    }

    this.updateHpBar();
    this.nameLabel.setPosition(this.x, this.labelBaseY - 28);

    const body = this.body as Phaser.Physics.Arcade.Body;
    this.isGrounded = body.blocked.down;

    // Reset per-jump counters on landing
    if (this.isGrounded && !this.wasGrounded) {
      this.jumpsUsed = 0;
      this.wallSlideUsed = false;
    }
    this.wasGrounded = this.isGrounded;
    gameState.playerGrounded = this.isGrounded;
    gameState.actionCooldown = Math.max(0, this.comboCooldown);

    // Adjust body geometry when entering / exiting wall slide so the sprite
    // visual content is flush with the wall (no gap). The WS body is narrower
    // and offset further right to match the actual pixel bounds of wall_slide.png.
    if (this.usesSprite) {
      const cfg = CHARACTER_CONFIGS[this.characterType];
      const sx = 0.5;
      if (this.isWallSliding && !this.wasWallSliding) {
        // Entering — reposition sprite toward wall then shrink body to pixel bounds
        if (this.wallSide === 'right') this.x += WS_ENTER_DELTA_RIGHT;
        else                           this.x += WS_ENTER_DELTA_LEFT;
        this.lastWallSide = this.wallSide;
        body.setSize(WS_BODY_W, cfg.height / sx);
        body.setOffset(WS_BODY_OX, F_BODY_OY);
      } else if (!this.isWallSliding && this.wasWallSliding) {
        // Exiting — reposition sprite so normal body lands flush with wall on revert
        if (this.lastWallSide === 'right') this.x -= WS_ENTER_DELTA_RIGHT;
        else                               this.x -= WS_ENTER_DELTA_LEFT;
        body.setSize(cfg.width / sx, cfg.height / sx);
        body.setOffset(F_BODY_OX, F_BODY_OY);
      }
      this.wasWallSliding = this.isWallSliding;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.comboCooldown > 0) this.comboCooldown -= dt;

    // Tick dash timer
    if (this.comboState === 'dashing') {
      this.comboDashTimer -= dt;
      body.setVelocity(this.comboDashVx, this.comboDashVy);
      if (this.comboDashTimer <= 0) this.endCombo();
    }

    if (this.usesSprite) this.updateFighterAnim();
  }

  private static comboAimKey(dx: number, dy: number): string {
    if (dy < 0) {
      if (dx < 0) return 'combo_up_left';
      if (dx > 0) return 'combo_up_right';
      return 'combo_up';
    }
    if (dy > 0) {
      if (dx < 0) return 'combo_down_left';
      if (dx > 0) return 'combo_down_right';
      return 'combo_down';
    }
    return dx >= 0 ? 'combo_right' : 'combo_left';
  }

  private updateFighterAnim() {
    // ── Combo overrides ──────────────────────────────────────────────────────
    if (this.comboState === 'aiming') {
      const key = Player.comboAimKey(this.comboAimDx, this.comboAimDy);
      if (this.texture.key !== key) { this.anims.stop(); this.setTexture(key); }
      this.setFlipX(false);
      return;
    }
    if (this.comboState === 'dashing') {
      if (this.texture.key !== 'combo_dash') { this.anims.stop(); this.setTexture('combo_dash'); }
      this.setFlipX(this.comboDashVx < 0);
      return;
    }

    // ── Normal animation ─────────────────────────────────────────────────────
    const body   = this.body as Phaser.Physics.Arcade.Body;
    const curKey = this.anims.currentAnim?.key ?? '';

    // One-shots: never interrupt while playing
    const oneShots = ['fighter_hurt', 'fighter_attack', 'fighter_death', 'fighter_wall_jump', 'fighter_slide'];
    if (oneShots.includes(curKey) && this.anims.isPlaying) return;

    // Restore fighter texture if we were showing a combo image
    if (!curKey || !curKey.startsWith('fighter_')) this.setTexture('fighter_idle');

    // Ground slide
    if (this.isSliding) {
      this.setFlipX(this.facing === 'left');
      this.playFighter('fighter_slide', true);
      return;
    }

    // Wall slide — face away from the wall
    if (this.isWallSliding) {
      this.setFlipX(this.wallSide === 'right');
      this.playFighter('fighter_wall_slide', true);
      return;
    }

    this.setFlipX(this.facing === 'left');

    const vx = Math.abs(body.velocity.x);
    const vy = body.velocity.y;

    if (!this.isGrounded) {
      if (vy < 0) {
        if (curKey !== 'fighter_jump' && curKey !== 'fighter_wall_jump') this.playFighter('fighter_jump');
      } else {
        this.playFighter('fighter_fall', true);
      }
    } else if (vx > 25) {
      this.playFighter('fighter_run', true);
    } else {
      this.playFighter('fighter_idle', true);
    }
  }

  // ─── Combo ───────────────────────────────────────────────────────────────────

  startComboAim() {
    if (this.comboState !== 'none' || this.comboCooldown > 0) return;
    this.comboState = 'aiming';
    this.comboAimDx = this.facing === 'right' ? 1 : -1;
    this.comboAimDy = 0;
  }

  updateComboAim(dx: number, dy: number) {
    if (this.comboState !== 'aiming') return;
    this.comboAimDx = dx;
    this.comboAimDy = dy;
  }

  executeCombo() {
    if (this.comboState !== 'aiming') return;
    this.comboState = 'dashing';

    // Normalise direction vector so diagonal speed equals axis-aligned speed
    const len = Math.sqrt(this.comboAimDx * this.comboAimDx + this.comboAimDy * this.comboAimDy) || 1;
    this.comboDashVx = (this.comboAimDx / len) * COMBO_DASH_SPEED;
    this.comboDashVy = (this.comboAimDy / len) * COMBO_DASH_SPEED;
    this.comboDashTimer = COMBO_DASH_DURATION;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(this.comboDashVx, this.comboDashVy);
  }

  endCombo() {
    this.comboState = 'none';
    this.comboCooldown = COMBO_COOLDOWN;
    this.comboDashTimer = 0;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  destroy(fromScene?: boolean) {
    this.hpBar?.destroy();
    this.nameLabel?.destroy();
    super.destroy(fromScene);
  }
}
