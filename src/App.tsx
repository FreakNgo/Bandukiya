import { useEffect, useMemo, useRef, useState } from 'react';
import { HudOverlay } from './components/HudOverlay';
import { LobbyModal } from './components/LobbyModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TouchControls } from './components/TouchControls';
import { BandukwaEngine } from './game/engine';
import { DEFAULT_SETTINGS, type HudSnapshot, type SettingsState } from './types/game';

const SETTINGS_STORAGE_KEY = 'bandukwa_settings_v1';
const CALLSIGN_STORAGE_KEY = 'bandukwa_callsign_v1';

function loadInitialSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SettingsState>) };
    }
  } catch {
    // ignore storage errors
  }
  return { ...DEFAULT_SETTINGS };
}

function loadInitialCallsign(): string {
  try {
    return localStorage.getItem(CALLSIGN_STORAGE_KEY) || 'Operator';
  } catch {
    return 'Operator';
  }
}

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  ammo: 30,
  mag: 30,
  weaponIdx: 0,
  weaponName: 'AK-47',
  reloading: false,
  reloadProgress: 0,
  ads: false,
  sliding: false,
  sprinting: false,
  deadSeconds: 0,
  crosshairGap: 8,
  hitMarker: 'none',
  damageFlash: 0,
  scoreboard: [],
  killFeed: [],
  pointerLocked: false,
  playing: false,
  started: false,
  mapReady: false,
  weaponsReady: false,
  peerCount: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<BandukwaEngine | null>(null);

  const [settings, setSettings] = useState<SettingsState>(loadInitialSettings);
  const [callsign, setCallsign] = useState<string>(loadInitialCallsign);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [lobbyOpen, setLobbyOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabScoreboard, setTabScoreboard] = useState(false);
  const [p2pStatus, setP2pStatus] = useState('');
  const [hasCoarsePointer, setHasCoarsePointer] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      const coarse =
        window.matchMedia('(pointer: coarse)').matches ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0;
      setHasCoarsePointer(coarse);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  const isMobileHud = useMemo(() => {
    if (settings.controlMode === 'mobile') return true;
    if (settings.controlMode === 'desktop') return false;
    return hasCoarsePointer;
  }, [settings.controlMode, hasCoarsePointer]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new BandukwaEngine(
      mount,
      settings,
      (snapshot) => setHud(snapshot),
      () => setLobbyOpen(true),
    );
    engine.p2p.onStatus = (msg) => setP2pStatus(msg);
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // Initialize WebGL scene exactly once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab' && hud.playing) {
        e.preventDefault();
        setTabScoreboard(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setTabScoreboard(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [hud.playing]);

  const handleSettingsChange = (next: SettingsState) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const handleCallsignChange = (name: string) => {
    setCallsign(name);
    try {
      localStorage.setItem(CALLSIGN_STORAGE_KEY, name);
    } catch {
      // ignore storage errors
    }
  };

  const handleStartMatch = () => {
    setLobbyOpen(false);
    setSettingsOpen(false);
    engineRef.current?.deploy(callsign, !isMobileHud);
  };

  const handleOpenSettings = () => {
    if (hud.pointerLocked && document.pointerLockElement) {
      document.exitPointerLock();
    }
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
  };

  const handlePause = () => {
    engineRef.current?.pauseToMenu();
    setLobbyOpen(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0f14]">
      {/* Isolated WebGL viewport container */}
      <div
        ref={canvasMountRef}
        onClick={() => {
          if (hud.started && !hud.playing && !lobbyOpen && !settingsOpen && !isMobileHud) {
            engineRef.current?.requestLock();
          }
        }}
        className="absolute inset-0 h-full w-full"
      />

      {/* Tactical HUD */}
      <HudOverlay
        hud={hud}
        showFullScoreboard={tabScoreboard}
        isMobileHud={isMobileHud}
        onSelectWeapon={(idx) => engineRef.current?.selectWeapon(idx)}
        onOpenSettings={handleOpenSettings}
        onPause={handlePause}
      />

      {/* Mobile / Touch Dual-Thumb Controls */}
      {hud.started && hud.playing && isMobileHud && !lobbyOpen && !settingsOpen && (
        <TouchControls
          ads={hud.ads}
          onMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onLookDelta={(dx, dy) => engineRef.current?.addLookDelta(dx, dy)}
          onFireChange={(f) => engineRef.current?.setTouchFire(f)}
          onToggleAds={() => engineRef.current?.toggleTouchAds()}
          onJump={() => engineRef.current?.triggerJump()}
          onSlide={() => engineRef.current?.triggerSlide()}
          onReload={() => engineRef.current?.triggerReload()}
          onNextWeapon={() => engineRef.current?.cycleWeapon()}
        />
      )}

      {/* Lobby & Match Setup Modal */}
      <LobbyModal
        open={lobbyOpen}
        started={hud.started}
        callsign={callsign}
        botCount={settings.botCount}
        peerCount={hud.peerCount}
        p2pStatus={p2pStatus}
        mapReady={hud.mapReady}
        weaponsReady={hud.weaponsReady}
        onCallsignChange={handleCallsignChange}
        onStartMatch={handleStartMatch}
        onOpenSettings={handleOpenSettings}
        onCreateInvite={async () => {
          if (!engineRef.current) return '';
          return engineRef.current.p2p.createHostInvite();
        }}
        onAcceptReply={async (code) => {
          await engineRef.current?.p2p.acceptReplyCode(code);
        }}
        onJoinInvite={async (code) => {
          if (!engineRef.current) return '';
          return engineRef.current.p2p.joinWithInvite(code);
        }}
      />

      {/* Quick Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onChange={handleSettingsChange}
        onClose={handleCloseSettings}
      />
    </div>
  );
}
