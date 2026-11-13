// Tidings bots. `careful` plans each stop: every order of cards and choices it
// could take here (gambles weighed by their shown odds, never by the seed's
// roll), then the road, and scores the result with a value that fears empty
// resources. The others are single-minded policies for comparison.

import { CARD, COMPANIONS, LAST, LETHAL, TUNE, act, actError, blockOf, cardBlock, legCost, oddsOf, scoreOf, type CompId, type Run } from '../../src/tidings/core';

export type Policy = (r: Run, rng: () => number) => string;

/** Every legal action right now. */
export function legal(r: Run): string[] {
  const out: string[] = [];
  if (r.phase === 'cards') {
    r.hand.forEach((hc, h) => {
      if (cardBlock(r, h)) return;
      CARD[hc.id].choices.forEach((ch, k) => !blockOf(r, ch) && out.push(`P${h}.${k}`));
    });
  } else if (r.phase === 'road') {
    r.map[r.stop + 1].forEach((_, k) => out.push(`M${k}`));
  }
  return out;
}

const clone = (r: Run): Run => {
  const c = { ...r, res: { ...r.res }, band: r.band.map((b) => ({ ...b })), met: [...r.met], flags: { ...r.flags }, promises: { ...r.promises }, used: [...r.used], hand: r.hand.map((h) => ({ ...h })), path: [...r.path], legs: [...r.legs], log: [...r.log], actions: [...r.actions] };
  return c;
};

/** The action's possible results with their chances (two for a gamble). */
function branches(r: Run, a: string): [number, Run][] {
  if (a[0] === 'P') {
    const ch = CARD[r.hand[Number(a[1])].id].choices[Number(a[3])];
    if (ch.odds !== undefined) {
      const p = oddsOf(r, ch);
      const w = clone(r), l = clone(r);
      act(w, a, true);
      act(l, a, false);
      return [[p, w], [1 - p, l]];
    }
  }
  const c = clone(r);
  act(c, a);
  return [[1, c]];
}

export interface Weights {
  /** Value of the first units of a lethal resource (log-shaped). */
  life: number;
  coin: number;
  comp: number;
  promise: number;
  /** Food and oil the bot wants in hand per leg still to walk. */
  reserve: number;
}
export const W: Weights = { life: 10, coin: 2.5, comp: 4, promise: 3, reserve: 0.5 };

/** The least each lethal resource the rest of the road will cost (the map is in plain view). */
export function drainAhead(r: Run): Record<string, number> {
  const d: Record<string, number> = { f: 0, o: 0, h: 0, t: 0 };
  for (let row = r.stop + 1; row <= LAST; row++) {
    for (const k of ['f', 'o', 'h', 't'] as const) d[k] += Math.min(...r.map[row].map((_, i) => -(legCost(r, i, row)[k] ?? 0)));
  }
  return d;
}

/** How good a state is for the careful bot. */
export function value(r: Run, w = W): number {
  if (r.phase === 'over') return r.end!.ending in { starve: 1, dark: 1, hurt: 1, scatter: 1 } ? -1000 + r.stop * 10 : 500 + scoreOf(r);
  const left = LAST - r.stop;
  const drain = drainAhead(r);
  let v = 0;
  for (const k of LETHAL) {
    // Stock the road ahead will eat is worth less than stock to spare.
    const x = r.res[k] - w.reserve * drain[k];
    v += (x >= 0 ? w.life * Math.log(1 + x) : w.life * x) + 0.6 * r.res[k];
  }
  v += w.coin * Math.log(1 + r.res.c);
  v += w.comp * r.band.length * Math.min(1, left / 5);
  v += w.promise * Object.values(r.promises).filter((p) => p === 'carry').length;
  return v;
}

/** Best expected value from here to the end of this stop's road choice. */
function plan(r: Run, w: Weights): { v: number; a: string } {
  if (r.phase === 'over') return { v: value(r, w), a: '' };
  const acts = legal(r);
  let best = { v: -Infinity, a: acts[0] };
  for (const a of acts) {
    let v = 0;
    for (const [p, s] of branches(r, a)) v += p * (r.phase === 'cards' && s.phase !== 'over' ? plan(s, w).v : value(s, w));
    if (v > best.v) best = { v, a };
  }
  return best;
}

export const careful = (w = W): Policy => (r) => plan(r, w).a;

const pick = <T>(xs: T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)];
export const random: Policy = (r, rng) => pick(legal(r), rng);

/** Sum of an action's lethal losses (negatives), for the safe policy; gambles count their worst case. */
function choiceOf(r: Run, a: string) {
  return CARD[r.hand[Number(a[1])].id].choices[Number(a[3])];
}
const loss = (fx: Record<string, number | undefined>) => Object.entries(fx).reduce((s, [k, d]) => s + (d! < 0 ? (k === 'c' ? 0.5 : 1) * -d! : 0), 0);
const gain = (fx: Record<string, number | undefined>) => Object.entries(fx).reduce((s, [k, d]) => s + (d! > 0 ? (k === 'c' ? 0.5 : 1) * d! : 0), 0);
const roadBy = (r: Run, f: (fx: Record<string, number | undefined>) => number): string => {
  const ks = r.map[r.stop + 1].map((_, k) => k);
  ks.sort((a, b) => f(legCost(r, a)) - f(legCost(r, b)));
  return `M${ks[0]}`;
};

/** Never gambles when it can help it; takes the smallest loss, then the biggest gain. Cheapest road. */
export const safe: Policy = (r) => {
  if (r.phase === 'road') return roadBy(r, loss);
  const acts = legal(r);
  const score = (a: string) => {
    const ch = choiceOf(r, a);
    const worst = ch.lose ? Math.max(loss(ch.fx), loss(ch.lose.fx)) : loss(ch.fx);
    return (ch.odds !== undefined ? 100 : 0) + worst * 10 - gain(ch.lose ? ch.lose.fx : ch.fx);
  };
  return acts.sort((a, b) => score(a) - score(b))[0];
};

/** Always the gamble if there is one, else the biggest swing. */
export const risky: Policy = (r, rng) => {
  if (r.phase === 'road') return pick(legal(r), rng);
  const acts = legal(r);
  const score = (a: string) => {
    const ch = choiceOf(r, a);
    return (ch.odds !== undefined ? 100 : 0) + gain(ch.fx) + loss(ch.fx);
  };
  return acts.sort((a, b) => score(b) - score(a))[0];
};

/** The biggest total gain on paper (all resources alike), ignoring what it costs. */
export const greedy: Policy = (r, rng) => {
  if (r.phase === 'road') return pick(legal(r), rng);
  const acts = legal(r);
  const score = (a: string) => {
    const ch = choiceOf(r, a);
    const p = ch.odds ?? 1;
    const sum = (fx: Record<string, number | undefined>) => Object.values(fx).reduce((s, d) => s! + d!, 0)!;
    return p * sum(ch.fx) + (1 - p) * (ch.lose ? sum(ch.lose.fx) : 0);
  };
  return acts.sort((a, b) => score(b) - score(a))[0];
};

/** Takes every companion offered and any choice a companion unlocks; otherwise careful. */
export const crowd: Policy = (r, rng) => {
  if (r.phase === 'cards') {
    const acts = legal(r);
    const j = acts.find((a) => choiceOf(r, a).join);
    if (j) return j;
    const n = acts.find((a) => choiceOf(r, a).need);
    if (n) return n;
  }
  return careful()(r, rng);
};

/** Hoards coin: always the most coin, then careful. */
export const miser: Policy = (r, rng) => {
  if (r.phase === 'cards') {
    const acts = legal(r);
    const c = (a: string) => choiceOf(r, a).fx.c ?? 0;
    const best = Math.max(...acts.map(c));
    const top = acts.filter((a) => c(a) === best);
    if (top.length === 1) return top[0];
  }
  return careful()(r, rng);
};

/** A casual player: weighs each choice on its own (no pairing, no road planning) and sometimes just picks what appeals. */
export const casual: Policy = (r, rng) => {
  const acts = legal(r);
  if (rng() < 0.25) return pick(acts, rng);
  let best = acts[0], bv = -Infinity;
  for (const a of acts) {
    let v = 0;
    for (const [p, s] of branches(r, a)) v += p * value(s);
    if (v > bv) (bv = v), (best = a);
  }
  return best;
};

export const POLICIES: Record<string, Policy> = { careful: careful(), casual, random, safe, risky, greedy, crowd, miser };

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plays one run to its end with a policy. */
export function playRun(r: Run, pol: Policy, rngSeed = r.seed): Run {
  const rng = mulberry(rngSeed ^ 0x5bd1e995);
  for (let guard = 0; r.phase !== 'over' && guard < 500; guard++) {
    const a = pol(r, rng);
    if (!a || !act(r, a)) throw new Error(`bot made an illegal move ${a} (${a && actError(r, a)}) on seed ${r.seed}`);
  }
  return r;
}

export const compName = (id: CompId) => COMPANIONS[id].name;
export { TUNE };
