// Brink puzzles: "win in N" positions. `winIn` is an exact AND-OR search: the
// side to move wins within n of its own moves whatever the other side does
// (crumbles and passes included). Puzzles come from AI self-play (the daily pool,
// scripts/brink/puzzles.ts) and a hand-made set teaching the key shoves.

import { MIRROR, N, cellAt } from './board';
import { POOL } from './pool';
import { DARK, HOLE, LIGHT, after, clone, crumbleOrder, isShove, legalMoves, moveCell, play, type Side, type State } from './rules';

let budget = Infinity;

/** Can the side to move force a win within n of its own moves? */
export function winIn(s: State, n: number): boolean {
  if (n <= 0 || s.winner) return s.winner === s.turn;
  if (--budget < 0) throw new Error('budget');
  const me = s.turn;
  const moves = legalMoves(s, []);
  // Wins on the spot first (cheap), then the rest.
  for (const m of moves) {
    const t = after(s, m);
    if (t.winner === me) return true;
  }
  if (n === 1) return false;
  for (const m of moves) {
    const t = after(s, m);
    if (t.winner) continue;
    if (t.turn === me ? winIn(t, n - 1) : everyReplyLoses(t, me, n - 1)) return true;
  }
  return false;
}

/** The other side is to move in t: does every reply leave `me` a win within n? */
function everyReplyLoses(t: State, me: Side, n: number): boolean {
  const replies = legalMoves(t, []);
  for (const r of replies) {
    const u = after(t, r);
    if (u.winner === me) continue;
    if (u.winner) return false;
    // After a reply that makes `me` pass, the other side moves again.
    if (u.turn !== me ? !everyReplyLoses(u, me, n) : !winIn(u, n)) return false;
  }
  return true;
}

/** Winning first moves within n (each forces a win in n). `maxNodes` guards the time. */
export function winningMoves(s: State, n: number, maxNodes = Infinity): number[] | null {
  budget = maxNodes;
  try {
    const me = s.turn;
    const out: number[] = [];
    for (const m of legalMoves(s, [])) {
      const t = after(s, m);
      if (t.winner === me || (!t.winner && (t.turn === me ? winIn(t, n - 1) : n > 1 && everyReplyLoses(t, me, n - 1)))) out.push(m);
    }
    return out;
  } catch {
    return null;
  } finally {
    budget = Infinity;
  }
}

/** Fewest own moves (1..max) the side to move needs to force a win, or 0. */
export function fastestWin(s: State, max: number, maxNodes = Infinity): number {
  for (let n = 1; n <= max; n++) {
    const w = winningMoves(s, n, maxNodes);
    if (w === null) return 0;
    if (w.length) return n;
  }
  return 0;
}

/** The defence that holds out longest (then the one that keeps the most stones), for puzzle replies. */
export function bestDefence(s: State, n: number): number {
  const me = s.turn;
  const moves = legalMoves(s, []);
  // Stones the attacker could shove off right now: among equal defences, try to save one of
  // those (or shove back) rather than move a bystander, so the puzzle's point gets tested.
  const att = clone(s);
  att.turn = (3 - me) as Side;
  const threatened = new Set<number>();
  for (const m of legalMoves(att, [])) {
    const ev = play(clone(att), m);
    if (ev.shovedOff?.side === me) threatened.add(ev.shovedOff.from);
  }
  let best = moves[0];
  let bestKey = -Infinity;
  for (const m of moves) {
    const t = after(s, m);
    let key: number;
    if (t.winner === me) key = 100000;
    else if (t.winner) key = -100000;
    else {
      // How many attacker moves until it wins from here (bigger = better defence).
      const attacker = t.turn === me ? null : t;
      let k = n + 1;
      if (attacker) {
        for (let j = 1; j <= n; j++) {
          const w = winningMoves(attacker, j, 200000);
          if (w && w.length) {
            k = j;
            break;
          }
        }
      }
      key = k * 100 - t.lost[me] * 10;
    }
    if (threatened.has(moveCell(m))) key += 3;
    if (isShove(s, m)) key += 1;
    if (key > bestKey) {
      bestKey = key;
      best = m;
    }
  }
  return best;
}

// ------------------------------------------------------------------ puzzle records

export interface Puzzle {
  id: string;
  title: string;
  /** What it teaches (tutorial puzzles) or where it came from. */
  text: string;
  /** Moves you have to win in. */
  n: number;
  state: State;
}

/**
 * A position as text: seed (for the crumble order), ply, lost stones, the cells
 * (`.` empty, `L` yours, `D` theirs, `#` hole) and whether the crumble order is
 * mirrored (positions are stored with the solver as light). Light always moves.
 */
export interface PuzzleRecord {
  seed: number;
  ply: number;
  lostL: number;
  lostD: number;
  cells: string;
  mirror: boolean;
  /** Who moved first in the game it came from (the crumble order can depend on it). */
  first: Side;
  n: number;
}

export function encodeRecord(r: PuzzleRecord): string {
  return `${r.seed}:${r.ply}:${r.lostL}${r.lostD}:${r.mirror ? 1 : 0}${r.first}:${r.n}:${r.cells}`;
}

export function decodeRecord(t: string): PuzzleRecord {
  const [seed, ply, lost, mf, n, cells] = t.split(':');
  return { seed: Number(seed), ply: Number(ply), lostL: Number(lost[0]), lostD: Number(lost[1]), mirror: mf[0] === '1', first: Number(mf[1]) as Side, n: Number(n), cells };
}

export function stateOf(r: PuzzleRecord): State {
  const cells = Int8Array.from(r.cells, (ch) => '.LD#'.indexOf(ch));
  const base = crumbleOrder(r.seed, r.first);
  const order = r.mirror ? Int8Array.from(base, (c) => MIRROR[c]) : base;
  return { seed: r.seed, cells, turn: LIGHT, ply: r.ply, lost: [0, r.lostL, r.lostD], order, winner: 0, first: LIGHT };
}

/** The position seen from the other side: colours swapped, turned 180°. */
export function mirrored(s: State): State {
  const t = clone(s);
  for (let i = 0; i < N; i++) {
    const v = s.cells[i];
    t.cells[MIRROR[i]] = v === LIGHT ? DARK : v === DARK ? LIGHT : v;
  }
  t.order = Int8Array.from(s.order, (c) => MIRROR[c]);
  t.turn = (3 - s.turn) as Side;
  t.lost = [0, s.lost[DARK], s.lost[LIGHT]];
  t.first = (3 - s.first) as Side;
  return t;
}

/** A record of `s` (light to move; pass the mirrored state when dark was to move). */
export function recordOf(s: State, n: number, mirror: boolean, first: Side): PuzzleRecord {
  return { seed: s.seed, ply: s.ply, lostL: s.lost[LIGHT], lostD: s.lost[DARK], cells: Array.from(s.cells, (v) => '.LD#'[v]).join(''), mirror, first, n };
}

// ------------------------------------------------------------------ tutorial

type QR = [number, number];

/** A hand-made lesson: stones and holes by axial (q, r); light (you) to move. */
export interface Lesson {
  id: string;
  title: string;
  text: string;
  n: number;
  light: QR[];
  dark: QR[];
  holes?: QR[];
  lostL?: number;
  lostD?: number;
  /** Plies already played (the crumble starts at TUNE.crumbleStart); crumbles follow `seed`. */
  ply?: number;
  seed?: number;
}

function lessonState(l: Lesson): State {
  const cells = new Int8Array(N);
  const put = (qr: QR[] | undefined, v: number) =>
    qr?.forEach(([q, r]) => {
      const c = cellAt(q, r);
      if (c < 0) throw new Error(`lesson ${l.id}: ${q},${r} is off the island`);
      cells[c] = v;
    });
  put(l.holes, HOLE);
  put(l.light, LIGHT);
  put(l.dark, DARK);
  const seed = l.seed ?? 1;
  return { seed, cells, turn: LIGHT, ply: l.ply ?? 0, lost: [0, l.lostL ?? 0, l.lostD ?? 2], order: crumbleOrder(seed), winner: 0, first: LIGHT };
}

export const LESSONS: Lesson[] = [
  {
    id: 'shove',
    title: 'Shove',
    text: 'Step into a stone to shove it one tile. Push a coral stone off the island: they have lost two, so one more wins.',
    n: 1,
    light: [[1, -2], [0, 1], [-1, 2]],
    dark: [[2, -3], [0, -2], [-1, -1]],
  },
  {
    id: 'two',
    title: 'Two in a row',
    text: 'You can shove a line of two, and the far one goes over. A line of three won’t budge.',
    n: 1,
    light: [[0, -1], [-3, 3]],
    dark: [[0, -2], [0, -3], [-3, 2], [-3, 1], [-3, 0]],
  },
  {
    id: 'hole',
    title: 'Holes',
    text: 'Holes are part of the void: a stone shoved into one is gone too.',
    n: 1,
    light: [[1, 1], [0, 1]],
    dark: [[1, 0], [-1, -1]],
    holes: [[1, -1], [-1, 0]],
  },
  {
    id: 'crumble',
    title: 'Crumble',
    text: 'After move 7 (both sides count) a tile falls after every move. The one marked 1 falls right after yours, with whatever stands on it: shove a coral stone onto it.',
    n: 1,
    light: [[0, 1], [1, 1]],
    dark: [[-1, 2], [1, -1]],
    ply: 6,
  },
  {
    id: 'brace',
    title: 'Brace',
    text: 'Win in two: corner their rim stone so it can’t get away, with two of yours lined up behind you. Three in a row can’t be shoved back, so wherever it steps, you push it off.',
    n: 2,
    light: [[0, 0], [1, 0], [1, 1]],
    dark: [[3, 0], [-1, -1]],
  },
];

export function lessonPuzzles(): Puzzle[] {
  return LESSONS.map((l) => ({ id: l.id, title: l.title, text: l.text, n: l.n, state: lessonState(l) }));
}

// ------------------------------------------------------------------ daily

/** Days since 2026-01-01 for a YYYY-MM-DD key: the daily walks the pool in order, no repeats for a year. */
export function dayIndex(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
}

/** The daily puzzle for a day (local date key). */
export function dailyPuzzle(day: string): Puzzle {
  const k = ((dayIndex(day) % POOL.length) + POOL.length) % POOL.length;
  const rec = decodeRecord(POOL[k]);
  return { id: `daily-${day}`, title: 'Daily puzzle', text: `Win in ${rec.n}. Only one first move does it.`, n: rec.n, state: stateOf(rec) };
}
