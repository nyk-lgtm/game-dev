// Summit sounds, synthesized: a card snap whose chime climbs with the streak,
// a draw swish, a dull knock for a card that won't play, a blast, and fanfares.
// Silent until the first touch, and never when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

// A pentatonic ladder so long streaks keep climbing pleasantly.
const LADDER = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];

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

  /** A card lands on the waste; the chime climbs with the streak. */
  play(streak: number): void {
    this.hiss(3200, 0.05, 0.18, 0, 1.2);
    const f = LADDER[Math.min(LADDER.length - 1, Math.max(0, streak - 1))];
    this.tone(f, f, 0.22, 0.12, 'triangle', 0.02);
    if (streak >= 5 && streak % 5 === 0) this.tone(f * 1.5, f * 1.5, 0.3, 0.08, 'sine', 0.1);
  }

  draw(): void {
    this.hiss(1800, 0.12, 0.2, 0, 0.8);
    this.tone(320, 240, 0.06, 0.06, 'triangle');
  }

  nope(): void {
    this.tone(140, 90, 0.12, 0.22, 'triangle');
  }

  blast(): void {
    this.hiss(400, 0.5, 0.5, 0, 0.5, 'lowpass');
    this.tone(120, 40, 0.4, 0.3, 'sine');
  }

  refund(): void {
    this.tone(988, 1319, 0.12, 0.08, 'sine');
  }

  undo(): void {
    this.tone(700, 420, 0.12, 0.1, 'triangle');
  }

  wind(): void {
    this.hiss(700, 0.8, 0.25, 0, 0.4);
    [659, 880, 1175].forEach((f, i) => this.tone(f, f, 0.3, 0.07, 'sine', 0.2 + i * 0.08));
  }

  clear(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.4, 0.11, 'triangle', i * 0.08));
  }

  charm(): void {
    [1175, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.5, 0.07, 'sine', i * 0.06));
  }

  over(won: boolean): void {
    if (won) [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, f, 0.45, 0.1, 'triangle', i * 0.1));
    else [440, 370, 311, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.4, 0.1, 'sine', i * 0.16));
  }
}
