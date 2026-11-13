// Brink sounds, synthesized: a stone sliding on rock, the knock of a shove, a
// splash-thud as a stone goes over, rumbling crumbles, little fanfares.
// Silent until the first touch, and never when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

export class Sounds {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    if (this.ctx || !soundOn()) return;
    try {
      this.ctx = new AudioContext();
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.8, this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    } catch {
      this.ctx = null;
    }
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(freq: number, dur: number, vol: number, delay = 0, q = 1, type: BiquadFilterType = 'bandpass'): void {
    const c = this.ctx;
    if (!c || !this.noise) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** A stone picked up. */
  pick(): void {
    this.tone(880, 990, 0.05, 0.05, 'triangle');
  }

  /** A stone slides one tile. */
  slide(): void {
    this.hiss(1800, 0.16, 0.12, 0, 1.2);
    this.tone(240, 200, 0.08, 0.06, 'triangle', 0.12);
  }

  /** Stones knock together and shove. */
  shove(n: number): void {
    this.tone(520, 300, 0.06, 0.16, 'square');
    this.hiss(2600, 0.05, 0.25, 0, 5);
    this.hiss(1400, 0.2, 0.1 + n * 0.04, 0.03, 1);
  }

  /** A stone goes over the edge: a whoosh and a distant thud. */
  over(): void {
    this.hiss(900, 0.45, 0.22, 0, 0.7, 'lowpass');
    this.tone(330, 60, 0.5, 0.12, 'sine', 0.05);
    this.tone(90, 40, 0.3, 0.28, 'sine', 0.45);
  }

  /** A tile crumbles away. */
  crumble(): void {
    this.hiss(260, 0.55, 0.3, 0, 0.6, 'lowpass');
    for (let i = 0; i < 5; i++) this.hiss(3000 + i * 400, 0.04, 0.08, 0.04 + i * 0.06, 6);
  }

  nope(): void {
    this.tone(160, 100, 0.12, 0.18, 'triangle');
  }

  undo(): void {
    this.tone(700, 420, 0.1, 0.08, 'triangle');
  }

  hint(): void {
    [988, 1319].forEach((f, i) => this.tone(f, f, 0.18, 0.06, 'sine', i * 0.06));
  }

  end(won: boolean): void {
    if (won) [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.4, 0.09, 'triangle', i * 0.09));
    else [440, 370, 311, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.4, 0.1, 'sine', i * 0.16));
  }
}
