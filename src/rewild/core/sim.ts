// One season of the living island: weather, plants, then animals.
// Mutates the state it is given; callers clone first. Every random choice
// draws from an Rng seeded by (seed, season), and cells are visited in index
// order, so a season always plays out the same way.

import { Rng, mixSeed } from '../../shared/rng';
import { ADJ, ADJ6, NEAR2, NEAR3, RING, N } from './island';
import { ANIMALS, PLANTS, WATER, animalFits, canRootOver, plantFits } from './species';
import type { AnimalId, Cell, GameState, PlantId, SimEvent, SpeciesId, Weather } from './types';

export const SEASONS = 20;
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const seasonOf = (season: number) => season % 4;
export const yearOf = (season: number) => Math.floor(season / 4) + 1;

/** Weather depends only on the seed, so it can be announced ahead. */
export function weatherFor(seed: number, season: number): { weather: Weather; fireAt: number } {
  const rng = new Rng(mixSeed(seed, 9000 + season));
  const r = rng.next();
  const sea = seasonOf(season);
  let weather: Weather = 'fair';
  if (season >= 2) {
    if (sea === 0) weather = r < 0.25 ? 'storm' : 'fair';
    else if (sea === 1) weather = season < 4 ? (r < 0.3 ? 'drought' : 'fair') : r < 0.28 ? 'drought' : r < 0.55 ? 'fire' : 'fair';
    else if (sea === 2) weather = r < 0.3 ? 'storm' : 'fair';
    else weather = season >= 7 && r < 0.45 ? 'harsh' : 'fair';
  }
  let fireAt = -1;
  if (weather === 'fire') {
    const inland: number[] = [];
    for (let i = 0; i < N; i++) if (RING[i] <= 3) inland.push(i);
    fireAt = rng.pick(inland);
  }
  return { weather, fireAt };
}

export const WEATHER_TEXT: Record<Weather, string> = {
  fair: 'Fair weather.',
  drought: 'Drought: every cell is one step drier.',
  fire: 'Dry lightning: every cell is one step drier, and late in summer lightning strikes the marked cell. Fire catches in the nearest grass, flowers or shrub within 3 cells that is half grown or more, ungrazed this summer and on bone-dry ground (moisture 0), then leaps to more like it up to 2 cells away (a one-cell gap won\'t stop it). Animals caught in it die; bees and songbirds fly off. Oaks, seedlings, grazed plants, damp ground and water never burn.',
  storm: 'Storm: heavy rain makes every cell one step wetter, but bees and birds stay hidden and spread nothing.',
  harsh: 'Harsh winter: animals that stay awake need twice the food.',
};

/** Moisture 0..3 of every cell under the given weather. */
export function moisture(cells: Cell[], weather: Weather): number[] {
  return cells.map((c, i) => {
    if (WATER.includes(c.t)) return 3;
    let v = 0;
    let pond = false;
    let shore = false;
    let oak = false;
    for (const j of ADJ6[i]) {
      if (j < 0) {
        shore = true;
        continue;
      }
      const n = cells[j];
      if (n.t === 'pond' || n.t === 'marsh') pond = true;
      else if (n.t === 'shallows') shore = true;
      if (n.plant?.id === 'tree' && n.plant.n === 3) oak = true;
    }
    if (pond) v += 2;
    else if (shore) v += 1;
    if (oak) v += 1;
    if (c.fert >= 3) v += 1;
    if (weather === 'drought' || weather === 'fire') v -= 1;
    if (weather === 'storm') v += 1;
    return Math.max(0, Math.min(3, v));
  });
}

/** Plants that burn: half grown or more (seedlings are too green) on bone-dry ground (moisture 0).
 * The fire also spares plants grazed that summer (see `wildfire`). */
export const BURNS: PlantId[] = ['grass', 'flowers', 'shrub'];
export const canBurn = (c: Cell, wet: number) => !!c.plant && BURNS.includes(c.plant.id) && c.plant.n >= 2 && wet === 0;

/** Plant habitat check including the fungi's need for a woody neighbor. */
export function plantOk(cells: Cell[], i: number, id: PlantId, wet: number): boolean {
  const c = cells[i];
  if (!plantFits(id, c, wet)) return false;
  if (id === 'fungi') return ADJ[i].some((j) => cells[j].plant?.id === 'tree' || cells[j].plant?.id === 'shrub');
  return true;
}

function awake(id: AnimalId, sea: number) {
  return !(sea === 3 && ANIMALS[id].hibernates);
}

/** Food units within reach of an animal of this species standing on cell i. */
export function foodAt(cells: Cell[], i: number, id: AnimalId, sea: number): number {
  const def = ANIMALS[id];
  let food = 0;
  for (const j of [i, ...ADJ[i]]) {
    const c = cells[j];
    if (c.plant && def.eats.includes(c.plant.id)) food += def.consumes ? c.plant.n - 1 : c.plant.n;
    if (j !== i && c.animal && def.eats.includes(c.animal.id) && awake(c.animal.id, sea)) food += c.animal.n * def.value;
  }
  return food;
}

export function needOf(id: AnimalId, n: number, weather: Weather, sea: number): number {
  if (!awake(id, sea)) return 0;
  return n * ANIMALS[id].need * (weather === 'harsh' && sea === 3 ? 2 : 1);
}

/** Plays a season. With `plantsOnly` it stops before the animals act, to show
 * what food they will find. */
export function simulate(s: GameState, plantsOnly = false): SimEvent[] {
  const ev: SimEvent[] = [];
  const rng = new Rng(mixSeed(s.seed, 7000 + s.season));
  const sea = seasonOf(s.season);
  const cells = s.cells;
  const calm = s.weather !== 'storm';

  // Ash from last summer's fire settles.
  for (const c of cells) if (c.burnt > 0) c.burnt--;

  // --- Plants ---
  const wet = moisture(cells, s.weather);
  const start = cells.map((c) => c.plant);
  const fresh = new Set<number>();
  const hasNear = (i: number, id: AnimalId, near: readonly number[]) =>
    cells[i].animal?.id === id || near.some((j) => cells[j].animal?.id === id);
  const growing = (id: PlantId) => PLANTS[id].grows.includes(sea);

  // Spread from plants that were full at the start of the season.
  for (let i = 0; i < N; i++) {
    const p = start[i];
    if (!p || cells[i].plant !== p || !growing(p.id) || cells[i].burnt > 0) continue;
    const def = PLANTS[p.id];
    if (p.n < (def.spreadAt ?? 3)) continue;
    let reach: readonly number[] = ADJ[i];
    let count = 1;
    if (def.spread === 'none') continue;
    if (def.spread === 'pollinated' && !(calm && hasNear(i, 'bees', NEAR2[i]))) continue;
    if (def.spread === 'birds') {
      if (!(calm && hasNear(i, 'songbird', NEAR2[i]))) continue;
      reach = NEAR2[i];
    }
    if (p.n === 3 && (p.id === 'lichen' || p.id === 'grass')) count = 2;
    const targets = reach.filter((j) => !fresh.has(j) && canRootOver(p.id, cells[j].plant?.id) && cells[j].burnt === 0 && plantOk(cells, j, p.id, wet[j]));
    rng.shuffle(targets);
    // Lichen spores take hold fast; other seedlings start small.
    const n0 = p.id === 'lichen' ? 2 : 1;
    for (const j of targets.slice(0, count)) {
      cells[j].plant = { id: p.id, n: n0, age: 0 };
      fresh.add(j);
      ev.push({ type: 'spread', from: i, to: j, id: p.id });
    }
  }

  // Full lichen crumbles its rock into soil; full reeds silt shallows into marsh.
  for (let i = 0; i < N; i++) {
    const p = start[i];
    const c = cells[i];
    if (!p || p.n < 3 || c.plant !== p || !growing(p.id)) continue;
    if (p.id === 'lichen') {
      const from = c.t;
      if (from !== 'soil') {
        c.t = 'soil';
        s.stats.soilMade++;
        ev.push({ type: 'terraform', cell: i, from, to: 'soil' });
      }
      c.fert = Math.max(c.fert, 1);
      c.plant = null;
      ev.push({ type: 'enrich', cell: i, fert: c.fert });
    } else if (p.id === 'reeds' && c.t === 'shallows') {
      c.t = 'marsh';
      c.fert = Math.max(c.fert, 2);
      ev.push({ type: 'terraform', cell: i, from: 'shallows', to: 'marsh' });
    }
  }

  // Grow where the habitat suits, wither where it doesn't.
  const wet2 = moisture(cells, s.weather);
  for (let i = 0; i < N; i++) {
    const c = cells[i];
    const p = c.plant;
    if (!p || fresh.has(i)) continue;
    p.age++;
    if (!growing(p.id) || c.burnt > 0) continue;
    if (plantOk(cells, i, p.id, wet2[i])) {
      if (p.n < 3) {
        p.n++;
        ev.push({ type: 'grow', cell: i, id: p.id });
      }
    } else {
      const dry = wet2[i] < PLANTS[p.id].minWet;
      p.n--;
      if (p.n <= 0) {
        c.plant = null;
        ev.push({ type: 'die', cell: i, id: p.id, why: dry ? 'too dry' : 'unsuited' });
      } else ev.push({ type: 'shrink', cell: i, id: p.id, why: dry ? 'too dry' : 'unsuited' });
    }
  }

  // Autumn: fallen leaves and fungi feed the soil.
  if (sea === 2) {
    const add = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const p = cells[i].plant;
      if (!p) continue;
      if ((p.id === 'grass' || p.id === 'flowers') && p.n >= 2 && cells[i].fert < 2) add[i] = Math.max(add[i], 1);
      if (p.id === 'tree' && p.n === 3) add[i] = Math.max(add[i], 1);
      if (p.id === 'fungi' && p.n >= 2) {
        add[i] = Math.max(add[i], 1);
        for (const j of ADJ[i]) if (cells[j].t === 'soil') add[j] = Math.max(add[j], 1);
      }
    }
    for (let i = 0; i < N; i++) {
      if (add[i] && cells[i].fert < 3 && cells[i].t === 'soil') {
        cells[i].fert++;
        ev.push({ type: 'enrich', cell: i, fert: cells[i].fert });
      }
    }
  }

  // --- Animals ---
  if (plantsOnly) return ev;
  const acted = new Set<number>();
  const order: number[] = [];
  for (let i = 0; i < N; i++) if (cells[i].animal) order.push(i);

  const freeFor = (j: number, id: AnimalId) => !cells[j].animal && animalFits(id, cells[j]);
  const wolfNear = (j: number) => ADJ[j].some((k) => cells[k].animal?.id === 'wolf');

  // Grazers crop plants rather than uproot them: each plant unit eaten
  // covers two units of need. Hunters take whole prey.
  const cropped = new Set<number>();
  const eat = (at: number, id: AnimalId, need: number) => {
    const def = ANIMALS[id];
    const src = [at, ...ADJ[at]];
    let left = need;
    while (left > 0) {
      let best = -1;
      let bestN = 0;
      let animal = false;
      for (const j of src) {
        const c = cells[j];
        if (c.plant && def.eats.includes(c.plant.id) && c.plant.n > 1 && c.plant.n > bestN) {
          best = j;
          bestN = c.plant.n;
          animal = false;
        }
        if (j !== at && c.animal && def.eats.includes(c.animal.id) && awake(c.animal.id, sea) && c.animal.n > bestN) {
          best = j;
          bestN = c.animal.n;
          animal = true;
        }
      }
      if (best < 0) break;
      const c = cells[best];
      ev.push({ type: 'eat', cell: at, prey: best, id });
      if (animal) {
        const prey = c.animal!;
        prey.n--;
        left -= def.value;
        if (prey.n <= 0) {
          c.animal = null;
          ev.push({ type: 'die', cell: best, id: prey.id, why: 'hunted', by: id });
        } else ev.push({ type: 'shrink', cell: best, id: prey.id, why: 'hunted', by: id });
      } else {
        // Grazers crop a plant but never take its last unit: the roots regrow.
        c.plant!.n--;
        cropped.add(best);
        left -= 2;
      }
    }
  };

  const move = (from: number, to: number, why: 'flee' | 'food') => {
    const a = cells[from].animal!;
    cells[to].animal = a;
    cells[from].animal = null;
    a.age = 0;
    acted.add(to);
    ev.push({ type: 'move', from, to, id: a.id, why });
  };

  for (const i0 of order) {
    let i = i0;
    const a = cells[i].animal;
    if (!a || acted.has(i)) continue;
    acted.add(i);
    a.age++;
    const def = ANIMALS[a.id];
    if (!awake(a.id, sea)) continue;
    const reach = def.range === 2 ? NEAR2[i] : ADJ[i];

    // Deer keep away from wolves.
    if (a.id === 'deer' && wolfNear(i)) {
      const safe = reach.filter((j) => freeFor(j, 'deer') && !wolfNear(j));
      if (safe.length) {
        let best = safe[0];
        for (const j of safe) if (foodAt(cells, j, 'deer', sea) > foodAt(cells, best, 'deer', sea)) best = j;
        move(i, best, 'flee');
        i = best;
      }
    }

    const need = needOf(a.id, a.n, s.weather, sea);
    const home = animalFits(a.id, cells[i]);
    const food = home ? foodAt(cells, i, a.id, sea) : 0;
    ev.push({ type: 'feed', cell: i, id: a.id, food, need });
    if (home && food >= need) {
      if (def.consumes) eat(i, a.id, need);
      if (def.breeds.includes(sea)) {
        if (a.n < 3) {
          a.n++;
          ev.push({ type: 'grow', cell: i, id: a.id });
        } else {
          const kids = (def.range === 2 ? NEAR2[i] : ADJ[i]).filter((j) => freeFor(j, a.id) && !(a.id === 'deer' && wolfNear(j)));
          if (kids.length) {
            let best = kids[0];
            let bestF = -1;
            for (const j of kids) {
              const f = foodAt(cells, j, a.id, sea);
              if (f > bestF) {
                best = j;
                bestF = f;
              }
            }
            if (bestF >= ANIMALS[a.id].need) {
              cells[best].animal = { id: a.id, n: 1, age: 0 };
              acted.add(best);
              ev.push({ type: 'spread', from: i, to: best, id: a.id });
            }
          }
        }
      }
      // Beavers dam a cell into a pond each autumn.
      if (a.id === 'beaver' && sea === 2 && a.n >= 2) {
        const sites = ADJ[i].filter((j) => (cells[j].t === 'soil' || cells[j].t === 'sand') && !cells[j].animal);
        if (sites.length) {
          // Prefer cells already touching water, so ponds join up.
          const score = (j: number) => ADJ[j].filter((k) => WATER.includes(cells[k].t)).length;
          let best = sites[0];
          for (const j of sites) if (score(j) > score(best)) best = j;
          const c = cells[best];
          const from = c.t;
          if (c.plant) ev.push({ type: 'die', cell: best, id: c.plant.id, why: 'flooded' });
          c.plant = null;
          c.t = 'pond';
          c.fert = 0;
          s.stats.pondsMade++;
          ev.push({ type: 'terraform', cell: best, from, to: 'pond' });
        }
      }
      continue;
    }

    // Hungry or homeless: look for somewhere better within reach.
    let best = -1;
    let bestF = need - 1;
    for (const j of def.range === 2 ? NEAR2[i] : ADJ[i]) {
      if (!freeFor(j, a.id) || (a.id === 'deer' && wolfNear(j))) continue;
      const f = foodAt(cells, j, a.id, sea);
      if (f > bestF) {
        best = j;
        bestF = f;
      }
    }
    if (best >= 0) {
      move(i, best, 'food');
      ev.push({ type: 'feed', cell: best, id: a.id, food: bestF, need });
      if (def.consumes) eat(best, a.id, need);
      continue;
    }
    if (def.consumes && home && food > 0) eat(i, a.id, food);
    a.n--;
    if (a.n <= 0) {
      cells[i].animal = null;
      ev.push({ type: 'die', cell: i, id: a.id, why: home ? 'starved' : 'no home' });
    } else ev.push({ type: 'shrink', cell: i, id: a.id, why: home ? 'hungry' : 'no home' });
  }

  // --- Wildfire, late in a lightning summer (after grazing) ---
  if (s.weather === 'fire' && s.fireAt >= 0) wildfire(s, ev, cropped);

  return ev;
}

/** Lightning strikes the marked cell; fire catches in the nearest burnable plant
 * within 3 cells and leaps to burnable plants up to 2 cells away. Plants grazed
 * this season (`cropped`) don't burn; animals caught in it die, fliers escape. */
function wildfire(s: GameState, ev: SimEvent[], cropped: Set<number>) {
  const cells = s.cells;
  const wet = moisture(cells, s.weather);
  const burnable = (i: number) => canBurn(cells[i], wet[i]) && !cropped.has(i);
  let start = -1;
  for (const j of [s.fireAt, ...NEAR3[s.fireAt]]) {
    if (burnable(j)) {
      start = j;
      break;
    }
  }
  if (start < 0) return;
  ev.push({ type: 'strike', cell: start });
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift()!;
    const c = cells[i];
    ev.push({ type: 'burn', cell: i });
    ev.push({ type: 'die', cell: i, id: c.plant!.id, why: 'burnt' });
    c.plant = null;
    c.fert = Math.min(3, c.fert + 1);
    c.burnt = 1;
    s.stats.burnt++;
    const a = c.animal;
    if (a && a.id !== 'bees' && a.id !== 'songbird') {
      c.animal = null;
      ev.push({ type: 'die', cell: i, id: a.id, why: 'burnt' });
    }
    for (const j of NEAR2[i]) {
      if (!seen.has(j) && burnable(j)) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
}

/** Species alive and total life on the island. */
export function census(cells: Cell[]): { species: Set<SpeciesId>; life: number; count: Map<SpeciesId, number> } {
  const species = new Set<SpeciesId>();
  const count = new Map<SpeciesId, number>();
  let life = 0;
  for (const c of cells) {
    if (c.plant) {
      species.add(c.plant.id);
      count.set(c.plant.id, (count.get(c.plant.id) ?? 0) + 1);
      life += c.plant.n;
    }
    if (c.animal) {
      species.add(c.animal.id);
      count.set(c.animal.id, (count.get(c.animal.id) ?? 0) + 1);
      life += c.animal.n * 2;
    }
  }
  return { species, life, count };
}

/** Points the island earns at the end of a season: diversity counts most. */
export function seasonPoints(cells: Cell[]): number {
  const { species, life } = census(cells);
  const k = species.size;
  return Math.round((k * k) / 2 + life / 5);
}
