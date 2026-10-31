// Hand-drawn maps. Terrain: # wall, . floor, , grass, T tree, ~ water,
// = bridge, + door, _ road. Any other character is a marker from the map's
// legend (or MONSTER_MARKERS); markers are replaced by the map's ground.

import type { ItemId, MapId, MonsterKind, NpcId } from './types';

export type Marker =
  | { kind: 'npc'; npc: NpcId }
  | { kind: 'chest'; id: string; gold?: number; potions?: number; item?: ItemId }
  | { kind: 'sign'; text: string }
  | { kind: 'lantern' }
  | { kind: 'spawn' }
  /** Step onto it to travel; you arrive next to the marker `entry` in map `to`. */
  | { kind: 'exit'; to: MapId; entry: string; glyph: '>' | '<' };

export interface MapDef {
  name: string;
  /** Dark maps show only what your lantern lights, plus what you remember. */
  dark: boolean;
  ground: ',' | '.';
  rows: string[];
  legend: Record<string, Marker>;
}

export const MONSTER_MARKERS: Record<string, MonsterKind> = {
  r: 'rat',
  w: 'wolf',
  g: 'goblin',
  b: 'bat',
  s: 'spider',
  k: 'skeleton',
  K: 'king',
};

export const MAPS: Record<MapId, MapDef> = {
  village: {
    name: 'Emberwick',
    dark: false,
    ground: ',',
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T',
      'T,#######,,,,,,,,,,,,,,,######,T',
      'T,#.....#,,,,,,,,,,,,,,,#....#,T',
      'T,#..1..#,,,,,TT,TT,,,,,#.2..#,T',
      'T,#.....#,,,,,T,L,T,,,,,#....#,T',
      'T,###+###,,,,,,,,,,,,,,,##+###,T',
      'T,,,,_,,,,,,,,,,_,,,,,,,,,_,,,,T',
      'T,,,,_______________________,,,E',
      'T,,,,,,,,,,,,_,,,,,,,,,,,,,,,,,T',
      'T,,~~~~,,,,,,_,,,,,,,#######,,,T',
      'T,~~~~~~,,,,,_,,4,,,,#.....#,,,T',
      'T,,~~~~,,,,,,_,,,,,,,#..3..#,,,T',
      'T,,,,,,,,,,,,_,,,,,,,###+###,,,T',
      'T,,,,,,,,,,,,_____@_____,,,,,,,T',
      'T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    legend: {
      '1': { kind: 'npc', npc: 'elder' },
      '2': { kind: 'npc', npc: 'smith' },
      '3': { kind: 'npc', npc: 'healer' },
      '4': { kind: 'npc', npc: 'child' },
      L: { kind: 'lantern' },
      '@': { kind: 'spawn' },
      E: { kind: 'exit', to: 'forest', entry: 'W', glyph: '>' },
    },
  },

  forest: {
    name: 'Ashwood',
    dark: false,
    ground: ',',
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T,,,,,,,T,,,,,,~~,,,,,TTT,,,,,,,,####,,T',
      'T,,r,,,,TT,,,,,~~,,,,TTTT,,,w,,,,#..C#,T',
      'T,,,,,,,,T,,,,~~~,,,,,TT,,,,,,,,,#...#,T',
      'T,,,,,,,,,,,,,~~,,,,,,,,,,,,,,,,,##.##,T',
      'T,,TT,,,,,,,,,~~,,,,,,,g,,,,,,,,,,,,,,,T',
      'T,TTTT,,,,,,,,~~,,,,,,,,,,,,TT,,,,,,,,,T',
      'T,,TT,,,,,,,,,~~~,,,,,,,,,,TTTT,,,,w,,,T',
      'W,,,,,,,,,,,,,,=,,,,1,,,,,,,TT,,,,,,,,,T',
      'T,,,,,,,,,,,,,~~,,,,,,,,,,,,,,,,,,,,,,,T',
      'T,,,r,,,,,,,,,~~,,,,,,,TTT,,,,,,,,,,,,,T',
      'T,,,,,,,,,,,,~~,,,,,,,TTTTT,,,,,,,g,,,,T',
      'T,TTT,,,,,,,,~~,,,,,,,,TTT,,,,,,,,,,,,,T',
      'T,,T,,,,,,,,,~~,,,,w,,,,,,,,,,,,,,,,,,,T',
      'T,,,,,,,2,,,,~~~,,,,,,,,,,,,,,,TTTTTTT,T',
      'T,,,,,,,,,,,,,~~,,,,,,,,,,g,,,,T,,,,,T,T',
      'T,,TT,,,,,,,,,~~,,,,,,,,,,,,,,,T,,3,,T,T',
      'T,TTTT,,,,,,,,~~,,,,,,,,,,,,,,,T,,,,,,,T',
      'T,,TT,,,,,,,,,~~,,,,,,,,,,,,,,,TTTTTTT,T',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    legend: {
      W: { kind: 'exit', to: 'village', entry: 'E', glyph: '<' },
      C: { kind: 'exit', to: 'cave1', entry: 'U', glyph: '>' },
      '1': { kind: 'sign', text: 'East and north, in the rocks: the Hollow. Turn back, traveller.' },
      '2': { kind: 'npc', npc: 'hermit' },
      '3': { kind: 'chest', id: 'forest-chest', gold: 12, potions: 1 },
    },
  },

  cave1: {
    name: 'The Hollow',
    dark: true,
    ground: '.',
    rows: [
      '###################################',
      '#U...#########.........############',
      '#....#########.#######.###.....####',
      '##.###...b.....#######.....s...####',
      '##.###.#######.###########.....####',
      '##.....#######.###########.##.#####',
      '#####.########.######......##.#####',
      '#####.########.######.#######.....#',
      '#####...s......######.#######.###.#',
      '###########.#########.#####...###.#',
      '###########.#########k#####.#####.#',
      '#.....b.....#########.#####.#####.#',
      '#.#########.#####.....#####.....#.#',
      '#.#########.#####.##########.##.#.#',
      '#.....1#....#####.##########.##...#',
      '########.k.......###########.##D###',
      '###################################',
    ],
    legend: {
      U: { kind: 'exit', to: 'forest', entry: 'C', glyph: '<' },
      D: { kind: 'exit', to: 'cave2', entry: 'V', glyph: '>' },
      '1': { kind: 'chest', id: 'cave-chest', item: 'axe' },
    },
  },

  cave2: {
    name: 'The Deep Hollow',
    dark: true,
    ground: '.',
    rows: [
      '##############################',
      '#V.....##########............#',
      '#.....b##########.##########.#',
      '###.####.........k.#......#..#',
      '###.####.##########.#......#.#',
      '###.####.#........#.#..K...#.#',
      '###......#.s......#.#......#.#',
      '#######..#........#.#......#.#',
      '#######.##........#.##....##.#',
      '#######.##########..##....##.#',
      '#.....s............###.####..#',
      '#.###############.####......##',
      '#.#1..........k...############',
      '#.############################',
      '#........b...................#',
      '##############################',
    ],
    legend: {
      V: { kind: 'exit', to: 'cave1', entry: 'D', glyph: '<' },
      '1': { kind: 'chest', id: 'deep-chest', gold: 25, potions: 2 },
    },
  },
};
