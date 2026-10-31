import { MONSTERS, SIZE, applyAction, newGame, type Action, type Dir, type GameState, type ItemKind, type MonsterKind, type StepResult, type Tile } from '../../src/delve/core';

const TILES: Record<string, Tile> = { '#': 'wall', '.': 'floor', '+': 'door', "'": 'open', '>': 'stairs', O: 'pillar' };
const MONSTER_CHARS: Record<string, MonsterKind> = { r: 'rat', b: 'bat', s: 'skeleton', a: 'archer', l: 'slime', g: 'ghoul', w: 'wraith', m: 'mage', G: 'golem', W: 'warden' };
const ITEM_CHARS: Record<string, ItemKind> = { '!': 'potion', '?': 'ether', $: 'gold', ')': 'weapon', '[': 'armor' };

export interface SetupOpts {
  dir?: Dir;
  /** Monsters start awake (default true). */
  awake?: boolean;
  /** Value for weapon/armor/gold items. */
  itemValue?: number;
  seed?: number;
}

/**
 * A hand-drawn test floor in the top-left of an all-wall map.
 * `#` wall, `.` floor, `+` door, `'` open door, `>` stairs, `O` pillar, `@` player,
 * monsters r b s a l g w m G W, items ! ? $ ) [ (all standing on floor).
 */
export function setup(rows: string[], opts: SetupOpts = {}): GameState {
  const s = newGame(opts.seed ?? 1);
  s.level.tiles = new Array(SIZE * SIZE).fill('wall');
  s.level.seen = new Array(SIZE * SIZE).fill(false);
  s.monsters = [];
  s.items = [];
  s.log = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const k = (y + 1) * SIZE + (x + 1);
      if (c === ' ') return;
      if (TILES[c]) s.level.tiles[k] = TILES[c];
      else {
        s.level.tiles[k] = 'floor';
        if (c === '@') {
          s.player.x = x + 1;
          s.player.y = y + 1;
        } else if (MONSTER_CHARS[c]) s.monsters.push(monster(s, MONSTER_CHARS[c], x + 1, y + 1, opts.awake ?? true));
        else if (ITEM_CHARS[c]) s.items.push({ id: s.nextId++, kind: ITEM_CHARS[c], x: x + 1, y: y + 1, value: opts.itemValue ?? (c === '$' ? 10 : 1) });
        else throw new Error(`bad map char ${c}`);
      }
    }),
  );
  s.player.dir = opts.dir ?? 1;
  return s;
}

function monster(s: GameState, kind: MonsterKind, x: number, y: number, awake: boolean) {
  return { id: s.nextId++, kind, x, y, hp: MONSTERS[kind].hp, maxHp: MONSTERS[kind].hp, wait: 0, awake, stun: 0 };
}

/** Map coordinates of a drawn cell (the drawing starts at 1,1). */
export const cell = (x: number, y: number) => ({ x: x + 1, y: y + 1 });

export function act(s: GameState, ...actions: (Action | Action['type'])[]): StepResult {
  let r: StepResult = { state: s, events: [] };
  const events: StepResult['events'] = [];
  for (const a of actions) {
    r = applyAction(r.state, typeof a === 'string' ? ({ type: a } as Action) : a);
    events.push(...r.events);
  }
  return { state: r.state, events };
}

export const cast = (spell: 'fire' | 'frost' | 'heal' | 'blink'): Action => ({ type: 'cast', spell });

/** Same state with a different roll counter (a different random stream). */
export function reroll(s: GameState, rolls: number): GameState {
  const c = structuredClone(s);
  c.rolls = rolls;
  return c;
}
