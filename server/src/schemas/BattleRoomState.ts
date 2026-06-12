import { Schema, type, MapSchema } from '@colyseus/schema';
import { PlayerSchema } from './PlayerSchema';
import { ProjectileSchema } from './ProjectileSchema';

export class BattleRoomState extends Schema {
  @type('string')  mapId       = 'arena';
  @type('string')  phase       = 'waiting'; // waiting | countdown | battle | finished
  @type('string')  winner      = '';
  @type('uint8')   countdown   = 0;
  @type({ map: PlayerSchema })     players     = new MapSchema<PlayerSchema>();
  @type({ map: ProjectileSchema }) projectiles = new MapSchema<ProjectileSchema>();
}
