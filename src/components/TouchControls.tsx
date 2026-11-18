import { useRef, useState } from 'react';
import { Crosshair, ArrowUp, RefreshCw, Flame, Wind, Repeat } from 'lucide-react';

interface TouchControlsProps {
  ads: boolean;
  onMove: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onFireChange: (firing: boolean) => void;
  onToggleAds: () => void;
  onJump: () => void;
  onSlide: () => void;
  onReload: () => void;
  onNextWeapon: () => void;
}

export function TouchControls({
  ads,
  onMove,
  onLookDelta,
  onFireChange,
  onToggleAds,
  onJump,
  onSlide,
  onReload,
  onNextWeapon,
}: TouchControlsProps) {
  const joyPointerId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const lookPointerId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const MAX_RADIUS = 44;

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joyPointerId.current !== null) return;
    joyPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoy(e.clientX, e.clientY);
  };

  const updateJoy = (cx: number, cy: number) => {
    const dx = cx - joyOrigin.current.x;
    const dy = cy - joyOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(MAX_RADIUS, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 0 ? Math.sin(angle) * clamped : 0;
    setKnobOffset({ x: kx, y: ky });
    onMove(kx / MAX_RADIUS, -ky / MAX_RADIUS);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerId.current) return;
    e.stopPropagation();
    updateJoy(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerId.current) return;
    e.stopPropagation();
    joyPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== null) return;
    lookPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    lookPointerId.current = null;
  };

  return (
    <div className="hud-lock pointer-events-none fixed inset-0 z-20">
      {/* Right-half touch aim surface */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="pointer-events-auto absolute inset-y-0 right-0 w-[58%]"
        aria-label="Touch aim zone"
      />

      {/* Left-thumb virtual movement stick */}
      <div
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        className="pointer-events-auto absolute bottom-20 left-6 flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-[#0b0f14]/55"
        aria-label="Movement joystick"
      >
        <div
          style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
          className="h-14 w-14 rounded-full border border-amber-400/70 bg-amber-500/80 shadow-lg"
        />
      </div>

      {/* Right-thumb ergonomic action cluster */}
      <div className="pointer-events-auto absolute right-5 bottom-24 flex flex-col items-end gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onNextWeapon();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
            aria-label="Next weapon"
          >
            <Repeat className="h-5 w-5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onReload();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
            aria-label="Reload"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleAds();
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-xl border active:scale-95 ${
              ads
                ? 'border-amber-400 bg-amber-500 text-slate-950'
                : 'border-white/15 bg-[#0b0f14]/75 text-white'
            }`}
            aria-label="Aim down sights"
          >
            <Crosshair className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onJump();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
              aria-label="Jump"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onSlide();
              }}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#0b0f14]/75 text-white active:scale-95"
              aria-label="Slide"
            >
              <Wind className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              onFireChange(true);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              onFireChange(false);
            }}
            onPointerCancel={() => onFireChange(false)}
            className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-amber-300/80 bg-amber-500/90 text-slate-950 shadow-xl active:scale-95"
            aria-label="Fire weapon"
          >
            <Flame className="h-8 w-8" />
          </button>
        </div>
      </div>
    </div>
  );
}
