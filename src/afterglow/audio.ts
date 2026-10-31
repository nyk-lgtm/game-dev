// Afterglow procedural audio: every sound is synthesized with the Web Audio API
// (oscillators, a shared noise buffer, filters, envelopes). No assets, nothing
// persisted. Designed to stay cheap on Android Chrome: per-sound rate limits, a
// global event budget and a polyphony cap so mass enemy deaths can't stutter.

type Prio = 0 | 1 | 2;
const LOW: Prio = 0;
const MID: Prio = 1;
const HIGH: Prio = 2;
/** Max simultaneous sfx events allowed when starting a sound of each priority. */
const VOICE_CAP: readonly number[] = [16, 24, 32];
/** Global budget for non-high-priority events (token bucket). */
const EVENT_RATE = 45; // events per second
const EVENT_BURST = 14;

const SFX_LEVEL = 0.8;
const MUSIC_LEVEL = 0.5;
const MASTER_LEVEL = 0.9;

// Music timing (A minor, i–VI–III–VII; 2 bars per chord, 8-bar seamless loop).
const BPM = 84;
const STEP = 60 / BPM / 4; // 16th note
const LOOKAHEAD = 0.25; // seconds scheduled ahead on the AudioContext clock
const TICK_MS = 50;
const STEPS_PER_CHORD = 32;
const CHORDS: readonly (readonly number[])[] = [
  [57, 60, 64], // Am
  [57, 60, 65], // F
  [55, 60, 64], // C
  [55, 59, 62], // G
];
const BASS: readonly number[] = [45, 41, 48, 43];
const PULSE_OFFSETS: readonly number[] = [0, 7, 12, 7];
const PENTA: readonly number[] = [0, 2, 4, 7, 9];

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const noop = (): void => {};
const nowSec = (): number => performance.now() / 1000;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Attack-then-exponential-decay envelope. */
function env(p: AudioParam, t: number, attack: number, dur: number, peak: number): void {
  const a = Math.min(attack, dur * 0.9);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}

interface ToneOpts {
  type?: OscillatorType;
  /** End frequency (exponential glide over the note). */
  f1?: number;
  attack?: number;
  detune?: number;
  dest?: AudioNode;
}

interface Music {
  out: GainNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
  pulseFilter: BiquadFilterNode;
  pad: OscillatorNode[];
  lfos: OscillatorNode[];
  step: number;
  next: number;
  timer: ReturnType<typeof setInterval>;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private _muted = false;
  private _volume = 1;

  private readonly lastPlay = new Map<string, number>();
  private readonly voiceEnds: number[] = [];
  private tokens = EVENT_BURST;
  private tokenTime = 0;

  private gemCombo = 0;
  private gemLastCall = -1;

  private music: Music | null = null;
  private musicWanted = false;
  private target = 0;
  private level = 0;
  private applied = -1;
  private lastTick = 0;

  // ---------------------------------------------------------------- lifecycle

  unlock(): void {
    if (!this.ctx) {
      const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      let ctx: AudioContext;
      try {
        ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.ctx = ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;

      this.master = ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER_LEVEL;
      comp.connect(this.master).connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this._volume * SFX_LEVEL;
      this.sfxBus.connect(comp);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_LEVEL;
      this.musicBus.connect(comp);

      const len = Math.floor(ctx.sampleRate * 2);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Classic mobile unlock: play a silent 1-sample buffer inside the gesture.
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(ctx.destination);
      silent.start();

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.syncRunState);
      }
      if (this.musicWanted) this.startMusicNodes();
    }
    this.syncRunState();
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    const ctx = this.ctx;
    if (ctx && this.master) {
      const g = this.master.gain;
      g.cancelScheduledValues(ctx.currentTime);
      if (muted) g.setValueAtTime(0, ctx.currentTime);
      else {
        g.setValueAtTime(0, ctx.currentTime);
        g.setTargetAtTime(MASTER_LEVEL, ctx.currentTime, 0.05);
      }
    }
    this.syncRunState();
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Master volume 0..1 for effects. */
  get volume(): number {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = clamp01(Number.isFinite(v) ? v : 1);
    if (this.ctx && this.sfxBus) {
      this.sfxBus.gain.setTargetAtTime(this._volume * SFX_LEVEL, this.ctx.currentTime, 0.02);
    }
  }

  /** Suspend when hidden or muted (saves battery), resume otherwise. */
  private readonly syncRunState = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const want = !this._muted && !hidden;
    if (want && ctx.state !== 'running') ctx.resume().catch(noop);
    else if (!want && ctx.state === 'running') ctx.suspend().catch(noop);
  };

  // ---------------------------------------------------------------- plumbing

  /**
   * Gatekeeper for every sfx: returns a start time, or null if the sound must be
   * dropped (locked, muted, suspended, rate-limited, over polyphony/budget).
   */
  private begin(key: string, gap: number, prio: Prio, dur: number): number | null {
    const ctx = this.ctx;
    if (!ctx || this._muted || this._volume <= 0 || ctx.state !== 'running') return null;
    const wall = nowSec();
    const last = this.lastPlay.get(key);
    if (last !== undefined && wall - last < gap) return null;

    const now = ctx.currentTime;
    const v = this.voiceEnds;
    let n = 0;
    for (let i = 0; i < v.length; i++) if (v[i] > now) v[n++] = v[i];
    v.length = n;
    if (n >= VOICE_CAP[prio]) return null;

    if (prio !== HIGH) {
      this.tokens = Math.min(EVENT_BURST, this.tokens + (wall - this.tokenTime) * EVENT_RATE);
      this.tokenTime = wall;
      if (this.tokens < 1) return null;
      this.tokens -= 1;
    }
    this.lastPlay.set(key, wall);
    const t = now + 0.005;
    v.push(t + dur);
    return t;
  }

  private tone(t: number, f0: number, dur: number, peak: number, o: ToneOpts = {}): OscillatorNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(f0, t);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g.gain, t, o.attack ?? 0.005, dur, peak);
    osc.connect(g).connect(o.dest ?? this.sfxBus!);
    osc.onended = () => g.disconnect();
    osc.start(t);
    osc.stop(t + dur + 0.03);
    return osc;
  }

  private noise(
    t: number,
    dur: number,
    peak: number,
    type: BiquadFilterType,
    f0: number,
    f1?: number,
    q = 1,
    dest?: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    env(g.gain, t, 0.003, dur, peak);
    src.connect(f).connect(g).connect(dest ?? this.sfxBus!);
    src.onended = () => g.disconnect();
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
  }

  /** A per-event lowpass into the sfx bus; pair with disposeAfter(). */
  private lowpass(freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(this.sfxBus!);
    return f;
  }

  private disposeAfter(src: AudioScheduledSourceNode, node: AudioNode): void {
    const prev = src.onended;
    src.onended = (e) => {
      if (prev) prev.call(src, e);
      node.disconnect();
    };
  }

  /** Two slightly detuned voices for a soft chorus. */
  private pair(t: number, f: number, dur: number, peak: number, type: OscillatorType, attack = 0.01): void {
    this.tone(t, f, dur, peak, { type, attack, detune: -6 });
    this.tone(t, f, dur, peak * 0.6, { type: 'sine', attack, detune: 7 });
  }

  private sparkles(t: number, count: number, spacing: number, peak: number): void {
    const notes = [84, 86, 88, 91, 93, 96, 98];
    for (let i = 0; i < count; i++) {
      this.tone(t + i * spacing + rand(0, 0.01), mtof(pick(notes)), 0.18, peak, { attack: 0.003 });
    }
  }

  // ---------------------------------------------------------------- effects

  hit(): void {
    const t = this.begin('hit', 0.04, LOW, 0.05);
    if (t === null) return;
    const f = 1300 * rand(0.9, 1.1);
    this.tone(t, f, 0.045, 0.06, { type: 'triangle', f1: f * 0.55, attack: 0.002 });
  }

  kill(big = false): void {
    if (big) {
      const t = this.begin('killBig', 0.08, HIGH, 0.55);
      if (t === null) return;
      this.tone(t, 230, 0.5, 0.28, { f1: 45, attack: 0.004 });
      this.tone(t, 460, 0.32, 0.08, { type: 'triangle', f1: 90, detune: 8 });
      this.noise(t, 0.4, 0.16, 'lowpass', 1600, 160, 0.8);
      return;
    }
    const t = this.begin('kill', 0.03, MID, 0.13);
    if (t === null) return;
    const f = 720 * rand(0.88, 1.12);
    this.tone(t, f, 0.12, 0.1, { type: 'triangle', f1: f * 0.3, attack: 0.002 });
    this.noise(t, 0.05, 0.035, 'bandpass', 3200, undefined, 1.2);
  }

  gem(): void {
    const wall = nowSec();
    if (wall - this.gemLastCall > 0.4) this.gemCombo = 0;
    this.gemLastCall = wall;
    const t = this.begin('gem', 0.05, LOW, 0.09);
    if (t === null) return;
    const c = Math.min(this.gemCombo, 9);
    this.gemCombo++;
    const f = mtof(78 + 12 * Math.floor(c / 5) + PENTA[c % 5]); // F#5 upward, pentatonic
    this.tone(t, f, 0.08, 0.07, { attack: 0.002 });
    this.tone(t, f * 2, 0.05, 0.025, { type: 'triangle', attack: 0.002 });
  }

  hurt(): void {
    const t = this.begin('hurt', 0.15, HIGH, 0.32);
    if (t === null) return;
    this.tone(t, 150, 0.25, 0.32, { f1: 50, attack: 0.003 });
    const lp = this.lowpass(420, 1.5);
    const o = this.tone(t, 72, 0.3, 0.14, { type: 'sawtooth', f1: 58, attack: 0.01, dest: lp });
    this.disposeAfter(o, lp);
  }

  levelUp(): void {
    const t = this.begin('levelUp', 0.3, HIGH, 0.9);
    if (t === null) return;
    const notes = [72, 76, 79, 84, 88];
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      this.pair(t + i * 0.06, mtof(m), last ? 0.55 : 0.26, 0.08, 'triangle', 0.005);
    });
  }

  chest(): void {
    const t = this.begin('chest', 0.3, HIGH, 1.0);
    if (t === null) return;
    for (const m of [60, 64, 67, 72]) this.tone(t, mtof(m), 0.7, 0.045, { type: 'triangle', attack: 0.04 });
    this.sparkles(t + 0.05, 8, 0.045, 0.05);
    this.tone(t + 0.42, mtof(96), 0.5, 0.05, { attack: 0.003 });
  }

  evolve(): void {
    const t = this.begin('evolve', 0.5, HIGH, 2.2);
    if (t === null) return;
    // rising filtered sweep
    const lp = this.lowpass(300, 2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(5000, t + 0.5);
    const sweep = this.tone(t, 110, 0.6, 0.07, { type: 'sawtooth', f1: 440, attack: 0.45, dest: lp });
    this.disposeAfter(sweep, lp);
    // impact + triumphant chord
    const h = t + 0.5;
    this.tone(h, 130, 0.6, 0.26, { f1: 45, attack: 0.004 });
    for (const m of [60, 64, 67, 72, 76]) this.pair(h, mtof(m), 1.6, 0.05, 'triangle', 0.02);
    this.sparkles(h, 12, 0.05, 0.045);
    for (const m of [84, 88, 91]) this.tone(h + 0.6, mtof(m), 1.0, 0.03, { attack: 0.01 });
  }

  nova(): void {
    const t = this.begin('nova', 0.12, MID, 0.38);
    if (t === null) return;
    this.tone(t, 190, 0.35, 0.26, { f1: 48, attack: 0.012 });
    this.noise(t, 0.35, 0.12, 'lowpass', 2200, 150, 0.9);
  }

  zap(): void {
    const t = this.begin('zap', 0.07, LOW, 0.09);
    if (t === null) return;
    this.noise(t, 0.08, 0.07, 'bandpass', rand(2800, 4200), 1500, 2.5);
    const lp = this.lowpass(3500);
    const o = this.tone(t, 1400, 0.07, 0.03, { type: 'square', attack: 0.001, dest: lp });
    for (let i = 1; i <= 4; i++) o.frequency.setValueAtTime(rand(300, 1800), t + i * 0.014);
    this.disposeAfter(o, lp);
  }

  beam(): void {
    const t = this.begin('beam', 0.08, LOW, 0.16);
    if (t === null) return;
    const lp = this.lowpass(3200);
    const o = this.tone(t, 2200, 0.14, 0.05, { type: 'square', f1: 420, attack: 0.002, dest: lp });
    this.disposeAfter(o, lp);
    this.tone(t, 1100, 0.14, 0.05, { f1: 260, attack: 0.002, detune: 9 });
  }

  boom(): void {
    const t = this.begin('boom', 0.1, MID, 0.62);
    if (t === null) return;
    this.noise(t, 0.6, 0.3, 'lowpass', 3000, 100, 0.8);
    this.tone(t, 120, 0.5, 0.34, { f1: 35, attack: 0.004 });
  }

  warn(): void {
    const t = this.begin('warn', 0.6, HIGH, 0.8);
    if (t === null) return;
    const lp = this.lowpass(1600);
    let last: OscillatorNode | null = null;
    for (let i = 0; i < 4; i++) {
      const f = i % 2 ? 620 : 880;
      const s = t + i * 0.18;
      this.tone(s, f, 0.16, 0.1, { type: 'triangle', attack: 0.01 });
      last = this.tone(s, f, 0.16, 0.03, { type: 'square', attack: 0.01, detune: 5, dest: lp });
    }
    if (last) this.disposeAfter(last, lp);
  }

  pickup(): void {
    const t = this.begin('pickup', 0.08, MID, 0.14);
    if (t === null) return;
    this.tone(t, 520, 0.12, 0.09, { f1: 1040, attack: 0.004 });
    this.tone(t + 0.03, 780, 0.1, 0.04, { type: 'triangle', f1: 1560, attack: 0.004 });
  }

  click(): void {
    const t = this.begin('click', 0.04, MID, 0.04);
    if (t === null) return;
    this.tone(t, 1500, 0.03, 0.06, { type: 'triangle', f1: 1100, attack: 0.001 });
  }

  victory(): void {
    const t = this.begin('victory', 1, HIGH, 2.6);
    if (t === null) return;
    [67, 72, 76, 79].forEach((m, i) => this.pair(t + i * 0.14, mtof(m), 0.3, 0.08, 'triangle', 0.006));
    const h = t + 0.6;
    for (const m of [60, 64, 67, 72, 79]) this.pair(h, mtof(m), 1.8, 0.045, 'triangle', 0.05);
    this.tone(h, mtof(48), 1.6, 0.12, { attack: 0.03 });
    this.sparkles(h + 0.05, 10, 0.07, 0.04);
  }

  defeat(): void {
    const t = this.begin('defeat', 1, HIGH, 2.7);
    if (t === null) return;
    [69, 65, 62, 57].forEach((m, i) => this.pair(t + i * 0.32, mtof(m), 0.6, 0.08, 'triangle', 0.02));
    const d = t + 1.0;
    this.tone(d, 110, 1.5, 0.14, { f1: 55, attack: 0.05 });
    const lp = this.lowpass(300);
    const o = this.tone(d, 55, 1.6, 0.05, { type: 'sawtooth', attack: 0.2, dest: lp });
    this.disposeAfter(o, lp);
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    this.musicWanted = true;
    if (this.ctx && !this.music) this.startMusicNodes();
  }

  stopMusic(): void {
    this.musicWanted = false;
    const m = this.music;
    const ctx = this.ctx;
    this.music = null;
    if (!m || !ctx) return;
    clearInterval(m.timer);
    const now = ctx.currentTime;
    m.out.gain.cancelScheduledValues(now);
    m.out.gain.setValueAtTime(m.out.gain.value, now);
    m.out.gain.setTargetAtTime(0, now, 0.25);
    for (const o of [...m.pad, ...m.lfos]) o.stop(now + 1.6);
    m.pad[0].onended = () => m.out.disconnect();
  }

  setIntensity(level: number): void {
    this.target = clamp01(Number.isFinite(level) ? level : 0);
  }

  private startMusicNodes(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.setTargetAtTime(1, now, 0.8);
    out.connect(this.musicBus!);

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.Q.value = 0.8;
    padFilter.frequency.value = this.padCutoff(this.level);
    const padGain = ctx.createGain();
    padGain.gain.value = this.padLevel(this.level);
    padFilter.connect(padGain).connect(out);

    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = 'lowpass';
    pulseFilter.Q.value = 1.2;
    pulseFilter.frequency.value = this.pulseCutoff(this.level);
    pulseFilter.connect(out);

    // Slow LFOs: cutoff drift and a gentle detune shimmer — the "evolving" part.
    const cutLfo = ctx.createOscillator();
    cutLfo.frequency.value = 0.06;
    const cutDepth = ctx.createGain();
    cutDepth.gain.value = 160;
    cutLfo.connect(cutDepth).connect(padFilter.frequency);
    const detLfo = ctx.createOscillator();
    detLfo.frequency.value = 0.11;
    const detDepth = ctx.createGain();
    detDepth.gain.value = 6;
    detLfo.connect(detDepth);

    const pad: OscillatorNode[] = [];
    const chord = CHORDS[0];
    for (let v = 0; v < chord.length; v++) {
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(chord[v]);
        o.detune.value = k === 0 ? -8 : 8;
        if (k === 1) detDepth.connect(o.detune);
        o.connect(padFilter);
        o.start(now);
        pad.push(o);
      }
    }
    cutLfo.start(now);
    detLfo.start(now);

    this.applied = this.level;
    this.lastTick = nowSec();
    this.music = {
      out,
      padGain,
      padFilter,
      pulseFilter,
      pad,
      lfos: [cutLfo, detLfo],
      step: 0,
      next: now + 0.1,
      timer: setInterval(this.tick, TICK_MS),
    };
  }

  private padCutoff(l: number): number {
    return 380 + 2400 * l;
  }
  private pulseCutoff(l: number): number {
    return 500 + 2600 * l;
  }
  private padLevel(l: number): number {
    return 0.09 + 0.04 * l;
  }

  private readonly tick = (): void => {
    const ctx = this.ctx;
    const m = this.music;
    if (!ctx || !m || ctx.state !== 'running') return;

    // Smooth intensity in JS (frame-rate independent), push to params only on change.
    const wall = nowSec();
    const dt = Math.min(0.5, wall - this.lastTick);
    this.lastTick = wall;
    this.level += (this.target - this.level) * (1 - Math.exp(-dt / 0.8));
    const now = ctx.currentTime;
    if (Math.abs(this.level - this.applied) > 0.004) {
      const l = this.level;
      m.padFilter.frequency.setTargetAtTime(this.padCutoff(l), now, 0.2);
      m.pulseFilter.frequency.setTargetAtTime(this.pulseCutoff(l), now, 0.2);
      m.padGain.gain.setTargetAtTime(this.padLevel(l), now, 0.3);
      this.applied = l;
    }

    if (m.next < now) m.next = now + 0.03; // fell behind (stall): skip, don't burst
    while (m.next < now + LOOKAHEAD) {
      this.scheduleStep(m, m.step, m.next);
      m.step++;
      m.next += STEP;
    }
  };

  private scheduleStep(m: Music, step: number, t: number): void {
    const ci = Math.floor(step / STEPS_PER_CHORD) % CHORDS.length;
    const chord = CHORDS[ci];
    const s = step % 16;
    const l = this.level;

    if (step % STEPS_PER_CHORD === 0) {
      for (let i = 0; i < m.pad.length; i++) {
        m.pad[i].frequency.setTargetAtTime(mtof(chord[i >> 1]), t, 0.12);
      }
    }

    // Pulse: quarters at rest, eighths mid, sixteenths when it's hot.
    const every = l < 0.25 ? 4 : l < 0.55 ? 2 : 1;
    if (s % every === 0) {
      const accent = s % 4 === 0 ? 1 : 0.65;
      const f = mtof(BASS[ci] + 12 + PULSE_OFFSETS[s % 4]);
      this.tone(t, f, 0.14, (0.025 + 0.07 * l) * accent, {
        type: 'square',
        attack: 0.004,
        dest: m.pulseFilter,
      });
    }
    // Soft offbeat hats and a heartbeat kick at high intensity.
    if (l > 0.6 && s % 4 === 2) {
      this.noise(t, 0.035, (l - 0.6) * 0.12, 'highpass', 6500, undefined, 0.7, m.out);
    }
    if (l > 0.75 && s % 8 === 0) {
      this.tone(t, 110, 0.22, (l - 0.75) * 0.8, { f1: 42, attack: 0.003, dest: m.out });
    }
    // A distant "star" note every two bars.
    if (step % STEPS_PER_CHORD === 16) {
      const f = mtof(pick(chord) + 24);
      const peak = 0.022 + 0.02 * l;
      this.tone(t, f, 2.4, peak, { attack: 0.3, dest: m.out });
      this.tone(t, f, 2.4, peak * 0.6, { attack: 0.3, detune: 9, dest: m.out });
    }
  }
}
