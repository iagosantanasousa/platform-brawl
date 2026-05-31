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
  @type('uint8')   jumpsUsed     = 0;
  @type('int32')   attackCooldown = 0;
  @type('boolean') isDead        = false;
  @type('float32') knockbackX    = 0;
}
