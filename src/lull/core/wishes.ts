// Wishes: light, optional goals. Each is a pure test of the garden at its
// current step; once met it stays met (the page remembers it). Two kinds:
// milestones (WISHES, once per player) and each garden's own rotating wishes.

import { Rng, mixSeed } from '../../shared/rng';
import { COLS, DAY, SPECIES, growth, type Garden } from './garden';
import { BEE, FLY, awake, colOf, critterCount, crittersAt, degreesSung, laneOf, noteName } from './music';
import { dayTime, weatherAt } from './sky';

export interface Wish {
  id: string;
  name: string;
  text: string;
  test: (g: Garden) => boolean;
}

const grownOf = (g: Garden, sp: number, min = 0.5) => g.plants.filter((p) => p.sp === sp && growth(p, g.now) >= min);

export const WISHES: Wish[] = [
  {
    id: 'bloom',
    name: 'First bloom',
    text: 'Grow any plant to its full size.',
    test: (g) => g.plants.some((p) => growth(p, g.now) >= 1),
  },
  {
    id: 'pond',
    name: 'Pond song',
    text: 'A Moonlily on the water and a Pipereed beside it, both half grown.',
    test: (g) => grownOf(g, 3).length > 0 && grownOf(g, 2).length > 0,
  },
  {
    id: 'scale',
    name: 'The whole scale',
    text: 'Plants singing all five notes: do, re, mi, so and la (half grown or more).',
    test: (g) => degreesSung(g, g.now).size === 5,
  },
  {
    id: 'chord',
    name: 'Dusk chord',
    text: 'While the sun sets, plants singing do, mi and so together.',
    test: (g) => {
      if (dayTime(g.now).phase !== 'dusk') return false;
      const d = degreesSung(g, g.now);
      return d.has(0) && d.has(2) && d.has(3);
    },
  },
  {
    id: 'lights',
    name: 'Night lights',
    text: 'Three Glowcaps lit up at night, and the fireflies out.',
    test: (g) => dayTime(g.now).phase === 'night' && grownOf(g, 4).length >= 3 && critterCount(g, FLY, g.now) >= 3,
  },
  {
    id: 'kinds',
    name: 'One of each',
    text: `All ${SPECIES.length} kinds of plant growing at once.`,
    test: (g) => new Set(g.plants.map((p) => p.sp)).size === SPECIES.length,
  },
  {
    id: 'bees',
    name: 'Busy bees',
    text: 'Four bees out at once (they come for Chimebells, Moonlilies and Humwillows).',
    test: (g) => critterCount(g, BEE, g.now) >= 4,
  },
  {
    id: 'span',
    name: 'Low and high',
    text: 'A grown Humwillow at the far left and a grown Chimebell at the far right.',
    test: (g) => grownOf(g, 5, 1).some((p) => colOf(p.x) === 0) && grownOf(g, 0, 1).some((p) => colOf(p.x) === COLS - 1),
  },
  {
    id: 'full',
    name: 'Full garden',
    text: 'Twenty-four plants growing together.',
    test: (g) => g.plants.length >= 24,
  },
];

/** Ids of the wishes the garden meets right now. */
export const wishesMet = (g: Garden): string[] => WISHES.filter((w) => w.test(g)).map((w) => w.id);


// ------------------------------------------------------------------ garden wishes
//
// Each garden also has its own rotating wishes: three at a time, drawn in a
// seeded order (`gardenWishAt(seed, n)`), each replaced by the next once met.
// Most ask for a composition (a chord on a beat, a rising tune, a groove) or a
// moment (a bee on a bell, a firefly on a glowcap). Only plants at least half
// grown count, and `fillWishes` never draws one that is true now or would come
// true just by the garden growing up, so they aren't granted by accident.

const SOIL = [0, 1, 4, 5];
const BEE_SP = [0, 3, 5];
const BEATS = [0, 2, 4, 6];
const OFFBEATS = [1, 3, 5, 7];
const BEAT_NAMES = ['1', '1&', '2', '2&', '3', '3&', '4', '4&'];
/** Plants half grown or more: what wishes count. */
const half = (g: Garden) => g.plants.filter((p) => growth(p, g.now) >= 0.5);
const ofSp = (g: Garden, sp: number) => half(g).filter((p) => p.sp === sp);
const lanesOf = (g: Garden, sp: number) => new Set(ofSp(g, sp).map((p) => laneOf(p.y)));
const degreesOn = (g: Garden, lane: number) => new Set(half(g).filter((p) => laneOf(p.y) === lane).map((p) => colOf(p.x) % 5));
const has = (set: Set<number>, xs: number[]) => xs.every((x) => set.has(x));
/** A creature of this kind sitting on a plant of this species right now. */
const sitting = (g: Garden, kind: 'bee' | 'fly' | 'frog', sp: number) => crittersAt(g, g.now).some((c) => c.kind === kind && c.f >= 1 && g.plants[c.to]?.sp === sp);
/** Four plants on beats 1-4 whose notes rise (dir 1) or fall (-1). */
function tune(g: Garden, dir: number): boolean {
  const cols = BEATS.map((l) => new Set(half(g).filter((p) => laneOf(p.y) === l).map((p) => colOf(p.x))));
  // Longest chain through the four beats: pick one column per beat, strictly rising/falling.
  let reach = new Set(cols[0]);
  for (let b = 1; b < 4; b++) {
    const next = new Set<number>();
    for (const c of cols[b]) for (const r of reach) if ((c - r) * dir > 0) next.add(c);
    reach = next;
  }
  return reach.size > 0;
}

const CHORDS: Record<string, { degs: number[]; word: string; notes: string }> = {
  chord: { degs: [0, 2, 3], word: 'Bright chord', notes: 'do, mi and so' },
  minor: { degs: [4, 0, 2], word: 'Soft chord', notes: 'la, do and mi' },
};

/** Builds a garden wish from its id ("chord.2", "rise", "beevisit.0", …); null if unknown. */
export function gardenWish(id: string): Wish | null {
  const [kind, a0, b0] = id.split('.');
  const a = Number(a0), b = Number(b0);
  const S = SPECIES[a];
  switch (kind) {
    case 'sing':
      if (!S || !(b >= 0 && b < COLS)) return null;
      return { id, name: `${S.name} on ${noteName(b)}`, text: `A ${S.name} singing ${noteName(b)} (column ${b + 1} from the left), half grown.`, test: (g) => ofSp(g, a).some((p) => colOf(p.x) === b) };
    case 'twin':
      if (!(a >= 0 && a < COLS)) return null;
      return {
        id, name: `Echo on ${noteName(a)}`, text: `Two plants singing ${noteName(a)}: one on beat 1, one on beat 3 (half grown).`,
        test: (g) => {
          const ls = new Set(half(g).filter((p) => colOf(p.x) === a).map((p) => laneOf(p.y)));
          return ls.has(0) && ls.has(4);
        },
      };
    case 'chord':
    case 'minor': {
      if (!BEATS.includes(a)) return null;
      const c = CHORDS[kind];
      return { id, name: `${c.word} on beat ${BEAT_NAMES[a]}`, text: `${c.notes[0].toUpperCase()}${c.notes.slice(1)} all singing together on beat ${BEAT_NAMES[a]}.`, test: (g) => has(degreesOn(g, a), c.degs) };
    }
    case 'duskchord':
      return { id, name: 'Sunset chord', text: 'As the sun sets, do, mi and so singing together on one beat.', test: (g) => dayTime(g.now).phase === 'dusk' && BEATS.some((l) => has(degreesOn(g, l), [0, 2, 3])) };
    case 'rise':
      return { id, name: 'A rising tune', text: 'Four plants on beats 1, 2, 3 and 4, each one a higher note than the last.', test: (g) => tune(g, 1) };
    case 'fall':
      return { id, name: 'A falling tune', text: 'Four plants on beats 1, 2, 3 and 4, each one a lower note than the last.', test: (g) => tune(g, -1) };
    case 'groove':
      return {
        id, name: 'Little groove', text: 'A Humwillow on beat 1 and Glowcaps knocking on beats 2 and 4.',
        test: (g) => lanesOf(g, 5).has(0) && lanesOf(g, 4).has(2) && lanesOf(g, 4).has(6),
      };
    case 'run':
      if (!S) return null;
      return {
        id, name: `${S.name} scale`, text: `Five ${S.plural} on five neighbouring notes, low to high (half grown).`,
        test: (g) => {
          const cols = new Set(ofSp(g, a).map((p) => colOf(p.x)));
          for (let c = 0; c + 4 < COLS; c++) if ([0, 1, 2, 3, 4].every((d) => cols.has(c + d))) return true;
          return false;
        },
      };
    case 'beat':
      if (!S) return null;
      return { id, name: `${S.plural} on every beat`, text: `${S.plural} on beats 1, 2, 3 and 4 (the label as you plant shows the beat).`, test: (g) => has(lanesOf(g, a), BEATS) };
    case 'offbeat':
      if (!S) return null;
      return { id, name: `${S.plural} off the beat`, text: `${S.plural} on the four “and”s: 1&, 2&, 3& and 4&.`, test: (g) => has(lanesOf(g, a), OFFBEATS) };
    case 'octave':
      return { id, name: 'Lowest to highest', text: 'Plants on all ten notes, from the far left to the far right.', test: (g) => new Set(half(g).map((p) => colOf(p.x))).size === COLS };
    case 'lanes':
      return { id, name: 'Every half-beat', text: 'Something singing on all eight half-beats: 1, 1&, 2, 2&, 3, 3&, 4 and 4&.', test: (g) => new Set(half(g).map((p) => laneOf(p.y))).size === 8 };
    case 'pond3':
      return { id, name: 'Lily pond', text: 'Three Moonlilies on the water, half grown.', test: (g) => ofSp(g, 3).length >= 3 };
    case 'reeds3':
      return { id, name: 'Reed bed', text: 'Three Pipereeds around the pond, half grown.', test: (g) => ofSp(g, 2).length >= 3 };
    case 'willows2':
      return { id, name: 'Little grove', text: 'Two fully grown Humwillows.', test: (g) => grownOf(g, 5, 1).length >= 2 };
    case 'bass':
      return { id, name: 'Bass line', text: 'Humwillows on the three lowest notes (the three columns on the left).', test: (g) => [0, 1, 2].every((c) => ofSp(g, 5).some((p) => colOf(p.x) === c)) };
    case 'high':
      return { id, name: 'High bells', text: 'Chimebells on the three highest notes (the three columns on the right).', test: (g) => [7, 8, 9].every((c) => ofSp(g, 0).some((p) => colOf(p.x) === c)) };
    case 'beevisit':
      if (!S || !BEE_SP.includes(a)) return null;
      return { id, name: `A bee on a ${S.name}`, text: `Watch a bee land on a grown ${S.name} (bees come out by day).`, test: (g) => sitting(g, 'bee', a) };
    case 'flyvisit':
      return { id, name: 'Firefly on a Glowcap', text: 'At night, a firefly resting on a Glowcap.', test: (g) => sitting(g, 'fly', 4) };
    case 'frogvisit':
      return { id, name: 'Frog on a lily pad', text: 'The frog sitting on a Moonlily (it comes once a lily is half grown).', test: (g) => sitting(g, 'frog', 3) };
    case 'flies5':
      return { id, name: 'Firefly party', text: 'Five fireflies out at once (they come at night, most of all for Glowcaps).', test: (g) => critterCount(g, FLY, g.now) >= 5 };
    case 'bees3':
      return { id, name: 'Bee path', text: 'Three bees out at once (by day, for grown Chimebells, Moonlilies and Humwillows).', test: (g) => critterCount(g, BEE, g.now) >= 3 };
    case 'flourish3':
      return { id, name: 'In full voice', text: 'Three plants flourishing at once: water grown plants.', test: (g) => g.plants.filter((p) => p.flourish > g.now).length >= 3 };
    case 'rainlily':
      return {
        id, name: 'Rain song', text: 'A grown Moonlily singing while it rains.',
        test: (g) => {
          const w = weatherAt(g.seed, g.now);
          return w.kind === 'rain' && w.amt > 0.3 && grownOf(g, 3).length > 0;
        },
      };
    case 'dawn':
      return { id, name: 'Dawn chorus', text: 'Grown plants singing all five notes as the sun comes up.', test: (g) => dayTime(g.now).phase === 'dawn' && degreesSung(g, g.now).size === 5 };
    case 'nightscale':
      return {
        id, name: 'Night song', text: 'At night, all five notes from plants that are awake (Chimebells sleep).',
        test: (g) => {
          const { phase, light } = dayTime(g.now);
          return phase === 'night' && new Set(half(g).filter((p) => awake(p.sp, light) > 0).map((p) => colOf(p.x) % 5)).size === 5;
        },
      };
  }
  return null;
}

/** Wish kinds and their weights: compositions and moments come up most. */
const KINDS: [string, number][] = [
  ['chord', 4], ['minor', 3], ['rise', 3], ['fall', 2], ['groove', 2], ['offbeat', 2], ['beat', 2], ['twin', 2], ['duskchord', 2],
  ['beevisit', 3], ['flyvisit', 2], ['frogvisit', 2], ['nightscale', 1], ['dawn', 1],
  ['sing', 1], ['run', 1], ['octave', 1], ['lanes', 1], ['pond3', 1], ['reeds3', 1], ['willows2', 1], ['bass', 1], ['high', 1],
  ['flies5', 1], ['bees3', 1], ['flourish3', 1], ['rainlily', 1],
];
const KIND_TOTAL = KINDS.reduce((s, [, w]) => s + w, 0);

/** The n-th wish in a garden's seeded order (the first is an echo: one note on beats 1 and 3). */
export function gardenWishAt(seed: number, n: number): string {
  const r = new Rng(mixSeed(seed ^ 0x3157, n));
  let kind = 'twin';
  if (n > 0) {
    let x = r.next() * KIND_TOTAL;
    for (const [k, w] of KINDS) if ((x -= w) < 0) {
      kind = k;
      break;
    }
  }
  switch (kind) {
    case 'sing':
      return `sing.${r.pick(SOIL)}.${r.int(0, COLS - 1)}`;
    case 'run':
    case 'beat':
    case 'offbeat':
      return `${kind}.${r.pick(SOIL)}`;
    case 'twin':
      return `twin.${r.int(0, COLS - 1)}`;
    case 'chord':
    case 'minor':
      return `${kind}.${r.pick(BEATS)}`;
    case 'beevisit':
      return `beevisit.${r.pick(BEE_SP)}`;
  }
  return kind;
}

export interface WishState {
  /** Active wish ids (up to GARDEN_WISHES). */
  a: string[];
  /** Next index in the garden's order. */
  n: number;
  /** Ids granted in this garden (newest last). */
  done: string[];
}
export const GARDEN_WISHES = 3;

export const newWishState = (): WishState => ({ a: [], n: 0, done: [] });

/** The same garden with every plant already full grown (to see what growing alone would grant). */
function grownUp(g: Garden): Garden {
  return { ...g, plants: g.plants.map((p) => ({ ...p, born: Math.min(p.born, g.now - SPECIES[p.sp].grow) })) };
}

/** The garden now, plus grown up at six times over the next day: a wish true in any of them is too easy. */
function futures(g: Garden): Garden[] {
  const up = grownUp(g);
  return [g, up, ...[1, 2, 3, 4, 5, 6].map((k) => ({ ...up, now: g.now + Math.round((k * DAY) / 6) }))];
}

/** True now, or would come true just by waiting (plants growing, day turning to night): never drawn. */
export function tooEasy(g: Garden, w: Wish): boolean {
  return futures(g).some((f) => w.test(f));
}

/** Tops up the active wishes, skipping repeats and any that are too easy. Mutates and returns ws. */
export function fillWishes(g: Garden, ws: WishState): WishState {
  const fs = futures(g);
  for (let guard = 0; ws.a.length < GARDEN_WISHES && guard < 200; guard++) {
    const id = gardenWishAt(g.seed, ws.n++);
    const w = gardenWish(id);
    if (!w || ws.a.includes(id) || ws.done.slice(-12).includes(id) || fs.some((f) => w.test(f))) continue;
    ws.a.push(id);
  }
  return ws;
}

/** Grants the active wishes the garden meets now, refills, and returns the granted ids. */
export function grantWishes(g: Garden, ws: WishState): string[] {
  const met = ws.a.filter((id) => gardenWish(id)?.test(g));
  if (!met.length) return [];
  ws.a = ws.a.filter((id) => !met.includes(id));
  ws.done.push(...met);
  fillWishes(g, ws);
  return met;
}
