import { useState, useEffect, useCallback } from 'react';
import type { Room } from '@colyseus/sdk';
import type { CharacterType } from 'shared';
import { CHARACTER_CONFIGS } from 'shared';
import type { GameConfig } from '../App';

interface Props {
  room: Room;
  platform: 'pc' | 'mobile';
  onGameStart: (config: GameConfig) => void;
  onBack: () => void;
}

const ALL_CHARS: CharacterType[] = ['fighter', 'archer', 'tank'];

function charProfile(type: CharacterType) {
  return `/sprites/${type === 'tank' ? 'warrior' : type}/profile.png`;
}

const CHAR_THEME: Record<CharacterType, { border: string; selBg: string; glow: string }> = {
  fighter: { border: 'border-blue-500',  selBg: 'bg-blue-950',  glow: '0 0 16px rgba(59,130,246,0.55)'  },
  archer:  { border: 'border-green-500', selBg: 'bg-green-950', glow: '0 0 16px rgba(34,197,94,0.55)'   },
  tank:    { border: 'border-red-500',   selBg: 'bg-red-950',   glow: '0 0 16px rgba(239,68,68,0.55)'   },
};

interface PlayerSnapshot {
  id: string;
  characterType: CharacterType;
  team: string;
  isReady: boolean;
}

function readPlayers(state: any): PlayerSnapshot[] {
  const out: PlayerSnapshot[] = [];
  if (!state?.players) return out;
  state.players.forEach((p: any, id: string) => {
    out.push({ id, characterType: p.characterType, team: p.team, isReady: p.isReady });
  });
  return out;
}

export default function OnlineRoom({ room, platform, onGameStart, onBack }: Props) {
  const [players,     setPlayers]     = useState<PlayerSnapshot[]>(() => readPlayers(room.state));
  const [phase,       setPhase]       = useState<string>((room.state as any)?.phase ?? 'waiting');
  const [countdown,   setCountdown]   = useState<number>(0);
  const [localTeam,   setLocalTeam]   = useState<'A' | 'B' | ''>('');
  const [localChar,   setLocalChar]   = useState<CharacterType>('fighter');
  const [localReady,  setLocalReady]  = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  // Sync state changes from server
  useEffect(() => {
    const cb = (state: any) => {
      setPlayers(readPlayers(state));
      setPhase(state.phase);
      setCountdown(state.countdown ?? 0);
    };
    room.onStateChange(cb);
    return () => room.onStateChange.remove(cb);
  }, [room]);

  // Launch game when battle starts
  useEffect(() => {
    if ((phase === 'countdown' || phase === 'battle') && !gameStarted) {
      setGameStarted(true);
      onGameStart({
        characterType: localChar,
        mapId: (room.state as any)?.mapId ?? 'arena',
        platform,
        enableEnemy: false,
        multiplayerRoom: room,
      });
    }
  }, [phase, gameStarted, localChar, platform, room, onGameStart]);

  const handleSelectTeam = useCallback((team: 'A' | 'B') => {
    if (localReady) return;
    // check if team is available
    const taken = players.some(p => p.id !== room.sessionId && p.team === team);
    if (taken) return;
    setLocalTeam(team);
    room.send('select_team', { team });
  }, [room, players, localReady]);

  const handleSelectChar = useCallback((c: CharacterType) => {
    if (localReady) return;
    setLocalChar(c);
    room.send('select_character', { characterType: c });
  }, [room, localReady]);

  const handleReady = useCallback(() => {
    if (!localTeam) return;
    setLocalReady(true);
    room.send('player_ready');
  }, [room, localTeam]);

  const handleUnready = useCallback(() => {
    setLocalReady(false);
    room.send('unready');
  }, [room]);

  const handleBack = useCallback(() => {
    room.leave();
    onBack();
  }, [room, onBack]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(room.roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [room.roomId]);

  const teamAPlayers = players.filter(p => p.team === 'A');
  const teamBPlayers = players.filter(p => p.team === 'B');
  const teamATaken   = teamAPlayers.some(p => p.id !== room.sessionId);
  const teamBTaken   = teamBPlayers.some(p => p.id !== room.sessionId);

  const isCountdown = phase === 'countdown';

  return (
    <div className="relative flex flex-col items-center gap-4 w-full h-full bg-[#0a071e] p-5 overflow-y-auto">

      {/* Countdown overlay */}
      {isCountdown && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(5,0,20,0.85)' }}>
          <p className="text-purple-300 text-sm font-bold uppercase tracking-widest mb-2">A batalha começa em</p>
          <p className="font-black" style={{ fontSize: '7rem', color: '#FFD700', textShadow: '4px 4px 0 #7c3800', lineHeight: 1 }}>
            {countdown || 1}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="text-center pt-1 w-full">
        <h1 className="text-2xl font-black" style={{ color: '#FFD700', textShadow: '2px 2px 0 #7c3800' }}>
          SALA ONLINE
        </h1>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-gray-400 text-xs">Código:</span>
          <button onClick={copyCode}
            className="flex items-center gap-2 px-3 py-1 rounded-lg transition hover:opacity-80"
            style={{ background: '#1a1040', border: '1px solid rgba(139,92,246,0.5)' }}>
            <span className="font-black text-lg tracking-[0.25em]" style={{ color: '#FFD700' }}>{room.roomId}</span>
            <span className="text-gray-400 text-xs">{copied ? '✓ copiado' : 'copiar'}</span>
          </button>
        </div>
        <p className="text-gray-500 text-xs mt-1">
          {players.length < 2 ? 'Aguardando oponente…' : 'Sala cheia — escolha seu time e clique Pronto!'}
        </p>
      </div>

      {/* Team columns */}
      <div className="flex gap-4 w-full max-w-2xl">
        {/* Time A */}
        <div className="flex-1 flex flex-col gap-2">
          <div className="text-center py-2 rounded-xl"
            style={{ background: 'rgba(30,58,138,0.25)', border: '1px solid rgba(59,130,246,0.4)' }}>
            <h2 className="text-xs font-black uppercase tracking-widest text-blue-400">⚡ TIME A</h2>
          </div>
          {teamAPlayers.length === 0 ? (
            <div className="p-3 rounded-xl text-center text-gray-600 text-xs"
              style={{ border: '2px dashed rgba(59,130,246,0.3)', background: 'transparent' }}>
              Vazio
            </div>
          ) : (
            teamAPlayers.map(p => (
              <PlayerCard key={p.id} player={p} isMe={p.id === room.sessionId} />
            ))
          )}
        </div>

        {/* Divisor */}
        <div className="flex items-center">
          <span className="text-gray-600 font-black text-lg">VS</span>
        </div>

        {/* Time B */}
        <div className="flex-1 flex flex-col gap-2">
          <div className="text-center py-2 rounded-xl"
            style={{ background: 'rgba(127,29,29,0.25)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <h2 className="text-xs font-black uppercase tracking-widest text-red-400">🔥 TIME B</h2>
          </div>
          {teamBPlayers.length === 0 ? (
            <div className="p-3 rounded-xl text-center text-gray-600 text-xs"
              style={{ border: '2px dashed rgba(239,68,68,0.3)', background: 'transparent' }}>
              Vazio
            </div>
          ) : (
            teamBPlayers.map(p => (
              <PlayerCard key={p.id} player={p} isMe={p.id === room.sessionId} />
            ))
          )}
        </div>
      </div>

      {/* Local player controls */}
      <div className="w-full max-w-2xl flex flex-col gap-3 p-4 rounded-2xl"
        style={{ background: '#13102a', border: '1px solid rgba(139,92,246,0.3)' }}>
        <p className="text-purple-300 text-xs font-black uppercase tracking-widest">Suas escolhas</p>

        {/* Team selection */}
        <div>
          <p className="text-gray-500 text-[10px] font-bold uppercase mb-1.5">Time</p>
          <div className="flex gap-3">
            <button onClick={() => handleSelectTeam('A')}
              disabled={localReady || teamATaken}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all
                ${localTeam === 'A'
                  ? 'border-blue-500 bg-blue-950 text-blue-300'
                  : 'border-gray-700 text-gray-500 hover:border-blue-700 hover:text-blue-400'}
                disabled:opacity-30 disabled:cursor-not-allowed`}>
              ⚡ Time A
            </button>
            <button onClick={() => handleSelectTeam('B')}
              disabled={localReady || teamBTaken}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all
                ${localTeam === 'B'
                  ? 'border-red-500 bg-red-950 text-red-300'
                  : 'border-gray-700 text-gray-500 hover:border-red-700 hover:text-red-400'}
                disabled:opacity-30 disabled:cursor-not-allowed`}>
              🔥 Time B
            </button>
          </div>
        </div>

        {/* Character selection */}
        <div>
          <p className="text-gray-500 text-[10px] font-bold uppercase mb-1.5">Personagem</p>
          <div className="flex gap-2">
            {ALL_CHARS.map(c => {
              const t   = CHAR_THEME[c];
              const sel = localChar === c;
              return (
                <button key={c}
                  onClick={() => handleSelectChar(c)}
                  disabled={localReady}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all flex-1
                    ${sel ? `${t.border} ${t.selBg}` : 'border-gray-700 hover:border-gray-500'}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={{ boxShadow: sel ? t.glow : 'none' }}>
                  <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-700">
                    <img src={charProfile(c)} alt={c} className="w-full h-full object-cover object-top" />
                  </div>
                  <span className={`text-[9px] font-black ${sel ? 'text-white' : 'text-gray-400'}`}>
                    {CHARACTER_CONFIGS[c].label.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ready button */}
        {!localReady ? (
          <button onClick={handleReady}
            disabled={!localTeam}
            className="w-full py-3.5 rounded-xl font-black text-lg transition-all hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: localTeam ? 'linear-gradient(135deg, #15803d 0%, #22c55e 100%)' : '#374151',
              boxShadow: localTeam ? '0 4px 20px rgba(34,197,94,0.4)' : 'none',
              color: '#fff',
            }}>
            {!localTeam ? 'Escolha um time primeiro' : '✓ Pronto!'}
          </button>
        ) : (
          <button onClick={handleUnready}
            className="w-full py-3.5 rounded-xl font-black text-lg border-2 border-green-600 text-green-400 bg-green-950 transition hover:bg-green-900">
            ✓ Pronto — clique para cancelar
          </button>
        )}
      </div>

      <button onClick={handleBack} className="text-purple-400 text-xs font-semibold hover:text-purple-200 transition pb-2">
        ← Sair da sala
      </button>
    </div>
  );
}

function PlayerCard({ player, isMe }: { player: PlayerSnapshot; isMe: boolean }) {
  const cfg = CHARACTER_CONFIGS[player.characterType] ?? CHARACTER_CONFIGS.fighter;
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl"
      style={{ background: '#16112e', border: `1px solid ${player.team === 'A' ? 'rgba(59,130,246,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-gray-700">
        <img src={`/sprites/${player.characterType === 'tank' ? 'warrior' : player.characterType}/profile.png`}
          alt={cfg.label} className="w-full h-full object-cover object-top" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-black truncate">
          {cfg.label} {isMe && <span className="text-yellow-400 text-[9px]">(você)</span>}
        </p>
        <p className="text-gray-500 text-[9px]">
          {player.isReady
            ? <span className="text-green-400 font-bold">✓ Pronto</span>
            : <span className="text-gray-600">Escolhendo…</span>}
        </p>
      </div>
    </div>
  );
}
