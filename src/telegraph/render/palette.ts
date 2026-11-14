// All colors in one place. Shapes carry meaning too (not just color), so the
// game stays readable for colorblind players.

export const C = {
  bg: '#0f1118',
  floor: '#232838',
  floorAlt: '#262c3d',
  floorEdge: '#171a24',
  wallTop: '#535a75',
  wallSide: '#353a4f',
  lavaA: '#ff6a1f',
  lavaB: '#c8290c',
  stairs: '#2fd3a5',
  stairsDark: '#11483b',
  player: '#5ee7ff',
  playerDark: '#16707f',
  brute: '#ff4d6d',
  bruteDark: '#7a1f33',
  archer: '#ffb020',
  archerDark: '#7a5208',
  guard: '#7aa2ff',
  guardDark: '#24386e',
  shield: '#e2e9ff',
  bomber: '#c084fc',
  bomberDark: '#4c1d7a',
  charger: '#a3e635',
  chargerDark: '#3f6212',
  grappler: '#e9dcc4',
  grapplerDark: '#6b5a3e',
  chain: '#c9b48e',
  pylon: '#f472b6',
  pylonDark: '#7a1d4a',
  zap: '#ffd1ec',
  bomb: '#1b1d27',
  blast: '255, 150, 40',
  threat: '255, 51, 85',
  legal: 'rgba(255,255,255,0.22)',
  select: '#5ee7ff',
  text: '#e8ebf5',
  muted: '#8a90a8',
  heal: '#2fd3a5',
};

/** Spear colours: the first is yours from the start, the rest unlock at a best depth. */
export interface Skin {
  id: string;
  name: string;
  /** Best depth that unlocks it. */
  depth: number;
  body: string;
  dark: string;
  spear: string;
}

export const SKINS: Skin[] = [
  { id: 'tide', name: 'Tide', depth: 0, body: C.player, dark: C.playerDark, spear: '#d7f9ff' },
  { id: 'ember', name: 'Ember', depth: 5, body: '#ff9a4d', dark: '#7a3a12', spear: '#ffe2c4' },
  { id: 'moss', name: 'Moss', depth: 8, body: '#8be36b', dark: '#2f6a1e', spear: '#e6ffd9' },
  { id: 'gilt', name: 'Gilt', depth: 12, body: '#ffd34d', dark: '#7a5a08', spear: '#fff4c9' },
];
