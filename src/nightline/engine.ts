// A synthesized engine note that follows speed, plus a tire screech for
// off-road. Lives alongside the shared effects/music from Afterglow's Sfx.

export class Engine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 600;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    this.osc.connect(this.filter);
    this.sub.connect(subGain).connect(this.filter);
    this.filter.connect(this.gain).connect(ctx.destination);
    this.osc.start();
    this.sub.start();
    document.addEventListener('visibilitychange', () => (document.hidden ? ctx.suspend() : ctx.resume()));
  }

  /** speedPct 0..1(+boost); running false fades the engine out. */
  set(speedPct: number, running: boolean, boost: boolean): void {
    if (!this.ctx || !this.osc || !this.sub || !this.gain || !this.filter) return;
    const t = this.ctx.currentTime;
    // Rev through four "gears" for a sense of shifting.
    const gear = Math.min(3, Math.floor(speedPct * 4));
    const inGear = speedPct * 4 - gear;
    const f = 55 + gear * 12 + inGear * 70 + (boost ? 25 : 0);
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.sub.frequency.setTargetAtTime(f / 2, t, 0.05);
    this.filter.frequency.setTargetAtTime(400 + speedPct * 1400 + (boost ? 600 : 0), t, 0.08);
    this.gain.gain.setTargetAtTime(this.muted || !running ? 0 : 0.05 + speedPct * 0.05, t, 0.1);
  }
}
