import { useState } from 'react';
import type { CharacterType, MapId } from 'shared';
import type { Room } from 'colyseus.js';
import Lobby from './ui/Lobby';
import OnlineRoom from './ui/OnlineRoom';
import GameContainer from './ui/GameContainer';

export type Screen = 'lobby' | 'online-room' | 'game';

export type SlotRole = 'player' | 'npc';

export interface TeamSlot {
  role: SlotRole;
  characterType: CharacterType;
}

export interface GameConfig {
  characterType: CharacterType;
  mapId: MapId;
  platform: 'pc' | 'mobile';
  enableEnemy: boolean;
  teamBattle?: {
    teamA: TeamSlot[];
    teamB: TeamSlot[];
    enableActiveEnemies: boolean;
  };
  multiplayerRoom?: Room;
}

export default function App() {
  const [screen,     setScreen]     = useState<Screen>('lobby');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<Room | null>(null);
  const [platform,   setPlatform]   = useState<'pc' | 'mobile'>('pc');

  function startGame(config: GameConfig) {
    setGameConfig(config);
    setScreen('game');
  }

  function startOnlineRoom(room: Room, plat: 'pc' | 'mobile') {
    setPlatform(plat);
    setOnlineRoom(room);
    setScreen('online-room');
  }

  function backToLobby() {
    onlineRoom?.leave();
    setOnlineRoom(null);
    setGameConfig(null);
    setScreen('lobby');
  }

  if (screen === 'online-room' && onlineRoom) {
    return (
      <OnlineRoom
        room={onlineRoom}
        platform={platform}
        onGameStart={startGame}
        onBack={backToLobby}
      />
    );
  }

  if (screen === 'game' && gameConfig) {
    return <GameContainer config={gameConfig} onBack={backToLobby} />;
  }

  return <Lobby onStart={startGame} onOnlineRoom={startOnlineRoom} />;
}
