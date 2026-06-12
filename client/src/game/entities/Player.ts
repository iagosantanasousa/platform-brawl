import Phaser from 'phaser';
import type { CharacterType } from 'shared';
import { CHARACTER_CONFIGS } from 'shared';
import { gameState } from '../gameState';

// Character sprites: each frame is 256×256 px, rendered at scale 0.5 → 128×128 display.
// body.x = sprite.x + (OX - 128) * 0.5    body.bottom = body.y + cfg.height
//
// Fighter/Archer — idle pixel bounds: head=93, feet=160, center_x=133.5
//   OY=64 → body.bottom = sprite.y+16 (feet row)    OX=98 → body centered at sprite.x+2.75
const F_BODY_OX  = 98;
const F_BODY_OY  = 64;
const F_HEAD_Y   = 18;

// Warrior (Tank) — idle pixel bounds: head=87, feet=165, center_x=131.5  (frame 256×256)
//   OY=49 → body.bottom = sprite.y+18.5    OX=84 → body centered at sprite.x+2
const T_BODY_OX  = 84;
const T_BODY_OY  = 49;
const T_HEAD_Y   = 20;

// Wall-slide body: aligned to the actual visual pixel bounds of the wall_slide sprite.
// idle/wall_slide frame pixel bounds: x=[113-115, 154-156] (source px, center ~134).
// Normal body covers source x=[98,170] → extends 17px beyond visual on left, 14px on right.
// WS body covers source x=[115,141] (flipped) → zero gap on both walls.
// WS_BODY_OX aligns body.left with visual.left (source 115).
// WS_BODY_W gives body.right = visual.right when flipped (source 256-115=141).
// Derived: OX=115 → body.x = sprite.x - 6.5 ; W=26src → body.right = sprite.x + 6.5
// Fighter wall-slide body (source px). Aligns body to visual pixel bounds of wall_slide.png.
// body.right = sprite.x+6.5  body.left = sprite.x-6.5
const WS_BODY_OX = 115;
const WS_BODY_W  = 26;
const WS_ENTER_DELTA_RIGHT =  14.5;  // body.right was sprite.x+21 → now sprite.x+6.5
const WS_ENTER_DELTA_LEFT  = -8.5;   // body.left  was sprite.x-15 → now sprite.x-6.5

// Warrior wall-slide body. Visual bounds: left=113 right=161 (source), center=137 (asymmetric).
// Left wall  (no flip):  OX=113 → body.left  = sprite.x-7.5  (matches visual left)
// Right wall (flipX):    OX=94  → body.right = sprite.x+7.5  (matches flipped visual right)
const TW_WS_BODY_OX           = 113;   // left wall
const TW_WS_BODY_OX_RIGHT     = 94;    // right wall (sprite flipped)
const TW_WS_BODY_W            = 49;
const TW_WS_ENTER_DELTA_RIGHT =  18.5; // body.right was sprite.x+26 → now sprite.x+7.5
const TW_WS_ENTER_DELTA_LEFT  = -14.5; // body.left  was sprite.x-22 → now sprite.x-7.5

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
  private comboDashIsLateral = false;
  private attackSequence = 0; // alternates 0→1→0 to pick attack1/attack2

  // Archer aim
  archerAiming = false;
  archerAimDx  = 1;
  archerAimDy  = 0;
  private archerAimGfx: Phaser.GameObjects.Graphics | null = null;

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
  protected animPrefix = 'fighter'; // 'fighter' | 'archer' | 'warrior'
  protected bodyOX = F_BODY_OX;
  protected bodyOY = F_BODY_OY;
  protected headOffY = F_HEAD_Y;
  protected wsBodyOX          = WS_BODY_OX;   // left wall OX
  protected wsBodyOXRight     = WS_BODY_OX;   // right wall OX (same for fighter, different for warrior)
  protected wsBodyW           = WS_BODY_W;
  protected wsEnterDeltaRight = WS_ENTER_DELTA_RIGHT;
  protected wsEnterDeltaLeft  = WS_ENTER_DELTA_LEFT;

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

    const spritePrefix = characterType === 'archer' ? 'archer' : characterType === 'tank' ? 'warrior' : 'fighter';
    const hasSprite = scene.textures.exists(`${spritePrefix}_idle`);
    let texKey: string;

    if (hasSprite) {
      texKey = `${spritePrefix}_idle`;
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

    if (hasSprite) this.setScale(0.5);

    scene.physics.add.existing(this);

    this.characterType = characterType;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.isLocal = isLocal;
    this.usesSprite  = hasSprite;
    this.animPrefix  = spritePrefix;

    if (spritePrefix === 'warrior') {
      this.bodyOX   = T_BODY_OX;
      this.bodyOY   = T_BODY_OY;
      this.headOffY = T_HEAD_Y;
      this.wsBodyOX          = TW_WS_BODY_OX;
      this.wsBodyOXRight     = TW_WS_BODY_OX_RIGHT;
      this.wsBodyW           = TW_WS_BODY_W;
      this.wsEnterDeltaRight = TW_WS_ENTER_DELTA_RIGHT;
      this.wsEnterDeltaLeft  = TW_WS_ENTER_DELTA_LEFT;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Phaser scales sourceWidth/Height by scaleX/Y: body.width = sourceWidth * scaleX.
    // To get cfg.width world pixels, pass cfg.width / scaleX as the source size.
    const sx = hasSprite ? 0.5 : 1;
    body.setSize(cfg.width / sx, cfg.height / sx);
    body.setCollideWorldBounds(false);

    if (hasSprite) {
      body.setOffset(this.bodyOX, this.bodyOY);
      Player.setupFighterAnims(scene);
      this.playAnim(`${spritePrefix}_idle`);
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

  setLabelColor(color: string) {
    this.nameLabel.setColor(color);
  }

  // ─── Animation setup ────────────────────────────────────────────────────────

  private static setupFighterAnims(scene: Phaser.Scene) {
    if (scene.anims.exists('fighter_idle')) return;

    const a = scene.anims;

    function def(pfx: string) {
      a.create({ key: `${pfx}_idle`,       frames: a.generateFrameNumbers(`${pfx}_idle`,       { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
      a.create({ key: `${pfx}_run`,        frames: a.generateFrameNumbers(`${pfx}_run`,        { start: 0, end: 9  }), frameRate: 14, repeat: -1 });
      a.create({ key: `${pfx}_jump`,       frames: a.generateFrameNumbers(`${pfx}_jump`,       { start: 0, end: 5  }), frameRate: 10, repeat: 0  });
      a.create({ key: `${pfx}_fall`,       frames: a.generateFrameNumbers(`${pfx}_fall`,       { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
      a.create({ key: `${pfx}_attack`,     frames: a.generateFrameNumbers(`${pfx}_attack`,     { start: 0, end: 2  }), frameRate: 15, repeat: 0  });
      a.create({ key: `${pfx}_attack2`,    frames: a.generateFrameNumbers(`${pfx}_attack2`,    { start: 0, end: 3  }), frameRate: 15, repeat: 0  });
      a.create({ key: `${pfx}_hurt`,       frames: a.generateFrameNumbers(`${pfx}_hurt`,       { start: 0, end: 5  }), frameRate: 12, repeat: 0  });
      a.create({ key: `${pfx}_death`,      frames: a.generateFrameNumbers(`${pfx}_death`,      { start: 0, end: 22 }), frameRate: 10, repeat: 0  });
      a.create({ key: `${pfx}_wall_slide`, frames: a.generateFrameNumbers(`${pfx}_wall_slide`, { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
      a.create({ key: `${pfx}_wall_jump`,  frames: a.generateFrameNumbers(`${pfx}_wall_jump`,  { start: 0, end: 3  }), frameRate: 12, repeat: 0  });
      a.create({ key: `${pfx}_slide`,      frames: a.generateFrameNumbers(`${pfx}_slide`,      { start: 0, end: 7  }), frameRate: 25, repeat: 0  });
    }

    def('fighter');
    // Fighter attacks have 4 frames each (def() defaults to 3) — override
    a.remove('fighter_attack');
    a.create({ key: 'fighter_attack',  frames: a.generateFrameNumbers('fighter_attack',  { start: 0, end: 3 }), frameRate: 15, repeat: 0 });
    a.remove('fighter_attack2');
    a.create({ key: 'fighter_attack2', frames: a.generateFrameNumbers('fighter_attack2', { start: 0, end: 3 }), frameRate: 15, repeat: 0 });
    a.create({ key: 'fighter_attack3', frames: a.generateFrameNumbers('fighter_attack3', { start: 0, end: 4 }), frameRate: 15, repeat: 0 });

    def('archer');

    // Archer aim — run animations loop while the player runs+aims
    for (const key of [
      'archer_aim_run_front', 'archer_aim_run_diag_up', 'archer_aim_run_diag_down',
      'archer_aim_run_up', 'archer_aim_run_back', 'archer_aim_run_back_diag_up',
      'archer_aim_run_back_diag_down',
    ]) {
      a.create({ key, frames: a.generateFrameNumbers(key, { start: 0, end: 9 }), frameRate: 14, repeat: -1 });
    }

    // Warrior (Tank) — own sprites for idle/run; fighter spritesheets for the rest until more sprites are made
    a.create({ key: 'warrior_idle',       frames: a.generateFrameNumbers('warrior_idle', { start: 0, end: 3 }), frameRate: 8,  repeat: -1 });
    a.create({ key: 'warrior_run',        frames: a.generateFrameNumbers('warrior_run',  { start: 0, end: 9 }), frameRate: 14, repeat: -1 });
    a.create({ key: 'warrior_jump',       frames: a.generateFrameNumbers('warrior_jump',       { start: 0, end: 5  }), frameRate: 10, repeat: 0  });
    a.create({ key: 'warrior_fall',       frames: a.generateFrameNumbers('warrior_fall',       { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
    a.create({ key: 'warrior_attack',  frames: a.generateFrameNumbers('warrior_attack',  { start: 0, end: 3 }), frameRate: 15, repeat: 0 });
    a.create({ key: 'warrior_attack2', frames: a.generateFrameNumbers('warrior_attack2', { start: 0, end: 3 }), frameRate: 15, repeat: 0 });
    a.create({ key: 'warrior_attack3', frames: a.generateFrameNumbers('warrior_attack3', { start: 0, end: 3 }), frameRate: 15, repeat: 0 });
    a.create({ key: 'warrior_hurt',  frames: a.generateFrameNumbers('warrior_fall', { start: 0, end: 3 }), frameRate: 14, repeat: 0 });
    a.create({ key: 'warrior_death', frames: a.generateFrameNumbers('warrior_fall', { start: 0, end: 3 }), frameRate: 6,  repeat: 0 });
    a.create({ key: 'warrior_wall_slide', frames: a.generateFrameNumbers('warrior_wall_slide', { start: 0, end: 3  }), frameRate: 8,  repeat: -1 });
    a.create({ key: 'warrior_wall_jump',  frames: a.generateFrameNumbers('warrior_wall_jump',  { start: 0, end: 3  }), frameRate: 12, repeat: 0  });
    a.create({ key: 'warrior_slide',      frames: a.generateFrameNumbers('warrior_slide',      { start: 0, end: 7  }), frameRate: 25, repeat: 0  });

    // Combo animations – 6 frames each – play once over 300 ms (20 fps)
    a.create({ key: 'combo_lateral_anim', frames: a.generateFrameNumbers('combo_lateral_anim', { start: 0, end: 5 }), frameRate: 20, repeat: 0 });
    a.create({ key: 'combo_down_anim',    frames: a.generateFrameNumbers('combo_down_anim',    { start: 0, end: 5 }), frameRate: 20, repeat: 0 });
    a.create({ key: 'combo_up_anim',      frames: a.generateFrameNumbers('combo_up_anim',      { start: 0, end: 5 }), frameRate: 20, repeat: 0 });
  }

  // ─── Animation helper ────────────────────────────────────────────────────────

  protected playAnim(key: string, ignoreIfPlaying = false) {
    this.play(key, ignoreIfPlaying);
  }

  // Shorthand: plays prefixed animation (e.g. 'idle' → 'fighter_idle' or 'archer_idle')
  protected playFighter(key: string, ignoreIfPlaying = false) {
    // Accept both full keys ('fighter_idle') and short keys ('idle')
    const fullKey = key.startsWith(this.animPrefix) ? key : `${this.animPrefix}_${key}`;
    this.play(fullKey, ignoreIfPlaying);
  }

  // ─── Public animation triggers ───────────────────────────────────────────────

  // Cycles attack1→attack2→attack3. Returns cooldown multiplier (0.5 for quick follow-up, 1 after last).
  triggerAttackAnim(): number {
    const seq = this.attackSequence;
    this.attackSequence = (seq + 1) % 3;
    if (this.usesSprite) {
      const anim = seq === 0 ? 'attack' : seq === 1 ? 'attack2' : 'attack3';
      this.playFighter(anim);
    }
    return seq < 2 ? 0.5 : 1;
  }

  triggerDeathAnim() {
    if (this.usesSprite) this.playFighter('death');
  }

  triggerWallJumpAnim() {
    if (this.usesSprite) this.playFighter('wall_jump');
  }

  triggerSlideAnim() {
    if (this.usesSprite) this.playFighter('slide');
  }

  triggerHurtAnim() {
    if (this.usesSprite) this.playFighter('hurt');
  }

  // ─── HP bar ──────────────────────────────────────────────────────────────────

  private get labelBaseY(): number {
    // Returns the Y coordinate of the character's visual head
    if (this.usesSprite) return this.y - this.headOffY;
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
      this.playFighter(this.hp <= 0 ? 'death' : 'hurt');
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
      const dmgText = this.scene.add.text(this.x, this.y - this.headOffY - 10, `-${amount}`, {
        fontSize: '14px', color: '#ff4444', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);
      this.scene.tweens.add({
        targets: dmgText, y: this.y - this.headOffY - 50, alpha: 0, duration: 700, ease: 'Power2',
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
        // Entering — reposition sprite toward wall then shrink body to pixel bounds.
        // Use separate OX for each wall side (sprite asymmetry when flipped).
        if (this.wallSide === 'right') {
          this.x += this.wsEnterDeltaRight;
          this.lastWallSide = 'right';
          body.setSize(this.wsBodyW, cfg.height / sx);
          body.setOffset(this.wsBodyOXRight, this.bodyOY);
        } else {
          this.x += this.wsEnterDeltaLeft;
          this.lastWallSide = 'left';
          body.setSize(this.wsBodyW, cfg.height / sx);
          body.setOffset(this.wsBodyOX, this.bodyOY);
        }
      } else if (!this.isWallSliding && this.wasWallSliding) {
        // Exiting — reposition sprite so normal body lands flush with wall on revert
        if (this.lastWallSide === 'right') this.x -= this.wsEnterDeltaRight;
        else                               this.x -= this.wsEnterDeltaLeft;
        body.setSize(cfg.width / sx, cfg.height / sx);
        body.setOffset(this.bodyOX, this.bodyOY);
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

  // Maps dash direction to animation key.
  // Diagonals: down-diagonals → combo_lateral_anim (combo.png), up-diagonals → combo_up_anim.
  // flipX is set separately based on comboDashVx.
  private static comboDashAnimKey(dx: number, dy: number): string {
    if (dy < 0) return 'combo_up_anim';      // up, up-left, up-right
    if (dy > 0) {
      if (dx === 0) return 'combo_down_anim'; // straight down
      return 'combo_lateral_anim';            // down-left, down-right → combo.png
    }
    return 'combo_lateral_anim';              // left, right
  }

  private archerAimSprite(): { key: string; isAnim: boolean; flipX: boolean } {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const vx   = Math.abs(body.velocity.x);
    const dx   = this.archerAimDx;
    const dy   = this.archerAimDy;
    const facingRight = this.facing === 'right';
    // For static poses: face toward aim direction (dx drives flip)
    const flipStatic = dx < 0 ? true : dx > 0 ? false : !facingRight;
    // "Back" = aiming opposite to facing direction
    const aimBack = (facingRight && dx < 0) || (!facingRight && dx > 0);

    if (!this.isGrounded) {
      let key: string;
      if      (dy > 0 && dx === 0) key = 'archer_aim_air_down';
      else if (dy > 0)             key = 'archer_aim_air_diag_down';
      else if (dy < 0 && dx === 0) key = 'archer_aim_air_up';
      else if (dy < 0)             key = 'archer_aim_air_diag_up';
      else                         key = 'archer_aim_air_front';
      return { key, isAnim: false, flipX: flipStatic };
    } else if (vx > 25) {
      let key: string;
      if (dy < 0 && dx === 0) {
        key = 'archer_aim_run_up';
      } else if (aimBack) {
        if      (dy < 0) key = 'archer_aim_run_back_diag_up';
        else if (dy > 0) key = 'archer_aim_run_back_diag_down';
        else             key = 'archer_aim_run_back';
      } else {
        if      (dy < 0) key = 'archer_aim_run_diag_up';
        else if (dy > 0) key = 'archer_aim_run_diag_down';
        else             key = 'archer_aim_run_front';
      }
      return { key, isAnim: true, flipX: !facingRight };
    } else {
      let key: string;
      if      (dy > 0 && dx === 0) key = 'archer_aim_idle_down';
      else if (dy > 0)             key = 'archer_aim_idle_diag_down';
      else if (dy < 0 && dx === 0) key = 'archer_aim_idle_up';
      else if (dy < 0)             key = 'archer_aim_idle_diag_up';
      else                         key = 'archer_aim_idle_front';
      return { key, isAnim: false, flipX: flipStatic };
    }
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
      this.setFlipX(this.comboDashVx < 0);
      const animKey = Player.comboDashAnimKey(this.comboAimDx, this.comboAimDy);
      if (this.anims.currentAnim?.key !== animKey) this.play(animKey);
      return;
    }

    // ── Archer aim pose ──────────────────────────────────────────────────────
    if (this.archerAiming && this.characterType === 'archer' && this.usesSprite) {
      const { key, isAnim, flipX } = this.archerAimSprite();
      if (isAnim) {
        if (this.anims.currentAnim?.key !== key) this.play(key, true);
      } else {
        if (this.texture.key !== key) { this.anims.stop(); this.setTexture(key); }
      }
      this.setFlipX(flipX);
      return;
    }

    // ── Normal animation ─────────────────────────────────────────────────────
    const body   = this.body as Phaser.Physics.Arcade.Body;
    const curKey = this.anims.currentAnim?.key ?? '';
    const pfx    = this.animPrefix;

    // One-shots: never interrupt while playing
    const oneShots = [`${pfx}_hurt`, `${pfx}_attack`, `${pfx}_attack2`, `${pfx}_attack3`, `${pfx}_death`, `${pfx}_wall_jump`, `${pfx}_slide`];
    if (oneShots.includes(curKey) && this.anims.isPlaying) return;

    // Restore base texture if we were showing a combo static image
    if (!curKey || !curKey.startsWith(pfx)) this.setTexture(`${pfx}_idle`);

    // Ground slide
    if (this.isSliding) {
      this.setFlipX(this.facing === 'left');
      this.playFighter('slide', true);
      return;
    }

    // Wall slide — face away from the wall
    if (this.isWallSliding) {
      this.setFlipX(this.wallSide === 'right');
      this.playFighter('wall_slide', true);
      return;
    }

    this.setFlipX(this.facing === 'left');

    const vx = Math.abs(body.velocity.x);
    const vy = body.velocity.y;

    if (!this.isGrounded) {
      if (vy < 0) {
        if (curKey !== `${pfx}_jump` && curKey !== `${pfx}_wall_jump`) this.playFighter('jump');
      } else {
        this.playFighter('fall', true);
      }
    } else if (vx > 25) {
      this.playFighter('run', true);
    } else {
      this.playFighter('idle', true);
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
    this.comboDashIsLateral = this.comboAimDy === 0;

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

  // ─── Archer aim ──────────────────────────────────────────────────────────────

  startArcherAim(facingRight: boolean) {
    this.archerAiming = true;
    this.archerAimDx  = facingRight ? 1 : -1;
    this.archerAimDy  = 0;
    if (!this.archerAimGfx) {
      this.archerAimGfx = this.scene.add.graphics().setDepth(20);
    }
  }

  updateArcherAim(dx: number, dy: number) {
    if (!this.archerAiming) return;
    this.archerAimDx = dx;
    this.archerAimDy = dy;
    this.drawAimIndicator();
  }

  cancelArcherAim() {
    this.archerAiming = false;
    this.archerAimGfx?.clear();
  }

  private drawAimIndicator() {
    const gfx = this.archerAimGfx;
    if (!gfx) return;
    gfx.clear();

    const len = Math.sqrt(this.archerAimDx ** 2 + this.archerAimDy ** 2) || 1;
    const nx = this.archerAimDx / len;
    const ny = this.archerAimDy / len;
    const lineLen = 40;

    gfx.lineStyle(2, 0xffdd88, 0.9);
    gfx.beginPath();
    gfx.moveTo(this.x, this.y - 10);
    gfx.lineTo(this.x + nx * lineLen, this.y - 10 + ny * lineLen);
    gfx.strokePath();

    // Arrowhead
    const angle = Math.atan2(ny, nx);
    const tipX = this.x + nx * lineLen;
    const tipY = this.y - 10 + ny * lineLen;
    const spread = 0.4;
    gfx.fillStyle(0xffdd88, 0.9);
    gfx.fillTriangle(
      tipX, tipY,
      tipX - Math.cos(angle - spread) * 8, tipY - Math.sin(angle - spread) * 8,
      tipX - Math.cos(angle + spread) * 8, tipY - Math.sin(angle + spread) * 8,
    );
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  destroy(fromScene?: boolean) {
    this.archerAimGfx?.destroy();
    this.hpBar?.destroy();
    this.nameLabel?.destroy();
    super.destroy(fromScene);
  }
}
