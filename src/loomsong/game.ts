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
import { draw, drawCalib, laneAt, laneX, layout, tapestry, LANE_COLORS, type Burst, type Layout, type Popup, type Spark } from './render/draw';

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
}
export const loadProfile = (): Profile => ({ plays: 0, best: 0, bestGrade: null, level: 0, speed: 1, offset: null, tips: [], recent: [], silentOk: false, ...store.load<Partial<Profile>>('profile', {}) });
const saveProfile = (p: Profile) => store.save('profile', p);
type Bests = Record<string, { score: number; grade: Grade; acc: number }>;
const loadBests = () => store.load<Bests>('bests', {});

export const SPEEDS = [
  { name: 'Slow', k: 1.3 },
  { name: 'Normal', k: 1 },
  { name: 'Fast', k: 0.78 },
];
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
  /** Feed a bot's taps (screenshots, demos): `__game.auto = true`. */
  auto = false;
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
  private comboT = 0;
  private sum = 0;
  private judged = 0;
  private time = 0;
  private last = 0;
  private botQ: InputEv[] = [];
  private botI = 0;
  private fx = !reducedFx();
  private calib: { start: number; interval: number; total: number; errs: number[]; tapT: number; scheduled: boolean } | null = null;
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
    $('menuBtn').onclick = () => (this.state === 'play' || this.state === 'countdown' ? this.pause() : this.state !== 'calib' && this.showMenu());
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ songs

  get offset(): number {
    const p = loadProfile();
    if (p.offset !== null) return p.offset;
    const r = this.audio.reportedLatency();
    return r !== null ? r + 25 : 70;
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
      toast('No Web Audio here: playing silently');
    }
    this.load(this.seed, this.level, this.daily);
    const lead = Math.max(2.4, this.scroll / 1000 + 1.2);
    this.startAt = this.audio.now() + lead;
    this.startPerf = performance.now();
    this.audioSeen = false;
    this.audio.play(this.song, this.startAt);
    const last = this.chart.notes[this.chart.notes.length - 1];
    this.endMs = Math.max(last ? last.end + 1500 : 0, this.song.steps * this.song.stepMs + 1200);
    this.botQ = this.auto ? botEvents(this.chart, { jitter: 22, seed: this.seed, skip: 0.02 }) : [];
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
      toast('Sound didn’t start: playing silently');
    }
    a.pump();
    const now = this.songAt(performance.now());
    if (this.auto) {
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
    if (now > this.endMs) this.finish();
  }

  private effect(h: Hit): void {
    const lane = h.note.lane;
    this.cloth.push([lane, h.j]);
    this.sum += VALUE[h.j];
    this.judged++;
    if (h.j !== 2) this.comboT = this.time;
    this.bursts.push({ lane, j: h.j, t: this.time, tail: h.tail });
    if (h.tail && h.j !== 2) return;
    const pw = h.note.kind === 'flick' ? 60 : PERFECT;
    const sub = h.j === 1 && h.dt !== null ? (h.dt < -pw ? 'early' : h.dt > pw ? 'late' : '') : h.j === 2 && h.dt !== null ? (h.dt < 0 ? 'too early' : 'too late') : h.tail ? 'let go' : '';
    const [text, color] = h.j === 0 ? ['PERFECT', '#fff3c4'] : h.j === 1 ? ['GOOD', '#8ee6c8'] : ['MISS', '#ff6b7a'];
    this.popups = this.popups.filter((p) => p.lane !== lane);
    this.popups.push({ lane, text, sub, color, t: this.time });
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
      drawCalib(this.g, {
        L, time: this.time, errs: c.errs, clicks: Math.max(0, n), total: c.total, pulse: this.time - c.tapT,
        msg: !c.scheduled ? 'Starting the click…' : n <= 3 ? 'Listen first…' : 'Tap anywhere, on each click',
      });
      return;
    }
    const playing = this.state === 'play' || this.state === 'paused' || this.state === 'countdown';
    const now = playing ? this.songAt(this.state === 'play' ? performance.now() : this.pausePerf || performance.now()) : -this.scroll;
    this.shownNow = now;
    const first = this.chart.notes[0]?.t ?? 0;
    const held = this.laneCount.map((c) => c > 0);
    const intro = playing && now < Math.min(first - 400, 1500);
    draw(this.g, {
      L, song: this.song, chart: this.chart, judge: this.judge, now, scroll: this.scroll, held, combo: this.state === 'countdown' ? 0 : this.judge.combo, comboT: this.comboT,
      time: this.time, bursts: this.bursts, popups: this.popups, sparks: this.sparks, cloth: this.cloth,
      title: intro ? this.song.name : null,
      sub: intro ? `${LEVELS[this.level].name} · ${this.song.bpm} BPM${this.audio.silent ? ' · silent' : ''}` : null,
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
    saveProfile(p);
    store.save('last', { v: RULES_VERSION, seed: this.seed, lv: this.level, off: Math.round(this.offset), a: encodeEvents(this.events) });
    let dailyLine = '';
    if (this.daily) {
      const { best, improved } = recordDaily(store, r.score, `${r.grade} ${Math.round(r.score / 1000)}k`, this.daily);
      dailyLine = `<p class="meta2">${improved ? 'Today’s best!' : `Today’s best: <b>${best.label}</b>`} · ${best.plays} tr${best.plays === 1 ? 'y' : 'ies'}</p>`;
    }
    this.hud();
    this.showResults(r, prev && !newBest ? prev.score : null, newBest && !!prev, dailyLine);
  }

  showResults(r: Result, prevBest: number | null, improved: boolean, extra = '', recorded = false): void {
    const tags = [r.allPerfect ? 'ALL PERFECT' : r.fullCombo ? 'FULL COMBO' : '', improved ? 'NEW BEST' : ''].filter(Boolean);
    const timing = r.hits >= 20 && Math.abs(r.meanDt) >= 15 && !recorded;
    const ms = Math.round(Math.abs(r.meanDt));
    showCard(
      `<div class="grade g${r.grade}"><span>${r.grade}</span><b>${gradeName(r.grade)}</b></div>
       ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
       <p class="big">${fmtScore(r.score)}</p>
       <p class="meta2">${this.song.name} · ${LEVELS[this.level].name}${prevBest !== null ? ` · best ${fmtScore(prevBest)}` : ''}</p>
       <div class="stats">
         <span><b>${r.acc.toFixed(1)}%</b>accuracy</span>
         <span><b>${r.maxCombo}</b>max combo / ${r.objects}</span>
         <span class="j0"><b>${r.perfect}</b>perfect</span>
         <span class="j1"><b>${r.good}</b>good</span>
         <span class="j2"><b>${r.miss}</b>miss</span>
         <span><b>${r.early}·${r.late}</b>early·late</span>
       </div>
       <div class="cloth"></div>
       ${timing ? `<p class="hint">You tapped <b>${ms} ms ${r.meanDt > 0 ? 'late' : 'early'}</b> on average. <button class="link" id="fixTiming">Shift timing ${r.meanDt > 0 ? '+' : '−'}${ms} ms</button></p>` : ''}
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
        p.offset = Math.round(this.offset + r.meanDt);
        saveProfile(p);
        fix.replaceWith(Object.assign(document.createElement('b'), { textContent: `Timing now ${p.offset} ms` }));
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
         <div class="opt"><span>Timing <b>${Math.round(this.offset)} ms</b>${p.offset === null ? ' (a guess)' : ''}</span><div class="chips"><button id="mMinus" aria-label="Earlier">−5</button><button id="mPlus" aria-label="Later">+5</button><button id="mCal">Calibrate</button></div></div>
       </div>
       <p class="code">Song code <b>${songCode(this.seed)}</b> · <button class="link" id="mShare">copy link</button></p>
       <div class="row3"><button class="secondary" id="mHelp">How to play</button><button class="secondary" id="mBug">Bug report</button><button class="secondary" id="mHub">All games</button></div>`,
      [{ label: `Play ${LEVELS[this.level].name}`, primary: true, onClick: () => this.play() }],
      false,
    );
    this.wireLevels(() => this.showMenu());
    $('mHelp').onclick = () => this.showHelp(false, () => this.showMenu());
    $('mBug').onclick = () => void this.copyReport();
    $('mHub').onclick = () => (location.href = '../');
    $('mNew').onclick = () => this.newSong();
    $('mDaily').onclick = () => {
      if (this.daily) this.newSong();
      else {
        this.playDaily();
        this.showMenu();
      }
    };
    $('mCal').onclick = () => this.calibrate();
    const nudge = (d: number) => {
      const q = loadProfile();
      q.offset = Math.round(this.offset + d);
      saveProfile(q);
      this.showMenu();
    };
    $('mMinus').onclick = () => nudge(-5);
    $('mPlus').onclick = () => nudge(5);
    $('mShare').onclick = async () => {
      const url = `${location.origin}${location.pathname}?song=${songCode(this.seed)}`;
      toast((await copyText(url)) ? 'Link to this song copied' : 'Copy failed');
    };
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

  /** First visit: offer to calibrate. */
  calibPrompt(): void {
    const p = loadProfile();
    if (p.offset !== null) return this.showMenu();
    showCard(
      `<h2>Set your timing</h2>
       <p>Phones play sound late, by anything from 20 to 250 ms, and Loomsong has to know how late yours is. You’ll hear a click: tap along with it about 20 times (15 seconds).</p>
       <p class="meta2">Use the speaker or wired headphones you’ll play with. Bluetooth adds a lot of delay.</p>`,
      [
        { label: 'Calibrate now', primary: true, onClick: () => this.calibrate() },
        { label: 'Skip (use a guess)', onClick: () => this.showMenu() },
      ],
      false,
    );
  }

  calibrate(): void {
    closeOverlay();
    if (!soundOn()) return this.needSound();
    this.audio.silent = false;
    if (!this.audio.ensure()) {
      toast('Calibration needs Web Audio');
      return this.showMenu();
    }
    this.audio.stop();
    this.state = 'calib';
    this.calib = { start: 0, interval: 0.6, total: 22, errs: [], tapT: -9, scheduled: false };
  }

  private calibTick(): void {
    const c = this.calib!;
    const a = this.audio;
    if (!c.scheduled) {
      if (!a.running) return;
      c.start = a.now() + 0.8;
      for (let i = 0; i < c.total; i++) a.click(c.start + i * c.interval, i % 4 === 0);
      c.scheduled = true;
      return;
    }
    if (a.now() > c.start + c.total * c.interval + 0.3) this.calibDone();
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
    if (errs.length < 8) {
      showCard(`<h2>Not enough taps</h2><p>Only ${errs.length} taps landed near a click. Tap along with each click you hear.</p>`, [
        { label: 'Try again', primary: true, onClick: () => this.calibrate() },
        { label: 'Back', onClick: () => this.showMenu() },
      ], false);
      return;
    }
    const med = errs[Math.floor(errs.length / 2)];
    const q1 = errs[Math.floor(errs.length / 4)], q3 = errs[Math.floor((errs.length * 3) / 4)];
    const spread = Math.round((q3 - q1) / 2);
    const off = Math.round(med);
    this.audio.chime();
    showCard(
      `<h2>Your timing: ${off} ms</h2>
       <p>Your taps landed ${off} ms after the click was sent, give or take ${spread} ms. Loomsong will take that off every tap.</p>
       ${spread > 45 ? '<p class="meta2">That was a wide spread: another try may give a steadier number.</p>' : ''}`,
      [
        {
          label: 'Save',
          primary: true,
          onClick: () => {
            const p = loadProfile();
            p.offset = off;
            saveProfile(p);
            this.showMenu();
          },
        },
        { label: 'Try again', onClick: () => this.calibrate() },
        { label: 'Cancel', onClick: () => this.showMenu() },
      ],
      false,
    );
  }

  private async copyReport(): Promise<void> {
    const last = store.load<{ v: number; seed: number; lv: number; off: number; a: string } | null>('last', null);
    const txt = last ? `LOOMSONG v${last.v} seed=${last.seed} lv=${last.lv} off=${last.off} a=${last.a}` : `LOOMSONG v${RULES_VERSION} seed=${this.seed} lv=${this.level} (no play yet)`;
    toast((await copyText(txt)) ? 'Bug report copied' : 'Copy failed');
  }
}

