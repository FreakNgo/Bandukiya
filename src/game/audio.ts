class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterVolume = 0.75;

  setVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  unlock(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          this.ctx = new Ctor();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  noise(dur: number, cutoffHz: number, vol: number, filterType: BiquadFilterType = 'lowpass'): void {
    const a = this.unlock();
    const v = vol * this.masterVolume;
    if (!a || v < 0.004) return;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const flt = a.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = cutoffHz;
    const gain = a.createGain();
    gain.gain.setValueAtTime(v, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    src.connect(flt);
    flt.connect(gain);
    gain.connect(a.destination);
    src.start();
  }

  tone(
    freqStart: number,
    freqEnd: number,
    dur: number,
    vol: number,
    type: OscillatorType = 'sine',
  ): void {
    const a = this.unlock();
    const v = vol * this.masterVolume;
    if (!a || v < 0.004) return;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, a.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), a.currentTime + dur);
    gain.gain.setValueAtTime(v, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur);
  }

  shot(soundType: 0 | 1 | 2, distanceGain = 1): void {
    const cutoff = [2350, 3200, 1950][soundType];
    const f0 = [145, 175, 125][soundType];
    this.noise(0.18, cutoff, 0.45 * distanceGain, 'lowpass');
    this.tone(f0, 42, 0.14, 0.45 * distanceGain, 'triangle');
  }

  swap(): void {
    this.noise(0.07, 2900, 0.12, 'bandpass');
  }

  reload(reloadSec: number): void {
    this.noise(0.06, 2500, 0.14, 'bandpass');
    window.setTimeout(() => {
      this.noise(0.09, 1300, 0.18, 'bandpass');
    }, Math.max(150, reloadSec * 580));
  }

  hitmarker(headshot: boolean): void {
    if (headshot) {
      this.tone(1650, 1180, 0.07, 0.22, 'triangle');
    } else {
      this.tone(1150, 760, 0.05, 0.16, 'square');
    }
  }

  footstep(): void {
    this.noise(0.05, 480, 0.07, 'lowpass');
  }

  slide(): void {
    this.noise(0.45, 720, 0.22, 'bandpass');
  }

  death(): void {
    this.tone(210, 52, 0.38, 0.4, 'sawtooth');
  }
}

export const soundEngine = new SoundEngine();
