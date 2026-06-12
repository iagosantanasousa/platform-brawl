import { Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string')  id            = '';
  @type('string')  characterType = 'fighter';
  @type('float32') x             = 0;
  @type('float32') y             = 0;
  @type('float32') velocityX     = 0;
  @type('float32') velocityY     = 0;
  @type('int16')   hp            = 100;
  @type('int16')   maxHp         = 100;
  @type('string')  facing        = 'right';
  @type('boolean') isGrounded    = false;
  jumpsUsed      = 0;   // server-only
  attackCooldown = 0;   // server-only (ms remaining)
  @type('boolean') isDead        = false;
  @type('uint8')   attackCount   = 0;   // increments each attack — client detects change to play anim
  knockbackX     = 0;   // server-only
  @type('string')  team          = '';    // 'A' | 'B' | ''
  @type('boolean') isReady       = false;
}
