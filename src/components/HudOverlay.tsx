import { Pause, Settings, Trophy } from 'lucide-react';
import { WEAPON_SPECS } from '../game/weapons';
import type { HudSnapshot } from '../types/game';

interface HudOverlayProps {
  hud: HudSnapshot;
  showFullScoreboard: boolean;
  isMobileHud: boolean;
  onSelectWeapon: (idx: number) => void;
  onOpenSettings: () => void;
  onPause: () => void;
}

export function HudOverlay({
  hud,
  showFullScoreboard,
  isMobileHud,
  onSelectWeapon,
  onOpenSettings,
  onPause,
}: HudOverlayProps) {
  if (!hud.started) return null;

  const gap = hud.crosshairGap;
  const hpPercent = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const stanceLabel = hud.sliding ? 'Sliding' : hud.sprinting ? 'Sprinting' : hud.ads ? 'Aiming' : 'Ready';

  return (
    <div className="hud-lock pointer-events-none fixed inset-0 z-10">
      {/* Damage edge vignette */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-150"
        style={{
          opacity: hud.damageFlash * 0.85,
          boxShadow: 'inset 0 0 140px 36px rgba(220, 38, 38, 0.85)',
        }}
      />

      {/* Reactive tactical crosshair */}
      {hud.deadSeconds <= 0 && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-100"
          style={{ opacity: hud.ads ? 0.35 : 0.92 }}
        >
          <span
            className="absolute left-1/2 h-2 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_3px_#000]"
            style={{ bottom: `${gap}px` }}
          />
          <span
            className="absolute left-1/2 h-2 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_3px_#000]"
            style={{ top: `${gap}px` }}
          />
          <span
            className="absolute top-1/2 h-[2px] w-2 -translate-y-1/2 bg-white shadow-[0_0_3px_#000]"
            style={{ right: `${gap}px` }}
          />
          <span
            className="absolute top-1/2 h-[2px] w-2 -translate-y-1/2 bg-white shadow-[0_0_3px_#000]"
            style={{ left: `${gap}px` }}
          />
          <span className="block h-1 w-1 rounded-full bg-amber-400 shadow-[0_0_2px_#000]" />
        </div>
      )}

      {/* Hitmarker */}
      <div
        className="pointer-events-none fixed left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 transition-opacity duration-100"
        style={{
          opacity: hud.hitMarker === 'none' ? 0 : 1,
          borderColor: hud.hitMarker === 'head' ? '#fbbf24' : '#ef4444',
        }}
      />

      {/* Top-Left: Kill feed */}
      <div className="fixed left-3.5 top-3.5 flex flex-col gap-1.5 sm:left-5 sm:top-5">
        {hud.killFeed.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md border border-white/10 bg-[#0b0f14]/80 px-3 py-1.5 text-xs text-[#eef2f6]"
          >
            <span className="font-semibold text-amber-400">{item.killer}</span>
            <span className="text-[#64748b]">·</span>
            <span className="font-mono text-[11px] text-[#cbd5e1]">
              {item.weapon}
              {item.headshot ? ' (HS)' : ''}
            </span>
            <span className="text-[#64748b]">·</span>
            <span className="font-semibold text-white">{item.victim}</span>
          </div>
        ))}
      </div>

      {/* Top-Right: Compact Leaderboard + Quick Action Buttons */}
      <div className="fixed right-3.5 top-3.5 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/82 px-3 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
          >
            <Settings className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            type="button"
            onClick={onPause}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b0f14]/82 px-3 py-1.5 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>

        <div className="hidden min-w-[196px] rounded-lg border border-white/10 bg-[#0b0f14]/78 px-3.5 py-2.5 sm:block">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#94a3b8]">
            <span className="flex items-center gap-1.5">
              <Trophy className="h-3 w-3 text-amber-400" />
              Standings
            </span>
            <span className="font-mono">K / D</span>
          </div>
          <div className="space-y-1">
            {hud.scoreboard.slice(0, 5).map((row) => (
              <div
                key={row.id}
                className={`flex items-center justify-between gap-4 text-xs ${
                  row.isMe ? 'font-semibold text-amber-400' : 'text-[#e2e8f0]'
                }`}
              >
                <span className="max-w-[115px] truncate">{row.name}</span>
                <span className="font-mono tabular-nums">
                  {row.kills}/{row.deaths}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom-Left: Health & Stance */}
      <div
        className={`fixed left-4 ${
          isMobileHud ? 'top-16 left-3.5' : 'bottom-5 left-5'
        } rounded-lg border border-white/10 bg-[#0b0f14]/82 px-3.5 py-2.5`}
      >
        <div className="mb-1.5 flex items-baseline justify-between gap-6">
          <span className="font-mono text-2xl font-bold tabular-nums leading-none text-white">
            {hud.hp}
          </span>
          <span className="text-xs font-medium text-[#94a3b8]">{stanceLabel}</span>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-white/15 sm:w-52">
          <div
            className={`h-full transition-[width] duration-100 ${
              hpPercent > 40 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* Bottom-Center: 7-Weapon Strip */}
      <div
        className={`pointer-events-auto fixed left-1/2 -translate-x-1/2 ${
          isMobileHud ? 'bottom-3' : 'bottom-5'
        } flex max-w-[96vw] items-center gap-1 overflow-x-auto rounded-lg border border-white/10 bg-[#0b0f14]/82 p-1`}
      >
        {WEAPON_SPECS.map((w, idx) => {
          const active = idx === hud.weaponIdx;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelectWeapon(idx)}
              className={`min-h-[34px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-[#94a3b8] hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="mr-1 font-mono opacity-75">{idx + 1}</span>
              <span className="hidden md:inline">{w.name}</span>
              <span className="md:hidden">{w.id}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom-Right: Ammo & Active Weapon */}
      <div
        className={`fixed ${
          isMobileHud ? 'right-3.5 bottom-14' : 'right-5 bottom-5'
        } rounded-lg border border-white/10 bg-[#0b0f14]/82 px-4 py-2.5 text-right`}
      >
        {hud.reloading ? (
          <div>
            <div className="font-display text-sm font-bold text-amber-400">Reloading</div>
            <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full bg-amber-500"
                style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="font-mono text-3xl font-bold tabular-nums leading-none text-white">
                {hud.ammo}
              </span>
              <span className="font-mono text-sm tabular-nums text-[#94a3b8]">/ {hud.mag}</span>
            </div>
            <div className="mt-0.5 text-xs font-medium text-[#cbd5e1]">{hud.weaponName}</div>
          </div>
        )}
      </div>

      {/* Full Tab Scoreboard Overlay */}
      {showFullScoreboard && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#06090d]/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#111720] p-5 text-[#eef2f6]">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
              <h3 className="font-display text-lg font-bold text-white">Match Scoreboard</h3>
              <span className="text-xs text-[#94a3b8]">
                {hud.peerCount > 0 ? `P2P (${hud.peerCount + 1} Players)` : 'Solo vs Bots'}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-12 px-2 text-[11px] font-medium text-[#64748b]">
                <span className="col-span-6">Operator</span>
                <span className="col-span-3 text-right">Kills</span>
                <span className="col-span-3 text-right">Deaths</span>
              </div>
              {hud.scoreboard.map((row) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-12 items-center rounded-md px-2.5 py-2 text-sm ${
                    row.isMe ? 'bg-amber-500/15 font-semibold text-amber-300' : 'bg-white/[0.03]'
                  }`}
                >
                  <span className="col-span-6 truncate">
                    {row.name}
                    {row.isBot ? ' · Bot' : ''}
                  </span>
                  <span className="col-span-3 text-right font-mono tabular-nums">{row.kills}</span>
                  <span className="col-span-3 text-right font-mono tabular-nums">{row.deaths}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Respawn overlay */}
      {hud.deadSeconds > 0 && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-red-950/35">
          <div className="rounded-xl border border-red-400/30 bg-[#0b0f14]/90 px-7 py-5 text-center">
            <div className="font-display text-2xl font-bold text-white">Eliminated</div>
            <div className="mt-1 font-mono text-sm tabular-nums text-amber-400">
              Respawning in {hud.deadSeconds}s
            </div>
          </div>
        </div>
      )}

      {/* Discreet desktop resume prompt when pointer lock was released without lobby */}
      {!hud.playing && !isMobileHud && hud.deadSeconds <= 0 && (
        <div className="fixed left-1/2 top-5 z-20 -translate-x-1/2 rounded-lg border border-white/12 bg-[#0b0f14]/88 px-4 py-2 text-xs font-medium text-[#e2e8f0]">
          Click arena to resume aim
        </div>
      )}
    </div>
  );
}
