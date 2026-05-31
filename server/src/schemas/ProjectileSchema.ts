import { Schema, type } from '@colyseus/schema';

export class ProjectileSchema extends Schema {
  @type('string')  id        = '';
  @type('string')  ownerId   = '';
  @type('float32') x         = 0;
  @type('float32') y         = 0;
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('uint8')   damage    = 0;
}
