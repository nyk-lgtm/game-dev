// Follows one population through a season's events, so the placement
// highlight and the cell readout tell the same story as the exact forecast
// (clone + end season). Pure.

import { ANIMALS, isPlant } from './species';
import type { AnimalId, Cause, Cell, PlantId, SimEvent, SpeciesId } from './types';

export interface Hit {
  why: Cause;
  by?: AnimalId;
  die: boolean;
}

export interface Fate {
  id: SpeciesId;
  /** Cell it started on. */
  from: number;
  /** Cell it ends on (where it died, if it did). */
  at: number;
  alive: boolean;
  /** Size at the end (0 if gone). */
  n: number;
  /** Animals: moved away from wolves / moved to find food. */
  fled: boolean;
  wandered: boolean;
  /** Animals: food in reach and food needed, each time it sized up a cell (empty while asleep). */
  feeds: { cell: number; food: number; need: number }[];
  /** What hurt it, in order. */
  hits: Hit[];
  /** Animals that had young in place; plants that grew. */
  grew: boolean;
  /** New cells it spread to or sent young to. */
  young: number;
  /** Plants: animals that cropped it. */
  grazedBy: AnimalId[];
  /** Plants: taken over by another plant spreading onto its cell. */
  shadedBy: PlantId | null;
}

/** The fate of the population of `id` on `cell` over the events of one or more seasons. */
export function track(ev: SimEvent[], cell: number, id: SpeciesId, after: Cell[]): Fate {
  const f: Fate = { id, from: cell, at: cell, alive: true, n: 0, fled: false, wandered: false, feeds: [], hits: [], grew: false, young: 0, grazedBy: [], shadedBy: null };
  const plant = isPlant(id);
  for (const e of ev) {
    if (!f.alive) break;
    switch (e.type) {
      case 'move':
        if (!plant && e.from === f.at && e.id === id) {
          if (e.why === 'flee') f.fled = true;
          else f.wandered = true;
          f.at = e.to;
        }
        break;
      case 'feed':
        if (e.cell === f.at && e.id === id) f.feeds.push({ cell: e.cell, food: e.food, need: e.need });
        break;
      case 'grow':
        if (e.cell === f.at && e.id === id) f.grew = true;
        break;
      case 'spread':
        if (e.from === f.at && e.id === id) f.young++;
        else if (plant && e.to === f.at && e.id !== id && isPlant(e.id)) {
          f.shadedBy = e.id as PlantId;
          f.alive = false;
        }
        break;
      case 'eat':
        // Hunters' eat events name the prey's cell too: only grazers of this plant count.
        if (plant && e.prey === f.at && ANIMALS[e.id].eats.includes(id) && !f.grazedBy.includes(e.id)) f.grazedBy.push(e.id);
        break;
      case 'shrink':
      case 'die':
        if (e.cell === f.at && e.id === id) {
          f.hits.push({ why: e.why, by: e.by, die: e.type === 'die' });
          if (e.type === 'die') f.alive = false;
        }
        break;
      default:
        break;
    }
  }
  // Whatever is left on its cell at the end (full lichen crumbles away into soil, for one).
  if (f.alive) {
    const c = after[f.at];
    const pop = plant ? c.plant : c.animal;
    if (pop?.id === id) f.n = pop.n;
    else f.alive = false;
  }
  return f;
}
