// Ninefold sounds, synthesized: the putt's tock, rail knocks, bumper boings,
// a splash and the rattle of the cup. Silent until the first touch, and never
// when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

export class Sounds {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    if (this.ctx || !soundOn()) return;
    try {
      this.ctx = new AudioContext();
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
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
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(freq: number, dur: number, vol: number, delay = 0, q = 1): void {
    const c = this.ctx;
    if (!c || !this.noise) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  putt(power: number): void {
    this.tone(900 + power * 300, 500, 0.06, 0.25 + power * 0.2, 'triangle');
    this.hiss(2500, 0.03, 0.15);
  }

  knock(v: number): void {
    const k = Math.min(1, v / 120);
    this.tone(260, 140, 0.08, 0.08 + k * 0.25, 'triangle');
    this.hiss(1200, 0.04, 0.05 + k * 0.1);
  }

  boing(): void {
    this.tone(320, 760, 0.18, 0.22, 'sine');
    this.tone(160, 380, 0.18, 0.1, 'square');
  }

  splash(): void {
    this.hiss(900, 0.45, 0.35, 0, 0.6);
    this.hiss(2400, 0.25, 0.15, 0.05);
  }

  cup(good: boolean): void {
    // A rattle, then a little chime (brighter for a birdie or better).
    for (let i = 0; i < 3; i++) this.tone(700 - i * 90, 400, 0.05, 0.18, 'triangle', i * 0.06);
    const notes = good ? [784, 988, 1175, 1568] : [659, 784];
    notes.forEach((f, i) => this.tone(f, f, 0.35, 0.12, 'sine', 0.25 + i * 0.09));
  }
}
