import type { CharacterType } from './types';

export interface CharacterConfig {
  type: CharacterType;
  label: string;
  hp: number;
  speed: number;
  jumpForce: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number; // ms
  isRanged: boolean;
  projectileSpeed?: number;
  knockbackForce: number;
  comboDamage?: number;
  width: number;
  height: number;
  color: number; // Phaser hex color
  description: string;
}

export const CHARACTER_CONFIGS: Record<CharacterType, CharacterConfig> = {
  fighter: {
    type: 'fighter',
    label: 'Fighter',
    hp: 100,
    speed: 280,
    jumpForce: -520,
    attackRange: 70,
    attackDamage: 25,
    attackCooldown: 600,
    isRanged: false,
    knockbackForce: 280,
    comboDamage: 28,
    width: 36,
    height: 48,
    color: 0x4a90d9,
    description: 'Equilibrado. Curto alcance, dano médio.',
  },
  archer: {
    type: 'archer',
    label: 'Archer',
    hp: 75,
    speed: 300,
    jumpForce: -520,
    attackRange: 600,
    attackDamage: 22,
    attackCooldown: 700,
    isRanged: true,
    projectileSpeed: 750,
    knockbackForce: 160,
    comboDamage: 22,
    width: 36,
    height: 48,
    color: 0x27ae60,
    description: 'Arqueiro. Segure o ataque para mirar em 8 direções.',
  },
  tank: {
    type: 'tank',
    label: 'Tank',
    hp: 150,
    speed: 180,
    jumpForce: -440,
    attackRange: 55,
    attackDamage: 35,
    attackCooldown: 900,
    isRanged: false,
    knockbackForce: 420,
    comboDamage: 40,
    width: 48,
    height: 58,
    color: 0xe74c3c,
    description: 'Resistente. Alcance curto, dano alto.',
  },
};
