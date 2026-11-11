// What a season did to the island, boiled down for the season report:
// who spread or had young, who suffered and why, and how the land changed.
// Pure: built from the season's events and the states before and after.

import { census } from './sim';
import { isPlant } from './species';
import type { AnimalId, Cause, GameState, SimEvent, SpeciesId } from './types';

export interface Tally {
  id: SpeciesId;
  /** Cells (populations) affected. */
  n: number;
  why?: Cause;
  by?: AnimalId;
}

export interface SeasonReport {
  /** Season that was just played. */
  season: number;
  points: number;
  species: number;
  /** Change in the number of species alive. */
  delta: number;
  /** Species alive before the season and gone after it, with the main reason. */
  lost: Tally[];
  /** New cells reached by spreading plants or young animals. */
  spread: Tally[];
  /** Animals whose numbers grew in place (births). */
  born: Tally[];
  /** Populations wiped out on a cell, grouped by species and cause. */
  died: Tally[];
  /** Populations that shrank, grouped by species and cause. */
  shrank: Tally[];
  /** Animals that moved to another cell (to find food or flee). */
  moved: Tally[];
  land: { soil: number; marsh: number; ponds: number; richer: number; burnt: number };
  goals: string[];
}

function bump(list: Tally[], id: SpeciesId, why?: Cause, by?: AnimalId) {
  const t = list.find((x) => x.id === id && x.why === why && x.by === by);
  if (t) t.n++;
  else list.push({ id, n: 1, why, by });
}

const most = (list: Tally[]) => [...list].sort((a, b) => b.n - a.n);

/** `startSpecies`: species alive when the season began (before this season's cards), for the ± count. */
export function seasonReport(before: GameState, ev: SimEvent[], after: GameState, startSpecies?: number): SeasonReport {
  const was = census(before.cells).species;
  const now = census(after.cells).species;
  const log = after.log[after.log.length - 1];
  const r: SeasonReport = {
    season: before.season,
    points: log?.points ?? 0,
    species: now.size,
    delta: now.size - (startSpecies ?? was.size),
    lost: [],
    spread: [],
    born: [],
    died: [],
    shrank: [],
    moved: [],
    land: { soil: 0, marsh: 0, ponds: 0, richer: 0, burnt: 0 },
    goals: [],
  };
  const richer = new Set<number>();
  for (const e of ev) {
    switch (e.type) {
      case 'spread':
        bump(r.spread, e.id);
        break;
      case 'grow':
        if (!isPlant(e.id)) bump(r.born, e.id);
        break;
      case 'die':
        bump(r.died, e.id, e.why, e.by);
        break;
      case 'shrink':
        bump(r.shrank, e.id, e.why, e.by);
        break;
      case 'move':
        bump(r.moved, e.id);
        break;
      case 'terraform':
        if (e.to === 'soil') r.land.soil++;
        else if (e.to === 'marsh') r.land.marsh++;
        else if (e.to === 'pond') r.land.ponds++;
        break;
      case 'enrich':
        // Lichen crumbling to richness 1 is counted as new soil, not richer soil.
        if (e.fert >= 2) richer.add(e.cell);
        break;
      case 'burn':
        r.land.burnt++;
        break;
      case 'goal': {
        const g = after.goals.find((x) => x.id === e.id);
        if (g) r.goals.push(g.text);
        break;
      }
      default:
        break;
    }
  }
  r.land.richer = richer.size;
  for (const id of was) {
    if (now.has(id)) continue;
    const why = most(r.died.filter((d) => d.id === id))[0];
    r.lost.push(why ? { ...why } : { id, n: 0 });
  }
  r.spread = most(r.spread);
  r.born = most(r.born);
  r.died = most(r.died);
  r.shrank = most(r.shrank);
  r.moved = most(r.moved);
  return r;
}
