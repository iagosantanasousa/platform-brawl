import Phaser from 'phaser';
import type { MapId, PlatformDef } from 'shared';
import { MAP_CONFIGS } from 'shared';
import type { GameConfig } from '../../App';
import { touchInput } from '../touchInput';

const TILE_SIZE = 32;
// Minimum height for wall sliding — anything taller than a single tile (32px).
const WALLABLE_MIN_HEIGHT = 64;

export abstract class BaseScene extends Phaser.Scene {
  protected config: GameConfig;
  protected onBack: () => void;
  protected platforms!: Phaser.Physics.Arcade.StaticGroup;
  // Subset of platforms tall enough to wall-slide on.
  protected wallableDefs: PlatformDef[] = [];
  protected cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  protected wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    attack: Phaser.Input.Keyboard.Key;
    attack2: Phaser.Input.Keyboard.Key;
  };
  protected comboKey!: Phaser.Input.Keyboard.Key;

  constructor(key: string, config: GameConfig, onBack: () => void) {
    super({ key });
    this.config = config;
    this.onBack = onBack;
  }

  preload() {
    // Terrain tiles — 32×32 px each
    for (let i = 1; i <= 60; i++) {
      const n = String(i).padStart(2, '0');
      this.load.image(`tile_${n}`, `/sprites/tiles/Tile_${n}.png`);
    }

    // Willow trees (decorative, RGBA)
    this.load.image('willow1', '/sprites/trees/willow1.png');
    this.load.image('willow2', '/sprites/trees/willow2.png');
    this.load.image('willow3', '/sprites/trees/willow3.png');

    // Rocks / bushes (decorative, RGBA)
    for (let i = 1; i <= 9; i++) {
      this.load.image(`bush${i}`, `/sprites/bushes/bush${i}.png`);
    }

    // Dry trees (decorative, RGBA)
    for (let i = 1; i <= 3; i++) {
      this.load.image(`drytree${i}`, `/sprites/drytrees/drytree${i}.png`);
    }

    // Map background
    this.load.image('map_bg', '/sprites/background.png');

    // Character sprite sheets – 256×256 px per frame, displayed at scale 0.5
    const v = '?v=256x256b';
    // Fighter sprites
    this.load.spritesheet('fighter_idle',       `/sprites/fighter/idle.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_run',        `/sprites/fighter/run.png${v}`,        { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_jump',       `/sprites/fighter/jump.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_fall',       `/sprites/fighter/fall.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_attack',      `/sprites/fighter/attack.png${v}`,      { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_attack2',     `/sprites/fighter/attack2.png${v}`,     { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_hurt',       `/sprites/fighter/hurt.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_death',      `/sprites/fighter/death.png${v}`,      { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_wall_slide', `/sprites/fighter/wall_slide.png${v}`, { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_wall_jump',  `/sprites/fighter/wall_jump.png${v}`,  { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('fighter_slide',      `/sprites/fighter/slide.png${v}`,      { frameWidth: 256, frameHeight: 256 });
    // Archer sprites
    this.load.spritesheet('archer_idle',       `/sprites/archer/idle.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_run',        `/sprites/archer/run.png${v}`,        { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_jump',       `/sprites/archer/jump.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_fall',       `/sprites/archer/fall.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_attack',     `/sprites/archer/attack.png${v}`,     { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_attack2',    `/sprites/archer/attack2.png${v}`,    { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_hurt',       `/sprites/archer/hurt.png${v}`,       { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_death',      `/sprites/archer/death.png${v}`,      { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_wall_slide', `/sprites/archer/wall_slide.png${v}`, { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_wall_jump',  `/sprites/archer/wall_jump.png${v}`,  { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('archer_slide',      `/sprites/archer/slide.png${v}`,      { frameWidth: 256, frameHeight: 256 });

    // Combo animation spritesheets — 6 frames each, play once during dash
    this.load.spritesheet('combo_lateral_anim', `/sprites/fighter/combo_lateral.png?v=cl1`,  { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('combo_down_anim',    `/sprites/fighter/combo_down_anim.png?v=cl1`, { frameWidth: 256, frameHeight: 256 });
    this.load.spritesheet('combo_up_anim',      `/sprites/fighter/combo_up_anim.png?v=cl1`,   { frameWidth: 256, frameHeight: 256 });

    // Combo sprites — single-frame 256×256 images
    const vc = '?v=combo2';
    this.load.image('combo_lateral',    `/sprites/fighter/combo/combo_lateral.png${vc}`);
    this.load.image('combo_dash',       `/sprites/fighter/combo/combo_dash.png${vc}`);
    this.load.image('combo_up',         `/sprites/fighter/combo/combo_up.png${vc}`);
    this.load.image('combo_up_left',    `/sprites/fighter/combo/combo_up_left.png${vc}`);
    this.load.image('combo_up_right',   `/sprites/fighter/combo/combo_up_right.png${vc}`);
    this.load.image('combo_left',       `/sprites/fighter/combo/combo_left.png${vc}`);
    this.load.image('combo_right',      `/sprites/fighter/combo/combo_right.png${vc}`);
    this.load.image('combo_down',       `/sprites/fighter/combo/combo_down.png${vc}`);
    this.load.image('combo_down_left',  `/sprites/fighter/combo/combo_down_left.png${vc}`);
    this.load.image('combo_down_right', `/sprites/fighter/combo/combo_down_right.png${vc}`);
  }

  // Generates a horizontally-flipped copy of a tile texture, cached as `${key}_fx`.
  private ensureFlippedTile(key: string): string {
    const flipped = `${key}_fx`;
    if (!this.textures.exists(flipped)) {
      const rt  = this.add.renderTexture(0, 0, TILE_SIZE, TILE_SIZE);
      const img = this.make.image({ x: TILE_SIZE / 2, y: TILE_SIZE / 2, key, add: false });
      img.setFlipX(true);
      rt.draw(img);
      rt.saveTexture(flipped);
      rt.destroy();
      img.destroy();
    }
    return flipped;
  }

  protected buildMap() {
    const mapCfg = MAP_CONFIGS[this.config.mapId];
    this.cameras.main.setBackgroundColor(mapCfg.backgroundColor);

    // Pre-generate flipped tile needed for the right boundary wall.
    this.ensureFlippedTile('tile_11');

    this.platforms    = this.physics.add.staticGroup();
    this.wallableDefs = [];

    for (const plat of mapCfg.platforms) {
      // Include x in the key so walls at different positions get distinct textures.
      const texKey = `plat_${plat.x}_${plat.width}_${plat.height}`;

      if (!this.textures.exists(texKey)) {
        const cols = Math.round(plat.width  / TILE_SIZE);
        const rows = Math.round(plat.height / TILE_SIZE);
        const rt   = this.add.renderTexture(0, 0, plat.width, plat.height);

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const key = this.getTileKey(col, row, cols, rows, plat.x, mapCfg.width);
            // stamp(key, frame, x, y) — x,y is the center of the tile within the RT
            rt.stamp(key, undefined,
              col * TILE_SIZE + TILE_SIZE / 2,
              row * TILE_SIZE + TILE_SIZE / 2,
            );
          }
        }

        rt.saveTexture(texKey);
        rt.destroy();
      }

      const sprite = this.platforms.create(
        plat.x + plat.width / 2,
        plat.y + plat.height / 2,
        texKey,
      ) as Phaser.Physics.Arcade.Sprite;

      sprite.setImmovable(true);
      sprite.refreshBody();

      if (plat.height >= WALLABLE_MIN_HEIGHT) this.wallableDefs.push(plat);
    }
  }

  // Places willow trees, dry trees and rocks as non-interactive background decorations (depth = -1).
  protected buildDecorations() {
    const map = MAP_CONFIGS[this.config.mapId];
    const groundY = map.platforms.find(p => p.y > 400)?.y ?? 508;

    // Tiled background image — stretched to fill the map, 60% opacity, behind everything
    this.add.image(map.width / 2, map.height / 2, 'map_bg')
      .setDisplaySize(map.width, map.height)
      .setAlpha(0.3)
      .setDepth(-10);

    const positions: Record<string, { key: string; x: number; y: number; scale?: number }[]> = {
      arena: [
        // Willow trees along ground
        { key: 'willow1', x: 72,  y: groundY },
        { key: 'willow3', x: 480, y: groundY },
        { key: 'willow2', x: 890, y: groundY },
        // Dry trees on ground
        { key: 'drytree2', x: 290, y: groundY },
        { key: 'drytree1', x: 670, y: groundY },
        // Rocks/bushes on ground
        { key: 'bush5',  x: 148, y: groundY },
        { key: 'bush8',  x: 370, y: groundY },
        { key: 'bush9',  x: 600, y: groundY },
        { key: 'bush3',  x: 830, y: groundY },
        // Rocks/bushes on top of platforms
        { key: 'bush1',  x: 112, y: 384 },   // left mid platform
        { key: 'bush6',  x: 740, y: 384 },   // right mid platform
        { key: 'bush2',  x: 420, y: 288 },   // center high platform
        { key: 'bush4',  x: 76,  y: 224 },   // left high platform
        { key: 'bush7',  x: 852, y: 224 },   // right high platform
      ],
      corridors: [
        // Willow trees on ground
        { key: 'willow1', x: 160, y: groundY },
        { key: 'willow2', x: 800, y: groundY },
        { key: 'willow3', x: 480, y: 384 },  // on top of center pillar
        // Dry trees on ground
        { key: 'drytree3', x: 210, y: groundY },
        { key: 'drytree1', x: 750, y: groundY },
        // Rocks/bushes on ground
        { key: 'bush8',  x: 80,  y: groundY },
        { key: 'bush5',  x: 340, y: groundY },
        { key: 'bush9',  x: 620, y: groundY },
        { key: 'bush3',  x: 900, y: groundY },
        // Rocks/bushes on platforms
        { key: 'bush1',  x: 100, y: 320 },   // mid-level left
        { key: 'bush2',  x: 780, y: 320 },   // mid-level right
        { key: 'bush6',  x: 444, y: 384 },   // top of center pillar
        { key: 'bush4',  x: 50,  y: 192 },   // upper left
        { key: 'bush7',  x: 840, y: 192 },   // upper right
        { key: 'bush4',  x: 316, y: 240 },   // upper center left platform
        { key: 'bush2',  x: 600, y: 240 },   // upper center right platform
        { key: 'bush1',  x: 480, y: 144 },   // top center bridge
      ],
    };

    for (const d of positions[this.config.mapId] ?? []) {
      this.add.image(d.x, d.y, d.key)
        .setOrigin(0.5, 1)
        .setDepth(-1)
        .setScale(d.scale ?? 1);
    }
  }

  private getTileKey(
    col: number, row: number,
    cols: number, rows: number,
    platX = 0, mapWidth = 960,
  ): string {
    const top    = row === 0;
    const bottom = row === rows - 1;

    // Single-column structures (boundary walls, narrow pillars)
    if (cols === 1) {
      const isLeftWall  = platX === 0;
      const isRightWall = platX + TILE_SIZE >= mapWidth;
      if (top)    return isRightWall ? 'tile_03' : 'tile_01';
      if (bottom) return isRightWall ? 'tile_23' : 'tile_21';
      if (isLeftWall)  return 'tile_13';   // inner face of left boundary
      if (isRightWall) return 'tile_16';   // inner (left) face of right boundary
      return 'tile_12';
    }

    // Treat edges only when there is more than 1 tile in that axis
    const left  = col === 0;
    const right = col === cols - 1;

    if (top    && left)  return 'tile_01';
    if (top    && right) return 'tile_03';
    if (bottom && left)  return 'tile_21';
    if (bottom && right) return 'tile_23';
    if (top)             return 'tile_02';
    if (bottom)          return 'tile_22';
    if (left)            return 'tile_11';
    if (right)           return 'tile_17';

    // Interior — subtle variety based on grid position
    const v = (col * 3 + row * 7) % 6;
    if (v === 5) return 'tile_26';
    if (v === 4) return 'tile_12';
    if (v === 3) return 'tile_19';
    return 'tile_04';
  }

  protected setupControls() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:      this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right:   this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      attack:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      attack2: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.J),
    };
    this.comboKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  }

  protected isJump(): boolean {
    const touch = touchInput.jumpPressed;
    if (touch) touchInput.jumpPressed = false;
    return (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space!) ||
      touch
    );
  }

  protected isLeft(): boolean {
    return this.cursors.left.isDown || this.wasd.left.isDown || touchInput.left;
  }

  protected isRight(): boolean {
    return this.cursors.right.isDown || this.wasd.right.isDown || touchInput.right;
  }

  protected isAttackHeld(): boolean {
    return this.wasd.attack.isDown || this.wasd.attack2.isDown || touchInput.attackHeld;
  }

  protected isArcherAimHeld(): boolean {
    return this.wasd.attack.isDown || this.wasd.attack2.isDown || touchInput.archerAimHeld;
  }

  protected getArcherAimDir(facing: 'left' | 'right'): { dx: number; dy: number } {
    // Touch joystick takes priority
    if (Math.abs(touchInput.archerAimX) > 0.1 || Math.abs(touchInput.archerAimY) > 0.1) {
      const dx = touchInput.archerAimX > 0.3 ? 1 : touchInput.archerAimX < -0.3 ? -1 : 0;
      const dy = touchInput.archerAimY > 0.3 ? 1 : touchInput.archerAimY < -0.3 ? -1 : 0;
      if (dx !== 0 || dy !== 0) return { dx, dy };
    }
    // Keyboard: arrow keys for aim direction
    const dx = this.cursors.right.isDown ? 1 : this.cursors.left.isDown ? -1 : 0;
    const dy = this.cursors.down.isDown  ? 1 : this.cursors.up.isDown   ? -1 : 0;
    if (dx !== 0 || dy !== 0) return { dx, dy };
    // Default: facing direction
    return { dx: facing === 'right' ? 1 : -1, dy: 0 };
  }

  protected isAttack(): boolean {
    const touch = touchInput.attackPressed;
    if (touch) touchInput.attackPressed = false;
    return (
      Phaser.Input.Keyboard.JustDown(this.wasd.attack) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.attack2) ||
      touch
    );
  }

  // Slide uses the same key as combo (Q / CMB button).
  // When grounded → slide; when in air → combo aim.
  protected isSlide(): boolean {
    const touch = touchInput.slidePressed;
    if (touch) touchInput.slidePressed = false;
    return Phaser.Input.Keyboard.JustDown(this.comboKey) || touch;
  }

  protected isComboHeld(): boolean {
    return this.comboKey.isDown || touchInput.comboHeld;
  }

  // Returns the 8-directional combo aim vector.
  // Touch: driven by comboAimX/Y from the CMB drag-joystick.
  // Keyboard: arrow keys (separate from WASD movement).
  // Defaults to player facing when no input is active.
  protected getComboAimDir(facing: 'left' | 'right'): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    const tx = touchInput.comboAimX;
    const ty = touchInput.comboAimY;
    if (Math.abs(tx) > 0.25 || Math.abs(ty) > 0.25) {
      dx = tx > 0.25 ? 1 : tx < -0.25 ? -1 : 0;
      dy = ty > 0.25 ? 1 : ty < -0.25 ? -1 : 0;
    } else {
      dx = this.cursors.right.isDown ? 1 : this.cursors.left.isDown ? -1 : 0;
      dy = this.cursors.down.isDown ? 1 : this.cursors.up.isDown ? -1 : 0;
    }
    if (dx === 0 && dy === 0) dx = facing === 'right' ? 1 : -1;
    return { dx, dy };
  }

  // Returns which side of the player is touching a wallable platform, or null.
  protected wallableAdjacentSide(
    body: Phaser.Physics.Arcade.Body,
  ): 'left' | 'right' | null {
    if (!body.blocked.left && !body.blocked.right) return null;

    const bLeft   = body.x;
    const bRight  = body.x + body.width;
    const bTop    = body.y;
    const bBottom = body.y + body.height;
    const tol = 5;

    for (const w of this.wallableDefs) {
      const wLeft   = w.x;
      const wRight  = w.x + w.width;
      const wTop    = w.y;
      const wBottom = w.y + w.height;

      // Must overlap vertically
      if (bBottom <= wTop || bTop >= wBottom) continue;

      if (body.blocked.right && Math.abs(bRight - wLeft)  <= tol) return 'right';
      if (body.blocked.left  && Math.abs(bLeft  - wRight) <= tol) return 'left';
    }
    return null;
  }

  protected drawMapLabel() {
    const mapCfg = MAP_CONFIGS[this.config.mapId];
    this.add.text(8, 8, mapCfg.label, {
      fontSize: '11px',
      color: '#666688',
    }).setDepth(100).setScrollFactor(0);
  }

  protected setupCamera(target: Phaser.GameObjects.GameObject) {
    const map = MAP_CONFIGS[this.config.mapId];
    const isMobile = this.config.platform === 'mobile';
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.cameras.main.setZoom(isMobile ? 1.76 : 1.6);
    const lerp = isMobile ? 0.15 : 0.1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.cameras.main.startFollow(target as any, true, lerp, lerp);
  }
}
