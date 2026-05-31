import Phaser from 'phaser';
import { Player } from './Player';

const RESPAWN_DELAY = 3000;

export class Dummy extends Player {
  private dead = false;
  private respawnTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'fighter', false, 'DUMMY');
    this.maxHp = 100;
    this.hp = 100;
    // Gray tint only for the rectangle fallback; sprites use their natural colors.
    if (!this.usesSprite) this.setTint(0x888888);
  }

  hitDummy(damage: number, knockbackX: number) {
    if (this.dead) return;

    this.hp = Math.max(0, this.hp - damage);

    if (this.usesSprite) {
      this.playFighter('fighter_hurt');
    } else {
      this.setTint(0xff4444);
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(knockbackX);
    body.setVelocityY(-220);

    // Damage number
    const textY = this.usesSprite ? this.y - 44 : this.y - 20;
    const dmgText = this.scene.add.text(this.x, textY, `-${damage}`, {
      fontSize: '14px',
      color: '#ff4444',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    this.scene.tweens.add({
      targets: dmgText,
      y: textY - 40,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => dmgText.destroy(),
    });

    if (this.hp <= 0) {
      this.dead = true;
      this.setVisible(false);
      this.setActive(false);
      (this.body as Phaser.Physics.Arcade.Body).setEnable(false);
      this.respawnTimer = RESPAWN_DELAY;
    }
  }

  update(dt: number) {
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }
    super.update(dt);
    // Rectangle mode: keep gray tint; sprite mode: no tint override.
    if (!this.usesSprite) {
      this.clearTint();
      this.setTint(0x999999);
    }
  }

  private respawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.setVisible(true);
    this.setActive(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setEnable(true);
    body.setVelocity(0, 0);
    this.setPosition(this.x, this.y - 50);
    if (!this.usesSprite) this.setTint(0x999999);
  }
}
