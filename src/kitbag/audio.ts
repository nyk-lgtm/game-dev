// Kitbag sounds, synthesized: a dice rattle, a click as a die seats in a slot,
// sword thuds, shield clanks, the enemy's blow, a fuse blowing, fanfares.
// Silent until the first touch, and never when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

export class Sounds {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    if (this.ctx || !soundOn()) return;
    try {
      this.ctx = new AudioContext();
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.6, this.ctx.sampleRate);
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
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
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
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** Dice tumbling onto the table: a handful of little clacks. */
  roll(n: number): void {
    for (let i = 0; i < n * 3; i++) {
      const d = i * 0.035 + (i % 3) * 0.012;
      this.hiss(2600 + ((i * 377) % 1400), 0.03, 0.22 - i * 0.008, d, 6);
    }
    this.tone(180, 120, 0.08, 0.08, 'triangle', n * 0.1);
  }

  /** A die seats in a slot. */
  seat(): void {
    this.hiss(3800, 0.025, 0.25, 0, 4);
    this.tone(900, 700, 0.05, 0.06, 'square');
  }

  hit(n: number): void {
    this.hiss(500, 0.14, 0.35, 0, 0.8, 'lowpass');
    this.tone(220 - Math.min(120, n * 4), 70, 0.16, 0.25, 'sine');
  }

  block(): void {
    this.tone(1400, 1300, 0.18, 0.07, 'triangle');
    this.tone(2100, 1900, 0.14, 0.05, 'sine', 0.01);
    this.hiss(5000, 0.06, 0.12, 0, 2);
  }

  heal(): void {
    [660, 880, 1100].forEach((f, i) => this.tone(f, f, 0.18, 0.06, 'sine', i * 0.05));
  }

  magic(): void {
    this.tone(500, 1200, 0.18, 0.06, 'triangle');
  }

  boom(): void {
    this.hiss(300, 0.6, 0.6, 0, 0.5, 'lowpass');
    this.tone(110, 35, 0.5, 0.35, 'sine');
  }

  nope(): void {
    this.tone(150, 95, 0.12, 0.2, 'triangle');
  }

  undo(): void {
    this.tone(700, 420, 0.1, 0.08, 'triangle');
  }

  /** The enemy's blow lands; louder when it gets through. */
  hurt(n: number): void {
    if (n <= 0) return this.block();
    this.hiss(260, 0.25, 0.45, 0, 0.7, 'lowpass');
    this.tone(160, 60, 0.25, 0.3, 'sawtooth');
  }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.35, 0.1, 'triangle', i * 0.08));
  }

  pick(): void {
    [1175, 1568].forEach((f, i) => this.tone(f, f, 0.3, 0.07, 'sine', i * 0.06));
  }

  over(won: boolean): void {
    if (won) [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, f, 0.45, 0.1, 'triangle', i * 0.1));
    else [440, 370, 311, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.4, 0.1, 'sine', i * 0.16));
  }
}
