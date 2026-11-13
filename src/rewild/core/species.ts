// The species: where each can live, what it eats, and what it does to the land.

import type { AnimalId, Cell, PlantId, SpeciesId, Terrain } from './types';

export interface PlantDef {
  id: PlantId;
  kind: 'plant';
  name: string;
  tier: 1 | 2 | 3;
  /** Terrains it can root in. */
  on: Terrain[];
  minFert: number;
  /** Outcompeted on soil richer than this. */
  maxFert: number;
  minWet: number;
  maxWet: number;
  /** Size when placed. */
  start: number;
  /** Seasons in which it grows (0 spring .. 3 winter). */
  grows: number[];
  /** How it spreads once full (n = 3). */
  spread: 'self' | 'pollinated' | 'birds' | 'water' | 'none';
  /** Size from which it spreads (default 3, full). */
  spreadAt?: number;
  /** Plants it can take over: placed or seeded onto them, it shades them out. */
  over?: PlantId[];
  text: string;
}

export interface AnimalDef {
  id: AnimalId;
  kind: 'animal';
  name: string;
  tier: 1 | 2 | 3;
  /** Terrains it can live on. */
  on: Terrain[];
  /** Food: plants or animals within reach (own cell + neighbors). */
  eats: SpeciesId[];
  /** Grazers and hunters use food up; foragers (bees, birds, frogs) don't. */
  consumes: boolean;
  /** Food units one prey unit gives (prey animals are worth more). */
  value: number;
  /** Food needed per unit of population per season. */
  need: number;
  /** Sleeps through winter (no food needed, no change). */
  hibernates: boolean;
  start: number;
  /** Seasons in which it breeds. */
  breeds: number[];
  /** How far it can move or send young (cells). */
  range: 1 | 2;
  text: string;
}

export type SpeciesDef = PlantDef | AnimalDef;

const LAND: Terrain[] = ['soil', 'sand', 'rock'];

export const PLANTS: Record<PlantId, PlantDef> = {
  lichen: {
    id: 'lichen', kind: 'plant', name: 'Lichen', tier: 1, on: ['rock', 'soil', 'sand'], minFert: 0, maxFert: 0, minWet: 0, maxWet: 3, start: 2,
    grows: [0, 1, 2], spread: 'self',
    text: 'Grows on bare rock and sand. When full it spreads to two cells, then crumbles its own cell into soil.',
  },
  grass: {
    id: 'grass', kind: 'plant', name: 'Grass', tier: 1, on: ['soil'], minFert: 1, maxFert: 3, minWet: 0, maxWet: 3, start: 2,
    grows: [0, 1, 2], spread: 'self', spreadAt: 2,
    text: 'Needs soil. Grows fast and spreads on its own once half grown. Each autumn it enriches poor soil. Dry grass burns in lightning summers once half grown, unless grazed that summer.',
  },
  reeds: {
    id: 'reeds', kind: 'plant', name: 'Reeds', tier: 1, on: ['shallows', 'marsh', 'pond'], minFert: 0, maxFert: 3, minWet: 0, maxWet: 3, start: 1,
    grows: [0, 1, 2], spread: 'water',
    text: 'Grow in shallow water. When full, they silt the shallows up into rich marsh.',
  },
  flowers: {
    id: 'flowers', kind: 'plant', name: 'Wildflowers', tier: 1, on: ['soil'], minFert: 1, maxFert: 3, minWet: 1, maxWet: 3, start: 2,
    grows: [0, 1], spread: 'pollinated', spreadAt: 2,
    text: 'Need soil and some moisture. Only spread where bees live within 2 cells. Enrich poor soil in autumn. Burn when half grown and dry.',
  },
  shrub: {
    id: 'shrub', kind: 'plant', name: 'Berry shrub', tier: 2, on: ['soil'], minFert: 1, maxFert: 3, minWet: 1, maxWet: 3, start: 1,
    grows: [0, 1], spread: 'birds', over: ['grass'],
    text: 'Can be planted into grass. Songbirds carry its seeds up to 2 cells away. Deer browse it. Burns when half grown and dry.',
  },
  tree: {
    id: 'tree', kind: 'plant', name: 'Oak', tier: 2, on: ['soil'], minFert: 2, maxFert: 3, minWet: 1, maxWet: 3, start: 1,
    grows: [0, 1], spread: 'birds', over: ['grass', 'shrub'],
    text: 'Can take over grass and shrubs. Grows in spring and summer; a full oak keeps nearby soil moist. Songbirds spread acorns; deer keep saplings small. Oaks don\'t burn.',
  },
  fungi: {
    id: 'fungi', kind: 'plant', name: 'Fungi', tier: 2, on: ['soil'], minFert: 0, maxFert: 3, minWet: 1, maxWet: 3, start: 1,
    grows: [1, 2], spread: 'self',
    text: 'Need moisture and a tree or shrub next to them. Each autumn they enrich the soil around them.',
  },
};

export const ANIMALS: Record<AnimalId, AnimalDef> = {
  bees: {
    id: 'bees', kind: 'animal', name: 'Bees', tier: 1, on: LAND, eats: ['flowers', 'shrub', 'tree'], consumes: false, value: 1, need: 1,
    hibernates: true, start: 1, breeds: [0, 1], range: 2,
    text: 'Feed on blossoms without using them up, and let wildflowers spread.',
  },
  rabbit: {
    id: 'rabbit', kind: 'animal', name: 'Rabbits', tier: 1, on: ['soil', 'sand'], eats: ['grass', 'flowers'], consumes: true, value: 1, need: 1,
    hibernates: false, start: 2, breeds: [0, 1, 2], range: 1,
    text: 'Graze grass and flowers. Breed fast; too many keep every meadow cropped short so it never spreads.',
  },
  songbird: {
    id: 'songbird', kind: 'animal', name: 'Songbirds', tier: 2, on: ['soil', 'sand', 'rock', 'marsh'], eats: ['shrub', 'tree', 'bees'], consumes: false, value: 1, need: 1,
    hibernates: false, start: 1, breeds: [0, 1], range: 2,
    text: 'Need shrubs or trees close by. Carry shrub and oak seeds up to 2 cells.',
  },
  frog: {
    id: 'frog', kind: 'animal', name: 'Frogs', tier: 2, on: ['marsh', 'pond'], eats: ['reeds', 'bees'], consumes: false, value: 1, need: 1,
    hibernates: true, start: 1, breeds: [0, 1], range: 1,
    text: 'Live in marsh and ponds among reeds.',
  },
  deer: {
    id: 'deer', kind: 'animal', name: 'Deer', tier: 2, on: ['soil', 'sand'], eats: ['grass', 'shrub', 'tree', 'flowers'], consumes: true, value: 1, need: 2,
    hibernates: false, start: 2, breeds: [0, 1], range: 2,
    text: 'Browse shrubs, saplings and grass. Too many deer and no forest can grow. They flee from wolves.',
  },
  fox: {
    id: 'fox', kind: 'animal', name: 'Foxes', tier: 2, on: ['soil', 'sand', 'rock'], eats: ['rabbit', 'frog'], consumes: true, value: 2, need: 1,
    hibernates: false, start: 1, breeds: [0], range: 2,
    text: 'Hunt rabbits and frogs. Keep rabbits from stripping the meadows.',
  },
  wolf: {
    id: 'wolf', kind: 'animal', name: 'Wolves', tier: 3, on: ['soil', 'sand', 'rock'], eats: ['deer'], consumes: true, value: 3, need: 1,
    hibernates: false, start: 1, breeds: [0], range: 2,
    text: 'Hunt deer, and deer keep away from them, so forests can grow back.',
  },
  beaver: {
    id: 'beaver', kind: 'animal', name: 'Beavers', tier: 3, on: ['soil', 'marsh', 'shallows', 'pond'], eats: ['tree', 'shrub', 'reeds'], consumes: true, value: 1, need: 1,
    hibernates: false, start: 1, breeds: [0], range: 1,
    text: 'Live by water and gnaw trees. Each autumn a family dams a nearby cell into a new pond.',
  },
};

export const SPECIES: Record<SpeciesId, SpeciesDef> = { ...PLANTS, ...ANIMALS };
export const PLANT_IDS = Object.keys(PLANTS) as PlantId[];
export const ANIMAL_IDS = Object.keys(ANIMALS) as AnimalId[];
export const ALL_IDS = [...PLANT_IDS, ...ANIMAL_IDS];

export const isPlant = (id: SpeciesId): id is PlantId => id in PLANTS;

/** Can this plant live here, given the cell's current moisture? */
export function plantFits(id: PlantId, c: Cell, wet: number): boolean {
  const d = PLANTS[id];
  return d.on.includes(c.t) && c.fert >= d.minFert && c.fert <= d.maxFert && wet >= d.minWet && wet <= d.maxWet;
}

/** Can this plant root on a cell holding `here` (nothing, or a plant it shades out)? */
export function canRootOver(id: PlantId, here: PlantId | undefined): boolean {
  return !here || (PLANTS[id].over?.includes(here) ?? false);
}

export function animalFits(id: AnimalId, c: Cell): boolean {
  return ANIMALS[id].on.includes(c.t);
}

export const WATER: Terrain[] = ['shallows', 'marsh', 'pond'];
export const isWater = (t: Terrain) => t === 'shallows' || t === 'pond' || t === 'sea';
