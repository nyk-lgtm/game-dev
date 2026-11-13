// Wishes: light, optional goals. Each is a pure test of the garden at its
// current step; once met it stays met (the page remembers it).

import { COLS, SPECIES, growth, type Garden } from './garden';
import { BEE, FLY, colOf, critterCount, degreesSung } from './music';
import { dayTime } from './sky';

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
    text: 'A Moonlily on the water and a Whistlereed beside it, both half grown.',
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
