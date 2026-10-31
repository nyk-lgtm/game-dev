// Numbers and words: monster stats, gear, prices, levels, dialogue.

import type { Action, GameState, MonsterKind, NpcId } from './types';

export interface MonsterDef {
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  gold: [number, number];
  /** How far it notices you (needs line of sight). */
  sight: number;
  /** Chance per turn to flit randomly instead of chasing. */
  erratic: number;
  blurb: string;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat: { name: 'rat', glyph: 'r', hp: 4, atk: 2, def: 0, xp: 2, gold: [0, 1], sight: 5, erratic: 0, blurb: 'A fat rat. Mostly teeth.' },
  wolf: { name: 'wolf', glyph: 'w', hp: 9, atk: 4, def: 0, xp: 5, gold: [0, 0], sight: 7, erratic: 0, blurb: 'Grey wolf. It has your scent.' },
  goblin: { name: 'goblin', glyph: 'g', hp: 10, atk: 3, def: 1, xp: 6, gold: [2, 5], sight: 6, erratic: 0, blurb: 'A goblin with a rusty knife and a full purse.' },
  bat: { name: 'bat', glyph: 'b', hp: 5, atk: 3, def: 0, xp: 3, gold: [0, 1], sight: 6, erratic: 0.5, blurb: 'Flits about wildly. Hard to pin down.' },
  spider: { name: 'spider', glyph: 's', hp: 12, atk: 5, def: 1, xp: 8, gold: [0, 2], sight: 5, erratic: 0, blurb: 'A cave spider the size of a dog.' },
  skeleton: { name: 'skeleton', glyph: 'k', hp: 16, atk: 6, def: 2, xp: 12, gold: [3, 6], sight: 6, erratic: 0, blurb: 'Old bones that remember how to fight.' },
  king: { name: 'Hollow King', glyph: 'K', hp: 45, atk: 9, def: 3, xp: 50, gold: [30, 30], sight: 7, erratic: 0, blurb: 'A crown of black iron. The Ember glows in his chest.' },
};

export const WEAPONS = { dagger: { name: 'Dagger', atk: 0 }, sword: { name: 'Sword', atk: 3 }, axe: { name: 'Iron Axe', atk: 5 } };
export const ARMORS = { cloth: { name: 'Cloth', def: 0 }, leather: { name: 'Leather', def: 1 }, chain: { name: 'Chain Mail', def: 3 } };
export const PRICES = { sword: 20, leather: 12, chain: 25, potion: 6, rest: 2 };
export const POTION_HEAL = 12;
/** Total XP needed to reach level i + 1 (index 0 = level 1). */
export const XP_TABLE = [0, 10, 25, 45, 70, 100, 135, 175, 220, 270];

export const NPC_NAMES: Record<NpcId, string> = {
  elder: 'Elder Wenna',
  smith: 'Bram the Smith',
  healer: 'Mira the Healer',
  child: 'Pip',
  hermit: 'The Hermit',
};

export interface Dialogue {
  name: string;
  text: string;
  options: { label: string; action: Action; enabled: boolean }[];
}

/** What an NPC says right now (after the talk itself has been applied). */
export function dialogue(s: GameState, npc: NpcId): Dialogue {
  const p = s.player;
  const name = NPC_NAMES[npc];
  switch (npc) {
    case 'elder':
      if (s.quest === 'won')
        return { name, text: 'The Lantern burns again, and Emberwick is warm. You will always have a place by our fire.', options: [] };
      if (s.quest === 'ember')
        return { name, text: 'You did it!', options: [] };
      return {
        name,
        text:
          'The Lantern has gone cold, and the village with it. The Hollow King took our last Ember down into the Hollow, east past the river and north into the rocks. Bring it home. Bram and Mira will help you prepare.',
        options: [],
      };
    case 'smith': {
      const opt = (item: 'sword' | 'leather' | 'chain', label: string, owned: boolean) => ({
        label: `${label} — ${PRICES[item]}g${owned ? ' (owned)' : ''}`,
        action: { type: 'buy', item } as Action,
        enabled: !owned && p.gold >= PRICES[item],
      });
      return {
        name,
        text: 'Steel for the dark? I have a little left.',
        options: [
          opt('sword', 'Sword (+3 attack)', p.weapon !== 'dagger'),
          opt('leather', 'Leather armor (+1 defence)', p.armor !== 'cloth'),
          opt('chain', 'Chain mail (+3 defence)', p.armor === 'chain'),
        ],
      };
    }
    case 'healer':
      return {
        name,
        text: p.hp < p.maxHp ? 'You look battered. Sit a while.' : 'Stay safe out there. Potions keep the dark at bay.',
        options: [
          { label: `Rest (full health) — ${PRICES.rest}g`, action: { type: 'rest' }, enabled: p.hp < p.maxHp && p.gold >= PRICES.rest },
          { label: `Potion (+${POTION_HEAL} health) — ${PRICES.potion}g`, action: { type: 'buy', item: 'potion' }, enabled: p.gold >= PRICES.potion },
        ],
      };
    case 'child':
      return {
        name,
        text:
          s.quest === 'none'
            ? 'The Elder wants you! Her house is up the road, the one on the left.'
            : 'Walk into monsters to fight them. Drink a potion when you are hurt. And kill rats for me!',
        options: [],
      };
    case 'hermit':
      return {
        name,
        text: 'Going to the Hollow? The dark below eats careless lanterns. The skeletons hit hard: fight them in corridors, one at a time.',
        options: [],
      };
  }
}

export const LANTERN_TEXT = {
  cold: 'The village Lantern. Cold iron and dead glass.',
  lit: 'The village Lantern blazes with the Ember’s light.',
};
