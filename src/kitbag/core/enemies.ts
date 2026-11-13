// Enemies: hit points and a cycle of telegraphed intents. Each fight starts the
// cycle at a seeded step; the intent for the coming enemy turn is always shown.

/** One enemy action. Several parts may combine (attack and block, attack and hex…). */
export interface Intent {
  /** Damage per hit (plus the enemy's strength). */
  atk?: number;
  /** Number of hits (default 1). */
  hits?: number;
  block?: number;
  /** Your highest dice next turn come up locked. */
  hex?: number;
  /** Your dice roll this much lower next turn (never below 1). */
  wither?: number;
  /** Poison on you: lose that much at the start of your turn, then 1 less. */
  poison?: number;
  heal?: number;
  /** Strength: every later attack hits this much harder. */
  buff?: number;
  /** Winding up: does nothing now (the next intent is the blow). */
  charge?: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  /** 1-3 for ordinary fights by stage, 4-6 elites, 9 the boss. */
  tier: number;
  pattern: Intent[];
}

export const ENEMIES: EnemyDef[] = [
  // Stage 1 (floors 1-4).
  { id: 'rat', name: 'Gutter Rat', icon: '🐀', hp: 15, tier: 1, pattern: [{ atk: 4 }, { atk: 3, hits: 2 }, { atk: 5 }] },
  { id: 'slime', name: 'Bog Slime', icon: '🫧', hp: 20, tier: 1, pattern: [{ atk: 5 }, { block: 5, atk: 2 }, { atk: 6 }] },
  { id: 'cutpurse', name: 'Cutpurse', icon: '🥷', hp: 17, tier: 1, pattern: [{ atk: 6 }, { hex: 1, atk: 3 }, { atk: 7 }] },
  { id: 'moths', name: 'Moth Swarm', icon: '🦋', hp: 15, tier: 1, pattern: [{ atk: 2, hits: 3 }, { wither: 1, atk: 3 }, { atk: 2, hits: 2 }] },
  { id: 'toad', name: 'Cave Toad', icon: '🐸', hp: 19, tier: 1, pattern: [{ atk: 4, poison: 2 }, { block: 6 }, { atk: 7 }] },
  // Stage 2 (floors 5-8).
  { id: 'knight', name: 'Grave Knight', icon: '💀', hp: 45, tier: 2, pattern: [{ block: 10, atk: 9 }, { charge: true }, { atk: 24 }] },
  { id: 'witch', name: 'Hedge Witch', icon: '🧙', hp: 38, tier: 2, pattern: [{ hex: 1, atk: 9 }, { poison: 4, atk: 5 }, { atk: 14 }, { heal: 8, block: 6 }] },
  { id: 'ogre', name: 'Ogre', icon: '👹', hp: 51, tier: 2, pattern: [{ atk: 14 }, { buff: 2, block: 8 }, { atk: 9, hits: 2 }] },
  { id: 'spider', name: 'Cellar Spider', icon: '🕷️', hp: 36, tier: 2, pattern: [{ poison: 4, atk: 6 }, { atk: 8, hits: 2 }, { block: 9, wither: 1 }] },
  { id: 'bandit', name: 'Highwayman', icon: '🤠', hp: 42, tier: 2, pattern: [{ atk: 13 }, { atk: 6, hits: 3 }, { block: 8, hex: 1 }] },
  // Stage 3 (floors 9-11).
  { id: 'golem', name: 'Stone Golem', icon: '🗿', hp: 80, tier: 3, pattern: [{ block: 15 }, { atk: 24 }, { atk: 12, block: 8 }] },
  { id: 'wraith', name: 'Wraith', icon: '👻', hp: 63, tier: 3, pattern: [{ atk: 9, hits: 2 }, { wither: 2, atk: 7 }, { hex: 2, atk: 10 }] },
  { id: 'wyvern', name: 'Wyvern', icon: '🐉', hp: 69, tier: 3, pattern: [{ atk: 9, poison: 4 }, { charge: true }, { atk: 32 }] },
  { id: 'mimic', name: 'Mimic', icon: '🧰', hp: 65, tier: 3, pattern: [{ block: 12, buff: 3 }, { atk: 15 }, { atk: 7, hits: 3 }] },
  // Elites.
  { id: 'ratking', name: 'Rat King', icon: '👑', hp: 44, tier: 4, pattern: [{ atk: 5, hits: 2 }, { buff: 2, block: 8 }, { atk: 11 }] },
  { id: 'warden', name: 'Iron Warden', icon: '⚙️', hp: 70, tier: 5, pattern: [{ block: 14, atk: 8 }, { charge: true }, { atk: 25 }, { hex: 1, atk: 10 }] },
  { id: 'lich', name: 'Lich', icon: '☠️', hp: 90, tier: 6, pattern: [{ wither: 2, atk: 11 }, { poison: 4, block: 10 }, { atk: 9, hits: 2 }, { heal: 12, hex: 1 }] },
  // The boss.
  {
    id: 'house',
    name: 'The House',
    icon: '🎩',
    hp: 176,
    tier: 9,
    pattern: [{ atk: 14, hex: 1 }, { block: 16, buff: 2 }, { atk: 6, hits: 3 }, { wither: 2, atk: 11 }, { charge: true }, { atk: 36 }],
  },
];

const BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));
export const enemyDef = (id: string): EnemyDef => BY_ID.get(id)!;
export const enemiesOfTier = (t: number): EnemyDef[] => ENEMIES.filter((e) => e.tier === t);
