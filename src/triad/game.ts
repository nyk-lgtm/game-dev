// Triad controller: board input, the element pad, notes, undo, hints, timer,
// saving, daily puzzle and the cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { dailySeed, enterDaily, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { reducedFx } from '../shared/settings';
import { pruneDailies, shortDay, streakOf, type DailyResult } from '../shared/streak';
import { pxToHex } from '../shared/hexlayout';
import { key } from '../shared/hex';
import { makeStore } from '../shared/storage';
import {
  CLUE_MODES,
  ELEMENT_NAMES,
  LINKS_VERSION,
  RULES_VERSION,
  LEVELS,
  SIZES,
  TUTORIAL,
  TUTORIAL_STEPS,
  brokenClues,
  generate,
  linksAt,
  makeBoard,
  nextHint,
  solved,
  type ClueMode,
  type Hint,
  type Puzzle,
  type TrialView,
  type Level,
  type Size,
} from './core';
import { COLOR, drawBoard, iconSvg, layout, linkSvg, type View } from './render/draw';

export const store = makeStore('triad.');

const $ = (id: string) => document.getElementById(id)!;
const CODE = '.fwl';

/** An unfinished tutorial (stored as 'tut'): hex values and notes like a SavedRun. */
export interface TutorialSave {
  vals: string;
  notes: string;
  daily: string | null;
}

export function validTutorial(t: unknown): t is TutorialSave {
  const o = t as TutorialSave | null;
  return !!o && typeof o.vals === 'string' && o.vals.length === 7 && typeof o.notes === 'string' && o.notes.length === 7;
}

interface SavedRun {
  v: number;
  seed: number;
  size: Size;
  vals: string;
  notes: string;
  ms: number;
  hints: number;
  done: boolean;
  day?: string | null;
  level?: Level;
  /** Absent in older saves: numbers. */
  clues?: ClueMode;
  /** LINKS_VERSION of a links-mode save. */
  lv?: number;
  /** The last hint and the board it was given on: asking again before a change is free. */
  lh?: LastHint | null;
}

interface LastHint {
  /** `boardSig` right after the hint (a "what if" writes into notes first). */
  sig: string;
  h: Hint;
}

/** A save this version still rebuilds the same puzzle for. */
export const validSave = (s: SavedRun | null | undefined): s is SavedRun =>
  !!s && s.v === RULES_VERSION && (s.clues !== 'links' || s.level === 'hard' || s.lv === LINKS_VERSION);

interface Profile {
  /** Every puzzle solved, dailies included. */
  solved: number;
  /** Regular puzzles solved per level and mode (`level` or `level+links`); dailies are kept apart. */
  solvedBy?: Record<string, number>;
  /** Best regular time per size (normal) or `size-level`, with `+links` in links mode. */
  best: Partial<Record<string, number>>;
}

/** Daily results by day (stored as 'dailies'): the streak and the share line. */
const loadDailies = () => store.load<Record<string, DailyResult>>('dailies', {});
const HINT_MS = 30000;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Game {
  p!: Puzzle;
  size: Size = 'medium';
  level: Level = 'normal';
  mode: ClueMode = 'numbers';
  seed = 0;
  vals: number[] = [];
  notes: number[] = [];
  selected = -1;
  notesMode = false;
  hints = 0;
  ms = 0;
  done = false;
  daily: string | null = null;
  private undoStack: { cell: number; val: number; notes: number }[] = [];
  private hint: { clue: number; cell: number; clues?: number[]; trial?: TrialView; t0?: number } | null = null;
  private lastHint: LastHint | null = null;
  private canvas = $('board') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private view!: View;
  private last = 0;
  private time = 0;
  private winT = -1;
  private lastSave = 0;

  constructor() {
    this.buildPad();
    this.canvas.addEventListener('pointerdown', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.tapAt(e.clientX - r.left, e.clientY - r.top);
    });
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    // A tap on the dimmed backdrop over ＋ or ☰ closes the card and presses the
    // button too, so it doesn't take two taps (e.g. ＋ right after Solved).
    $('overlay').addEventListener('click', (e) => {
      if (e.target !== $('overlay')) return;
      setTimeout(() => {
        if (!$('overlay').hidden) return;
        const btn = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('#newBtn, #menuBtn');
        btn?.click();
      });
    });
    document.addEventListener('visibilitychange', () => this.save(true));
    addEventListener('pagehide', () => this.save(true));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- lifecycle

  /** Guided tutorial: the step being taught, or null when playing normally. */
  tut: number | null = null;
  /** The daily the tutorial was opened from, so its last card can return to it. */
  private tutDaily: string | null = null;

  /** The seven-hex guided puzzle (your own puzzle waits). Its progress is kept
   *  under 'tut' so a reload resumes the step instead of dropping it. */
  startTutorial(saved?: TutorialSave | null): void {
    closeOverlay();
    store.save('seenHelp', true);
    // Remember the daily it came from ("Try the tutorial again" keeps it).
    this.tutDaily = saved ? saved.daily : this.tut !== null ? this.tutDaily : this.daily;
    this.tut = 0;
    this.daily = null;
    // Out of the daily's address, so a reload resumes the tutorial.
    leaveDaily();
    this.p = TUTORIAL;
    this.vals = saved ? [...saved.vals].map((c) => CODE.indexOf(c) - 1) : new Array(7).fill(-1);
    this.notes = saved ? [...saved.notes].map(Number) : new Array(7).fill(0);
    this.ms = 0;
    this.hints = 0;
    this.done = false;
    this.selected = -1;
    this.undoStack = [];
    this.lastHint = null;
    this.winT = -1;
    this.resize();
    this.refresh();
    this.save(true);
  }

  /** Advance the tutorial past steps whose hexes are all filled correctly. */
  private tutorialProgress(): void {
    while (this.tut !== null && this.tut < TUTORIAL_STEPS.length && TUTORIAL_STEPS[this.tut].cells.every((c) => this.vals[c] === this.p.solution[c])) this.tut++;
    const st = this.tut !== null ? TUTORIAL_STEPS[this.tut] : undefined;
    this.hint = st ? { clue: st.focus, cell: st.cells.find((c) => this.vals[c] < 0) ?? st.cells[0], clues: [st.focus] } : null;
  }

  start(seed: number, size: Size, saved?: SavedRun | null, daily: string | null = null): void {
    store.save('tut', null);
    this.tut = null;
    this.seed = seed;
    this.size = size;
    this.daily = daily;
    // The address and a saved mode both say whether this is the daily, so a reload comes back to it.
    if (daily) enterDaily();
    else leaveDaily();
    store.save('mode', daily ? 'daily' : 'own');
    this.level = daily ? 'normal' : (saved?.level ?? this.level);
    this.mode = daily ? 'numbers' : saved ? (saved.clues ?? 'numbers') : this.mode;
    this.p = generate(seed, SIZES[size].radius, this.level, this.mode);
    const N = this.p.solution.length;
    this.vals = saved ? [...saved.vals].map((c) => CODE.indexOf(c) - 1) : new Array(N).fill(-1);
    this.notes = saved ? [...saved.notes].map(Number) : new Array(N).fill(0);
    if (this.vals.length !== N || this.notes.length !== N) {
      this.vals = new Array(N).fill(-1);
      this.notes = new Array(N).fill(0);
    }
    this.ms = saved?.ms ?? 0;
    this.hints = saved?.hints ?? 0;
    this.done = saved?.done ?? false;
    this.selected = -1;
    this.hint = null;
    this.lastHint = saved?.lh ?? null;
    this.undoStack = [];
    this.winT = -1;
    this.resize();
    this.refresh();
    this.save(true);
    if (this.done) setTimeout(() => this.showWin(false), 300);
    else if (this.p.links && !store.load('seenLinks', false)) this.linkTip();
  }

  /** One-time tip the first time a links puzzle appears. */
  private linkTip(): void {
    store.save('seenLinks', true);
    showCard(`<h2>Links</h2><p class="tip">${linkSvg(48)}<span>A <b>link</b> (two short bars across an edge) means the two hexes it joins hold the <b>same</b> element.</span></p>`, [
      { label: 'Got it', primary: true, onClick: closeOverlay },
    ]);
  }

  newPuzzle(size: Size = this.size, level: Level = this.level, mode: ClueMode = this.mode): void {
    closeOverlay();
    this.level = level;
    this.mode = mode;
    store.save('level', level);
    store.save('clues', mode);
    this.start((Math.random() * 0xffffffff) >>> 0, size);
  }

  private solvedKey(level = this.level, mode = this.mode): string {
    return `${level}${mode === 'links' ? '+links' : ''}`;
  }

  /** Key for best times: plain size for Normal (older saves), else size-level; `+links` in links mode. */
  private bestKey(size = this.size, level = this.level, mode = this.mode): string {
    return `${level === 'normal' ? size : `${size}-${level}`}${mode === 'links' ? '+links' : ''}`;
  }

  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<SavedRun | null>('dailyRun', null);
    const seed = dailySeed('triad', day);
    if (validSave(saved) && saved.day === day) this.start(saved.seed, saved.size, saved, day);
    else this.start(seed, 'medium', null, day);
  }

  resumeOwn(): void {
    closeOverlay();
    const saved = store.load<SavedRun | null>('run', null);
    if (validSave(saved)) this.start(saved.seed, saved.size, saved);
    else this.newPuzzle('medium');
  }

  save(now = false): void {
    if (this.tut !== null) {
      store.save('tut', this.done ? null : { vals: this.vals.map((v) => CODE[v + 1]).join(''), notes: this.notes.join(''), daily: this.tutDaily });
      return;
    }
    if (!this.p) return;
    const t = performance.now();
    if (!now && t - this.lastSave < 3000) return;
    this.lastSave = t;
    const run: SavedRun = {
      v: RULES_VERSION,
      seed: this.seed,
      size: this.size,
      vals: this.vals.map((v) => CODE[v + 1]).join(''),
      notes: this.notes.join(''),
      ms: Math.round(this.ms),
      hints: this.hints,
      done: this.done,
      day: this.daily,
      level: this.level,
      clues: this.mode,
      lv: this.mode === 'links' ? LINKS_VERSION : undefined,
      lh: this.lastHint,
    };
    store.save(this.daily ? 'dailyRun' : 'run', run);
  }

  // ---------------------------------------------------------------- input

  private tapAt(x: number, y: number): void {
    if (!this.p) return;
    const h = pxToHex(this.view.L, x, y);
    const i = makeBoard(this.p.radius).cells.findIndex((c) => key(c) === key(h));
    if (i < 0) {
      this.selected = -1;
      this.refresh();
      return;
    }
    // Tapping a selected, filled hex again cycles it: fire → water → leaf → empty.
    // An empty one just stays selected, so "tap a hex, then an element" always works
    // (also right after a hint selected it).
    if (i === this.selected && !this.done && this.p.given[i] < 0 && !this.notesMode && this.vals[i] >= 0) {
      this.set(i, this.vals[i] === 2 ? -1 : this.vals[i] + 1);
      return;
    }
    this.selected = i;
    navigator.vibrate?.(6);
    this.refresh();
  }

  private buildPad(): void {
    for (let e = 0; e < 3; e++) {
      const b = $(`el${e}`);
      b.innerHTML = `${iconSvg(e, 30)}<span>${ELEMENT_NAMES[e]}</span>`;
      b.style.setProperty('--c', COLOR[e]);
      b.onclick = () => this.press(e);
    }
    $('erase').onclick = () => this.press(-1);
    $('notesBtn').onclick = () => {
      this.notesMode = !this.notesMode;
      this.refresh();
    };
    $('undoBtn').onclick = () => this.undo();
    $('hintBtn').onclick = () => this.giveHint();
    $('rule').innerHTML = `${iconSvg(0, 18)} burns ${iconSvg(2, 18)} drinks ${iconSvg(1, 18)} douses ${iconSvg(0, 18)}`;
  }

  private press(e: number): void {
    const i = this.selected;
    if (this.done) return;
    if (i < 0) {
      toast('Tap a hex first');
      return;
    }
    if (this.p.given[i] >= 0) {
      toast('That one is given');
      return;
    }
    if (this.notesMode && e >= 0) {
      if (this.vals[i] >= 0) return;
      this.undoStack.push({ cell: i, val: this.vals[i], notes: this.notes[i] });
      this.notes[i] ^= 1 << e;
      this.refresh();
      this.save(true);
      return;
    }
    this.set(i, e);
  }

  private set(i: number, v: number): void {
    // Pressing the element a hex already holds keeps it (Clear empties a hex).
    if (this.vals[i] === v) return;
    this.undoStack.push({ cell: i, val: this.vals[i], notes: this.notes[i] });
    this.vals[i] = v;
    if (v >= 0) this.notes[i] = 0;
    this.hint = null;
    navigator.vibrate?.(8);
    if (solved(this.p, this.vals)) this.win();
    this.refresh();
    this.save(true);
    if (this.tut !== null && v >= 0 && v !== this.p.solution[i] && TUTORIAL_STEPS[this.tut]?.cells.includes(i))
      this.info(`Not quite: that one is <b>${ELEMENT_NAMES[this.p.solution[i]]}</b>. ${TUTORIAL_STEPS[this.tut].text}`);
  }

  private undo(): void {
    const u = this.undoStack.pop();
    if (!u || this.done) return;
    this.vals[u.cell] = u.val;
    this.notes[u.cell] = u.notes;
    this.selected = u.cell;
    this.hint = null;
    this.refresh();
    this.save(true);
  }

  /** The board as the hints read it: entries and notes. */
  private boardSig(): string {
    return `${this.vals.map((v) => CODE[v + 1]).join('')}|${this.notes.join('')}`;
  }

  private giveHint(): void {
    if (this.done) return;
    if (this.tut !== null) {
      // The tutorial already shows the step; hints are free here.
      this.refresh();
      return;
    }
    // Nothing changed since the last hint: show it again, free (and replay a "what if" from the start).
    if (this.lastHint && this.lastHint.sig === this.boardSig()) {
      this.showHint(this.lastHint.h);
      toast('Same hint again: no charge');
      return;
    }
    const h = nextHint(this.p, this.vals, this.notes);
    if (h.kind === 'done') return;
    this.hints++;
    if (h.kind === 'not') this.notes[h.cell] = (this.notes[h.cell] || 7) & ~(1 << h.not);
    this.lastHint = { sig: this.boardSig(), h };
    this.showHint(h);
    this.save(true);
  }

  private showHint(h: Hint): void {
    if (h.kind === 'done') return;
    this.selected = h.cell;
    if (h.kind === 'wrong') {
      this.hint = { clue: h.cell, cell: h.cell };
      this.info(`<b>This one is wrong.</b> Clear it (or change it) and look again.`);
    } else {
      this.hint = { clue: h.clue, cell: h.cell, clues: h.clues, trial: h.trial, t0: this.time };
      // The notes tip shows once, on the first hint that needs it.
      const tip = h.kind === 'step' && h.notes && !store.load('notesTip', false);
      if (tip) store.save('notesTip', true);
      this.info(`${h.text}${tip ? ' <i>Tip: notes track what nearby hexes can still be.</i>' : ''}`);
    }
    this.draw();
  }

  // ---------------------------------------------------------------- win

  private win(): void {
    this.done = true;
    this.selected = -1;
    this.winT = 0;
    if (this.tut !== null) {
      this.tut = TUTORIAL_STEPS.length;
      setTimeout(
        () =>
          showCard(
            `<h2>That's the whole game</h2><p>Every puzzle is solved like that: find a number whose neighbors leave only one way to add up, fill it in, and look again. Bigger boards just chain more of them.</p><p>Notes help when a hex is down to two options, and Hint always shows the next step.</p>`,
            [
              this.tutDaily === todayKey()
                ? { label: 'Play today’s daily', primary: true, onClick: () => this.playDaily() }
                : { label: 'Play a Small puzzle', primary: true, onClick: () => this.newPuzzle('small', 'normal', 'numbers') },
              { label: 'Try the tutorial again', onClick: () => this.startTutorial() },
            ],
          ),
        1300,
      );
      return;
    }
    this.save(true);
    const prof = store.load<Profile>('profile', { solved: 0, best: {} });
    prof.solved++;
    const score = this.total();
    if (this.daily) {
      // Dailies keep their own results (streak, share line, today's best) and leave the regular bests alone.
      store.save('profile', prof);
      const today = todayKey();
      const dailies = loadDailies();
      const had = dailies[this.daily];
      if (!had || score < had.ms + had.hints * HINT_MS) dailies[this.daily] = { ms: Math.round(this.ms), hints: this.hints, onDay: this.daily === today || !!had?.onDay };
      pruneDailies(dailies, today);
      store.save('dailies', dailies);
      recordDaily(store, 1e7 - Math.round(score / 1000), fmt(score), this.daily);
      setTimeout(() => this.showWin(false), 1400);
      return;
    }
    const sk = this.solvedKey();
    prof.solvedBy = { ...prof.solvedBy, [sk]: (prof.solvedBy?.[sk] ?? 0) + 1 };
    const prev = prof.best[this.bestKey()];
    const newBest = prev === undefined || score < prev;
    if (newBest) prof.best[this.bestKey()] = score;
    store.save('profile', prof);
    setTimeout(() => this.showWin(newBest && prev !== undefined), 1400);
  }

  private showWin(newBest: boolean): void {
    const time = `in <b>${fmt(this.total())}</b>${this.hints ? ` (${fmt(this.ms)} + ${this.hints * 30}s for ${plural(this.hints, 'hint')})` : ', no hints'}`;
    if (this.daily) {
      const d = loadDaily(store, this.daily);
      const streak = this.daily === todayKey() ? streakOf(loadDailies()) : 0;
      showCard(
        `<h2>Solved</h2>
         <p>Daily puzzle ${time}.</p>
         <p><b style="color:var(--gold)">Daily puzzle · ${prettyDay(this.daily)}</b>${d ? `<br>Today's best: ${d.label}` : ''}${streak > 1 ? `<br>🔥 ${streak}-day streak` : streak === 1 ? '<br>🔥 Streak started: come back tomorrow' : ''}</p>`,
        [
          { label: 'Copy my result', primary: true, onClick: () => this.share() },
          { label: 'Back to my puzzle', onClick: () => this.resumeOwn() },
          { label: 'New puzzle', onClick: () => this.showNew() },
          { label: 'Look at the board', onClick: closeOverlay },
        ],
      );
      return;
    }
    const best = store.load<Profile>('profile', { solved: 0, best: {} }).best[this.bestKey()];
    showCard(
      `<h2>Solved</h2>
       <p>${this.title()} puzzle ${time}.${newBest ? ' <b style="color:var(--gold)">New best!</b>' : best !== undefined ? ` Best ${fmt(best)}.` : ''}</p>`,
      [
        { label: `Another ${this.title().toLowerCase()} puzzle`, primary: true, onClick: () => this.newPuzzle(this.size) },
        { label: 'Other sizes', onClick: () => this.showNew() },
        { label: 'Look at the board', onClick: closeOverlay },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  /** A spoiler-free line for today's daily: time, hints, streak. */
  shareText(): string {
    const day = this.daily ?? todayKey();
    const dailies = loadDailies();
    const r = dailies[day];
    const ms = r ? r.ms + r.hints * HINT_MS : this.total();
    const hints = r ? r.hints : this.hints;
    const streak = day === todayKey() ? streakOf(dailies) : 0;
    return `Triad daily ${shortDay(day)}: solved in ${fmt(ms)}, ${hints ? plural(hints, 'hint') : 'no hints'}${streak ? ` · 🔥 ${plural(streak, 'day')}` : ''}\n${location.origin}${location.pathname}?daily`;
  }

  private async share(): Promise<void> {
    toast((await copyText(this.shareText())) ? 'Result copied: paste it anywhere' : 'Copy failed');
  }

  // ---------------------------------------------------------------- UI

  /** Time on the clock, hint penalties included. */
  private total(): number {
    return this.ms + this.hints * 30000;
  }

  private showClock(): void {
    const s = fmt(this.total());
    if ($('clock').textContent !== s) $('clock').textContent = s;
    $('clock').classList.toggle('pen', this.hints > 0);
  }

  private info(html: string): void {
    $('info').innerHTML = html;
  }

  refresh(): void {
    if (!this.p) return;
    $('size').textContent = this.daily ? 'Daily' : SIZES[this.size].name;
    $('levelLabel').textContent = this.daily ? 'Puzzle' : `${LEVELS[this.level].name}${this.p.links ? ' + links' : ''}`;
    this.showClock();
    $('notesBtn').classList.toggle('on', this.notesMode);
    $('pad').classList.toggle('notes', this.notesMode);
    const i = this.selected;
    const filled = this.vals.filter((v, k) => v >= 0 || this.p.given[k] >= 0).length;
    const total = this.vals.length;
    for (let e = 0; e < 3; e++) $(`el${e}`).classList.toggle('cur', i >= 0 && this.vals[i] === e);
    if (this.tut !== null) {
      this.tutorialProgress();
      $('size').textContent = 'Tutorial';
      $('levelLabel').textContent = 'Learn';
      this.info(this.tut < TUTORIAL_STEPS.length ? `<b>${this.tut + 1}/${TUTORIAL_STEPS.length}</b> ${TUTORIAL_STEPS[this.tut].text}` : '<b>Solved!</b> That’s the whole game.');
      this.draw();
      return;
    }
    if (this.done) this.info(`<b>Solved!</b> ${fmt(this.total())}${this.hints ? ` · ${this.hints} hint${this.hints > 1 ? 's' : ''}` : ''}`);
    else if (i < 0)
      this.info(
        filled === this.p.given.filter((g) => g >= 0).length
          ? this.p.links
            ? 'Fill every hex. A <b>number</b> counts the neighbors its hex beats; a <b>link</b> joins two hexes that match.'
            : 'Fill every hex. A <b>number</b> says how many of its neighbors that hex beats.'
          : `${filled}/${total} filled. Tap a hex, then an element.`,
      );
    else {
      const nl = this.p.links ? linksAt(makeBoard(this.p.radius), this.p.clue, i).length : 0;
      const linked = nl ? ` Linked: ${nl === 1 ? 'the hex across the bars matches it' : `the ${nl} hexes across its bars match it`}.` : '';
      if (this.p.given[i] >= 0) this.info(`A given <b>${ELEMENT_NAMES[this.p.given[i]]}</b>.${this.p.clue[i] >= 0 ? ` It beats <b>${this.p.clue[i]}</b> of its neighbors.` : ''}${linked}`);
      else if (this.p.clue[i] >= 0) this.info(`This hex beats exactly <b>${this.p.clue[i]}</b> of its neighbors.${linked}${this.notesMode ? ' Notes on.' : ''}`);
      else if (linked) this.info(`${linked.slice(1)}${this.notesMode ? ' Notes on.' : ''}`);
      else this.info(this.notesMode ? 'Notes: tap elements to pencil them in.' : (this.vals[i] >= 0 ? 'Pick another element, or tap the hex again to cycle.' : 'Pick an element.'));
    }
    this.draw();
  }

  private resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.p) this.view = layout(this.p, w, h);
    this.draw();
  }

  private draw(): void {
    if (!this.p || !this.view) return;
    drawBoard(this.ctx, this.view, this.p, {
      vals: this.vals,
      notes: this.notes,
      selected: this.selected,
      broken: new Set(brokenClues(this.p, this.vals.map((v, i) => (this.p.given[i] >= 0 ? this.p.given[i] : v)))),
      hint: this.hint,
      still: reducedFx(),
      win: this.winT,
      time: this.time,
    });
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t;
    this.time += dt;
    if (this.p && !this.done && document.visibilityState === 'visible' && $('overlay').hidden) {
      this.ms += dt * 1000;
      this.showClock();
      this.save();
    }
    if (this.winT >= 0) {
      this.winT += dt * 0.6;
      if (this.winT > 1) this.winT = -1;
      this.draw();
    } else if (this.hint) this.draw();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  // ---------------------------------------------------------------- cards

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>How to play</h2>
      <p>Fill every hex with an element. ${iconSvg(0, 16)} <b>Fire</b> burns ${iconSvg(2, 16)} <b>Leaf</b>, leaf drinks ${iconSvg(1, 16)} <b>Water</b>, and water douses fire.</p>
      <ul>
        <li>A <b>number</b> on a hex counts the neighbors that hex <b>beats</b> (0 to 6). It fades once it adds up, and turns <span style="color:#ff5d7a">red</span> when it no longer can.</li>
        <li>Ringed hexes are given. There is exactly one answer, and you never need to guess.</li>
        <li>Tap a hex, then an element. <b>Notes</b> pencil in what a hex might be.</li>
        <li><b>＋</b> picks <b>Easy</b>, <b>Normal</b> or <b>Hard</b> (sometimes needs a "what if": suppose a hex is fire and see a number break).</li>
        <li>${linkSvg(26)} With <b>Numbers + links</b>, a <b>link</b> on an edge means the two hexes it joins hold the same element.</li>
        <li><b>Hint</b> shows the next step and rings every clue it uses, or a wrong hex (+30 seconds; asking again before you change anything is free). A "what if" plays out as numbered ghosts up to the red clue that breaks.</li>
      </ul>`,
      // Opened with ?daily: playing it is the main button, the tutorial the other.
      this.daily
        ? [
            { label: 'Play the daily', primary: true, onClick: closeOverlay },
            { label: 'Show me first (60-second tutorial)', pin: true, onClick: () => this.startTutorial() },
          ]
        : [
            { label: 'Show me (60-second tutorial)', primary: true, onClick: () => this.startTutorial() },
            { label: 'Just play', pin: true, onClick: closeOverlay },
          ],
    );
  }

  /** "Normal small", "Hard large links": the level always first, like every level's win text. */
  private title(): string {
    return `${LEVELS[this.level].name} ${SIZES[this.size].name.toLowerCase()}${this.p?.links ? ' links' : ''}`;
  }

  showNew(): void {
    const prof = store.load<Profile>('profile', { solved: 0, best: {} });
    let lv: Level = this.level;
    let md: ClueMode = this.mode;
    const levels = (Object.keys(LEVELS) as Level[])
      .map((l) => `<button data-lv="${l}" class="${l === lv ? 'on' : ''}">${LEVELS[l].name}</button>`)
      .join('');
    const modes = (Object.keys(CLUE_MODES) as ClueMode[])
      .map((m) => `<button data-md="${m}" class="${m === md ? 'on' : ''}">${CLUE_MODES[m].name}</button>`)
      .join('');
    const label = (s: Size) => {
      const b = prof.best[this.bestKey(s, lv, md)];
      return `${SIZES[s].name} · ${makeBoard(SIZES[s].radius).cells.length} hexes${b !== undefined ? ` · best ${fmt(b)}` : ''}`;
    };
    const text = () => {
      const n = prof.solvedBy?.[this.solvedKey(lv, md)] ?? 0;
      const lvText = md === 'links' ? LEVELS[lv].text.replace(/number/g, 'clue') : LEVELS[lv].text;
      return `${lvText}${md === 'links' ? ` ${CLUE_MODES.links.text}` : ''}${n ? ` ${n} solved at this level.` : ''}`;
    };
    const sizes = Object.keys(SIZES) as Size[];
    showCard(
      `<h2>New puzzle</h2><div class="levels">${levels}</div><div class="levels modes" aria-label="Clues">${modes}</div><p class="lvtext">${text()}</p>`,
      sizes.map((s) => ({ label: label(s), primary: s === this.size, onClick: () => this.newPuzzle(s, lv, md) })),
    );
    const card = document.querySelector('#overlay .card')!;
    const sizeBtns = [...card.querySelectorAll<HTMLButtonElement>(':scope > button')];
    const update = () => {
      card.querySelectorAll<HTMLButtonElement>('.levels button').forEach((x) => x.classList.toggle('on', x.dataset.lv === lv || x.dataset.md === md));
      card.querySelector('.lvtext')!.textContent = text();
      sizeBtns.forEach((sb, k) => (sb.textContent = label(sizes[k])));
    };
    card.querySelectorAll<HTMLButtonElement>('.levels button').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.lv) lv = b.dataset.lv as Level;
        if (b.dataset.md) md = b.dataset.md as ClueMode;
        update();
      };
    });
  }

  showMenu(): void {
    const day = todayKey();
    const d = loadDaily(store, day);
    const streak = streakOf(loadDailies());
    showCard(
      `<h2>Triad</h2><p>${this.daily ? `Daily puzzle · ${prettyDay(this.daily)}` : `${this.title()} puzzle`} · ${fmt(this.total())}${streak ? `<br>🔥 ${streak}-day daily streak` : ''}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        ...(this.daily && this.done ? [{ label: 'Copy my result', onClick: () => this.share() }] : []),
        { label: 'New puzzle', onClick: () => this.showNew() },
        this.daily
          ? { label: 'Back to my puzzle', onClick: () => this.resumeOwn() }
          : { label: `Daily puzzle${d ? ` (${d.label})` : ''}`, onClick: () => this.playDaily() },
        {
          label: 'Clear the board',
          onClick: () =>
            showCard('<h2>Clear the board?</h2><p>Everything you filled in goes; the clock keeps running.</p>', [
              { label: 'Keep it', primary: true, onClick: closeOverlay },
              {
                label: 'Clear it',
                onClick: () => {
                  closeOverlay();
                  if (this.done) return;
                  this.vals.fill(-1);
                  this.notes.fill(0);
                  this.undoStack = [];
                  this.hint = null;
                  this.refresh();
                  this.save(true);
                },
              },
            ]),
        },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Tutorial', onClick: () => this.startTutorial() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    const v = this.vals.map((x) => CODE[x + 1]).join('');
    const extra = `${this.level === 'normal' ? '' : `&level=${this.level}`}${this.mode === 'links' ? '&clues=links' : ''}`;
    const text = `TRIAD v${RULES_VERSION} seed=${this.seed} size=${this.size} level=${this.level} clues=${this.mode} vals=${v}\n${location.origin}${location.pathname}?seed=${this.seed}&size=${this.size}${extra}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
