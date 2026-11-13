// Sungrazer sounds, synthesized: a glassy tink for a grab (higher with the
// combo), a whoosh on letting go, a sizzle while grazing a corona, a zing for a
// close shave, chimes for motes and zones, and a low boom when it ends.
// Silent until the first touch, and never when the hub's sound switch is off.

import { soundOn } from '../shared/settings';

export class Sounds {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  private sizzle: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private on = soundOn();

  /** Follow the sound switch (the in-game menu flips the hub setting). */
  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.graze(false);
    if (on) this.unlock();
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    if (!this.on) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    } catch {
      this.ctx = null;
    }
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || !this.on) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(f0: number, f1: number, dur: number, vol: number, delay = 0, q = 1): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master || !this.on) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  grab(mult: number): void {
    const f = 660 * Math.pow(2, Math.min(8, mult - 1) / 12);
    this.tone(f, f * 1.01, 0.16, 0.16, 'sine');
    this.tone(f * 2, f * 2, 0.08, 0.05, 'triangle');
  }

  release(): void {
    this.hiss(500, 2200, 0.22, 0.12, 0, 0.8);
  }

  sungraze(mult: number): void {
    this.hiss(3000, 900, 0.3, 0.14, 0, 0.7);
    const f = 523 * Math.pow(2, Math.min(8, mult) / 12);
    [1, 1.25, 1.5].forEach((k, i) => this.tone(f * k, f * k, 0.18, 0.1, 'triangle', i * 0.05));
  }

  near(mult: number): void {
    const f = 880 * Math.pow(2, Math.min(8, mult) / 12);
    this.tone(f, f * 1.6, 0.12, 0.13, 'sawtooth');
    this.tone(f * 1.5, f * 2, 0.1, 0.06, 'sine', 0.05);
  }

  mote(): void {
    this.tone(1568, 1568, 0.12, 0.08, 'sine');
    this.tone(2349, 2349, 0.1, 0.04, 'sine', 0.03);
  }

  bounce(): void {
    this.tone(180, 90, 0.12, 0.2, 'triangle');
  }

  drop(): void {
    this.tone(440, 220, 0.22, 0.08, 'square');
  }

  zone(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.4, 0.09, 'sine', i * 0.09));
  }

  die(): void {
    this.hiss(800, 120, 0.9, 0.35, 0, 0.6);
    this.tone(160, 40, 0.8, 0.3, 'sine');
  }

  /** The corona's sizzle, on while grazing. */
  graze(on: boolean): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    if (on && !this.sizzle && this.on) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 3500;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, c.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.05);
      src.connect(f).connect(gain).connect(this.master);
      src.start();
      this.sizzle = { src, gain };
    } else if (!on && this.sizzle) {
      const { src, gain } = this.sizzle;
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.08);
      src.stop(c.currentTime + 0.1);
      this.sizzle = null;
    }
  }
}
