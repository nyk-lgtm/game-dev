// Triad controller: board input, the element pad, notes, undo, hints, timer,
// saving, daily puzzle and the cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
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
  type Puzzle,
  type Level,
  type Size,
} from './core';
import { COLOR, drawBoard, iconSvg, layout, linkSvg, type View } from './render/draw';

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
  level?: Level;
  /** Absent in older saves: numbers. */
  clues?: ClueMode;
  /** LINKS_VERSION of a links-mode save. */
  lv?: number;
}

/** A save this version still rebuilds the same puzzle for. */
export const validSave = (s: SavedRun | null | undefined): s is SavedRun =>
  !!s && s.v === RULES_VERSION && (s.clues !== 'links' || s.level === 'hard' || s.lv === LINKS_VERSION);

interface Profile {
  solved: number;
  /** Solved per level and mode (`level` or `level+links`). */
  solvedBy?: Record<string, number>;
  /** Best time per size (normal) or `size-level`, with `+links` in links mode. */
  best: Partial<Record<string, number>>;
}

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
  private hint: { clue: number; cell: number; clues?: number[] } | null = null;
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

  /** The seven-hex guided puzzle (not saved; your own puzzle waits). */
  startTutorial(): void {
    closeOverlay();
    store.save('seenHelp', true);
    this.tut = 0;
    this.daily = null;
    this.p = TUTORIAL;
    this.vals = new Array(7).fill(-1);
    this.notes = new Array(7).fill(0);
    this.ms = 0;
    this.hints = 0;
    this.done = false;
    this.selected = -1;
    this.undoStack = [];
    this.winT = -1;
    this.resize();
    this.refresh();
  }

  /** Advance the tutorial past steps whose hexes are all filled correctly. */
  private tutorialProgress(): void {
    while (this.tut !== null && this.tut < TUTORIAL_STEPS.length && TUTORIAL_STEPS[this.tut].cells.every((c) => this.vals[c] === this.p.solution[c])) this.tut++;
    const st = this.tut !== null ? TUTORIAL_STEPS[this.tut] : undefined;
    this.hint = st ? { clue: st.focus, cell: st.cells.find((c) => this.vals[c] < 0) ?? st.cells[0], clues: [st.focus] } : null;
  }

  start(seed: number, size: Size, saved?: SavedRun | null, daily: string | null = null): void {
    this.tut = null;
    this.seed = seed;
    this.size = size;
    this.daily = daily;
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
    leaveDaily();
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
    leaveDaily();
    const saved = store.load<SavedRun | null>('run', null);
    if (validSave(saved)) this.start(saved.seed, saved.size, saved);
    else this.newPuzzle('medium');
  }

  save(now = false): void {
    if (!this.p || this.tut !== null) return;
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

  private giveHint(): void {
    if (this.done) return;
    if (this.tut !== null) {
      // The tutorial already shows the step; hints are free here.
      this.refresh();
      return;
    }
    const h = nextHint(this.p, this.vals, this.notes);
    if (h.kind === 'done') return;
    this.hints++;
    if (h.kind === 'wrong') {
      this.selected = h.cell;
      this.hint = { clue: h.cell, cell: h.cell };
      this.info(`<b>This one is wrong.</b> Clear it (or change it) and look again.`);
    } else if (h.kind === 'not') {
      this.notes[h.cell] = (this.notes[h.cell] || 7) & ~(1 << h.not);
      this.selected = h.cell;
      this.hint = { clue: h.clue, cell: h.cell };
      this.info(h.text);
    } else {
      this.selected = h.cell;
      this.hint = { clue: h.clue, cell: h.cell, clues: h.clues };
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
    if (this.tut !== null) {
      this.tut = TUTORIAL_STEPS.length;
      setTimeout(
        () =>
          showCard(
            `<h2>That's the whole game</h2><p>Every puzzle is solved like that: find a number whose neighbors leave only one way to add up, fill it in, and look again. Bigger boards just chain more of them.</p><p>Notes help when a hex is down to two options, and Hint always shows the next step.</p>`,
            [
              { label: 'Play a Small puzzle', primary: true, onClick: () => this.newPuzzle('small', 'normal', 'numbers') },
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
    const sk = this.solvedKey();
    prof.solvedBy = { ...prof.solvedBy, [sk]: (prof.solvedBy?.[sk] ?? 0) + 1 };
    const prev = prof.best[this.bestKey()];
    const score = this.total();
    const newBest = prev === undefined || score < prev;
    if (newBest) prof.best[this.bestKey()] = score;
    store.save('profile', prof);
    if (this.daily) recordDaily(store, 1e7 - Math.round(score / 1000), fmt(score), this.daily);
    setTimeout(() => this.showWin(newBest && prev !== undefined), 1400);
  }

  private showWin(newBest: boolean): void {
    const best = store.load<Profile>('profile', { solved: 0, best: {} }).best[this.bestKey()];
    const d = this.daily ? loadDaily(store, this.daily) : null;
    showCard(
      `<h2>Solved</h2>
       <p>${this.title()} puzzle in <b>${fmt(this.total())}</b>${this.hints ? ` (${fmt(this.ms)} + ${this.hints * 30}s for ${this.hints} hint${this.hints > 1 ? 's' : ''})` : ', no hints'}.${newBest ? ' <b style="color:var(--gold)">New best!</b>' : best !== undefined ? ` Best ${fmt(best)}.` : ''}</p>
       ${this.daily ? `<p><b style="color:var(--gold)">Daily puzzle · ${prettyDay(this.daily)}</b>${d ? `<br>Today's best: ${d.label}` : ''}</p>` : ''}`,
      [
        { label: `Another ${this.title().toLowerCase()} puzzle`, primary: true, onClick: () => this.newPuzzle(this.size) },
        { label: 'Other sizes', onClick: () => this.showNew() },
        { label: 'Look at the board', onClick: closeOverlay },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
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
        <li><b>Hint</b> shows the next step, or a wrong hex (+30 seconds each).</li>
      </ul>`,
      [
        { label: 'Show me (60-second tutorial)', primary: true, onClick: () => this.startTutorial() },
        { label: 'Just play', onClick: closeOverlay },
      ],
    );
  }

  private title(): string {
    return `${this.level === 'normal' ? '' : `${LEVELS[this.level].name} `}${SIZES[this.size].name.toLowerCase()}${this.p?.links ? ' links' : ''}`.replace(/^./, (c) => c.toUpperCase());
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
    showCard(
      `<h2>Triad</h2><p>${this.daily ? `Daily puzzle · ${prettyDay(this.daily)}` : `${this.title()} puzzle`} · ${fmt(this.total())}</p>`,
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
