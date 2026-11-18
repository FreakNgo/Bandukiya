import { useState } from 'react';
import { Check, Copy, Play, Settings, Users, Bot } from 'lucide-react';
import type { LobbyTab } from '../types/game';

interface LobbyModalProps {
  open: boolean;
  started: boolean;
  callsign: string;
  botCount: number;
  peerCount: number;
  p2pStatus: string;
  mapReady: boolean;
  weaponsReady: boolean;
  onCallsignChange: (name: string) => void;
  onStartMatch: () => void;
  onOpenSettings: () => void;
  onCreateInvite: () => Promise<string>;
  onAcceptReply: (code: string) => Promise<void>;
  onJoinInvite: (code: string) => Promise<string>;
}

export function LobbyModal({
  open,
  started,
  callsign,
  botCount,
  peerCount,
  p2pStatus,
  mapReady,
  weaponsReady,
  onCallsignChange,
  onStartMatch,
  onOpenSettings,
  onCreateInvite,
  onAcceptReply,
  onJoinInvite,
}: LobbyModalProps) {
  const [tab, setTab] = useState<LobbyTab>('solo');
  const [hostInvite, setHostInvite] = useState('');
  const [hostReplyInput, setHostReplyInput] = useState('');
  const [joinInviteInput, setJoinInviteInput] = useState('');
  const [joinReply, setJoinReply] = useState('');
  const [localError, setLocalError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const copyText = async (value: string, id: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      setLocalError('Clipboard access blocked — select the code manually and copy.');
    }
  };

  const handleCreateInvite = async () => {
    setLocalError('');
    setBusy(true);
    try {
      const code = await onCreateInvite();
      setHostInvite(code);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Failed to create invite.');
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptReply = async () => {
    if (!hostReplyInput.trim()) return;
    setLocalError('');
    setBusy(true);
    try {
      await onAcceptReply(hostReplyInput);
      setHostReplyInput('');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Invalid reply code.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinInvite = async () => {
    if (!joinInviteInput.trim()) return;
    setLocalError('');
    setBusy(true);
    try {
      const reply = await onJoinInvite(joinInviteInput);
      setJoinReply(reply);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Invalid invite code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#06090d]/78 p-4 overflow-y-auto">
      <div className="w-full max-w-[540px] rounded-xl border border-white/12 bg-[#111720] p-6 text-[#eef2f6] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wider text-white">
              BANDUKWA <span className="text-amber-500">ARENA</span>
            </h1>
            <p className="mt-0.5 text-xs text-[#94a3b8]">
              Desert Compound · 7 Normalized Weapons · Solo AI &amp; Peer-to-Peer
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/12 bg-[#18212d] px-3 py-2 text-xs font-semibold text-[#e2e8f0] transition-colors hover:border-amber-500/60 hover:text-white whitespace-nowrap shrink-0"
          >
            <Settings className="h-3.5 w-3.5 text-amber-400" />
            Settings
          </button>
        </div>

        {/* Callsign & Asset Load Line */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label htmlFor="callsign-input" className="mb-1 block text-xs font-medium text-[#94a3b8]">
              Callsign
            </label>
            <input
              id="callsign-input"
              maxLength={14}
              value={callsign}
              onChange={(e) => onCallsignChange(e.target.value)}
              placeholder="Operator"
              className="w-full rounded-lg border border-white/12 bg-[#0b0f14] px-3.5 py-2.5 text-sm font-medium text-white outline-none transition-colors focus:border-amber-500"
            />
          </div>
          <div className="sm:pt-5">
            <button
              type="button"
              onClick={onStartMatch}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap sm:w-auto"
            >
              <Play className="h-4 w-4 fill-current" />
              {started ? 'Resume Match' : 'Deploy Now'}
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-[#0b0f14] p-1">
          <button
            type="button"
            onClick={() => setTab('solo')}
            className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'solo'
                ? 'bg-[#1c2532] text-white'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            Solo vs Bots
          </button>
          <button
            type="button"
            onClick={() => setTab('host')}
            className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'host'
                ? 'bg-[#1c2532] text-white'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            Host P2P
          </button>
          <button
            type="button"
            onClick={() => setTab('join')}
            className={`min-h-[40px] rounded-md px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === 'join'
                ? 'bg-[#1c2532] text-white'
                : 'text-[#94a3b8] hover:text-white'
            }`}
          >
            Join P2P
          </button>
        </div>

        {/* Mode Content */}
        {tab === 'solo' && (
          <div className="mt-4 rounded-lg border border-white/10 bg-[#0d1219] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bot className="h-4 w-4 text-amber-400" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {botCount > 0 ? `${botCount} Active Arena Bots` : 'Free Roam Practice'}
                  </div>
                  <div className="text-xs text-[#94a3b8]">
                    Adjust bot count or aim sensitivity anytime in Quick Settings
                  </div>
                </div>
              </div>
              <span className="font-mono text-xs text-[#cbd5e1]">
                {mapReady && weaponsReady ? 'Assets Ready' : 'Loading Arena…'}
              </span>
            </div>
          </div>
        )}

        {tab === 'host' && (
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-[#0d1219] p-4">
            <div className="flex items-center justify-between text-xs text-[#94a3b8]">
              <span>1. Create an invite and share it with a friend. 2. Paste their reply code.</span>
              <span className="flex items-center gap-1 font-mono text-amber-400 whitespace-nowrap">
                <Users className="h-3.5 w-3.5" />
                {peerCount} peers
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleCreateInvite}
                className="min-h-[40px] flex-1 rounded-lg border border-white/15 bg-[#18212d] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-amber-500/60 disabled:opacity-50 whitespace-nowrap"
              >
                Create Invite Code
              </button>
              <button
                type="button"
                disabled={!hostInvite}
                onClick={() => copyText(hostInvite, 'host')}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#18212d] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-amber-500/60 disabled:opacity-40 whitespace-nowrap"
              >
                {copiedId === 'host' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedId === 'host' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              readOnly
              value={hostInvite}
              placeholder="Invite code appears here..."
              className="h-14 w-full resize-none rounded-lg border border-white/10 bg-[#090c10] p-2.5 font-mono text-[11px] text-[#cbd5e1] outline-none"
            />
            <textarea
              value={hostReplyInput}
              onChange={(e) => setHostReplyInput(e.target.value)}
              placeholder="Paste friend's reply code here..."
              className="h-14 w-full resize-none rounded-lg border border-white/10 bg-[#090c10] p-2.5 font-mono text-[11px] text-white outline-none focus:border-amber-500"
            />
            <button
              type="button"
              disabled={busy || !hostReplyInput.trim()}
              onClick={handleAcceptReply}
              className="min-h-[40px] w-full rounded-lg bg-[#222d3c] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2b394c] disabled:opacity-45"
            >
              Connect Player
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-[#0d1219] p-4">
            <p className="text-xs text-[#94a3b8]">
              Paste the host invite below, generate your reply code, and send it back to the host.
            </p>
            <textarea
              value={joinInviteInput}
              onChange={(e) => setJoinInviteInput(e.target.value)}
              placeholder="Paste host invite code here..."
              className="h-14 w-full resize-none rounded-lg border border-white/10 bg-[#090c10] p-2.5 font-mono text-[11px] text-white outline-none focus:border-amber-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !joinInviteInput.trim()}
                onClick={handleJoinInvite}
                className="min-h-[40px] flex-1 rounded-lg border border-white/15 bg-[#18212d] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-amber-500/60 disabled:opacity-45 whitespace-nowrap"
              >
                Create Reply Code
              </button>
              <button
                type="button"
                disabled={!joinReply}
                onClick={() => copyText(joinReply, 'join')}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#18212d] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:border-amber-500/60 disabled:opacity-40 whitespace-nowrap"
              >
                {copiedId === 'join' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedId === 'join' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              readOnly
              value={joinReply}
              placeholder="Your reply code appears here..."
              className="h-14 w-full resize-none rounded-lg border border-white/10 bg-[#090c10] p-2.5 font-mono text-[11px] text-[#cbd5e1] outline-none"
            />
          </div>
        )}

        {(localError || p2pStatus) && (
          <div className="mt-3 text-xs text-amber-400">
            {localError || p2pStatus}
          </div>
        )}

        {/* Controls Footer */}
        <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-[#64748b]">
          Desktop: WASD move · Shift sprint · Space jump · C / Ctrl slide · Click shoot · Right-click ADS · R reload · 1–7 weapons · Tab scores · Esc pause
        </div>
      </div>
    </div>
  );
}
