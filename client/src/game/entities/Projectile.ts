import Phaser from 'phaser';
import type { CharacterType } from 'shared';
import { CHARACTER_CONFIGS } from 'shared';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  damage: number;
  ownerId: string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    characterType: CharacterType,
    ownerId: string,
    velocityX: number,
  ) {
    const texKey = 'projectile';
    if (!scene.textures.exists(texKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffdd00);
      g.fillCircle(6, 6, 6);
      g.generateTexture(texKey, 12, 12);
      g.destroy();
    }

    super(scene, x, y, texKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const cfg = CHARACTER_CONFIGS[characterType];
    this.damage = cfg.attackDamage;
    this.ownerId = ownerId;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityX(velocityX);

    this.setDepth(8);
  }
}
