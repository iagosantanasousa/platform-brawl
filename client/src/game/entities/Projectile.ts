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
    velocityY = 0,
  ) {
    const isArrow = characterType === 'archer';
    const texKey  = isArrow ? 'arrow_proj' : 'projectile';

    if (!scene.textures.exists(texKey)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      if (isArrow) {
        // Thin horizontal arrow shape
        g.fillStyle(0xc8a060);
        g.fillRect(0, 3, 16, 2);   // shaft
        g.fillStyle(0xe0e0e0);
        g.fillTriangle(12, 0, 16, 4, 12, 8); // tip
        g.generateTexture(texKey, 16, 8);
      } else {
        g.fillStyle(0xffdd00);
        g.fillCircle(6, 6, 6);
        g.generateTexture(texKey, 12, 12);
      }
      g.destroy();
    }

    super(scene, x, y, texKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const cfg = CHARACTER_CONFIGS[characterType];
    this.damage  = cfg.attackDamage;
    this.ownerId = ownerId;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(velocityX, velocityY);

    // Rotate arrow sprite to match direction
    if (isArrow) {
      this.setRotation(Math.atan2(velocityY, velocityX));
    }

    this.setDepth(8);
  }
}
