// Loomsong controller: the song menu (level, new / this / daily / recent
// songs, speed, timing), play (touch lanes, flicks, holds, judged on the audio
// clock), pause with a count-in, the results card with its tapestry, latency
// calibration, the "needs sound" card, help, bug reports and recordings.

import { closeOverlay, showCard } from '../shared/cards';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { copyText, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { loadSettings, reducedFx, saveSettings, soundOn } from '../shared/settings';
import { makeStore } from '../shared/storage';
import { Audio } from './audio';
import {
  FLICK_MAX, GOOD, LEVELS, PERFECT, RULES_VERSION, VALUE, botEvents, chartFor, chartStats, encodeEvents, gradeName, keyName, judgePlay, songFor, Judge,
  type Chart, type Grade, type Hit, type InputEv, type Judgment, type Level, type Result, type Song,
} from './core';
import { draw, drawCalib, laneAt, laneX, layout, tapestry, LANE_COLORS, MISS_COLOR, type Burst, type Layout, type Popup, type Spark } from './render/draw';

export const store = makeStore('loomsong.');
const $ = (id: string) => document.getElementById(id)!;

export interface Profile {
  plays: number;
  best: number;
  bestGrade: Grade | null;
  level: Level;
  speed: number;
  /** Calibrated timing offset (ms), or null for the browser's guess. */
  offset: number | null;
  tips: string[];
  /** Recently played song seeds, newest first. */
  recent: number[];
  /** Played without sound on purpose (sound off on the hub). */
  silentOk: boolean;
  /** The song on the menu (kept across reloads; dailies aside). */
  song: number | null;
  /** "Don't ask again" on the timing prompt. */
  calibDismissed: boolean;
  /** Flash a ring on each calibration click. */
  calibRing: boolean;
  /** The last "Shift timing": the average error it was meant to fix, checked on the next play. */
  shift: { mean: number } | null;
}
export const loadProfile = (): Profile => ({
  plays: 0, best: 0, bestGrade: null, level: 0, speed: 1, offset: null, tips: [], recent: [], silentOk: false, song: null, calibDismissed: false, calibRing: true, shift: null,
  ...store.load<Partial<Profile>>('profile', {}),
});
const saveProfile = (p: Profile) => store.save('profile', p);
type Bests = Record<string, { score: number; grade: Grade; acc: number }>;
const loadBests = () => store.load<Bests>('bests', {});

export const SPEEDS = [
  { name: 'Slow', k: 1.3 },
  { name: 'Normal', k: 1 },
  { name: 'Fast', k: 0.78 },
];
/** Timing offsets outside this range (ms) are not believable: phones play sound late, not early. */
export const OFFSET_MIN = -50;
export const OFFSET_MAX = 300;
export const clampOffset = (ms: number) => Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(ms)));

/** One message at a time, low on the screen (it never covers a card's title or the daily line). */
export function say(msg: string): void {
  for (const el of document.querySelectorAll('.toast')) el.remove();
  toast(msg).classList.add('low');
}

/** Copy, and say so on the button itself. */
async function copyInto(btn: HTMLElement | null, text: string): Promise<void> {
  const ok = await copyText(text);
  if (!btn) return;
  const was = btn.textContent;
  btn.textContent = ok ? 'Copied ✓' : 'Copy failed';
  setTimeout(() => btn.isConnected && (btn.textContent = was), 1800);
}

/** A swipe this long (CSS px) is a flick. */
const FLICK_PX = 26;
/** The live judge runs this far behind the clock, so a touch delivered late still counts. */
const JUDGE_LAG = 50;

export const songCode = (seed: number) => (seed >>> 0).toString(36).toUpperCase();
export const seedOfCode = (code: string): number | null => {
  const n = parseInt(code.trim().toLowerCase(), 36);
  return Number.isFinite(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
};
const fmtLen = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtScore = (n: number) => n.toLocaleString('en-US');

type State = 'menu' | 'play' | 'paused' | 'countdown' | 'done' | 'calib';

interface Ptr {
  lane: number;
  t: number;
  x: number;
  y: number;
  perf: number;
  flicked: boolean;
}

export class Game {
  seed = 1;
  level: Level = 0;
  daily: string | null = null;
  song: Song = songFor(1);
  chart: Chart = chartFor(1, 0);
  judge = new Judge(this.chart);
  events: InputEv[] = [];
  state: State = 'menu';
  result: Result | null = null;
  /** Feed a bot's taps (screenshots, demos): `__game.auto = true`, or a number for a timing bias in ms. */
  auto: boolean | number = false;
  readonly audio = new Audio();
  private canvas = $('board') as HTMLCanvasElement;
  private g = this.canvas.getContext('2d')!;
  private L: Layout = layout(1, 1);
  private startAt = 0;
  private startPerf = 0;
  /** The audio clock has run since this song started (only a context that never starts falls back to silence). */
  private audioSeen = false;
  private pausePerf = 0;
  private countEnd = 0;
  private endMs = 0;
  private ptrs = new Map<number, Ptr>();
  private laneCount = [0, 0, 0, 0];
  private bursts: Burst[] = [];
  private popups: Popup[] = [];
  private sparks: Spark[] = [];
  private cloth: [number, Judgment][] = [];
  private sum = 0;
  private judged = 0;
  private time = 0;
  private last = 0;
  private botQ: InputEv[] = [];
  /** Where each note's stitch sits in the live cloth (a dropped hold turns it into a miss). */
  private clothAt = new Map<number, number>();
  private lastEnd = 0;
  private fading = false;
  private botI = 0;
  private fx = !reducedFx();
  private calib: { start: number; interval: number; total: number; errs: number[]; tapT: number; scheduled: boolean; asked: number; ring: number } | null = null;
  /** The song time the last frame drew (for checks). */
  shownNow = 0;

  constructor() {
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    const stage = $('stage');
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', (e) => this.up(e));
    stage.addEventListener('pointercancel', (e) => this.up(e));
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'play' || this.state === 'countdown')) this.pause();
    });
    $('menuBtn').onclick = () => {
      if (this.state === 'play' || this.state === 'countdown') this.pause();
      else if (this.state === 'calib') this.calibCancel();
      else this.showMenu();
    };
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ songs

  get offset(): number {
    const p = loadProfile();
    if (p.offset !== null) return clampOffset(p.offset);
    const r = this.audio.reportedLatency();
    return r !== null ? clampOffset(r + 25) : 70;
  }

  private get scroll(): number {
    return LEVELS[this.level].scrollMs * SPEEDS[loadProfile().speed]?.k;
  }

  /** Choose a song (and level) and show its menu. */
  load(seed: number, level: Level = this.level, daily: string | null = this.daily): void {
    this.audio.stop();
    this.seed = seed >>> 0;
    this.level = level;
    this.daily = daily;
    this.song = songFor(this.seed);
    this.chart = chartFor(this.seed, level);
    if (!daily) {
      const p = loadProfile();
      if (p.song !== this.seed) {
        p.song = this.seed;
        saveProfile(p);
      }
    }
    this.judge = new Judge(this.chart);
    this.events = [];
    this.result = null;
    this.state = 'menu';
    this.resetFx();
    this.hud();
  }

  newSong(): void {
    if (this.daily) leaveDaily();
    this.load(randomSeed(), this.level, null);
    this.showMenu();
  }

  playDaily(): void {
    const day = todayKey();
    this.load(dailySeed('loomsong', day), this.level, day);
  }

  private setLevel(lv: Level): void {
    const p = loadProfile();
    p.level = lv;
    saveProfile(p);
    this.load(this.seed, lv);
  }

  private resetFx(): void {
    this.bursts = [];
    this.popups = [];
    this.sparks = [];
    this.cloth = [];
    this.clothAt.clear();
    this.fading = false;
    this.ptrs.clear();
    this.laneCount = [0, 0, 0, 0];
    this.sum = 0;
    this.judged = 0;
  }

  // ------------------------------------------------------------ play

  /** Start the song (from a tap, so audio may start). */
  play(): void {
    closeOverlay();
    const p = loadProfile();
    if (!soundOn() && !p.silentOk) return this.needSound();
    this.audio.silent = !soundOn();
    const ok = this.audio.ensure();
    if (!ok && !this.audio.silent) {
      this.audio.silent = true;
      say('No Web Audio here: playing silently');
    }
    this.load(this.seed, this.level, this.daily);
    const lead = Math.max(2.4, this.scroll / 1000 + 1.2);
    this.startAt = this.audio.now() + lead;
    this.startPerf = performance.now();
    this.audioSeen = false;
    this.audio.play(this.song, this.startAt);
    // The song plays out: its last bar rings and fades before the results.
    this.lastEnd = this.chart.notes.reduce((m, n) => Math.max(m, n.end), 0);
    this.endMs = Math.max(this.lastEnd + 2200, this.song.steps * this.song.stepMs + 1800);
    this.botQ = this.auto !== false ? botEvents(this.chart, { jitter: 22, seed: this.seed, skip: 0.02, bias: typeof this.auto === 'number' ? this.auto : 0 }) : [];
    this.botI = 0;
    this.state = 'play';
    this.hud();
  }

  /** Song time (ms, calibrated) at a performance.now() timestamp. */
  private songAt(perf: number): number {
    return (this.audio.at(perf) - this.startAt) * 1000 - this.offset;
  }

  private pause(): void {
    if (this.state !== 'play' && this.state !== 'countdown') return;
    // Lift every finger: a hold that was down is let go now.
    const t = Math.round(this.songAt(performance.now()));
    for (let l = 0; l < 4; l++) if (this.laneCount[l] > 0) this.input({ k: 'u', lane: l, t });
    this.ptrs.clear();
    this.laneCount = [0, 0, 0, 0];
    if (this.state === 'play') {
      this.audio.pause();
      this.pausePerf = performance.now();
    }
    this.state = 'paused';
    this.showPause();
  }

  private resume(): void {
    closeOverlay();
    this.state = 'countdown';
    this.countEnd = performance.now() + 2400;
  }

  private showPause(): void {
    showCard(
      `<h2>Paused</h2><p class="meta2">${this.song.name} · ${LEVELS[this.level].name}</p>`,
      [
        { label: 'Resume', primary: true, onClick: () => this.resume() },
        { label: 'Restart song', onClick: () => this.play() },
        { label: 'Quit to the song menu', onClick: () => this.quit() },
        { label: 'How to play', onClick: () => this.showHelp(false, () => this.showPause()) },
      ],
      false,
    );
  }

  private quit(): void {
    this.audio.stop();
    this.audio.resume();
    this.load(this.seed);
    this.showMenu();
  }

  private input(e: InputEv): void {
    this.events.push(e);
    this.judge.apply(e);
  }

  private down(e: PointerEvent): void {
    if (e.target instanceof HTMLButtonElement) return;
    if (this.state === 'calib') return this.calibTap(e);
    if (this.state !== 'play') return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // fine
    }
    const r = this.canvas.getBoundingClientRect();
    const lane = laneAt(this.L, e.clientX - r.left);
    const t = Math.round(this.songAt(e.timeStamp));
    this.ptrs.set(e.pointerId, { lane, t, x: e.clientX, y: e.clientY, perf: e.timeStamp, flicked: false });
    this.laneCount[lane]++;
    this.input({ k: 'd', lane, t });
  }

  private move(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p || p.flicked || this.state !== 'play') return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= FLICK_PX && e.timeStamp - p.perf <= FLICK_MAX) {
      p.flicked = true;
      this.input({ k: 'f', lane: p.lane, t: p.t });
    }
  }

  private up(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (this.state !== 'play') return;
    this.laneCount[p.lane] = Math.max(0, this.laneCount[p.lane] - 1);
    if (this.laneCount[p.lane] === 0) this.input({ k: 'u', lane: p.lane, t: Math.round(this.songAt(e.timeStamp)) });
  }

  // ------------------------------------------------------------ loop

  private resize(): void {
    const dpr = Math.min(3, devicePixelRatio || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.L = layout(w, h);
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    this.audio.sample();
    if (this.state === 'countdown' && performance.now() >= this.countEnd) {
      if (this.audio.silent || !this.audio.ctx) this.startAt += (performance.now() - this.pausePerf) / 1000;
      else this.audio.resume();
      this.state = 'play';
    }
    if (this.state === 'play') this.tick();
    if (this.state === 'calib') this.calibTick();
    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    this.bursts = this.bursts.filter((b) => this.time - b.t < 0.4);
    this.popups = this.popups.filter((p) => this.time - p.t < 0.6);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private tick(): void {
    const a = this.audio;
    // The context never started (some browsers, headless): fall back to a silent clock.
    if (a.running) this.audioSeen = true;
    if (!a.silent && !this.audioSeen && a.ctx && a.ctx.state !== 'running' && performance.now() - this.startPerf > 1500) {
      a.silent = true;
      a.stop();
      this.startAt = performance.now() / 1000 + Math.max(2.4, this.scroll / 1000 + 1.2);
      this.startPerf = performance.now();
      say('Sound didn’t start: playing silently');
    }
    a.pump();
    const now = this.songAt(performance.now());
    if (this.botQ.length) {
      while (this.botI < this.botQ.length && this.botQ[this.botI].t <= now) {
        const e = this.botQ[this.botI++];
        if (e.k === 'd') this.laneCount[e.lane]++;
        if (e.k === 'u') this.laneCount[e.lane] = Math.max(0, this.laneCount[e.lane] - 1);
        this.input(e);
      }
    }
    this.judge.advance(now - JUDGE_LAG);
    const hits = this.judge.drain();
    for (const h of hits) this.effect(h);
    if (hits.length) this.hud();
    if (!this.fading && now > this.endMs - 1600) {
      this.fading = true;
      a.fadeOut(1.5);
    }
    if (now > this.endMs) this.finish();
  }

  private effect(h: Hit): void {
    const lane = h.note.lane;
    if (h.tail) {
      // A hold's end: kept is a small burst; let go too early turns the whole note into a miss.
      this.bursts.push({ lane, j: h.j, t: this.time, tail: true });
      if (h.j !== 2) return;
      const head = this.judge.head[h.note.id];
      const at = this.clothAt.get(h.note.id);
      if (at !== undefined) this.cloth[at] = [lane, 2];
      if (head === 0 || head === 1) this.sum -= VALUE[head];
      this.popups = this.popups.filter((p) => p.lane !== lane);
      this.popups.push({ lane, text: 'DROPPED', sub: 'held too short', color: MISS_COLOR, t: this.time, strike: true });
      return;
    }
    this.clothAt.set(h.note.id, this.cloth.length);
    this.cloth.push([lane, h.j]);
    this.sum += VALUE[h.j];
    this.judged++;
    this.bursts.push({ lane, j: h.j, t: this.time, tail: false });
    const pw = h.note.kind === 'flick' ? 60 : PERFECT;
    const sub = h.j === 1 && h.dt !== null ? (h.dt < -pw ? 'early' : h.dt > pw ? 'late' : '') : h.j === 2 && h.dt !== null ? (h.dt < 0 ? 'too early' : 'too late') : '';
    const [text, color] = h.j === 0 ? ['PERFECT', '#fff3c4'] : h.j === 1 ? ['GOOD', '#8ee6c8'] : ['MISS', MISS_COLOR];
    this.popups = this.popups.filter((p) => p.lane !== lane);
    this.popups.push({ lane, text, sub, color, t: this.time, strike: h.j === 2 });
    if (this.fx && h.j === 0) {
      const x = laneX(this.L, lane);
      for (let i = 0; i < 7; i++) {
        const ang = -Math.PI * (0.15 + 0.7 * Math.random());
        const sp = 120 + Math.random() * 160;
        this.sparks.push({ x, y: this.L.hitY, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.35 + Math.random() * 0.2, color: LANE_COLORS[lane] });
      }
    }
    if (h.j === 2 && h.note.kind !== 'tap' && h.dt === null) navigator.vibrate?.(12);
  }

  private render(): void {
    const L = this.L;
    const dpr = this.canvas.width / Math.max(1, L.w);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.state === 'calib' && this.calib) {
      const c = this.calib;
      const now = this.audio.now();
      const n = c.scheduled ? Math.floor((now - c.start) / c.interval) + 1 : 0;
      // The guide ring flashes when the click should be heard (sent time + the current timing guess).
      const heard = now - this.offset / 1000 - c.start;
      const k = Math.floor(heard / c.interval);
      const ring = c.scheduled && c.ring && k >= 0 && k < c.total ? heard - k * c.interval : 9;
      drawCalib(this.g, {
        L, time: this.time, errs: c.errs, clicks: Math.max(0, Math.min(n, c.total)), total: c.total, pulse: this.time - c.tapT, ring,
        msg: !c.scheduled ? 'Starting the click…' : n <= 3 ? 'Listen first…' : c.ring ? 'Tap with the sound:\nthe ring is only a guide' : 'Tap anywhere, on each click',
      });
      return;
    }
    const playing = this.state === 'play' || this.state === 'paused' || this.state === 'countdown';
    const now = playing ? this.songAt(this.state === 'play' ? performance.now() : this.pausePerf || performance.now()) : -this.scroll;
    this.shownNow = now;
    const first = this.chart.notes[0]?.t ?? 0;
    const held = this.laneCount.map((c) => c > 0);
    const intro = playing && now < Math.min(first - 400, 1500);
    const outro = this.state === 'play' && this.lastEnd > 0 && now > this.lastEnd + 350;
    draw(this.g, {
      L, song: this.song, chart: this.chart, judge: this.judge, now, scroll: this.scroll, held, outro: outro ? Math.min(1, (now - this.lastEnd - 350) / 600) : 0,
      time: this.time, bursts: this.bursts, popups: this.popups, sparks: this.sparks, cloth: this.cloth,
      title: intro || outro ? this.song.name : null,
      sub: intro ? `${LEVELS[this.level].name} · ${this.song.bpm} BPM${this.audio.silent ? ' · silent' : ''}` : outro ? (this.judge.combo === this.judged && this.judged > 0 ? 'Full combo! Woven…' : 'Woven…') : null,
      countdown: this.state === 'countdown' ? Math.max(1, Math.ceil((this.countEnd - performance.now()) / 800)) : null,
      hint: playing && loadProfile().plays < 2 && now < first + 5000,
      fx: this.fx,
    });
  }

  // ------------------------------------------------------------ HUD

  private hud(): void {
    const total = this.chart.objects || 1;
    const live = this.state === 'menu' ? 0 : Math.round((900_000 * this.sum) / total + (100_000 * this.judge.maxCombo) / total);
    $('score').textContent = fmtScore(this.result ? this.result.score : live);
    $('acc').textContent = this.judged ? `${((100 * this.sum) / this.judged).toFixed(1)}%` : '—';
    const c = this.state === 'play' || this.state === 'paused' || this.state === 'countdown' ? this.judge.combo : 0;
    const ce = $('combo');
    ce.textContent = c ? String(c) : '—';
    ce.classList.toggle('hot', c >= 20);
    $('songName').textContent = this.song.name;
    $('songMeta').textContent = `${this.daily ? 'Daily · ' : ''}${LEVELS[this.level].name}`;
  }

  // ------------------------------------------------------------ results

  private finish(): void {
    this.state = 'done';
    this.audio.stop();
    const r = judgePlay(this.chart, this.events);
    this.result = r;
    const p = loadProfile();
    const bests = loadBests();
    const key = `${this.seed}:${this.level}`;
    const prev = bests[key];
    const newBest = !prev || r.score > prev.score;
    if (newBest) bests[key] = { score: r.score, grade: r.grade, acc: Math.round(r.acc * 10) / 10 };
    // Keep the table small: the 120 most recent keys.
    const keys = Object.keys(bests);
    if (keys.length > 120) for (const k of keys.slice(0, keys.length - 120)) delete bests[k];
    store.save('bests', bests);
    p.plays++;
    if (r.score > p.best) {
      p.best = r.score;
      p.bestGrade = r.grade;
    }
    p.recent = [this.seed, ...p.recent.filter((s) => s !== this.seed)].slice(0, 6);
    // Did the last "Shift timing" change the error? (It moves the sound, so it can't if you tap by sight.)
    const shifted = p.shift;
    p.shift = null;
    saveProfile(p);
    this.shiftNote = shifted && r.hits >= 20 ? (Math.abs(r.meanDt - shifted.mean) < 12 ? 'same' : 'changed') : null;
    store.save('last', { v: RULES_VERSION, seed: this.seed, lv: this.level, off: Math.round(this.offset), a: encodeEvents(this.events) });
    let dailyLine = '';
    if (this.daily) {
      const { best, improved } = recordDaily(store, r.score, `${r.grade} ${Math.round(r.score / 1000)}k`, this.daily);
      dailyLine = `<p class="meta2">${improved ? 'Today’s best!' : `Today’s best: <b>${best.label}</b>`} · ${best.plays} tr${best.plays === 1 ? 'y' : 'ies'}</p>`;
    }
    this.hud();
    this.showResults(r, prev && !newBest ? prev.score : null, newBest && !!prev, dailyLine);
  }

  /** What the last "Shift timing" did to the error, for this results card. */
  private shiftNote: 'same' | 'changed' | null = null;

  /** The timing box under the stats: the average error, and a shift only when it could help. */
  private timingBox(r: Result, recorded: boolean): string {
    if (recorded || r.hits < 20) return '';
    const ms = Math.round(Math.abs(r.meanDt));
    const dir = r.meanDt > 0 ? 'late' : 'early';
    const target = clampOffset(this.offset + r.meanDt);
    const avg = `On average you tapped <b class="nw">${ms} ms ${dir}</b>.`;
    if (this.shiftNote === 'same' && ms >= 15)
      return `<div class="timing">${avg} The last shift didn’t change that, so you’re probably tapping by sight, which is fine: the beads and the judging always line up. No more shifts suggested.</div>`;
    if (ms < 15) return `<div class="timing">${avg} Right on.</div>`;
    if (target === Math.round(this.offset)) return `<div class="timing">${avg} Timing is already at its ${target > 0 ? 'latest' : 'earliest'} setting.</div>`;
    return `<div class="timing">${avg} If you play by ear, <button class="link" id="fixTiming">shift the sound <span class="nw">${r.meanDt > 0 ? '+' : '−'}${Math.abs(target - Math.round(this.offset))} ms</span></button> to line it up with the beads. Tapping by sight? Then a shift won’t change this.</div>`;
  }

  showResults(r: Result, prevBest: number | null, improved: boolean, extra = '', recorded = false): void {
    const tags = [r.allPerfect ? 'ALL PERFECT' : r.fullCombo ? 'FULL COMBO' : '', improved ? 'NEW BEST' : ''].filter(Boolean);
    showCard(
      `<div class="grade g${r.grade}"><span>${r.grade}</span><b>${gradeName(r.grade)}</b></div>
       ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
       <p class="big">${fmtScore(r.score)}</p>
       <p class="meta2">${this.song.name} · ${LEVELS[this.level].name}${prevBest !== null ? ` · best ${fmtScore(prevBest)}` : ''}</p>
       <div class="stats">
         <span><b>${r.acc.toFixed(1)}%</b>accuracy</span>
         <span><b>${r.maxCombo}</b>max combo of ${r.objects}</span>
         <span class="j0"><b>${r.perfect}</b>perfect</span>
         <span class="j1"><b>${r.good}</b>good</span>
         <span class="j2"><b>${r.miss}</b>miss</span>
         <span><b>${r.early}·${r.late}</b>early·late</span>
       </div>
       <div class="cloth"></div>
       ${this.timingBox(r, recorded)}
       ${extra}
       <div class="chips lv">${LEVELS.map((L, i) => `<button data-lv="${i}" class="${i === this.level ? 'on' : ''}">${L.name}</button>`).join('')}</div>
       <div class="row3"><button class="secondary" id="rNew">New song</button><button class="secondary" id="rMenu">Song menu</button><button class="secondary" id="rHub">All games</button></div>`,
      [{ label: recorded ? 'Play this song' : 'Play again', primary: true, onClick: () => this.play() }],
      false,
    );
    $('rNew').onclick = () => this.newSong();
    $('rMenu').onclick = () => this.showMenu();
    $('rHub').onclick = () => (location.href = '../');
    const cv = tapestry(r.cloth, r.objects > 300 ? 36 : r.objects > 160 ? 30 : 24);
    cv.setAttribute('aria-label', 'Your tapestry for this song');
    document.querySelector('#overlay .cloth')?.appendChild(cv);
    const fix = document.getElementById('fixTiming');
    if (fix)
      fix.onclick = () => {
        const p = loadProfile();
        p.offset = clampOffset(this.offset + r.meanDt);
        p.shift = { mean: r.meanDt };
        saveProfile(p);
        // Same box, same size: only the words change.
        const box = fix.parentElement!;
        box.style.height = `${box.offsetHeight}px`;
        box.innerHTML = `Sound shifted: timing is now <b class="nw">${p.offset} ms</b>. The beads and judging stay put; play again and see if your error shrinks.`;
      };
    this.wireLevels(() => this.play());
    if (!recorded) {
      const o = $('overlay');
      o.style.pointerEvents = 'none';
      setTimeout(() => (o.style.pointerEvents = ''), 600);
    }
  }

  /** Show the result of a recorded play (a bug report or shared link). */
  showRecord(seed: number, level: Level, events: InputEv[]): void {
    this.load(seed, level, null);
    this.events = events;
    const r = judgePlay(this.chart, events);
    this.result = r;
    this.hud();
    this.showResults(r, null, false, `<p class="meta2">A recorded play, rescored from its taps (rules v${RULES_VERSION}).</p>`, true);
  }

  private wireLevels(after: () => void): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>('#overlay [data-lv]'))
      b.onclick = () => {
        this.setLevel(Number(b.dataset.lv) as Level);
        after();
      };
  }

  // ------------------------------------------------------------ menu

  showMenu(): void {
    if (this.state === 'play') return this.pause();
    if (this.state !== 'menu' && this.state !== 'done') this.load(this.seed);
    this.state = this.state === 'done' ? 'done' : 'menu';
    const p = loadProfile();
    const bests = loadBests();
    const s = this.song;
    const best = bests[`${this.seed}:${this.level}`];
    const others = LEVELS.map((L, i) => [L, bests[`${this.seed}:${i}`]] as const).filter(([, b], i) => b && i !== this.level);
    const recent = p.recent.filter((x) => x !== this.seed).slice(0, 4);
    const daily = this.daily ? loadDaily(store, this.daily) : null;
    const stats = chartStats(this.chart, s);
    showCard(
      `<h2>${this.daily ? `Daily song <span class="day">${prettyDay(this.daily)}</span>` : 'Loomsong'}</h2>
       <div class="songcard">
         <div class="sname">${s.name}</div>
         <div class="smeta">${keyName(s)} · ${s.bpm} BPM · ${fmtLen(s.durationMs)} · ${stats.notes} notes</div>
         <div class="sbest">${best ? `Best on ${LEVELS[this.level].name}: <b>${best.grade} ${fmtScore(best.score)}</b> (${best.acc}%)` : `Not played on ${LEVELS[this.level].name} yet`}${others.length ? ` · ${others.map(([L, b]) => `${L.name} ${b!.grade}`).join(', ')}` : ''}</div>
         ${daily ? `<div class="sbest">Today’s best: <b>${daily.label}</b> (${daily.plays} tr${daily.plays === 1 ? 'y' : 'ies'})</div>` : ''}
       </div>
       <div class="chips lv">${LEVELS.map((L, i) => `<button data-lv="${i}" class="${i === this.level ? 'on' : ''}">${L.name}</button>`).join('')}</div>
       <div class="row2">
         <button class="secondary" id="mNew">New song</button>
         <button class="secondary" id="mDaily">${this.daily ? 'Leave the daily' : 'Daily song'}</button>
       </div>
       ${recent.length ? `<div class="recent"><span>Recent</span>${recent.map((r) => `<button data-seed="${r}">${songFor(r).name}</button>`).join('')}</div>` : ''}
       <div class="opts">
         <div class="opt"><span>Note speed</span><div class="chips sp">${SPEEDS.map((x, i) => `<button data-sp="${i}" class="${i === p.speed ? 'on' : ''}">${x.name}</button>`).join('')}</div></div>
         <div class="opt"><span>Timing <b>${Math.round(this.offset)} ms</b>${p.offset === null ? ' (a guess: calibrate for a real number)' : ''}</span><div class="chips"><button id="mMinus" aria-label="Earlier">−5</button><button id="mPlus" aria-label="Later">+5</button><button id="mCal" class="${p.offset === null && !p.calibDismissed ? 'badge' : ''}">Calibrate</button></div></div>
       </div>
       <p class="code">Song code <b>${songCode(this.seed)}</b> · <button class="link" id="mShare">copy link</button></p>
       <div class="row3"><button class="secondary" id="mHelp">How to play</button><button class="secondary" id="mBug">Bug report</button><button class="secondary" id="mHub">All games</button></div>`,
      [{ label: `Play ${LEVELS[this.level].name}`, primary: true, onClick: () => this.play() }],
      false,
    );
    this.wireLevels(() => this.showMenu());
    $('mHelp').onclick = () => this.showHelp(false, () => this.showMenu());
    $('mBug').onclick = () => void copyInto($('mBug'), this.reportText());
    $('mHub').onclick = () => (location.href = '../');
    $('mNew').onclick = () => this.newSong();
    $('mDaily').onclick = () => {
      if (this.daily) this.newSong();
      else {
        this.playDaily();
        this.showMenu();
      }
    };
    $('mCal').onclick = () => this.calibIntro();
    const nudge = (d: number) => {
      const q = loadProfile();
      q.offset = clampOffset(this.offset + d);
      saveProfile(q);
      this.showMenu();
    };
    $('mMinus').onclick = () => nudge(-5);
    $('mPlus').onclick = () => nudge(5);
    $('mShare').onclick = () => void copyInto($('mShare'), `${location.origin}${location.pathname}?song=${songCode(this.seed)}`);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#overlay [data-seed]'))
      b.onclick = () => {
        if (this.daily) leaveDaily();
        this.load(Number(b.dataset.seed), this.level, null);
        this.showMenu();
      };
    for (const b of document.querySelectorAll<HTMLButtonElement>('#overlay [data-sp]'))
      b.onclick = () => {
        const q = loadProfile();
        q.speed = Number(b.dataset.sp);
        saveProfile(q);
        this.showMenu();
      };
  }

  /** The first card: sound check, then help and calibration on a first visit, else the song menu. */
  welcome(): void {
    const p = loadProfile();
    if (!soundOn() && !p.silentOk) this.needSound();
    else if (!p.tips.includes('help')) this.showHelp(true);
    else if (p.offset === null && !p.calibDismissed) this.calibPrompt();
    else this.showMenu();
  }

  /** Sound is off on the hub: this game needs it. */
  needSound(): void {
    showCard(
      `<h2>Loomsong needs sound</h2>
       <p>It’s a rhythm game: the notes follow the music, so you play by ear. Sound is switched off in the Game Lab settings.</p>`,
      [
        {
          label: 'Turn sound on',
          primary: true,
          onClick: () => {
            saveSettings({ ...loadSettings(), sound: true });
            this.audio.silent = false;
            this.audio.ensure();
            this.welcome();
          },
        },
        {
          label: 'Play without sound',
          onClick: () => {
            const p = loadProfile();
            p.silentOk = true;
            saveProfile(p);
            this.showMenu();
          },
        },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
      false,
    );
  }

  // ------------------------------------------------------------ help & calibration

  showHelp(first = false, back: () => void = () => this.showMenu()): void {
    const p = loadProfile();
    if (!p.tips.includes('help')) {
      p.tips.push('help');
      saveProfile(p);
    }
    showCard(
      `<h2>Loomsong</h2>
       <svg class="diagram" viewBox="0 0 300 150" aria-hidden="true">
         <rect width="300" height="150" fill="#140e1d"/>
         ${[0, 1, 2, 3].map((l) => `<line x1="${45 + l * 70}" y1="0" x2="${45 + l * 70}" y2="112" stroke="${LANE_COLORS[l]}" stroke-opacity="0.4" stroke-width="2"/>`).join('')}
         <rect x="28" y="62" width="34" height="14" rx="7" fill="${LANE_COLORS[0]}"/>
         <rect x="104" y="14" width="14" height="70" rx="7" fill="${LANE_COLORS[1]}" fill-opacity="0.75"/><rect x="98" y="72" width="26" height="14" rx="7" fill="${LANE_COLORS[1]}"/>
         <line x1="185" y1="40" x2="255" y2="40" stroke="#fff7ea" stroke-width="2.5" stroke-dasharray="5 4"/>
         <rect x="168" y="33" width="34" height="14" rx="7" fill="${LANE_COLORS[2]}"/><rect x="238" y="33" width="34" height="14" rx="7" fill="${LANE_COLORS[3]}"/>
         <rect x="238" y="80" width="34" height="18" rx="9" fill="#fff7ea" stroke="${LANE_COLORS[3]}" stroke-width="2.5"/>
         <path d="M248 92l7-6 7 6" fill="none" stroke="${LANE_COLORS[3]}" stroke-width="2.5" stroke-linecap="round"/>
         <rect x="10" y="108" width="280" height="7" rx="3.5" fill="#c89b6d"/>
         ${[0, 1, 2, 3].map((l) => `<circle cx="${45 + l * 70}" cy="111" r="13" fill="none" stroke="${LANE_COLORS[l]}" stroke-width="2"/>`).join('')}
         <g fill="#e9e0f4" font-size="11" font-family="system-ui" text-anchor="middle">
           <text x="45" y="56">tap</text><text x="111" y="10">hold</text><text x="220" y="27">both</text><text x="255" y="74">flick</text>
           <text x="150" y="138">tap the lane as the bead meets the bar</text>
         </g>
       </svg>
       <ul>
         <li>Every song is <b>made up from its seed</b>: drums, bass, chords and a tune. The beads follow its kicks, snares and melody, so <b>play by ear</b>.</li>
         <li><b>Tap</b> anywhere in a bead’s column as it meets the bar. <b>Yarn</b>: keep holding until it ends. <b>Chevron</b> beads: touch and <b>flick</b> (a quick swipe, any way). Beads joined by a <b>dashed thread</b>: tap both together.</li>
         <li><b>Perfect</b> within ${PERFECT} ms, <b>Good</b> within ${GOOD} ms; later or earlier is a miss. Stray taps cost nothing.</li>
         <li>Phones delay their sound by different amounts: <b>calibrate</b> once (song menu → Timing), or use “Shift timing” after a song.</li>
         <li>Each hit is woven into your cloth. Grades: <b>S Silk</b>, A Linen, B Cotton, C Wool, D Frayed.</li>
       </ul>`,
      [{ label: first ? 'Next' : 'Back', primary: true, onClick: () => (first ? this.calibPrompt() : back()) }],
      false,
    );
  }

  /** Offered on every visit until you calibrate or say "don't ask again" (the menu's Calibrate keeps a dot meanwhile). */
  calibPrompt(): void {
    const p = loadProfile();
    if (p.offset !== null) return this.showMenu();
    showCard(
      `<h2>Set your timing</h2>
       <p>Phones play sound late, by anything from 20 to 250 ms, and Loomsong has to know how late yours is. You’ll hear a click: tap along with it about 20 times (15 seconds).</p>
       <p class="meta2">Use the speaker or wired headphones you’ll play with. Bluetooth adds a lot of delay.</p>`,
      [
        { label: 'Calibrate now', primary: true, onClick: () => this.calibIntro() },
        { label: 'Not now', onClick: () => this.showMenu() },
        {
          label: 'Don’t ask again',
          onClick: () => {
            const q = loadProfile();
            q.calibDismissed = true;
            saveProfile(q);
            this.showMenu();
          },
        },
      ],
      false,
    );
  }

  /** Before the clicks: how it works, and the guide ring on or off. */
  calibIntro(): void {
    const p = loadProfile();
    showCard(
      `<h2>Calibrate timing</h2>
       <p>You’ll hear 22 clicks. Listen to the first three, then <b>tap anywhere along with the sound</b> of each click.</p>
       <div class="opt"><span>Guide ring (flashes on each click; tap with the sound, not the ring)</span><div class="chips"><button data-ring="1" class="${p.calibRing ? 'on' : ''}">Ring on</button><button data-ring="0" class="${p.calibRing ? '' : 'on'}">Ring off</button></div></div>`,
      [
        { label: 'Start', primary: true, onClick: () => this.calibrate() },
        { label: 'Back', onClick: () => this.showMenu() },
      ],
      false,
    );
    for (const b of document.querySelectorAll<HTMLButtonElement>('#overlay [data-ring]'))
      b.onclick = () => {
        const q = loadProfile();
        q.calibRing = b.dataset.ring === '1';
        saveProfile(q);
        this.calibIntro();
      };
  }

  calibrate(): void {
    closeOverlay();
    if (!soundOn()) return this.needSound();
    this.audio.silent = false;
    if (!this.audio.ensure()) {
      say('Calibration needs Web Audio');
      return this.showMenu();
    }
    this.audio.stop();
    this.state = 'calib';
    this.calib = { start: 0, interval: 0.6, total: 22, errs: [], tapT: -9, scheduled: false, asked: performance.now(), ring: loadProfile().calibRing ? 1 : 0 };
  }

  private calibCancel(): void {
    this.calib = null;
    this.state = 'menu';
    this.showMenu();
  }

  private calibTick(): void {
    const c = this.calib!;
    const a = this.audio;
    if (!c.scheduled) {
      if (!a.running) {
        if (performance.now() - c.asked > 2500) {
          this.calib = null;
          this.state = 'menu';
          this.guardOverlay();
          showCard(`<h2>No sound yet</h2><p>The click didn’t start: the phone hasn’t let the page play sound. Check the volume, tap Try again, and keep the screen on.</p>`, [
            { label: 'Try again', primary: true, onClick: () => this.calibrate() },
            { label: 'Back', onClick: () => this.showMenu() },
          ], false);
        }
        return;
      }
      c.start = a.now() + 0.8;
      for (let i = 0; i < c.total; i++) a.click(c.start + i * c.interval, i % 4 === 0);
      c.scheduled = true;
      return;
    }
    if (a.now() > c.start + c.total * c.interval + 0.9) this.calibDone();
  }

  private calibTap(e: PointerEvent): void {
    e.preventDefault();
    const c = this.calib;
    if (!c || !c.scheduled) return;
    c.tapT = this.time;
    const raw = (this.audio.at(e.timeStamp) - c.start) * 1000;
    const iv = c.interval * 1000;
    const k = Math.round(raw / iv);
    const err = raw - k * iv;
    // The first three clicks are for listening; taps far from any click are ignored.
    if (k >= 3 && k < c.total && Math.abs(err) <= 280) c.errs.push(err);
  }

  private calibDone(): void {
    const c = this.calib!;
    this.calib = null;
    this.state = 'menu';
    const errs = [...c.errs].sort((a, b) => a - b);
    // Taps still landing as the card appears must not press its buttons.
    this.guardOverlay();
    if (errs.length < 8) {
      showCard(`<h2>Not enough taps</h2><p>Only ${errs.length} of your taps landed near a click (at least 8 are needed). Tap along with each click you hear.</p>`, [
        { label: 'Try again', primary: true, onClick: () => this.calibrate() },
        { label: 'Back', onClick: () => this.showMenu() },
      ], false);
      return;
    }
    const med = errs[Math.floor(errs.length / 2)];
    const q1 = errs[Math.floor(errs.length / 4)], q3 = errs[Math.floor((errs.length * 3) / 4)];
    const spread = Math.round((q3 - q1) / 2);
    const off = Math.round(med);
    const keep = (v: number) => {
      const p = loadProfile();
      p.offset = clampOffset(v);
      saveProfile(p);
      this.showMenu();
    };
    const summary = `<div class="calres"><span><b>${off} ms</b>your delay</span><span><b>±${spread} ms</b>spread</span><span><b>${errs.length}</b>taps used</span></div>`;
    if (off < OFFSET_MIN || off > OFFSET_MAX || spread > 60) {
      const why = off < OFFSET_MIN
        ? `Your taps came <b>before</b> the clicks were even played. Phones play sound late, never early, so you were probably tapping ahead of the sound (or to the ring).`
        : off > OFFSET_MAX
          ? `That is a very long delay. Bluetooth headphones can do that; wired ones or the speaker are much quicker.`
          : `Your taps were spread out a lot, so this number isn’t reliable.`;
      showCard(
        `<h2>That doesn’t look right</h2>${summary}<p>${why} Try again and tap with the sound of each click.</p>`,
        [
          { label: 'Try again', primary: true, onClick: () => this.calibIntro() },
          { label: `Keep ${clampOffset(off)} ms anyway`, onClick: () => keep(off) },
          { label: 'Cancel', onClick: () => this.showMenu() },
        ],
        false,
      );
      return;
    }
    this.audio.chime();
    showCard(
      `<h2>Your timing</h2>${summary}
       <p>Your taps landed ${off} ms after each click was sent. Loomsong will take that off every tap, and line the beads up with the sound.</p>
       ${spread > 35 ? '<p class="meta2">A fairly wide spread: another try may give a steadier number.</p>' : ''}`,
      [
        { label: `Keep ${off} ms`, primary: true, onClick: () => keep(off) },
        { label: 'Try again', onClick: () => this.calibIntro() },
        { label: 'Cancel', onClick: () => this.showMenu() },
      ],
      false,
    );
  }

  /** Ignore taps on a card that has just appeared under a busy thumb. */
  private guardOverlay(ms = 800): void {
    const o = $('overlay');
    o.style.pointerEvents = 'none';
    setTimeout(() => (o.style.pointerEvents = ''), ms);
  }

  private reportText(): string {
    const last = store.load<{ v: number; seed: number; lv: number; off: number; a: string } | null>('last', null);
    return last ? `LOOMSONG v${last.v} seed=${last.seed} lv=${last.lv} off=${last.off} a=${last.a}` : `LOOMSONG v${RULES_VERSION} seed=${this.seed} lv=${this.level} (no play yet)`;
  }
}

