import Phaser from 'phaser';
import type { PlayerState, PlayerInput, ProjectileState } from 'shared';
import { MAP_CONFIGS } from 'shared';
import type { GameConfig } from '../../App';
import { BaseScene } from './BaseScene';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { colyseusClient, type RemoteBattleState } from '../network/colyseusClient';

const INPUT_SEND_RATE = 50; // ms

export class MultiplayerScene extends BaseScene {
  private players = new Map<string, Player>();
  private projectileSprites = new Map<string, Projectile>();
  private localId: string = '';
  private lastInputSent = 0;
  private lastInput: PlayerInput = { left: false, right: false, jump: false, attack: false };

  private statusText!: Phaser.GameObjects.Text;
  private deadOverlay!: Phaser.GameObjects.Text;

  constructor(config: GameConfig, onBack: () => void) {
    super('MultiplayerScene', config, onBack);
  }

  create() {
    this.buildMap();
    this.setupControls();
    this.drawMapLabel();

    const map = MAP_CONFIGS[this.config.mapId];
    const room = colyseusClient.getRoom();

    if (!room) {
      this.onBack();
      return;
    }

    this.localId = room.sessionId ?? '';

    this.statusText = this.add.text(map.width / 2, 16, 'MULTIPLAYER', {
      fontSize: '13px',
      color: '#f1c40f',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);

    this.deadOverlay = this.add.text(map.width / 2, map.height / 2, '', {
      fontSize: '28px',
      color: '#ff4444',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(200).setVisible(false).setScrollFactor(0);

    this.add.text(12, map.height - 12, 'WASD/Setas: mover  W/↑/Espaço: pular  Z/J: atacar  ESC: lobby', {
      fontSize: '10px',
      color: '#555577',
    }).setOrigin(0, 1).setDepth(100).setScrollFactor(0);

    room.onStateChange((state) => this.applyState(state));

    room.onLeave(() => {
      this.statusText.setText('Desconectado');
    });

    this.input.keyboard!.on('keydown-ESC', () => {
      colyseusClient.leave();
      this.onBack();
    });
  }

  update(_time: number, delta: number) {
    const now = Date.now();

    const input: PlayerInput = {
      left:   this.isLeft(),
      right:  this.isRight(),
      jump:   this.isJump(),
      attack: this.isAttack(),
    };

    if (now - this.lastInputSent >= INPUT_SEND_RATE) {
      if (this.hasInputChanged(input)) {
        colyseusClient.getRoom()?.send('input', input);
        this.lastInput = { ...input };
      }
      this.lastInputSent = now;
    }

    for (const player of this.players.values()) {
      player.update(delta);
    }
  }

  private hasInputChanged(next: PlayerInput): boolean {
    return (
      next.left   !== this.lastInput.left   ||
      next.right  !== this.lastInput.right  ||
      next.jump   !== this.lastInput.jump   ||
      next.attack !== this.lastInput.attack
    );
  }

  private applyState(state: RemoteBattleState) {
    if (state.phase === 'countdown') {
      this.statusText.setText(`Começa em ${state.countdown}...`);
    } else if (state.phase === 'battle') {
      this.statusText.setText('MULTIPLAYER');
    } else if (state.phase === 'finished') {
      const winText = state.winner === this.localId ? 'VITÓRIA!' : 'DERROTA!';
      this.statusText.setText(winText);
    }

    // Build player record for iteration
    const receivedIds = new Set<string>();
    state.players.forEach((_p, id) => receivedIds.add(id));

    state.players.forEach((pState, id) => {
      const isLocal = id === this.localId;
      const ps = pState as unknown as PlayerState;

      if (!this.players.has(id)) {
        this.spawnPlayer(id, ps, isLocal);
      }

      const player = this.players.get(id)!;

      if (isLocal) {
        player.setPosition(ps.x, ps.y);
      } else {
        player.setPosition(
          Phaser.Math.Linear(player.x, ps.x, 0.3),
          Phaser.Math.Linear(player.y, ps.y, 0.3),
        );
      }

      player.facing = ps.facing;
      player.setHp(ps.hp);

      if (ps.isDead) {
        player.setAlpha(0.3);
        if (isLocal) this.deadOverlay.setText('DERROTADO!\nAguardando...').setVisible(true);
      } else {
        player.setAlpha(1);
        if (isLocal) this.deadOverlay.setVisible(false);
      }
    });

    for (const [id, player] of this.players.entries()) {
      if (!receivedIds.has(id)) {
        player.destroy();
        this.players.delete(id);
      }
    }

    // Projectiles
    const receivedProjIds = new Set<string>();
    state.projectiles.forEach((_p, id) => receivedProjIds.add(id));

    state.projectiles.forEach((pState, id) => {
      const ps = pState as unknown as ProjectileState;
      if (!this.projectileSprites.has(id)) {
        const owner = (() => {
          let ownerType = 'fighter';
          state.players.forEach((p, k) => { if (k === ps.ownerId) ownerType = p.characterType; });
          return ownerType;
        })();
        const proj = new Projectile(this, ps.x, ps.y, owner as any, ps.ownerId, ps.velocityX);
        this.projectileSprites.set(id, proj);
      } else {
        this.projectileSprites.get(id)!.setPosition(ps.x, ps.y);
      }
    });

    for (const [id, proj] of this.projectileSprites.entries()) {
      if (!receivedProjIds.has(id)) {
        proj.destroy();
        this.projectileSprites.delete(id);
      }
    }
  }

  private spawnPlayer(id: string, pState: PlayerState, isLocal: boolean) {
    const label = isLocal ? 'VOCÊ' : 'INIMIGO';
    const player = new Player(this, pState.x, pState.y, pState.characterType, isLocal, label);
    this.players.set(id, player);
    if (isLocal) this.setupCamera(player);
  }

  shutdown() {
    // room event listeners are cleaned up by colyseus.js on leave
  }
}
