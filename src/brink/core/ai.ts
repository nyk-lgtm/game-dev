// Brink opponent: negamax alpha-beta with iterative deepening, a transposition
// table, killer moves and a short quiescence search over shoves that knock a
// stone off. The budget is a node count, never the clock, so a level always
// picks the same move in the same position (Easy adds seeded noise).

import { mixSeed, Rng } from '../../shared/rng';
import { N, NB, RING } from './board';
import { DARK, EMPTY, HOLE, LIGHT, TUNE, clone, legalMoves, moveCell, moveDir, moveTo, other, play, type Side, type State } from './rules';

export type Level = 'easy' | 'normal' | 'hard';

export const LEVELS: Record<Level, { name: string; depth: number; nodes: number; noise: number; text: string }> = {
  easy: { name: 'Easy', depth: 2, nodes: 3000, noise: 160, text: 'Sees your reply coming, but often settles for a weaker move.' },
  normal: { name: 'Normal', depth: 2, nodes: 8000, noise: 60, text: 'Sees your reply coming, now and then picks a lesser move.' },
  hard: { name: 'Hard', depth: 12, nodes: 70000, noise: 0, text: 'Reads five or six moves deep, watches the falling tiles and punishes loose stones.' },
};

const WIN = 100000;
/** How far back recreated layouts count. */
export const REPEAT_PLIES = 8;

// ------------------------------------------------------------------ evaluation

/** Positional weights; scripts can override them to try others. */
export const W = {
  stone: 1000,
  /** By distance to the void along the worst line (1 = one shove from falling). */
  edge: [0, -70, -18, 0, 6],
  /** Per ring (centre is best). */
  ring: [24, 16, 6, 0],
  /** A stone on a tile that falls k plies from now: the side to move's own stones (it can step one off now)… */
  doomUs: [0, -320, -300, -90, -60, -30, -20],
  /** …and the other side's (k = 1 falls right after this move: as good as gone). */
  doomThem: [0, -900, -260, -240, -60, -30, -20],
  /** An edge stone (void right behind it on a line) with an enemy within 1 / 2 steps of the tile it would be shoved from. */
  near: [0, -60, -25],
  /** Mild weight on how many tiles a stone can step to (stuck stones can't escape crumbles). */
  mobility: 3,
  /** Each enemy stone this one could shove off right now (side to move only counts once). */
  threat: 90,
  /** Lines of three own stones (they can't be shoved along that line). */
  brace: 8,
  /** Root penalty for undoing the opponent's last shove (half for stepping back). */
  loop: 70,
  /** Recreating a stone layout seen in the last REPEAT_PLIES plies (any depth, searching side only). */
  repeat: 300,
};

/** Steps to the void from cell i going in dir d (1 = the next tile is the void). */
function voidDist(c: Int8Array, i: number, d: number): number {
  let n = 1;
  let k = NB[i * 6 + d];
  // Only distances up to 4 matter to the evaluation.
  while (k >= 0 && c[k] !== HOLE && n < 4) {
    n++;
    k = NB[k * 6 + d];
  }
  return n;
}

/** Plies until each tile falls (1 = right after the side to move's move), up to 6. */
const DOOM = new Int8Array(N);
function doomTable(s: State): Int8Array {
  const t = DOOM.fill(0);
  for (let k = 1; k <= 6; k++) {
    const idx = s.ply - 1 + k - TUNE.crumbleStart;
    if (idx >= 0 && idx < s.order.length) t[s.order[idx]] = k;
  }
  return t;
}

/** The cell a stone at `from` would shove into going `dir` (the first stone it meets), or -1. */
function shoveTarget(c: Int8Array, from: number, dir: number): number {
  const k = NB[from * 6 + dir];
  return k >= 0 && (c[k] === LIGHT || c[k] === DARK) ? k : -1;
}

/** Can the stone at `from` shoving in `dir` push a stone of `victim` off? */
function knocksOff(c: Int8Array, from: number, dir: number, victim: Side): boolean {
  let k = shoveTarget(c, from, dir);
  if (k < 0) return false;
  let last = -1;
  let n = 0;
  while (k >= 0 && (c[k] === LIGHT || c[k] === DARK)) {
    if (++n > 2) return false;
    last = k;
    k = NB[k * 6 + dir];
  }
  return (k < 0 || c[k] === HOLE) && c[last] === victim;
}

/** Steps from every tile to the nearest stone of `side` (holes block; up to 2, else 9), into reused buffers. */
const NEAR = [new Int8Array(N), new Int8Array(N), new Int8Array(N)];
const QUEUE = new Int8Array(N);
function nearest(c: Int8Array, side: number): Int8Array {
  const d = NEAR[side].fill(9);
  let tail = 0;
  for (let i = 0; i < N; i++)
    if (c[i] === side) {
      d[i] = 0;
      QUEUE[tail++] = i;
    }
  for (let h = 0; h < tail; h++) {
    const i = QUEUE[h];
    if (d[i] >= 2) continue;
    for (let k = 0; k < 6; k++) {
      const j = NB[i * 6 + k];
      if (j >= 0 && c[j] !== HOLE && d[j] > d[i] + 1) {
        d[j] = d[i] + 1;
        QUEUE[tail++] = j;
      }
    }
  }
  return d;
}

/** Knock-off moves for the side to move, found by the last `evaluate` call. */
const lastKnocks: number[] = [];

/** Static score from the point of view of the side to move. */
export function evaluate(s: State): number {
  lastKnocks.length = 0;
  if (s.winner) return s.winner === s.turn ? WIN : -WIN;
  const c = s.cells;
  const doom = doomTable(s);
  // Steps from each tile to the nearest stone of each side (BFS over tiles), for exposure.
  const distTo = [null, nearest(c, LIGHT), nearest(c, DARK)] as const;
  const doomUs = W.doomUs;
  const doomThem = W.doomThem;
  let score = W.stone * (s.lost[other(s.turn)] - s.lost[s.turn]);
  let threatsUs = 0;
  let threatsThem = 0;
  for (let i = 0; i < N; i++) {
    const v = c[i];
    if (v !== LIGHT && v !== DARK) continue;
    let p = W.ring[RING[i]];
    let worst = 9;
    let close = 9;
    const foeDist = distTo[(3 - v) as Side]!;
    for (let d = 0; d < 6; d++) {
      const vd = voidDist(c, i, d);
      // Only a line with room for a pusher behind counts as exposed.
      const back = NB[i * 6 + ((d + 3) % 6)];
      if (back >= 0 && c[back] !== HOLE) {
        if (vd < worst) worst = vd;
        if (vd === 1 && foeDist[back] < close) close = foeDist[back];
      }
      const step = NB[i * 6 + d];
      if (step >= 0 && c[step] === EMPTY) p += W.mobility;
      // Shoves this stone could make that drop an enemy stone.
      if (knocksOff(c, i, d, (3 - v) as Side)) {
        if (v === s.turn) {
          threatsUs++;
          lastKnocks.push(i * 64 + shoveTarget(c, i, d));
        } else threatsThem++;
      }
      if (d < 3) {
        const a = NB[i * 6 + d];
        const b = a >= 0 ? NB[a * 6 + d] : -1;
        if (b >= 0 && c[a] === v && c[b] === v) p += W.brace;
      }
    }
    p += W.edge[Math.min(4, worst)];
    if (close <= 2) p += W.near[Math.max(1, close)];
    if (doom[i]) p += (v === s.turn ? doomUs : doomThem)[doom[i]];
    score += v === s.turn ? p : -p;
  }
  // The side to move cashes one threat; the other side's threats are worth less (we may parry).
  if (threatsUs) score += W.stone * 0.6 + W.threat * (threatsUs - 1);
  score -= W.threat * threatsThem;
  return Math.round(score);
}

// ------------------------------------------------------------------ search

// Zobrist keys (fixed seed, so hashes are the same everywhere).
const ZR = new Rng(0x5eed);
const Z = new Uint32Array(N * 4 * 2);
for (let i = 0; i < Z.length; i++) Z[i] = (ZR.next() * 0x100000000) >>> 0;
const ZPLY = Uint32Array.from({ length: 128 * 2 }, () => (ZR.next() * 0x100000000) >>> 0);

function hash(s: State): [number, number] {
  let a = ZPLY[(s.ply & 127) * 2];
  let b = ZPLY[(s.ply & 127) * 2 + 1] ^ s.turn;
  for (let i = 0; i < N; i++) {
    const v = s.cells[i];
    if (v === EMPTY) continue;
    a ^= Z[(i * 4 + v) * 2];
    b ^= Z[(i * 4 + v) * 2 + 1];
  }
  return [a >>> 0, (b ^ (s.lost[1] * 0x9e3779b1) ^ (s.lost[2] * 0x85ebca6b)) >>> 0];
}

const TT_BITS = 16;
const TT_SIZE = 1 << TT_BITS;

interface SearchCtx {
  nodes: number;
  cap: number;
  stop: boolean;
  ttA: Uint32Array;
  ttB: Uint32Array;
  ttDepth: Int8Array;
  ttScore: Int32Array;
  ttFlag: Int8Array;
  ttMove: Int16Array;
  killers: Int16Array;
  history: Int32Array;
  /** The side searching, and stone layouts it shouldn't recreate (recent game positions). */
  root: Side;
  seen: Set<number>;
}

/**
 * The stones' layout and the side to move as one number (holes and the ply left
 * out, so a shove-and-shove-back cycle repeats even while tiles keep falling).
 */
export function stoneKey(s: State): number {
  let a = s.turn === LIGHT ? 0x2545f491 : 0x9e3779b9;
  for (let i = 0; i < N; i++) {
    const v = s.cells[i];
    if (v === LIGHT || v === DARK) a ^= Z[(i * 4 + v) * 2];
  }
  return a >>> 0;
}

/** How much a move that recreates a recent layout costs the searching side. */
const repeatCost = (ctx: SearchCtx, s: State, t: State): number => (s.turn === ctx.root && !t.winner && ctx.seen.has(stoneKey(t)) ? W.repeat : 0);

function makeCtx(cap: number, root: Side = LIGHT, seen: Set<number> = new Set()): SearchCtx {
  return {
    root,
    seen,
    nodes: 0,
    cap,
    stop: false,
    ttA: new Uint32Array(TT_SIZE),
    ttB: new Uint32Array(TT_SIZE),
    ttDepth: new Int8Array(TT_SIZE).fill(-1),
    ttScore: new Int32Array(TT_SIZE),
    ttFlag: new Int8Array(TT_SIZE),
    ttMove: new Int16Array(TT_SIZE).fill(-1),
    killers: new Int16Array(64 * 2).fill(-1),
    history: new Int32Array(64 * 64),
  };
}

/** Is this move a shove that drops an enemy stone? */
function isKnock(s: State, m: number): boolean {
  const to = moveTo(m);
  const v = s.cells[to];
  return (v === LIGHT || v === DARK) && knocksOff(s.cells, moveCell(m), moveDir(m), other(s.turn));
}

function orderMoves(s: State, moves: number[], ttMove: number, ctx: SearchCtx, depthFromRoot: number): number[] {
  const k1 = ctx.killers[depthFromRoot * 2];
  const k2 = ctx.killers[depthFromRoot * 2 + 1];
  const key = moves.map((m) => {
    let v = ctx.history[m];
    if (m === ttMove) v += 1e9;
    else if (isKnock(s, m)) v += 1e8;
    else if (m === k1 || m === k2) v += 1e7;
    // Mild preference for moving toward the centre.
    v += (3 - RING[moveTo(m)]) * 2;
    return v;
  });
  const idx = moves.map((_, i) => i).sort((a, b) => key[b] - key[a] || moves[a] - moves[b]);
  return idx.map((i) => moves[i]);
}

function quiesce(s: State, alpha: number, beta: number, ctx: SearchCtx, qd: number): number {
  ctx.nodes++;
  const stand = evaluate(s);
  if (s.winner || qd <= 0) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (!lastKnocks.length) return alpha;
  const moves = lastKnocks.slice();
  for (const m of moves) {
    const t = clone(s);
    play(t, m);
    const sc = t.turn === s.turn ? quiesce(t, alpha, beta, ctx, qd - 1) : -quiesce(t, -beta, -alpha, ctx, qd - 1);
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(s: State, depth: number, alpha: number, beta: number, ctx: SearchCtx, fromRoot: number): number {
  if (s.winner) return s.winner === s.turn ? WIN - fromRoot : -WIN + fromRoot;
  if (depth <= 0) return quiesce(s, alpha, beta, ctx, 3);
  ctx.nodes++;
  if (ctx.nodes > ctx.cap) {
    ctx.stop = true;
    return 0;
  }
  const [ha, hb] = hash(s);
  const slot = ha & (TT_SIZE - 1);
  let ttMove = -1;
  if (ctx.ttA[slot] === ha && ctx.ttB[slot] === hb) {
    ttMove = ctx.ttMove[slot];
    if (ctx.ttDepth[slot] >= depth) {
      const sc = ctx.ttScore[slot];
      const f = ctx.ttFlag[slot];
      if (f === 0) return sc;
      if (f === 1 && sc >= beta) return sc;
      if (f === 2 && sc <= alpha) return sc;
    }
  }
  const moves = orderMoves(s, legalMoves(s), ttMove, ctx, fromRoot);
  const a0 = alpha;
  let best = -Infinity;
  let bestMove = -1;
  for (const m of moves) {
    const t = clone(s);
    play(t, m);
    // A pass gives the same side the next move. A recreated layout costs the searcher
    // `rc`: search the child with the window shifted by it, then take it off.
    const rc = repeatCost(ctx, s, t);
    const a = alpha + rc;
    const b = beta + rc;
    const sc = (t.turn === s.turn ? negamax(t, depth - 1, a, b, ctx, fromRoot + 1) : -negamax(t, depth - 1, -b, -a, ctx, fromRoot + 1)) - rc;
    if (ctx.stop) return 0;
    if (sc > best) {
      best = sc;
      bestMove = m;
    }
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) {
      if (!isKnock(s, m) && fromRoot < 64) {
        ctx.killers[fromRoot * 2 + 1] = ctx.killers[fromRoot * 2];
        ctx.killers[fromRoot * 2] = m;
      }
      ctx.history[m] += depth * depth;
      break;
    }
  }
  ctx.ttA[slot] = ha;
  ctx.ttB[slot] = hb;
  ctx.ttDepth[slot] = depth;
  ctx.ttScore[slot] = best;
  ctx.ttFlag[slot] = best <= a0 ? 2 : best >= beta ? 1 : 0;
  ctx.ttMove[slot] = bestMove;
  return best;
}

export interface Choice {
  move: number;
  score: number;
  /** Deepest finished iteration. */
  depth: number;
  nodes: number;
  /** Root moves with their scores from the deepest finished iteration (best first). */
  ranked: { move: number; score: number }[];
}

/** Scores every root move to `maxDepth` (iterative deepening within the node cap). */
/**
 * Root penalties against shove-back loops: undoing the opponent's last shove
 * (pushing the same line straight back) or stepping your own last stone back.
 * Small next to a stone, so it only breaks ties between quiet moves.
 */
export function loopPenalty(recent: readonly number[]): (m: number) => number {
  const opp = recent.length ? recent[recent.length - 1] : -1;
  const own = recent.length > 1 ? recent[recent.length - 2] : -1;
  let undoShove = -1;
  if (opp >= 0) {
    const b = moveTo(opp);
    const d = moveDir(opp);
    const behind = NB[b * 6 + d];
    if (behind >= 0) undoShove = behind * 64 + b;
  }
  const stepBack = own >= 0 ? moveTo(own) * 64 + moveCell(own) : -1;
  return (m) => (m === undoShove ? W.loop : 0) + (m === stepBack ? W.loop / 2 : 0);
}

export function search(s: State, maxDepth: number, cap: number, exact = false, penalty: (m: number) => number = () => 0, seen: readonly number[] = []): Choice {
  const ctx = makeCtx(cap, s.turn, new Set(seen));
  const moves = legalMoves(s);
  let ranked = moves.map((move) => ({ move, score: 0 }));
  let depth = 0;
  for (let d = 1; d <= maxDepth; d++) {
    const scores: { move: number; score: number }[] = [];
    let alpha = -Infinity;
    const order = ranked.map((r) => r.move);
    for (const m of order) {
      const t = clone(s);
      play(t, m);
      // Full window for the first move, then a null window against the best so far,
      // re-searched when a move beats it, so every score is exact or a bound below best.
      let sc: number;
      const sign = t.turn === s.turn ? 1 : -1;
      const run = (a: number, b: number) => (sign === 1 ? negamax(t, d - 1, a, b, ctx, 1) : -negamax(t, d - 1, -b, -a, ctx, 1));
      const pen = penalty(m) + repeatCost(ctx, s, t);
      if (alpha === -Infinity || exact) sc = run(-Infinity, Infinity);
      else {
        sc = run(alpha + pen - 1, alpha + pen);
        if (!ctx.stop && sc >= alpha + pen) sc = run(alpha + pen - 1, Infinity);
      }
      if (ctx.stop) break;
      sc -= pen;
      scores.push({ move: m, score: sc });
      if (sc > alpha) alpha = sc;
    }
    if (ctx.stop) break;
    scores.sort((a, b) => b.score - a.score || a.move - b.move);
    ranked = scores;
    depth = d;
    // A forced win found: no need to look deeper.
    if (ranked[0].score > WIN - 100) break;
  }
  if (!ranked.length) return { move: -1, score: 0, depth, nodes: ctx.nodes, ranked };
  return { move: ranked[0].move, score: ranked[0].score, depth, nodes: ctx.nodes, ranked };
}

/** The AI's move at a level. Deterministic: Easy's slips come from the game seed and ply. */
/**
 * The AI's move. `recent` is the game's moves so far and `seen` the stone layouts
 * (`stoneKey`) after each of them: recreating a layout from the last few plies is
 * taxed in the search, so the AI breaks shove-back cycles even when your reply is forced.
 */
export function chooseMove(s: State, level: Level, recent: readonly number[] = [], seen: readonly number[] = []): Choice {
  const L = LEVELS[level];
  const ch = search(s, L.depth, L.nodes, L.noise > 0, loopPenalty(recent), seen.slice(-REPEAT_PLIES));
  if (L.noise > 0 && ch.ranked.length > 1) {
    const rng = new Rng(mixSeed(s.seed ^ 0xea5e, s.ply));
    // Pick among moves within `noise` of the best (never one that throws away a stone outright).
    const ok = ch.ranked.filter((r) => r.score >= ch.score - L.noise * (0.5 + rng.next()));
    const pick = ok[Math.floor(rng.next() * ok.length)];
    return { ...ch, move: pick.move, score: pick.score };
  }
  return ch;
}

/** Score for display: a forced win/loss in n moves, or a rough stone advantage. */
export function describeScore(score: number): { mate: number; adv: number } {
  if (score > WIN - 1000) return { mate: Math.ceil((WIN - score) / 2), adv: 0 };
  if (score < -WIN + 1000) return { mate: -Math.ceil((WIN + score) / 2), adv: 0 };
  return { mate: 0, adv: score / W.stone };
}

export const isWinScore = (v: number): boolean => v > WIN - 1000;
export { WIN };
