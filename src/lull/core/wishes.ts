// Wishes: light, optional goals. Each is a pure test of the garden at its
// current step; once met it stays met (the page remembers it). Three kinds:
// milestones (WISHES, once per player, each needing a deliberate act), each
// garden's own rotating wishes, and a daily wish shared by everyone that day.
// Every wish can say what is still missing (`progress`).

import { Rng, mixSeed } from '../../shared/rng';
import { COLS, DAY, SPECIES, growth, type Garden } from './garden';
import { BEE, FLY, awake, colOf, critterCount, crittersAt, degreesSung, laneOf, noteName } from './music';
import { dayTime, weatherAt } from './sky';

export interface Wish {
  id: string;
  name: string;
  text: string;
  test: (g: Garden) => boolean;
  /** What's there and what's missing, e.g. "2 of 3 notes on beat 3 (1 more growing)". */
  progress?: (g: Garden) => string;
  /** Granted by the page on a player action instead of a garden test. */
  event?: 'strum' | 'share';
}

const BEATS = [0, 2, 4, 6];
const OFFBEATS = [1, 3, 5, 7];
const LANES8 = [0, 1, 2, 3, 4, 5, 6, 7];
export const BEAT_NAMES = ['1', '1&', '2', '2&', '3', '3&', '4', '4&'];
const SOIL = [0, 1, 4, 5];
const BEE_SP = [0, 3, 5];

/** Plants half grown or more: what wishes count. */
const half = (g: Garden) => g.plants.filter((p) => growth(p, g.now) >= 0.5);
const grownOf = (g: Garden, sp: number, min = 0.5) => g.plants.filter((p) => p.sp === sp && growth(p, g.now) >= min);
const ofSp = (g: Garden, sp: number) => grownOf(g, sp);
const lanesOf = (g: Garden, sp: number, ps = ofSp(g, sp)) => new Set(ps.filter((p) => p.sp === sp).map((p) => laneOf(p.y)));
const degreesOn = (g: Garden, lane: number, ps = half(g)) => new Set(ps.filter((p) => laneOf(p.y) === lane).map((p) => colOf(p.x) % 5));
const has = (set: Set<number>, xs: number[]) => xs.every((x) => set.has(x));
const count = (set: Set<number>, xs: number[]) => xs.filter((x) => set.has(x)).length;
/** " (2 more growing)" when plants that would count are still young. */
const growing = (n: number) => (n > 0 ? ` (${n} more growing)` : '');
/** A creature of this kind sitting on a plant of this species right now. */
const sitting = (g: Garden, kind: 'bee' | 'fly' | 'frog', sp: number) => crittersAt(g, g.now).some((c) => c.kind === kind && c.f >= 1 && g.plants[c.to]?.sp === sp);

/** Of a chord's degrees, how many are on a lane now / once the young ones grow. */
function chordCount(g: Garden, lane: number, degs: number[]): [number, number] {
  return [count(degreesOn(g, lane), degs), count(degreesOn(g, lane, g.plants), degs)];
}
/** The best lane for a chord: [lane, now, with growing]. */
function bestChord(g: Garden, degs: number[], lanes: number[]): [number, number, number] {
  let best: [number, number, number] = [lanes[0], 0, 0];
  for (const l of lanes) {
    const [a, b] = chordCount(g, l, degs);
    if (a > best[1] || (a === best[1] && b > best[2])) best = [l, a, b];
  }
  return best;
}

/** Longest chain over beats 1-4 with notes strictly rising (dir 1) or falling (-1). */
function tuneLen(ps: ReturnType<typeof half>, dir: number): number {
  const cols = BEATS.map((l) => [...new Set(ps.filter((p) => laneOf(p.y) === l).map((p) => colOf(p.x)))]);
  // best[b][c]: longest chain ending on beat b at column c, using beats 0..b in order (skipping none).
  let best = new Map<number, number>(cols[0].map((c) => [c, 1]));
  let longest = cols[0].length ? 1 : 0;
  for (let b = 1; b < 4; b++) {
    const next = new Map<number, number>();
    for (const c of cols[b]) {
      let len = 1;
      for (const [r, n] of best) if ((c - r) * dir > 0) len = Math.max(len, n + 1);
      next.set(c, len);
      longest = Math.max(longest, len);
    }
    if (!next.size) break;
    best = next;
  }
  return longest;
}
const tuneFull = (ps: ReturnType<typeof half>, dir: number) => {
  // A full tune needs one plant on each of beats 1, 2, 3 and 4 in order.
  const cols = BEATS.map((l) => new Set(ps.filter((p) => laneOf(p.y) === l).map((p) => colOf(p.x))));
  let reach = new Set(cols[0]);
  for (let b = 1; b < 4; b++) {
    const next = new Set<number>();
    for (const c of cols[b]) for (const r of reach) if ((c - r) * dir > 0) next.add(c);
    reach = next;
  }
  return reach.size > 0;
};

// ------------------------------------------------------------------ milestones

export const WISHES: Wish[] = [
  {
    id: 'kinds',
    name: 'One of each',
    text: `Plant all ${SPECIES.length} kinds: Chimebell, Harpfern, Pipereed, Moonlily, Glowcap and Humwillow.`,
    test: (g) => new Set(g.plants.map((p) => p.sp)).size === SPECIES.length,
    progress: (g) => `${new Set(g.plants.map((p) => p.sp)).size} of ${SPECIES.length} kinds`,
  },
  {
    id: 'pond',
    name: 'Pond song',
    text: 'A Moonlily on the water and a Pipereed on its shore, both half grown.',
    test: (g) => grownOf(g, 3).length > 0 && grownOf(g, 2).length > 0,
    progress: (g) => `Moonlily ${grownOf(g, 3).length ? '✓' : g.plants.some((p) => p.sp === 3) ? 'growing' : '–'}, Pipereed ${grownOf(g, 2).length ? '✓' : g.plants.some((p) => p.sp === 2) ? 'growing' : '–'}`,
  },
  {
    id: 'scale',
    name: 'The whole scale',
    text: 'All five notes, do re mi so la, on one beat or half-beat.',
    test: (g) => LANES8.some((l) => degreesOn(g, l).size === 5),
    progress: (g) => {
      const [l, a, b] = bestChord(g, [0, 1, 2, 3, 4], LANES8);
      return `${a} of 5 notes on beat ${BEAT_NAMES[l]}${growing(b - a)}`;
    },
  },
  {
    id: 'chord',
    name: 'Dusk chord',
    text: 'Do, mi and so on the same beat (or half-beat), singing while the sun sets.',
    test: (g) => dayTime(g.now).phase === 'dusk' && LANES8.some((l) => has(degreesOn(g, l), [0, 2, 3])),
    progress: (g) => {
      const [l, a, b] = bestChord(g, [0, 2, 3], LANES8);
      return `${a} of 3 notes on beat ${BEAT_NAMES[l]}${growing(b - a)}${a === 3 && dayTime(g.now).phase !== 'dusk' ? ' · now wait for dusk' : ''}`;
    },
  },
  {
    id: 'lights',
    name: 'Night lights',
    text: 'Three Glowcaps on the same beat, glowing in the night.',
    test: (g) => dayTime(g.now).phase === 'night' && LANES8.some((l) => grownOf(g, 4).filter((p) => laneOf(p.y) === l).length >= 3),
    progress: (g) => {
      const best = Math.max(0, ...LANES8.map((l) => grownOf(g, 4).filter((p) => laneOf(p.y) === l).length));
      return `${Math.min(3, best)} of 3 Glowcaps on one beat${best >= 3 && dayTime(g.now).phase !== 'night' ? ' · now wait for night' : ''}`;
    },
  },
  {
    id: 'flourish',
    name: 'In full voice',
    text: 'Water grown plants until three are flourishing at once.',
    test: (g) => g.plants.filter((p) => p.flourish > g.now).length >= 3,
    progress: (g) => `${Math.min(3, g.plants.filter((p) => p.flourish > g.now).length)} of 3 flourishing`,
  },
  {
    id: 'strum',
    name: 'Harp sweep',
    text: 'Strum across eight plants in one stroke.',
    test: () => false,
    event: 'strum',
  },
  {
    id: 'span',
    name: 'Low and high',
    text: 'A grown Humwillow on the lowest note (far left) and a grown Chimebell on the highest (far right).',
    test: (g) => grownOf(g, 5, 1).some((p) => colOf(p.x) === 0) && grownOf(g, 0, 1).some((p) => colOf(p.x) === COLS - 1),
    progress: (g) => `Humwillow far left ${grownOf(g, 5, 1).some((p) => colOf(p.x) === 0) ? '✓' : '–'}, Chimebell far right ${grownOf(g, 0, 1).some((p) => colOf(p.x) === COLS - 1) ? '✓' : '–'}`,
  },
  {
    id: 'full',
    name: 'Full garden',
    text: 'Twenty-four plants growing together.',
    test: (g) => g.plants.length >= 24,
    progress: (g) => `${g.plants.length} of 24 plants`,
  },
  {
    id: 'share',
    name: 'Gift',
    text: 'Share your garden as a link (menu → Share garden link).',
    test: () => false,
    event: 'share',
  },
];

/** Ids of the (garden-tested) milestones the garden meets right now. */
export const wishesMet = (g: Garden): string[] => WISHES.filter((w) => !w.event && w.test(g)).map((w) => w.id);

// ------------------------------------------------------------------ garden wishes
//
// Each garden also has its own rotating wishes: three at a time, drawn in a
// seeded order (`gardenWishAt(seed, n)`), each replaced by the next once met.
// Most ask for a composition (a chord on a beat, a rising tune, a groove) or a
// moment (a bee on a bell, a firefly on a glowcap). Only plants at least half
// grown count, and `fillWishes` never draws one that is true now or would come
// true just by the garden growing up, so they aren't granted by accident.

const CHORDS: Record<string, { degs: number[]; word: string; notes: string }> = {
  chord: { degs: [0, 2, 3], word: 'Bright chord', notes: 'do, mi and so' },
  minor: { degs: [4, 0, 2], word: 'Soft chord', notes: 'la, do and mi' },
};

/** Builds a garden (or daily) wish from its id ("chord.2", "rise", "beevisit.0", …); null if unknown. */
export function gardenWish(id: string): Wish | null {
  const [kind, a0, b0] = id.split('.');
  const a = Number(a0), b = Number(b0);
  const S = SPECIES[a];
  switch (kind) {
    case 'sing':
      if (!S || !(b >= 0 && b < COLS)) return null;
      return {
        id, name: `${S.name} on ${noteName(b)}`, text: `A ${S.name} singing ${noteName(b)} (column ${b + 1} from the left), half grown.`,
        test: (g) => ofSp(g, a).some((p) => colOf(p.x) === b),
        progress: (g) => (g.plants.some((p) => p.sp === a && colOf(p.x) === b) ? 'planted, growing' : 'not planted yet'),
      };
    case 'twin':
      if (!(a >= 0 && a < COLS)) return null;
      return {
        id, name: `Echo on ${noteName(a)}`, text: `Two plants singing ${noteName(a)}: one on beat 1, one on beat 3 (half grown).`,
        test: (g) => {
          const ls = new Set(half(g).filter((p) => colOf(p.x) === a).map((p) => laneOf(p.y)));
          return ls.has(0) && ls.has(4);
        },
        progress: (g) => {
          const ls = new Set(half(g).filter((p) => colOf(p.x) === a).map((p) => laneOf(p.y)));
          const all = new Set(g.plants.filter((p) => colOf(p.x) === a).map((p) => laneOf(p.y)));
          const mark = (l: number) => (ls.has(l) ? '✓' : all.has(l) ? 'growing' : '–');
          return `beat 1 ${mark(0)}, beat 3 ${mark(4)}`;
        },
      };
    case 'chord':
    case 'minor': {
      if (!BEATS.includes(a)) return null;
      const c = CHORDS[kind];
      return {
        id, name: `${c.word} on beat ${BEAT_NAMES[a]}`, text: `${c.notes[0].toUpperCase()}${c.notes.slice(1)} all singing together on beat ${BEAT_NAMES[a]}.`,
        test: (g) => has(degreesOn(g, a), c.degs),
        progress: (g) => {
          const [n, m] = chordCount(g, a, c.degs);
          const miss = c.degs.filter((d) => !degreesOn(g, a, g.plants).has(d)).map((d) => ['do', 're', 'mi', 'so', 'la'][d]);
          return `${n} of 3 notes on beat ${BEAT_NAMES[a]}${growing(m - n)}${miss.length ? ` · missing ${miss.join(', ')}` : ''}`;
        },
      };
    }
    case 'duskchord':
      // Old saves only (it duplicated the Dusk chord milestone); counts half-beats too.
      return { id, name: 'Sunset chord', text: 'As the sun sets, do, mi and so on the same beat or half-beat.', test: (g) => dayTime(g.now).phase === 'dusk' && LANES8.some((l) => has(degreesOn(g, l), [0, 2, 3])) };
    case 'rise':
    case 'fall': {
      const dir = kind === 'rise' ? 1 : -1;
      return {
        id, name: dir > 0 ? 'A rising tune' : 'A falling tune',
        text: `Four plants on beats 1, 2, 3 and 4, each one a ${dir > 0 ? 'higher' : 'lower'} note than the last.`,
        test: (g) => tuneFull(half(g), dir),
        progress: (g) => {
          const n = tuneLen(half(g), dir), m = tuneLen(g.plants, dir);
          return `${n} of 4 notes in a row${growing(m - n)}`;
        },
      };
    }
    case 'groove':
      return {
        id, name: 'Little groove', text: 'A Humwillow on beat 1 and Glowcaps knocking on beats 2 and 4.',
        test: (g) => lanesOf(g, 5).has(0) && lanesOf(g, 4).has(2) && lanesOf(g, 4).has(6),
        progress: (g) => {
          const w = lanesOf(g, 5), c = lanesOf(g, 4);
          return `Humwillow on 1 ${w.has(0) ? '✓' : '–'}, Glowcaps on 2 ${c.has(2) ? '✓' : '–'} and 4 ${c.has(6) ? '✓' : '–'}`;
        },
      };
    case 'run':
      if (!S) return null;
      return {
        id, name: `${S.name} scale`, text: `Five ${S.plural} on five neighbouring notes, low to high (half grown).`,
        test: (g) => runLen(g, a) >= 5,
        progress: (g) => `${runLen(g, a)} of 5 neighbouring notes`,
      };
    case 'beat':
    case 'offbeat': {
      if (!S) return null;
      const ls = kind === 'beat' ? BEATS : OFFBEATS;
      return {
        id, name: `${S.plural} ${kind === 'beat' ? 'on every beat' : 'off the beat'}`,
        text: kind === 'beat' ? `${S.plural} on beats 1, 2, 3 and 4 (the label as you plant shows the beat).` : `${S.plural} on the four “and”s: 1&, 2&, 3& and 4&.`,
        test: (g) => has(lanesOf(g, a), ls),
        progress: (g) => {
          const n = count(lanesOf(g, a), ls), m = count(lanesOf(g, a, g.plants), ls);
          return `${n} of 4${growing(m - n)}`;
        },
      };
    }
    case 'octave':
      return {
        id, name: 'Lowest to highest', text: 'Plants on all ten notes, from the far left to the far right.',
        test: (g) => new Set(half(g).map((p) => colOf(p.x))).size === COLS,
        progress: (g) => `${new Set(half(g).map((p) => colOf(p.x))).size} of ${COLS} notes`,
      };
    case 'lanes':
      return {
        id, name: 'Every half-beat', text: 'Something singing on all eight half-beats: 1, 1&, 2, 2&, 3, 3&, 4 and 4&.',
        test: (g) => new Set(half(g).map((p) => laneOf(p.y))).size === 8,
        progress: (g) => `${new Set(half(g).map((p) => laneOf(p.y))).size} of 8 half-beats`,
      };
    case 'pond3':
      return { id, name: 'Lily pond', text: 'Three Moonlilies on the water, half grown.', test: (g) => ofSp(g, 3).length >= 3, progress: (g) => `${Math.min(3, ofSp(g, 3).length)} of 3` };
    case 'reeds3':
      return { id, name: 'Reed bed', text: 'Three Pipereeds around the pond, half grown.', test: (g) => ofSp(g, 2).length >= 3, progress: (g) => `${Math.min(3, ofSp(g, 2).length)} of 3` };
    case 'willows2':
      return { id, name: 'Little grove', text: 'Two fully grown Humwillows.', test: (g) => grownOf(g, 5, 1).length >= 2, progress: (g) => `${Math.min(2, grownOf(g, 5, 1).length)} of 2 fully grown` };
    case 'bass':
    case 'high': {
      const sp = kind === 'bass' ? 5 : 0;
      const cols = kind === 'bass' ? [0, 1, 2] : [7, 8, 9];
      const on = (g: Garden) => cols.filter((c) => ofSp(g, sp).some((p) => colOf(p.x) === c)).length;
      return {
        id, name: kind === 'bass' ? 'Bass line' : 'High bells',
        text: kind === 'bass' ? 'Humwillows on the three lowest notes (the three columns on the left).' : 'Chimebells on the three highest notes (the three columns on the right).',
        test: (g) => on(g) === 3,
        progress: (g) => `${on(g)} of 3`,
      };
    }
    case 'beevisit':
      if (!S || !BEE_SP.includes(a)) return null;
      return {
        id, name: `A bee on a ${S.name}`, text: `Watch a bee land on a grown ${S.name} (bees come out by day).`, test: (g) => sitting(g, 'bee', a),
        progress: (g) => (grownOf(g, a, 0.6).length ? (dayTime(g.now).light < 0.6 ? `a ${S.name} is ready · bees come by day` : `a ${S.name} is ready · watch for a bee`) : `needs a grown ${S.name}`),
      };
    case 'flyvisit':
      return {
        id, name: 'Firefly on a Glowcap', text: 'At night, a firefly resting on a Glowcap.', test: (g) => sitting(g, 'fly', 4),
        progress: (g) => (grownOf(g, 4).length ? (dayTime(g.now).phase === 'night' ? 'watch for a firefly' : 'a Glowcap is ready · fireflies come at night') : 'needs a half-grown Glowcap'),
      };
    case 'frogvisit':
      return {
        id, name: 'Frog on a lily pad', text: 'The frog sitting on a Moonlily (it comes once a lily is half grown).', test: (g) => sitting(g, 'frog', 3),
        progress: (g) => (grownOf(g, 3).length ? 'watch for the frog' : 'needs a half-grown Moonlily'),
      };
    case 'flies5':
      return { id, name: 'Firefly party', text: 'Five fireflies out at once (they come at night, most of all for Glowcaps).', test: (g) => critterCount(g, FLY, g.now) >= 5, progress: (g) => `${critterCount(g, FLY, g.now)} of 5 out now` };
    case 'bees3':
      return { id, name: 'Bee path', text: 'Three bees out at once (by day, for grown Chimebells, Moonlilies and Humwillows).', test: (g) => critterCount(g, BEE, g.now) >= 3, progress: (g) => `${critterCount(g, BEE, g.now)} of 3 out now` };
    case 'flourish3':
      return { id, name: 'In full voice', text: 'Three plants flourishing at once: water grown plants.', test: (g) => g.plants.filter((p) => p.flourish > g.now).length >= 3, progress: (g) => `${Math.min(3, g.plants.filter((p) => p.flourish > g.now).length)} of 3` };
    case 'rainlily':
      return {
        id, name: 'Rain song', text: 'A grown Moonlily singing while it rains.',
        test: (g) => {
          const w = weatherAt(g.seed, g.now);
          return w.kind === 'rain' && w.amt > 0.3 && grownOf(g, 3).length > 0;
        },
        progress: (g) => (grownOf(g, 3).length ? 'a Moonlily is ready · wait for rain' : 'needs a half-grown Moonlily'),
      };
    case 'dawn':
      return {
        id, name: 'Dawn chorus', text: 'Grown plants singing all five notes as the sun comes up.', test: (g) => dayTime(g.now).phase === 'dawn' && degreesSung(g, g.now).size === 5,
        progress: (g) => `${degreesSung(g, g.now).size} of 5 notes${degreesSung(g, g.now).size === 5 ? ' · wait for dawn' : ''}`,
      };
    case 'nightscale': {
      const awakeDegs = (g: Garden) => new Set(half(g).filter((p) => awake(p.sp, 0) > 0).map((p) => colOf(p.x) % 5));
      return {
        id, name: 'Night song', text: 'At night, all five notes from plants that are awake (Chimebells sleep).',
        test: (g) => dayTime(g.now).phase === 'night' && awakeDegs(g).size === 5,
        progress: (g) => `${awakeDegs(g).size} of 5 notes from night singers${awakeDegs(g).size === 5 ? ' · wait for night' : ''}`,
      };
    }
  }
  return null;
}

function runLen(g: Garden, sp: number): number {
  const cols = new Set(ofSp(g, sp).map((p) => colOf(p.x)));
  let best = 0, cur = 0;
  for (let c = 0; c < COLS; c++) {
    cur = cols.has(c) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return Math.min(5, best);
}

/** Wish kinds and their weights: compositions and moments come up most. */
const KINDS: [string, number][] = [
  ['chord', 4], ['minor', 3], ['rise', 3], ['fall', 2], ['groove', 2], ['offbeat', 2], ['beat', 2], ['twin', 2],
  ['beevisit', 3], ['flyvisit', 2], ['frogvisit', 2], ['nightscale', 1], ['dawn', 1],
  ['sing', 1], ['run', 1], ['octave', 1], ['lanes', 1], ['pond3', 1], ['reeds3', 1], ['willows2', 1], ['bass', 1], ['high', 1],
  ['flies5', 1], ['bees3', 1], ['flourish3', 1], ['rainlily', 1],
];
const KIND_TOTAL = KINDS.reduce((s, [, w]) => s + w, 0);

function withParams(kind: string, r: Rng): string {
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
  return withParams(kind, r);
}

/** Kinds the daily wish draws from: compositions any garden can make today, no waiting for night or creatures. */
const DAILY_KINDS = ['chord', 'minor', 'rise', 'fall', 'groove', 'offbeat', 'beat', 'twin', 'run'];

/** Today's wish, the same for everyone (seed from src/shared/daily.ts). Counted on plants planted today. */
export function dailyWishId(daySeed: number): string {
  const r = new Rng(mixSeed(daySeed, 0xda11));
  return withParams(r.pick(DAILY_KINDS), r);
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
  // Ids an older version drew but no longer makes (or the duplicate Sunset chord) give their slot back.
  ws.a = ws.a.filter((id) => gardenWish(id) && !id.startsWith('duskchord'));
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

/** A garden with only some plants (the daily wish counts plants planted today). */
export const onlyPlants = (g: Garden, keep: (x: number, y: number) => boolean): Garden => ({ ...g, plants: g.plants.filter((p) => keep(p.x, p.y)) });

