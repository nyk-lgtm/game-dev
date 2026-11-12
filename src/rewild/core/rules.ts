// Turn structure: each season you are dealt four cards and may play up to
// two, then the season simulates. Five years, twenty seasons.

import { Rng, mixSeed } from '../../shared/rng';
import { makeIsland } from './island';
import { ALL_IDS, ANIMALS, PLANTS, SPECIES, animalFits, canRootOver, isPlant } from './species';
import { SEASONS, census, moisture, plantOk, seasonPoints, simulate, weatherFor } from './sim';
import type { Action, Cell, GameState, Goal, SimEvent, SpeciesId } from './types';

export const HAND = 4;
export const PLAYS = 2;
export const START_REROLLS = 2;
export const MAX_REROLLS = 3;
/** Species alive needed to unlock card tiers 2 and 3 (or the season it opens anyway). */
export const UNLOCK = [
  { tier: 2, species: 3, season: 4 },
  { tier: 3, species: 6, season: 10 },
];

interface GoalDef {
  id: string;
  targets: number[];
  reward: number;
  text: (n: number) => string;
  measure: (s: GameState) => number;
}

const cellsWith = (s: GameState, f: (c: Cell) => boolean) => s.cells.filter(f).length;

export const GOALS: GoalDef[] = [
  { id: 'soil', targets: [12, 15, 18], reward: 40, text: (n) => `Turn ${n} rock or sand cells into soil`, measure: (s) => s.stats.soilMade },
  { id: 'oaks', targets: [2, 2, 3], reward: 50, text: (n) => `Grow ${n} full oaks at once`, measure: (s) => cellsWith(s, (c) => c.plant?.id === 'tree' && c.plant.n === 3) },
  { id: 'species', targets: [13, 14, 15], reward: 60, text: (n) => `Have ${n} species living at once`, measure: (s) => census(s.cells).species.size },
  { id: 'ponds', targets: [1, 2], reward: 50, text: (n) => `Beavers dam ${n} new pond${n > 1 ? "s" : ""}`, measure: (s) => s.stats.pondsMade },
  { id: 'meadow', targets: [5, 6, 8], reward: 40, text: (n) => `${n} cells of wildflowers at once`, measure: (s) => cellsWith(s, (c) => c.plant?.id === 'flowers') },
  { id: 'marsh', targets: [4, 5, 6], reward: 40, text: (n) => `${n} cells of marsh`, measure: (s) => cellsWith(s, (c) => c.t === 'marsh') },
  { id: 'forest', targets: [5, 6, 8], reward: 50, text: (n) => `${n} cells of oak or shrub at once`, measure: (s) => cellsWith(s, (c) => c.plant?.id === 'tree' || c.plant?.id === 'shrub') },
  { id: 'wolves', targets: [3, 4, 6], reward: 60, text: (n) => `Wolves and deer together for ${n} seasons`, measure: (s) => s.stats.wolfDeer },
  { id: 'birds', targets: [4, 5, 6], reward: 40, text: (n) => `Songbirds on ${n} cells at once`, measure: (s) => cellsWith(s, (c) => c.animal?.id === 'songbird') },
  { id: 'frogs', targets: [3, 3, 4], reward: 40, text: (n) => `Frogs on ${n} cells at once`, measure: (s) => cellsWith(s, (c) => c.animal?.id === 'frog') },
];

/** Final-score thresholds for one, two and three stars. */
export const STARS = [900, 1700, 2400];

/** A species alive at the end of this many seasons in a row is settled, and earns SETTLED_BONUS each season after. */
export const SETTLE_AFTER = 4;
export const SETTLED_BONUS = 3;
export const starsFor = (score: number) => STARS.filter((t) => score >= t).length;

export function newGame(seed: number): GameState {
  const rng = new Rng(mixSeed(seed, 303));
  const pool = rng.shuffle([...GOALS]).slice(0, 3);
  const goals: Goal[] = pool.map((g) => {
    const target = rng.pick(g.targets);
    return { id: g.id, text: g.text(target), target, progress: 0, done: false, reward: g.reward };
  });
  const s: GameState = {
    seed,
    cells: makeIsland(seed),
    season: 0,
    hand: [],
    ...weatherFor(seed, 0),
    score: 0,
    goals,
    log: [],
    plays: PLAYS,
    rerolls: START_REROLLS,
    deals: 0,
    tier: 1,
    stats: { soilMade: 0, pondsMade: 0, burnt: 0, wolfDeer: 0, maxSpecies: 0, streak: {} },
    over: false,
  };
  deal(s);
  return s;
}

export function clone(s: GameState): GameState {
  return {
    ...s,
    cells: s.cells.map((c) => ({ ...c, plant: c.plant && { ...c.plant }, animal: c.animal && { ...c.animal } })),
    hand: [...s.hand],
    goals: s.goals.map((g) => ({ ...g })),
    log: s.log.map((l) => ({ ...l, notes: [...l.notes] })),
    stats: { ...s.stats, streak: { ...s.stats.streak } },
  };
}

/** Hand weights: species the island lacks turn up more often, and cards with
 * nowhere to go right now much less (so a new hand is rarely dead). */
function deal(s: GameState, reroll = false) {
  const rng = new Rng(mixSeed(s.seed, 5000 + s.deals * 7919));
  s.deals++;
  const alive = census(s.cells).species;
  const wet = moisture(s.cells, s.weather);
  const prev = reroll ? s.hand : [];
  const pool = ALL_IDS.filter((id) => SPECIES[id].tier <= s.tier);
  const fits = new Map(pool.map((id) => [id, s.cells.some((_, i) => placeReason(s, id, i, wet) === null)]));
  const hand: SpeciesId[] = [];
  if (s.season === 0 && s.deals === 1) hand.push('lichen');
  while (hand.length < HAND) {
    const options = pool.filter((id) => !hand.includes(id));
    const weights = options.map(
      (id) =>
        ((alive.has(id) ? 1 : 2) + (SPECIES[id].tier === s.tier && s.tier > 1 ? 1 : 0)) *
        (fits.get(id) ? 1 : 0.15) *
        (prev.includes(id) ? 0.5 : 1),
    );
    let r = rng.next() * weights.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < options.length - 1 && r >= weights[k]) r -= weights[k++];
    hand.push(options[k]);
  }
  s.hand = hand;
}

/** What stops a species going on a cell: the kind of blocker, and a message. */
export type BlockKind = 'none' | 'occupied' | 'terrain' | 'poor' | 'rich' | 'dry' | 'fungi' | 'animal';
export interface Block {
  kind: BlockKind;
  text: string;
}

/** Why this species can't go on a cell, or null if it can. `wet`: moisture under this season's weather. */
export function placeReason(s: GameState, id: SpeciesId, cell: number, wet?: number[]): Block | null {
  const c = s.cells[cell];
  if (!c) return { kind: 'none', text: 'Nothing to place' };
  if (isPlant(id)) {
    if (!canRootOver(id, c.plant?.id)) return { kind: 'occupied', text: c.plant ? `${PLANTS[c.plant.id].name} is growing here` : 'Already growing something' };
    const w = (wet ?? moisture(s.cells, s.weather))[cell];
    if (!plantOk(s.cells, cell, id, w)) {
      const d = PLANTS[id];
      if (!d.on.includes(c.t)) return { kind: 'terrain', text: `${d.name} can't grow on ${c.t}` };
      if (c.fert < d.minFert) return { kind: 'poor', text: `Soil too poor (needs richness ${d.minFert})` };
      if (c.fert > d.maxFert) return { kind: 'rich', text: `${d.name} is crowded out of rich soil` };
      if (w < d.minWet) return { kind: 'dry', text: `Too dry (needs moisture ${d.minWet})` };
      if (id === 'fungi') return { kind: 'fungi', text: 'Fungi need an oak or shrub next to them' };
      return { kind: 'terrain', text: `${d.name} can't grow here` };
    }
    return null;
  }
  if (c.animal) return { kind: 'animal', text: 'Already home to an animal' };
  if (!animalFits(id, c)) return { kind: 'terrain', text: `${ANIMALS[id].name} can't live on ${c.t}` };
  return null;
}

/** Why a card can't go on a cell, or null if it can. */
export function placeError(s: GameState, card: number, cell: number, wet?: number[]): string | null {
  const id = s.hand[card];
  if (!id) return 'Nothing to place';
  return placeReason(s, id, cell, wet)?.text ?? null;
}

export function canPlaceAnywhere(s: GameState, card: number): boolean {
  const wet = moisture(s.cells, s.weather);
  return s.cells.some((_, i) => placeError(s, card, i, wet) === null);
}

/** Applies an action. Returns the season's events, or null if illegal. */
export function apply(s: GameState, a: Action): SimEvent[] | null {
  if (s.over) return null;
  if (a.type === 'reroll') {
    if (s.rerolls <= 0 || s.plays < PLAYS) return null;
    s.rerolls--;
    deal(s, true);
    return [];
  }
  if (a.type === 'place') {
    if (s.plays <= 0 || placeError(s, a.card, a.cell) !== null) return null;
    const id = s.hand[a.card];
    const c = s.cells[a.cell];
    if (isPlant(id)) c.plant = { id, n: PLANTS[id].start, age: 0 };
    else c.animal = { id, n: ANIMALS[id].start, age: 0 };
    s.hand.splice(a.card, 1);
    s.plays--;
    return [];
  }
  return endSeason(s);
}

function endSeason(s: GameState): SimEvent[] {
  const ev = simulate(s);
  const { species, life } = census(s.cells);
  if (species.has('wolf') && species.has('deer')) s.stats.wolfDeer++;
  s.stats.maxSpecies = Math.max(s.stats.maxSpecies, species.size);
  // Streaks: a species that dies out starts again from nothing.
  const streak: Partial<Record<SpeciesId, number>> = {};
  for (const id of species) streak[id] = (s.stats.streak[id] ?? 0) + 1;
  s.stats.streak = streak;
  const settled = Object.values(streak).filter((n) => n! >= SETTLE_AFTER).length;
  const points = seasonPoints(s.cells) + settled * SETTLED_BONUS;
  s.score += points;
  const notes: string[] = [];
  for (const g of s.goals) {
    if (g.done) continue;
    const def = GOALS.find((d) => d.id === g.id)!;
    g.progress = Math.max(g.progress, def.measure(s));
    if (g.progress >= g.target) {
      g.done = true;
      s.score += g.reward;
      ev.push({ type: 'goal', id: g.id });
      notes.push(`Goal reached: ${g.text} (+${g.reward})`);
    }
  }
  s.log.push({ season: s.season, species: species.size, life, points, settled, weather: s.weather, notes });
  s.season++;
  if (s.season >= SEASONS) {
    s.over = true;
    s.hand = [];
    return ev;
  }
  for (const u of UNLOCK) {
    if (s.tier < u.tier && (species.size >= u.species || s.season >= u.season)) {
      s.tier = u.tier;
      ev.push({ type: 'unlock', tier: u.tier });
    }
  }
  Object.assign(s, weatherFor(s.seed, s.season));
  if (s.season % 4 === 0) s.rerolls = Math.min(MAX_REROLLS, s.rerolls + 1);
  s.plays = PLAYS;
  deal(s);
  return ev;
}
