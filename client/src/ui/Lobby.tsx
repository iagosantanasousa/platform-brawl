import { useState } from 'react';
import type { CharacterType, MapId } from 'shared';
import { CHARACTER_CONFIGS, MAP_CONFIGS } from 'shared';
import type { Room } from '@colyseus/sdk';
import type { GameConfig, TeamSlot, SlotRole } from '../App';
import { createRoom, joinRoom } from '../game/network/colyseusClient';

interface Props {
  onStart: (config: GameConfig) => void;
  onOnlineRoom: (room: Room, platform: 'pc' | 'mobile') => void;
}

type Step = 'platform' | 'mode' | 'solo' | 'team' | 'online';

const ALL_CHARS: CharacterType[] = ['fighter', 'archer', 'tank'];

function charProfile(type: CharacterType): string {
  return `/sprites/${type === 'tank' ? 'warrior' : type}/profile.png`;
}

const CHAR_THEME: Record<CharacterType, {
  border: string; selBg: string; glow: string; badge: string;
}> = {
  fighter: { border: 'border-blue-500',  selBg: 'bg-blue-950',  glow: '0 0 20px rgba(59,130,246,0.55)',  badge: 'bg-blue-600'  },
  archer:  { border: 'border-green-500', selBg: 'bg-green-950', glow: '0 0 20px rgba(34,197,94,0.55)',   badge: 'bg-green-600' },
  tank:    { border: 'border-red-500',   selBg: 'bg-red-950',   glow: '0 0 20px rgba(239,68,68,0.55)',   badge: 'bg-red-600'   },
};

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 text-[9px] font-bold w-6 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round((value / max) * 100)}%` }} />
      </div>
      <span className="text-gray-500 text-[9px] w-5 text-right">{value}</span>
    </div>
  );
}

function PageBg() {
  return (
    <>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/bg.png)' }} />
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(10,5,30,0.55) 0%, rgba(20,5,50,0.72) 50%, rgba(5,0,20,0.88) 100%)' }} />
    </>
  );
}

function BrawlTitle({ sub }: { sub?: string }) {
  return (
    <div className="relative z-10 text-center select-none">
      <h1 className="font-black leading-none tracking-tight" style={{
        fontSize: '3.5rem',
        color: '#FFD700',
        textShadow: '3px 3px 0 #7c3800, 0 0 40px rgba(255,215,0,0.45)',
        WebkitTextStroke: '1px #b06000',
      }}>
        PLATFORM<br />BRAWL
      </h1>
      {sub && <p className="text-purple-300 text-xs mt-2 font-bold tracking-[0.2em]">{sub}</p>}
    </div>
  );
}

// ── TeamColumn — defined outside Lobby so React sees a stable reference ──────

interface TeamColumnProps {
  team: 'A' | 'B';
  slots: TeamSlot[];
  label: string;
  addingTo: 'A' | 'B' | null;
  pendingChar: CharacterType | null;
  pendingRole: SlotRole;
  hasPlayer: boolean;
  availChars: CharacterType[];
  onStartAdd: (team: 'A' | 'B') => void;
  onRemove: (team: 'A' | 'B', idx: number) => void;
  onSelectChar: (c: CharacterType) => void;
  onSelectRole: (r: SlotRole) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function TeamColumn({
  team, slots, label, addingTo, pendingChar, pendingRole,
  hasPlayer, availChars, onStartAdd, onRemove, onSelectChar, onSelectRole, onConfirm, onCancel,
}: TeamColumnProps) {
  const isAdding = addingTo === team;
  const col = team === 'A'
    ? { header: '#60a5fa', border: 'rgba(59,130,246,0.4)',  bg: 'rgba(30,58,138,0.25)' }
    : { header: '#f87171', border: 'rgba(239,68,68,0.4)',   bg: 'rgba(127,29,29,0.25)' };

  return (
    <div className="flex-1 flex flex-col gap-2">
      <div className="text-center py-2 rounded-xl" style={{ background: col.bg, border: `1px solid ${col.border}` }}>
        <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: col.header }}>{label}</h2>
      </div>

      {slots.map((s, i) => (
        <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl"
          style={{ background: '#16112e', border: `1px solid ${col.border}` }}>
          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-gray-700">
            <img src={charProfile(s.characterType)} alt={CHARACTER_CONFIGS[s.characterType].label}
              className="w-full h-full object-cover object-top" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-black truncate">{CHARACTER_CONFIGS[s.characterType].label}</p>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${s.role === 'player' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
              {s.role === 'player' ? 'VOCÊ' : 'NPC'}
            </span>
          </div>
          <button onClick={() => onRemove(team, i)} className="text-gray-600 hover:text-red-400 text-xl leading-none shrink-0 transition">×</button>
        </div>
      ))}

      {slots.length < 3 && !isAdding && (
        <button onClick={() => onStartAdd(team)}
          className="p-3 rounded-xl text-sm font-black transition-all hover:opacity-80"
          style={{ border: `2px dashed ${col.border}`, color: col.header, background: 'transparent' }}>
          + Adicionar slot
        </button>
      )}

      {isAdding && availChars.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-2">Time completo</p>
      )}

      {isAdding && availChars.length > 0 && (
        <div className="p-3 rounded-xl flex flex-col gap-3" style={{ background: '#0d0920', border: `1px solid ${col.border}` }}>
          <div className="flex gap-2 flex-wrap">
            {availChars.map(c => {
              const t   = CHAR_THEME[c];
              const sel = pendingChar === c;
              const cls = sel
                ? `flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${t.border} ${t.selBg}`
                : 'flex flex-col items-center gap-1 p-2 rounded-xl border-2 border-gray-700 transition-all';
              return (
                <button key={c} onClick={() => onSelectChar(c)} className={cls}
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

          <div className="flex gap-2">
            <button onClick={() => onSelectRole('npc')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition
                ${pendingRole === 'npc' ? 'border-purple-400 bg-purple-900 text-white' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
              NPC
            </button>
            <button onClick={() => onSelectRole('player')} disabled={hasPlayer}
              className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition
                ${pendingRole === 'player' ? 'border-yellow-400 bg-yellow-900 text-yellow-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'}
                disabled:opacity-30 disabled:cursor-not-allowed`}>
              VOCÊ
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={onConfirm} disabled={!pendingChar}
              className="flex-1 py-1.5 rounded-lg text-xs font-black transition hover:opacity-90 disabled:opacity-30"
              style={{ background: '#FFD700', color: '#000' }}>
              Confirmar
            </button>
            <button onClick={onCancel}
              className="flex-1 py-1.5 rounded-lg text-xs font-black border border-gray-700 text-gray-400 hover:border-gray-500 transition">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Lobby component ───────────────────────────────────────────────────────

export default function Lobby({ onStart, onOnlineRoom }: Props) {
  const [step, setStep] = useState<Step>('platform');
  const [platform, setPlatform] = useState<'pc' | 'mobile'>('pc');

  // Online mode
  const [onlineLoading, setOnlineLoading]   = useState(false);
  const [onlineError,   setOnlineError]     = useState('');
  const [joinCode,      setJoinCode]        = useState('');

  // Solo
  const [character,   setCharacter]   = useState<CharacterType>('fighter');
  const [mapId,       setMapId]       = useState<MapId>('arena');
  const [enableEnemy, setEnableEnemy] = useState(false);

  // Team
  const [teamA, setTeamA] = useState<TeamSlot[]>([]);
  const [teamB, setTeamB] = useState<TeamSlot[]>([]);
  const [addingTo,    setAddingTo]    = useState<'A' | 'B' | null>(null);
  const [pendingChar, setPendingChar] = useState<CharacterType | null>(null);
  const [pendingRole, setPendingRole] = useState<SlotRole>('npc');
  const [enableActiveEnemies, setEnableActiveEnemies] = useState(true);
  const [tbMapId, setTbMapId] = useState<MapId>('arena');

  const allSlots  = [...teamA, ...teamB];
  const hasPlayer = allSlots.some(s => s.role === 'player');
  const usedA     = new Set(teamA.map(s => s.characterType));
  const usedB     = new Set(teamB.map(s => s.characterType));

  function availFor(t: 'A' | 'B') {
    return ALL_CHARS.filter(c => !(t === 'A' ? usedA : usedB).has(c));
  }

  function startAdd(team: 'A' | 'B') {
    const avail = availFor(team);
    setAddingTo(team);
    setPendingChar(avail[0] ?? null);
    setPendingRole('npc');
  }

  function confirmSlot() {
    if (!pendingChar || !addingTo) return;
    const slot: TeamSlot = { role: pendingRole, characterType: pendingChar };
    if (addingTo === 'A') setTeamA(p => [...p, slot]);
    else                  setTeamB(p => [...p, slot]);
    setAddingTo(null);
    setPendingChar(null);
    setPendingRole('npc');
  }

  function removeSlot(team: 'A' | 'B', idx: number) {
    if (team === 'A') setTeamA(p => p.filter((_, i) => i !== idx));
    else              setTeamB(p => p.filter((_, i) => i !== idx));
  }

  function startTeamBattle() {
    const playerSlot = allSlots.find(s => s.role === 'player')!;
    onStart({
      characterType: playerSlot.characterType,
      mapId: tbMapId,
      platform,
      enableEnemy: false,
      teamBattle: { teamA, teamB, enableActiveEnemies },
    });
  }

  const canStartTeam = hasPlayer && teamA.length > 0 && teamB.length > 0;

  // ── Platform ─────────────────────────────────────────────────────────────────
  if (step === 'platform') {
    return (
      <div className="relative flex flex-col items-center justify-center gap-10 w-full h-full overflow-hidden">
        <PageBg />
        <BrawlTitle sub="2D Platformer · POC" />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <p className="text-xs font-bold text-purple-300 uppercase tracking-widest">Como você vai jogar?</p>
          <div className="flex gap-5 mt-2">
            {(['pc', 'mobile'] as const).map(p => (
              <button key={p} onClick={() => { setPlatform(p); setStep('mode'); }}
                className="group flex flex-col items-center gap-3 px-10 py-8 rounded-2xl transition-all duration-200 hover:scale-105"
                style={{
                  background: 'linear-gradient(160deg, #2a1f5e 0%, #160d35 100%)',
                  border: '2px solid rgba(139,92,246,0.4)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 28px rgba(255,215,0,0.35), 0 4px 24px rgba(0,0,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)'; }}>
                <span className="text-6xl">{p === 'pc' ? '🖥️' : '📱'}</span>
                <span className="text-white font-black text-xl group-hover:text-yellow-400 transition">
                  {p === 'pc' ? 'PC' : 'MOBILE'}
                </span>
                <span className="text-purple-300 text-xs font-semibold">
                  {p === 'pc' ? 'Teclado & Mouse' : 'Touch Controls'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Mode ──────────────────────────────────────────────────────────────────────
  if (step === 'mode') {
    return (
      <div className="relative flex flex-col items-center justify-center gap-8 w-full h-full overflow-hidden">
        <PageBg />
        <BrawlTitle />
        <div className="relative z-10 flex flex-col gap-4 w-full max-w-sm px-6">
          <button onClick={() => setStep('solo')}
            className="flex items-center gap-5 px-6 py-5 rounded-2xl transition-all duration-200 hover:scale-[1.03] text-left"
            style={{
              background: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)',
              boxShadow: '0 4px 24px rgba(217,119,6,0.45)',
              border: '2px solid rgba(251,191,36,0.5)',
            }}>
            <span className="text-5xl shrink-0">🥊</span>
            <div>
              <p className="text-white font-black text-xl leading-tight" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}>
                Treino Solo
              </p>
              <p className="text-yellow-100 text-xs font-semibold mt-0.5 opacity-80">
                Treine combos com ou sem inimigo
              </p>
            </div>
          </button>

          <button onClick={() => setStep('team')}
            className="flex items-center gap-5 px-6 py-5 rounded-2xl transition-all duration-200 hover:scale-[1.03] text-left"
            style={{
              background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 50%, #ef4444 100%)',
              boxShadow: '0 4px 24px rgba(220,38,38,0.45)',
              border: '2px solid rgba(239,68,68,0.5)',
            }}>
            <span className="text-5xl shrink-0">⚔️</span>
            <div>
              <p className="text-white font-black text-xl leading-tight" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}>
                Batalha em Times
              </p>
              <p className="text-red-100 text-xs font-semibold mt-0.5 opacity-80">
                Monte dois times · 5 minutos
              </p>
            </div>
          </button>

          <button onClick={() => { setOnlineError(''); setJoinCode(''); setStep('online'); }}
            className="flex items-center gap-5 px-6 py-5 rounded-2xl transition-all duration-200 hover:scale-[1.03] text-left"
            style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 50%, #6366f1 100%)',
              boxShadow: '0 4px 24px rgba(99,102,241,0.45)',
              border: '2px solid rgba(129,140,248,0.5)',
            }}>
            <span className="text-5xl shrink-0">🌐</span>
            <div>
              <p className="text-white font-black text-xl leading-tight" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}>
                Online
              </p>
              <p className="text-indigo-200 text-xs font-semibold mt-0.5 opacity-80">
                1v1 com outro jogador · código de sala
              </p>
            </div>
          </button>
        </div>
        <button onClick={() => setStep('platform')} className="relative z-10 text-purple-400 text-xs font-semibold hover:text-purple-200 transition">
          ← Voltar
        </button>
      </div>
    );
  }

  // ── Solo ──────────────────────────────────────────────────────────────────────
  if (step === 'solo') {
    return (
      <div className="flex flex-col items-center gap-5 w-full h-full bg-[#0a071e] p-5 overflow-y-auto">
        <div className="text-center pt-1 w-full">
          <h1 className="text-3xl font-black" style={{ color: '#FFD700', textShadow: '2px 2px 0 #7c3800' }}>
            TREINO SOLO
          </h1>
        </div>

        <div className="flex gap-5 w-full max-w-3xl">
          {/* Character selection */}
          <div className="flex-1 flex flex-col gap-2">
            <h2 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-1">Personagem</h2>
            {ALL_CHARS.map(type => {
              const cfg = CHARACTER_CONFIGS[type];
              const t   = CHAR_THEME[type];
              const sel = character === type;
              const cls = sel
                ? `flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${t.border} ${t.selBg}`
                : 'flex items-center gap-3 p-3 rounded-xl border-2 border-transparent bg-[#16112e] transition-all text-left';
              return (
                <button key={type} onClick={() => setCharacter(type)} className={cls}
                  style={{ boxShadow: sel ? t.glow : 'none' }}>
                  <div className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 ${sel ? t.border : 'border-gray-700'}`}
                    style={{ boxShadow: sel ? t.glow : 'none' }}>
                    <img src={charProfile(type)} alt={cfg.label} className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="font-black text-white text-sm">{cfg.label.toUpperCase()}</p>
                      {sel && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${t.badge} text-white`}>✓</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <StatBar label="HP"  value={cfg.hp}           max={150} color="bg-green-500" />
                      <StatBar label="ATK" value={cfg.attackDamage} max={35}  color="bg-orange-500" />
                      <StatBar label="SPD" value={cfg.speed}        max={300} color="bg-blue-400" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Map + options */}
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <h2 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-2">Mapa</h2>
              <div className="flex flex-col gap-2">
                {Object.values(MAP_CONFIGS).map(map => {
                  const sel = mapId === map.id;
                  return (
                    <button key={map.id} onClick={() => setMapId(map.id)}
                      className="p-3 rounded-xl border-2 transition-all text-left"
                      style={{
                        borderColor: sel ? '#FFD700' : 'transparent',
                        background: sel ? 'rgba(255,215,0,0.08)' : '#16112e',
                        boxShadow: sel ? '0 0 16px rgba(255,215,0,0.2)' : 'none',
                      }}>
                      <p className="font-black text-sm" style={{ color: sel ? '#FFD700' : '#fff' }}>{map.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{map.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-purple-900 bg-[#16112e]">
              <input type="checkbox" checked={enableEnemy} onChange={e => setEnableEnemy(e.target.checked)}
                className="w-5 h-5 accent-red-500 cursor-pointer shrink-0" />
              <div>
                <p className="text-white text-sm font-black">Habilitar Inimigo</p>
                <p className="text-gray-500 text-xs">Fighter IA irá te atacar</p>
              </div>
            </label>

            <button
              onClick={() => onStart({ characterType: character, mapId, platform, enableEnemy })}
              className="mt-auto w-full py-4 font-black text-xl rounded-xl transition-all hover:scale-[1.03]"
              style={{
                background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
                boxShadow: '0 4px 24px rgba(245,158,11,0.5)',
                color: '#000',
              }}>
              JOGAR! →
            </button>
          </div>
        </div>

        <p className="text-gray-600 text-xs text-center pb-1">
          {platform === 'pc' ? 'WASD / Setas · Z ou J: atacar · Q: combo · ESC: sair' : 'Controles touch no jogo'}
          {' · '}
          <button onClick={() => setStep('mode')} className="text-purple-400 underline hover:text-purple-200">voltar</button>
        </p>
      </div>
    );
  }

  // ── Online ────────────────────────────────────────────────────────────────────
  if (step === 'online') {
    async function handleCreate() {
      setOnlineLoading(true);
      setOnlineError('');
      try {
        const room = await createRoom();
        onOnlineRoom(room, platform);
      } catch (e: any) {
        setOnlineError(e?.message ?? 'Erro ao criar sala');
        setOnlineLoading(false);
      }
    }

    async function handleJoin() {
      const code = joinCode.trim().toUpperCase();
      if (code.length !== 4) { setOnlineError('Código deve ter 4 caracteres'); return; }
      setOnlineLoading(true);
      setOnlineError('');
      try {
        const room = await joinRoom(code);
        onOnlineRoom(room, platform);
      } catch (e: any) {
        setOnlineError(e?.message ?? 'Sala não encontrada ou cheia');
        setOnlineLoading(false);
      }
    }

    return (
      <div className="relative flex flex-col items-center justify-center gap-6 w-full h-full overflow-hidden">
        <PageBg />
        <BrawlTitle sub="MODO ONLINE" />

        <div className="relative z-10 flex flex-col gap-4 w-full max-w-sm px-6">
          {/* Create room */}
          <button onClick={handleCreate} disabled={onlineLoading}
            className="flex items-center gap-5 px-6 py-5 rounded-2xl transition-all duration-200 hover:scale-[1.02] text-left disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)',
              boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
              border: '2px solid rgba(129,140,248,0.45)',
            }}>
            <span className="text-4xl shrink-0">{onlineLoading ? '⏳' : '🏠'}</span>
            <div>
              <p className="text-white font-black text-lg">Criar Sala</p>
              <p className="text-indigo-200 text-xs opacity-80">Gera um código e aguarda oponente</p>
            </div>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-gray-600 text-xs font-bold">OU</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          {/* Join room */}
          <div className="flex flex-col gap-2">
            <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">Entrar por código</p>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={4}
                placeholder="ABCD"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                disabled={onlineLoading}
                className="flex-1 bg-[#16112e] border border-purple-800 rounded-xl px-4 py-3
                  text-white font-black text-xl tracking-[0.3em] text-center placeholder-gray-700
                  focus:outline-none focus:border-purple-500 disabled:opacity-50"
              />
              <button onClick={handleJoin} disabled={onlineLoading || joinCode.trim().length === 0}
                className="px-5 py-3 rounded-xl font-black text-sm transition hover:opacity-90 disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', color: '#fff' }}>
                Entrar
              </button>
            </div>
          </div>

          {onlineError && (
            <p className="text-red-400 text-xs text-center font-bold">{onlineError}</p>
          )}
        </div>

        <button onClick={() => setStep('mode')} className="relative z-10 text-purple-400 text-xs font-semibold hover:text-purple-200 transition">
          ← Voltar
        </button>
      </div>
    );
  }

  // ── Team Battle ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 w-full h-full bg-[#0a071e] p-5 overflow-y-auto">
      <div className="text-center pt-1">
        <h1 className="text-3xl font-black" style={{ color: '#f87171', textShadow: '2px 2px 0 #7c0000' }}>
          ⚔️ BATALHA EM TIMES
        </h1>
        <p className="text-gray-500 text-xs mt-1">Monte os times e lute por 5 minutos</p>
      </div>

      <div className="flex gap-4 w-full max-w-2xl">
        <TeamColumn
          team="A" slots={teamA} label="⚡ Time A — Aliados"
          addingTo={addingTo} pendingChar={pendingChar} pendingRole={pendingRole}
          hasPlayer={hasPlayer} availChars={availFor('A')}
          onStartAdd={startAdd} onRemove={removeSlot}
          onSelectChar={setPendingChar} onSelectRole={setPendingRole}
          onConfirm={confirmSlot} onCancel={() => setAddingTo(null)}
        />
        <TeamColumn
          team="B" slots={teamB} label="🔥 Time B — Inimigos"
          addingTo={addingTo} pendingChar={pendingChar} pendingRole={pendingRole}
          hasPlayer={hasPlayer} availChars={availFor('B')}
          onStartAdd={startAdd} onRemove={removeSlot}
          onSelectChar={setPendingChar} onSelectRole={setPendingRole}
          onConfirm={confirmSlot} onCancel={() => setAddingTo(null)}
        />
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-3">
        <div>
          <h2 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-2">Mapa</h2>
          <div className="flex gap-3">
            {Object.values(MAP_CONFIGS).map(map => {
              const sel = tbMapId === map.id;
              return (
                <button key={map.id} onClick={() => setTbMapId(map.id)}
                  className="flex-1 p-3 rounded-xl border-2 transition-all text-left"
                  style={{
                    borderColor: sel ? '#FFD700' : 'transparent',
                    background: sel ? 'rgba(255,215,0,0.08)' : '#16112e',
                    boxShadow: sel ? '0 0 16px rgba(255,215,0,0.2)' : 'none',
                  }}>
                  <p className="font-black text-sm" style={{ color: sel ? '#FFD700' : '#fff' }}>{map.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{map.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-purple-900 bg-[#16112e]">
          <input type="checkbox" checked={enableActiveEnemies} onChange={e => setEnableActiveEnemies(e.target.checked)}
            className="w-5 h-5 accent-red-500 cursor-pointer shrink-0" />
          <div>
            <p className="text-white text-sm font-black">Inimigos Ativos</p>
            <p className="text-gray-500 text-xs">NPCs atacam o time adversário</p>
          </div>
        </label>

        {!hasPlayer && allSlots.length > 0 && (
          <p className="text-yellow-500 text-xs text-center font-bold">
            ⚠️ Adicione um slot com função "VOCÊ" em qualquer time.
          </p>
        )}

        <button onClick={startTeamBattle} disabled={!canStartTeam}
          className="w-full py-4 font-black text-xl rounded-xl transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          style={{
            background: canStartTeam ? 'linear-gradient(135deg, #991b1b 0%, #ef4444 100%)' : '#374151',
            boxShadow: canStartTeam ? '0 4px 24px rgba(239,68,68,0.45)' : 'none',
            color: '#fff',
            textShadow: '1px 1px 0 rgba(0,0,0,0.4)',
          }}>
          ⚔️ INICIAR BATALHA!
        </button>
      </div>

      <button onClick={() => setStep('mode')} className="text-purple-400 text-xs font-semibold hover:text-purple-200 transition pb-2">
        ← Voltar
      </button>
    </div>
  );
}
