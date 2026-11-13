// Loomsong audio: the song's synths (kick, snare, hats, crash, bass, pads,
// arpeggio, lead) scheduled a little ahead on the AudioContext clock, a
// calibration click, and the song clock. The clock maps performance.now()
// (which pointer events are stamped with) onto the audio clock, so a tap is
// timed against what is playing, not against when the frame was drawn.
// When there is no audio (sound off and the player chose to play silently, or
// the context never starts), the same clock runs on performance.now().

import type { LeadTone, SNote, Song } from './core';

const LOOKAHEAD = 0.3;
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Audio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private verbIn: GainNode | null = null;
  private delayIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** ctx seconds minus perf seconds: the max over recent samples (currentTime moves in jumps). */
  private samples: [number, number][] = [];
  private off = NaN;
  private song: Song | null = null;
  private startAt = 0;
  private idx = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** No sound: the clock runs on performance.now() alone. */
  silent = false;

  /** Create (inside a tap) or wake the context. False if there is no Web Audio. */
  ensure(): boolean {
    if (this.silent) return false;
    if (!this.ctx) {
      const W = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? W.webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return false;
      }
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      this.master = c.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(comp).connect(c.destination);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // A small room: a generated impulse, two seconds of decaying noise.
      this.verb = c.createConvolver();
      const ir = c.createBuffer(2, Math.floor(c.sampleRate * 1.8), c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const x = ir.getChannelData(ch);
        for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length) ** 3;
      }
      this.verb.buffer = ir;
      const vg = c.createGain();
      vg.gain.value = 0.35;
      this.verb.connect(vg).connect(this.master);
      this.verbIn = c.createGain();
      this.verbIn.connect(this.verb);
      // Echo for the lead and arpeggio (set per song).
      this.delayIn = c.createGain();
      const unlock = c.createBufferSource();
      unlock.buffer = c.createBuffer(1, 1, c.sampleRate);
      unlock.connect(c.destination);
      unlock.start();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    return true;
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !this.silent;
  }

  /** Output delay the browser reports (ms), as a first guess before calibration. */
  reportedLatency(): number | null {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!c) return null;
    const s = (c.outputLatency ?? 0) + (c.baseLatency ?? 0);
    return s > 0 ? Math.round(s * 1000) : null;
  }

  // ------------------------------------------------------------ clock

  /** Call every frame: tracks the audio clock against performance.now(). */
  sample(): void {
    if (this.silent || !this.ctx || this.ctx.state !== 'running') return;
    const p = performance.now() / 1000;
    const d = this.ctx.currentTime - p;
    this.samples.push([p, d]);
    while (this.samples.length && this.samples[0][0] < p - 1.5) this.samples.shift();
    let m = -Infinity;
    for (const [, x] of this.samples) m = Math.max(m, x);
    this.off = m;
  }

  /** Forget the clock fit (after a suspend/resume). */
  resetClock(): void {
    this.samples = [];
    this.off = NaN;
  }

  /** Audio-clock seconds at a performance.now() time (ms). */
  at(perfMs: number): number {
    if (this.silent || !this.ctx) return perfMs / 1000;
    if (Number.isNaN(this.off)) this.sample();
    if (Number.isNaN(this.off)) return this.ctx.currentTime;
    return perfMs / 1000 + this.off;
  }

  now(): number {
    return this.at(performance.now());
  }

  // ------------------------------------------------------------ song

  /** Play a song with its step 0 at audio time `at` (seconds). */
  play(song: Song, at: number): void {
    this.stop();
    this.song = song;
    this.startAt = at;
    this.idx = 0;
    if (this.silent || !this.ctx) return;
    const c = this.ctx;
    this.bus = c.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master!);
    // Echo: dotted 8th, darkened.
    const dl = c.createDelay(2);
    dl.delayTime.value = (song.stepMs * 3) / 1000;
    const fb = c.createGain();
    fb.gain.value = 0.28;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const dIn = c.createGain();
    dIn.connect(dl).connect(lp).connect(fb).connect(dl);
    lp.connect(this.bus);
    this.delayIn = dIn;
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.bus && this.ctx) {
      const g = this.bus;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.08);
      setTimeout(() => g.disconnect(), 200);
    }
    this.bus = null;
    this.song = null;
  }

  /** Fade the song out over `s` seconds (the outro before the results). */
  fadeOut(s: number): void {
    if (!this.bus || !this.ctx) return;
    const g = this.bus.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.0001, t + s);
  }

  pause(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
    this.resetClock();
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    this.resetClock();
  }

  /** Schedule the song's notes that start within the lookahead. */
  pump(): void {
    const s = this.song, c = this.ctx;
    if (!s || !c || !this.bus || c.state !== 'running') return;
    const horizon = c.currentTime + LOOKAHEAD;
    const stepS = s.stepMs / 1000;
    while (this.idx < s.notes.length) {
      const n = s.notes[this.idx];
      const t = this.startAt + n.step * stepS;
      if (t > horizon) break;
      this.idx++;
      if (t < c.currentTime - 0.02) continue;
      this.voice(n, Math.max(t, c.currentTime), n.len * stepS, s.lead);
    }
  }

  private voice(n: SNote, t: number, dur: number, tone: LeadTone): void {
    switch (n.inst) {
      case 'kick': return this.kick(t, n.vel);
      case 'snare': return this.snare(t, n.vel);
      case 'hat': return this.hat(t, n.vel, 0.04);
      case 'ohat': return this.hat(t, n.vel, 0.22);
      case 'crash': return this.crash(t, n.vel);
      case 'bass': return this.bass(t, dur, n.midi, n.vel);
      case 'pad': return this.pad(t, dur, n.midi, n.vel);
      case 'arp': return this.arp(t, n.midi, n.vel);
      case 'lead': return this.lead(t, dur, n.midi, n.vel, tone);
    }
  }

  private env(g: AudioParam, t: number, a: number, peak: number, hold: number, rel: number): void {
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    if (hold > a) g.setValueAtTime(peak, t + hold);
    g.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, a) + rel);
  }

  private osc(type: OscillatorType, f: number, t: number, end: number, out: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(out);
    o.start(t);
    o.stop(end);
    return o;
  }

  private noiseSrc(t: number, end: number, out: AudioNode): void {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(end);
  }

  private gain(out: AudioNode = this.bus!): GainNode {
    const g = this.ctx!.createGain();
    g.connect(out);
    return g;
  }

  private filter(type: BiquadFilterType, f: number, q: number, out: AudioNode): BiquadFilterNode {
    const b = this.ctx!.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(out);
    return b;
  }

  private kick(t: number, v: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.003, 0.95 * v, 0.02, 0.3);
    const o = this.osc('sine', 150, t, t + 0.4, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const c = this.gain();
    this.env(c.gain, t, 0.001, 0.25 * v, 0, 0.012);
    this.noiseSrc(t, t + 0.03, this.filter('highpass', 3000, 0.7, c));
  }

  private snare(t: number, v: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.002, 0.42 * v, 0, 0.17);
    const f = this.filter('bandpass', 1900, 0.8, g);
    this.noiseSrc(t, t + 0.25, f);
    const s = this.gain(this.verbIn!);
    s.gain.value = 0.25 * v;
    f.connect(s);
    const b = this.gain();
    this.env(b.gain, t, 0.002, 0.28 * v, 0, 0.09);
    const o = this.osc('triangle', 190, t, t + 0.12, b);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  }

  private hat(t: number, v: number, dec: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.001, 0.2 * v, 0, dec);
    this.noiseSrc(t, t + dec + 0.05, this.filter('highpass', 7500, 0.6, g));
  }

  private crash(t: number, v: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.002, 0.22 * v, 0, 1.5);
    const f = this.filter('highpass', 4200, 0.4, g);
    this.noiseSrc(t, t + 1.6, f);
    const s = this.gain(this.verbIn!);
    s.gain.value = 0.3;
    f.connect(s);
  }

  private bass(t: number, dur: number, m: number, v: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.006, 0.3 * v, Math.max(0.03, dur - 0.04), 0.07);
    const lp = this.filter('lowpass', 900, 3, g);
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.18);
    const end = t + dur + 0.1;
    this.osc('sawtooth', mtof(m), t, end, lp);
    this.osc('sine', mtof(m - 12), t, end, g);
  }

  private pad(t: number, dur: number, m: number, v: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.35, 0.05 * v, dur, 0.5);
    const lp = this.filter('lowpass', 1500, 0.4, g);
    const s = this.gain(this.verbIn!);
    s.gain.value = 0.6;
    g.connect(s);
    const end = t + dur + 0.6;
    this.osc('sawtooth', mtof(m), t, end, lp, -8);
    this.osc('sawtooth', mtof(m), t, end, lp, 8);
  }

  private arp(t: number, m: number, v: number): void {
    const g = this.gain();
    this.env(g.gain, t, 0.003, 0.07 * v, 0, 0.16);
    const lp = this.filter('lowpass', 3200, 0.6, g);
    this.osc('square', mtof(m), t, t + 0.2, lp);
    const d = this.gain(this.delayIn!);
    d.gain.value = 0.35;
    g.connect(d);
  }

  private lead(t: number, dur: number, m: number, v: number, tone: LeadTone): void {
    const f = mtof(m);
    const g = this.gain();
    const end = t + dur + 0.5;
    const send = this.gain(this.delayIn!);
    send.gain.value = 0.4;
    g.connect(send);
    const rv = this.gain(this.verbIn!);
    rv.gain.value = 0.3;
    g.connect(rv);
    let oscs: OscillatorNode[];
    if (tone === 'bell') {
      this.env(g.gain, t, 0.004, 0.2 * v, 0, Math.max(0.5, dur + 0.3));
      oscs = [this.osc('sine', f, t, end, g), this.osc('sine', f * 2, t, end, this.gainOf(0.25, g), 4), this.osc('triangle', f * 3, t, t + 0.25, this.gainOf(0.12, g))];
    } else {
      const peak = tone === 'triangle' ? 0.22 : tone === 'square' ? 0.1 : 0.11;
      this.env(g.gain, t, 0.012, peak * v, Math.max(0.05, dur - 0.05), 0.12);
      const lp = this.filter('lowpass', tone === 'saw' ? 3200 : 2600, 0.8, g);
      if (tone === 'saw') {
        lp.frequency.setValueAtTime(3600, t);
        lp.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
      }
      const type: OscillatorType = tone === 'saw' ? 'sawtooth' : tone;
      oscs = [this.osc(type, f, t, end, lp), ...(tone === 'saw' ? [this.osc('sawtooth', f, t, end, lp, 9)] : [])];
    }
    // Vibrato on long notes.
    if (dur > 0.35) {
      const c = this.ctx!;
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = c.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(7, t + Math.min(0.4, dur));
      lfo.connect(depth);
      for (const o of oscs) depth.connect(o.detune);
      lfo.start(t);
      lfo.stop(end);
    }
  }

  private gainOf(v: number, out: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    g.connect(out);
    return g;
  }

  /** A woodblock click for calibration (accented on the bar). */
  click(t: number, accent: boolean): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const g = c.createGain();
    g.connect(this.master);
    this.env(g.gain, t, 0.001, accent ? 0.6 : 0.45, 0, 0.06);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(accent ? 1900 : 1400, t);
    o.frequency.exponentialRampToValueAtTime(accent ? 1500 : 1100, t + 0.05);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.08);
  }

  /** A soft confirmation chime (menus, calibration done). */
  chime(): void {
    const c = this.ctx;
    if (!c || !this.master || c.state !== 'running') return;
    [0, 0.07, 0.14].forEach((d, i) => {
      const t = c.currentTime + d;
      const g = c.createGain();
      g.connect(this.master!);
      this.env(g.gain, t, 0.004, 0.12, 0, 0.4);
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(76 + [0, 4, 7][i]);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.5);
    });
  }
}
