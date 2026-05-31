import { useState, useEffect, useRef } from 'react';
import type { CharacterType, GameMode, MapId } from 'shared';
import { CHARACTER_CONFIGS } from 'shared';
import { MAP_CONFIGS } from 'shared';
import type { GameConfig } from '../App';
import { colyseusClient } from '../game/network/colyseusClient';

interface Props {
  onStart: (config: GameConfig) => void;
}

type LobbyStep = 'platform' | 'select' | 'create-room' | 'join-room';

export default function Lobby({ onStart }: Props) {
  const [character, setCharacter] = useState<CharacterType>('fighter');
  const [mapId, setMapId] = useState<MapId>('arena');
  const [platform, setPlatform] = useState<'pc' | 'mobile'>('pc');
  const [step, setStep] = useState<LobbyStep>('platform');
  const [roomInput, setRoomInput] = useState('');
  const [createdRoomId, setCreatedRoomId] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  // Track character + mapId for the create-room callback
  const characterRef = useRef(character);
  const mapIdRef     = useRef(mapId);
  const platformRef  = useRef(platform);
  useEffect(() => { characterRef.current = character; }, [character]);
  useEffect(() => { mapIdRef.current     = mapId;      }, [mapId]);
  useEffect(() => { platformRef.current  = platform;   }, [platform]);

  function handleTraining() {
    onStart({ characterType: character, mapId, mode: 'training', platform });
  }

  async function handleCreateRoom() {
    setError('');
    setWaiting(true);
    try {
      const room = await colyseusClient.createRoom(characterRef.current, mapIdRef.current);
      setCreatedRoomId(room.roomId);
      setWaiting(false);
      setStep('create-room');

      // Navigate to game once server starts the battle
      room.onStateChange((state) => {
        if (state.phase === 'countdown' || state.phase === 'battle') {
          onStart({
            characterType: characterRef.current,
            mapId: state.mapId as MapId,
            mode: 'multiplayer',
            platform: platformRef.current,
            roomId: room.roomId,
          });
        }
      });
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar sala.');
      setWaiting(false);
    }
  }

  async function handleJoinRoom() {
    if (!roomInput.trim()) return;
    setError('');
    setWaiting(true);
    try {
      const room = await colyseusClient.joinRoom(
        roomInput.trim().toUpperCase(),
        characterRef.current,
      );
      onStart({
        characterType: characterRef.current,
        mapId: room.state.mapId as MapId,
        mode: 'multiplayer',
        platform: platformRef.current,
        roomId: room.roomId,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Sala não encontrada ou cheia.');
      setWaiting(false);
    }
  }

  if (step === 'platform') {
    return (
      <div className="flex flex-col items-center justify-center gap-10 w-full h-full bg-[#0f0f1a] p-6">
        <div className="text-center">
          <h1 className="text-5xl font-black text-white tracking-tight">PLATFORM BRAWL</h1>
          <p className="text-gray-500 text-sm mt-1">POC — Multiplayer 2D Platformer</p>
        </div>
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5 text-center">Como você vai jogar?</h2>
          <div className="flex gap-5">
            <button
              onClick={() => { setPlatform('pc'); setStep('select'); }}
              className="flex flex-col items-center gap-3 px-10 py-8 bg-[#1a1a2e] border-2 border-transparent hover:border-white rounded-2xl transition"
            >
              <span className="text-5xl">🖥️</span>
              <span className="text-white font-black text-lg">PC</span>
              <span className="text-gray-400 text-xs">Teclado</span>
            </button>
            <button
              onClick={() => { setPlatform('mobile'); setStep('select'); }}
              className="flex flex-col items-center gap-3 px-10 py-8 bg-[#1a1a2e] border-2 border-transparent hover:border-white rounded-2xl transition"
            >
              <span className="text-5xl">📱</span>
              <span className="text-white font-black text-lg">Mobile</span>
              <span className="text-gray-400 text-xs">Touch</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'create-room') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 w-full h-full bg-[#0f0f1a]">
        <h2 className="text-2xl font-bold text-white">Sala criada!</h2>
        <div className="bg-[#1a1a2e] rounded-xl px-8 py-6 text-center">
          <p className="text-gray-400 mb-2">Código da sala</p>
          <p className="text-4xl font-mono font-bold text-yellow-400 tracking-widest">{createdRoomId}</p>
        </div>
        <p className="text-gray-400 text-sm">Aguardando outro jogador entrar...</p>
        <div className="flex gap-3 mt-2 animate-pulse">
          <div className="w-2 h-2 bg-blue-400 rounded-full" />
          <div className="w-2 h-2 bg-blue-400 rounded-full" />
          <div className="w-2 h-2 bg-blue-400 rounded-full" />
        </div>
        <button
          onClick={() => { setStep('select'); setWaiting(false); colyseusClient.leave(); }}
          className="mt-4 text-gray-500 hover:text-white text-sm underline"
        >
          Cancelar
        </button>
      </div>
    );
  }

  if (step === 'join-room') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 w-full h-full bg-[#0f0f1a]">
        <h2 className="text-2xl font-bold text-white">Entrar em sala</h2>
        <input
          type="text"
          maxLength={6}
          placeholder="CÓDIGO DA SALA"
          value={roomInput}
          onChange={e => setRoomInput(e.target.value.toUpperCase())}
          className="bg-[#1a1a2e] border border-gray-600 text-white text-center text-2xl font-mono tracking-widest rounded-xl px-6 py-4 w-64 focus:outline-none focus:border-blue-400"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => setStep('select')}
            className="px-6 py-3 bg-[#1a1a2e] text-gray-300 rounded-xl hover:bg-[#252540] transition"
          >
            Voltar
          </button>
          <button
            onClick={handleJoinRoom}
            disabled={!roomInput.trim() || waiting}
            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {waiting ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full h-full bg-[#0f0f1a] p-6">
      <div className="text-center">
        <h1 className="text-5xl font-black text-white tracking-tight">PLATFORM BRAWL</h1>
        <p className="text-gray-500 text-sm mt-1">POC — Multiplayer 2D Platformer</p>
      </div>

      <div className="flex gap-8 w-full max-w-3xl">
        <div className="flex-1">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Personagem</h2>
          <div className="flex flex-col gap-2">
            {(Object.values(CHARACTER_CONFIGS)).map(cfg => (
              <button
                key={cfg.type}
                onClick={() => setCharacter(cfg.type)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition text-left
                  ${character === cfg.type
                    ? 'border-white bg-[#252540]'
                    : 'border-transparent bg-[#1a1a2e] hover:bg-[#252540]'
                  }`}
              >
                <div
                  className="rounded flex-shrink-0"
                  style={{
                    width: cfg.width * 0.8,
                    height: cfg.height * 0.8,
                    backgroundColor: `#${cfg.color.toString(16).padStart(6, '0')}`,
                  }}
                />
                <div>
                  <p className="font-bold text-white">{cfg.label}</p>
                  <p className="text-xs text-gray-400">{cfg.description}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-red-400">HP {cfg.hp}</span>
                    <span className="text-xs text-green-400">DMG {cfg.attackDamage}</span>
                    <span className="text-xs text-blue-400">SPD {cfg.speed}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Mapa</h2>
            <div className="flex flex-col gap-2">
              {(Object.values(MAP_CONFIGS)).map(map => (
                <button
                  key={map.id}
                  onClick={() => setMapId(map.id)}
                  className={`p-4 rounded-xl border-2 transition text-left
                    ${mapId === map.id
                      ? 'border-white bg-[#252540]'
                      : 'border-transparent bg-[#1a1a2e] hover:bg-[#252540]'
                    }`}
                >
                  <p className="font-bold text-white">{map.label}</p>
                  <p className="text-xs text-gray-400">{map.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-auto">
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              onClick={handleTraining}
              className="w-full py-4 bg-[#1a1a2e] border-2 border-yellow-500 text-yellow-400 font-black text-lg rounded-xl hover:bg-yellow-500 hover:text-black transition"
            >
              TREINAR SOZINHO
            </button>
            <button
              onClick={handleCreateRoom}
              disabled={waiting}
              className="w-full py-4 bg-blue-700 text-white font-black text-lg rounded-xl hover:bg-blue-600 transition disabled:opacity-50"
            >
              CRIAR SALA
            </button>
            <button
              onClick={() => setStep('join-room')}
              className="w-full py-4 bg-[#1a1a2e] border border-gray-600 text-gray-300 font-bold rounded-xl hover:bg-[#252540] transition"
            >
              ENTRAR EM SALA
            </button>
          </div>
        </div>
      </div>

      <p className="text-gray-600 text-xs">
        {platform === 'pc' ? 'WASD / Setas para mover · Z ou J para atacar' : 'Controles touch serão exibidos no jogo'}
        {' · '}
        <button onClick={() => setStep('platform')} className="underline hover:text-gray-400">trocar plataforma</button>
      </p>
    </div>
  );
}
