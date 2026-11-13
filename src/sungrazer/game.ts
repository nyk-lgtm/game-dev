// Sungrazer controller: hold-anywhere input recorded as tick-stamped toggles,
// the fixed-step loop, effects (sparks, floaters, shake, sound, haptics), the
// end card with modes and unlocks, replays, the daily sky and the menu.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { loadSettings, reducedFx, saveSettings, soundOn } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  LOCK, MODES, MODE_IDS, REGRAB, RULES_VERSION, TPS, ZONES, altitude, cloneRun, encodeInputs, finalScore, isLit, lowerY, newRun, step, target,
  type Cause, type Ev, type Mode, type Run, type Star,
} from './core';
import { Sounds } from './audio';
import { BANNER_S, draw, fitView, type Floater, type Particle, type Scene, type View } from './render/draw';

export const store = makeStore('sungrazer.');
const $ = (id: string) => document.getElementById(id)!;

export interface Profile {
  runs: number;
  best: number;
  bestAlt: number;
  /** Seconds flown, all runs. */
  time: number;
  /** Coach tips already shown. */
  tips: string[];
  /** The best run, for "Watch your best". */
  bestRun: { v: number; seed: number; mode: Mode; a: string; score: number } | null;
  mode: Mode;
}
export const loadProfile = (): Profile => ({ runs: 0, best: 0, bestAlt: 0, time: 0, tips: [], bestRun: null, mode: 'n', ...store.load<Partial<Profile>>('profile', {}) });
const saveProfile = (p: Profile) => store.save('profile', p);
const unlocked = (p: Profile, m: Mode) => p.best >= MODES[m].unlock;

const ZONE_SUB = [
  'Hold to grab a star, let go to fly',
  'Cinders burn on touch: shave past them',
  'Pulsars can only be grabbed while lit',
  'Giants: wide coronas, rich grazing',
  'Fewer stars. Make every fling count',
  'Everything, faster',
];
const CAUSE: Record<Cause, [string, string]> = {
  burn: ['Burned up', 'The tether reeled you into the star. Let go sooner.'],
  star: ['Flew into a star', 'Watch the dotted line: it turns red with an ✕ when you’re heading into something.'],
  cinder: ['Hit a cinder', 'Cinders burn on touch. Close shaves pay, contact doesn’t.'],
  void: ['Lost to the void', 'The void keeps rising. Keep grabbing higher stars.'],
};

type State = 'ready' | 'play' | 'dead' | 'watch' | 'paused';

/** The nearest star that will come into reach soon (for the faint ring before it can be grabbed). */
function soonStar(r: Run): Star | null {
  const stars = r.world.stars;
  let best: Star | null = null, bd = LOCK + 18;
  for (let i = lowerY(stars, r.y - bd); i < stars.length && stars[i].y <= r.y + bd; i++) {
    const s = stars[i];
    const d = Math.hypot(s.x - r.x, s.y - r.y);
    if (d < bd && (s.id !== r.last || r.since >= REGRAB) && isLit(s, r.tick)) {
      bd = d;
      best = s;
    }
  }
  return best;
}

const fmtTime = (ticks: number) => {
  const s = Math.floor(ticks / TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Game {
  run: Run = newRun(1);
  inputs: number[] = [];
  state: State = 'ready';
  daily: string | null = null;
  mode: Mode = 'n';
  private canvas = $('board') as HTMLCanvasElement;
  private g = this.canvas.getContext('2d')!;
  private view: View = fitView(1, 1);
  private sfx = new Sounds();
  private pointers = new Set<number>();
  private held = false;
  private acc = 0;
  private last = 0;
  private time = 0;
  private trail: number[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private shake = 0;
  private flash = 0;
  private grabT = 9;
  private banner: Scene['banner'] = null;
  private wasGrazing = false;
  private deadAt = 0;
  /** Watching a recording: its inputs and where to stop. */
  private watching: { inputs: number[]; until: number; label: string } | null = null;
  private resumeTo: State = 'play';
  private fx = !reducedFx();

  constructor() {
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    const stage = $('stage');
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointerup', (e) => this.up(e));
    stage.addEventListener('pointercancel', (e) => this.up(e));
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'play' || this.state === 'watch')) this.pause();
    });
    $('menuBtn').onclick = () => this.showMenu();
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ runs

  /** A fresh run, waiting for the first press. */
  start(seed: number, mode: Mode = this.mode, daily: string | null = null): void {
    closeOverlay();
    this.daily = daily;
    this.mode = mode;
    this.run = newRun(seed, mode);
    this.inputs = [];
    this.watching = null;
    this.state = 'ready';
    this.resetFx();
    this.hud();
  }

  newRun(mode: Mode = this.mode): void {
    if (this.daily) this.playDaily();
    else this.start(randomSeed(), mode);
  }

  playDaily(): void {
    this.start(dailySeed('sungrazer', todayKey()), 'n', todayKey());
  }

  leaveDaily(mode: Mode): void {
    leaveDaily();
    this.daily = null;
    this.start(randomSeed(), mode);
  }

  /** Play back a recording (a best run, a bug report, the last run). */
  watch(seed: number, mode: Mode, inputs: number[], until = Infinity, label = 'Replay'): void {
    closeOverlay();
    this.run = newRun(seed, mode);
    this.inputs = inputs.slice();
    this.watching = { inputs: inputs.slice(), until, label };
    this.state = 'watch';
    this.resetFx();
    this.hud();
  }

  private watchHeld(): boolean {
    const w = this.watching!;
    let k = 0;
    while (k < w.inputs.length && w.inputs[k] <= this.run.tick) k++;
    return k % 2 === 1;
  }

  /** Fast-forward a replay to tick t (for checking a bug report, and for screenshots). */
  seek(t: number): void {
    if (!this.watching) return;
    this.trail = [];
    while (this.run.alive && this.run.tick < t) {
      const evs: Ev[] = [];
      step(this.run, this.watchHeld(), evs);
      for (const e of evs) if (t - this.run.tick < 90 || e.k === 'die') this.effect(e);
      if (t - this.run.tick < 50 && this.run.tick % 4 === 0) {
        this.trail.push(this.run.x, this.run.y);
        if (this.trail.length > 44) this.trail.splice(0, 2);
      }
    }
    this.acc = 0;
    this.hud();
  }

  private resetFx(): void {
    this.trail = [];
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.flash = 0;
    this.banner = null;
    this.grabT = 9;
    this.acc = 0;
    this.held = false;
    this.pointers.clear();
    this.sfx.graze(false);
    this.wasGrazing = false;
  }

  // ------------------------------------------------------------ input

  private down(e: PointerEvent): void {
    this.sfx.unlock();
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    this.pointers.add(e.pointerId);
    if (this.state === 'ready') {
      this.state = 'play';
      const p = loadProfile();
      if (!p.runs) this.banner = { title: ZONES[0].name, sub: ZONE_SUB[0], t: 0 };
    }
    if (this.state === 'play') this.setHeld(true);
  }

  private up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.state === 'play' && this.pointers.size === 0) this.setHeld(false);
  }

  private setHeld(h: boolean): void {
    if (h === this.held) return;
    this.held = h;
    const t = this.run.tick;
    // Two changes on the same tick cancel out.
    if (this.inputs.length && this.inputs[this.inputs.length - 1] === t) this.inputs.pop();
    else this.inputs.push(t);
  }

  private pause(): void {
    this.resumeTo = this.state;
    this.state = 'paused';
    this.pointers.clear();
    this.setHeld(false);
    this.sfx.graze(false);
    this.wasGrazing = false;
  }

  private resume(): void {
    closeOverlay();
    if (this.state === 'paused') this.state = this.resumeTo;
    this.last = 0;
  }

  // ------------------------------------------------------------ loop

  private resize(): void {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.view = fitView(w, h);
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    if (this.state === 'play' || this.state === 'watch') {
      this.acc += dt * TPS;
      let n = 0;
      const evs: Ev[] = [];
      while (this.acc >= 1 && n < 60 && this.run.alive) {
        this.acc -= 1;
        n++;
        if (this.watching && this.run.tick >= this.watching.until) break;
        step(this.run, this.watching ? this.watchHeld() : this.held, evs);
      }
      for (const e of evs) this.effect(e);
      if (this.run.alive) {
        this.trail.push(this.run.x, this.run.y);
        if (this.trail.length > 44) this.trail.splice(0, 2);
        if (this.run.grazing && Math.random() < 0.7) this.spark(this.run.x, this.run.y, '#ffb35c', 1);
      }
      if (this.run.grazing !== this.wasGrazing) {
        this.wasGrazing = this.run.grazing;
        this.sfx.graze(this.run.grazing);
      }
      if (n) this.hud();
      if (this.watching && this.run.alive && this.run.tick >= this.watching.until) this.endWatch();
    }
    if (this.state === 'dead' && this.deadAt && performance.now() - this.deadAt > 900) {
      this.deadAt = 0;
      this.endCard();
    }
    this.tickFx(dt);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private tickFx(dt: number): void {
    this.grabT += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.15);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > BANNER_S) this.banner = null;
    }
    if (!this.run.alive && this.trail.length) this.trail.splice(0, 2);
  }

  private render(): void {
    const v = this.view;
    const dpr = this.canvas.width / Math.max(1, v.w);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = this.run;
    const playing = this.state === 'play' || this.state === 'ready' || this.state === 'watch' || this.state === 'paused';
    const tgt = r.alive && !r.tether ? target(r) : null;
    // While swinging: where letting go now would fly (~0.45 s). In free flight: only a collision course.
    let preview: number[] | null = null;
    let hit: { x: number; y: number } | null = null;
    if (r.alive && playing && this.state !== 'ready') {
      const c = cloneRun(r);
      const path = [c.x, c.y];
      const n = r.tether ? 110 : 90;
      for (let i = 1; i <= n && c.alive; i++) {
        step(c, false);
        if (!c.alive && c.cause !== 'void') hit = { x: c.x, y: c.y };
        else if (i % 10 === 0) path.push(c.x, c.y);
      }
      if (r.tether || hit) preview = path;
      if (hit) path.push(hit.x, hit.y);
    }
    draw(this.g, v, {
      run: r, time: this.time, trail: this.trail, particles: this.particles, floaters: this.floaters,
      target: tgt ?? (this.state === 'ready' ? soonStar(r) : null), soon: !tgt && r.alive && !r.tether ? soonStar(r) : null, preview, hit, reaching: this.state === 'play' && this.held && !r.tether && !r.used && !tgt,
      shake: this.fx ? this.shake : 0, flash: this.fx ? this.flash : 0, banner: this.banner,
      coach: this.coach(), prompt: this.state === 'ready' ? 'Hold anywhere to grab' : null, grabT: this.grabT,
      replay: this.state === 'watch',
    });
  }

  /** First-run coaching, shown until the player has done each thing a few times. */
  private coach(): string | null {
    const p = loadProfile();
    if (p.runs >= 3 || this.state !== 'play') return null;
    const r = this.run;
    if (r.tether && r.grazing) return 'In the corona: points! Let go soon';
    if (r.tether && r.stats.links < 4) return 'Let go to fling along the dotted line';
    if (!r.tether && r.stats.links < 3 && r.tick > 60) {
      if (this.held) return r.used ? null : 'Holding: you’ll catch the next star';
      return target(r) ? 'Hold to grab the ringed star' : 'Hold early: you’ll catch the next star';
    }
    return null;
  }

  // ------------------------------------------------------------ effects

  private spark(x: number, y: number, color: string, n: number, speed = 14): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, max: 0.8, color, size: 2 + Math.random() * 2 });
    }
  }

  private float(x: number, y: number, text: string, color: string, sub?: string): void {
    // Popups close together stack upward instead of overlapping.
    const busy = this.floaters.filter((f) => f.t < 0.6 && Math.abs(f.x - x) < 30 && Math.abs(f.y - y) < 14).length;
    this.floaters.push({ x, y, text, color, sub, t: 0, stack: busy });
    if (this.floaters.length > 8) this.floaters.shift();
  }

  private effect(e: Ev): void {
    const r = this.run;
    const pts = e.pts ? `+${Math.round(e.pts)}` : '';
    switch (e.k) {
      case 'grab':
        this.grabT = 0;
        this.sfx.grab(r.mult);
        navigator.vibrate?.(6);
        break;
      case 'link':
        if (r.mult > 1) this.float(e.x, e.y + 6, pts, '#ffffff');
        break;
      case 'release':
        this.sfx.release();
        break;
      case 'sungraze':
        this.sfx.sungraze(e.mult ?? 1);
        this.float(e.x, e.y, `${pts} SUNGRAZE`, '#ffb347', `combo ×${e.mult}`);
        this.spark(e.x, e.y, '#ffcf7a', 14, 22);
        this.shake = Math.max(this.shake, 3);
        navigator.vibrate?.(14);
        break;
      case 'near':
        this.sfx.near(e.mult ?? 1);
        this.float(e.x, e.y, `${pts} CLOSE!`, '#7dffd2', `combo ×${e.mult}`);
        this.spark(e.x, e.y, '#9dffe0', 10, 18);
        this.shake = Math.max(this.shake, 2.5);
        navigator.vibrate?.(12);
        break;
      case 'mote':
        this.sfx.mote();
        this.spark(e.x, e.y, '#9ff7ff', 6, 10);
        if (r.mult > 1) {
          // A string of motes adds up in one floater.
          const f = this.floaters.find((q) => q.mote && q.t < 0.5);
          if (f) {
            f.mote! += e.pts ?? 0;
            f.text = `+${Math.round(f.mote!)}`;
            f.x = e.x;
            f.y = e.y;
            f.t = 0;
          } else this.floaters.push({ x: e.x, y: e.y, text: pts, color: '#9ff7ff', t: 0, mote: e.pts ?? 0 });
        }
        break;
      case 'bounce':
        this.sfx.bounce();
        this.spark(e.x, e.y, '#a8b8ff', 8, 16);
        this.shake = Math.max(this.shake, 3);
        navigator.vibrate?.(16);
        break;
      case 'drop':
        this.sfx.drop();
        this.float(e.x, e.y, 'combo lost', '#ff8a8a');
        break;
      case 'snap':
        this.sfx.release();
        this.float(e.x, e.y, 'went dark', '#9ec7ff');
        break;
      case 'zone':
        this.sfx.zone();
        this.banner = { title: ZONES[e.n!].name, sub: ZONE_SUB[e.n!], t: 0 };
        navigator.vibrate?.(20);
        break;
      case 'die':
        this.sfx.graze(false);
        this.wasGrazing = false;
        this.sfx.die();
        this.spark(e.x, e.y, '#ffffff', 20, 40);
        this.spark(e.x, e.y, e.cause === 'void' ? '#ff4d8a' : '#ff9a3c', 30, 30);
        this.shake = 10;
        this.flash = 0.45;
        navigator.vibrate?.([40, 30, 70]);
        if (this.state === 'play') this.died();
        else if (this.watching) setTimeout(() => this.endWatch(), 900);
        break;
    }
  }

  // ------------------------------------------------------------ HUD

  private hud(): void {
    const r = this.run;
    $('score').textContent = finalScore(r).toLocaleString('en-US');
    const m = $('mult');
    m.textContent = `×${r.mult}`;
    m.className = `value mult m${Math.min(9, r.mult)}`;
    $('alt').textContent = String(Math.floor(altitude(r)));
    $('modeTag').textContent = this.daily ? 'Daily' : this.mode !== 'n' ? MODES[this.mode].name : '';
    $('modeTag').hidden = !this.daily && this.mode === 'n';
  }

  // ------------------------------------------------------------ ends

  private died(): void {
    this.state = 'dead';
    this.deadAt = performance.now();
    this.held = false;
    this.pointers.clear();
    const r = this.run;
    const p = loadProfile();
    const score = finalScore(r);
    const before = p.best;
    p.runs++;
    p.time += r.tick / TPS;
    p.bestAlt = Math.max(p.bestAlt, Math.floor(altitude(r)));
    if (score > p.best) {
      p.best = score;
      p.bestRun = { v: RULES_VERSION, seed: r.seed, mode: r.mode, a: encodeInputs(this.inputs), score };
    }
    saveProfile(p);
    store.save('last', { v: RULES_VERSION, seed: r.seed, mode: r.mode, a: encodeInputs(this.inputs), t: r.tick });
    this.result = { score, before, newBest: score > before && before > 0, unlocks: MODE_IDS.filter((m) => MODES[m].unlock > before && MODES[m].unlock <= score) };
    if (this.daily) recordDaily(store, score, score.toLocaleString('en-US'), this.daily);
  }
  private result: { score: number; before: number; newBest: boolean; unlocks: Mode[] } | null = null;

  private endCard(): void {
    const r = this.run;
    const p = loadProfile();
    const res = this.result!;
    const [title, why] = CAUSE[r.cause ?? 'burn'];
    const s = r.stats;
    const daily = this.daily ? loadDaily(store, this.daily) : null;
    const chips = MODE_IDS.filter((m) => unlocked(p, m));
    const unlockLine = res.unlocks.length ? `<p class="unlock">Unlocked: <b>${res.unlocks.map((m) => MODES[m].name).join(', ')}</b> (pick it below)</p>` : '';
    const next = MODE_IDS.find((m) => !unlocked(p, m));
    showCard(
      `<h2>${title}</h2>
       <p class="big">${res.score.toLocaleString('en-US')}${res.newBest ? ' <span class="newbest">New best!</span>' : ''}</p>
       <div class="stats"><span><b>${Math.floor(altitude(r))}</b>altitude</span><span><b>${fmtTime(r.tick)}</b>time</span><span><b>×${s.bestMult}</b>best combo</span><span><b>${ZONES[r.zone].name}</b>reached</span></div>
       <p class="why">${why}</p>
       <p class="meta2">${s.links} stars · ${s.nears} close shaves · ${s.sungrazes} sungrazes · ${s.motes} motes</p>
       ${unlockLine}
       <p class="meta2">${daily ? `Today’s best: <b>${daily.label}</b> (${daily.plays} tr${daily.plays === 1 ? 'y' : 'ies'})` : `Best ${p.best.toLocaleString('en-US')} · ${p.runs} run${p.runs === 1 ? '' : 's'}`}${!this.daily && next ? ` · ${MODES[next].name} at ${MODES[next].unlock.toLocaleString('en-US')}` : ''}</p>
       ${!this.daily && chips.length > 1 ? `<div class="modes">${chips.map((m) => `<button data-mode="${m}" class="${m === this.mode ? 'on' : ''}">${MODES[m].name}</button>`).join('')}</div>` : ''}`,
      [
        { label: this.daily ? 'Fly the daily again' : 'Fly again', primary: true, onClick: () => this.newRun() },
        ...(this.daily ? [{ label: 'Free flight (new sky)', onClick: () => this.leaveDaily('n') }] : [{ label: 'Retry this sky', onClick: () => this.start(r.seed, r.mode) }]),
        { label: 'Watch replay', onClick: () => this.watchLast() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
    this.wireModes();
    // A thumb still tapping from the run shouldn't hit a button by accident.
    const o = $('overlay');
    o.style.pointerEvents = 'none';
    setTimeout(() => (o.style.pointerEvents = ''), 500);
  }

  private wireModes(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>('#overlay .modes button')) {
      b.onclick = () => {
        const m = b.dataset.mode as Mode;
        const p = loadProfile();
        p.mode = m;
        saveProfile(p);
        this.newRun(m);
      };
    }
  }

  /** Replay the run that just ended; its end card comes back afterwards. */
  private watchLast(): void {
    const r = this.run, inputs = this.inputs.slice();
    this.lastPlay = { run: r, inputs, result: this.result! };
    this.watch(r.seed, r.mode, inputs, Infinity, 'Last run');
  }
  private lastPlay: { run: Run; inputs: number[]; result: NonNullable<Game['result']> } | null = null;

  private endWatch(): void {
    if (!this.watching) return;
    const label = this.watching.label;
    this.watching = null;
    this.state = 'dead';
    if (label === 'Last run' && this.lastPlay) {
      this.run = this.lastPlay.run;
      this.inputs = this.lastPlay.inputs;
      this.result = this.lastPlay.result;
      this.lastPlay = null;
      this.hud();
      this.endCard();
      return;
    }
    showCard(`<h2>${label} over</h2><p class="big">${finalScore(this.run).toLocaleString('en-US')}</p><p class="meta2">Altitude ${Math.floor(altitude(this.run))} · ${fmtTime(this.run.tick)}</p>`, [
      { label: 'Fly', primary: true, onClick: () => this.newRun() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ], false);
  }

  // ------------------------------------------------------------ cards

  showHelp(first = false): void {
    if (this.state === 'play') this.pause();
    const p = loadProfile();
    if (!p.tips.includes('help')) {
      p.tips.push('help');
      saveProfile(p);
    }
    showCard(
      `<h2>Sungrazer</h2>
       <svg class="diagram" viewBox="0 0 300 120" aria-hidden="true">
         <circle cx="90" cy="64" r="34" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-dasharray="4 5"/>
         <circle cx="90" cy="64" r="20" fill="none" stroke="#ffcf9a" stroke-opacity="0.5" stroke-dasharray="3 4"/>
         <circle cx="90" cy="64" r="11" fill="#fff1c4" stroke="#ffb547" stroke-width="2"/>
         <line x1="90" y1="64" x2="114" y2="40" stroke="#dff2ff" stroke-width="1.6"/>
         <circle cx="114" cy="40" r="4" fill="#fff"/>
         <path d="M118 36 Q150 6 190 18" fill="none" stroke="#dff2ff" stroke-width="2" stroke-dasharray="2 5"/>
         <circle cx="222" cy="40" r="9" fill="#fff1c4" stroke="#ffb547" stroke-width="2"/>
         <circle cx="222" cy="40" r="15" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/>
         <path d="M196 96l5-9 8 3-4 9z" fill="#3b2420" stroke="#ff6a3d" stroke-width="1.5"/>
         <text x="90" y="114" fill="#cfd6ff" font-size="12" text-anchor="middle" font-family="system-ui">hold: swing</text>
         <text x="160" y="62" fill="#cfd6ff" font-size="12" text-anchor="middle" font-family="system-ui">let go: fly</text>
         <text x="222" y="72" fill="#cfd6ff" font-size="12" text-anchor="middle" font-family="system-ui">next star</text>
       </svg>
       <ul>
         <li><b>Hold anywhere</b> to grab the ringed star and swing round it. <b>Let go</b> to fling off along the dotted line; then gravity pulls. If the line turns <b>red with an ✕</b>, that fling hits something.</li>
         <li>The tether <b>reels you in</b>: swing too long and you burn. Grazing the dashed <b>corona</b> pays, and letting go inside it is a <b>sungraze</b>.</li>
         <li><b>Close shaves</b>: fly through the faint green ring round a star or cinder without touching it. That and sungrazes raise your <b>combo</b>; walls and long free flights lose it.</li>
         <li>Climb! The <b>void</b> rises from below.</li>
       </ul>`,
      [{ label: first ? 'Fly' : 'Back', primary: true, onClick: () => this.resume() }],
      !first,
    );
  }

  showMenu(): void {
    if (this.state === 'play' || this.state === 'watch') this.pause();
    const p = loadProfile();
    const chips = MODE_IDS.filter((m) => unlocked(p, m));
    const locked = MODE_IDS.filter((m) => !unlocked(p, m));
    const best = p.bestRun && p.bestRun.v === RULES_VERSION ? p.bestRun : null;
    showCard(
      `<h2>Sungrazer</h2>
       <p class="meta2">Best <b>${p.best.toLocaleString('en-US')}</b> · highest altitude ${p.bestAlt} · ${p.runs} run${p.runs === 1 ? '' : 's'}</p>
       ${this.daily ? '' : `<div class="modes">${chips.map((m) => `<button data-mode="${m}" class="${m === this.mode ? 'on' : ''}">${MODES[m].name}</button>`).join('')}</div>
       <p class="meta2">${MODES[this.mode].blurb}${locked.length ? ` Locked: ${locked.map((m) => `${MODES[m].name} (score ${MODES[m].unlock.toLocaleString('en-US')})`).join(', ')}.` : ''}</p>`}`,
      [
        { label: this.state === 'paused' ? 'Resume' : 'Back', primary: true, onClick: () => this.resume() },
        { label: 'How to play', onClick: () => this.showHelp() },
        ...(this.state === 'paused' ? [{ label: this.resumeTo === 'watch' ? 'Stop replay' : 'Restart', onClick: () => this.newRun() }] : []),
        ...(best ? [{ label: `Watch your best (${best.score.toLocaleString('en-US')})`, onClick: () => this.watchBest() }] : []),
        ...(this.daily ? [{ label: 'Leave the daily', onClick: () => this.leaveDaily('n') }] : []),
        { label: soundOn() ? 'Sound: on (tap to mute)' : 'Sound: off (tap to unmute)', onClick: () => this.toggleSound() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
    this.wireModes();
  }

  private toggleSound(): void {
    const st = loadSettings();
    saveSettings({ ...st, sound: !st.sound });
    this.sfx.setOn(!st.sound);
    this.showMenu();
  }

  private watchBest(): void {
    const b = loadProfile().bestRun;
    if (b) this.watch(b.seed, b.mode, b.a ? b.a.split('.').map(Number) : [], Infinity, 'Best run');
  }

  private async copyReport(): Promise<void> {
    const r = this.run;
    toast((await copyText(`SUNGRAZER v${RULES_VERSION} seed=${r.seed} m=${r.mode} t=${r.tick} a=${encodeInputs(this.inputs)}`)) ? 'Bug report copied' : 'Copy failed');
  }
}

