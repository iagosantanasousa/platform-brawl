import { useEffect, useRef, useState } from 'react';
import type { GameConfig } from '../App';
import { initGame, destroyGame } from '../game/phaserGame';
import { touchInput } from '../game/touchInput';
import { gameState } from '../game/gameState';

interface Props {
  config: GameConfig;
  onBack: () => void;
}

// ─── Virtual Joystick ────────────────────────────────────────────────────────

const JOYSTICK_RADIUS = 44;
const DEADZONE = 8;

function VirtualJoystick() {
  const baseRef  = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const activeId  = useRef<number | null>(null);

  function clamped(dx: number, dy: number) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_RADIUS) {
      return { dx: (dx / dist) * JOYSTICK_RADIUS, dy: (dy / dist) * JOYSTICK_RADIUS };
    }
    return { dx, dy };
  }

  function offsetFromCenter(e: React.PointerEvent) {
    const rect = baseRef.current!.getBoundingClientRect();
    return clamped(
      e.clientX - (rect.left + rect.width / 2),
      e.clientY - (rect.top + rect.height / 2),
    );
  }

  function applyInput(dx: number) {
    touchInput.left  = dx < -DEADZONE;
    touchInput.right = dx >  DEADZONE;
  }

  function onDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    activeId.current = e.pointerId;
    const { dx, dy } = offsetFromCenter(e);
    setThumb({ x: dx, y: dy });
    applyInput(dx);
  }

  function onMove(e: React.PointerEvent) {
    if (activeId.current !== e.pointerId) return;
    const { dx, dy } = offsetFromCenter(e);
    setThumb({ x: dx, y: dy });
    applyInput(dx);
  }

  function onUp(e: React.PointerEvent) {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    setThumb({ x: 0, y: 0 });
    touchInput.left  = false;
    touchInput.right = false;
  }

  return (
    <div
      ref={baseRef}
      className="w-24 h-24 rounded-full bg-white/15 border-2 border-white/30 relative flex items-center justify-center touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="w-10 h-10 rounded-full bg-white/60 border-2 border-white/80 pointer-events-none absolute"
        style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
      />
    </div>
  );
}

// ─── Combo Aim Button (drag-joystick) ────────────────────────────────────────

const COMBO_RADIUS  = 36;
const COMBO_DEADZONE = 8;

function ComboAimButton() {
  const baseRef  = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  // Label-only state — 50ms polling lag is fine for visuals.
  const [labelGrounded, setLabelGrounded] = useState(false);
  const [labelCooldown, setLabelCooldown] = useState(0);
  const activeId = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setLabelGrounded(gameState.playerGrounded);
      setLabelCooldown(gameState.actionCooldown);
    }, 50);
    return () => clearInterval(id);
  }, []);

  function clamped(dx: number, dy: number) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > COMBO_RADIUS) {
      return { dx: (dx / dist) * COMBO_RADIUS, dy: (dy / dist) * COMBO_RADIUS };
    }
    return { dx, dy };
  }

  function offsetFromCenter(e: React.PointerEvent) {
    const rect = baseRef.current!.getBoundingClientRect();
    return clamped(
      e.clientX - (rect.left + rect.width / 2),
      e.clientY - (rect.top + rect.height / 2),
    );
  }

  function applyAim(dx: number, dy: number) {
    touchInput.comboAimX = Math.abs(dx) > COMBO_DEADZONE ? dx / COMBO_RADIUS : 0;
    touchInput.comboAimY = Math.abs(dy) > COMBO_DEADZONE ? dy / COMBO_RADIUS : 0;
  }

  function onDown(e: React.PointerEvent) {
    if (gameState.actionCooldown > 0) return;  // inactive during cooldown
    e.currentTarget.setPointerCapture(e.pointerId);
    activeId.current = e.pointerId;
    // Set both flags — the scene decides which applies based on player.isGrounded.
    // Grounded → scene consumes slidePressed and ignores comboHeld.
    // In air   → scene ignores slidePressed and uses comboHeld for combo aim.
    touchInput.slidePressed = true;
    touchInput.comboHeld = true;
    const { dx, dy } = offsetFromCenter(e);
    setThumb({ x: dx, y: dy });
    applyAim(dx, dy);
  }

  function onMove(e: React.PointerEvent) {
    if (activeId.current !== e.pointerId) return;
    const { dx, dy } = offsetFromCenter(e);
    setThumb({ x: dx, y: dy });
    applyAim(dx, dy);
  }

  function onUp(e: React.PointerEvent) {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    setThumb({ x: 0, y: 0 });
    touchInput.comboHeld = false;
    touchInput.comboAimX = 0;
    touchInput.comboAimY = 0;
  }

  return (
    <div className="relative flex items-center justify-center">
      {/* Seconds remaining — floats above the button */}
      {labelCooldown > 0 && (
        <span className="absolute -top-5 text-white text-xs font-black select-none pointer-events-none drop-shadow">
          {Math.ceil(labelCooldown / 1000)}s
        </span>
      )}

      <div
        ref={baseRef}
        className={`w-20 h-20 rounded-full border-2 relative flex items-center justify-center touch-none transition-colors duration-150 ${
          labelCooldown > 0
            ? 'bg-black/70 border-gray-600/50'
            : 'bg-purple-500/30 border-purple-400/60'
        }`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {labelCooldown <= 0 && (
          <>
            <span className="text-white text-xs font-black select-none pointer-events-none">
              {labelGrounded ? 'SLIDE' : 'CMB'}
            </span>
            <div
              className="w-8 h-8 rounded-full bg-purple-300/80 border border-purple-200 pointer-events-none absolute"
              style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Touch Controls overlay ──────────────────────────────────────────────────

function TouchControls({ config }: { config: GameConfig }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 select-none">
      {/* Joystick — bottom left */}
      <div className="absolute bottom-8 left-8 pointer-events-auto">
        <VirtualJoystick />
      </div>

      {/* Action buttons — bottom right */}
      <div className="absolute bottom-8 right-8 flex gap-4 pointer-events-auto">
        <button
          className="w-20 h-20 bg-red-500/50 border-2 border-red-400/60 rounded-full text-white text-sm font-black active:bg-red-500/80 touch-none"
          onPointerDown={() => { touchInput.attackPressed = true; }}
        >ATK</button>

        <div className="flex flex-col gap-3 items-center">
          <ComboAimButton />
          <button
            className="w-20 h-20 bg-blue-500/50 border-2 border-blue-400/60 rounded-full text-white text-sm font-black active:bg-blue-500/80 touch-none"
            onPointerDown={() => { touchInput.jumpPressed = true; }}
          >JUMP</button>
        </div>
      </div>
    </div>
  );
}

// ─── Fullscreen button ────────────────────────────────────────────────────────

// iOS Safari não suporta requestFullscreen para elementos genéricos.
// Único meio de fullscreen no iOS é adicionar à tela inicial (PWA standalone).
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = (window.navigator as any).standalone === true;
const supportsFullscreen = !isIOS && 'requestFullscreen' in document.documentElement;

function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    function sync() { setIsFs(!!document.fullscreenElement); }
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  function toggle() {
    if (isIOS) {
      // iOS não suporta a API — mostra dica para o usuário
      setShowIOSHint(true);
      setTimeout(() => setShowIOSHint(false), 3500);
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }

    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        (screen.orientation as any)?.lock?.('landscape-primary').catch(() => {});
      })
      .catch(() => {});
  }

  // No iOS standalone (adicionado à tela inicial) já é fullscreen — oculta o botão
  if (isStandalone) return null;

  return (
    <>
      <button
        onClick={toggle}
        title={isFs ? 'Sair do fullscreen' : 'Fullscreen'}
        className="absolute top-4 right-4 z-30 p-2.5 bg-black/60 text-white rounded-xl border border-white/20 active:bg-black/90"
      >
        {isFs ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        )}
      </button>

      {showIOSHint && (
        <div className="absolute top-16 right-4 z-30 max-w-[200px] bg-black/80 text-white text-xs rounded-xl px-3 py-2 border border-white/20 text-center leading-relaxed">
          No Safari, toque em <strong>Compartilhar → Adicionar à Tela Inicial</strong> para jogar em tela cheia.
        </div>
      )}
    </>
  );
}

// ─── Container ───────────────────────────────────────────────────────────────

export default function GameContainer({ config, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    initGame(containerRef.current, config, onBack);
    return () => destroyGame();
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0f0f1a]">
      {/* Canvas preenche o container inteiro — sem letterbox */}
      <div id="game-container" ref={containerRef} className="absolute inset-0" />

      <button
        onClick={onBack}
        className="absolute top-4 left-4 z-30 px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg border border-white/20 active:bg-black/90"
      >
        ← Lobby
      </button>

      {config.platform === 'mobile' && (
        <>
          <FullscreenButton />
          <TouchControls config={config} />
        </>
      )}
    </div>
  );
}
