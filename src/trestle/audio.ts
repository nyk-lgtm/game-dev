// Trestle sounds, synthesized: a wooden tock when a member goes in (lower for
// planks), a pop when one comes out, creaks and cracks during a run, a splash,
// and a little tune when the cart makes it. Silent until the first touch, and
// never when the hub's sound switch is off.

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

  place(mat: number): void {
    const f = [330, 520, 760][mat];
    this.tone(f, f * 0.7, 0.07, 0.22, 'triangle');
    this.hiss(2200, 0.03, 0.08);
  }

  remove(): void {
    this.tone(500, 240, 0.08, 0.15, 'sine');
  }

  go(): void {
    this.tone(392, 392, 0.09, 0.12, 'triangle');
    this.tone(523, 523, 0.14, 0.12, 'triangle', 0.09);
  }

  creak(level: number): void {
    this.tone(120 + level * 60, 90, 0.18, 0.05 + level * 0.06, 'sawtooth');
  }

  snap(): void {
    this.hiss(3200, 0.08, 0.4, 0, 0.8);
    this.tone(260, 80, 0.12, 0.25, 'square');
  }

  splash(): void {
    this.hiss(900, 0.45, 0.3, 0, 0.6);
    this.hiss(2400, 0.25, 0.12, 0.05);
  }

  win(stars: number): void {
    const notes = [523, 659, 784, 1047].slice(0, 2 + stars);
    notes.forEach((f, i) => this.tone(f, f, 0.4, 0.13, 'sine', i * 0.11));
  }

  fail(): void {
    this.tone(330, 220, 0.3, 0.12, 'triangle');
    this.tone(247, 165, 0.4, 0.1, 'triangle', 0.18);
  }
}
