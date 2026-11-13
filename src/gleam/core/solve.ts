// Solvers over socket domains (a bitmask of possible codes per socket).
// `check` is the one-look test: certain light (through decided sockets) must not
// reach a crystal with a wrong colour, possible light (through every option left)
// must still be able to bring each crystal its colour and light every piece, and
// the tray must fit. `solveAll` is the exact search (uniqueness); `deduce` is the
// human model: rule a code out of a socket when assuming it fails the check
// (depth 1), or fails after depth-1 deductions (depth 2), and so on.

import { BACK, CODES_OF, CRYSTAL, DC, DR, LAMP, NTYPES, SLASH, SOCKET, WALL, typeOf, type Puzzle } from './board';

/** Codes of each type as a domain mask. */
export const TYPE_MASK = CODES_OF.map((cs) => cs.reduce((m, c) => m | (1 << c), 0));
export const bit = (code: number) => 1 << code;
export const single = (d: number) => d !== 0 && (d & (d - 1)) === 0;
export const codeOf = (d: number) => 31 - Math.clz32(d);
export const count = (d: number) => {
  let k = 0;
  for (let x = d; x; x &= x - 1) k++;
  return k;
};

export type Reason =
  | { k: 'dark'; cell: number; mask: number }
  | { k: 'wrong'; cell: number; mask: number }
  | { k: 'unreach'; cell: number; mask: number }
  | { k: 'unlit'; cell: number }
  | { k: 'over'; t: number }
  | { k: 'short'; t: number }
  | { k: 'deep'; depth: number; inner: Reason };

export class Ctx {
  readonly n: number;
  readonly N: number;
  /** Socket index per cell, or -1. */
  readonly sock: Int16Array;
  readonly crystals: number[];
  private seen: Uint8Array;
  private stack: Int32Array;
  /** Neighbour of each cell in each direction, or -1. */
  private nb: Int16Array;
  private room = new Array<number>(NTYPES).fill(0);
  /** After `check`: crystal colours from certain light. */
  readonly got: Uint8Array;
  /** After `check`: colours that could reach each cell. */
  readonly may: Uint8Array;
  /** After `check`: undecided sockets that certain light reaches. */
  frontier: number[] = [];
  /** After `check`: pieces still to place per type. */
  readonly left: number[] = new Array(NTYPES).fill(0);
  checks = 0;
  /** Work budget: past it `aborted` is set and the searches stop early (results then mean nothing). */
  limit = Infinity;
  aborted = false;

  constructor(readonly p: Puzzle) {
    this.n = p.n;
    this.N = p.n * p.n;
    this.sock = new Int16Array(this.N).fill(-1);
    p.sockets.forEach((c, i) => (this.sock[c] = i));
    this.crystals = p.target.flatMap((t, c) => (t >= 0 ? [c] : []));
    this.seen = new Uint8Array(this.N * 4);
    // A (cell, direction) takes new colour at most 3 times, each pushing at most 3 beams of 3 ints.
    this.stack = new Int32Array(this.N * 4 * 3 * 3 * 3 + 64);
    this.nb = new Int16Array(this.N * 4);
    for (let c = 0; c < this.N; c++)
      for (let d = 0; d < 4; d++) {
        const r = Math.floor(c / this.n) + DR[d];
        const q = (c % this.n) + DC[d];
        this.nb[c * 4 + d] = r < 0 || r >= this.n || q < 0 || q >= this.n ? -1 : r * this.n + q;
      }
    this.got = new Uint8Array(this.N);
    this.may = new Uint8Array(this.N);
  }

  /** Starting domains: givens fixed, everything else empty or any piece in the tray. */
  initial(): Uint8Array {
    const { p } = this;
    let all = 1;
    p.stock.forEach((k, t) => k > 0 && (all |= TYPE_MASK[t]));
    return Uint8Array.from(p.sockets, (_, i) => (p.given[i] >= 0 ? bit(p.given[i]) : all));
  }

  /** Runs light through the board. certain: undecided sockets stop beams (and join the frontier);
   *  otherwise they pass on every option left. Fills `got` or `may`. */
  private run(dom: Uint8Array, certain: boolean): void {
    const { p, seen, stack, sock, nb } = this;
    const kind = p.kind;
    const out = certain ? this.got : this.may;
    seen.fill(0);
    out.fill(0);
    if (certain) this.frontier.length = 0;
    let sp = 0;
    for (const l of p.lamps) {
      const x = nb[l.cell * 4 + l.dir];
      if (x >= 0) (stack[sp++] = x), (stack[sp++] = l.dir), (stack[sp++] = l.mask);
    }
    while (sp) {
      const m0 = stack[--sp];
      const d = stack[--sp];
      const c = stack[--sp];
      const m = m0 & ~seen[c * 4 + d];
      if (!m) continue;
      seen[c * 4 + d] |= m;
      const k = kind[c];
      if (k === WALL || k === LAMP) continue;
      out[c] |= m;
      if (k === CRYSTAL) continue;
      let e = 1;
      if (k === SOCKET) {
        e = dom[sock[c]];
        if (certain && !single(e)) {
          if (!this.frontier.includes(sock[c])) this.frontier.push(sock[c]);
          continue;
        }
      }
      // A single code sends exactly its own light; a set sends the union of its options.
      let straight = 0;
      if (e & 0b11001) straight = m;
      else {
        if (e & 0b100000) straight |= m & 1;
        if (e & 0b1000000) straight |= m & 2;
        if (e & 0b10000000) straight |= m & 4;
      }
      let x: number;
      if (straight && (x = nb[c * 4 + d]) >= 0) (stack[sp++] = x), (stack[sp++] = d), (stack[sp++] = straight);
      if (e & 0b01010 && (x = nb[c * 4 + SLASH[d]]) >= 0) (stack[sp++] = x), (stack[sp++] = SLASH[d]), (stack[sp++] = m);
      if (e & 0b10100 && (x = nb[c * 4 + BACK[d]]) >= 0) (stack[sp++] = x), (stack[sp++] = BACK[d]), (stack[sp++] = m);
    }
  }

  /** Null when nothing is broken yet; otherwise why this domain can't be completed.
   *  `dom` may be narrowed in place by exhausted piece types (sound). */
  check(dom: Uint8Array): Reason | null {
    if (++this.checks > this.limit) this.aborted = true;
    const { p, left } = this;
    // Types already used up drop out of the undecided sockets; a socket that this
    // leaves with one option counts as placed, so repeat until nothing changes.
    for (let narrowed = true; narrowed; ) {
      narrowed = false;
      for (let t = 0; t < NTYPES; t++) left[t] = p.stock[t];
      for (let i = 0; i < dom.length; i++) {
        if (dom[i] === 0) return { k: 'unlit', cell: p.sockets[i] };
        if (single(dom[i]) && dom[i] !== 1) left[typeOf(codeOf(dom[i]))]--;
      }
      for (let t = 0; t < NTYPES; t++) if (left[t] < 0) return { k: 'over', t };
      let gone = 0;
      for (let t = 0; t < NTYPES; t++) if (left[t] === 0) gone |= TYPE_MASK[t];
      if (gone)
        for (let i = 0; i < dom.length; i++)
          if (!single(dom[i]) && dom[i] & gone) {
            const t = typeOf(codeOf(dom[i] & gone));
            dom[i] &= ~gone;
            if (!dom[i]) return { k: 'over', t };
            if (single(dom[i]) && dom[i] !== 1) narrowed = true;
          }
    }
    this.run(dom, true);
    for (const c of this.crystals) {
      const x = this.got[c] & ~p.target[c];
      if (x) return p.target[c] === 0 ? { k: 'dark', cell: c, mask: x } : { k: 'wrong', cell: c, mask: x };
    }
    this.run(dom, false);
    // Reasons go from the most direct (a piece left in the dark) to the most global (tray counts);
    // the order only changes which reason is reported, never whether one is.
    for (let i = 0; i < dom.length; i++) if (!this.may[p.sockets[i]] && !(dom[i] & 1)) return { k: 'unlit', cell: p.sockets[i] };
    for (const c of this.crystals) {
      const miss = p.target[c] & ~this.may[c];
      if (miss) return { k: 'unreach', cell: c, mask: miss };
    }
    const room = this.room.fill(0);
    let anyRoom = 0;
    let need = 0;
    for (let t = 0; t < NTYPES; t++) need += left[t];
    for (let i = 0; i < dom.length; i++) {
      const e = dom[i];
      if (!this.may[p.sockets[i]] || single(e)) continue;
      if (e & ~1) anyRoom++;
      for (let t = 0; t < NTYPES; t++) if (e & TYPE_MASK[t]) room[t]++;
    }
    for (let t = 0; t < NTYPES; t++) if (room[t] < left[t]) return { k: 'short', t };
    if (anyRoom < need) return { k: 'short', t: -1 };
    return null;
  }

  /** True when `check` passed and nothing is left undecided that light reaches:
   *  the board is a full answer (unlit sockets empty). Call right after `check`. */
  complete(): boolean {
    if (this.frontier.length) return false;
    if (this.left.some((x) => x !== 0)) return false;
    return this.crystals.every((c) => this.got[c] === this.p.target[c]);
  }
}

/** Every answer up to `limit` (a code per socket), by searching the frontier sockets. */
export function solveAll(p: Puzzle, limit = 2, ctx = new Ctx(p), dom0 = ctx.initial()): number[][] {
  const out: number[][] = [];
  const rec = (dom: Uint8Array): void => {
    if (out.length >= limit || ctx.aborted) return;
    if (ctx.check(dom)) return;
    if (!ctx.frontier.length) {
      if (ctx.complete()) out.push(Array.from(dom, (e) => (single(e) ? codeOf(e) : 0)));
      return;
    }
    // Branch on the frontier socket with the fewest options.
    let f = ctx.frontier[0];
    for (const g of ctx.frontier) if (count(dom[g]) < count(dom[f])) f = g;
    const e = dom[f];
    for (let x = e; x; x &= x - 1) {
      const b = x & -x;
      const next = dom.slice();
      next[f] = b;
      rec(next);
    }
  };
  rec(dom0.slice());
  return out;
}

export interface Elim {
  socket: number;
  code: number;
  depth: number;
  why: Reason;
}

const IDX = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Tests one assumption at a depth; returns why it fails, or null. */
function refute(ctx: Ctx, dom: Uint8Array, i: number, code: number, depth: number): Reason | null {
  const d = dom.slice();
  d[i] = bit(code);
  const r = ctx.check(d);
  if (r || depth <= 1) return r;
  const inner = fixpoint(ctx, d, depth - 1, null);
  return inner ? { k: 'deep', depth, inner } : null;
}

/** Depth-limited eliminations to a fixpoint (in place). Returns a contradiction if one appears. */
function fixpoint(ctx: Ctx, dom: Uint8Array, depth: number, log: Elim[] | null): Reason | null {
  for (;;) {
    if (ctx.aborted) return null;
    let changed = false;
    for (let lv = 1; lv <= depth && !changed && !ctx.aborted; lv++) {
      // Deeper looks try the tightest sockets first.
      const order = lv === 1 ? IDX(dom.length) : IDX(dom.length).sort((a, b) => count(dom[a]) - count(dom[b]));
      for (const i of order) {
        if (single(dom[i])) continue;
        for (let x = dom[i]; x; x &= x - 1) {
          const code = codeOf(x & -x);
          const why = refute(ctx, dom, i, code, lv);
          if (!why) continue;
          dom[i] &= ~bit(code);
          log?.push({ socket: i, code, depth: lv, why });
          changed = true;
          if (!dom[i]) return why;
          // Deeper looks stop at the first find: shallow ones go first again.
          if (lv > 1) break;
        }
        if (changed && lv > 1) break;
      }
    }
    const r = ctx.check(dom);
    if (r) return r;
    if (!changed) return null;
  }
}

export interface Deduction {
  /** Domains when the solver stopped (all single when solved). */
  dom: Uint8Array;
  solved: boolean;
  /** Deepest look needed. */
  depth: number;
  /** Eliminations in order. */
  log: Elim[];
}

/** The human model: eliminate with the shallowest look that works, up to maxDepth. */
export function deduce(p: Puzzle, maxDepth: number, dom0?: Uint8Array, ctx = new Ctx(p)): Deduction {
  const dom = (dom0 ?? ctx.initial()).slice();
  const log: Elim[] = [];
  fixpoint(ctx, dom, maxDepth, log);
  const solved = dom.every(single);
  return { dom, solved, depth: log.reduce((a, e) => Math.max(a, e.depth), 0), log };
}
