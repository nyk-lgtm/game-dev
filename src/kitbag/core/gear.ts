// Gear cards and dice. Every card has one or two action slots; a slot takes a
// die (or two) that meets its condition and turns it into an effect. Upgraded
// cards ("+") swap in their `up` slots.

/** What a slot accepts. `pair` and `two` take two dice (pair: equal values). */
export type Cond = 'any' | 'even' | 'odd' | 'le2' | 'le3' | 'ge2' | 'ge4' | 'ge5' | 'six' | 'pair' | 'two';

/**
 * What a slot does with the dice's sum X:
 *   dmg     deal mult·X + add (enemy block soaks it first)
 *   pierce  the same, ignoring block
 *   block   gain mult·X + add block until your next turn
 *   spike   gain mult·X block and deal `add`
 *   heal    heal mult·X + add
 *   poison  give the enemy ⌈mult·X⌉ + add poison (it loses that much at the start of its turn, then 1 less)
 *   reroll  the die comes back rerolled
 *   split   a die of 2+ comes back as two dice (⌊X/2⌋ and ⌈X/2⌉)
 *   flip    the die comes back upside down (7 − X)
 *   bump    the die comes back as X + add (at most 9)
 *   stun    the enemy skips its next action
 *   keg     X goes into the fuse; when the fuse reaches `fuse`, deal `add` (ignores block)
 */
export type Fx = 'dmg' | 'pierce' | 'block' | 'spike' | 'heal' | 'poison' | 'reroll' | 'split' | 'flip' | 'bump' | 'stun' | 'keg';

export interface SlotDef {
  need: Cond;
  fx: Fx;
  mult: number;
  add: number;
  /** Uses per turn; 0 = any number. */
  uses: number;
  /** Uses per fight (0 = no limit). */
  perFight?: number;
  /** Powder Keg: fuse length. */
  fuse?: number;
}

export interface GearDef {
  id: GearId;
  name: string;
  icon: string;
  rarity: 1 | 2 | 3;
  slots: SlotDef[];
  up: SlotDef[];
}

export type GearId =
  | 'sword' | 'buckler' | 'dagger' | 'axe' | 'ward' | 'sling' | 'coin' | 'whet' | 'spiked'
  | 'maul' | 'tower' | 'spear' | 'fang' | 'hourglass' | 'chisel' | 'salve'
  | 'twin' | 'net' | 'keg';

const s = (need: Cond, fx: Fx, mult: number, add: number, uses = 1, extra: Partial<SlotDef> = {}): SlotDef => ({ need, fx, mult, add, uses, ...extra });

export const GEAR: GearDef[] = [
  { id: 'sword', name: 'Sword', icon: '🗡️', rarity: 1, slots: [s('any', 'dmg', 1, 0)], up: [s('any', 'dmg', 1, 2)] },
  { id: 'buckler', name: 'Buckler', icon: '🛡️', rarity: 1, slots: [s('any', 'block', 1, 1)], up: [s('any', 'block', 1, 3)] },
  { id: 'dagger', name: 'Dagger', icon: '🔪', rarity: 1, slots: [s('le3', 'dmg', 1, 3)], up: [s('le3', 'dmg', 1, 3, 2)] },
  { id: 'axe', name: 'Hand Axe', icon: '🪓', rarity: 1, slots: [s('even', 'dmg', 1, 2)], up: [s('even', 'dmg', 1, 4)] },
  { id: 'ward', name: 'Ward', icon: '🧿', rarity: 1, slots: [s('odd', 'block', 1, 2)], up: [s('odd', 'block', 1, 4)] },
  { id: 'sling', name: 'Sling', icon: '🪃', rarity: 1, slots: [s('le2', 'dmg', 1, 5)], up: [s('le2', 'dmg', 1, 5, 2)] },
  { id: 'coin', name: 'Lucky Coin', icon: '🪙', rarity: 1, slots: [s('any', 'reroll', 0, 0)], up: [s('any', 'reroll', 0, 0, 2)] },
  { id: 'whet', name: 'Whetstone', icon: '🪨', rarity: 1, slots: [s('any', 'bump', 0, 2)], up: [s('any', 'bump', 0, 2, 2)] },
  { id: 'spiked', name: 'Spiked Shield', icon: '🌵', rarity: 1, slots: [s('even', 'spike', 1, 3)], up: [s('even', 'spike', 1, 5)] },
  { id: 'maul', name: 'Maul', icon: '🔨', rarity: 2, slots: [s('ge5', 'dmg', 2, 0)], up: [s('ge4', 'dmg', 2, 0)] },
  { id: 'tower', name: 'Tower Shield', icon: '🏰', rarity: 2, slots: [s('ge4', 'block', 1, 4)], up: [s('ge4', 'block', 1, 7)] },
  { id: 'spear', name: 'Spear', icon: '🔱', rarity: 2, slots: [s('two', 'pierce', 1, 0)], up: [s('two', 'pierce', 1, 4)] },
  { id: 'fang', name: 'Viper Fang', icon: '🐍', rarity: 2, slots: [s('odd', 'poison', 0.5, 1)], up: [s('any', 'poison', 0.5, 1)] },
  { id: 'hourglass', name: 'Hourglass', icon: '⏳', rarity: 2, slots: [s('any', 'flip', 0, 0)], up: [s('any', 'flip', 0, 0, 2)] },
  { id: 'chisel', name: 'Chisel', icon: '⛏️', rarity: 2, slots: [s('ge2', 'split', 0, 0)], up: [s('ge2', 'split', 0, 0, 2)] },
  { id: 'salve', name: 'Salve', icon: '🌿', rarity: 2, slots: [s('le3', 'heal', 0, 4, 1, { perFight: 2 })], up: [s('le3', 'heal', 0, 6, 1, { perFight: 2 })] },
  { id: 'twin', name: 'Twinblade', icon: '⚔️', rarity: 3, slots: [s('pair', 'dmg', 1, 6)], up: [s('pair', 'dmg', 1, 10)] },
  { id: 'net', name: 'Net', icon: '🕸️', rarity: 3, slots: [s('six', 'stun', 0, 0, 1, { perFight: 1 })], up: [s('ge5', 'stun', 0, 0, 1, { perFight: 1 })] },
  { id: 'keg', name: 'Powder Keg', icon: '💣', rarity: 3, slots: [s('any', 'keg', 0, 20, 0, { fuse: 12 })], up: [s('any', 'keg', 0, 20, 0, { fuse: 9 })] },
];

const BY_ID = new Map(GEAR.map((g) => [g.id, g]));
export const gearDef = (id: GearId): GearDef => BY_ID.get(id)!;

export interface Gear {
  id: GearId;
  up: boolean;
}

export const slotsOf = (g: Gear): SlotDef[] => (g.up ? gearDef(g.id).up : gearDef(g.id).slots);
export const gearName = (g: Gear): string => gearDef(g.id).name + (g.up ? '+' : '');

/** How many dice a slot takes. */
export const diceFor = (c: Cond): 1 | 2 => (c === 'pair' || c === 'two' ? 2 : 1);

/** A single die value meets the condition (for two-dice slots, each die on its own). */
export function meets(c: Cond, v: number): boolean {
  switch (c) {
    case 'any':
    case 'pair':
    case 'two':
      return true;
    case 'even':
      return v % 2 === 0;
    case 'odd':
      return v % 2 === 1;
    case 'le2':
      return v <= 2;
    case 'le3':
      return v <= 3;
    case 'ge2':
      return v >= 2;
    case 'ge4':
      return v >= 4;
    case 'ge5':
      return v >= 5;
    case 'six':
      return v === 6;
  }
}

export const COND_LABEL: Record<Cond, string> = {
  any: 'any', even: 'even', odd: 'odd', le2: '≤2', le3: '≤3', ge2: '2+', ge4: '4+', ge5: '5+', six: '6', pair: 'pair', two: '2 dice',
};

/** The effect as a formula, e.g. "Deal X+3", "Block X", "Reroll". */
export function fxText(d: SlotDef): string {
  const x = (m: number, a: number) => `${m === 1 ? 'X' : m === 0.5 ? '½X' : `${m}X`}${a ? `+${a}` : ''}`;
  switch (d.fx) {
    case 'dmg':
      return `Deal ${x(d.mult, d.add)}`;
    case 'pierce':
      return `Pierce ${x(d.mult, d.add)}`;
    case 'block':
      return `Block ${x(d.mult, d.add)}`;
    case 'spike':
      return `Block X, deal ${d.add}`;
    case 'heal':
      return `Heal ${d.add}`;
    case 'poison':
      return `Poison ${x(d.mult, d.add)}`;
    case 'reroll':
      return 'Reroll';
    case 'split':
      return 'Split';
    case 'flip':
      return 'Flip';
    case 'bump':
      return `+${d.add}`;
    case 'stun':
      return 'Stun';
    case 'keg':
      return `Fuse ${d.fuse}: ${d.add}`;
  }
}

/** A sentence for help and reward cards. */
export function slotSentence(d: SlotDef): string {
  const need =
    d.need === 'pair' ? 'Two equal dice' : d.need === 'two' ? 'Any two dice' : d.need === 'any' ? 'Any die' : d.need === 'six' ? 'A 6' : `A die of ${COND_LABEL[d.need]}`;
  const x = (m: number, a: number) => `${m === 1 ? 'its value' : m === 0.5 ? 'half its value (round up)' : `${m}× its value`}${a ? ` + ${a}` : ''}`;
  const sum = d.need === 'pair' || d.need === 'two' ? (a: number) => `their sum${a ? ` + ${a}` : ''}` : (a: number) => x(d.mult, a);
  let eff = '';
  switch (d.fx) {
    case 'dmg':
      eff = `deal ${sum(d.add)} damage`;
      break;
    case 'pierce':
      eff = `deal ${sum(d.add)} damage, ignoring block`;
      break;
    case 'block':
      eff = `block ${sum(d.add)}`;
      break;
    case 'spike':
      eff = `block its value and deal ${d.add}`;
      break;
    case 'heal':
      eff = `heal ${d.add} (past full HP it blocks instead)`;
      break;
    case 'poison':
      eff = `poison ${x(d.mult, d.add)}`;
      break;
    case 'reroll':
      eff = 'reroll it (it comes back)';
      break;
    case 'split':
      eff = 'split it in two halves (e.g. 5 → 2 and 3)';
      break;
    case 'flip':
      eff = 'turn it upside down (1↔6, 2↔5, 3↔4)';
      break;
    case 'bump':
      eff = `raise it by ${d.add} (up to 9)`;
      break;
    case 'stun':
      eff = 'stun: the enemy skips its next action';
      break;
    case 'keg':
      eff = `fill the fuse; at ${d.fuse} it blows for ${d.add}, ignoring block (any number of dice)`;
      break;
  }
  const uses = d.uses === 0 ? '' : d.uses > 1 ? ` ${d.uses}× a turn.` : '';
  const per = d.perFight ? ` ${d.perFight === 1 ? 'Once' : `${d.perFight}×`} a fight.` : '';
  return `${need}: ${eff}.${uses}${per}`;
}

// ---------------------------------------------------------------- dice

export type DieKind = 'd6' | 'd8' | 'loaded' | 'even' | 'pebble' | 'chance';

export interface DieDef {
  kind: DieKind;
  name: string;
  faces: number[];
  text: string;
}

export const DICE: DieDef[] = [
  { kind: 'd6', name: 'Bone die', faces: [1, 2, 3, 4, 5, 6], text: 'A plain d6, like the three you started with.' },
  { kind: 'd8', name: 'Iron d8', faces: [1, 2, 3, 4, 5, 6, 7, 8], text: 'Eight faces, 1 to 8.' },
  { kind: 'loaded', name: 'Weighted die', faces: [3, 4, 4, 5, 5, 6], text: 'Faces 3 4 4 5 5 6.' },
  { kind: 'even', name: 'Even die', faces: [2, 2, 4, 4, 6, 6], text: 'Faces 2 2 4 4 6 6.' },
  { kind: 'pebble', name: 'Pebble die', faces: [1, 1, 2, 2, 3, 3], text: 'Faces 1 1 2 2 3 3: food for Daggers and Slings.' },
  { kind: 'chance', name: 'Chance die', faces: [1, 1, 1, 6, 6, 6], text: 'Faces 1 1 1 6 6 6: all or nothing.' },
];
const DIE_BY = new Map(DICE.map((d) => [d.kind, d]));
export const dieDef = (k: DieKind): DieDef => DIE_BY.get(k)!;

export interface Die {
  kind: DieKind;
  faces: number[];
}
