// Triad controller: board input, the element pad, notes, undo, hints, timer,
// saving, daily puzzle and the cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { pxToHex } from '../shared/hexlayout';
import { key } from '../shared/hex';
import { makeStore } from '../shared/storage';
import {
  ELEMENT_NAMES,
  RULES_VERSION,
  SIZES,
  brokenClues,
  generate,
  makeBoard,
  nextHint,
  solved,
  type Puzzle,
  type Size,
} from './core';
import { COLOR, drawBoard, iconSvg, layout, type View } from './render/draw';

export const store = makeStore('triad.');

const $ = (id: string) => document.getElementById(id)!;
const CODE = '.fwl';

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
}

interface Profile {
  solved: number;
  best: Partial<Record<Size, number>>;
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Game {
  p!: Puzzle;
  size: Size = 'medium';
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
  private hint: { clue: number; cell: number } | null = null;
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
    document.addEventListener('visibilitychange', () => this.save(true));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- lifecycle

  start(seed: number, size: Size, saved?: SavedRun | null, daily: string | null = null): void {
    this.seed = seed;
    this.size = size;
    this.daily = daily;
    this.p = generate(seed, SIZES[size].radius);
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
    this.undoStack = [];
    this.winT = -1;
    this.resize();
    this.refresh();
    this.save(true);
    if (this.done) setTimeout(() => this.showWin(false), 300);
  }

  newPuzzle(size: Size = this.size): void {
    closeOverlay();
    leaveDaily();
    this.start((Math.random() * 0xffffffff) >>> 0, size);
  }

  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<SavedRun | null>('dailyRun', null);
    const seed = dailySeed('triad', day);
    if (saved && saved.v === RULES_VERSION && saved.day === day) this.start(saved.seed, saved.size, saved, day);
    else this.start(seed, 'medium', null, day);
  }

  resumeOwn(): void {
    closeOverlay();
    leaveDaily();
    const saved = store.load<SavedRun | null>('run', null);
    if (saved && saved.v === RULES_VERSION) this.start(saved.seed, saved.size, saved);
    else this.newPuzzle('medium');
  }

  save(now = false): void {
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
    // Tapping the selected cell again cycles it: empty → fire → water → leaf → empty.
    if (i === this.selected && !this.done && this.p.given[i] < 0 && !this.notesMode) {
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
      this.save();
      return;
    }
    this.set(i, e);
  }

  private set(i: number, v: number): void {
    if (this.vals[i] === v && v >= 0) v = -1;
    this.undoStack.push({ cell: i, val: this.vals[i], notes: this.notes[i] });
    this.vals[i] = v;
    if (v >= 0) this.notes[i] = 0;
    this.hint = null;
    navigator.vibrate?.(8);
    if (solved(this.p, this.vals)) this.win();
    this.refresh();
    this.save();
  }

  private undo(): void {
    const u = this.undoStack.pop();
    if (!u || this.done) return;
    this.vals[u.cell] = u.val;
    this.notes[u.cell] = u.notes;
    this.selected = u.cell;
    this.hint = null;
    this.refresh();
    this.save();
  }

  private giveHint(): void {
    if (this.done) return;
    const h = nextHint(this.p, this.vals);
    if (h.kind === 'done') return;
    this.hints++;
    if (h.kind === 'wrong') {
      this.selected = h.cell;
      this.hint = { clue: h.cell, cell: h.cell };
      this.info(`<b>This one is wrong.</b> Clear it (or change it) and look again.`);
    } else {
      this.selected = h.cell;
      this.hint = { clue: h.clue, cell: h.cell };
      this.info(`${h.text}${h.notes ? ' <i>(Use notes to track what nearby hexes can still be.)</i>' : ''}`);
    }
    this.save(true);
    this.draw();
  }

  // ---------------------------------------------------------------- win

  private win(): void {
    this.done = true;
    this.selected = -1;
    this.winT = 0;
    this.save(true);
    const prof = store.load<Profile>('profile', { solved: 0, best: {} });
    prof.solved++;
    const prev = prof.best[this.size];
    const score = this.ms + this.hints * 30000;
    const newBest = prev === undefined || score < prev;
    if (newBest) prof.best[this.size] = score;
    store.save('profile', prof);
    if (this.daily) recordDaily(store, 1e7 - Math.round(score / 1000), `${fmt(this.ms)}${this.hints ? ` +${this.hints}💡` : ''}`, this.daily);
    setTimeout(() => this.showWin(newBest && prev !== undefined), 1400);
  }

  private showWin(newBest: boolean): void {
    const best = store.load<Profile>('profile', { solved: 0, best: {} }).best[this.size];
    const d = this.daily ? loadDaily(store, this.daily) : null;
    showCard(
      `<h2>Solved</h2>
       <p>${SIZES[this.size].name} puzzle in <b>${fmt(this.ms)}</b>${this.hints ? ` with ${this.hints} hint${this.hints > 1 ? 's' : ''} (+30s each)` : ', no hints'}.${newBest ? ' <b style="color:var(--gold)">New best!</b>' : best !== undefined ? ` Best ${fmt(best)}.` : ''}</p>
       ${this.daily ? `<p><b style="color:var(--gold)">Daily puzzle · ${prettyDay(this.daily)}</b>${d ? `<br>Today's best: ${d.label}` : ''}</p>` : ''}`,
      [
        { label: `New ${SIZES[this.size].name.toLowerCase()} puzzle`, primary: true, onClick: () => this.newPuzzle(this.size) },
        { label: 'Other sizes', onClick: () => this.showNew() },
        { label: 'Look at the board', onClick: closeOverlay },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  // ---------------------------------------------------------------- UI

  private info(html: string): void {
    $('info').innerHTML = html;
  }

  refresh(): void {
    if (!this.p) return;
    $('size').textContent = this.daily ? 'Daily' : SIZES[this.size].name;
    $('notesBtn').classList.toggle('on', this.notesMode);
    $('pad').classList.toggle('notes', this.notesMode);
    const i = this.selected;
    const filled = this.vals.filter((v, k) => v >= 0 || this.p.given[k] >= 0).length;
    const total = this.vals.length;
    for (let e = 0; e < 3; e++) $(`el${e}`).classList.toggle('cur', i >= 0 && this.vals[i] === e);
    if (this.done) this.info(`<b>Solved!</b> ${fmt(this.ms)}${this.hints ? ` · ${this.hints} hint${this.hints > 1 ? 's' : ''}` : ''}`);
    else if (i < 0)
      this.info(
        filled === this.p.given.filter((g) => g >= 0).length
          ? 'Fill every hex. A <b>number</b> says how many of its neighbors that hex beats.'
          : `${filled}/${total} filled. Tap a hex, then an element. Tap it again to cycle.`,
      );
    else if (this.p.given[i] >= 0) this.info(`A given <b>${ELEMENT_NAMES[this.p.given[i]]}</b>.${this.p.clue[i] >= 0 ? ` It beats <b>${this.p.clue[i]}</b> of its neighbors.` : ''}`);
    else if (this.p.clue[i] >= 0) this.info(`This hex beats exactly <b>${this.p.clue[i]}</b> of its neighbors.${this.notesMode ? ' Notes on.' : ''}`);
    else this.info(this.notesMode ? 'Notes: tap elements to pencil them in.' : 'Pick an element, or tap the hex again to cycle.');
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
      const s = fmt(this.ms);
      if ($('clock').textContent !== s) $('clock').textContent = s;
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
        <li>A <b>number</b> on a hex says how many of its (up to six) neighbors that hex <b>beats</b>. A 0 beats none; a 6 beats every neighbor.</li>
        <li>Hexes with a ring are given. Every puzzle has exactly one answer, and you never need to guess.</li>
        <li>Tap a hex, then an element. Tapping the same hex again cycles it.</li>
        <li><b>Notes</b> let you pencil in what a hex might be. A number turns <span style="color:#ff5d7a">red</span> when its neighbors can no longer add up.</li>
        <li><b>Hint</b> shows the next hex you can work out (each costs 30 seconds on your time).</li>
      </ul>`,
      [{ label: 'Play', primary: true, onClick: closeOverlay }],
    );
  }

  showNew(): void {
    const prof = store.load<Profile>('profile', { solved: 0, best: {} });
    showCard(
      `<h2>New puzzle</h2><p>${prof.solved ? `${prof.solved} solved so far.` : 'Pick a size.'}</p>`,
      (Object.keys(SIZES) as Size[]).map((s) => ({
        label: `${SIZES[s].name} · ${makeBoard(SIZES[s].radius).cells.length} hexes${prof.best[s] !== undefined ? ` · best ${fmt(prof.best[s]!)}` : ''}`,
        primary: s === this.size,
        onClick: () => this.newPuzzle(s),
      })),
    );
  }

  showMenu(): void {
    const day = todayKey();
    const d = loadDaily(store, day);
    showCard(
      `<h2>Triad</h2><p>${this.daily ? `Daily puzzle · ${prettyDay(this.daily)}` : `${SIZES[this.size].name} puzzle`} · ${fmt(this.ms)}</p>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
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
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    const v = this.vals.map((x) => CODE[x + 1]).join('');
    const text = `TRIAD v${RULES_VERSION} seed=${this.seed} size=${this.size} vals=${v}\n${location.origin}${location.pathname}?seed=${this.seed}&size=${this.size}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
