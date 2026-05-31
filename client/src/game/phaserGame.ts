import Phaser from 'phaser';
import type { GameConfig as AppConfig } from '../App';
import { TrainingScene } from './scenes/TrainingScene';
import { MultiplayerScene } from './scenes/MultiplayerScene';

let gameInstance: Phaser.Game | null = null;

export function initGame(container: HTMLElement, config: AppConfig, onBack: () => void) {
  if (gameInstance) gameInstance.destroy(true);

  const SceneClass = config.mode === 'training' ? TrainingScene : MultiplayerScene;

  gameInstance = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#9aa0a8',
    pixelArt: true,
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 900 },
        debug: false,
      },
    },
    scene: [new SceneClass(config, onBack)],
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
  });
}

export function destroyGame() {
  gameInstance?.destroy(true);
  gameInstance = null;
}
