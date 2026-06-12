import Phaser from 'phaser';
import type { GameConfig, TeamSlot } from '../../App';
import { BaseScene } from './BaseScene';
import { Player } from '../entities/Player';
import { Dummy } from '../entities/Dummy';
import { AIEnemy } from '../entities/AIEnemy';
import { Projectile } from '../entities/Projectile';
import { CHARACTER_CONFIGS, MAP_CONFIGS } from 'shared';
import { touchInput } from '../touchInput';

const WALL_SLIDE_SPEED    = 70;
const WALL_JUMP_VX        = 340;
const WALL_JUMP_GRACE     = 250;
const SLIDE_DURATION      = 320;
const SLIDE_COOLDOWN      = 5000;
const BATTLE_DURATION     = 300_000;
const PLAYER_RESPAWN_DELAY = 5000;

interface BattleMember {
  entity: Player | AIEnemy;
  slot: TeamSlot;
  teamIndex: 0 | 1;
  name: string;
  kills: number;
  deaths: number;
  isHuman: boolean;
}

export class TrainingScene extends BaseScene {
  private player!: Player;
  private dummy?: Dummy;
  private aiEnemy?: AIEnemy;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cooldownText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private restartKey!: Phaser.Input.Keyboard.Key;

  // Team battle state
  private isBattleMode = false;
  private battleMembers: BattleMember[] = [];
  private humanMember?: BattleMember;
  private playerLastHitBy: AIEnemy | null = null;
  private playerDead = false;
  private playerRespawnCD = 0;
  private battleTimer = BATTLE_DURATION;
  private battleEnded = false;
  private scoreboardText?: Phaser.GameObjects.Text;

  constructor(config: GameConfig, onBack: () => void) {
    super('TrainingScene', config, onBack);
  }

  create() {
    this.buildMap();
    this.buildDecorations();
    this.setupControls();
    this.drawMapLabel();

    this.projectiles = this.physics.add.group({
      classType: Projectile,
      runChildUpdate: false,
    });

    if (this.config.teamBattle) {
      this.isBattleMode = true;
      this.initTeamBattle();
    } else {
      this.initSoloMode();
    }

    this.physics.add.collider(
      this.projectiles,
      this.platforms,
      (proj) => (proj as Projectile).destroy(),
    );

    const map = MAP_CONFIGS[this.config.mapId];
    const cx  = map.width / 2;

    this.modeText = this.add.text(cx, 16,
      this.isBattleMode ? 'BATALHA — 5:00' : 'MODO TREINO', {
        fontSize: '13px', color: '#f1c40f', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(100).setScrollFactor(0);

    this.hpText = this.add.text(map.width - 12, map.height - 12, '', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(1, 1).setDepth(100).setScrollFactor(0);

    this.cooldownText = this.add.text(cx, map.height - 12, '', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5, 1).setDepth(100).setScrollFactor(0);

    this.add.text(12, map.height - 12,
      'WASD/Setas: mover  W/↑/Espaço: pular  Z/J: atacar  Q: combo (no ar)  R: resetar', {
        fontSize: '10px', color: '#555577',
      }).setOrigin(0, 1).setDepth(100).setScrollFactor(0);

    if (this.isBattleMode) {
      // Scoreboard panel — top-left corner, fixed on screen
      this.add.rectangle(6, 34, 210, 140, 0x000000, 0.65)
        .setOrigin(0, 0).setDepth(100).setScrollFactor(0);
      this.scoreboardText = this.add.text(12, 38, '', {
        fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(101).setScrollFactor(0);
      this.updateScoreboard();
    }

    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.input.keyboard!.on('keydown-ESC', () => this.onBack());
    this.setupCamera(this.player);
  }

  // ── Initialization ────────────────────────────────────────────────────────

  private initSoloMode() {
    const map   = MAP_CONFIGS[this.config.mapId];
    const spawn = map.spawnPoints[0];

    this.player = new Player(this, spawn.x, spawn.y - 40, this.config.characterType, true, 'VOCÊ');

    if (this.config.enableEnemy) {
      const es = map.spawnPoints[1] ?? { x: map.width - 160, y: 440 };
      this.aiEnemy = new AIEnemy(this, es.x, es.y);
    } else {
      this.dummy = new Dummy(this, map.width / 2, 300);
    }

    this.physics.add.collider(this.player, this.platforms);
    if (this.dummy)   this.physics.add.collider(this.dummy, this.platforms);
    if (this.aiEnemy) this.physics.add.collider(this.aiEnemy, this.platforms);

    if (this.dummy) {
      this.physics.add.overlap(this.player, this.dummy, () => {
        if (this.player.comboState === 'dashing' && !this.player.getData('comboHit')) {
          this.player.setData('comboHit', true);
          const cfg = CHARACTER_CONFIGS[this.config.characterType];
          const kbDir = this.player.comboDashVx >= 0 ? 1 : -1;
          this.dummy!.hitDummy(cfg.comboDamage ?? 32, kbDir * cfg.knockbackForce * 1.5);
          this.player.endCombo();
        }
      });
    }

    if (this.aiEnemy) {
      this.physics.add.overlap(this.player, this.aiEnemy, () => {
        if (this.player.comboState === 'dashing' && !this.player.getData('comboHit')) {
          this.player.setData('comboHit', true);
          const cfg = CHARACTER_CONFIGS[this.config.characterType];
          const kbDir = this.player.comboDashVx >= 0 ? 1 : -1;
          this.aiEnemy!.takeHit(cfg.comboDamage ?? 32, kbDir * cfg.knockbackForce * 1.5);
          this.player.endCombo();
        }
      });
    }
  }

  private initTeamBattle() {
    const tb  = this.config.teamBattle!;
    const map = MAP_CONFIGS[this.config.mapId];

    // Spawn positions spread across different platforms/heights per map
    const SPAWNS: Record<string, { A: {x:number;y:number}[]; B: {x:number;y:number}[] }> = {
      arena: {
        A: [{ x: 160, y: 460 }, { x: 176, y: 340 }, { x: 128, y: 180 }],
        B: [{ x: 800, y: 460 }, { x: 784, y: 340 }, { x: 864, y: 180 }],
      },
      coliseum: {
        // Ground → left mid platform (y=384) → left high platform (y=224)
        A: [{ x: 200, y: 460 }, { x: 176, y: 340 }, { x: 128, y: 180 }],
        // Mirror positions on the right side
        B: [{ x: 3640, y: 460 }, { x: 3664, y: 340 }, { x: 3712, y: 180 }],
      },
    };
    const mapSpawns = SPAWNS[map.id] ?? {
      A: [{ x: map.width * 0.2, y: 460 }, { x: map.width * 0.2, y: 340 }, { x: map.width * 0.2, y: 200 }],
      B: [{ x: map.width * 0.8, y: 460 }, { x: map.width * 0.8, y: 340 }, { x: map.width * 0.8, y: 200 }],
    };
    const spawnsA = mapSpawns.A;
    const spawnsB = mapSpawns.B;

    const addMember = (
      slot: TeamSlot, teamIndex: 0 | 1,
      pos: { x: number; y: number }, idx: number,
    ): BattleMember => {
      const mname = `${slot.characterType}_${teamIndex === 0 ? 'A' : 'B'}${idx}`;
      let entity: Player | AIEnemy;

      if (slot.role === 'player') {
        entity = new Player(this, pos.x, pos.y - 40, slot.characterType, true, 'VOCÊ');
        entity.setName(mname);
        this.player = entity;
      } else {
        const label = `${CHARACTER_CONFIGS[slot.characterType].label} ${teamIndex === 0 ? 'A' : 'B'}`;
        const ai = new AIEnemy(this, pos.x, pos.y, slot.characterType, label);
        ai.team = teamIndex;
        ai.setName(mname);
        // Color label blue for team A, red for team B so players can distinguish sides
        ai.setLabelColor(teamIndex === 0 ? '#66aaff' : '#ff6666');
        entity = ai;
      }

      this.physics.add.collider(entity, this.platforms);
      return { entity, slot, teamIndex, name: mname, kills: 0, deaths: 0, isHuman: slot.role === 'player' };
    };

    tb.teamA.forEach((slot, i) => {
      const m = addMember(slot, 0, spawnsA[i], i);
      this.battleMembers.push(m);
      if (slot.role === 'player') this.humanMember = m;
    });
    tb.teamB.forEach((slot, i) => {
      const m = addMember(slot, 1, spawnsB[i], i);
      this.battleMembers.push(m);
      if (slot.role === 'player') this.humanMember = m;
    });

    // Wire kill/death + projectile callbacks for AI members
    for (const member of this.battleMembers) {
      if (member.isHuman) continue;
      const ai = member.entity as AIEnemy;

      ai.onDied = (victim) => {
        member.deaths++;
        if (victim.lastAttackerId) {
          const killer = this.battleMembers.find(m => m.name === victim.lastAttackerId);
          if (killer) killer.kills++;
        }
        this.updateScoreboard();
      };

      // Archer NPC: fire projectiles via scene callback
      if (member.slot.characterType === 'archer') {
        ai.onFireProjectile = (x, y, vx, vy, ownerName) => {
          const proj = new Projectile(this, x, y, 'archer', ownerName, vx, vy);
          this.projectiles.add(proj, false);
          const body = proj.body as Phaser.Physics.Arcade.Body;
          body.setAllowGravity(false);
          body.setVelocity(vx, vy);
        };
      }
    }

    // Combo-dash overlaps: human → opposing team NPCs
    if (this.humanMember) {
      const humanTeam = this.humanMember.teamIndex;
      for (const m of this.battleMembers) {
        if (m.isHuman || m.teamIndex === humanTeam) continue;
        const ai = m.entity as AIEnemy;
        this.physics.add.overlap(this.player, ai, () => {
          if (this.player.comboState === 'dashing' && !this.player.getData('comboHit')) {
            this.player.setData('comboHit', true);
            const cfg = CHARACTER_CONFIGS[this.config.characterType];
            const kbDir = this.player.comboDashVx >= 0 ? 1 : -1;
            ai.takeHit(cfg.comboDamage ?? 32, kbDir * cfg.knockbackForce * 1.5, this.humanMember!.name);
            this.player.endCombo();
          }
        });
      }
    }
  }

  // ── Main update ───────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (this.battleEnded) return;

    if (this.isBattleMode) this.updateBattleTimer(delta);

    const cfg  = CHARACTER_CONFIGS[this.config.characterType];
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // Player dead: only tick respawn + NPCs
    if (this.isBattleMode && this.playerDead) {
      this.playerRespawnCD -= delta;
      const secsLeft = Math.ceil(this.playerRespawnCD / 1000);
      this.hpText.setText(`HP: MORTO — respawn em ${secsLeft}s`);
      if (this.playerRespawnCD <= 0) this.respawnHumanPlayer();
      this.updateBattleAI(delta);
      this.checkBattleMeleeHits();
      return;
    }

    const wantsSlide = this.isSlide();
    this.handleCombo();
    this.tickMovementTimers(delta);

    if (this.player.comboState === 'dashing') {
      // velocity driven by Player.update()

    } else if (this.player.isSliding) {
      body.setVelocityX(body.velocity.x * 0.93);

    } else if (this.player.comboState === 'aiming') {
      const moveLeft  = this.wasd.left.isDown  || touchInput.left;
      const moveRight = this.wasd.right.isDown || touchInput.right;
      if (moveLeft)       { body.setVelocityX(-cfg.speed); this.player.facing = 'left'; }
      else if (moveRight) { body.setVelocityX(cfg.speed);  this.player.facing = 'right'; }
      else                { body.setVelocityX(body.velocity.x * 0.75); }
      this.updateWallSlide();

    } else {
      if (this.isLeft())       { body.setVelocityX(-cfg.speed); this.player.facing = 'left'; }
      else if (this.isRight()) { body.setVelocityX(cfg.speed);  this.player.facing = 'right'; }
      else                     { body.setVelocityX(body.velocity.x * 0.75); }

      if (this.isJump()) {
        if (this.player.isWallSliding) {
          this.doWallJump();
        } else if (this.player.jumpsUsed < 2) {
          body.setVelocityY(cfg.jumpForce);
          this.player.jumpsUsed++;
        }
      }

      if (this.config.characterType === 'archer') {
        this.handleArcherAim(cfg);
      } else if (this.isAttack() && this.player.attackCooldown <= 0) {
        const mult = this.performAttack();
        this.player.attackCooldown = cfg.attackCooldown * mult;
      }

      if (this.player.isGrounded && this.player.comboCooldown <= 0 && wantsSlide) {
        this.startGroundSlide();
      }

      this.updateWallSlide();
    }

    // Out of bounds
    const map = MAP_CONFIGS[this.config.mapId];
    if (this.player.y > map.height + 60) {
      if (this.player.comboState !== 'none') this.player.endCombo();
      if (this.isBattleMode) {
        this.handleHumanPlayerDeath();
      } else {
        const spawn = map.spawnPoints[0];
        this.player.setPosition(spawn.x, spawn.y - 60);
        body.setVelocity(0, 0);
        this.player.hp = this.player.maxHp;
      }
    }

    if (!this.isBattleMode && Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.resetPlayer();
    }

    this.player.update(delta);
    this.dummy?.update(delta);
    this.checkProjectileHits();

    if (!this.isBattleMode && this.aiEnemy) {
      this.aiEnemy.updateAI([{ x: this.player.x, y: this.player.y }], delta);
      this.checkAIHits();
    }

    if (this.isBattleMode) {
      this.updateBattleAI(delta);
      this.checkBattleMeleeHits();
      if (!this.playerDead && this.player.hp <= 0) {
        this.handleHumanPlayerDeath();
      }
    }

    const cd = Math.max(0, this.player.attackCooldown);
    const comboReady = this.player.comboCooldown <= 0;
    const cs = this.player.comboState;
    const comboStr = cs === 'aiming' ? '  |  Combo: MIRANDO'
      : cs === 'dashing' ? '  |  Combo: DASH!'
      : comboReady ? '  |  Combo: PRONTO' : `  |  Combo CD: ${(this.player.comboCooldown / 1000).toFixed(1)}s`;
    this.cooldownText.setText(
      (cd > 0 ? `Ataque CD: ${(cd / 1000).toFixed(1)}s` : 'Ataque: PRONTO') + comboStr,
    );
    this.hpText.setText(`HP: ${this.player.hp}/${this.player.maxHp}`);
  }

  // ── Team battle helpers ───────────────────────────────────────────────────

  private updateBattleTimer(delta: number) {
    this.battleTimer = Math.max(0, this.battleTimer - delta);
    if (this.battleTimer === 0) { this.endBattle(); return; }
    const secs = Math.ceil(this.battleTimer / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    this.modeText.setText(`BATALHA — ${m}:${s.toString().padStart(2, '0')}`);
  }

  private isMemberDead(member: BattleMember): boolean {
    if (member.isHuman) return this.playerDead;
    return (member.entity as AIEnemy).isDead;
  }

  private updateBattleAI(delta: number) {
    const tb = this.config.teamBattle!;
    for (const member of this.battleMembers) {
      if (member.isHuman) continue;
      const ai = member.entity as AIEnemy;

      const allOpposing = this.battleMembers.filter(
        m => m.teamIndex !== member.teamIndex && !this.isMemberDead(m),
      );

      let targets: Array<{ x: number; y: number }>;
      if (tb.enableActiveEnemies) {
        targets = allOpposing.map(m => ({ x: m.entity.x, y: m.entity.y }));
      } else {
        const human = allOpposing.find(m => m.isHuman);
        targets = human ? [{ x: human.entity.x, y: human.entity.y }] : [];
      }

      if (targets.length > 0) {
        ai.updateAI(targets, delta);
      } else {
        ai.update(delta);
      }
    }
  }

  private checkBattleMeleeHits() {
    const humanTeam = this.humanMember?.teamIndex ?? -1;

    // AI hits against human player
    if (!this.playerDead) {
      for (const m of this.battleMembers) {
        if (m.isHuman || m.teamIndex === humanTeam) continue;
        const ai = m.entity as AIEnemy;
        if (ai.isDead || !ai.isAttackFrame) continue;
        const cfg = CHARACTER_CONFIGS[ai.characterType];
        const dx  = this.player.x - ai.x;
        const dy  = this.player.y - ai.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const fwd  = ai.facing === 'right' ? dx > 0 : dx < 0;
        if (dist <= 75 && fwd) {
          this.playerLastHitBy = ai;
          this.hitPlayer(cfg.attackDamage, (dx > 0 ? 1 : -1) * cfg.knockbackForce * 0.5);
        }
      }
    }

    // NPC vs NPC (only when active enemies enabled)
    if (!this.config.teamBattle?.enableActiveEnemies) return;
    for (const attacker of this.battleMembers) {
      if (attacker.isHuman) continue;
      const attackerAI = attacker.entity as AIEnemy;
      if (attackerAI.isDead || !attackerAI.isAttackFrame) continue;
      const aCfg = CHARACTER_CONFIGS[attackerAI.characterType];

      for (const target of this.battleMembers) {
        if (target.isHuman || target.teamIndex === attacker.teamIndex) continue;
        if (this.isMemberDead(target)) continue;
        const targetAI = target.entity as AIEnemy;
        const dx = targetAI.x - attackerAI.x;
        const dy = targetAI.y - attackerAI.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const fwd  = attackerAI.facing === 'right' ? dx > 0 : dx < 0;
        if (dist <= 75 && fwd) {
          targetAI.takeHit(aCfg.attackDamage, (dx > 0 ? 1 : -1) * aCfg.knockbackForce * 0.5, attacker.name);
        }
      }
    }
  }

  private handleHumanPlayerDeath() {
    if (this.playerDead) return;
    this.playerDead = true;
    this.playerRespawnCD = PLAYER_RESPAWN_DELAY;

    if (this.humanMember) {
      this.humanMember.deaths++;
      if (this.playerLastHitBy) {
        const killer = this.battleMembers.find(m => m.entity === this.playerLastHitBy);
        if (killer) killer.kills++;
      }
    }
    this.playerLastHitBy = null;

    this.player.triggerHurtAnim();
    this.player.setActive(false);
    this.player.setVisible(false);
    (this.player.body as Phaser.Physics.Arcade.Body).setEnable(false);
    this.updateScoreboard();
  }

  private respawnHumanPlayer() {
    const humanTeam = this.humanMember?.teamIndex ?? 0;
    const map = MAP_CONFIGS[this.config.mapId];
    const sp = map.spawnPoints[humanTeam === 0 ? 0 : 1] ?? map.spawnPoints[0];
    const spawnX = sp.x;
    const spawnY = sp.y;

    this.playerDead = false;
    this.player.hp = this.player.maxHp;
    this.player.setPosition(spawnX, spawnY - 60);
    this.player.setActive(true);
    this.player.setVisible(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setEnable(true);
    body.setVelocity(0, 0);
    this.player.attackCooldown = 0;
  }

  private updateScoreboard() {
    if (!this.scoreboardText) return;
    const teamA = this.battleMembers.filter(m => m.teamIndex === 0);
    const teamB = this.battleMembers.filter(m => m.teamIndex === 1);
    const scoreA = teamA.reduce((s, m) => s + m.kills, 0);
    const scoreB = teamB.reduce((s, m) => s + m.kills, 0);

    const lines: string[] = [
      `⚔ Placar  A ${scoreA} × ${scoreB} B`,
      '',
      'Time A:',
      ...teamA.map(m => {
        const label = CHARACTER_CONFIGS[m.slot.characterType].label;
        return `  ${label}${m.isHuman ? ' (você)' : ''}  K:${m.kills} D:${m.deaths}`;
      }),
      '',
      'Time B:',
      ...teamB.map(m => {
        const label = CHARACTER_CONFIGS[m.slot.characterType].label;
        return `  ${label}${m.isHuman ? ' (você)' : ''}  K:${m.kills} D:${m.deaths}`;
      }),
    ];
    this.scoreboardText.setText(lines.join('\n'));
  }

  private endBattle() {
    this.battleEnded = true;
    const map = MAP_CONFIGS[this.config.mapId];
    const scoreA = this.battleMembers.filter(m => m.teamIndex === 0).reduce((s, m) => s + m.kills, 0);
    const scoreB = this.battleMembers.filter(m => m.teamIndex === 1).reduce((s, m) => s + m.kills, 0);
    const winner = scoreA > scoreB ? 'TIME A VENCEU!' : scoreB > scoreA ? 'TIME B VENCEU!' : 'EMPATE!';

    const cx = map.width / 2;
    const cy = map.height / 2;

    this.add.rectangle(cx, cy, 440, 220, 0x000000, 0.88).setDepth(200).setScrollFactor(0);
    this.add.text(cx, cy - 60, winner, {
      fontSize: '30px', color: '#f1c40f', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.add.text(cx, cy, `Time A: ${scoreA} kills   |   Time B: ${scoreB} kills`, {
      fontSize: '15px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);
    this.add.text(cx, cy + 55, 'Pressione ESC para voltar ao menu', {
      fontSize: '12px', color: '#888888',
    }).setOrigin(0.5).setDepth(201).setScrollFactor(0);

    this.modeText.setText('FIM DE JOGO');
  }

  // ── Movement / input helpers (unchanged from solo) ────────────────────────

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

    this.player.isSliding      = true;
    this.player.slideDuration  = SLIDE_DURATION;
    this.player.comboCooldown  = SLIDE_COOLDOWN;
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
        player.executeCombo();
      } else if (player.isGrounded) {
        player.endCombo();
      } else {
        const { dx, dy } = this.getComboAimDir(player.facing);
        player.updateComboAim(dx, dy);
      }
    }
  }

  private checkProjectileHits() {
    if (!this.isBattleMode) {
      // Solo mode: build fixed target list once, then check all projectiles
      const cfg = CHARACTER_CONFIGS[this.config.characterType];
      const targets: Array<{ body: Phaser.Physics.Arcade.Body; onHit: (dmg: number, kb: number) => void }> = [];
      if (this.dummy?.active) {
        targets.push({ body: this.dummy.body as Phaser.Physics.Arcade.Body, onHit: (d, k) => this.dummy!.hitDummy(d, k) });
      }
      if (this.aiEnemy?.active) {
        targets.push({ body: this.aiEnemy.body as Phaser.Physics.Arcade.Body, onHit: (d, k) => this.aiEnemy!.takeHit(d, k) });
      }
      this.projectiles.getChildren().forEach(go => {
        const p = go as Projectile;
        if (!p.active || p.getData('hit')) return;
        const pBody = p.body as Phaser.Physics.Arcade.Body;
        const pr = new Phaser.Geom.Rectangle(pBody.x, pBody.y, pBody.width, pBody.height);
        for (const t of targets) {
          const tr = new Phaser.Geom.Rectangle(t.body.x, t.body.y, t.body.width, t.body.height);
          if (Phaser.Geom.Rectangle.Overlaps(pr, tr)) {
            p.setData('hit', true);
            const kbDir = pBody.velocity.x >= 0 ? 1 : -1;
            t.onHit(p.damage, cfg.knockbackForce * kbDir);
            p.destroy();
            break;
          }
        }
      });
      return;
    }

    // Battle mode: per-projectile targeting based on owner's team
    this.projectiles.getChildren().forEach(go => {
      const p = go as Projectile;
      if (!p.active || p.getData('hit')) return;
      const pBody  = p.body as Phaser.Physics.Arcade.Body;
      const pr     = new Phaser.Geom.Rectangle(pBody.x, pBody.y, pBody.width, pBody.height);
      const kbDir  = pBody.velocity.x >= 0 ? 1 : -1;

      // Resolve owner team and knockback force
      const isPlayerProj = p.ownerId === 'player';
      const ownerMember  = isPlayerProj ? this.humanMember : this.battleMembers.find(m => m.name === p.ownerId);
      if (!ownerMember) return;
      const ownerTeam = ownerMember.teamIndex;
      const kb = CHARACTER_CONFIGS[ownerMember.slot.characterType].knockbackForce * kbDir;

      for (const m of this.battleMembers) {
        if (m.teamIndex === ownerTeam || this.isMemberDead(m)) continue;

        let targetBody: Phaser.Physics.Arcade.Body;
        if (m.isHuman) {
          if (this.playerDead) continue;
          targetBody = this.player.body as Phaser.Physics.Arcade.Body;
        } else {
          targetBody = (m.entity as AIEnemy).body as Phaser.Physics.Arcade.Body;
        }

        const tr = new Phaser.Geom.Rectangle(targetBody.x, targetBody.y, targetBody.width, targetBody.height);
        if (!Phaser.Geom.Rectangle.Overlaps(pr, tr)) continue;

        p.setData('hit', true);
        if (m.isHuman) {
          // Record NPC shooter for kill attribution
          if (!isPlayerProj) this.playerLastHitBy = ownerMember.entity as AIEnemy;
          this.hitPlayer(p.damage, kb);
        } else {
          const shooterName = isPlayerProj ? this.humanMember?.name : p.ownerId;
          (m.entity as AIEnemy).takeHit(p.damage, kb, shooterName);
        }
        p.destroy();
        break;
      }
    });
  }

  private checkAIHits() {
    if (!this.aiEnemy?.isAttackFrame) return;
    const cfg = CHARACTER_CONFIGS[this.aiEnemy.characterType];
    const dx  = this.player.x - this.aiEnemy.x;
    const dy  = this.player.y - this.aiEnemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const fwd  = this.aiEnemy.facing === 'right' ? dx > 0 : dx < 0;
    if (dist <= 75 && fwd) {
      this.hitPlayer(cfg.attackDamage, (dx > 0 ? 1 : -1) * cfg.knockbackForce * 0.5);
    }
  }

  private hitPlayer(damage: number, knockbackX: number) {
    this.player.hp = Math.max(0, this.player.hp - damage);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);
    body.setVelocityY(-180);

    const ty = this.player.y - 40;
    const t  = this.add.text(this.player.x, ty, `-${damage}`, {
      fontSize: '14px', color: '#ffaa00', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: t, y: ty - 40, alpha: 0, duration: 700, ease: 'Power2',
      onComplete: () => t.destroy(),
    });

    this.player.triggerHurtAnim();
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
    const len   = Math.sqrt(this.player.archerAimDx ** 2 + this.player.archerAimDy ** 2) || 1;
    const vx    = (this.player.archerAimDx / len) * speed;
    const vy    = (this.player.archerAimDy / len) * speed;

    const proj = new Projectile(
      this, this.player.x + (vx > 0 ? 16 : -16), this.player.y - 10,
      'archer', 'player', vx, vy,
    );
    this.projectiles.add(proj, false);
    const body = proj.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(vx, vy);
  }

  private performAttack(): number {
    const cfg = CHARACTER_CONFIGS[this.config.characterType];
    const mult = this.player.triggerAttackAnim();

    if (cfg.isRanged) {
      const speed = cfg.projectileSpeed ?? 600;
      const vx    = this.player.facing === 'right' ? speed : -speed;
      const proj  = new Projectile(this, this.player.x, this.player.y - 10, this.config.characterType, 'player', vx);
      this.projectiles.add(proj, false);
    } else {
      this.showMeleeEffect();

      const meleeTargets: Array<{ x: number; y: number; active: boolean; onHit: (kbDir: number) => void }> = [];

      if (!this.isBattleMode) {
        if (this.dummy) {
          meleeTargets.push({ x: this.dummy.x, y: this.dummy.y, active: this.dummy.active,
            onHit: kbDir => this.dummy!.hitDummy(cfg.attackDamage, kbDir * cfg.knockbackForce * 0.4) });
        }
        if (this.aiEnemy) {
          meleeTargets.push({ x: this.aiEnemy.x, y: this.aiEnemy.y, active: this.aiEnemy.active,
            onHit: kbDir => this.aiEnemy!.takeHit(cfg.attackDamage, kbDir * cfg.knockbackForce * 0.4) });
        }
      } else {
        const humanTeam = this.humanMember?.teamIndex ?? 0;
        for (const m of this.battleMembers) {
          if (m.isHuman || m.teamIndex === humanTeam || this.isMemberDead(m)) continue;
          const ai = m.entity as AIEnemy;
          meleeTargets.push({ x: ai.x, y: ai.y, active: true,
            onHit: kbDir => ai.takeHit(cfg.attackDamage, kbDir * cfg.knockbackForce * 0.4, this.humanMember?.name) });
        }
      }

      for (const t of meleeTargets) {
        if (!t.active) continue;
        const dx = t.x - this.player.x;
        const dy = t.y - this.player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const fwd  = this.player.facing === 'right' ? dx > 0 : dx < 0;
        if (dist <= cfg.attackRange * 1.3 && fwd) t.onHit(dx > 0 ? 1 : -1);
      }
    }
    return mult;
  }

  private showMeleeEffect() {
    const cfg = CHARACTER_CONFIGS[this.config.characterType];
    const dir = this.player.facing === 'right' ? 1 : -1;
    const ex  = this.player.x + dir * cfg.attackRange * 0.6;

    const gfx = this.add.graphics().setDepth(15);
    gfx.fillStyle(0xffffff, 0.5);
    gfx.fillCircle(ex, this.player.y, cfg.attackRange * 0.5);
    this.time.delayedCall(80, () => gfx.destroy());
  }

  private resetPlayer() {
    const map   = MAP_CONFIGS[this.config.mapId];
    const spawn = map.spawnPoints[0];
    this.player.setPosition(spawn.x, spawn.y - 60);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.player.hp = this.player.maxHp;
    this.player.attackCooldown = 0;
    this.player.comboCooldown  = 0;
  }
}
