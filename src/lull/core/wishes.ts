// Wishes: light, optional goals. Each is a pure test of the garden at its
// current step; once met it stays met (the page remembers it). Two kinds:
// milestones (WISHES, once per player) and each garden's own rotating wishes.

import { Rng, mixSeed } from '../../shared/rng';
import { COLS, SPECIES, growth, type Garden } from './garden';
import { BEE, FLY, colOf, critterCount, degreesSung, laneOf, noteName } from './music';
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
// They ask for something deliberate (a note, a beat, a pattern), so they rarely
// come true by accident; `fillWishes` skips any that are already true when drawn.

const SOIL = [0, 1, 4, 5];
const lanesOf = (g: Garden, sp: number) => new Set(g.plants.filter((p) => p.sp === sp).map((p) => laneOf(p.y)));

/** Builds a garden wish from its id ("sing.0.3", "run.1", "pond3", …); null if unknown. */
export function gardenWish(id: string): Wish | null {
  const [kind, a0, b0] = id.split('.');
  const a = Number(a0), b = Number(b0);
  const S = SPECIES[a];
  switch (kind) {
    case 'sing':
      if (!S || !(b >= 0 && b < COLS)) return null;
      return { id, name: `${S.name} on ${noteName(b)}`, text: `Plant a ${S.name} that sings ${noteName(b)} (column ${b + 1} from the left).`, test: (g) => g.plants.some((p) => p.sp === a && colOf(p.x) === b) };
    case 'run':
      if (!S) return null;
      return {
        id, name: `${S.name} scale`, text: `Five ${S.plural} on five neighbouring notes, low to high.`,
        test: (g) => {
          const cols = new Set(g.plants.filter((p) => p.sp === a).map((p) => colOf(p.x)));
          for (let c = 0; c + 4 < COLS; c++) if ([0, 1, 2, 3, 4].every((d) => cols.has(c + d))) return true;
          return false;
        },
      };
    case 'beat':
      if (!S) return null;
      return { id, name: `${S.plural} on every beat`, text: `${S.plural} on beats 1, 2, 3 and 4 (the label as you plant shows the beat).`, test: (g) => [0, 2, 4, 6].every((l) => lanesOf(g, a).has(l)) };
    case 'twin':
      if (!(a >= 0 && a < COLS)) return null;
      return {
        id, name: `Echo on ${noteName(a)}`, text: `Two plants singing ${noteName(a)}: one on beat 1, one on beat 3.`,
        test: (g) => {
          const ls = new Set(g.plants.filter((p) => colOf(p.x) === a).map((p) => laneOf(p.y)));
          return ls.has(0) && ls.has(4);
        },
      };
    case 'chord1':
      return {
        id, name: 'Downbeat chord', text: 'Do, mi and so all singing together on beat 1.',
        test: (g) => {
          const d = new Set(g.plants.filter((p) => laneOf(p.y) === 0).map((p) => colOf(p.x) % 5));
          return d.has(0) && d.has(2) && d.has(3);
        },
      };
    case 'octave':
      return { id, name: 'Lowest to highest', text: 'Plants on all ten notes, from the far left to the far right.', test: (g) => new Set(g.plants.map((p) => colOf(p.x))).size === COLS };
    case 'lanes':
      return { id, name: 'Every half-beat', text: 'Something singing on all eight half-beats: 1, 1&, 2, 2&, 3, 3&, 4 and 4&.', test: (g) => new Set(g.plants.map((p) => laneOf(p.y))).size === 8 };
    case 'pond3':
      return { id, name: 'Lily pond', text: 'Three Moonlilies on the water.', test: (g) => g.plants.filter((p) => p.sp === 3).length >= 3 };
    case 'reeds3':
      return { id, name: 'Reed bed', text: 'Three Pipereeds around the pond.', test: (g) => g.plants.filter((p) => p.sp === 2).length >= 3 };
    case 'willows2':
      return { id, name: 'Little grove', text: 'Two fully grown Humwillows.', test: (g) => grownOf(g, 5, 1).length >= 2 };
    case 'bass':
      return { id, name: 'Bass line', text: 'Humwillows on the three lowest notes (the three columns on the left).', test: (g) => [0, 1, 2].every((c) => g.plants.some((p) => p.sp === 5 && colOf(p.x) === c)) };
    case 'high':
      return { id, name: 'High bells', text: 'Chimebells on the three highest notes (the three columns on the right).', test: (g) => [7, 8, 9].every((c) => g.plants.some((p) => p.sp === 0 && colOf(p.x) === c)) };
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
    case 'frog':
      return { id, name: 'Frog song', text: 'Two grown Moonlilies, so the frog has pads to hop between.', test: (g) => grownOf(g, 3).length >= 2 };
  }
  return null;
}

const KINDS = ['sing', 'sing', 'sing', 'run', 'beat', 'twin', 'chord1', 'octave', 'lanes', 'pond3', 'reeds3', 'willows2', 'bass', 'high', 'flies5', 'bees3', 'flourish3', 'rainlily', 'dawn', 'frog'];

/** The n-th wish in a garden's seeded order (the first is always an easy "plant X on note Y"). */
export function gardenWishAt(seed: number, n: number): string {
  const r = new Rng(mixSeed(seed ^ 0x3157, n));
  const kind = n === 0 ? 'sing' : r.pick(KINDS);
  if (kind === 'sing') return `sing.${r.pick(SOIL)}.${r.int(0, COLS - 1)}`;
  if (kind === 'run' || kind === 'beat') return `${kind}.${r.pick(SOIL)}`;
  if (kind === 'twin') return `twin.${r.int(0, COLS - 1)}`;
  return kind;
}

export interface WishState {
  /** Active wish ids (up to GARDEN_WISHES). */
  a: string[];
  /** Next index in the garden's order. */
  n: number;
  /** Ids granted in this garden (newest last, the last 60). */
  done: string[];
}
export const GARDEN_WISHES = 3;

export const newWishState = (): WishState => ({ a: [], n: 0, done: [] });

/** Tops up the active wishes, skipping repeats and any already true right now. Mutates and returns ws. */
export function fillWishes(g: Garden, ws: WishState): WishState {
  for (let guard = 0; ws.a.length < GARDEN_WISHES && guard < 200; guard++) {
    const id = gardenWishAt(g.seed, ws.n++);
    const w = gardenWish(id);
    if (!w || ws.a.includes(id) || ws.done.slice(-12).includes(id) || w.test(g)) continue;
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
  if (ws.done.length > 60) ws.done.splice(0, ws.done.length - 60);
  fillWishes(g, ws);
  return met;
}
