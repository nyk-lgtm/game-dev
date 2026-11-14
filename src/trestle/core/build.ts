// Building: materials, the member list, and the action string a build is
// saved and replayed from.
//
// Actions (concatenated, no separators):
//   P<a><b> plank, T<a><b> twig, R<a><b> twine (a, b = grid points, two base-36 chars each)
//   D<a><b> remove the member a–b, U undo, C clear, G a test run (kept for the record).

import { COLS, ROWS, buildable, deepInRock, px, py, type Level } from './level';

export const PLANK = 0;
export const TWIG = 1;
export const TWINE = 2;
export type Mat = 0 | 1 | 2;

export interface MatDef {
  key: string;
  name: string;
  /** Cost per grid unit of length (a member costs round(length × cost)). */
  cost: number;
  /** Mass per unit length. */
  density: number;
  /** Force it takes to snap (tension; twine can't push). */
  strength: number;
  maxLen: number;
  /** The cart's wheels roll on it. */
  road: boolean;
  /** Pulls only, goes slack when pushed. */
  rope: boolean;
}

export const MATS: MatDef[] = [
  { key: 'P', name: 'Plank', cost: 10, density: 0.25, strength: 80, maxLen: 2.3, road: true, rope: false },
  { key: 'T', name: 'Twig', cost: 5, density: 0.08, strength: 60, maxLen: 2.3, road: false, rope: false },
  { key: 'R', name: 'Twine', cost: 3, density: 0.01, strength: 45, maxLen: 4.5, road: false, rope: true },
];

export interface Member {
  /** Grid points, a < b. */
  a: number;
  b: number;
  mat: Mat;
}

export const lenOf = (a: number, b: number): number => {
  const dx = px(a) - px(b);
  const dy = py(a) - py(b);
  return Math.sqrt(dx * dx + dy * dy);
};
export const memberCost = (m: Member): number => Math.round(lenOf(m.a, m.b) * MATS[m.mat].cost);
export const costOf = (ms: readonly Member[]): number => ms.reduce((s, m) => s + memberCost(m), 0);

/**
 * Pieces with a free end: a member whose end peg holds nothing else (not an
 * anchor, not a lantern ring), and in turn anything left hanging by removing
 * those. They carry no load, so the test run leaves them out entirely (they
 * would otherwise only add weight to a peg, which the solver could use).
 */
export function looseOf(l: Level, ms: readonly Member[], rings: readonly number[] = []): Uint8Array {
  const out = new Uint8Array(ms.length);
  const fixed = new Set([...l.anchors, ...rings]);
  const deg = new Map<number, number>();
  for (const m of ms) for (const p of [m.a, m.b]) deg.set(p, (deg.get(p) ?? 0) + 1);
  for (let changed = true; changed; ) {
    changed = false;
    ms.forEach((m, k) => {
      if (out[k]) return;
      if ((!fixed.has(m.a) && deg.get(m.a) === 1) || (!fixed.has(m.b) && deg.get(m.b) === 1)) {
        out[k] = 1;
        deg.set(m.a, deg.get(m.a)! - 1);
        deg.set(m.b, deg.get(m.b)! - 1);
        changed = true;
      }
    });
  }
  return out;
}

/** Every point with a peg: anchors plus member ends. */
export function pegs(l: Level, ms: readonly Member[]): Set<number> {
  const s = new Set(l.anchors);
  for (const m of ms) s.add(m.a).add(m.b);
  return s;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** Grid points strictly between a and b on the segment. */
export function between(a: number, b: number): number[] {
  const dx = px(b) - px(a);
  const dy = py(b) - py(a);
  const g = gcd(Math.abs(dx), Math.abs(dy));
  const out: number[] = [];
  for (let k = 1; k < g; k++) out.push(a + (k * dx) / g + ((k * dy) / g) * COLS);
  return out;
}

/** Why a member can't go from a to b on this level (pegs aside), or null. */
export function geomWhy(l: Level, a: number, b: number, mat: Mat): string | null {
  if (a === b || a < 0 || b < 0 || a >= COLS * ROWS || b >= COLS * ROWS) return 'nowhere';
  if (!buildable(l, a) || !buildable(l, b)) return 'Pegs can’t go into rock';
  if (lenOf(a, b) > MATS[mat].maxLen + 1e-9) return `Too long for ${MATS[mat].name.toLowerCase()}`;
  // Through rock: sample along the segment.
  const ax = px(a), ay = py(a), bx = px(b), by = py(b);
  for (let k = 1; k < 8; k++) if (deepInRock(l, ax + ((bx - ax) * k) / 8, ay + ((by - ay) * k) / 8)) return 'It would go through rock';
  if (l.anchors.includes(a) && l.anchors.includes(b) && rockEdge(l, a, b)) return 'That’s along the rock';
  return null;
}

/** Why a member can't go from a to b, or null when it can. */
export function whyNot(l: Level, ms: readonly Member[], a: number, b: number, mat: Mat): string | null {
  const g = geomWhy(l, a, b, mat);
  if (g) return g;
  const ps = pegs(l, ms);
  if (!ps.has(a) && !ps.has(b)) return 'Start from a peg';
  return null;
}

/** Both ends anchors on the same rock face (a member there would do nothing). */
function rockEdge(l: Level, a: number, b: number): boolean {
  const ax = px(a), ay = py(a), bx = px(b), by = py(b);
  for (const r of l.terrain) {
    const on = (x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    if (on(ax, ay) && on(bx, by) && (ax === bx || ay === by) && (ax === bx ? ax === r.x0 || ax === r.x1 : ay === r.y0 || ay === r.y1)) return true;
  }
  return false;
}

const key = (a: number, b: number) => (a < b ? a * 4096 + b : b * 4096 + a);

/** Adds a member (splitting it at pegs it passes through). Returns the new list, or null if it can't. */
export function addMember(l: Level, ms: readonly Member[], a: number, b: number, mat: Mat): Member[] | null {
  if (whyNot(l, ms, a, b, mat)) return null;
  const ps = pegs(l, ms);
  const cuts = [a, ...between(a, b).filter((p) => ps.has(p)), b];
  const out = [...ms];
  let changed = false;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const p = Math.min(cuts[i], cuts[i + 1]);
    const q = Math.max(cuts[i], cuts[i + 1]);
    const k = key(p, q);
    const at = out.findIndex((m) => key(m.a, m.b) === k);
    if (at >= 0) {
      if (out[at].mat === mat) continue;
      out[at] = { a: p, b: q, mat };
    } else out.push({ a: p, b: q, mat });
    changed = true;
  }
  return changed ? out : null;
}

export function removeMember(ms: readonly Member[], a: number, b: number): Member[] | null {
  const k = key(a, b);
  const i = ms.findIndex((m) => key(m.a, m.b) === k);
  return i < 0 ? null : [...ms.slice(0, i), ...ms.slice(i + 1)];
}

const enc = (p: number) => p.toString(36).padStart(2, '0');
export const addToken = (a: number, b: number, mat: Mat) => `${MATS[mat].key}${enc(a)}${enc(b)}`;
export const delToken = (a: number, b: number) => `D${enc(a)}${enc(b)}`;

export interface Built {
  members: Member[];
  /** Earlier member lists, for undo. */
  undo: Member[][];
  /** Test runs made. */
  runs: number;
}

const TOKEN = /([PTRD])([0-9a-z]{2})([0-9a-z]{2})|[UCG]/g;

/** Rebuilds the structure from an action string; tokens that don't apply are skipped. */
export function replayBuild(l: Level, actions: string): Built {
  let ms: Member[] = [];
  const undo: Member[][] = [];
  let runs = 0;
  for (const m of actions.matchAll(TOKEN)) {
    const t = m[0];
    if (t === 'U') {
      const prev = undo.pop();
      if (prev) ms = prev;
      continue;
    }
    if (t === 'G') {
      runs++;
      continue;
    }
    if (t === 'C') {
      if (ms.length) undo.push(ms), (ms = []);
      continue;
    }
    const a = parseInt(m[2], 36);
    const b = parseInt(m[3], 36);
    const next = m[1] === 'D' ? removeMember(ms, a, b) : addMember(l, ms, a, b, 'PTR'.indexOf(m[1]) as Mat);
    if (next) undo.push(ms), (ms = next);
  }
  return { members: ms, undo, runs };
}

/** A member list as actions (used by the surveyor and tests). */
export function toActions(l: Level, ms: readonly Member[]): string {
  // Emit in an order where each member starts from a peg that already stands.
  const ps = new Set(l.anchors);
  const left = [...ms];
  let out = '';
  while (left.length) {
    const i = left.findIndex((m) => ps.has(m.a) || ps.has(m.b));
    const m = left.splice(i < 0 ? 0 : i, 1)[0];
    out += addToken(m.a, m.b, m.mat);
    ps.add(m.a).add(m.b);
  }
  return out;
}

export const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
