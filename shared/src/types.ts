export type CharacterType = 'fighter' | 'archer' | 'tank';

export type MapId = 'arena' | 'coliseum';

export type GameMode = 'training' | 'multiplayer';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
}

export interface PlayerState {
  id: string;
  characterType: CharacterType;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  hp: number;
  maxHp: number;
  facing: 'left' | 'right';
  isGrounded: boolean;
  jumpsUsed: number;
  attackCooldown: number;
  isDead: boolean;
  knockbackX: number;
  knockbackY: number;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
}

export interface GameState {
  roomId: string;
  mapId: MapId;
  players: Record<string, PlayerState>;
  projectiles: Record<string, ProjectileState>;
  tick: number;
}

// Socket events
export interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'room:joined': (payload: { roomId: string; playerId: string; mapId: MapId }) => void;
  'room:error': (payload: { message: string }) => void;
  'room:players': (players: { id: string; characterType: CharacterType }[]) => void;
  'player:died': (payload: { playerId: string; killerId: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (payload: { characterType: CharacterType; mapId: MapId }) => void;
  'room:join': (payload: { roomId: string; characterType: CharacterType }) => void;
  'room:leave': () => void;
  'player:input': (input: PlayerInput) => void;
}
