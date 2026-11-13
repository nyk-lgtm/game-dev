// Brink controller: board input (tap a stone, then a dot or arrow; or drag),
// move animations, the AI's turn, undo, hints, puzzles (lessons and the daily),
// saving after every move, stats per level, and the cards.

import { closeOverlay, showCard } from '../shared/cards';
import { copyText, toast } from '../shared/debug';
import { leaveDaily, loadDaily, prettyDay, recordDaily, todayKey } from '../shared/daily';
import { pxToHex } from '../shared/hexlayout';
import { reducedFx } from '../shared/settings';
import { makeStore } from '../shared/storage';
import { Sounds } from './audio';
import {
  DARK,
  EMPTY,
  LEVELS,
  LIGHT,
  RULES_VERSION,
  TUNE,
  bestDefence,
  cellAt,
  chooseMove,
  clone,
  crumbleAfter,
  chancesNow,
  threatenedNext,
  stoneKey,
  dirTo,
  lineCount,
  HOLE,
  dailyPuzzle,
  decodeMove,
  encodeMove,
  isLegal,
  isShove,
  lessonPuzzles,
  moveCell,
  moveTo,
  play,
  replay,
  search,
  stoneMoves,
  winningMoves,
  type Level,
  type MoveEvents,
  type Puzzle,
  type Side,
  type State,
} from './core';
import { DOOM_COLOR, cellPx, drawScene, layout, stoneSvg, type Scene, type Sprite, type Target, type View } from './render/draw';

export const store = makeStore('brink.');

const $ = (id: string) => document.getElementById(id)!;
const LEVEL_IDS: Level[] = ['easy', 'normal', 'hard'];
type Starts = 'you' | 'ai' | 'alt';

export interface SavedGame {
  v: number;
  seed: number;
  level: Level;
  first: Side;
  a: string;
  hints: number;
  undos: number;
  /** Stats already counted for this game. */
  counted?: boolean;
}

interface SavedPuzzle {
  v: number;
  id: string;
  a: string;
  tries: number;
}

export interface Profile {
  games: number;
  won: Record<Level, number>;
  lost: Record<Level, number>;
  /** Lesson ids solved. */
  solved: string[];
  /** Daily puzzles solved. */
  dailies: number;
}

const freshProfile = (): Profile => ({ games: 0, won: { easy: 0, normal: 0, hard: 0 }, lost: { easy: 0, normal: 0, hard: 0 }, solved: [], dailies: 0 });
export const loadProfile = (): Profile => ({ ...freshProfile(), ...store.load<Partial<Profile>>('profile', {}) });

export const validGame = (g: SavedGame | null | undefined): g is SavedGame =>
  !!g && g.v === RULES_VERSION && Number.isFinite(g.seed) && g.level in LEVELS && (g.first === LIGHT || g.first === DARK);

interface Anim {
  t: number;
  before: Int8Array;
  mid: Int8Array;
  slid: [number, number][];
  /** Pixel step of the move (for stones going over). */
  vx: number;
  vy: number;
  crumbled: number;
  slideDur: number;
  total: number;
  over: boolean;
  done: () => void;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export class Game {
  s!: State;
  seed = 0;
  level: Level = 'normal';
  first: Side = LIGHT;
  starts: Starts = 'you';
  moves: number[] = [];
  /** Who made each move. */
  who: Side[] = [];
  /** Stone layouts (`stoneKey`) from the start and after each move, so the AI can avoid cycles. */
  keys: number[] = [];
  mode: 'game' | 'puzzle' = 'game';
  puzzle: Puzzle | null = null;
  /** The day of a daily puzzle being played. */
  daily: string | null = null;
  puzzleLeft = 0;
  puzzleFailed = false;
  tries = 0;
  hints = 0;
  undos = 0;
  counted = false;
  selected = -1;
  thinking = false;
  private targets: Target[] = [];
  private danger: number[] = [];
  private threats: number[] = [];
  private chances: number[] = [];
  private hint: { from: number; to: number } | null = null;
  private last: Scene['last'] = null;
  private anim: Anim | null = null;
  private gen = 0;
  private shake = 0;
  private time = 0;
  private lastT = 0;
  private downCell = -1;
  private downSelected = false;
  private canvas = $('board') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private view!: View;
  private snd = new Sounds();
  private reduced = reducedFx();

  constructor() {
    this.starts = store.load<Starts>('starts', 'you');
    this.level = store.load<Level>('level', 'normal');
    if (!(this.level in LEVELS)) this.level = 'normal';
    this.canvas.addEventListener('pointerdown', (e) => {
      this.snd.unlock();
      this.downCell = this.cellAtEvent(e);
      this.downSelected = false;
      // A press on your own stone selects it, unless it is a target of the selected stone
      // (a shove with your own stone in front): then the tap plays that shove.
      if (this.downCell >= 0 && this.canPlay() && this.s.cells[this.downCell] === LIGHT && this.downCell !== this.selected && !this.targets.some((t) => t.cell === this.downCell)) {
        this.select(this.downCell);
        this.downSelected = true;
      }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      const c = this.cellAtEvent(e);
      const d = this.downCell;
      this.downCell = -1;
      // A drag from your stone onto one of its targets plays it.
      if (d >= 0 && c !== d && this.selected === d && this.targets.some((t) => t.cell === c)) return this.tryMove(d * 64 + c);
      // The press that just selected a stone doesn't also deselect it.
      if (c === d && !(this.downSelected && c === this.selected)) this.tap(c);
    });
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    $('undoBtn').onclick = () => this.undo();
    $('hintBtn').onclick = () => this.giveHint();
    $('puzzBtn').onclick = () => this.showPuzzles();
    document.addEventListener('visibilitychange', () => this.save());
    addEventListener('pagehide', () => this.save());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- lifecycle

  /** A new or saved game against the AI. */
  start(seed: number, level: Level, first: Side, moves: (number | string)[] = [], extra?: Partial<SavedGame>): void {
    closeOverlay();
    this.gen++;
    this.mode = 'game';
    this.puzzle = null;
    this.daily = null;
    this.seed = seed >>> 0;
    this.level = level;
    this.first = first;
    this.hints = extra?.hints ?? 0;
    this.undos = extra?.undos ?? 0;
    this.counted = extra?.counted ?? false;
    this.rebuild(moves.map((m) => (typeof m === 'string' ? decodeMove(m) : m)));
    // A finished game opened from a link or a save isn't counted (again).
    if (this.s.winner) this.counted = true;
    this.resetUi();
    this.save();
    if (this.s.winner) setTimeout(() => this.showResult(), 400);
    else if (this.s.turn === DARK) this.aiTurn();
  }

  /** Replays the moves from the seed (stops at an illegal one) and tracks who made each. */
  private rebuild(moves: number[]): void {
    this.s = replay(this.seed, [], this.first);
    this.moves = [];
    this.who = [];
    this.last = null;
    this.keys = [stoneKey(this.s)];
    for (const m of moves) {
      if (!isLegal(this.s, m)) break;
      const mover = this.s.turn;
      this.who.push(mover);
      this.last = lastOf(m, play(this.s, m), mover, this.s);
      this.moves.push(m);
      this.keys.push(stoneKey(this.s));
    }
  }

  private resetUi(): void {
    this.lastSay = '';
    this.selected = -1;
    this.targets = [];
    this.danger = [];
    this.hint = null;
    this.anim = null;
    this.thinking = false;
    this.resize();
    this.refresh();
  }

  newGame(level = this.level, starts = this.starts): void {
    leaveDaily();
    this.level = level;
    this.starts = starts;
    store.save('level', level);
    store.save('starts', starts);
    let first: Side = starts === 'ai' ? DARK : LIGHT;
    if (starts === 'alt') {
      const n = store.load<number>('altCount', 0);
      first = n % 2 === 0 ? LIGHT : DARK;
      store.save('altCount', n + 1);
    }
    this.start((Math.random() * 0xffffffff) >>> 0, level, first);
  }

  /** Back to the saved game (from a puzzle). */
  resumeGame(): void {
    leaveDaily();
    const g = store.load<SavedGame | null>('game', null);
    store.save('puzzle', null);
    if (validGame(g)) this.start(g.seed, g.level, g.first, g.a ? g.a.split(',') : [], g);
    else this.newGame();
  }

  startPuzzle(p: Puzzle, daily: string | null = null, moves: string[] = [], tries = 0): void {
    closeOverlay();
    this.gen++;
    this.mode = 'puzzle';
    this.puzzle = p;
    this.daily = daily;
    this.tries = tries;
    this.hints = 0;
    this.restartPuzzle(false);
    // Restore a saved attempt.
    for (const t of moves) {
      const m = decodeMove(t);
      if (!isLegal(this.s, m)) break;
      const mover = this.s.turn;
      this.who.push(mover);
      this.last = lastOf(m, play(this.s, m), mover, this.s);
      this.moves.push(m);
      this.keys.push(stoneKey(this.s));
      if (mover === LIGHT) this.puzzleLeft--;
    }
    this.resetUi();
    this.save();
    if (this.s.winner === LIGHT) setTimeout(() => this.puzzleSolved(false), 300);
  }

  private restartPuzzle(redraw = true): void {
    if (!this.puzzle) return;
    this.gen++;
    this.s = clone(this.puzzle.state);
    this.moves = [];
    this.who = [];
    this.keys = [stoneKey(this.s)];
    this.last = null;
    this.puzzleLeft = this.puzzle.n;
    this.puzzleFailed = false;
    if (redraw) {
      this.resetUi();
      this.save();
    }
  }

  playDaily(): void {
    const day = todayKey();
    const p = dailyPuzzle(day);
    const saved = store.load<SavedPuzzle | null>('puzzle', null);
    if (saved && saved.v === RULES_VERSION && saved.id === p.id) this.startPuzzle(p, day, saved.a ? saved.a.split(',') : [], saved.tries);
    else this.startPuzzle(p, day);
    if (!store.load('seenPuzzleTip', false)) {
      store.save('seenPuzzleTip', true);
      setTimeout(() => this.puzzleTip(), 200);
    }
  }

  playLesson(id: string): void {
    leaveDaily();
    const p = lessonPuzzles().find((l) => l.id === id);
    if (p) this.startPuzzle(p);
  }

  save(): void {
    if (!this.s) return;
    if (this.mode === 'game') {
      const g: SavedGame = { v: RULES_VERSION, seed: this.seed, level: this.level, first: this.first, a: this.moves.map(encodeMove).join(','), hints: this.hints, undos: this.undos, counted: this.counted };
      store.save('game', g);
      store.save('puzzle', null);
    } else if (this.puzzle) {
      const p: SavedPuzzle = { v: RULES_VERSION, id: this.puzzle.id, a: this.moves.map(encodeMove).join(','), tries: this.tries };
      store.save('puzzle', p);
    }
  }

  // ---------------------------------------------------------------- input

  private cellAtEvent(e: PointerEvent): number {
    if (!this.view) return -1;
    const r = this.canvas.getBoundingClientRect();
    const h = pxToHex(this.view.L, e.clientX - r.left, e.clientY - r.top);
    return cellAt(h.q, h.r);
  }

  /** It's your turn and nothing is moving. */
  private canPlay(): boolean {
    return !!this.s && !this.s.winner && !this.anim && !this.thinking && this.s.turn === LIGHT && !(this.mode === 'puzzle' && this.puzzleFailed);
  }

  private tap(c: number): void {
    if (!this.s || this.anim) return;
    if (this.s.winner) {
      if (this.mode === 'game' && this.counted) this.showResult();
      return;
    }
    if (this.mode === 'puzzle' && this.puzzleFailed) return this.puzzleMissed();
    if (this.thinking || this.anim) return;
    if (this.s.turn !== LIGHT) return;
    if (c < 0) return this.deselect();
    const t = this.targets.find((x) => x.cell === c);
    if (this.selected >= 0 && t) return this.tryMove(this.selected * 64 + c);
    if (this.s.cells[c] === LIGHT) {
      if (c === this.selected) return this.deselect();
      return this.select(c);
    }
    if (this.s.cells[c] === DARK) {
      const d = this.selected >= 0 ? dirTo(this.selected, c) : -1;
      if (d >= 0 && lineCount(this.s.cells, c, d) < 0) this.info('<b>Three in a row won’t budge.</b> That line is too long to shove.');
      else this.info('That’s an AI stone. Tap one of your <b>ivory</b> stones first; arrows show what it can shove.');
    }
    this.deselect(false);
  }

  private select(c: number): void {
    this.selected = c;
    this.snd.pick();
    navigator.vibrate?.(5);
    const out: number[] = [];
    stoneMoves(this.s.cells, c, out);
    this.targets = [];
    this.danger = [];
    for (const m of out) {
      const to = moveTo(m);
      // Play it on a copy: what is lost, shoved over or taken by the falling tile?
      const t = clone(this.s);
      const ev = play(t, m);
      const lostThem = t.lost[DARK] - this.s.lost[DARK];
      const lostUs = t.lost[LIGHT] - this.s.lost[LIGHT];
      if (ev.shovedOff) this.danger.push(ev.shovedOff.from);
      if (ev.crumbleTook) this.danger.push(ev.crumbled);
      this.targets.push({ cell: to, from: c, push: isShove(this.s, m), kind: lostUs > 0 ? 'oops' : lostThem > 0 ? 'kill' : 'plain' });
    }
    if (!this.targets.length) this.info('This stone is stuck: holes and lines of three all round. Try another.');
    else {
      const kill = this.targets.some((t) => t.kind === 'kill');
      const oops = this.targets.some((t) => t.kind === 'oops');
      this.info(
        `${this.targets.some((t) => !t.push) ? 'Dots step. ' : ''}${this.targets.some((t) => t.push) ? 'Arrows shove. ' : ''}${kill ? '<b class="good">Red loses them a stone!</b> ' : ''}${oops ? '<b class="bad">Purple loses one of yours.</b>' : ''}`,
      );
    }
    this.draw();
  }

  private deselect(redraw = true): void {
    this.selected = -1;
    this.targets = [];
    this.danger = [];
    if (redraw) this.refresh();
    else this.draw();
  }

  private tryMove(m: number): void {
    if (!this.canPlay() || !isLegal(this.s, m)) return;
    let solves = true;
    if (this.mode === 'puzzle') {
      const w = winningMoves(this.s, this.puzzleLeft, 400000) ?? [];
      solves = w.includes(m);
      this.puzzleLeft--;
    }
    this.selected = -1;
    this.targets = [];
    this.danger = [];
    this.hint = null;
    this.apply(m, () => {
      if (this.mode === 'puzzle') {
        if (this.s.winner === LIGHT) return this.puzzleSolved(true);
        if (!solves || this.puzzleLeft <= 0) {
          this.puzzleFailed = true;
          this.tries++;
          this.save();
        }
        if (!this.s.winner && this.s.turn === DARK) return this.puzzleReply();
        if (this.puzzleFailed) return this.puzzleMissed();
        this.refresh();
        return;
      }
      this.afterMove();
    });
  }

  /** Plays a move with its animation, sounds and the save, then calls `next`. */
  private apply(m: number, next: () => void): void {
    const mover = this.s.turn;
    const before = this.s.cells.slice();
    const lostBefore = [0, this.s.lost[1], this.s.lost[2]];
    const ev = play(this.s, m);
    this.moves.push(m);
    this.who.push(mover);
    this.keys.push(stoneKey(this.s));
    this.last = lastOf(m, ev, mover, this.s, before);
    this.save();
    // Sounds and haptics.
    if (ev.slid.length > 1) this.snd.shove(ev.slid.length - 1);
    else this.snd.slide();
    if (ev.shovedOff) setTimeout(() => this.snd.over(), 160);
    if (ev.crumbled >= 0) setTimeout(() => this.snd.crumble(), 260);
    if (ev.shovedOff || ev.crumbleTook) navigator.vibrate?.(ev.shovedOff?.side === LIGHT || ev.crumbleTook === LIGHT ? [20, 40, 30] : 25);
    else navigator.vibrate?.(6);
    this.say(ev, mover, lostBefore);
    this.startAnim(before, ev, m, next);
    this.refresh();
  }

  /** A line about what just happened. */
  private say(ev: MoveEvents, mover: Side, lostBefore: number[]): void {
    const you = mover === LIGHT;
    const parts: string[] = [];
    if (ev.shovedOff) {
      const where = ev.shovedOff.intoHole ? 'Into the hole!' : 'Over the edge!';
      if (ev.shovedOff.side === DARK) parts.push(you ? `<b class="good">${where}</b>` : 'The AI shoved its own stone off!');
      else parts.push(you ? '<b class="bad">You shoved your own stone off.</b>' : '<b class="bad">The AI shoved one of yours off.</b>');
    } else if (ev.slid.length > 1 && !you) parts.push('The AI shoved.');
    else if (!you) parts.push('The AI stepped (dotted trail).');
    if (ev.crumbleTook) parts.push(ev.crumbleTook === LIGHT ? '<b class="bad">A tile crumbled under your stone.</b>' : '<b class="good">A tile crumbled under an AI stone.</b>');
    void lostBefore;
    this.lastSay = parts.join(' ');
  }
  private lastSay = '';

  private startAnim(before: Int8Array, ev: MoveEvents, m: number, done: () => void): void {
    const mid = this.s.cells.slice();
    if (ev.crumbled >= 0) mid[ev.crumbled] = ev.crumbleTook || EMPTY;
    const a = cellPx(this.view, moveCell(m));
    const b = cellPx(this.view, moveTo(m));
    const slideDur = this.reduced ? 0.14 : 0.2;
    const over = !!ev.shovedOff;
    const total = slideDur + (over ? 0.45 : 0) + (ev.crumbled >= 0 ? 0.5 : 0) + 0.05;
    this.anim = { t: 0, before, mid, slid: ev.slid, vx: b.x - a.x, vy: b.y - a.y, crumbled: ev.crumbled, slideDur, total, over, done };
    if (over && !this.reduced) this.shake = 5;
  }

  private afterMove(): void {
    if (this.s.winner) return this.finish();
    if (this.mode === 'game' && this.s.turn === DARK) return this.aiTurn();
    this.refresh();
  }

  private aiTurn(): void {
    const g = this.gen;
    this.thinking = true;
    this.refresh();
    // Let the "thinking" line paint before the search blocks the page.
    setTimeout(() => {
      if (g !== this.gen) return;
      const t0 = performance.now();
      const ch = chooseMove(this.s, this.level, this.moves, this.keys);
      const wait = Math.max(0, 420 - (performance.now() - t0));
      setTimeout(() => {
        if (g !== this.gen) return;
        this.thinking = false;
        if (ch.move < 0) return this.refresh();
        this.apply(ch.move, () => this.afterMove());
      }, wait);
    }, 60);
  }

  private puzzleReply(): void {
    const g = this.gen;
    this.thinking = true;
    this.refresh();
    setTimeout(() => {
      if (g !== this.gen) return;
      // On track: the defence that holds out longest; off track: the AI's best move.
      const m = this.puzzleFailed ? chooseMove(this.s, 'normal', this.moves, this.keys).move : bestDefence(this.s, this.puzzleLeft);
      setTimeout(() => {
        if (g !== this.gen) return;
        this.thinking = false;
        this.apply(m, () => {
          if (this.puzzleFailed || this.s.winner) return this.puzzleMissed();
          this.refresh();
        });
      }, 300);
    }, 60);
  }

  // ---------------------------------------------------------------- undo / hints

  private undo(): void {
    if (this.anim || this.thinking) return;
    if (this.mode === 'puzzle') {
      if (!this.moves.length) {
        toast('Nothing to undo');
        return;
      }
      this.snd.undo();
      this.restartPuzzle();
      this.info('Back to the start. Take another look.');
      return;
    }
    if (this.s.winner) {
      toast('The game is over: start a new one with ＋');
      return;
    }
    const moves = this.moves.slice();
    const who = this.who.slice();
    while (who.length && who[who.length - 1] === DARK) {
      moves.pop();
      who.pop();
    }
    if (!who.length) {
      toast('Nothing to undo');
      return;
    }
    moves.pop();
    who.pop();
    this.gen++;
    this.undos++;
    this.snd.undo();
    this.rebuild(moves);
    this.resetUi();
    this.save();
    this.info('Took back your last move.');
  }

  private giveHint(): void {
    if (!this.canPlay()) {
      if (this.mode === 'puzzle' && this.puzzleFailed) return this.puzzleMissed();
      return;
    }
    let m = -1;
    if (this.mode === 'puzzle') m = (winningMoves(this.s, this.puzzleLeft, 400000) ?? [])[0] ?? -1;
    else m = search(this.s, LEVELS.hard.depth, 40000).move;
    if (m < 0) return;
    this.hints++;
    this.snd.hint();
    this.deselect(false);
    this.hint = { from: moveCell(m), to: moveTo(m) };
    this.select(moveCell(m));
    this.info(`${this.mode === 'puzzle' ? 'This one:' : 'The AI would play this.'} ${isShove(this.s, m) ? 'Shove along the gold arrow.' : 'Step along the gold arrow.'}`);
    this.save();
  }

  // ---------------------------------------------------------------- endings

  private finish(): void {
    this.refresh();
    if (this.mode !== 'game') return;
    const won = this.s.winner === LIGHT;
    if (!this.counted) {
      this.counted = true;
      const p = loadProfile();
      p.games++;
      if (won) p.won[this.level]++;
      else p.lost[this.level]++;
      store.save('profile', p);
      this.save();
    }
    this.snd.end(won);
    setTimeout(() => this.showResult(), 900);
  }

  private statsLine(p = loadProfile()): string {
    return LEVEL_IDS.map((l) => `<span class="lv ${l === this.level ? 'cur' : ''}"><b>${LEVELS[l].name}</b> ${p.won[l]}–${p.lost[l]}</span>`).join('');
  }

  showResult(): void {
    if (!this.s.winner || this.mode !== 'game') return;
    const won = this.s.winner === LIGHT;
    const yourMoves = this.who.filter((w) => w === LIGHT).length;
    const how = won
      ? `${TUNE.target} coral stones gone after ${yourMoves} of your moves.`
      : `${TUNE.target} of your stones are gone. You lasted ${yourMoves} moves.`;
    const extras = [this.undos ? `${this.undos} undo${this.undos > 1 ? 's' : ''}` : '', this.hints ? `${this.hints} hint${this.hints > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
    const p = loadProfile();
    const nextUp = won && this.level !== 'hard' ? LEVEL_IDS[LEVEL_IDS.indexOf(this.level) + 1] : null;
    showCard(
      `<h2>${won ? 'You win!' : 'The AI wins'}</h2>
       <p>${how}${extras ? ` (${extras})` : ''}</p>
       <p class="score">${stoneSvg(LIGHT, 20)} <b>${this.s.lost[DARK]}</b> – <b>${this.s.lost[LIGHT]}</b> ${stoneSvg(DARK, 20)} · ${LEVELS[this.level].name}</p>
       <div class="stats"><span class="label">Your record (won–lost)</span><div>${this.statsLine(p)}</div></div>`,
      [
        { label: nextUp ? `Try ${LEVELS[nextUp].name}` : 'Rematch', primary: true, onClick: () => this.newGame(nextUp ?? this.level) },
        ...(nextUp ? [{ label: `Rematch on ${LEVELS[this.level].name}`, onClick: () => this.newGame(this.level) }] : []),
        { label: 'Other levels', onClick: () => this.showNew() },
        { label: 'Look at the board', onClick: closeOverlay },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private puzzleSolved(fresh: boolean): void {
    this.refresh();
    const p = this.puzzle!;
    if (fresh) {
      this.snd.end(true);
      const prof = loadProfile();
      if (this.daily) {
        const before = loadDaily(store, this.daily);
        if (!before) prof.dailies++;
        const label = this.tries === 0 ? (this.hints ? 'solved with a hint' : 'first try') : `${this.tries + 1} tries`;
        recordDaily(store, 100 - this.tries * 10 - this.hints * 5, label, this.daily);
      } else if (!prof.solved.includes(p.id)) prof.solved.push(p.id);
      store.save('profile', prof);
    }
    const lessons = lessonPuzzles();
    const k = lessons.findIndex((l) => l.id === p.id);
    const next = k >= 0 ? lessons[k + 1] : undefined;
    setTimeout(
      () =>
        showCard(
          `<h2>Solved!</h2><p>${p.title}${this.daily ? ` · ${prettyDay(this.daily)}` : ''}: ${this.tries ? `in ${this.tries + 1} tries` : 'first try'}${this.hints ? ' (with a hint)' : ''}.</p>${
            this.daily ? '<p>A new puzzle comes at midnight.</p>' : ''
          }${k >= 0 && !next ? '<p>That was the last lesson. The daily puzzle is a fresh win-in-2 or 3 from a real game every day.</p>' : ''}`,
          [
            next ? { label: `Next: ${next.title}`, primary: true, onClick: () => this.playLesson(next.id) } : this.daily ? { label: 'Play a game', primary: true, onClick: () => this.resumeGame() } : { label: 'Daily puzzle', primary: true, onClick: () => this.playDaily() },
            { label: 'Puzzles', onClick: () => this.showPuzzles() },
            { label: this.daily ? 'Lessons' : 'Back to my game', onClick: () => (this.daily ? this.showPuzzles() : this.resumeGame()) },
            { label: 'Look at the board', onClick: closeOverlay },
          ],
        ),
      fresh ? 900 : 0,
    );
  }

  private puzzleMissed(): void {
    this.refresh();
    const p = this.puzzle!;
    showCard(`<h2>Not quite</h2><p>That lets them off the hook${this.s.winner === DARK ? ' (they even won)' : ''}. ${p.text}</p>`, [
      { label: 'Try again', primary: true, onClick: () => (closeOverlay(), this.restartPuzzle()) },
      {
        label: 'Show me the first move',
        onClick: () => {
          closeOverlay();
          this.restartPuzzle();
          this.giveHint();
        },
      },
      { label: 'Look at the board', onClick: closeOverlay },
    ]);
  }

  // ---------------------------------------------------------------- drawing

  private info(html: string): void {
    $('info').innerHTML = html;
  }

  private pips(n: number, side: Side): string {
    return Array.from({ length: TUNE.target }, (_, k) => `<i class="pip ${k < n ? 'on' : ''}">${k < n ? stoneSvg(side, 14) : ''}</i>`).join('');
  }

  refresh(): void {
    if (!this.s) return;
    const s = this.s;
    // Planning hints: your stones the AI's reply could take (red), its stones you can take now (green).
    const yourTurn = !s.winner && s.turn === LIGHT && !this.thinking;
    this.threats = yourTurn ? threatenedNext(s) : [];
    this.chances = yourTurn ? chancesNow(s) : [];
    // Your stones on tiles that fall before your next turn.
    const doomed: number[] = [];
    for (let k = 1; k <= 2 && yourTurn; k++) {
      const c = crumbleAfter(s, s.ply - 1 + k);
      if (c >= 0 && s.cells[c] === LIGHT) doomed.push(k);
    }
    // HUD: stones each side has pushed off.
    $('youPips').innerHTML = this.pips(s.lost[DARK], DARK);
    $('aiPips').innerHTML = this.pips(s.lost[LIGHT], LIGHT);
    $('aiLabel').textContent = this.mode === 'puzzle' ? 'Them' : `AI · ${LEVELS[this.level].name}`;
    // Status strip.
    let left = '';
    if (this.mode === 'puzzle') {
      const p = this.puzzle!;
      left = `<b>${p.title}</b> · <span class="nw">win in ${p.n}</span>${s.winner ? '' : ` · <span class="nw">${this.puzzleLeft} move${this.puzzleLeft === 1 ? '' : 's'} left</span>`}`;
    } else if (s.winner) left = s.winner === LIGHT ? '<b class="good">You win!</b>' : '<b class="bad">The AI wins</b>';
    else if (this.thinking) left = '<span class="think">AI is thinking…</span>';
    else left = s.turn === LIGHT ? '<b>Your move</b>' : 'AI to move';
    let right = '';
    if (!s.winner) {
      // Counted in moves of either side, like the badges: 1 = after this move, 2 = after the reply.
      const first = TUNE.crumbleStart - s.ply + 1;
      const you = s.turn === LIGHT;
      if (first > 2) right = `First tile falls in ${first} moves`;
      else if (first === 2) right = `First tile falls after ${you ? 'the AI’s reply' : 'your reply'}`;
      else if (crumbleAfter(s, s.ply) >= 0) right = `${badge(1)} falls after this move`;
    }
    if (yourTurn && doomed.length) right = `<span class="bad">⚠ your stone on ${badge(doomed[0])}</span>`;
    $('status').innerHTML = `<span>${left}</span><span>${right}</span>`;
    // Info line.
    if (this.selected < 0) {
      if (this.mode === 'puzzle' && !s.winner)
        this.info(this.moves.length ? `${this.lastSay} ${this.puzzleFailed ? '' : `Win in ${this.puzzleLeft} now.`}` : this.puzzle!.text);
      else if (s.winner) this.info(this.lastSay || (s.winner === LIGHT ? 'You win.' : 'The AI wins.'));
      else if (this.thinking) this.info(this.lastSay || 'The AI is reading the board…');
      else if (!this.moves.length || this.moves.length < 2 && this.first === DARK)
        this.info(`${this.lastSay ? `${this.lastSay} ` : ''}Tap one of your ${stoneSvg(LIGHT, 16)} stones to see where it can go. Shove ${TUNE.target} coral stones off to win.`);
      else
        this.info(
          `${this.lastSay || 'Your move.'}${this.threats.length ? ' <span class="bad">Red rings: the AI’s reply could take those.</span>' : ''}${
            this.chances.length ? ' <span class="good">Green: yours to take.</span>' : ''
          }`,
        );
      // Loudest of all: a stone of yours standing on a tile about to fall.
      if (doomed.length && this.selected < 0)
        this.info(`<b class="bad">Your stone on ${badge(doomed[0])} falls ${doomed[0] === 1 ? 'right after this move' : 'after the AI’s reply'}: move it off!</b>`);
    }
    $('undoBtn').innerHTML = this.mode === 'puzzle' ? '↺ Retry' : '↶ Undo';
    ($('undoBtn') as HTMLButtonElement).disabled = this.mode === 'game' ? !this.who.includes(LIGHT) || !!s.winner : !this.moves.length;
    ($('hintBtn') as HTMLButtonElement).disabled = !this.canPlay();
    this.draw();
  }

  private resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view = layout(w, h);
    this.draw();
  }

  private scene(): Scene {
    const s = this.s;
    const doom = new Map<number, number>();
    if (!s.winner)
      for (let k = 1; k <= 3; k++) {
        const c = crumbleAfter(s, s.ply - 1 + k);
        if (c >= 0) doom.set(c, k);
      }
    const sc: Scene = {
      cells: s.cells,
      hide: new Set(),
      sprites: [],
      falling: new Map(),
      doom,
      selected: this.selected,
      targets: this.targets,
      last: this.anim ? null : this.last,
      hint: this.hint,
      danger: this.danger,
      threats: this.anim ? [] : this.threats,
      chances: this.anim ? [] : this.chances,
      time: this.time,
      shake: this.shake,
      reduced: this.reduced,
    };
    const a = this.anim;
    if (a) {
      const sz = this.view.L.size;
      const p = ease(a.t / a.slideDur);
      if (a.t < a.slideDur) {
        sc.cells = a.before;
        sc.doom = new Map();
      } else sc.cells = a.mid;
      for (const [from, to] of a.slid) {
        const A = cellPx(this.view, from);
        const side = a.before[from] as Side;
        if (to >= 0) {
          if (a.t < a.slideDur) {
            const B = cellPx(this.view, to);
            sc.hide.add(from);
            sc.sprites.push({ x: A.x + (B.x - A.x) * p, y: A.y + (B.y - A.y) * p, side, scale: 1, alpha: 1 });
          }
          continue;
        }
        // Going over: slide out past the edge, then drop away.
        sc.hide.add(from);
        const f = Math.max(0, (a.t - a.slideDur) / 0.45);
        const sp: Sprite = { x: A.x + a.vx * p, y: A.y + a.vy * p + f * f * sz * 2.4, side, scale: 1 - 0.55 * Math.min(1, f), alpha: Math.max(0, 1 - f) };
        if (f < 1) sc.sprites.push(sp);
      }
      if (a.crumbled >= 0 && a.t >= a.slideDur) {
        const start = a.slideDur + (a.over ? 0.2 : 0);
        sc.falling.set(a.crumbled, Math.min(1, Math.max(0, (a.t - start) / 0.5)));
      }
    }
    return sc;
  }

  private draw(): void {
    if (!this.s || !this.view) return;
    drawScene(this.ctx, this.view, this.scene());
  }

  private frame(t: number): void {
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000);
    this.lastT = t;
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    const a = this.anim;
    if (a) {
      a.t += dt;
      if (a.t >= a.total) {
        this.anim = null;
        this.draw();
        a.done();
      } else this.draw();
    } else if (this.hint || this.shake || (!this.reduced && this.s && !this.s.winner && crumbleAfter(this.s, this.s.ply + 1) >= 0)) this.draw();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  // ---------------------------------------------------------------- cards

  showHelp(): void {
    store.save('seenHelp', true);
    showCard(
      `<h2>How to play</h2>
      <p>Sumo on a crumbling island. You are ${stoneSvg(LIGHT, 16)} <b>ivory</b>, the AI is ${stoneSvg(DARK, 16)} <b>coral</b>.</p>
      ${diagram()}
      <ul>
        <li><b>Move</b> one of your stones one step to a neighbouring tile.</li>
        <li><b>Shove</b> by stepping into a stone: the line in front moves one tile on. You can shove up to <b>two</b> stones (either colour); <b>three in a row won’t budge</b>.</li>
        <li>A stone shoved off the edge or into a hole is <b>gone</b>. You can never step off yourself.</li>
        <li>After move ${TUNE.crumbleStart + 1} (yours and the AI’s both count) the island <b>crumbles</b>: one tile falls after every move, with any stone on it. Badges count moves too: <b style="color:#ff5a4a">1</b> falls after this move, <b style="color:#ff9a4a">2</b> after the reply, <b style="color:#ffd27a">3</b> after the move after that; a dashed ring marks a stone standing on one.</li>
        <li>Shove <b>${TUNE.target} coral stones</b> off to win.</li>
      </ul>
      <p>Tap a stone to see its moves: dots step, arrows shove, a red arrow pushes a stone off. <b>Puzzles</b> has five short lessons and a daily win-in-2 or 3.</p>`,
      [
        { label: 'Play', primary: true, onClick: closeOverlay },
        { label: 'Lessons first (two minutes)', pin: true, onClick: () => this.playLesson('shove') },
      ],
    );
  }

  private puzzleTip(): void {
    showCard(`<h2>Daily puzzle</h2><p>A position from a real game. You are ivory and move first: force a win within the moves shown. The other side defends as well as it can.</p><p><b>Retry</b> starts over; <b>Hint</b> shows the first move.</p>`, [
      { label: 'Got it', primary: true, onClick: closeOverlay },
    ]);
  }

  showNew(): void {
    const p = loadProfile();
    let lv: Level = this.level;
    let st: Starts = this.starts;
    const levels = LEVEL_IDS.map((l) => `<button data-lv="${l}" class="${l === lv ? 'on' : ''}">${LEVELS[l].name}<small>${p.won[l]}–${p.lost[l]}</small></button>`).join('');
    const starts = (['you', 'ai', 'alt'] as Starts[]).map((k) => `<button data-st="${k}" class="${k === st ? 'on' : ''}">${{ you: 'You', ai: 'AI', alt: 'Take turns' }[k]}</button>`).join('');
    showCard(
      `<h2>New game</h2><div class="levels">${levels}</div><p class="lvtext">${LEVELS[lv].text}</p><span class="label">Who moves first</span><div class="levels starts">${starts}</div>`,
      [
        { label: 'Play', primary: true, onClick: () => this.newGame(lv, st) },
        { label: 'Puzzles', onClick: () => this.showPuzzles() },
      ],
    );
    const card = document.querySelector('#overlay .card')!;
    card.querySelectorAll<HTMLButtonElement>('.levels button').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.lv) lv = b.dataset.lv as Level;
        if (b.dataset.st) st = b.dataset.st as Starts;
        card.querySelectorAll<HTMLButtonElement>('.levels button').forEach((x) => x.classList.toggle('on', x.dataset.lv === lv || x.dataset.st === st));
        card.querySelector('.lvtext')!.textContent = LEVELS[lv].text;
      };
    });
  }

  showPuzzles(): void {
    const p = loadProfile();
    const day = todayKey();
    const d = loadDaily(store, day);
    const lessons = lessonPuzzles();
    showCard(
      `<h2>Puzzles</h2><p>Lessons teach the key shoves (win in 1 or 2). The daily is a win-in-2 or 3 from a real game.</p>`,
      [
        { label: `Daily puzzle · ${prettyDay(day)}${d ? ` ✓ ${d.label}` : ''}`, primary: true, onClick: () => this.playDaily() },
        ...lessons.map((l, k) => ({ label: `${p.solved.includes(l.id) ? '✓' : `${k + 1}.`} ${l.title} · win in ${l.n}`, onClick: () => this.playLesson(l.id) })),
        this.mode === 'puzzle' ? { label: 'Back to my game', onClick: () => this.resumeGame() } : { label: 'Close', onClick: closeOverlay },
      ],
    );
  }

  showMenu(): void {
    const inGame = this.mode === 'game';
    showCard(
      `<h2>Brink</h2><p>${inGame ? `Against the ${LEVELS[this.level].name} AI · move ${Math.floor(this.s.ply / 2) + 1}` : `${this.puzzle?.title} · win in ${this.puzzle?.n}`}</p><div class="stats"><span class="label">Your record (won–lost)</span><div>${this.statsLine()}</div></div>`,
      [
        { label: 'Resume', primary: true, onClick: closeOverlay },
        { label: 'New game', onClick: () => this.showNew() },
        inGame ? { label: 'Puzzles', onClick: () => this.showPuzzles() } : { label: 'Back to my game', onClick: () => this.resumeGame() },
        { label: 'How to play', onClick: () => this.showHelp() },
        { label: 'Copy bug report', onClick: () => this.copyReport() },
        { label: 'All games', onClick: () => (location.href = '../') },
      ],
    );
  }

  private async copyReport(): Promise<void> {
    const a = this.moves.map(encodeMove).join(',');
    const base = `${location.origin}${location.pathname}`;
    const text =
      this.mode === 'game'
        ? `BRINK v${RULES_VERSION} seed=${this.seed} level=${this.level} first=${this.first === LIGHT ? 'you' : 'ai'} a=${a}\n${base}?seed=${this.seed}&level=${this.level}&first=${this.first === LIGHT ? 'you' : 'ai'}&a=${a}`
        : `BRINK v${RULES_VERSION} puzzle=${this.puzzle?.id} a=${a}\n${base}?puzzle=${this.puzzle?.id}&a=${a}`;
    toast((await copyText(text)) ? 'Bug report copied' : 'Copy failed');
  }
}

/** The last-move marker: the mover's trail plus a trail for each stone it shoved. */
function lastOf(m: number, ev: MoveEvents, mover: Side, s: State, before?: Int8Array): Scene['last'] {
  const pushed: [number, number, Side][] = [];
  for (const [from, to] of ev.slid) {
    if (from === moveCell(m)) continue;
    // The side of a shoved stone: where it landed now, or (gone) from the cells before the move.
    const side = (to >= 0 && s.cells[to] !== HOLE ? s.cells[to] : before ? before[from] : mover === LIGHT ? DARK : LIGHT) as Side;
    pushed.push([from, to, side]);
  }
  return { from: moveCell(m), to: moveTo(m), side: mover, pushed };
}

/** A falling-order badge for text (1 red, 2 orange, 3 yellow). */
const badge = (k: number) => `<span class="badge" style="background:${DOOM_COLOR[k]}">${k}</span>`;

/** The help card's picture: your stone shoves two coral stones; the far one goes over. */
function diagram(): string {
  const hex = (cx: number, cy: number, r: number) =>
    [...Array(6).keys()].map((k) => `${(cx + r * Math.cos((k * Math.PI) / 3)).toFixed(1)},${(cy + r * Math.sin((k * Math.PI) / 3)).toFixed(1)}`).join(' ');
  const xs = [30, 72, 114, 156];
  const tiles = xs.slice(0, 3).map((x, k) => `<polygon points="${hex(x, 36 + (k % 2) * 0, 21)}" fill="#4d625e" stroke="#1c2523" stroke-width="1.5"/>`).join('');
  const stone = (x: number, side: Side, o = 1) => `<g opacity="${o}">${stoneSvg(side, 26).replace('<svg ', `<svg x="${x - 13}" y="23" `)}</g>`;
  return `<svg viewBox="0 0 190 70" width="100%" style="max-height:84px" aria-hidden="true">
    <rect x="132" y="8" width="58" height="56" fill="#0b1020"/>${tiles}
    ${stone(30, LIGHT)}${stone(72, DARK)}${stone(114, DARK)}${stone(160, DARK, 0.35)}
    <path d="M40 58 h60" stroke="#ffd77a" stroke-width="2.5" marker-end="url(#ah)"/>
    <defs><marker id="ah" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#ffd77a"/></marker></defs>
    <text x="160" y="62" text-anchor="middle" font-size="10" fill="#ff8a6e" font-family="system-ui">over!</text></svg>`;
}
