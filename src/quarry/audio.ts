// Quarry sounds, synthesized: a stone click that climbs as the trail grows, a
// chord for a played word (fuller for longer words), a soft thud for a miss,
// rock cracks, fuse blasts and fanfares. Silent until the first touch, and
// never when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

// A pentatonic ladder so long trails keep climbing pleasantly.
const LADDER = [392, 440, 523, 587, 659, 784, 880, 1047, 1175];

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
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** A tile joins the trail (n = trail length). */
  tick(n: number): void {
    const f = LADDER[Math.min(LADDER.length - 1, Math.max(0, n - 1))];
    this.hiss(4200, 0.03, 0.12, 0, 2);
    this.tone(f, f, 0.09, 0.07, 'triangle');
  }

  /** The trail steps back. */
  untick(): void {
    this.tone(330, 260, 0.06, 0.05, 'triangle');
  }

  /** A word is played: a chord that grows with its length. */
  word(len: number): void {
    this.hiss(2600, 0.08, 0.16, 0, 0.9);
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, Math.max(2, Math.min(6, len - 1)));
    notes.forEach((f, i) => this.tone(f, f, 0.32, 0.08, 'triangle', 0.03 + i * 0.045));
  }

  nope(): void {
    this.tone(150, 100, 0.14, 0.18, 'triangle');
  }

  crack(): void {
    this.hiss(900, 0.18, 0.35, 0.05, 0.7);
    this.tone(180, 70, 0.15, 0.15, 'square', 0.05);
  }

  boom(): void {
    this.hiss(380, 0.55, 0.55, 0, 0.5, 'lowpass');
    this.tone(110, 38, 0.45, 0.32, 'sine');
  }

  /** Tiles rattle down after a shake. */
  shake(): void {
    for (let i = 0; i < 6; i++) this.hiss(1800 + i * 300, 0.05, 0.12, i * 0.04, 2);
  }

  clear(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.42, 0.1, 'triangle', i * 0.08));
  }

  perk(): void {
    [1175, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.5, 0.07, 'sine', i * 0.06));
  }

  over(won: boolean): void {
    if (won) [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, f, 0.45, 0.1, 'triangle', i * 0.1));
    else [440, 370, 311, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.4, 0.1, 'sine', i * 0.16));
  }
}
