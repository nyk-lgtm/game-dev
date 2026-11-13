// Gleam controller: board input (tap to cycle, drag from the tray or between
// sockets), undo/reset, hints, timer, saving (seed + actions), daily and cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { dailySeed, leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import {
  CODES_OF,
  COLOR_NAMES,
  CRYSTAL,
  LAMP,
  RULES_VERSION,
  SIZES,
  SOCKET,
  TYPES,
  WALL,
  cycleCode,
  generate,
  nextHint,
  piecesLeft,
  replay,
  setToken,
  status,
  typeOf,
  type Puzzle,
  type Size,
  type Status,
} from './core';
import { MASK_CSS, cellAt, crystalSvg, drawBoard, lampSvg, layout, pieceSvg, type View } from './render/draw';

export const store = makeStore('gleam.');

const $ = (id: string) => document.getElementById(id)!;

export interface SavedRun {
  v: number;
  seed: number;
  size: Size;
  /** Actions (see core/play.ts). */
  a: string;
  ms: number;
  hints: number;
  done: boolean;
  day?: string | null;
}

export const validSave = (s: SavedRun | null | undefined): s is SavedRun =>
  !!s && s.v === RULES_VERSION && typeof s.a === 'string' && Object.hasOwn(SIZES, s.size) && Number.isFinite(s.seed);

interface Profile {
  solved: number;
  solvedBy: Partial<Record<Size, number>>;
  /** Best time per size (ms, hints included). */
  best: Partial<Record<Size, number>>;
}
const loadProfile = (): Profile => ({ solved: 0, solvedBy: {}, best: {}, ...store.load<Partial<Profile>>('profile', {}) });

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const HINT_MS = 30000;
const TYPE_SHORT = ['Mirror', 'Splitter', 'Red', 'Green', 'Blue'];
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

interface Press {
  id: number;
  x: number;
  y: number;
  /** Dragging a piece from the tray (type) or from a socket (socket index). */
  type: number;
  from: number;
  dragging: boolean;
}

export class Game {
  p!: Puzzle;
  seed = 0;
  size: Size = 'small';
  daily: string | null = null;
  a = '';
  board: number[] = [];
  hints = 0;
  ms = 0;
  done = false;
  armed = -1;
  private st!: Status;
  private undoDepth = 0;
  private selected = -1;
  private hint: { socket: number; cells: number[]; bad: boolean } | null = null;
  private canvas = $('board') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private view!: View;
  private time = 0;
  private last = 0;
  private winT = -1;
  private lastSave = 0;
  private press: Press | null = null;
  private ghost: HTMLDivElement | null = null;
  private photons = !reducedFx();

  constructor() {
    this.canvas.addEventListener('pointerdown', (e) => this.down(e, -1));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', () => this.cancelPress());
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    $('undoBtn').onclick = () => this.undo();
    $('resetBtn').onclick = () => this.askReset();
    $('hintBtn').onclick = () => this.giveHint();
    document.addEventListener('visibilitychange', () => this.save(true));
    addEventListener('pagehide', () => this.save(true));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- lifecycle

  start(seed: number, size: Size, saved?: SavedRun | null, daily: string | null = null): void {
    closeOverlay();
    this.seed = seed;
    this.size = size;
    this.daily = daily;
    this.p = generate(seed, size);
    this.a = saved?.a ?? '';
    this.ms = saved?.ms ?? 0;
    this.hints = saved?.hints ?? 0;
    this.done = saved?.done ?? false;
    this.armed = -1;
    this.selected = -1;
    this.hint = null;
    this.winT = -1;
    this.rebuild();
    this.resize();
    this.save(true);
    if (this.done) setTimeout(() => this.showWin(false), 300);
  }

  newPuzzle(size: Size = this.size): void {
    closeOverlay();
    leaveDaily();
    store.save('size', size);
    this.start((Math.random() * 0xffffffff) >>> 0, size);
  }

  playDaily(): void {
    closeOverlay();
    const day = todayKey();
    const saved = store.load<SavedRun | null>('dailyRun', null);
    if (validSave(saved) && saved.day === day) this.start(saved.seed, saved.size, saved, day);
    else this.start(dailySeed('gleam', day), 'medium', null, day);
  }

  resumeOwn(): void {
    closeOverlay();
    leaveDaily();
    const saved = store.load<SavedRun | null>('run', null);
    if (validSave(saved)) this.start(saved.seed, saved.size, saved);
    else this.newPuzzle('small');
  }

  save(now = false): void {
    if (!this.p) return;
    const t = performance.now();
    if (!now && t - this.lastSave < 3000) return;
    this.lastSave = t;
    const run: SavedRun = { v: RULES_VERSION, seed: this.seed, size: this.size, a: this.a, ms: Math.round(this.ms), hints: this.hints, done: this.done, day: this.daily };
    store.save(this.daily ? 'dailyRun' : 'run', run);
  }

  // ---------------------------------------------------------------- moves

  /** Recomputes the board and the light from the actions. */
  private rebuild(): void {
    const r = replay(this.p, this.a);
    this.board = r.board;
    this.undoDepth = r.undo.length;
    this.st = status(this.p, this.board);
    if (this.armed >= 0 && piecesLeft(this.p, this.board)[this.armed] <= 0) this.armed = -1;
    this.refresh();
  }

  private act(tok: string, buzz = 8): void {
    if (this.done) return;
    this.a += tok;
    this.hint = null;
    navigator.vibrate?.(buzz);
    this.rebuild();
    this.save(true);
    if (this.st.solved) this.win();
  }

  /** Puts a code on a socket if the tray allows it; false when it doesn't. */
  private place(i: number, code: number): boolean {
    if (this.p.given[i] >= 0 || this.board[i] === code) return false;
    if (code > 0) {
      const left = piecesLeft(this.p, this.board);
      if (this.board[i] > 0) left[typeOf(this.board[i])]++;
      if (left[typeOf(code)] <= 0) {
        toast(`No ${TYPES[typeOf(code)]}s left`);
        return false;
      }
    }
    this.act(setToken(i, code));
    return true;
  }

  private undo(): void {
    if (this.done || !this.undoDepth) return;
    this.act('U', 4);
  }

  private askReset(): void {
    if (this.done || this.board.every((c, i) => c === Math.max(0, this.p.given[i]))) return;
    showCard('<h2>Clear the board?</h2><p>Every piece goes back to the tray (Undo brings them back). The clock keeps running.</p>', [
      { label: 'Keep it', primary: true, onClick: closeOverlay },
      {
        label: 'Clear it',
        onClick: () => {
          closeOverlay();
          this.act('R');
        },
      },
    ]);
  }

  private giveHint(): void {
    if (this.done) return;
    const h = nextHint(this.p, this.board);
    if (h.kind === 'done') return;
    this.hints++;
    if (h.kind === 'wrong') {
      this.hint = { socket: h.socket, cells: [], bad: true };
      const code = this.board[h.socket];
      this.info(`<b>This ${TYPES[typeOf(code)]} isn't part of the answer</b>${this.p.solution[h.socket] > 0 ? ' (not this way round)' : ''}. Tap it to change it, or drag it off the board.`);
      this.save(true);
      return;
    }
    this.a += setToken(h.socket, h.code, true);
    this.rebuild();
    this.hint = { socket: h.socket, cells: h.cells, bad: false };
    this.info(`${h.text}${h.depth >= 2 ? ' <i>(This one needs a look ahead.)</i>' : ''}`);
    navigator.vibrate?.(10);
    this.save(true);
    if (this.st.solved) this.win();
  }

  // ---------------------------------------------------------------- input

  private sockIdx(cell: number): number {
    return cell >= 0 && this.p.kind[cell] === SOCKET ? this.p.sockets.indexOf(cell) : -1;
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /** A press on the canvas (type -1) or on a tray piece (type ≥ 0). */
  down(e: PointerEvent, type: number): void {
    if (!this.p || this.press) return;
    let from = -1;
    if (type < 0) {
      const i = this.sockIdx(cellAt(this.view, ...this.local(e)));
      if (i >= 0 && this.board[i] > 0 && this.p.given[i] < 0 && !this.done) from = i;
    }
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, type, from, dragging: false };
  }

  private move(e: PointerEvent): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    if (!pr.dragging) {
      if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 10 || this.done) return;
      if (pr.type < 0 && pr.from < 0) return;
      if (pr.type >= 0 && piecesLeft(this.p, this.board)[pr.type] <= 0) return;
      pr.dragging = true;
      const code = pr.type >= 0 ? CODES_OF[pr.type][0] : this.board[pr.from];
      this.ghost = document.createElement('div');
      this.ghost.className = 'ghost';
      this.ghost.innerHTML = pieceSvg(code, Math.max(44, this.view.s));
      document.body.appendChild(this.ghost);
      this.draw();
    }
    // The piece floats above the finger so it stays in sight.
    const g = this.ghost!;
    g.style.left = `${e.clientX}px`;
    g.style.top = `${e.clientY - Math.max(30, this.view.s * 0.7)}px`;
  }

  private up(e: PointerEvent): void {
    const pr = this.press;
    if (!pr || e.pointerId !== pr.id) return;
    this.cancelPress();
    if (!pr.dragging) {
      if (pr.type >= 0) this.arm(pr.type);
      else if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 24) this.tap(cellAt(this.view, ...this.local(e)));
      return;
    }
    // Drop where the piece was shown (above the finger).
    const [lx, ly] = this.local(e);
    const to = this.sockIdx(cellAt(this.view, lx, ly - Math.max(30, this.view.s * 0.7)));
    if (pr.type >= 0) {
      if (to < 0) return;
      const cur = this.board[to];
      if (cur > 0 && typeOf(cur) === pr.type) return;
      this.place(to, CODES_OF[pr.type][0]);
      return;
    }
    if (to === pr.from) return;
    if (to < 0) this.act(setToken(pr.from, 0));
    else if (this.p.given[to] < 0) this.act(`M${pr.from.toString(36)}${to.toString(36)}`);
  }

  private cancelPress(): void {
    this.press = null;
    this.ghost?.remove();
    this.ghost = null;
    this.draw();
  }

  private arm(type: number): void {
    if (this.done) return;
    this.armed = this.armed === type ? -1 : type;
    if (this.armed >= 0 && piecesLeft(this.p, this.board)[type] <= 0) {
      toast(`No ${TYPES[type]}s left`);
      this.armed = -1;
    }
    this.refresh();
  }

  private tap(cell: number): void {
    if (cell < 0) {
      this.selected = -1;
      this.refresh();
      return;
    }
    const i = this.sockIdx(cell);
    if (i >= 0 && !this.done) {
      this.selected = -1;
      if (this.p.given[i] >= 0) {
        this.info('A <b>fixed</b> piece: it is part of the answer and can’t be moved.');
        this.draw();
        return;
      }
      if (this.armed >= 0 && this.board[i] === 0) this.place(i, CODES_OF[this.armed][0]);
      else {
        const code = cycleCode(this.p, this.board, i);
        if (code === this.board[i]) toast('The tray is empty: drag a piece off to free one');
        else this.place(i, code);
      }
      return;
    }
    this.selected = this.selected === cell ? -1 : cell;
    this.refresh();
  }

  // ---------------------------------------------------------------- win

  private win(): void {
    this.done = true;
    this.armed = -1;
    this.winT = 0;
    this.hint = null;
    this.save(true);
    const prof = loadProfile();
    prof.solved++;
    prof.solvedBy[this.size] = (prof.solvedBy[this.size] ?? 0) + 1;
    const score = this.total();
    const prev = prof.best[this.size];
    const newBest = prev === undefined || score < prev;
    if (newBest) prof.best[this.size] = score;
    store.save('profile', prof);
    if (this.daily) recordDaily(store, 1e7 - Math.round(score / 1000), fmt(score), this.daily);
    navigator.vibrate?.([20, 60, 30]);
    this.refresh();
    setTimeout(() => this.showWin(newBest && prev !== undefined), 1500);
  }

  private showWin(newBest: boolean): void {
    const best = loadProfile().best[this.size];
    const d = this.daily ? loadDaily(store, this.daily) : null;
    showCard(
      `<h2>All aglow</h2>
       <p>${this.daily ? 'Daily' : SIZES[this.size].name} puzzle in <b>${fmt(this.total())}</b>${this.hints ? ` (${fmt(this.ms)} + ${this.hints * 30}s for ${plural(this.hints, 'hint')})` : ', no hints'}.${newBest ? ' <b style="color:var(--gold)">New best!</b>' : best !== undefined && !this.daily ? ` Best ${fmt(best)}.` : ''}</p>
       ${this.daily ? `<p><b style="color:var(--gold)">Daily puzzle · ${prettyDay(this.daily)}</b>${d ? `<br>Today's best: ${d.label}` : ''}</p>` : ''}`,
      [
        { label: `Another ${SIZES[this.size].name.toLowerCase()} puzzle`, primary: true, onClick: () => this.newPuzzle(this.size) },
        { label: 'Other sizes', onClick: () => this.showNew() },
        { label: 'Look at the light', onClick: closeOverlay },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  // ---------------------------------------------------------------- UI

  private total(): number {
    return this.ms + this.hints * HINT_MS;
  }

  private showClock(): void {
    const s = fmt(this.total());
    if ($('clock').textContent !== s) $('clock').textContent = s;
    $('clock').classList.toggle('pen', this.hints > 0);
  }

  private info(html: string): void {
    $('info').innerHTML = html;
  }

  /** Words for what a tapped tile is. */
  private describe(c: number): string {
    const k = this.p.kind[c];
    if (k === LAMP) {
      const l = this.p.lamps.find((l) => l.cell === c)!;
      return `A <b style="color:${MASK_CSS[l.mask]}">${COLOR_NAMES[l.mask]}</b> lamp${l.mask === 7 ? ': red, green and blue together (filters split them)' : ''}.`;
    }
    if (k === WALL) return 'Stone: it swallows light.';
    if (k === CRYSTAL) {
      const t = this.p.target[c];
      const g = this.st.light.got[c];
      if (t === 0) return g ? '<span class="bad">A dark crystal in the light!</span> Nothing may touch it.' : 'A <b>dark crystal</b>: no light may touch it.';
      const parts = [1, 2, 4].filter((b) => t & b).map((b) => COLOR_NAMES[b]);
      const mix = parts.length > 1 ? ` (${parts.join(' + ')})` : '';
      const now = g === t ? '<span class="good">Glowing.</span>' : g & ~t ? `<span class="bad">Getting ${COLOR_NAMES[g]}: too much.</span>` : g ? `Getting ${COLOR_NAMES[g]} so far.` : 'Dark so far.';
      return `Needs <b style="color:${MASK_CSS[t]}">${COLOR_NAMES[t]}</b>${mix}. ${now}`;
    }
    return this.st.light.lit[c] ? `Open floor in ${COLOR_NAMES[this.st.light.lit[c]]} light.` : 'Open floor.';
  }

  refresh(): void {
    if (!this.p) return;
    $('levelLabel').textContent = this.daily ? 'Daily' : SIZES[this.size].name;
    $('lit').textContent = `${this.st.done}/${this.st.targets}`;
    this.showClock();
    this.renderTray();
    ($('undoBtn') as HTMLButtonElement).disabled = this.done || !this.undoDepth;
    const left = this.st.left.reduce((a, b) => a + b, 0);
    if (this.done) this.info(`<b>All aglow!</b> ${fmt(this.total())}${this.hints ? ` · ${plural(this.hints, 'hint')}` : ''}`);
    else if (this.hint) {
      // Keep the hint text until the next move.
    } else if (this.selected >= 0) this.info(this.describe(this.selected));
    else if (this.armed >= 0) this.info(`Tap a ring to place a <b>${TYPES[this.armed]}</b>. Tap it again to turn it.`);
    else {
      const bits: string[] = [];
      const fresh = !this.a.length && this.board.every((c, i) => c <= 0 || this.p.given[i] >= 0);
      if (fresh) bits.push('Light every crystal in its colour. Tap a ring to place a piece, tap again to turn it, or drag one in from the tray.');
      else if (this.st.wrong.length) bits.push(`<span class="bad">${this.st.wrong.some((c) => this.p.target[c] === 0) ? 'A dark crystal is lit' : 'A crystal has the wrong colour'}.</span>`);
      if (!fresh && this.st.unlit.length) bits.push(`<span class="bad">${plural(this.st.unlit.length, 'piece')} in the dark.</span>`);
      if (fresh) {
        // The opening line says it all.
      } else if (left > 0) bits.push(`${plural(left, 'piece')} left in the tray.`);
      else if (!bits.length) bits.push('Every piece is out. Something is still not lit right.');
      this.info(bits.join(' '));
    }
    this.draw();
  }

  private renderTray(): void {
    const tray = $('tray');
    const left = piecesLeft(this.p, this.board);
    // Fixed pieces never leave the board, so the tray only shows what you place.
    const own = [...this.p.stock];
    this.p.given.forEach((g) => g > 0 && own[typeOf(g)]--);
    const types = own.map((k, t) => (k > 0 ? t : -1)).filter((t) => t >= 0);
    const key = `${this.seed}:${this.size}:${types.join()}`;
    if (tray.dataset.key !== key) {
      tray.dataset.key = key;
      tray.innerHTML = '';
      for (const t of types) {
        const b = document.createElement('button');
        b.className = 'piece';
        b.dataset.t = String(t);
        b.innerHTML = `${pieceSvg(CODES_OF[t][0], 34)}<span class="name">${TYPE_SHORT[t]}</span><span class="n"></span>`;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.down(e, t);
        });
        tray.appendChild(b);
      }
    }
    tray.querySelectorAll<HTMLButtonElement>('button.piece').forEach((b) => {
      const t = Number(b.dataset.t);
      b.querySelector('.n')!.textContent = `×${left[t]}`;
      b.classList.toggle('empty', left[t] <= 0);
      b.classList.toggle('on', this.armed === t);
    });
  }

  private resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.p) this.view = layout(this.p.n, w, h);
    this.draw();
  }

  private draw(): void {
    if (!this.p || !this.view) return;
    drawBoard(this.ctx, this.view, this.p, {
      board: this.board,
      light: this.st.light,
      time: this.time,
      armed: this.armed,
      dragFrom: this.press?.dragging ? this.press.from : -1,
      hint: this.hint,
      selected: this.selected,
      win: this.winT,
      photons: this.photons,
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
    if (this.winT >= 0) this.winT += dt;
    this.draw();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  // ---------------------------------------------------------------- cards

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>How to play</h2>
      <p>${lampSvg(2, 22)} Lamps shine coloured light. Make every crystal ${crystalSvg(5, 22)} glow its exact colour.</p>
      <ul>
        <li>Put <b>every piece</b> from the tray on a ring. Each one must sit in a beam.</li>
        <li>${pieceSvg(1, 24)} A <b>mirror</b> turns light. ${pieceSvg(3, 24)} A <b>splitter</b> lets it through and turns a copy. ${pieceSvg(5, 24)} A <b>filter</b> lets only its own colour pass.</li>
        <li>Light meeting in a crystal adds up: <b style="color:${MASK_CSS[1]}">red</b> + <b style="color:${MASK_CSS[2]}">green</b> = <b style="color:${MASK_CSS[3]}">yellow</b>, red + <b style="color:${MASK_CSS[4]}">blue</b> = <b style="color:${MASK_CSS[5]}">magenta</b>, green + blue = <b style="color:${MASK_CSS[6]}">cyan</b>, all three = <b>white</b>. The dots on a crystal are the colours it needs.</li>
        <li>${crystalSvg(0, 20)} <b>Dark crystals</b> must stay dark. Stone swallows light.</li>
        <li>Tap a ring to place a piece and again to turn it; or drag one from the tray. Drag a piece off the board to take it back.</li>
        <li>One answer, no guessing. <b>Hint</b> shows the next step and why (+30 s).</li>
      </ul>`,
      [{ label: this.daily ? 'Play the daily' : 'Play', primary: true, onClick: closeOverlay }],
    );
  }

  showNew(): void {
    const prof = loadProfile();
    const sizes = Object.keys(SIZES) as Size[];
    const text: Record<Size, string> = {
      small: 'mirrors and splitters, two lamps',
      medium: 'filters and white light join in',
      large: 'more pieces; needs a look ahead',
    };
    showCard(
      `<h2>New puzzle</h2><p>Every puzzle has one answer you can reason out.</p>`,
      sizes.map((s) => {
        const b = prof.best[s];
        const n = prof.solvedBy[s] ?? 0;
        return {
          label: `${SIZES[s].name} ${SIZES[s].n}×${SIZES[s].n} · ${text[s]}${b !== undefined ? ` · best ${fmt(b)}` : n ? ` · ${n} solved` : ''}`,
          primary: s === this.size && !this.daily,
          onClick: () => this.newPuzzle(s),
        };
      }),
    );
  }

  showMenu(): void {
    const d = loadDaily(store, todayKey());
    showCard(`<h2>Gleam</h2><p>${this.daily ? `Daily puzzle · ${prettyDay(this.daily)}` : `${SIZES[this.size].name} puzzle`} · ${fmt(this.total())}</p>`, [
      { label: 'Resume', primary: true, onClick: closeOverlay },
      { label: 'New puzzle', onClick: () => this.showNew() },
      this.daily ? { label: 'Back to my puzzle', onClick: () => this.resumeOwn() } : { label: `Daily puzzle${d ? ` (${d.label})` : ''}`, onClick: () => this.playDaily() },
      { label: 'Clear the board', onClick: () => this.askReset() },
      { label: 'How to play', onClick: () => this.showHelp() },
      { label: 'Copy bug report', onClick: () => this.copyReport() },
      { label: 'All games', onClick: () => (location.href = '../') },
    ]);
  }

  private async copyReport(): Promise<void> {
    const text = `GLEAM v${RULES_VERSION} seed=${this.seed} size=${this.size} a=${this.a}\n${location.origin}${location.pathname}?seed=${this.seed}&size=${this.size}&a=${encodeURIComponent(this.a)}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}
