import Phaser from 'phaser';
import type { GameConfig } from '../../App';
import { BaseScene } from './BaseScene';
import { Player } from '../entities/Player';
import { CHARACTER_CONFIGS, MAP_CONFIGS } from 'shared';
import type { CharacterType } from 'shared';
import { touchInput } from '../touchInput';

const LERP_FACTOR   = 0.25; // remote player position smoothing
const INPUT_RATE_MS = 50;   // send rate to server (ms)

interface RemoteState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  facing: 'left' | 'right';
  isGrounded: boolean;
  hp: number;
  maxHp: number;
  isDead: boolean;
  characterType: CharacterType;
  team: string;
}

export class MultiplayerScene extends BaseScene {
  private localPlayer!: Player;
  private remoteSprite?: Phaser.GameObjects.Sprite;
  private remoteHpBar?: Phaser.GameObjects.Graphics;
  private remoteNameLabel?: Phaser.GameObjects.Text;

  // HUD texts
  private localHpText!: Phaser.GameObjects.Text;
  private remoteHpText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private phaseOverlay?: Phaser.GameObjects.Rectangle;
  private phaseLabel?: Phaser.GameObjects.Text;

  // Remote player lerp targets
  private remoteTargetX = 0;
  private remoteTargetY = 0;
  private remoteState?: RemoteState;
  private remoteAnimPrefix = 'fighter';
  private remoteCurrentAnim = '';

  // Input
  private inputTimer   = 0;
  private pendingJump   = false;
  private pendingAttack = false;

  // Local physics prediction
  private localJumpsUsed = 0;

  // Game state
  private localSessionId = '';
  private phase = 'waiting';
  private hasShownFinish = false;

  constructor(config: GameConfig, onBack: () => void) {
    super('MultiplayerScene', config, onBack);
  }

  create() {
    this.buildMap();
    this.buildDecorations();
    this.setupControls();
    this.drawMapLabel();

    const map   = MAP_CONFIGS[this.config.mapId];
    const spawn = map.spawnPoints[0];

    this.localPlayer = new Player(
      this, spawn.x, spawn.y - 40,
      this.config.characterType, true, 'VOCÊ',
    );
    this.physics.add.collider(this.localPlayer, this.platforms);

    const room = this.config.multiplayerRoom!;
    this.localSessionId = room.sessionId;

    // Set up remote sprite (created lazily when remote player appears)
    this.setupHUD(map.width, map.height);

    // Subscribe to state changes
    room.onStateChange((state: any) => this.syncState(state));

    // Initial sync from current state
    if (room.state) this.syncState(room.state as any);

    this.input.keyboard!.on('keydown-ESC', () => {
      room.leave();
      this.onBack();
    });

    this.setupCamera(this.localPlayer);
  }

  update(_time: number, delta: number) {
    if (this.phase !== 'battle') return;

    const room = this.config.multiplayerRoom!;
    const cfg  = CHARACTER_CONFIGS[this.config.characterType];
    const body = this.localPlayer.body as Phaser.Physics.Arcade.Body;

    // ── Read input (JustDown consumed once here) ──────────────────────────────
    const left   = this.isLeft();
    const right  = this.isRight();
    const jump   = this.isJump();   // JustDown — true only on press frame
    const attack = this.isAttack(); // JustDown — true only on press frame

    // Accumulate one-shot inputs between server sends so they're never lost
    if (jump)   this.pendingJump   = true;
    if (attack) this.pendingAttack = true;

    // ── Client-side prediction: move local player immediately ─────────────────
    if (left) {
      this.localPlayer.setVelocityX(-cfg.speed);
      this.localPlayer.setFlipX(true);
    } else if (right) {
      this.localPlayer.setVelocityX(cfg.speed);
      this.localPlayer.setFlipX(false);
    } else {
      this.localPlayer.setVelocityX(body.velocity.x * 0.7);
    }

    if (body.blocked.down) this.localJumpsUsed = 0;
    if (jump && this.localJumpsUsed < 2) {
      this.localPlayer.setVelocityY(cfg.jumpForce);
      this.localJumpsUsed++;
    }

    // ── Send input to server at fixed rate ────────────────────────────────────
    this.inputTimer += delta;
    if (this.inputTimer >= INPUT_RATE_MS) {
      this.inputTimer = 0;
      room.send('input', {
        left,
        right,
        jump:   this.pendingJump,
        attack: this.pendingAttack,
      });
      this.pendingJump   = false;
      this.pendingAttack = false;
    }

    // ── Remote player lerp ────────────────────────────────────────────────────
    if (this.remoteSprite && this.remoteState) {
      this.remoteSprite.x = Phaser.Math.Linear(this.remoteSprite.x, this.remoteTargetX, LERP_FACTOR);
      this.remoteSprite.y = Phaser.Math.Linear(this.remoteSprite.y, this.remoteTargetY, LERP_FACTOR);
      this.updateRemoteAnim(this.remoteState);
      this.updateRemoteHpBar();
    }
  }

  // ── State sync ────────────────────────────────────────────────────────────

  private syncState(state: any) {
    if (!state?.players) return;

    this.phase = state.phase ?? 'waiting';
    this.updatePhaseOverlay(state.phase, state.countdown ?? 0, state.winner ?? '');

    state.players.forEach((p: any, id: string) => {
      if (id === this.localSessionId) {
        // Update local HP HUD from server
        this.updateLocalHud(p.hp, p.maxHp);
      } else {
        // Remote player
        this.remoteTargetX = p.x;
        this.remoteTargetY = p.y;
        this.remoteState = {
          x: p.x, y: p.y,
          velocityX: p.velocityX, velocityY: p.velocityY,
          facing: p.facing, isGrounded: p.isGrounded,
          hp: p.hp, maxHp: p.maxHp, isDead: p.isDead,
          characterType: p.characterType as CharacterType,
          team: p.team ?? '',
        };
        this.ensureRemoteSprite(p.characterType as CharacterType);
        this.updateRemoteHpLabel(p.hp, p.maxHp, p.team);

        if (this.remoteSprite) {
          this.remoteSprite.setFlipX(p.facing === 'left');
          this.remoteSprite.setAlpha(p.isDead ? 0.3 : 1);
        }
      }
    });
  }

  // ── Remote sprite ────────────────────────────────────────────────────────

  private ensureRemoteSprite(characterType: CharacterType) {
    if (this.remoteSprite && this.remoteAnimPrefix === this.getSpritePrefix(characterType)) return;

    this.remoteSprite?.destroy();
    this.remoteHpBar?.destroy();
    this.remoteNameLabel?.destroy();

    const prefix = this.getSpritePrefix(characterType);
    this.remoteAnimPrefix = prefix;

    const pos = this.remoteState ?? { x: this.remoteTargetX, y: this.remoteTargetY };

    this.remoteSprite = this.add.sprite(pos.x, pos.y, `${prefix}_idle`)
      .setScale(0.5)
      .setDepth(5);

    this.remoteHpBar = this.add.graphics().setDepth(10).setScrollFactor(0);
    this.remoteNameLabel = this.add.text(0, 0, '', {
      fontSize: '10px', color: '#ff6666', stroke: '#000', strokeThickness: 2,
    }).setDepth(11).setScrollFactor(0).setOrigin(0.5, 1);
  }

  private getSpritePrefix(characterType: CharacterType) {
    if (characterType === 'archer') return 'archer';
    if (characterType === 'tank')   return 'warrior';
    return 'fighter';
  }

  private updateRemoteAnim(state: RemoteState) {
    const sprite = this.remoteSprite!;
    const prefix = this.remoteAnimPrefix;

    let anim: string;
    if (state.isDead) {
      anim = `${prefix}_death`;
    } else if (!state.isGrounded && state.velocityY < 0) {
      anim = `${prefix}_jump`;
    } else if (!state.isGrounded && state.velocityY > 0) {
      anim = `${prefix}_fall`;
    } else if (Math.abs(state.velocityX) > 20) {
      anim = `${prefix}_run`;
    } else {
      anim = `${prefix}_idle`;
    }

    if (anim !== this.remoteCurrentAnim) {
      this.remoteCurrentAnim = anim;
      if (this.anims.exists(anim)) {
        sprite.play(anim, true);
      }
    }
  }

  private updateRemoteHpBar() {
    if (!this.remoteHpBar || !this.remoteSprite || !this.remoteState) return;

    const map = MAP_CONFIGS[this.config.mapId];
    const screenX = this.remoteSprite.x - this.cameras.main.scrollX;
    const screenY = this.remoteSprite.y - this.cameras.main.scrollY - 56;
    const pct     = Math.max(0, this.remoteState.hp / this.remoteState.maxHp);
    const barW    = 48;
    const barH    = 5;

    this.remoteHpBar.clear();
    this.remoteHpBar.fillStyle(0x222222, 0.8);
    this.remoteHpBar.fillRect(screenX - barW / 2, screenY, barW, barH);
    this.remoteHpBar.fillStyle(pct > 0.5 ? 0x22cc55 : pct > 0.25 ? 0xf59e0b : 0xef4444);
    this.remoteHpBar.fillRect(screenX - barW / 2, screenY, Math.round(barW * pct), barH);

    if (this.remoteNameLabel) {
      this.remoteNameLabel.setPosition(screenX, screenY - 2);
    }
  }

  private updateRemoteHpLabel(hp: number, maxHp: number, team: string) {
    if (!this.remoteNameLabel) return;
    const color = team === 'A' ? '#60a5fa' : '#f87171';
    this.remoteNameLabel.setText(`HP ${hp}/${maxHp}`).setColor(color);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  private setupHUD(w: number, h: number) {

    this.localHpText = this.add.text(12, h - 12, '', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0, 1).setDepth(100).setScrollFactor(0);

    this.remoteHpText = this.add.text(w - 12, h - 12, '', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(1, 1).setDepth(100).setScrollFactor(0);

    this.phaseText = this.add.text(w / 2, 16, '', {
      fontSize: '13px', color: '#f1c40f', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);

    this.add.text(w / 2, h - 12,
      'WASD/Setas: mover  W/↑/Espaço: pular  Z/J: atacar  ESC: sair', {
        fontSize: '10px', color: '#555577',
      }).setOrigin(0.5, 1).setDepth(100).setScrollFactor(0);
  }

  private updateLocalHud(hp: number, maxHp: number) {
    this.localHpText?.setText(`Você: HP ${hp}/${maxHp}`);
  }

  // ── Phase overlays ─────────────────────────────────────────────────────────

  private updatePhaseOverlay(phase: string, countdown: number, winner: string) {
    const map = MAP_CONFIGS[this.config.mapId];
    const w = map.width;
    const h = map.height;

    if (phase === 'waiting') {
      this.phaseText?.setText('Aguardando oponente…');
      return;
    }

    if (phase === 'countdown') {
      this.phaseText?.setText('');
      if (!this.phaseOverlay) {
        this.phaseOverlay = this.add.rectangle(w / 2, h / 2, w, h, 0x050014, 0.5)
          .setDepth(200).setScrollFactor(0);
        this.phaseLabel = this.add.text(w / 2, h / 2, '', {
          fontSize: '96px',
          color: '#FFD700',
          stroke: '#7c3800',
          strokeThickness: 6,
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
      }
      this.phaseLabel?.setText(String(countdown || 1));
      return;
    }

    if (phase === 'battle') {
      this.phaseOverlay?.destroy();
      this.phaseLabel?.destroy();
      this.phaseOverlay = undefined;
      this.phaseLabel  = undefined;
      this.phaseText?.setText('');
      return;
    }

    if (phase === 'finished' && !this.hasShownFinish) {
      this.hasShownFinish = true;
      const isWinner = winner === this.localSessionId;
      const msg      = isWinner ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU';
      const color    = isWinner ? '#FFD700' : '#ef4444';

      if (!this.phaseOverlay) {
        this.phaseOverlay = this.add.rectangle(w / 2, h / 2, w, h, 0x050014, 0.7)
          .setDepth(200).setScrollFactor(0);
      }
      this.add.text(w / 2, h / 2 - 32, msg, {
        fontSize: '56px', color, stroke: '#000', strokeThickness: 5, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

      this.add.text(w / 2, h / 2 + 40, 'ESC para sair', {
        fontSize: '16px', color: '#aaaaaa',
      }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    }
  }
}
