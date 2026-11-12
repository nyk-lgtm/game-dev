// A Summit run: eight deals of peaks solitaire, with a charm picked between deals.
// Pure and deterministic: a run is its seed plus the action list, and replay()
// rebuilds it exactly. Actions:
//   P<slot>  play an uncovered card onto the waste (one rank up or down, A-K wraps)
//   D        draw the next card of the pile onto the waste (ends the streak)
//   B<slot>  blast a card away (Blasting Cap charm, once per deal)
//   U        undo the last play, draw or blast (Rewind charm)
//   C<id>    pick a charm between deals
//   X        give up

import { Rng, mixSeed } from '../../shared/rng';
import { freshDeck, rankGap, type Card } from './cards';
import { CHARMS, type CharmId } from './charms';
import { layoutFor, slotsOf } from './layouts';

export const RULES_VERSION = 1;
export const FLOORS = 8;
/** New draws added to the pile on each floor, before charms. Unused draws carry over. */
export const DEAL_DRAWS = [40, 20, 12, 10, 8, 6, 4, 3];
/** Chance a covered card starts face down, per floor. */
export const FACE_DOWN = [0, 0.25, 0.45, 0.6, 0.7, 0.8, 0.9, 1];
export const WIND_DRAWS = 6;
export const WIN_BONUS = 500;
export const JOKER: Card = { r: 0, s: -1 };

export interface Slot {
  card: Card;
  row: number;
  /** Column in half-card steps. */
  x: number;
  coveredBy: number[];
  /** Dealt face down and not yet uncovered. */
  down: boolean;
  gone: boolean;
}

export interface Deal {
  layout: string;
  rows: number;
  slots: Slot[];
  /** Draw pile; the next card is the last one. */
  stock: Card[];
  /** The top card is the last one. */
  waste: Card[];
  /** Spare cards (a second deck) for draws given back and Second Wind. */
  reserve: Card[];
  ri: number;
  streak: number;
  suitRun: number;
  blasts: number;
}

export type Phase = 'play' | 'charm' | 'over';

export interface Run {
  seed: number;
  /** 0-based floor being played (or just cleared, while picking a charm). */
  floor: number;
  phase: Phase;
  won: boolean;
  charms: CharmId[];
  offer: CharmId[];
  deal: Deal;
  score: number;
  bestStreak: number;
  /** Floors cleared. */
  cleared: number;
  undos: number;
  windUsed: boolean;
  /** Unused draws carried into the next deal. */
  carry: number;
  hist: Snap[];
  actions: string[];
}

interface Snap {
  deal: Deal;
  score: number;
  bestStreak: number;
}

export interface Outcome {
  kind: 'play' | 'draw' | 'blast' | 'undo' | 'charm' | 'quit';
  slot?: number;
  points?: number;
  stride?: boolean;
  flush?: boolean;
  /** Draws given back (Flush, Momentum). */
  refund?: number;
  /** Slots turned face up by this action. */
  flipped?: number[];
  cleared?: boolean;
  /** Deal-clear bonus (and the win bonus on the last floor). */
  bonus?: number;
  unused?: number;
  won?: boolean;
  /** Second Wind just blew. */
  wind?: boolean;
  over?: boolean;
}

export const has = (r: Run, c: CharmId) => r.charms.includes(c);

/** New draws this floor brings (charms included). */
export function freshDraws(r: Run): number {
  return Math.max(2, DEAL_DRAWS[r.floor] + (has(r, 'pockets') ? 3 : 0) - (has(r, 'stakes') ? 2 : 0) - (has(r, 'lantern') ? 1 : 0));
}

function newDeal(r: Run): Deal {
  const rng = new Rng(mixSeed(r.seed, r.floor + 1));
  const layout = rng.pick(layoutFor(r.floor));
  const deck = rng.shuffle(freshDeck());
  const pos = slotsOf(layout);
  const slots: Slot[] = pos.map((p, i) => {
    const roll = rng.next();
    return { card: deck[i], row: p.row, x: p.x, coveredBy: p.coveredBy, down: p.coveredBy.length > 0 && roll < FACE_DOWN[r.floor], gone: false };
  });
  const n = slots.length;
  const pool = deck.slice(n + 1).concat(rng.shuffle(freshDeck()), rng.shuffle(freshDeck()));
  const draws = Math.min(pool.length - 20, r.carry + freshDraws(r));
  const stock = pool.slice(0, draws);
  const jokerAt = rng.int(1, stock.length);
  if (has(r, 'joker')) stock.splice(jokerAt, 0, { ...JOKER });
  return {
    layout: layout.name,
    rows: layout.rows.length,
    slots,
    stock,
    waste: [deck[n]],
    reserve: pool.slice(draws),
    ri: 0,
    streak: 0,
    suitRun: 0,
    blasts: has(r, 'blast') ? 1 : 0,
  };
}

function startFloor(r: Run): void {
  r.deal = newDeal(r);
  r.hist = [];
  r.undos = has(r, 'rewind') ? 2 : 0;
  r.phase = 'play';
}

export function newRun(seed: number): Run {
  const r = {
    seed: seed >>> 0,
    floor: 0,
    phase: 'play',
    won: false,
    charms: [],
    offer: [],
    score: 0,
    bestStreak: 0,
    cleared: 0,
    undos: 0,
    windUsed: false,
    carry: 0,
    hist: [],
    actions: [],
  } as unknown as Run;
  startFloor(r);
  return r;
}

/** A run dropped straight onto a floor with some charms (for tests and probes). */
export function startAt(seed: number, floor: number, charms: CharmId[] = []): Run {
  const r = newRun(seed);
  r.floor = floor;
  r.charms = charms.slice();
  startFloor(r);
  return r;
}

export const top = (d: Deal): Card => d.waste[d.waste.length - 1];
export const isCovered = (d: Deal, i: number): boolean => d.slots[i].coveredBy.some((j) => !d.slots[j].gone);
/** Whether the player can see this card's face. */
export const shown = (r: Run, i: number): boolean => !r.deal.slots[i].down || has(r, 'lantern');

/** How a card would play on the waste: a normal play, a Long Stride play, or not at all. */
export function fitKind(r: Run, c: Card, t: Card = top(r.deal)): 'play' | 'stride' | null {
  if (t.r === 0 || c.r === 0) return 'play';
  const g = rankGap(c.r, t.r);
  if (g === 1) return 'play';
  if (g === 0 && has(r, 'mirror')) return 'play';
  if (g === 2 && has(r, 'stride') && r.deal.stock.length) return 'stride';
  return null;
}

export function playable(r: Run, i: number): boolean {
  const s = r.deal.slots[i];
  return r.phase === 'play' && !!s && !s.gone && !isCovered(r.deal, i) && fitKind(r, s.card) !== null;
}

export const playableSlots = (r: Run): number[] => r.deal.slots.map((_, i) => i).filter((i) => playable(r, i));
export const cardsLeft = (d: Deal) => d.slots.reduce((k, s) => k + (s.gone ? 0 : 1), 0);

/** No play, no draw, no blast and no undo left. */
export function stuck(r: Run): boolean {
  const d = r.deal;
  return !playableSlots(r).length && !d.stock.length && !(d.blasts > 0) && !(r.undos > 0 && r.hist.length > 0);
}

/** Out of plays and draws, but a blast or undo could still help (the player decides). */
export const cornered = (r: Run): boolean => r.phase === 'play' && !playableSlots(r).length && !r.deal.stock.length;

export function offersFor(r: Run): CharmId[] {
  const rng = new Rng(mixSeed(r.seed, 500 + r.floor));
  return rng
    .shuffle(CHARMS.map((c) => c.id))
    .filter((id) => !r.charms.includes(id))
    .slice(0, 3);
}

function cloneDeal(d: Deal): Deal {
  return { ...d, slots: d.slots.map((s) => ({ ...s })), stock: d.stock.slice(), waste: d.waste.slice() };
}

function snap(r: Run): void {
  r.hist.push({ deal: cloneDeal(r.deal), score: r.score, bestStreak: r.bestStreak });
  if (r.hist.length > 60) r.hist.shift();
}

function giveBack(d: Deal): number {
  if (d.ri >= d.reserve.length) return 0;
  d.stock.unshift(d.reserve[d.ri++]);
  return 1;
}

function flip(d: Deal): number[] {
  const out: number[] = [];
  d.slots.forEach((s, i) => {
    if (!s.gone && s.down && !isCovered(d, i)) {
      s.down = false;
      out.push(i);
    }
  });
  return out;
}

/** After a play or blast: clear the deal if it's empty. */
function afterRemove(r: Run, o: Outcome): void {
  const d = r.deal;
  o.flipped = flip(d);
  if (cardsLeft(d)) return;
  const unused = d.stock.length;
  const bonus = 100 + 50 * (r.floor + 1);
  r.score += bonus;
  r.cleared++;
  r.carry = unused;
  o.cleared = true;
  o.unused = unused;
  o.bonus = bonus;
  r.hist = [];
  if (r.floor === FLOORS - 1) {
    r.score += WIN_BONUS + 20 * unused;
    o.bonus += WIN_BONUS + 20 * unused;
    r.won = o.won = true;
    r.phase = 'over';
    o.over = true;
  } else {
    r.phase = 'charm';
    r.offer = offersFor(r);
  }
}

function checkStuck(r: Run, o: Outcome): void {
  if (r.phase !== 'play' || !stuck(r)) return;
  if (has(r, 'wind') && !r.windUsed) {
    r.windUsed = true;
    for (let k = 0; k < WIND_DRAWS; k++) giveBack(r.deal);
    o.wind = true;
    return;
  }
  r.phase = 'over';
  o.over = true;
}

/** Applies one action; returns what happened, or null if it isn't legal now. */
export function act(r: Run, a: string): Outcome | null {
  if (r.phase === 'over') return null;
  const d = r.deal;
  let o: Outcome | null = null;
  const c = a[0];
  const n = Number(a.slice(1));
  if (r.phase === 'charm') {
    if (c !== 'C' || !r.offer.includes(a.slice(1) as CharmId)) return null;
    r.charms.push(a.slice(1) as CharmId);
    r.offer = [];
    r.floor++;
    startFloor(r);
    o = { kind: 'charm' };
  } else if (a === 'X') {
    r.phase = 'over';
    o = { kind: 'quit', over: true };
  } else if (a === 'U') {
    if (!(r.undos > 0) || !r.hist.length) return null;
    const s = r.hist.pop()!;
    r.deal = s.deal;
    r.score = s.score;
    r.bestStreak = s.bestStreak;
    r.undos--;
    o = { kind: 'undo' };
  } else if (a === 'D') {
    if (!d.stock.length) return null;
    snap(r);
    d.waste.push(d.stock.pop()!);
    d.streak = 0;
    d.suitRun = 0;
    o = { kind: 'draw' };
  } else if (c === 'P' && /^P\d+$/.test(a)) {
    if (!playable(r, n)) return null;
    snap(r);
    const s = d.slots[n];
    const t = top(d);
    const kind = fitKind(r, s.card)!;
    s.gone = true;
    d.waste.push(s.card);
    o = { kind: 'play', slot: n, points: 0, refund: 0 };
    if (kind === 'stride') {
      // A long stride burns the next draw.
      d.stock.pop();
      o.stride = true;
      d.streak = 0;
      d.suitRun = 0;
    } else {
      d.streak++;
      r.bestStreak = Math.max(r.bestStreak, d.streak);
      let pts = 10 * d.streak;
      if (has(r, 'stakes')) pts *= 2;
      const same = t.s >= 0 && t.s === s.card.s;
      d.suitRun = same ? d.suitRun + 1 : 0;
      if (same && has(r, 'flush')) {
        pts *= 2;
        o.flush = true;
        if (d.suitRun >= 3) {
          d.suitRun = 0;
          o.refund! += giveBack(d);
        }
      }
      if (has(r, 'momentum') && d.streak % 5 === 0) o.refund! += giveBack(d);
      o.points = pts;
      r.score += pts;
    }
    if (s.row === 0 && has(r, 'flags')) o.refund! += giveBack(d);
    afterRemove(r, o);
  } else if (c === 'B' && /^B\d+$/.test(a)) {
    const s = d.slots[n];
    if (!(d.blasts > 0) || !s || s.gone) return null;
    snap(r);
    d.blasts--;
    s.gone = true;
    o = { kind: 'blast', slot: n, refund: s.row === 0 && has(r, 'flags') ? giveBack(d) : 0 };
    afterRemove(r, o);
  } else return null;
  r.actions.push(a);
  checkStuck(r, o);
  return o;
}

/** Every legal action right now (giving up included while playing). */
export function legal(r: Run): string[] {
  if (r.phase === 'over') return [];
  if (r.phase === 'charm') return r.offer.map((c) => `C${c}`);
  const d = r.deal;
  const out = playableSlots(r).map((i) => `P${i}`);
  if (d.stock.length) out.push('D');
  if (d.blasts > 0) d.slots.forEach((s, i) => !s.gone && out.push(`B${i}`));
  if (r.undos > 0 && r.hist.length) out.push('U');
  out.push('X');
  return out;
}

export function replay(seed: number, actions: string[]): Run {
  const r = newRun(seed);
  for (const a of actions) if (!act(r, a)) break;
  return r;
}

/** Floor reached (1-based) for the end card and stats. */
export const floorReached = (r: Run) => Math.min(FLOORS, r.floor + 1);
