const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

export type P2PMessage =
  | { t: 'id'; id: number; from?: number }
  | { t: 'bye'; id: number; from?: number }
  | {
      t: 's';
      from?: number;
      n: string;
      p: [number, number, number];
      r: number;
      q: number;
      w: number;
      sl: number;
      hp: number;
    }
  | { t: 'f'; from?: number; m: [number, number, number]; e: [number, number, number]; w: number; h: number }
  | { t: 'h'; from?: number; to: number; d: number; hd: number }
  | { t: 'k'; from?: number; k: number; v: number; w?: number; hd?: number };

async function encodePayload(obj: RTCSessionDescriptionInit): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    const out = new Uint8Array(await new Response(st).arrayBuffer());
    let bin = '';
    out.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  }
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

async function decodePayload(code: string): Promise<RTCSessionDescriptionInit> {
  const raw = Uint8Array.from(atob(code.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const st = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
      const txt = await new Response(st).text();
      return JSON.parse(txt) as RTCSessionDescriptionInit;
    } catch {
      // Fall back to raw JSON if uncompressed
    }
  }
  const txt = new TextDecoder().decode(raw);
  return JSON.parse(txt) as RTCSessionDescriptionInit;
}

function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const onState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', onState);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onState);
    window.setTimeout(resolve, 4500);
  });
}

export class P2PManager {
  isHost = true;
  myId = 0;
  private nextId = 1;
  private peers = new Map<number, { pc: RTCPeerConnection; dc: RTCDataChannel }>();
  private pending: { pc: RTCPeerConnection; id: number } | null = null;
  private hostDc: RTCDataChannel | null = null;
  private joinPc: RTCPeerConnection | null = null;

  onStatus?: (msg: string) => void;
  onPeerCountChange?: (count: number) => void;
  onMessage?: (msg: P2PMessage) => void;
  onPeerLeft?: (id: number) => void;

  get connectedCount(): number {
    if (this.isHost) return this.peers.size;
    return this.hostDc && this.hostDc.readyState === 'open' ? 1 : 0;
  }

  private emitStatus(msg: string): void {
    this.onStatus?.(msg);
  }

  private emitCount(): void {
    this.onPeerCountChange?.(this.connectedCount);
  }

  send(msg: P2PMessage): void {
    if (this.isHost) {
      msg.from = 0;
      if (!this.peers.size) return;
      const serialized = JSON.stringify(msg);
      const targetId = 'to' in msg ? msg.to : undefined;
      if (targetId !== undefined) {
        const p = this.peers.get(targetId);
        if (p && p.dc.readyState === 'open') p.dc.send(serialized);
      } else {
        this.peers.forEach((p) => {
          if (p.dc.readyState === 'open') p.dc.send(serialized);
        });
      }
      return;
    }

    if (this.hostDc && this.hostDc.readyState === 'open') {
      this.hostDc.send(JSON.stringify(msg));
    }
  }

  async createHostInvite(): Promise<string> {
    this.isHost = true;
    const pc = new RTCPeerConnection(ICE_CONFIG);
    const dc = pc.createDataChannel('bandukwa');
    const id = this.nextId++;
    this.peers.set(id, { pc, dc });
    this.pending = { pc, id };

    dc.onopen = () => {
      dc.send(JSON.stringify({ t: 'id', id }));
      this.emitStatus(`Player #${id} connected.`);
      this.emitCount();
    };
    dc.onmessage = (ev) => {
      let m: P2PMessage;
      try {
        m = JSON.parse(String(ev.data)) as P2PMessage;
      } catch {
        return;
      }
      m.from = id;
      const targetId = 'to' in m ? m.to : undefined;
      if (targetId !== undefined && targetId !== 0) {
        const dest = this.peers.get(targetId);
        if (dest && dest.dc.readyState === 'open') {
          dest.dc.send(JSON.stringify(m));
        }
      } else {
        if (targetId === undefined) {
          const relay = JSON.stringify(m);
          this.peers.forEach((peer, pid) => {
            if (pid !== id && peer.dc.readyState === 'open') {
              peer.dc.send(relay);
            }
          });
        }
        this.onMessage?.(m);
      }
    };
    dc.onclose = () => {
      this.peers.delete(id);
      this.onPeerLeft?.(id);
      this.send({ t: 'bye', id });
      this.emitStatus(`Player #${id} left.`);
      this.emitCount();
    };

    this.emitStatus('Gathering network candidates...');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    const code = await encodePayload({
      type: pc.localDescription?.type ?? 'offer',
      sdp: pc.localDescription?.sdp ?? '',
    });
    this.emitStatus(`Invite ready for Player #${id}. Share it, then paste their reply.`);
    return code;
  }

  async acceptReplyCode(replyCode: string): Promise<void> {
    if (!this.pending) {
      throw new Error('Create an invite code first.');
    }
    const desc = await decodePayload(replyCode);
    await this.pending.pc.setRemoteDescription(desc);
    this.pending = null;
    this.emitStatus('Completing peer handshake...');
  }

  async joinWithInvite(inviteCode: string): Promise<string> {
    this.isHost = false;
    this.joinPc?.close();
    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.joinPc = pc;

    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      this.hostDc = dc;
      dc.onopen = () => {
        this.emitStatus('Connected to host! Ready to deploy.');
        this.emitCount();
      };
      dc.onmessage = (msgEv) => {
        try {
          const m = JSON.parse(String(msgEv.data)) as P2PMessage;
          if (m.t === 'id') {
            this.myId = m.id;
          } else {
            this.onMessage?.(m);
          }
        } catch {
          // ignore malformed packet
        }
      };
      dc.onclose = () => {
        this.hostDc = null;
        this.emitStatus('Disconnected from host.');
        this.emitCount();
      };
    };

    this.emitStatus('Processing host invite...');
    const offer = await decodePayload(inviteCode);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    const code = await encodePayload({
      type: pc.localDescription?.type ?? 'answer',
      sdp: pc.localDescription?.sdp ?? '',
    });
    this.emitStatus('Reply code ready. Send it back to the host.');
    return code;
  }

  dispose(): void {
    this.peers.forEach(({ pc, dc }) => {
      dc.close();
      pc.close();
    });
    this.peers.clear();
    this.hostDc?.close();
    this.joinPc?.close();
  }
}
