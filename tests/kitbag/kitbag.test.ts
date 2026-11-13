import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  FLOORS,
  GEAR,
  MAX_GEAR,
  act,
  attackOf,
  enemyDef,
  intentOf,
  legalPlacements,
  makeMap,
  meets,
  newRun,
  placeError,
  previewPlace,
  replay,
  slotSentence,
  type GearId,
  type Run,
} from '../../src/kitbag/core';
import { botAction } from '../../scripts/kitbag/bot';

function playBot(seed: number): Run {
  const r = newRun(seed);
  for (let guard = 0; r.phase !== 'over' && guard < 20000; guard++) {
    const a = botAction(r);
    expect(act(r, a), `seed ${seed} action ${a}`).not.toBeNull();
  }
  return r;
}

/** A run standing in floor 1's fight with the given gear and dice values; the enemy is a harmless dummy unless an intent is set. */
function fightWith(gear: GearId[], values: number[], seed = 7): Run {
  const r = newRun(seed);
  r.gear = gear.map((id) => ({ id, up: false }));
  expect(act(r, 'M0')).not.toBeNull();
  const f = r.fight!;
  f.slots = r.gear.map((g) => (GEAR.find((d) => d.id === g.id)!.slots).map(() => ({ used: 0, fight: 0, held: -1, fuse: 0, vals: [] })));
  f.pool = values.map((v, i) => ({ v, src: Math.min(i, r.dice.length - 1), used: false, locked: false }));
  f.enemy.hp = f.enemy.max = 200;
  f.enemy.block = 0;
  return r;
}

describe('map', () => {
  it('has 12 floors, a boss on top, fights first, a rest or shrine mid-way, and something to fight on other floors', () => {
    for (let seed = 1; seed < 60; seed++) {
      const m = makeMap(seed);
      expect(m.length).toBe(FLOORS);
      expect(m[FLOORS - 1]).toEqual([{ kind: 'boss', foe: 'house' }]);
      expect(m[0].every((n) => n.kind === 'fight')).toBe(true);
      expect(m[5].map((n) => n.kind)).toEqual(['rest', 'shrine']);
      for (let f = 2; f < FLOORS - 2; f++) if (f !== 5) expect(m[f].some((n) => n.kind === 'fight' || n.kind === 'elite')).toBe(true);
      for (const row of m) for (const n of row) if (n.foe) expect(enemyDef(n.foe)).toBeTruthy();
    }
  });
});

describe('slots', () => {
  it('conditions', () => {
    expect(meets('le3', 3)).toBe(true);
    expect(meets('le3', 4)).toBe(false);
    expect(meets('even', 4)).toBe(true);
    expect(meets('odd', 4)).toBe(false);
    expect(meets('ge5', 5)).toBe(true);
    expect(meets('six', 5)).toBe(false);
  });

  it('a sword deals the die, a dagger only takes 3 or less and adds 3, block soaks first', () => {
    const r = fightWith(['sword', 'dagger', 'buckler'], [5, 4, 2]);
    expect(placeError(r, 1, 1, 0)).toBe('doesn’t fit');
    r.fight!.enemy.block = 3;
    expect(previewPlace(r, 0, 0, 0)!.dmg).toBe(2);
    act(r, 'P0.0.0');
    expect(r.fight!.enemy.hp).toBe(198);
    expect(r.fight!.enemy.block).toBe(0);
    act(r, 'P2.1.0');
    expect(r.fight!.enemy.hp).toBe(193);
    expect(placeError(r, 1, 0, 0)).toBe('used this turn');
    act(r, 'P1.2.0');
    expect(r.block).toBe(4);
  });

  it('two-dice slots wait for a partner; a pair needs equal values', () => {
    const r = fightWith(['twin', 'spear'], [3, 3, 5, 2]);
    expect(placeError(r, 2, 0, 0)).toBe('no matching die');
    act(r, 'P0.0.0');
    expect(r.fight!.slots[0][0].held).toBe(0);
    expect(r.fight!.enemy.hp).toBe(200);
    expect(placeError(r, 2, 0, 0)).toBe('needs another 3');
    act(r, 'P1.0.0');
    expect(r.fight!.enemy.hp).toBe(200 - 12);
    r.fight!.enemy.block = 10;
    act(r, 'P2.1.0');
    act(r, 'P3.1.0');
    expect(r.fight!.enemy.hp).toBe(188 - 7);
    expect(r.fight!.enemy.block).toBe(10);
  });

  it('transforms give the die back: split, flip, bump, reroll', () => {
    const r = fightWith(['chisel', 'hourglass', 'whet', 'coin', 'sword'], [5, 2, 4, 3]);
    expect(placeError(r, 0, 0, 0)).toBeNull();
    act(r, 'P0.0.0');
    expect(r.fight!.pool.slice(4).map((p) => p.v)).toEqual([2, 3]);
    act(r, 'P1.1.0');
    expect(r.fight!.pool[6].v).toBe(5);
    act(r, 'P2.2.0');
    expect(r.fight!.pool[7].v).toBe(5);
    act(r, 'P3.3.0');
    const v = r.fight!.pool[8].v;
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(6);
    // Undo and redo the reroll: the same result, so undo can't fish for numbers.
    act(r, 'U');
    expect(r.fight!.pool.length).toBe(8);
    act(r, 'P3.3.0');
    expect(r.fight!.pool[8].v).toBe(v);
  });

  it('a chisel will not split a 1', () => {
    const r = fightWith(['chisel'], [1, 4]);
    expect(placeError(r, 0, 0, 0)).toBe('doesn’t fit');
  });

  it('powder keg fills over turns and blows through block', () => {
    const r = fightWith(['keg'], [6, 4, 1]);
    r.fight!.enemy.block = 50;
    act(r, 'P0.0.0');
    act(r, 'P1.0.0');
    expect(r.fight!.slots[0][0].fuse).toBe(10);
    act(r, 'P2.0.0');
    expect(r.fight!.slots[0][0].fuse).toBe(10 + 1);
    r.fight!.pool.push({ v: 3, src: 0, used: false, locked: false });
    const o = act(r, 'P3.0.0')!;
    expect(o.effect!.boom).toBe(true);
    expect(r.fight!.enemy.hp).toBe(180);
    expect(r.fight!.slots[0][0].fuse).toBe(0);
  });

  it('spiked shield blocks and deals; net stuns once a fight', () => {
    const r = fightWith(['spiked', 'net'], [4, 6]);
    act(r, 'P0.0.0');
    expect(r.block).toBe(4);
    expect(r.fight!.enemy.hp).toBe(197);
    act(r, 'P1.1.0');
    expect(r.fight!.enemy.stunned).toBe(true);
    const hp = r.hp;
    act(r, 'E');
    expect(r.hp).toBe(hp);
    expect(r.fight!.enemy.stunned).toBe(false);
    r.fight!.pool[0].v = 6;
    expect(placeError(r, 0, 1, 0)).toBe('once a fight');
  });

  it('every card has a sentence for the help', () => {
    for (const g of GEAR) for (const s of [...g.slots, ...g.up]) expect(slotSentence(s).length).toBeGreaterThan(8);
  });
});

describe('enemy intents', () => {
  it('attacks are soaked by block, which clears on your next turn', () => {
    const r = fightWith(['buckler'], [5]);
    const e = r.fight!.enemy;
    e.id = 'ogre';
    e.step = 0; // atk 14
    act(r, 'P0.0.0');
    const hp = r.hp;
    act(r, 'E');
    expect(r.hp).toBe(hp - (attackOf({ ...e, step: 0 }, enemyDef('ogre').pattern[0]) - 5));
    expect(r.block).toBe(0);
    // Next: strength +2 and block 8.
    act(r, 'E');
    expect(e.str).toBe(2);
    expect(e.block).toBe(8);
    expect(attackOf(e, intentOf(e))).toBe((9 + 2) * 2);
  });

  it('hex locks your highest die next turn, wither lowers the roll', () => {
    const r = fightWith(['sword'], [1, 1, 1]);
    r.fight!.enemy.id = 'wraith';
    r.fight!.enemy.step = 2; // hex 2 + atk
    act(r, 'E');
    const f = r.fight!;
    expect(f.pool.filter((p) => p.locked).length).toBe(2);
    const free = f.pool.find((p) => !p.locked)!;
    for (const p of f.pool) if (p.locked) expect(p.v).toBeGreaterThanOrEqual(free.v);
    expect(placeError(r, f.pool.findIndex((p) => p.locked), 0, 0)).toBe('that die is hexed');
    // Next intent: atk 9×2; then wither 2.
    r.hp = 999;
    act(r, 'E');
    const before = replay(r.seed, r.actions);
    act(r, 'E');
    expect(r.fight!.withered).toBe(2);
    expect(before.fight!.withered).toBe(0);
    for (const p of r.fight!.pool) expect(p.v).toBeGreaterThanOrEqual(1);
  });

  it('poison ticks at the start of the turn and wears off', () => {
    const r = fightWith(['sword'], [1]);
    r.fight!.enemy.id = 'toad';
    r.fight!.enemy.step = 0; // atk 4 + poison 2
    const hp = r.hp;
    act(r, 'E');
    expect(r.hp).toBe(hp - 4 - 2);
    expect(r.poison).toBe(1);
  });

  it('a charge winds up, then the blow comes', () => {
    const r = fightWith(['sword'], [1]);
    const e = r.fight!.enemy;
    e.id = 'knight';
    e.step = 1;
    expect(intentOf(e).charge).toBe(true);
    const hp = r.hp;
    act(r, 'E');
    expect(r.hp).toBe(hp);
    expect(attackOf(e, intentOf(e))).toBe(24);
  });

  it('every enemy pattern does something each step', () => {
    for (const e of ENEMIES) for (const it of e.pattern) expect(Object.keys(it).length).toBeGreaterThan(0);
  });
});

describe('runs', () => {
  it('undo only reaches back within the turn', () => {
    const r = fightWith(['sword', 'buckler'], [3, 4]);
    expect(act(r, 'U')).toBeNull();
    act(r, 'P0.0.0');
    act(r, 'E');
    expect(act(r, 'U')).toBeNull();
  });

  it('elite fights give two picks; a full kit asks what to replace', () => {
    const r = newRun(3);
    r.gear = ['sword', 'buckler', 'dagger', 'axe', 'ward', 'sling'].map((id) => ({ id: id as GearId, up: false }));
    expect(r.gear.length).toBe(MAX_GEAR);
    r.map[0][0] = { kind: 'elite', foe: 'ratking' };
    act(r, 'M0');
    r.fight!.enemy.hp = 1;
    r.fight!.pool[0].v = 6;
    r.fight!.pool[0].locked = false;
    expect(act(r, 'P0.0.0')!.fightWon).toBe(true);
    expect(r.phase).toBe('choice');
    expect(r.choice!.more).toBe(1);
    const k = r.choice!.options.findIndex((o) => o.gifts[0].t === 'gear');
    expect(act(r, `C${k}`)).toBeNull();
    expect(act(r, `C${k}.2`)).not.toBeNull();
    expect(r.gear.length).toBe(MAX_GEAR);
    expect(r.phase).toBe('choice');
    act(r, 'S');
    expect(r.phase).toBe('map');
    expect(r.floor).toBe(1);
  });

  it('bot runs end cleanly and replay exactly from seed + actions', () => {
    let wins = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = playBot(seed);
      expect(r.phase).toBe('over');
      if (r.won) wins++;
      const again = replay(seed, r.actions);
      expect(JSON.stringify(again)).toBe(JSON.stringify(r));
    }
    // The bot clears the early floors nearly always and wins sometimes.
    expect(wins).toBeGreaterThan(0);
    expect(wins).toBeLessThan(25);
  });

  it('bots reach the second stage almost always', () => {
    let deep = 0;
    for (let seed = 100; seed < 140; seed++) if (playBot(seed).floor >= 4) deep++;
    expect(deep).toBeGreaterThanOrEqual(36);
  });

  it('illegal actions change nothing', () => {
    const r = newRun(5);
    const before = JSON.stringify(r);
    for (const a of ['E', 'P0.0.0', 'C0', 'U', 'M7', 'S', 'Q', 'M']) expect(act(r, a)).toBeNull();
    expect(JSON.stringify(r)).toBe(before);
    act(r, 'M1');
    expect(legalPlacements(r).length).toBeGreaterThan(0);
    const mid = JSON.stringify(r);
    for (const a of ['P9.0.0', 'P0.9.0', 'P0.0.4', 'M0', 'C0']) expect(act(r, a)).toBeNull();
    expect(JSON.stringify(r)).toBe(mid);
  });
});
