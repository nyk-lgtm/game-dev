// A Quarry run: eight depths, each a fresh face of letter tiles and a target
// score to reach within a few words; a perk between depths. Pure and
// deterministic: a run is its seed plus the action list, and replay() rebuilds
// it (given the same dictionary). Actions:
//   W<i.i.i…>  play the word along these cells (row·6 + col)
//   S          shake: jumble the face (a few per depth)
//   X<i>       knock out a tile (Pickaxe perk)
//   P<id>      take a perk between depths
//   Q          give up

import { Rng, mixSeed } from '../../shared/rng';
import { N, NEIGHBORS, VALUES, VOWELS, adjacent, pickLetter, settle, spell, type Tile } from './board';
import type { Dict } from './dict';
import { PERKS, type PerkId } from './perks';
import { anyWord } from './search';

export const RULES_VERSION = 2;
export const DEPTHS = 8;
export const DEPTH_NAMES = ['Topsoil', 'Clay', 'Sandstone', 'Limestone', 'Slate', 'Granite', 'Basalt', 'Obsidian'];
/** Words per depth, before perks. */
export const WORDS = [7, 7, 6, 6, 6, 6, 6, 6];
/** Score to reach on each depth. */
export const TARGETS = [90, 130, 180, 235, 295, 355, 415, 475];
/** Rocks on a fresh face, and the chance a falling tile is a rock. */
export const ROCKS = [0, 2, 3, 4, 4, 5, 6, 7];
export const ROCK_RATE = [0, 0.02, 0.03, 0.035, 0.04, 0.05, 0.06, 0.07];
export const ROCK_CAP = 9;
/** Chance a rock is granite (two hits). */
export const GRANITE = [0, 0, 0, 0, 0.3, 0.4, 0.5, 0.6];
/** What a broken rock pays (with Stonebreaker). */
export const ROCK_PAY = 5;
export const ROCK_PAY_STONEBREAKER = 10;
/** Long Haul: +1 length bonus per letter beyond LONG_FROM - 1 (5 letters +1, 6 +2…). */
export const LONG_FROM = 5;
/** Hot Seam: each word of STREAK_FROM+ letters in a row adds 1 more (this one included), up to STREAK_CAP. */
export const STREAK_FROM = 5;
export const STREAK_CAP = 3;
/** Word-multiplier bonuses (they add to 1 + golds). */
export const CHISEL = 2;
export const OPENING = 2;
export const ECHO = 1;
/** Fuses from this depth (0-based) on: one on each fresh face, and they keep turning up. */
export const FUSE_FROM = 2;
export const FUSE_RATE = 0.05;
export const FUSE_WORDS = 3;
export const GOLD_RATE = 0.03;
export const SHAKES = 1;
/** Each word left over when a depth is cleared pays this × the depth number. */
export const SPARE_WORD = 10;

export interface DepthLog {
  score: number;
  target: number;
  words: number;
}

export interface Run {
  seed: number;
  depth: number;
  phase: 'play' | 'perk' | 'over';
  won: boolean;
  board: Tile[];
  perks: PerkId[];
  offer: PerkId[];
  score: number;
  /** Points toward this depth's target. */
  got: number;
  target: number;
  wordsLeft: number;
  /** Words played on this depth. */
  played: number;
  /** Words of 5+ letters in a row (Hot Seam). */
  streak: number;
  shakes: number;
  picks: number;
  /** Seed of this depth's face; every tile drawn uses (levelSeed, drawn). */
  levelSeed: number;
  drawn: number;
  nextId: number;
  log: DepthLog[];
  words: number;
  best: { word: string; points: number } | null;
  longest: string;
  actions: string[];
}

export interface Score {
  word: string;
  points: number;
  /** Letter values summed (blanks are 0). */
  base: number;
  /** Length bonus in all: letters - 2, plus the additions below. */
  mult: number;
  /** Letters - 2. */
  lenMult: number;
  /** Additions to the length bonus, by perk ("Long Haul", 2). */
  adds: [string, number][];
  /** Word multiplier: 1, plus 1 per gold tile and per x2 perk that applies (they add, not multiply). */
  factor: number;
  /** What raised the word multiplier, and by how much (["gold", 1], ["Chisel", 2]). */
  boosts: [string, number][];
  /** Blank tiles in the word. */
  wild: number;
}

export type Eval = Score | { error: 'short' | 'unknown' | 'path' };

export interface Outcome {
  kind: 'word' | 'shake' | 'pick' | 'perk' | 'quit';
  score?: Score;
  /** Everything the word earned: the word, blasts and broken rocks. */
  total?: number;
  path?: number[];
  /** Cells blasted by a fuse in the word. */
  blasted?: number[];
  blastPts?: number;
  /** Rocks broken and rocks cracked (granite hit once), as cells before the fall. */
  broken?: number[];
  cracked?: number[];
  rockPts?: number;
  /** Fuses that ran out: their cells and the cells they took with them. */
  blown?: number[];
  lostWords?: number;
  /** The face had no word left and was shaken for free. */
  reshuffled?: boolean;
  cleared?: boolean;
  bonus?: number;
  over?: boolean;
  won?: boolean;
}

export const has = (r: Run, p: PerkId) => r.perks.includes(p);
const rngFor = (r: Run) => new Rng(mixSeed(r.levelSeed, r.drawn++));
export const lenBonus = (letters: number) => letters - 2;
export const fuseWords = (r: Run) => FUSE_WORDS + (has(r, 'blast') ? 2 : 0);

function rockTile(r: Run, g: Rng): Tile {
  const hp = !has(r, 'rocks') && g.next() < GRANITE[r.depth] ? 2 : 1;
  return { id: r.nextId++, ch: '', rock: hp };
}

/** A tile from the bag for a gap in the face. */
function fresh(r: Run, board: (Tile | null)[]): Tile {
  const g = rngFor(r);
  const rocks = board.filter((t) => t?.rock).length;
  if (g.next() < ROCK_RATE[r.depth] && rocks < ROCK_CAP) return rockTile(r, g);
  const t: Tile = { id: r.nextId++, ch: pickLetter(board, () => g.next()) };
  const golds = board.filter((x) => x?.gold).length;
  if (g.next() < GOLD_RATE * (has(r, 'gold') ? 3 : 1) && golds < (has(r, 'gold') ? 5 : 3)) t.gold = true;
  else if (r.depth >= FUSE_FROM && !board.some((x) => x?.fuse) && g.next() < FUSE_RATE) t.fuse = fuseWords(r);
  return t;
}

/** A fuse wants room: 4+ letter neighbours, at least two of the other kind (vowel/consonant) or blanks. */
export function fuseFriendly(board: Tile[], i: number): boolean {
  const t = board[i];
  if (!t || t.rock || t.ch === '*') return false;
  const ns = NEIGHBORS[i].filter((n) => board[n] && !board[n].rock);
  if (ns.length < 4) return false;
  const v = VOWELS.includes(t.ch);
  return ns.filter((n) => board[n].ch === '*' || VOWELS.includes(board[n].ch) !== v).length >= 2;
}

function refill(r: Run, board: (Tile | null)[]): void {
  const first = r.nextId;
  r.board = settle(board, (b) => fresh(r, b));
  // A fuse that drops into a cramped spot (a corner, or among letters it can't pair with)
  // passes to the nearest tile with room.
  const b = r.board;
  for (let i = 0; i < N; i++) {
    const t = b[i];
    if (!t.fuse || t.id < first || fuseFriendly(b, i)) continue;
    const seen = new Set([i]);
    let ring = [i];
    let to = -1;
    while (ring.length && to < 0) {
      const next: number[] = [];
      for (const c of ring) for (const n of NEIGHBORS[c]) if (!seen.has(n)) (seen.add(n), next.push(n));
      next.sort((x, y) => x - y);
      to = next.find((n) => !b[n].gold && !b[n].fuse && fuseFriendly(b, n)) ?? -1;
      ring = next;
    }
    if (to < 0) continue;
    const { fuse, ...rest } = t;
    b[i] = rest;
    b[to] = { ...b[to], fuse };
  }
}

/** Shakes the face for free until it holds a word (it almost always does). */
function ensureWord(r: Run, dict: Dict): boolean {
  let shook = false;
  for (let k = 0; k < 30 && !anyWord(r.board, dict); k++) {
    jumble(r);
    shook = true;
    if (k >= 10) {
      // Hopeless letters: draw a whole new face (rocks stay out of it).
      const b: (Tile | null)[] = r.board.map((t) => (t.rock ? t : null));
      refill(r, b);
    }
  }
  return shook;
}

function jumble(r: Run): void {
  rngFor(r).shuffle(r.board);
}

/** Sets up depth d: a fresh face, words, target and per-depth tools. */
function startDepth(r: Run, d: number, dict: Dict): void {
  r.depth = d;
  r.phase = 'play';
  r.levelSeed = mixSeed(r.seed, d + 1);
  r.drawn = 0;
  r.got = 0;
  r.played = 0;
  r.streak = 0;
  r.target = TARGETS[d];
  r.wordsLeft = WORDS[d] + (has(r, 'shift') ? 1 : 0);
  r.shakes = SHAKES + (has(r, 'shake') ? 2 : 0);
  r.picks = has(r, 'pick') ? 2 : 0;
  r.offer = [];
  // Letters first (specials off), then the specials on cells chosen by a shuffle.
  const depth = r.depth;
  r.depth = 0;
  const board: (Tile | null)[] = Array(N).fill(null);
  r.board = settle(board, (b) => {
    const g = rngFor(r);
    return { id: r.nextId++, ch: pickLetter(b, () => g.next()) };
  });
  r.depth = depth;
  const g = rngFor(r);
  // Rocks stay out of the top row; specials go on distinct cells.
  const cells = g.shuffle([...Array(N).keys()]);
  const take = (ok: (i: number) => boolean) => {
    const k = cells.findIndex(ok);
    return k < 0 ? -1 : cells.splice(k, 1)[0];
  };
  for (let k = 0; k < ROCKS[d]; k++) {
    const i = take((c) => c >= 6);
    if (i >= 0) r.board[i] = rockTile(r, g);
  }
  const golds = 1 + (has(r, 'gold') ? 3 : 0);
  for (let k = 0; k < golds; k++) {
    const i = take(() => true);
    if (i >= 0) r.board[i].gold = true;
  }
  const fuses = d >= FUSE_FROM ? 1 + (has(r, 'blast') ? 1 : 0) : 0;
  for (let k = 0; k < fuses; k++) {
    const i = take((c) => !r.board[c].rock && !r.board[c].gold && !r.board[c].fuse && fuseFriendly(r.board, c));
    if (i >= 0) r.board[i].fuse = fuseWords(r);
  }
  for (let k = has(r, 'wild') ? 2 : 0; k > 0; k--) {
    const i = take(() => true);
    if (i >= 0) r.board[i] = { id: r.nextId++, ch: '*' };
  }
  ensureWord(r, dict);
}

export function newRun(seed: number, dict: Dict): Run {
  const r: Run = {
    seed,
    depth: 0,
    phase: 'play',
    won: false,
    board: [],
    perks: [],
    offer: [],
    score: 0,
    got: 0,
    target: 0,
    wordsLeft: 0,
    played: 0,
    streak: 0,
    shakes: 0,
    picks: 0,
    levelSeed: 0,
    drawn: 0,
    nextId: 1,
    log: [],
    words: 0,
    best: null,
    longest: '',
    actions: [],
  };
  startDepth(r, 0, dict);
  return r;
}

/** Is this a legal path to trace (distinct, adjacent letter tiles)? */
export function validPath(r: Run, path: number[]): boolean {
  if (!path.length) return false;
  const seen = new Set<number>();
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    if (!Number.isInteger(i) || i < 0 || i >= N || seen.has(i) || r.board[i].rock) return false;
    if (k && !adjacent(path[k - 1], i)) return false;
    seen.add(i);
  }
  return true;
}

/** What a traced path spells and scores, without playing it. */
export function evaluate(r: Run, path: number[], dict: Dict): Eval {
  if (!validPath(r, path)) return { error: 'path' };
  const tiles = path.map((i) => r.board[i]);
  const parts = tiles.map(spell);
  if (parts.join('').length < 3) return { error: 'short' };
  // Blanks take the first letter that makes a word (they score 0 either way).
  let word: string | null = null;
  const blanks = parts.map((p, k) => (p === '*' ? k : -1)).filter((k) => k >= 0);
  if (!blanks.length) word = dict.has(parts.join('')) ? parts.join('') : null;
  else {
    const fill = (b: number): boolean => {
      if (b === blanks.length) {
        const w = parts.join('');
        if (dict.has(w)) word = w;
        return !!word;
      }
      for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
        parts[blanks[b]] = ch;
        if (fill(b + 1)) return true;
      }
      parts[blanks[b]] = '*';
      return false;
    };
    fill(0);
  }
  if (!word) return { error: 'unknown' };
  const w: string = word;
  let base = 0;
  for (const t of tiles) base += tileValue(r, t);
  const lenMult = lenBonus(w.length);
  const adds: [string, number][] = [];
  if (has(r, 'long') && w.length >= LONG_FROM) adds.push(['Long Haul', w.length - LONG_FROM + 1]);
  if (has(r, 'streak') && w.length >= STREAK_FROM) adds.push(['Hot Seam', Math.min(STREAK_CAP, r.streak + 1)]);
  const mult = lenMult + adds.reduce((k, [, n]) => k + n, 0);
  const boosts: [string, number][] = [];
  const golds = tiles.filter((t) => t.gold).length;
  if (golds) boosts.push([golds > 1 ? `${golds} gold` : 'gold', golds]);
  if (has(r, 'short') && w.length <= 4) boosts.push(['Chisel', CHISEL]);
  if (has(r, 'echo') && new Set(w).size < w.length) boosts.push(['Echo', ECHO]);
  const rares = has(r, 'rare') ? tiles.filter(isRare).length : 0;
  if (rares) boosts.push(['Prospector', rares]);
  if (has(r, 'first') && r.played === 0) boosts.push(['Opening Strike', OPENING]);
  const factor = 1 + boosts.reduce((k, [, n]) => k + n, 0);
  const wild = tiles.filter((t) => t.ch === '*').length;
  return { word: w, points: base * mult * factor, base, mult, lenMult, adds, factor, boosts, wild };
}

/** A tile's letter value (blanks 0). */
export function tileValue(_r: Run, t: Tile): number {
  return VALUES[t.ch] ?? 0;
}

/** Prospector: letters worth this much or more add +1 word multiplier each. */
export const RARE_FROM = 4;
export const isRare = (t: Tile) => (VALUES[t.ch] ?? 0) >= RARE_FROM;

export const isScore = (e: Eval): e is Score => !('error' in e);

function finishDepth(r: Run, o: Outcome): void {
  const bonus = r.wordsLeft * SPARE_WORD * (r.depth + 1);
  r.score += bonus;
  o.cleared = true;
  o.bonus = bonus;
  r.log.push({ score: r.got, target: r.target, words: r.played });
  if (r.depth === DEPTHS - 1) {
    r.phase = 'over';
    r.won = o.won = o.over = true;
    return;
  }
  r.phase = 'perk';
  const g = new Rng(mixSeed(r.seed, 1000 + r.depth));
  r.offer = g
    .shuffle(PERKS.map((p) => p.id).filter((id) => !has(r, id)))
    .slice(0, 3);
}

function playWord(r: Run, path: number[], dict: Dict): Outcome | null {
  const e = evaluate(r, path, dict);
  if (!isScore(e)) return null;
  const o: Outcome = { kind: 'word', score: e, path };
  const board: (Tile | null)[] = r.board.slice();
  const used = new Set(path);
  // Fuses in the word blast their other neighbors.
  const blasted: number[] = [];
  for (const i of path)
    if (board[i]!.fuse) for (const n of NEIGHBORS[i]) if (!used.has(n) && !blasted.includes(n)) blasted.push(n);
  let blastPts = 0;
  for (const i of blasted) blastPts += (VALUES[board[i]!.ch] ?? 0) * (has(r, 'blast') ? 6 : 2);
  // Rocks next to the word crack; blasted ones break outright.
  const broken = blasted.filter((i) => board[i]!.rock);
  const cracked: number[] = [];
  const near = new Set<number>();
  for (const i of path) for (const n of NEIGHBORS[i]) if (!used.has(n) && !blasted.includes(n)) near.add(n);
  for (const i of [...near].sort((a, b) => a - b)) {
    const t = board[i]!;
    if (!t.rock) continue;
    if (t.rock > 1 && !has(r, 'rocks')) {
      board[i] = { ...t, rock: t.rock - 1 };
      cracked.push(i);
    } else broken.push(i);
  }
  const rockPts = broken.length * (has(r, 'rocks') ? ROCK_PAY_STONEBREAKER : ROCK_PAY);
  for (const i of [...path, ...blasted, ...broken]) board[i] = null;
  const total = e.points + blastPts + rockPts;
  Object.assign(o, { total, blasted, blastPts, broken, cracked, rockPts });
  r.score += total;
  r.got += total;
  r.wordsLeft--;
  r.played++;
  r.words++;
  r.streak = e.word.length >= STREAK_FROM ? r.streak + 1 : 0;
  if (!r.best || total > r.best.points) r.best = { word: e.word, points: total };
  if (e.word.length > r.longest.length) r.longest = e.word;
  if (r.got >= r.target) {
    refill(r, board);
    finishDepth(r, o);
    return o;
  }
  // Fuses left on the face burn down; one that runs out blows, taking its
  // neighbors and a word with it.
  const blown: number[] = [];
  let lost = 0;
  for (let i = 0; i < N; i++) {
    const t = board[i];
    if (!t?.fuse) continue;
    const left = t.fuse - 1;
    if (left > 0) {
      board[i] = { ...t, fuse: left };
      continue;
    }
    lost++;
    for (const n of [i, ...NEIGHBORS[i]]) if (board[n] && !blown.includes(n)) blown.push(n);
  }
  for (const i of blown) board[i] = null;
  if (lost) {
    o.blown = blown;
    o.lostWords = Math.min(lost, r.wordsLeft);
    r.wordsLeft = Math.max(0, r.wordsLeft - lost);
  }
  refill(r, board);
  if (r.wordsLeft <= 0) {
    r.phase = 'over';
    o.over = true;
    r.log.push({ score: r.got, target: r.target, words: r.played });
    return o;
  }
  o.reshuffled = ensureWord(r, dict);
  return o;
}

/** Plays one action; returns null (and changes nothing) if it isn't legal. */
export function act(r: Run, a: string, dict: Dict): Outcome | null {
  let o: Outcome | null = null;
  const kind = a[0];
  if (kind === 'P') {
    const id = a.slice(1) as PerkId;
    if (r.phase !== 'perk' || !r.offer.includes(id)) return null;
    r.perks.push(id);
    startDepth(r, r.depth + 1, dict);
    o = { kind: 'perk' };
  } else if (kind === 'Q') {
    if (r.phase === 'over') return null;
    r.phase = 'over';
    if (r.log.length === r.depth) r.log.push({ score: r.got, target: r.target, words: r.played });
    o = { kind: 'quit', over: true };
  } else {
    if (r.phase !== 'play') return null;
    if (kind === 'W') {
      const path = a.slice(1).split('.').map(Number);
      o = playWord(r, path, dict);
    } else if (kind === 'S') {
      if (r.shakes <= 0) return null;
      r.shakes--;
      jumble(r);
      o = { kind: 'shake', reshuffled: ensureWord(r, dict) };
    } else if (kind === 'X') {
      const i = Number(a.slice(1));
      if (r.picks <= 0 || !Number.isInteger(i) || i < 0 || i >= N) return null;
      r.picks--;
      const board: (Tile | null)[] = r.board.slice();
      const t = board[i]!;
      board[i] = null;
      refill(r, board);
      o = { kind: 'pick', broken: t.rock ? [i] : [], reshuffled: ensureWord(r, dict) };
    }
  }
  if (o) r.actions.push(a);
  return o;
}

export function replay(seed: number, actions: string[], dict: Dict): Run {
  const r = newRun(seed, dict);
  for (const a of actions) if (!act(r, a, dict)) break;
  return r;
}

/** Depth reached, 1-based (the depth being played or where the run ended). */
export const depthReached = (r: Run) => (r.won ? DEPTHS : r.depth + 1);
