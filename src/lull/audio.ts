// Lull's synths: six small voices (bell, pluck, reed, glass, wood, bass), a
// generated reverb that opens up at night and in mist, and soft rain and wind
// beds. Notes are scheduled ahead on the AudioContext clock by the page. Silent
// until the first touch, and never created while the hub's sound switch is off.

import type { Voice } from './core';

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

const GAIN: Record<Voice, number> = { bell: 0.16, pluck: 0.16, reed: 0.11, glass: 0.1, wood: 0.2, bass: 0.22 };

export class GardenAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rain: GainNode | null = null;
  private wind: GainNode | null = null;
  private windF: BiquadFilterNode | null = null;
  on: boolean;

  constructor(on: boolean) {
    this.on = on;
  }

  /** Create (inside a tap) or wake the context. */
  ensure(): boolean {
    if (!this.on) return false;
    if (!this.ctx) {
      const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? W.webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor({ latencyHint: 'playback' });
      } catch {
        return false;
      }
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return true;
  }

  private build(c: AudioContext): void {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(c.destination);
    this.dry = c.createGain();
    this.dry.connect(this.master);
    // Reverb: two and a half seconds of decaying stereo noise.
    const verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 2.6);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    verb.buffer = ir;
    this.wet = c.createGain();
    this.wet.gain.value = 0.4;
    this.wet.connect(verb).connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // Rain and wind beds (silent until the weather turns).
    const bed = (type: BiquadFilterType, f: number, q: number) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const fl = c.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      s.connect(fl).connect(g).connect(this.master!);
      s.start();
      return { g, fl };
    };
    this.rain = bed('highpass', 2500, 0.5).g;
    const w = bed('lowpass', 400, 1.5);
    this.wind = w.g;
    this.windF = w.fl;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && this.on;
  }

  time(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (on) this.ensure();
    else if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.on && this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  /** Weather beds and how much room the notes ring in. */
  ambience(rain: number, wind: number, wet: number): void {
    const c = this.ctx;
    if (!c || !this.rain || !this.wind || !this.wet || !this.windF) return;
    const t = c.currentTime;
    this.rain.gain.setTargetAtTime(rain * 0.035, t, 0.8);
    this.wind.gain.setTargetAtTime(wind * 0.05, t, 0.8);
    this.windF.frequency.setTargetAtTime(300 + 250 * Math.sin(t * 0.4) * wind, t, 0.5);
    this.wet.gain.setTargetAtTime(wet, t, 1);
  }

  private env(g: GainNode, at: number, peak: number, attack: number, hold: number, release: number): number {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    if (hold > 0) g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    return at + attack + hold + release + 0.05;
  }

  private osc(type: OscillatorType, f: number, at: number, end: number, out: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (detune) o.detune.value = detune;
    o.connect(out);
    o.start(at);
    o.stop(end);
    return o;
  }

  /** One note at audio time `at` (seconds); `len` in seconds. */
  note(midi: number, voice: Voice, vel: number, len: number, at: number): void {
    const c = this.ctx;
    if (!c || !this.on || !this.dry || !this.wet) return;
    at = Math.max(at, c.currentTime + 0.005);
    const f = mtof(midi);
    const g = c.createGain();
    g.connect(this.dry);
    const send = c.createGain();
    send.gain.value = voice === 'wood' ? 0.4 : voice === 'bass' ? 0.5 : 1;
    g.connect(send).connect(this.wet);
    const peak = GAIN[voice] * vel;
    switch (voice) {
      case 'bell': {
        const end = this.env(g, at, peak, 0.004, 0, 1.6);
        this.osc('sine', f, at, end, g);
        const g2 = c.createGain();
        g2.gain.value = 0.28;
        g2.connect(g);
        this.osc('sine', f * 2.76, at, end, g2);
        const g3 = c.createGain();
        g3.connect(g);
        this.env(g3, at, 0.12, 0.002, 0, 0.25);
        this.osc('sine', f * 5.4, at, at + 0.3, g3);
        break;
      }
      case 'pluck': {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 2;
        lp.frequency.setValueAtTime(Math.min(9000, f * 8), at);
        lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.2), at + 0.3);
        lp.connect(g);
        const end = this.env(g, at, peak, 0.003, 0, 0.75);
        this.osc('triangle', f, at, end, lp);
        this.osc('sawtooth', f, at, end, lp, 6);
        break;
      }
      case 'reed': {
        const end = this.env(g, at, peak, 0.14, Math.max(0, len - 0.2), 0.5);
        const o = this.osc('sine', f, at, end, g);
        const h = c.createGain();
        h.gain.value = 0.18;
        h.connect(g);
        this.osc('triangle', f * 2, at, end, h);
        const lfo = c.createOscillator();
        lfo.frequency.value = 4.8;
        const lg = c.createGain();
        lg.gain.value = f * 0.004;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(at);
        lfo.stop(end);
        if (this.noise) {
          const n = c.createBufferSource();
          n.buffer = this.noise;
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f * 3;
          bp.Q.value = 3;
          const ng = c.createGain();
          n.connect(bp).connect(ng).connect(g);
          this.env(ng, at, 0.35, 0.05, 0, 0.3);
          n.start(at, Math.random());
          n.stop(at + 0.45);
        }
        break;
      }
      case 'glass': {
        const end = this.env(g, at, peak, 0.015, 0, 2.4);
        this.osc('sine', f, at, end, g);
        this.osc('sine', f, at, end, g, 7);
        const g2 = c.createGain();
        g2.gain.value = 0.12;
        g2.connect(g);
        this.osc('sine', f * 3, at, end, g2);
        break;
      }
      case 'wood': {
        const end = this.env(g, at, peak, 0.002, 0, 0.32);
        const o = this.osc('sine', f, at, end, g);
        o.frequency.setValueAtTime(f * 1.5, at);
        o.frequency.exponentialRampToValueAtTime(f, at + 0.018);
        const g2 = c.createGain();
        g2.connect(g);
        this.env(g2, at, 0.35, 0.001, 0, 0.06);
        this.osc('sine', f * 4, at, at + 0.1, g2);
        break;
      }
      case 'bass': {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        lp.connect(g);
        const end = this.env(g, at, peak, 0.05, Math.max(0, len * 0.4), 2);
        this.osc('triangle', f, at, end, lp);
        this.osc('sine', f / 2, at, end, lp);
        break;
      }
    }
  }

  /** A little rising chime (a wish granted). */
  chime(root: number): void {
    const c = this.ctx;
    if (!c || !this.on) return;
    const t = c.currentTime + 0.02;
    [0, 4, 7, 12, 16].forEach((d, i) => this.note(root + 24 + d, 'bell', 0.7, 0.5, t + i * 0.09));
  }

  /** A soft thump of earth (digging up). */
  dig(): void {
    const c = this.ctx;
    if (!c || !this.on || !this.noise || !this.dry) return;
    const t = c.currentTime + 0.005;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(150, t + 0.25);
    const g = c.createGain();
    n.connect(lp).connect(g).connect(this.dry);
    this.env(g, t, 0.3, 0.005, 0, 0.3);
    n.start(t);
    n.stop(t + 0.4);
  }

  /** Water pouring: a short soft hiss. */
  pour(): void {
    const c = this.ctx;
    if (!c || !this.on || !this.noise || !this.dry) return;
    const t = c.currentTime + 0.005;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.7;
    const g = c.createGain();
    n.connect(bp).connect(g).connect(this.dry);
    this.env(g, t, 0.05, 0.04, 0.1, 0.2);
    n.start(t, Math.random());
    n.stop(t + 0.45);
  }
}
