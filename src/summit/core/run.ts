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

export const RULES_VERSION = 4;
export const FLOORS = 8;
/** New draws added to the pile on each floor, before charms. Unused draws carry over. */
export const DEAL_DRAWS = [28, 16, 9, 9, 8, 8, 7, 7];
/** Chance a covered card starts face down, per floor. */
export const FACE_DOWN = [0, 0.25, 0.45, 0.6, 0.7, 0.8, 0.9, 1];
/** Charm strengths (an object so balance probes can try other values). */
export const TUNE = {
  /** Same-rank plays per deal (Mirror). */
  mirrors: 2,
  /** Long-stride plays per deal. */
  strides: 2,
  /** Long Stride discards the top card of the pile: 0 never, 1 always, 2 only when that card fits nothing open. */
  strideCost: 2,
  /** Draws given back per peak top (Peak Flags). */
  flags: 1,
  /** Fresh draws from Second Wind. */
  wind: 12,
  /** Most unused draws that carry up to the next floor. */
  carry: 15,
  /** Extra draws per deal (Lantern). */
  lantern: 1,
  /** Extra draws per deal (Deep Pockets). */
  pockets: 3,
};
/** The draw that ends this many plays-free draws in a row always fits, if any card in the pile does. */
export const MERCY = 3;
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
  /** Cards of one suit played in a row (Flush), and that suit. */
  suitRun: number;
  runSuit: number;
  /** Mirror and Long Stride plays left this deal. */
  mirrors: number;
  strides: number;
  /** Draws since the last play. */
  dry: number;
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
  /** The mercy rule swapped in a card that fits. */
  lucky?: boolean;
  /** A Long Stride discarded the top card of the pile. */
  burned?: boolean;
  /** The lucky card came from the rest of the deck (nothing in the pile fit). */
  deep?: boolean;
  /** The mercy rule was due but no card left anywhere fits an open card. */
  noLuck?: boolean;
  /** The floor was lost because no card that could still come up fits any open card. */
  dead?: boolean;
  /** A Mirror play (same rank). */
  mirror?: boolean;
  /** Second Wind just blew. */
  wind?: boolean;
  over?: boolean;
}

export const has = (r: Run, c: CharmId) => r.charms.includes(c);

/** New draws this floor brings (charms included). */
export function freshDraws(r: Run): number {
  return Math.max(2, DEAL_DRAWS[r.floor] + (has(r, 'pockets') ? TUNE.pockets : 0) + (has(r, 'lantern') ? TUNE.lantern : 0) - (has(r, 'stakes') ? 1 : 0));
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
  const stock = declump(pool.slice(0, draws));
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
    runSuit: -1,
    mirrors: has(r, 'mirror') ? TUNE.mirrors : 0,
    strides: has(r, 'stride') ? TUNE.strides : 0,
    dry: 0,
    blasts: has(r, 'blast') ? 1 : 0,
  };
}

/** No two cards of one rank back to back in the pile (draws come off the end). */
function declump(stock: Card[]): Card[] {
  const n = stock.length;
  const r = (k: number) => (k >= 0 && k < n ? stock[k].r : -1);
  // Would card c sit at k without matching a neighbour (ignoring position `skip`)?
  const fitsAt = (c: Card, k: number, skip: number) => (k - 1 === skip || r(k - 1) !== c.r) && (k + 1 === skip || r(k + 1) !== c.r);
  for (let i = n - 2; i >= 0; i--) {
    if (stock[i].r !== stock[i + 1].r) continue;
    // Swap stock[i] with the nearest card (deeper first, then above) that leaves both spots clean.
    const order = [...Array(n).keys()].filter((j) => j < i).reverse().concat([...Array(n).keys()].filter((j) => j > i + 1));
    const j = order.find((j) => stock[j].r !== stock[i].r && fitsAt(stock[j], i, j) && fitsAt(stock[i], j, i));
    if (j !== undefined) [stock[i], stock[j]] = [stock[j], stock[i]];
  }
  return stock;
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
  if (g === 0 && r.deal.mirrors > 0) return 'play';
  if (g === 2 && r.deal.strides > 0 && r.deal.stock.length) return 'stride';
  return null;
}

export function playable(r: Run, i: number): boolean {
  const s = r.deal.slots[i];
  return r.phase === 'play' && !!s && !s.gone && !isCovered(r.deal, i) && fitKind(r, s.card) !== null;
}

export const playableSlots = (r: Run): number[] => r.deal.slots.map((_, i) => i).filter((i) => playable(r, i));
export const cardsLeft = (d: Deal) => d.slots.reduce((k, s) => k + (s.gone ? 0 : 1), 0);

/** Nothing can ever be played again (see hopeless), and no blast or undo left. */
export function stuck(r: Run): boolean {
  const d = r.deal;
  return hopeless(r) && !(d.blasts > 0) && !(r.undos > 0 && r.hist.length > 0);
}

/** Nothing can ever be played again, but a blast or undo could still help (the player decides). */
export const cornered = (r: Run): boolean => hopeless(r);

/** Whether a Long Stride play now would discard the top card of the pile. */
export function strideDiscards(r: Run): boolean {
  const d = r.deal;
  if (TUNE.strideCost !== 2) return TUNE.strideCost === 1;
  const t = d.stock[d.stock.length - 1];
  if (!t) return false;
  // The top card is spared if it fits an open card (other than the one striding away).
  return !d.slots.some((s, i) => !s.gone && !isCovered(d, i) && fitKind(r, s.card, t) === 'play');
}

export function offersFor(r: Run): CharmId[] {
  const rng = new Rng(mixSeed(r.seed, 500 + r.floor));
  return rng
    .shuffle(CHARMS.map((c) => c.id))
    .filter((id) => !r.charms.includes(id))
    .slice(0, 3);
}

function cloneDeal(d: Deal): Deal {
  return { ...d, slots: d.slots.map((s) => ({ ...s })), stock: d.stock.slice(), waste: d.waste.slice(), reserve: d.reserve.slice() };
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

function flagDraws(d: Deal): number {
  let n = 0;
  for (let k = 0; k < TUNE.flags; k++) n += giveBack(d);
  return n;
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
  r.carry = Math.min(TUNE.carry, unused);
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

/**
 * Mercy: if the card about to be drawn fits nothing that's open, swap in the
 * nearest card further down the pile that does. Returns whether it swapped.
 */
function mercy(r: Run): 'fits' | 'lucky' | 'deep' | 'none' {
  const d = r.deal;
  const t = top(d);
  const open = d.slots.filter((s, i) => !s.gone && !isCovered(d, i));
  const fits = (c: Card) => c.r !== t.r && open.some((s) => fitKind(r, s.card, c) === 'play');
  const k = d.stock.length - 1;
  if (k < 0 || fits(d.stock[k])) return 'fits';
  // The nearest card that fits, a plain one before the Joker.
  for (const joker of [false, true])
    for (let j = k - 1; j >= 0; j--)
      if ((d.stock[j].r === 0) === joker && fits(d.stock[j])) {
        [d.stock[k], d.stock[j]] = [d.stock[j], d.stock[k]];
        return 'lucky';
      }
  // Nothing in the pile fits: the next fitting card from the rest of the deck takes the top card's place.
  for (let j = d.ri; j < d.reserve.length; j++)
    if (fits(d.reserve[j])) {
      [d.stock[k], d.reserve[j]] = [d.reserve[j], d.stock[k]];
      return 'deep';
    }
  return 'none';
}

/**
 * Nothing can ever be played again: no open card fits the waste, and no card that a
 * draw could still turn up (the pile, or the rest of the deck via the lucky draw) fits one.
 * Exact, because without a play the open cards never change.
 */
export function hopeless(r: Run): boolean {
  const d = r.deal;
  if (r.phase !== 'play' || playableSlots(r).length) return false;
  if (!d.stock.length) return true;
  const open = d.slots.filter((s, i) => !s.gone && !isCovered(d, i));
  const fits = (c: Card) => open.some((s) => fitKind(r, s.card, c) === 'play');
  return !d.stock.some(fits) && !d.reserve.slice(d.ri).some(fits);
}

/** A draw never turns up the rank already on the waste: swap in the nearest deeper card that differs. */
function noRepeat(d: Deal): void {
  const t = top(d);
  const k = d.stock.length - 1;
  if (k < 0 || t.r === 0 || d.stock[k].r !== t.r) return;
  for (let j = k - 1; j >= 0; j--)
    if (d.stock[j].r !== t.r) {
      [d.stock[k], d.stock[j]] = [d.stock[j], d.stock[k]];
      return;
    }
}

/** Turns up the next card of the pile (with the no-repeat and mercy rules); the pile must not be empty. */
function drawStep(r: Run, o?: Outcome): void {
  const d = r.deal;
  d.streak = 0;
  d.suitRun = 0;
  d.runSuit = -1;
  d.dry++;
  noRepeat(d);
  if (d.dry >= MERCY) {
    const m = mercy(r);
    if (o && (m === 'lucky' || m === 'deep')) o.lucky = true;
    if (o && m === 'deep') o.deep = true;
    if (o && m === 'none') o.noLuck = true;
  }
  d.waste.push(d.stock.pop()!);
}

/**
 * The next n cards you would turn up drawing n times in a row from here
 * (Spyglass). Exact unless you play a card in between, which changes the rules' choices.
 */
export function nextDraws(r: Run, n: number): { card: Card; lucky: boolean }[] {
  const sim = { ...r, deal: cloneDeal(r.deal) };
  const out: { card: Card; lucky: boolean }[] = [];
  for (let k = 0; k < n && sim.deal.stock.length; k++) {
    const o: Outcome = { kind: 'draw' };
    drawStep(sim, o);
    out.push({ card: top(sim.deal), lucky: !!o.lucky });
  }
  return out;
}

function checkStuck(r: Run, o: Outcome): void {
  if (r.phase !== 'play') return;
  // Second Wind blows as soon as plays and draws run out, before any blast or undo.
  if (hopeless(r) && has(r, 'wind') && !r.windUsed) {
    r.windUsed = true;
    for (let k = 0; k < TUNE.wind; k++) giveBack(r.deal);
    o.wind = true;
    if (!hopeless(r)) return;
  }
  if (!stuck(r)) return;
  r.phase = 'over';
  o.over = true;
  if (r.deal.stock.length) o.dead = true;
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
    // Cards you have seen stay face up: undo takes back moves, not knowledge.
    s.deal.slots.forEach((q, i) => (q.down &&= d.slots[i].down));
    r.deal = s.deal;
    r.score = s.score;
    r.bestStreak = s.bestStreak;
    r.undos--;
    o = { kind: 'undo' };
  } else if (a === 'D') {
    if (!d.stock.length) return null;
    snap(r);
    o = { kind: 'draw' };
    drawStep(r, o);
  } else if (c === 'P' && /^P\d+$/.test(a)) {
    if (!playable(r, n)) return null;
    snap(r);
    const s = d.slots[n];
    const t = top(d);
    const kind = fitKind(r, s.card)!;
    s.gone = true;
    d.waste.push(s.card);
    o = { kind: 'play', slot: n, points: 0, refund: 0 };
    d.dry = 0;
    if (kind === 'stride') {
      // A long stride may discard the top card of the pile (see TUNE.strideCost).
      if (strideDiscards(r)) {
        d.stock.pop();
        o.burned = true;
      }
      o.stride = true;
      d.streak = 0;
      d.suitRun = 0;
      d.runSuit = -1;
      d.strides--;
    } else {
      if (t.r > 0 && s.card.r === t.r) {
        d.mirrors--;
        o.mirror = true;
      }
      d.streak++;
      r.bestStreak = Math.max(r.bestStreak, d.streak);
      let pts = 10 * d.streak;
      if (has(r, 'stakes')) pts *= 2;
      if (s.card.s === d.runSuit) d.suitRun++;
      else {
        d.runSuit = s.card.s;
        d.suitRun = 1;
      }
      if (has(r, 'flush')) {
        if (t.s >= 0 && t.s === s.card.s) {
          pts *= 2;
          o.flush = true;
        }
        if (d.suitRun >= 3) {
          d.suitRun = 0;
          d.runSuit = -1;
          o.refund! += giveBack(d);
        }
      }
      if (has(r, 'momentum') && d.streak % 5 === 0) o.refund! += giveBack(d);
      o.points = pts;
      r.score += pts;
    }
    if (s.row === 0 && has(r, 'flags')) o.refund! += flagDraws(d);
    afterRemove(r, o);
  } else if (c === 'B' && /^B\d+$/.test(a)) {
    const s = d.slots[n];
    if (!(d.blasts > 0) || !s || s.gone) return null;
    snap(r);
    d.blasts--;
    s.gone = true;
    o = { kind: 'blast', slot: n, refund: s.row === 0 && has(r, 'flags') ? flagDraws(d) : 0 };
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
