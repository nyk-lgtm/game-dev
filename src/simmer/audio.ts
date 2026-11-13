// Simmer sounds, synthesized: a shop bell when you open, coins on a sale, a
// little chime for a delighted guest, a low note for one who walks off.
// Silent until the first touch, and never when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

export class Sounds {
  private ctx: AudioContext | null = null;
  private lastCoin = 0;

  unlock(): void {
    if (this.ctx || !soundOn()) return;
    try {
      this.ctx = new AudioContext();
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

  bell(): void {
    this.tone(1320, 1300, 0.6, 0.12, 'sine');
    this.tone(1760, 1740, 0.5, 0.06, 'sine', 0.02);
  }

  coin(): void {
    const c = this.ctx;
    if (!c || c.currentTime - this.lastCoin < 0.07) return;
    this.lastCoin = c.currentTime;
    this.tone(2100, 2000, 0.08, 0.06, 'square');
    this.tone(2800, 2700, 0.12, 0.05, 'square', 0.05);
  }

  heart(): void {
    this.tone(880, 900, 0.18, 0.07, 'triangle');
    this.tone(1320, 1340, 0.24, 0.06, 'triangle', 0.09);
  }

  sad(): void {
    this.tone(330, 250, 0.28, 0.07, 'triangle');
  }

  tap(): void {
    this.tone(660, 640, 0.05, 0.05, 'triangle');
  }

  fanfare(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.3, 0.08, 'triangle', i * 0.12));
  }
}
