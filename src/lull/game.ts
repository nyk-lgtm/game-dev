// Lull controller: tools (plant, water, strum, dig), the garden clock (the audio
// clock when sound runs, else performance.now), the note scheduler, wishes,
// saving (the garden's code) and shared links.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { loadSettings, reducedFx, saveSettings, soundOn } from '../shared/settings';
import { makeStore } from '../shared/storage';
import { randomSeed } from '../shared/rng';
import {
  DAY, KEY_NAMES, MAX_PLANTS, RULES_VERSION, SPECIES, STEP_SEC, WISHES, XS, apply, cloneGarden, colOf, crittersAt,
  dayTime, decode, encode, growth, keyOf, laneOf, midiOf, newGarden, noteName, notesAt, plantError, rootOf, watered, weatherAt,
  wishesMet, type Action, type Garden, type Plant, type PlantError,
} from './core';
import { GardenAudio } from './audio';
import { Scene, type Ghost } from './render/draw';
import { drawShape, makeShape } from './render/flora';

export const store = makeStore('lull.');
const $ = (id: string) => document.getElementById(id)!;

export interface SavedGarden {
  v: number;
  code: string;
  /** Date.now() when saved: time away lets the garden grow on a little. */
  at: number;
}

export interface Profile {
  wishes: string[];
  planted: number;
  gardens: number;
}
export const loadProfile = (): Profile => ({ wishes: [], planted: 0, gardens: 0, ...store.load<Partial<Profile>>('profile', {}) });

type Tool = 'seed' | 'water' | 'strum' | 'dig';
const TOOL_HINT: Record<Tool, string> = {
  seed: 'Tap the meadow to plant. <b>Left is low, right is high</b>; back rows sing early in the bar, front rows late.',
  water: 'Drag over plants to water them: seedlings grow faster, grown plants <b>flourish</b> and sing twice as often.',
  strum: 'Drag across the garden to <b>strum</b> it like a harp.',
  dig: 'Tap a plant to dig it up. <b>Undo</b> puts it back.',
};
const SHORT = ['Chime', 'Fern', 'Reed', 'Lily', 'Glowcap', 'Willow'];
const PHASE_ICON = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' } as const;
const WEATHER_WORD = { clear: '', breezy: 'breezy', rain: 'rainy', mist: 'misty' } as const;
const WEATHER_ICON = { clear: '', breezy: ' 🍃', rain: ' 🌧', mist: ' 🌫' } as const;
const BEAT = ['1', '1&', '2', '2&', '3', '3&', '4', '4&'];
/** How much garden time passes while you're away, at most (steps). */
const AWAY_MAX = DAY / 2;
const LOOKAHEAD = 0.22;

interface Flash {
  at: number;
  plant: Plant | null;
  vel: number;
  why: string;
}

export class Game {
  g!: Garden;
  private base!: Garden;
  private groups: Action[][] = [];
  visiting = false;
  tool: Tool = 'seed';
  sp = 0;
  private scene: Scene;
  audio = new GardenAudio(soundOn());
  private canvas = $('board') as HTMLCanvasElement;
  private reduced = reducedFx();
  // Clock.
  private src: 'audio' | 'perf' = 'perf';
  private anchorStep = 0;
  private anchorClock = 0;
  private lastStep = 0;
  private nextStep = 0;
  private flashes: Flash[] = [];
  private hiddenAt = 0;
  // Input.
  private press: { id: number; x: number; y: number; moved: boolean; lastX: number; lastY: number; col: number; t: number } | null = null;
  private ghost: Ghost | null = null;
  private toolPos: { kind: 'water' | 'strum'; x: number; y: number } | null = null;
  private lastWater = 0;
  private group: Action[] | null = null;
  private msgUntil = 0;
  private lastFrame = 0;
  private lastSave = 0;
  private lastCheck = 0;
  private lastHud = '';
  profile = loadProfile();
  private gaps: number[] = [];
  /** Frame times (ms) for the perf probe. */
  frameMs: number[] = [];

  constructor() {
    this.scene = new Scene(this.canvas, $('land') as HTMLCanvasElement);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', () => this.cancel());
    // Any first touch wakes the sound (browsers need a gesture).
    document.addEventListener('pointerdown', () => this.audio.ensure(), { capture: true });
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    document.addEventListener('visibilitychange', () => this.visibility());
    addEventListener('pagehide', () => this.save(true));
    this.buildControls();
    setInterval(() => this.tick(), 40);
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- garden

  /** Opens a garden (from a code or fresh). */
  open(g: Garden, visiting = false): void {
    closeOverlay();
    this.g = g;
    this.base = cloneGarden(g);
    this.groups = [];
    this.visiting = visiting;
    this.flashes = [];
    this.anchorStep = this.lastStep = g.now;
    this.anchorClock = this.clock();
    this.nextStep = Math.ceil(g.now);
    this.scene.prune(g);
    this.resize();
    this.refreshHud(true);
    this.updateUndo();
    this.say(visiting ? 'You are visiting a shared garden. Menu → <b>Keep this garden</b> to make it yours.' : '', 6000);
    if (!visiting) this.save(true);
  }

  newGarden(): void {
    this.profile.gardens++;
    store.save('profile', this.profile);
    this.open(newGarden(randomSeed()));
  }

  resumeOwn(): void {
    const saved = store.load<SavedGarden | null>('garden', null);
    const g = saved && saved.v === RULES_VERSION ? decode(saved.code) : null;
    if (g && saved) {
      // Time away lets it grow on a little (at most half a day).
      const away = Math.max(0, (Date.now() - saved.at) / 1000 / STEP_SEC);
      g.now += Math.floor(Math.min(AWAY_MAX, away));
      this.open(g);
    } else this.newGarden();
  }

  keepVisit(): void {
    this.visiting = false;
    this.base = cloneGarden(this.g);
    this.groups = [];
    this.save(true);
    toast('This garden is yours now');
    this.say('');
  }

  save(now = false): void {
    if (!this.g || this.visiting) return;
    const t = performance.now();
    if (!now && t - this.lastSave < 5000) return;
    this.lastSave = t;
    store.save('garden', { v: RULES_VERSION, code: encode(this.g), at: Date.now() } satisfies SavedGarden);
  }

  shareUrl(): string {
    return `${location.origin}${location.pathname}?g=${encode(this.g)}`;
  }

  // ---------------------------------------------------------------- clock

  private clock(): number {
    return this.src === 'audio' && this.audio.ctx ? this.audio.time() : performance.now() / 1000;
  }

  /** The garden clock in (fractional) steps. Switches to the audio clock once sound runs. */
  stepNow(): number {
    const want = this.audio.running ? 'audio' : 'perf';
    if (want !== this.src) {
      this.anchorStep = this.lastStep;
      this.src = want;
      this.anchorClock = this.clock();
      // Flashes were timed on the old clock; the next steps get scheduled again (now with sound).
      this.flashes = [];
      this.nextStep = Math.ceil(this.lastStep);
    }
    const s = this.anchorStep + (this.clock() - this.anchorClock) / STEP_SEC;
    this.lastStep = Math.max(this.lastStep, s);
    return this.lastStep;
  }

  private visibility(): void {
    if (document.hidden) {
      this.hiddenAt = performance.now();
      this.save(true);
      this.audio.suspend();
    } else {
      // Pick up where it was, plus the time away (capped).
      const away = (performance.now() - this.hiddenAt) / 1000 / STEP_SEC;
      this.audio.resume();
      this.anchorStep = this.lastStep + Math.min(AWAY_MAX, Math.max(0, away));
      this.lastStep = this.anchorStep;
      this.src = 'perf';
      this.anchorClock = this.clock();
      this.nextStep = Math.ceil(this.lastStep);
      this.flashes = [];
    }
  }

  /** Schedules the next steps' notes a little ahead. */
  private tick(): void {
    if (!this.g || document.hidden) return;
    const now = this.stepNow();
    if (this.nextStep < now - 1) this.nextStep = Math.ceil(now);
    const until = now + LOOKAHEAD / STEP_SEC;
    const audio = this.src === 'audio' && this.audio.running;
    while (this.nextStep <= until) {
      const s = this.nextStep++;
      const at = this.anchorClock + (s - this.anchorStep) * STEP_SEC;
      for (const n of notesAt(this.g, s)) {
        if (audio) this.audio.note(n.midi, n.voice, n.vel, n.len * STEP_SEC, at);
        this.flashes.push({ at, plant: n.i >= 0 ? this.g.plants[n.i] : null, vel: n.vel, why: n.why });
      }
    }
  }

  // ---------------------------------------------------------------- frame

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    if (!this.g) return;
    const dt = Math.min(0.1, this.lastFrame ? (t - this.lastFrame) / 1000 : 0.016);
    this.lastFrame = t;
    const t0 = performance.now();
    const step = this.stepNow();
    if (Math.floor(step) > this.g.now) this.g.now = Math.floor(step);
    // Notes that are sounding now light up their plants.
    const clock = this.clock();
    if (this.flashes.length) {
      const due = this.flashes.filter((f) => f.at <= clock);
      if (due.length) {
        this.flashes = this.flashes.filter((f) => f.at > clock);
        for (const f of due) {
          const i = f.plant ? this.g.plants.indexOf(f.plant) : -1;
          if (i < 0) continue;
          this.scene.flash(this.g, i, f.vel);
          if ((f.why === 'visit' || f.why === 'gust') && !this.reduced) {
            const h = this.scene.head(this.g, i, 0, step, t / 1000);
            this.scene.burst('spark', h.x, h.y, 3, '#fff6c8');
          }
          if (f.why === 'gust') this.scene.kick(this.g, i, 0.05);
        }
      }
    }
    const weather = weatherAt(this.g.seed, step);
    this.scene.draw({
      g: this.g,
      step,
      time: t / 1000,
      dt,
      weather,
      critters: crittersAt(this.g, step),
      ghost: this.ghost,
      tool: this.toolPos,
      reduced: this.reduced,
    });
    if (t - this.lastCheck > 1000) {
      this.lastCheck = t;
      this.checkWishes();
      this.refreshHud();
      const light = dayTime(step).light;
      this.audio.ambience(weather.kind === 'rain' ? weather.amt : 0, weather.kind === 'breezy' ? weather.amt : 0, 0.3 + 0.25 * (1 - light) + (weather.kind === 'mist' ? 0.25 * weather.amt : 0));
      this.save();
    }
    this.frameMs.push(performance.now() - t0);
    if (this.frameMs.length > 600) this.frameMs.shift();
    // Degrade gracefully: if frames keep running slow, draw at fewer device pixels.
    this.gaps.push(dt);
    if (this.gaps.length >= 120) {
      const avg = this.gaps.reduce((a, b) => a + b, 0) / this.gaps.length;
      this.gaps = [];
      if (avg > 0.024 && !document.hidden) this.scene.slower();
    }
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (Math.abs(r.width - this.scene.L.W) < 0.5 && Math.abs(r.height - this.scene.L.H) < 0.5 && this.scene.L.W > 1) return;
    this.scene.resize(r.width, r.height);
  }

  // ---------------------------------------------------------------- input

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    if (this.press) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.press = { id: e.pointerId, x: p.x, y: p.y, moved: false, lastX: p.x, lastY: p.y, col: -1, t: performance.now() };
    this.group = null;
    if (this.tool === 'seed') this.aim(p.x, p.y, true);
    else if (this.tool === 'water') this.water(p.x, p.y, true);
    else if (this.tool === 'strum') this.toolPos = { kind: 'strum', x: p.x, y: p.y };
  }

  private move(e: PointerEvent): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    const p = this.local(e);
    if (Math.hypot(p.x - pr.x, p.y - pr.y) > 8) pr.moved = true;
    if (this.tool === 'seed') this.aim(p.x, p.y, false);
    else if (this.tool === 'water') this.water(p.x, p.y, false);
    else if (this.tool === 'strum') this.strum(pr.lastX, pr.lastY, p.x, p.y);
    pr.lastX = p.x;
    pr.lastY = p.y;
  }

  private up(e: PointerEvent): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    const p = this.local(e);
    if (this.tool === 'seed' && this.ghost) {
      if (this.ghost.ok) this.plant(this.ghost.sp, this.ghost.x, this.ghost.y);
      else this.explain(this.ghost.sp, this.ghost.x, this.ghost.y);
    } else if (this.tool === 'dig' && !pr.moved) this.dig(p.x, p.y);
    else if (this.tool === 'strum' && !pr.moved) this.strum(p.x - 1, p.y, p.x + 1, p.y);
    this.cancel();
  }

  private cancel(): void {
    this.press = null;
    this.ghost = null;
    this.toolPos = null;
    if (this.group?.length) this.groups.push(this.group);
    this.group = null;
    this.updateUndo();
  }

  /** The planting preview under the finger; plays its note as it moves between columns. */
  private aim(sx: number, sy: number, first: boolean): void {
    const q = this.scene.unpos(sx, sy);
    if (!q) {
      this.ghost = null;
      return;
    }
    const err = plantError(this.g, this.sp, q.x, q.y);
    const col = colOf(q.x);
    const lane = laneOf(q.y);
    const label = err ? this.errorText(err.err, err.near).short : `♪ ${noteName(col)} · beat ${BEAT[lane]}`;
    this.ghost = { sp: this.sp, x: q.x, y: q.y, ok: !err, label };
    if (this.press && (first || this.press.col !== col)) {
      this.press.col = col;
      this.preview(this.sp, col);
    }
  }

  private preview(sp: number, col: number): void {
    const s = SPECIES[sp];
    this.audio.note(midiOf(this.g.seed, sp, col), s.voice, 0.6, s.len * STEP_SEC, this.audio.time() + 0.01);
  }

  private errorText(err: PlantError, near?: number): { short: string; long: string } {
    const s = SPECIES[this.sp];
    switch (err) {
      case 'full':
        return { short: 'The garden is full', long: `The garden holds ${MAX_PLANTS} plants. Dig one up to make room.` };
      case 'water':
        return { short: 'Lilies float: plant on the pond', long: `${s.name}s grow on the water. Plant it on the pond.` };
      case 'dry':
        return { short: 'Too wet here', long: `${s.name}s don’t grow in water. Only Moonlilies and Whistlereeds do.` };
      case 'edge':
        return { short: 'Reeds need the pond', long: `${s.name}s grow in the pond or on its sandy shore.` };
      case 'close': {
        const p = near !== undefined ? this.g.plants[near] : null;
        return { short: p ? `Too close to the ${SPECIES[p.sp].name}` : 'Too close', long: p ? this.plantInfo(p) : 'Too close to another plant.' };
      }
      default:
        return { short: 'Not here', long: 'Plant on the meadow.' };
    }
  }

  private explain(sp: number, x: number, y: number): void {
    const err = plantError(this.g, sp, x, y);
    if (err) this.say(this.errorText(err.err, err.near).long, 4000);
  }

  plantInfo(p: Plant): string {
    const s = SPECIES[p.sp];
    const gr = growth(p, this.g.now);
    const grown = gr >= 1 ? 'fully grown' : `${Math.round(gr * 100)}% grown`;
    const fl = p.flourish > this.g.now ? ' · <b>flourishing</b>' : '';
    return `<b>${s.name}</b> · sings <b>${noteName(colOf(p.x))}</b> on beat ${BEAT[laneOf(p.y)]}, every ${s.every === 1 ? 'bar' : `${s.every} bars`} · ${grown}${fl}`;
  }

  /** Plants a seed (exported for tests and the perf probe). */
  plant(sp: number, x: number, y: number): boolean {
    const a: Action = { t: this.g.now, k: 'P', sp, x, y };
    if (!apply(this.g, a)) return false;
    this.groups.push([a]);
    this.updateUndo();
    this.profile.planted++;
    store.save('profile', this.profile);
    const { sx, sy } = this.scene.pos(x, y);
    this.scene.burst('dirt', sx, sy, this.reduced ? 4 : 10, '#6b4a2e');
    if (SPECIES[sp].wet === 'yes') this.scene.burst('ring', sx, sy, 1, 'rgba(255,255,255,0.7)');
    navigator.vibrate?.(10);
    const p = this.g.plants.find((q) => q.x === x && q.y === y);
    if (p) this.say(this.plantInfo(p), 3500);
    this.save(true);
    return true;
  }

  private water(sx: number, sy: number, first: boolean): void {
    this.toolPos = { kind: 'water', x: sx, y: sy };
    const now = performance.now();
    this.scene.burst('drop', sx, sy - 64 * this.scene.L.u, this.reduced ? 1 : 3, 'rgba(170,215,255,0.9)');
    if (!first && now - this.lastWater < 220) return;
    this.lastWater = now;
    const q = this.scene.unpos(sx, sy);
    if (!q) return;
    const hit = watered(this.g, q.x, q.y);
    if (!hit.length) return;
    const a: Action = { t: this.g.now, k: 'W', x: q.x, y: q.y };
    const grownBefore = hit.filter((p) => growth(p, this.g.now) >= 1).length;
    if (!apply(this.g, a)) return;
    (this.group ??= []).push(a);
    if (first) this.audio.pour();
    for (const p of hit) {
      const i = this.g.plants.indexOf(p);
      const h = this.scene.head(this.g, i, 0, this.g.now, now / 1000);
      if (!this.reduced) this.scene.burst('spark', h.x, h.y, 2, growth(p, this.g.now) >= 1 ? '#fff0a0' : '#b8ffb0');
    }
    if (first) this.say(grownBefore ? `Flourishing: ${grownBefore === 1 ? 'it sings' : 'they sing'} twice as often for 8 bars.` : 'Watered: growing faster.', 2500);
  }

  private strum(x0: number, y0: number, x1: number, y1: number): void {
    this.toolPos = { kind: 'strum', x: x1, y: y1 };
    if (x0 === x1) return;
    const step = this.g.now;
    const t = this.audio.time() + 0.01;
    let n = 0;
    this.g.plants.forEach((p, i) => {
      const { sx, sy, s } = this.scene.pos(p.x, p.y);
      if ((x0 - sx) * (x1 - sx) > 0) return;
      const gr = growth(p, step);
      const tall = (p.sp === 5 ? 120 : p.sp === 3 ? 30 : 80) * s * (0.4 + 0.6 * gr);
      const fy = (y0 + y1) / 2;
      if (fy < sy - tall - 30 * s || fy > sy + 30 * s) return;
      const sp = SPECIES[p.sp];
      this.audio.note(midiOf(this.g.seed, p.sp, colOf(p.x)), sp.voice, 0.4 + 0.4 * gr, Math.max(2, sp.len >> 1) * STEP_SEC, t + n * 0.015);
      this.scene.flash(this.g, i, 0.9);
      this.scene.kick(this.g, i, this.reduced ? 0.03 : 0.07);
      n++;
    });
    if (n) navigator.vibrate?.(4);
  }

  private dig(sx: number, sy: number): void {
    const i = this.scene.plantAt(this.g, sx, sy);
    if (i < 0) {
      this.say('No plant there. Tap right on one to dig it up.', 2500);
      return;
    }
    const p = this.g.plants[i];
    const a: Action = { t: this.g.now, k: 'X', x: p.x, y: p.y };
    if (!apply(this.g, a)) return;
    this.groups.push([a]);
    this.updateUndo();
    const { sx: bx, sy: by } = this.scene.pos(p.x, p.y);
    this.scene.burst('dirt', bx, by, this.reduced ? 4 : 12, '#6b4a2e');
    this.scene.burst('leaf', bx, by - 20, this.reduced ? 2 : 6, '#7fbf6a');
    this.audio.dig();
    navigator.vibrate?.(15);
    this.scene.prune(this.g);
    this.say(`Dug up the ${SPECIES[p.sp].name}.`, 2500);
    this.save(true);
  }

  undo(): void {
    if (!this.groups.length) return;
    this.groups.pop();
    const now = this.g.now;
    const g = cloneGarden(this.base);
    for (const grp of this.groups) for (const a of grp) apply(g, a);
    g.now = Math.max(g.now, now);
    this.g = g;
    this.flashes = [];
    this.scene.prune(g);
    this.updateUndo();
    this.say('Undone.', 1500);
    this.save(true);
  }

  // ---------------------------------------------------------------- wishes

  private checkWishes(): void {
    if (this.visiting) return;
    const met = wishesMet(this.g).filter((id) => !this.profile.wishes.includes(id));
    if (!met.length) return;
    for (const id of met) {
      this.profile.wishes.push(id);
      const w = WISHES.find((x) => x.id === id)!;
      toast(`★ Wish granted: ${w.name}`);
    }
    store.save('profile', this.profile);
    this.audio.chime(rootOf(this.g.seed));
    this.refreshHud(true);
  }

  // ---------------------------------------------------------------- DOM

  private buildControls(): void {
    const row = $('species');
    row.innerHTML = '';
    SPECIES.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'sp';
      b.dataset.i = String(i);
      b.setAttribute('aria-label', s.name);
      b.innerHTML = `${iconImg(i)}<span>${SHORT[i]}</span>`;
      b.onclick = () => {
        this.sp = i;
        this.setTool('seed');
        this.say(`<b>${s.name}</b>: ${s.blurb}`, 4000);
      };
      row.appendChild(b);
    });
    for (const t of ['seed', 'water', 'strum', 'dig'] as Tool[]) {
      const b = $(`tool-${t}`);
      b.onclick = () => this.setTool(t);
    }
    $('undoBtn').onclick = () => this.undo();
    $('soundBtn').onclick = () => this.toggleSound();
    this.setTool('seed');
    this.refreshSound();
  }

  setTool(t: Tool): void {
    this.tool = t;
    for (const x of ['seed', 'water', 'strum', 'dig']) $(`tool-${x}`).classList.toggle('on', x === t);
    document.querySelectorAll<HTMLElement>('#species .sp').forEach((b) => b.classList.toggle('on', t === 'seed' && Number(b.dataset.i) === this.sp));
    $('species').classList.toggle('dim', t !== 'seed');
    this.say('');
  }

  private toggleSound(): void {
    const st = loadSettings();
    st.sound = !this.audio.on;
    saveSettings(st);
    this.audio.setOn(st.sound);
    this.refreshSound();
    toast(st.sound ? 'Sound on' : 'Sound off');
  }

  private refreshSound(): void {
    $('soundBtn').textContent = this.audio.on ? '🔊' : '🔇';
  }

  private updateUndo(): void {
    ($('undoBtn') as HTMLButtonElement).disabled = !this.groups.length;
  }

  /** A message in the info line for a while (empty = the tool's hint). */
  say(html: string, ms = 3000): void {
    const el = $('info');
    if (html) {
      el.innerHTML = html;
      this.msgUntil = performance.now() + ms;
    } else {
      el.innerHTML = this.g && !this.g.plants.length && this.tool === 'seed' ? 'Pick a plant below and tap the meadow to sow it. <b>Left is low, right is high.</b>' : TOOL_HINT[this.tool];
      this.msgUntil = 0;
    }
  }

  private refreshHud(force = false): void {
    if (this.msgUntil && performance.now() > this.msgUntil) this.say('');
    const d = dayTime(this.g.now);
    const w = weatherAt(this.g.seed, this.g.now);
    const ph = d.phase[0].toUpperCase() + d.phase.slice(1);
    const wish = `★ ${this.profile.wishes.length}/${WISHES.length}`;
    const hud = `${d.day}|${ph}|${w.amt > 0.3 ? w.kind : 'clear'}|${wish}|${this.g.plants.length}|${this.visiting}`;
    if (!force && hud === this.lastHud) return;
    this.lastHud = hud;
    const wet = w.amt > 0.3 && w.kind !== 'clear';
    $('dayLabel').textContent = this.visiting ? `Visiting · day ${d.day}` : `Day ${d.day} · key of ${KEY_NAMES[keyOf(this.g.seed)]}`;
    $('phase').textContent = `${PHASE_ICON[d.phase]} ${ph}${wet ? ` · ${WEATHER_ICON[w.kind].trim()} ${WEATHER_WORD[w.kind]}` : ''}`;
    $('wishBtn').textContent = wish;
  }

  // ---------------------------------------------------------------- cards

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>Lull</h2>
      <p>A little garden that sings. Nothing here can wilt or go wrong: plant, listen, change things.</p>
      <ul>
        <li><b>Plant</b>: pick a kind and tap the meadow. Slide your finger to hear the note before you let go.</li>
        <li><b>Left to right is the note</b>, low to high, always in one gentle scale. <b>Back to front is when</b>: a soft band sweeps from the back row to the front every bar, and each plant sings as it passes.</li>
        <li>Each kind has its own voice and rhythm. Chimebells sleep at night; Glowcaps and Moonlilies shine then.</li>
        <li><b>Bees</b> by day, <b>fireflies</b> by night and a <b>frog</b> on the lilies hop between plants and make them sing.</li>
        <li><b>Water</b> helps seedlings grow and makes grown plants flourish. <b>Strum</b>: drag across to play the garden like a harp. <b>Dig</b> takes a plant out.</li>
        <li>Days, rain, breezes and mist drift by on their own. ★ <b>Wishes</b> are little ideas to try.</li>
        <li>The garden saves itself. Share it as a link from the menu.</li>
      </ul>`,
      [{ label: 'Start planting', primary: true, onClick: closeOverlay }],
    );
  }

  showWishes(): void {
    const done = new Set(this.profile.wishes);
    const rows = WISHES.map((w) => `<li class="${done.has(w.id) ? 'done' : ''}"><b>${done.has(w.id) ? '★' : '☆'} ${w.name}</b><br>${w.text}</li>`).join('');
    showCard(`<h2>Wishes</h2><p>Little ideas for your garden. No hurry, no failing.</p><ul class="wishes">${rows}</ul>`, [{ label: 'Back to the garden', primary: true, onClick: closeOverlay }]);
  }

  showMenu(): void {
    const n = this.g.plants.length;
    showCard(`<h2>Lull</h2><p>${this.visiting ? 'A shared garden' : 'Your garden'} · ${n} plant${n === 1 ? '' : 's'} · key of ${KEY_NAMES[keyOf(this.g.seed)]}</p>`, [
      { label: 'Back to the garden', primary: true, onClick: closeOverlay },
      ...(this.visiting
        ? [
            { label: 'Keep this garden (replaces yours)', onClick: () => this.askKeep() },
            { label: 'Back to my garden', onClick: () => this.resumeOwn() },
          ]
        : [{ label: 'Share garden link', onClick: () => void this.share() }]),
      { label: `Sound: ${this.audio.on ? 'on' : 'off'}`, onClick: () => (this.toggleSound(), this.showMenu()) },
      { label: 'New garden', onClick: () => this.askNew() },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Copy bug report', onClick: () => void this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private askKeep(): void {
    showCard('<h2>Keep this garden?</h2><p>It replaces your own garden. Copy your garden’s link first if you want to come back to it.</p>', [
      { label: 'Keep it', primary: true, onClick: () => (closeOverlay(), this.keepVisit()) },
      { label: 'Cancel', onClick: closeOverlay },
    ]);
  }

  private askNew(): void {
    showCard('<h2>Start a new garden?</h2><p>A new pond, a new key, an empty meadow. This garden is gone unless you copy its link first.</p>', [
      { label: 'New garden', primary: true, onClick: () => this.newGarden() },
      ...(this.visiting ? [] : [{ label: 'Copy this garden’s link', onClick: () => void this.share(true) }]),
      { label: 'Cancel', onClick: closeOverlay },
    ]);
  }

  private async share(copyOnly = false): Promise<void> {
    const url = this.shareUrl();
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (!copyOnly && nav.share) {
      try {
        await nav.share({ title: 'My Lull garden', url });
        return;
      } catch {
        // cancelled or unavailable: copy instead
      }
    }
    toast((await copyText(url)) ? 'Garden link copied' : 'Copy failed');
  }

  private async copyReport(): Promise<void> {
    const text = `LULL v${RULES_VERSION} code=${encode(this.g)} tool=${this.tool} sound=${this.audio.on ? 1 : 0}/${this.audio.ctx?.state ?? 'none'}\n${this.shareUrl()}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }

  // ---------------------------------------------------------------- probes

  /** Fills the garden with grown plants (screenshots and the perf probe). */
  fill(n = MAX_PLANTS, seed = 1): number {
    let s = seed;
    let tries = 0;
    let made = 0;
    while (made < n && tries++ < 5000) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const sp = s % SPECIES.length;
      const x = (s >>> 8) % XS;
      const y = (s >>> 18) % 36;
      if (plantError(this.g, sp, x, y)) continue;
      const a: Action = { t: this.g.now, k: 'P', sp, x, y };
      apply(this.g, a);
      const p = this.g.plants.find((q) => q.x === x && q.y === y)!;
      p.born -= SPECIES[sp].grow;
      made++;
    }
    this.base = cloneGarden(this.g);
    this.groups = [];
    this.updateUndo();
    return made;
  }

  /** Jumps the clock (screenshots: dusk, night, rain). */
  jump(step: number): void {
    this.anchorStep = this.lastStep = step;
    this.anchorClock = this.clock();
    this.nextStep = Math.ceil(step);
    this.g.now = Math.max(this.g.now, Math.floor(step));
    this.flashes = [];
    this.refreshHud(true);
  }
}

const iconCache: string[] = [];
function iconImg(sp: number): string {
  if (!iconCache[sp]) {
    const c = document.createElement('canvas');
    const S = 40;
    c.width = c.height = S * 2;
    const x = c.getContext('2d')!;
    const sh = makeShape(11, sp, 500, 18);
    const w = sh.maxX - sh.minX, h = sh.maxY - sh.minY;
    const k = Math.min((S * 2 - 6) / w, (S * 2 - 6) / h);
    x.setTransform(k, 0, 0, k, S - ((sh.minX + sh.maxX) / 2) * k, S * 2 - 3 - sh.maxY * k);
    drawShape(x, sh, 1);
    iconCache[sp] = c.toDataURL();
  }
  return `<img src="${iconCache[sp]}" alt="" width="34" height="34">`;
}
