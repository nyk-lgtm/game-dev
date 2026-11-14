// Tidings: shared types, tunable numbers, the band you can recruit, places and endings.
// Pure data; no DOM, no Math.random, no Date.

export const RULES_VERSION = 3;

/** Food, oil, coin, health, trust. Coin can run dry; the other four end the journey at 0. */
export type Res = 'f' | 'o' | 'c' | 'h' | 't';
export const RES: Res[] = ['f', 'o', 'c', 'h', 't'];
export const LETHAL: Res[] = ['f', 'o', 'h', 't'];
export type Fx = Partial<Record<Res, number>>;

export const RES_INFO: Record<Res, { icon: string; name: string; short: string }> = {
  f: { icon: '🍞', name: 'Food', short: 'food' },
  o: { icon: '🪔', name: 'Oil', short: 'oil' },
  c: { icon: '🪙', name: 'Coin', short: 'coin' },
  h: { icon: '❤️', name: 'Health', short: 'health' },
  t: { icon: '🤝', name: 'Trust', short: 'trust' },
};

/** Numbers the balance probe can override (TUNE=legFood:1,startF:7). */
export const TUNE = {
  startF: 5,
  startO: 3,
  startC: 5,
  startH: 5,
  startT: 5,
  capF: 12,
  capO: 10,
  capC: 20,
  capH: 10,
  capT: 10,
  /** Food every leg costs before the band eats, in the lowlands / the hills / the pass. */
  legFood: 1,
  legFoodHills: 2,
  legFoodPass: 2,
  /** Each `bandAt` companions make the band eat `bandFood` more food a leg. */
  bandFood: 1,
  bandAt: 3,
  /** Provisions at a village or inn, once a stop: coin for food, `buyRise` dearer each time in the same region. */
  buyCost: 2,
  buyRise: 1,
  buyFood: 2,
  /** Trust it costs to part ways with a companion. */
  partTrust: 1,
  /** Extra oil a leg on the pass (long cold nights). */
  passOil: 0,
  /** Health a leg to the heights costs (the cold). */
  cold: 1,
  /** Trust a leg into the forest costs (dark woods fray nerves). */
  woods: 1,
  /** Health a leg to a river costs (wet feet). */
  wet: 1,
  /** Deal weight of a companion's recruit card (dealt anywhere in stops 0-6). */
  recruitW: 1.5,
  /** Deal weight of a card whose ✦ choices can no longer be remembered before Hollin. */
  lateSetW: 0.3,
  /** Most companions at once. */
  bandMax: 3,
  /** Cards dealt at each stop, and how many of them you face. */
  hand: 3,
  face: 2,
  /** Score: points per companion who arrives, per promise kept. */
  compPts: 3,
  promisePts: 5,
};

/** Stops 0..11: 0 is Tarrow Bridge, 11 is Hollin. */
export const STOPS = 12;
export const LAST = STOPS - 1;

export type Kind = 'town' | 'road' | 'inn' | 'river' | 'wild' | 'shrine' | 'heights' | 'hut';
/** Each kind of stop: its icon, its word, the oil the leg there burns, and what it is like. */
export const KIND_INFO: Record<Kind, { icon: string; word: string; oil: number; note: string }> = {
  town: { icon: '🏘️', word: 'village', oil: 0, note: 'Markets and people: trade, help, recruits.' },
  road: { icon: '🌾', word: 'road', oil: 1, note: 'Farms and hedges: work, forage, strays.' },
  inn: { icon: '🍺', word: 'inn', oil: 0, note: 'Beds and company, for a price.' },
  river: { icon: '🌊', word: 'river', oil: 0, note: 'Crossings, ferries, tolls. Wet feet cost health.' },
  wild: { icon: '🌲', word: 'forest', oil: 1, note: 'Foraging and hunting, wolves and outlaws. Dark woods cost trust.' },
  shrine: { icon: '⛪', word: 'shrine', oil: 1, note: 'Rest, blessings and strangers.' },
  heights: { icon: '🏔️', word: 'heights', oil: 2, note: 'Shortcuts and storms. The cold costs health.' },
  hut: { icon: '🛖', word: 'hut', oil: 1, note: 'Four walls and a stove on the pass.' },
};

export type Region = 0 | 1 | 2;
export const REGION_NAME = ['The Lowlands', 'The Greyback Hills', 'The Teeth'];
/** Lowlands stops 0-3, hills 4-7, the pass 8-10 (11 is Hollin). */
export const regionOf = (stop: number): Region => (stop < 4 ? 0 : stop < 8 ? 1 : 2);
export const REGION_KINDS: Kind[][] = [
  ['town', 'road', 'inn', 'river'],
  ['wild', 'town', 'shrine', 'river', 'inn'],
  ['heights', 'hut', 'shrine'],
];

/** Place names by kind (a run picks without repeats). */
export const PLACE_NAMES: Record<Kind, string[]> = {
  town: ['Millbrook', 'Ashwell', 'Fallowby', 'Thornbury', 'Kettering End', 'Little Haddon', 'Wickham', 'Saltcote', 'Brindle', 'Upper Cleve'],
  road: ['the Drovers’ Road', 'Hedgerow Lane', 'the Old Causeway', 'Ten Mile Lane', 'the Miller’s Way', 'Larkhill Road'],
  inn: ['the Crooked Kettle', 'the Wren & Barrow', 'the Sleeping Ox', 'the Last Candle', 'the Lamb and Flag', 'the Merry Ferret'],
  river: ['the Wending', 'Sallow Ford', 'the Greywater', 'Heron Reach', 'the Rush', 'Otter Bend'],
  wild: ['Hartwood', 'the Hollow Pines', 'Owlden', 'Bracken Combe', 'the Tangle', 'Mossgate Wood'],
  shrine: ['the Bell Cairn', 'St Wenna’s Well', 'the Lamp Shrine', 'Pilgrim’s Rest', 'the Quiet Stones', 'the Saint’s Seat'],
  heights: ['Gallow Ridge', 'the Long Scree', 'Crowsteps', 'the Saddle', 'Windgap', 'the Shoulder'],
  hut: ['Shepherd’s Bothy', 'the Refuge', 'Halfway Hut', 'the Stone Hut', 'Snowgate Hut', 'the Herders’ Hut'],
};
export const START_NAME = 'Tarrow Bridge';
export const END_NAME = 'Hollin';

export type CompId = 'wren' | 'tamsin' | 'pell' | 'bram' | 'ysolde' | 'fen' | 'corrie' | 'hob';
export const COMPANIONS: Record<CompId, { name: string; trait: string; icon: string; blurb: string }> = {
  wren: { name: 'Wren', trait: 'Climber', icon: '🧗', blurb: 'Goat-footed. Knows every high path and is bored of most of them.' },
  tamsin: { name: 'Old Tamsin', trait: 'Herbalist', icon: '🌿', blurb: 'Pockets full of bitter roots that work.' },
  pell: { name: 'Pell', trait: 'Trader', icon: '⚖️', blurb: 'Could sell a candle to the sun, and has tried.' },
  bram: { name: 'Bram', trait: 'Tinker', icon: '🔧', blurb: 'Mends lamps, wheels and quarrels.' },
  ysolde: { name: 'Ysolde', trait: 'Hunter', icon: '🏹', blurb: 'Quiet, patient, and never hungry for long.' },
  fen: { name: 'Fen', trait: 'Fiddler', icon: '🎻', blurb: 'One tune and a tired band stands up again.' },
  corrie: { name: 'Corrie', trait: 'Wayfinder', icon: '🧭', blurb: 'Reads clouds, tracks and liars.' },
  hob: { name: 'Hob', trait: 'Strongback', icon: '💪', blurb: 'Says little. Carries everything.' },
};
export const COMP_IDS = Object.keys(COMPANIONS) as CompId[];

/** Promises: carried to Hollin, each one kept is worth TUNE.promisePts. */
export const PROMISES: Record<string, { name: string; icon: string; kept: string }> = {
  ring: { name: 'The ring for Tomas', icon: '💍', kept: 'Tomas reads the letter twice, then runs out into the snow without a coat.' },
  medicine: { name: 'The doctor’s parcel', icon: '💊', kept: 'The doctor tears the parcel open on the doorstep. Three children are on their feet within the week.' },
  bell: { name: 'The chapel bell', icon: '🔔', kept: 'They hang the bell that night, and ring it far too long, and nobody minds.' },
};

export type EndKind = 'arrive' | 'fail';
export interface Ending {
  id: string;
  kind: EndKind;
  title: string;
  icon: string;
  text: string;
  /** What the journal says before you've found it. */
  hint: string;
}

export const ENDINGS: Ending[] = [
  { id: 'starve', kind: 'fail', title: 'Empty Packs', icon: '🍞', text: 'The last crust goes to the mule. You turn back for the lowlands, and the post waits for spring.', hint: 'Run out of food.' },
  { id: 'dark', kind: 'fail', title: 'The Lamps Go Out', icon: '🪔', text: 'The last wick gutters. In the dark you can only sit together and wait for a dawn that takes its time.', hint: 'Run out of oil.' },
  { id: 'hurt', kind: 'fail', title: 'Carried Down', icon: '❤️', text: 'You can’t stand. The band carries you back down the road on the mule, which complains the whole way.', hint: 'Run out of health.' },
  { id: 'scatter', kind: 'fail', title: 'The Band Turns Back', icon: '🤝', text: 'One by one they stop believing you, and one morning the camp is empty except for the mule and the post.', hint: 'Run out of trust.' },
  { id: 'wedding', kind: 'arrive', title: 'The Winter Wedding', icon: '💍', text: 'You came for the post and stayed for a wedding. The whole band dances, and the mule wears a ribbon.', hint: 'Carry a ring all the way to Hollin (it comes as well as another ending).' },
  { id: 'full', kind: 'arrive', title: 'A Full Table', icon: '🍲', text: 'Every one of you squeezes round the postmaster’s table. There aren’t enough chairs, and nobody cares.', hint: 'Reach Hollin with three companions.' },
  { id: 'beloved', kind: 'arrive', title: 'Followed Anywhere', icon: '🔥', text: 'Your band would walk the Teeth again tomorrow if you asked. Please don’t ask.', hint: 'Reach Hollin with trust of 9 or more.' },
  { id: 'rich', kind: 'arrive', title: 'Silver in the Snow', icon: '🪙', text: 'You arrive with a purse heavier than the post sack. The valley eyes you with interest.', hint: 'Reach Hollin with 14 coin or more.' },
  { id: 'thin', kind: 'arrive', title: 'By a Thread', icon: '🧵', text: 'You stumble into Hollin on nothing at all. The postmaster sits you by the stove before she opens a single letter.', hint: 'Reach Hollin with something down to 1.' },
  { id: 'alone', kind: 'arrive', title: 'One Lamp Walking', icon: '🏮', text: 'Just you, the carriers and the mule, all the way. Hollin’s children follow your one lamp down the street.', hint: 'Reach Hollin with no companions at all.' },
  { id: 'plain', kind: 'arrive', title: 'The Post Comes In', icon: '✉️', text: 'The bell rings, the doors open, and a whole valley reads its letters by the fire.', hint: 'Reach Hollin any other way.' },
];
export const ENDING = Object.fromEntries(ENDINGS.map((e) => [e.id, e])) as Record<string, Ending>;

/** Star thresholds for an arrival score (one star for arriving at all). */
export const STARS = [0, 28, 36];
