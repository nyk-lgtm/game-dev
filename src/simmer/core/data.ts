// Simmer's tables: ingredients, dishes, guests (little night-market critters),
// weather, upgrades and the numbers a balance probe may tune. Pure data.

export type Tag = 'savory' | 'sweet' | 'hearty' | 'light' | 'warm' | 'cold' | 'fish';
export const TAG_WORD: Record<Tag, string> = {
  savory: 'savoury',
  sweet: 'sweet',
  hearty: 'hearty',
  light: 'light',
  warm: 'warm',
  cold: 'cold',
  fish: 'fishy',
};

export interface IngDef {
  key: string;
  name: string;
  icon: string;
  /** Usual market price. */
  cost: number;
  /** How far the price moves on a cheap or dear day. */
  swing: number;
  /** Nights it can be used, counting the night it was bought. */
  keeps: number;
}

export const INGS: IngDef[] = [
  { key: 'rice', name: 'Rice', icon: '🍚', cost: 2, swing: 1, keeps: 6 },
  { key: 'flour', name: 'Flour', icon: '🌾', cost: 2, swing: 1, keeps: 6 },
  { key: 'greens', name: 'Greens', icon: '🥬', cost: 1, swing: 1, keeps: 2 },
  { key: 'mush', name: 'Mushrooms', icon: '🍄', cost: 3, swing: 1, keeps: 3 },
  { key: 'fish', name: 'Fish', icon: '🐟', cost: 4, swing: 2, keeps: 1 },
  { key: 'berry', name: 'Berries', icon: '🫐', cost: 3, swing: 1, keeps: 2 },
];

export interface DishDef {
  key: string;
  name: string;
  icon: string;
  /** Ingredient ids, one unit each (a repeat means two units). */
  uses: number[];
  /** What a plain guest thinks it's worth, in coins. */
  base: number;
  /** Minutes on the stove. */
  cook: number;
  tags: Tag[];
  /** Coins to learn it; 0 = known from the start. */
  learn: number;
}

export const DISHES: DishDef[] = [
  { key: 'riceball', name: 'Rice Ball', icon: '🍙', uses: [0, 2], base: 7, cook: 4, tags: ['savory', 'light', 'cold'], learn: 0 },
  { key: 'bun', name: 'Mushroom Bun', icon: '🥟', uses: [1, 3], base: 10, cook: 6, tags: ['savory', 'hearty', 'warm'], learn: 0 },
  { key: 'dango', name: 'Berry Dango', icon: '🍡', uses: [0, 5], base: 9, cook: 4, tags: ['sweet', 'light'], learn: 0 },
  { key: 'skewer', name: 'Fish Skewer', icon: '🍢', uses: [4, 2], base: 12, cook: 5, tags: ['fish', 'savory', 'warm'], learn: 30 },
  { key: 'pancake', name: 'Berry Pancake', icon: '🥞', uses: [1, 5], base: 10, cook: 5, tags: ['sweet', 'warm'], learn: 25 },
  { key: 'ice', name: 'Berry Ice', icon: '🍧', uses: [5], base: 7, cook: 3, tags: ['sweet', 'cold', 'light'], learn: 25 },
  { key: 'congee', name: 'Fish Congee', icon: '🍲', uses: [0, 4], base: 13, cook: 7, tags: ['fish', 'hearty', 'warm'], learn: 40 },
  { key: 'noodles', name: 'Forest Noodles', icon: '🍜', uses: [1, 3, 2], base: 15, cook: 7, tags: ['savory', 'hearty', 'warm'], learn: 50 },
  { key: 'pickles', name: 'Crisp Greens', icon: '🥗', uses: [2, 2], base: 6, cook: 3, tags: ['light', 'cold'], learn: 15 },
  { key: 'mooncake', name: 'Moon Cake', icon: '🥮', uses: [1, 5, 0], base: 16, cook: 6, tags: ['sweet', 'hearty'], learn: 55 },
];

export interface SpeciesDef {
  key: string;
  name: string;
  plural: string;
  icon: string;
  loves: Tag;
  dislikes: Tag;
  /** Coins in their purse tonight: lo..hi inclusive, before payday/festival. */
  purse: [number, number];
  /** Minutes they'll queue before walking off. */
  patience: number;
  /** Minutes after opening they turn up: from..to. */
  window: [number, number];
  /** Reputation it takes before they visit. */
  rep: number;
  /** Share of the street crowd (before weather). */
  weight: number;
  /** Dishes they'll eat if the purse allows (badgers have two). */
  appetite: number;
  /** Weather that brings more (or fewer) of them. */
  likes: Partial<Record<WeatherId, number>>;
}

export const SPECIES: SpeciesDef[] = [
  { key: 'mouse', name: 'Mouse', plural: 'Mice', icon: '🐭', loves: 'sweet', dislikes: 'fish', purse: [5, 9], patience: 30, window: [0, 150], rep: 0, weight: 3, appetite: 1, likes: {} },
  { key: 'fox', name: 'Fox', plural: 'Foxes', icon: '🦊', loves: 'savory', dislikes: 'sweet', purse: [9, 14], patience: 12, window: [0, 225], rep: 0, weight: 3, appetite: 1, likes: {} },
  { key: 'mole', name: 'Mole', plural: 'Moles', icon: '🐹', loves: 'hearty', dislikes: 'cold', purse: [8, 12], patience: 24, window: [80, 225], rep: 0, weight: 2.5, appetite: 1, likes: { fog: 1.6, chilly: 1.3 } },
  { key: 'rabbit', name: 'Rabbit', plural: 'Rabbits', icon: '🐰', loves: 'light', dislikes: 'hearty', purse: [7, 11], patience: 18, window: [0, 180], rep: 10, weight: 2.5, appetite: 1, likes: { clear: 1.3 } },
  { key: 'moth', name: 'Moth', plural: 'Moths', icon: '🦋', loves: 'cold', dislikes: 'warm', purse: [6, 11], patience: 20, window: [110, 225], rep: 20, weight: 2.5, appetite: 1, likes: { warm: 2.2, rain: 0, fog: 0.3 } },
  { key: 'badger', name: 'Badger', plural: 'Badgers', icon: '🦡', loves: 'hearty', dislikes: 'light', purse: [13, 19], patience: 20, window: [40, 225], rep: 35, weight: 2, appetite: 2, likes: { chilly: 1.4 } },
  { key: 'heron', name: 'Heron', plural: 'Herons', icon: '🐦', loves: 'fish', dislikes: 'sweet', purse: [15, 22], patience: 12, window: [0, 225], rep: 55, weight: 1.4, appetite: 1, likes: { rain: 3, warm: 0.6 } },
  { key: 'owl', name: 'Owl', plural: 'Owls', icon: '🦉', loves: 'warm', dislikes: 'cold', purse: [14, 21], patience: 30, window: [150, 225], rep: 80, weight: 1.6, appetite: 1, likes: { clear: 1.3 } },
];

export type WeatherId = 'clear' | 'warm' | 'rain' | 'fog' | 'chilly';
export interface WeatherDef {
  name: string;
  icon: string;
  /** Street crowd ×. */
  crowd: number;
  /** Worth × for dishes with these tags. */
  tags: Partial<Record<Tag, number>>;
}
export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: { name: 'Clear', icon: '🌙', crowd: 1, tags: {} },
  warm: { name: 'Warm', icon: '☀️', crowd: 1.1, tags: { cold: 1.3, warm: 0.85 } },
  rain: { name: 'Rain', icon: '🌧️', crowd: 0.7, tags: { warm: 1.2, cold: 0.7 } },
  fog: { name: 'Fog', icon: '🌫️', crowd: 0.85, tags: { hearty: 1.2 } },
  chilly: { name: 'Chilly', icon: '🍂', crowd: 0.95, tags: { warm: 1.2, cold: 0.75 } },
};

export interface UpgradeDef {
  key: string;
  name: string;
  icon: string;
  /** Cost of each level. */
  cost: number[];
  text: string;
}
export const UPGRADES: UpgradeDef[] = [
  { key: 'board', name: 'Bigger menu board', icon: '🪧', cost: [40, 90], text: 'One more dish on the menu' },
  { key: 'stove', name: 'Second stove', icon: '🔥', cost: [140], text: 'Cook two orders at once' },
  { key: 'lantern', name: 'Paper lanterns', icon: '🏮', cost: [90], text: '15% more passers-by stop to look' },
  { key: 'bench', name: 'A bench', icon: '🪑', cost: [40], text: 'Guests queue 50% longer before giving up' },
  { key: 'cool', name: 'Cool box', icon: '🧊', cost: [35], text: 'Ingredients keep a night longer (fish two); cold dishes worth ×1.15' },
];
export const UP = { board: 0, stove: 1, lantern: 2, bench: 3, cool: 4 } as const;

/** Numbers a balance probe may tweak (TUNE=key:value). */
export const TUNE = {
  /** Season length in nights. */
  days: 20,
  startCoins: 60,
  /** Street guests = (street0 + streetK·renown) × weather × festival × lanterns × noise. */
  street0: 8,
  streetK: 0.25,
  festival: 1.6,
  lanterns: 1.15,
  /** Purse × on paydays and festivals. */
  payday: 1.25,
  festPurse: 1.15,
  /** Worth × for a dish with the tag a guest loves / dislikes. */
  love: 1.4,
  dislike: 0.6,
  /** Festival treats: sweet dishes worth more. */
  festSweet: 1.2,
  /** Delighted: a dish with the tag they love, at a price that leaves this share of its worth unspent. */
  delight: 0.25,
  /** Friends a night at most. */
  friendCap: 10,
  /** Helper's wage for a night. */
  wage: 12,
  /** Renown lost per guest let down (rounded up), and at most this much a night. */
  lossPer: 0.5,
  /** A delight always spreads at least this share of a ♥, however famous the stall. */
  gainFloor: 0.2,
  /** Helper's wage on top of `wage`, per expected guest. */
  wagePer: 1,
  /** Cold dishes are worth this much more with a cool box. */
  coolCold: 1.15,
  lossCap: 5,
  /** From this night (0-based) a kind of guest asks for a dish each night. */
  reqFrom: 5,
  /** The asked-for dish: worth × to that kind, and the tip each of them leaves when served it. */
  reqWorth: 1.4,
  reqTip: 14,
  /** At full renown, each ♥ that can't be added comes back as this many coins in regulars' tips. */
  fullTip: 25,
  /** Recipe and upgrade prices × (the listed `learn` / `cost` are the base). */
  learnMul: 2,
  upMul: 1.8,
  /** Guests of the asking kind who come just for the dish they asked for. */
  reqGuests: 3,
  /** A rival stall's night: passers-by ×, and worth × for the dishes it sells too (they compare). */
  rivalCrowd: 0.8,
  rivalWorth: 0.75,
  /** In the morning a nearly broke stall is topped up to this many coins by a neighbour. */
  safety: 30,
  /** Score = coins + repPts × renown. */
  repPts: 10,
};

/** Minutes the stall is open (18:00 to 22:00); nobody new joins the queue after LAST_CALL. */
export const OPEN_MINUTES = 240;
export const LAST_CALL = 225;
export const START_MENU = 3;
/** Minutes at the counter for ordering and paying, on top of the cooking. */
export const SERVE = 2;
export const MAX_PRICE = 40;

/** Score lines for one, two and three stars. */
export const STARS = [1500, 3400, 5000];
