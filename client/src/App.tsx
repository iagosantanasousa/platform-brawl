import { useState } from 'react';
import type { CharacterType, GameMode, MapId } from 'shared';
import Lobby from './ui/Lobby';
import GameContainer from './ui/GameContainer';

export type Screen = 'lobby' | 'game';

export interface GameConfig {
  characterType: CharacterType;
  mapId: MapId;
  mode: GameMode;
  platform: 'pc' | 'mobile';
  roomId?: string;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);

  function startGame(config: GameConfig) {
    setGameConfig(config);
    setScreen('game');
  }

  function backToLobby() {
    setScreen('lobby');
    setGameConfig(null);
  }

  if (screen === 'game' && gameConfig) {
    return <GameContainer config={gameConfig} onBack={backToLobby} />;
  }

  return <Lobby onStart={startGame} />;
}
