import { describe, expect, it } from 'vitest';
import {
  PRICES,
  ARMORS,
  DIRS8,
  LANTERN_TEXT,
  MAPS,
  MONSTERS,
  Rng,
  WEAPONS,
  WORLD,
  XP_TABLE,
  addPos,
  applyAction,
  arrivalPos,
  attackOf,
  chebyshev,
  decodeAction,
  defenceOf,
  dialogue,
  encodeAction,
  fov,
  inMap,
  isLegal,
  los,
  markerAt,
  markerPos,
  monsterAt,
  newGame,
  passable,
  pathTo,
  replay,
  samePos,
  terrainAt,
  type Action,
  type GameState,
  type MapId,
  type Monster,
  type MonsterKind,
  type Pos,
  type StepResult,
} from '../../src/lantern/core';
import { playCompletion } from '../../scripts/lantern/bot';

const MAP_IDS = Object.keys(MAPS) as MapId[];
const step = (dir: number): Action => ({ type: 'step', dir });
const WAIT: Action = { type: 'wait' };
const dirTo = (a: Pos, b: Pos) => DIRS8.findIndex((d) => d.x === b.x - a.x && d.y === b.y - a.y);
const cellsOf = (id: MapId) => {
  const m = WORLD[id];
  const out: Pos[] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) out.push({ x, y });
  return out;
};

/** A fresh game with the player at `pos` on `map` and only the given monsters alive. */
function setup(map: MapId, pos: Pos, monsters: [MonsterKind, Pos][] = []): GameState {
  const s = newGame(1);
  s.player.map = map;
  s.player.pos = { ...pos };
  s.monsters = monsters.map(([kind, p], i) => ({ id: 100 + i, kind, map, pos: { ...p }, hp: MONSTERS[kind].hp }));
  return s;
}
const mon = (s: GameState, i = 0): Monster => s.monsters[i];

/** Try roll counters until the outcome matches; dice are fully seeded so this is deterministic. */
function withRoll(s: GameState, a: Action, ok: (r: StepResult) => boolean): StepResult {
  for (let k = 0; k < 500; k++) {
    const t = structuredClone(s);
    t.rolls = k;
    const r = applyAction(t, a);
    if (ok(r)) return r;
  }
  throw new Error('no roll produced the wanted outcome');
}
const hits = (onPlayer: boolean) => (r: StepResult) => r.events.some((e) => e.type === 'hit' && e.onPlayer === onPlayer);

describe('maps', () => {
  it('every row of a map has the same length', () => {
    for (const id of MAP_IDS) {
      const rows = MAPS[id].rows;
      for (const r of rows) expect(r.length, `${id}: "${r}"`).toBe(rows[0].length);
    }
  });

  it('from every arrival point, all exits, NPCs, chests, signs and monsters are reachable', () => {
    for (const id of MAP_IDS) {
      const m = WORLD[id];
      const starts: Pos[] = id === 'village' ? [markerPos(m, '@')] : [];
      for (const other of MAP_IDS)
        for (const { marker } of WORLD[other].markers.values())
          if (marker.kind === 'exit' && marker.to === id) starts.push(arrivalPos(m, marker.entry));
      expect(starts.length, id).toBeGreaterThan(0);
      for (const start of starts) {
        // 8-way flood over passable ground; stepping on an exit leaves the map, so don't expand through one.
        const reach = new Set<string>([`${start.x},${start.y}`]);
        const q = [start];
        for (let i = 0; i < q.length; i++)
          for (const d of DIRS8) {
            const n = addPos(q[i], d);
            const k = `${n.x},${n.y}`;
            if (reach.has(k) || !passable(m, n)) continue;
            reach.add(k);
            if (markerAt(m, n)?.kind !== 'exit') q.push(n);
          }
        const at = (p: Pos) => reach.has(`${p.x},${p.y}`);
        const nextTo = (p: Pos) => DIRS8.some((d) => at(addPos(p, d)));
        for (const [i, { char, marker }] of m.markers) {
          const p = { x: i % m.w, y: Math.floor(i / m.w) };
          const ok = marker.kind === 'exit' || marker.kind === 'spawn' ? at(p) : nextTo(p);
          expect(ok, `${id} ${marker.kind} '${char}' at ${p.x},${p.y} from ${start.x},${start.y}`).toBe(true);
        }
        for (const mo of m.monsters) expect(at(mo.pos), `${id} ${mo.kind} at ${mo.pos.x},${mo.pos.y}`).toBe(true);
      }
    }
  });

  it('exits pair up both ways', () => {
    for (const id of MAP_IDS)
      for (const { char, marker } of WORLD[id].markers.values()) {
        if (marker.kind !== 'exit') continue;
        const back = WORLD[marker.to].markers.get(
          (() => {
            const p = markerPos(WORLD[marker.to], marker.entry);
            return p.y * WORLD[marker.to].w + p.x;
          })(),
        )!.marker;
        expect(back).toMatchObject({ kind: 'exit', to: id, entry: char });
      }
  });
});

describe('stepping', () => {
  const spawn = markerPos(WORLD.village, '@');

  it('moves onto open ground and uses a turn', () => {
    const s = newGame(1);
    const { state, events } = applyAction(s, step(0));
    expect(state.player.pos).toEqual({ x: spawn.x, y: spawn.y - 1 });
    expect(state.turn).toBe(1);
    expect(events).toContainEqual({ type: 'move', from: spawn, to: state.player.pos });
    expect(s.player.pos).toEqual(spawn); // input state untouched
  });

  it('walls, trees and water are illegal', () => {
    const cases: [MapId, Pos, number, string][] = [
      ['village', { x: 1, y: 1 }, 6, 'T'],
      ['village', { x: 1, y: 1 }, 3, '#'],
      ['village', { x: 3, y: 9 }, 4, '~'],
      ['cave1', { x: 2, y: 1 }, 0, '#'],
    ];
    for (const [map, pos, dir, t] of cases) {
      const s = setup(map, pos);
      expect(terrainAt(WORLD[map], addPos(pos, DIRS8[dir]))).toBe(t);
      expect(isLegal(s, step(dir))).toBe(false);
      expect(() => applyAction(s, step(dir))).toThrow(/illegal/);
    }
  });

  it('bumping an NPC, sign or the lantern is a free action: no move, no turn, monsters idle', () => {
    const cases: [MapId, Pos, Pos, string][] = [
      ['village', { x: 5, y: 5 }, { x: 5, y: 4 }, 'talk'],
      ['forest', { x: 19, y: 8 }, { x: 20, y: 8 }, 'read'],
      ['village', { x: 16, y: 6 }, { x: 16, y: 5 }, 'read'],
    ];
    for (const [map, pos, target, ev] of cases) {
      // A wolf is adjacent: if the bump took a turn it would bite or at least roll dice.
      const wolfAt = DIRS8.map((d) => addPos(pos, d)).find((p) => passable(WORLD[map], p))!;
      const s = setup(map, pos, [['wolf', wolfAt]]);
      const { state, events } = applyAction(s, step(dirTo(pos, target)));
      expect(state.player.pos).toEqual(pos);
      expect(state.turn).toBe(0);
      expect(state.rolls).toBe(0);
      expect(state.player.hp).toBe(state.player.maxHp);
      expect(events.map((e) => e.type)).toEqual([ev]);
    }
    const lantern = applyAction(setup('village', { x: 16, y: 6 }), step(0)).events;
    expect(lantern).toEqual([{ type: 'read', text: LANTERN_TEXT.cold }]);
  });

  it('a chest gives its loot once, then is empty', () => {
    const s = setup('forest', { x: 33, y: 16 });
    const first = applyAction(s, step(2));
    expect(first.state.player.pos).toEqual({ x: 33, y: 16 });
    expect(first.state.turn).toBe(0);
    expect(first.state.player.gold).toBe(s.player.gold + 12);
    expect(first.state.player.potions).toBe(s.player.potions + 1);
    expect(first.state.done).toContain('forest-chest');
    expect(first.events).toEqual([{ type: 'loot', text: '12 gold, 1 potion' }]);
    const second = applyAction(first.state, step(2));
    expect(second.state.player.gold).toBe(first.state.player.gold);
    expect(second.state.player.potions).toBe(first.state.player.potions);
    expect(second.state.log.at(-1)).toBe('The chest is empty.');
    expect(second.events).toEqual([]);
  });

  it('the cave chest gives the axe', () => {
    const s = setup('cave1', { x: 5, y: 14 });
    const { state } = applyAction(s, step(2));
    expect(state.player.weapon).toBe('axe');
    expect(attackOf(state)).toBe(state.player.baseAtk + WEAPONS.axe.atk);
  });

  it('every exit takes you to the paired exit on the right map', () => {
    for (const id of MAP_IDS) {
      const m = WORLD[id];
      for (const [i, { char, marker }] of m.markers) {
        if (marker.kind !== 'exit') continue;
        const at = { x: i % m.w, y: Math.floor(i / m.w) };
        const from = arrivalPos(m, char);
        const s = setup(id, from);
        const { state, events } = applyAction(s, step(dirTo(from, at)));
        const entry = markerPos(WORLD[marker.to], marker.entry);
        expect(state.player.map, `${id} ${char}`).toBe(marker.to);
        expect(chebyshev(state.player.pos, entry), `${id} ${char}`).toBe(1);
        expect(passable(WORLD[marker.to], state.player.pos)).toBe(true);
        expect(markerAt(WORLD[marker.to], state.player.pos)?.kind).not.toBe('exit');
        expect(events).toContainEqual({ type: 'enterMap', map: marker.to });
        expect(state.turn).toBe(1);
      }
    }
  });

  // BUG (world.ts arrivalPos): coming up from the cave you arrive at forest (37,1), the NE
  // neighbour of 'C', which is OUTSIDE the rock ring (you pass diagonally through the '#' corner).
  // Fix: try orthogonal neighbours first, e.g. order [4, 0, 2, 6, 1, 3, 5, 7], which gives (36,3).
  it('leaving the cave puts you inside the rock ring around the entrance', () => {
    const s = setup('cave1', { x: 2, y: 1 });
    const { state } = applyAction(s, step(6));
    expect(state.player.map).toBe('forest');
    expect(state.player.pos).toEqual({ x: 36, y: 3 });
  });

  // BUG (rules.ts step, ~line 165): arrival ignores monsters, so you can land on one. Leave cave1
  // via 'U' from (1,2) with a bat at (2,1); come back and you share (2,1) with the bat and can't hit it.
  it('arriving on a map never puts you on top of a monster', () => {
    const s = setup('cave1', { x: 2, y: 1 }, [['bat', { x: 2, y: 2 }]]);
    s.player.map = 'forest';
    s.player.pos = { x: 36, y: 3 };
    mon(s).pos = { x: 2, y: 1 };
    const { state } = applyAction(s, step(0));
    expect(state.player.map).toBe('cave1');
    expect(monsterAt(state, 'cave1', state.player.pos)).toBeUndefined();
  });
});

describe('combat', () => {
  const P = { x: 10, y: 4 };
  const E = { x: 11, y: 4 };

  it('bump-attack damages a monster without moving you', () => {
    const s = setup('forest', P, [['goblin', E]]);
    const { state, events } = withRoll(s, step(2), hits(false));
    const dmg = MONSTERS.goblin.hp - mon(state).hp;
    const base = attackOf(s) - MONSTERS.goblin.def;
    expect(dmg).toBeGreaterThanOrEqual(Math.max(1, base - 1));
    expect(dmg).toBeLessThanOrEqual(base + 1);
    expect(events[0]).toEqual({ type: 'hit', at: E, dmg, onPlayer: false });
    expect(state.player.pos).toEqual(P);
    expect(state.turn).toBe(1);
    // Misses happen too.
    const miss = withRoll(s, step(2), (r) => r.events[0].type === 'miss');
    expect(mon(miss.state).hp).toBe(MONSTERS.goblin.hp);
  });

  it('a kill grants xp and gold and frees the cell', () => {
    const s = setup('forest', P, [['goblin', E]]);
    mon(s).hp = 1;
    const { state, events } = withRoll(s, step(2), hits(false));
    expect(mon(state).hp).toBe(0);
    expect(monsterAt(state, 'forest', E)).toBeUndefined();
    expect(events).toContainEqual({ type: 'kill', at: E, kind: 'goblin' });
    expect(state.player.xp).toBe(MONSTERS.goblin.xp);
    const gold = state.player.gold - s.player.gold;
    expect(gold).toBeGreaterThanOrEqual(MONSTERS.goblin.gold[0]);
    expect(gold).toBeLessThanOrEqual(MONSTERS.goblin.gold[1]);
    expect(applyAction(state, step(2)).state.player.pos).toEqual(E);
  });

  it('level up: +6 max HP, +1 attack, +1 defence on even levels', () => {
    const s = setup('forest', P, [['rat', E]]);
    s.player.xp = XP_TABLE[1] - 1;
    s.player.hp = 15;
    mon(s).hp = 1;
    const { state, events } = withRoll(s, step(2), hits(false));
    expect(state.player.level).toBe(2);
    expect(state.player.maxHp).toBe(26);
    expect(state.player.hp).toBe(21);
    expect(state.player.baseAtk).toBe(4);
    expect(state.player.baseDef).toBe(1);
    expect(events).toContainEqual({ type: 'levelUp', level: 2 });
    // Level 3 is odd: no defence.
    const t = setup('forest', P, [['rat', E]]);
    Object.assign(t.player, { level: 2, xp: XP_TABLE[2] - 1, maxHp: 26, hp: 26, baseAtk: 4, baseDef: 1 });
    mon(t).hp = 1;
    const l3 = withRoll(t, step(2), hits(false)).state.player;
    expect([l3.level, l3.maxHp, l3.baseAtk, l3.baseDef]).toEqual([3, 32, 5, 1]);
  });

  it('a big kill can level up several times; the king is worth gold 30 and the Ember', () => {
    const s = setup('cave2', { x: 22, y: 5 }, [['king', { x: 23, y: 5 }]]);
    mon(s).hp = 1;
    const { state, events } = withRoll(s, step(2), hits(false));
    // 50 xp from 0: levels 2 (10), 3 (25), 4 (45).
    expect(state.player.level).toBe(4);
    expect(events.filter((e) => e.type === 'levelUp')).toEqual([2, 3, 4].map((level) => ({ type: 'levelUp', level })));
    expect(state.player.maxHp).toBe(20 + 18);
    expect(state.player.baseAtk).toBe(3 + 3);
    expect(state.player.baseDef).toBe(2);
    expect(state.player.gold).toBe(s.player.gold + 30);
    expect(state.quest).toBe('ember');
    expect(events).toContainEqual({ type: 'loot', text: 'The Ember' });
  });

  it('levels cap at the end of the XP table', () => {
    const s = setup('forest', P, [['rat', E]]);
    s.player.xp = 10_000;
    mon(s).hp = 1;
    expect(withRoll(s, step(2), hits(false)).state.player.level).toBe(XP_TABLE.length);
  });

  it('an adjacent monster attacks; armor and level defence reduce the damage', () => {
    for (const armor of ['cloth', 'chain'] as const) {
      const s = setup('forest', P, [['skeleton', E]]);
      s.player.armor = armor;
      s.player.baseDef = 1;
      const { state, events } = withRoll(s, WAIT, hits(true));
      const dmg = s.player.hp - state.player.hp;
      const base = MONSTERS.skeleton.atk - defenceOf(s);
      expect(defenceOf(s)).toBe(1 + ARMORS[armor].def);
      expect(dmg).toBeGreaterThanOrEqual(Math.max(1, base - 1));
      expect(dmg).toBeLessThanOrEqual(base + 1);
      expect(events).toContainEqual({ type: 'hit', at: P, dmg, onPlayer: true });
      expect(mon(state).pos).toEqual(E);
    }
    const miss = withRoll(setup('forest', P, [['skeleton', E]]), WAIT, (r) => r.events[0]?.type === 'miss');
    expect(miss.state.player.hp).toBe(20);
  });

  it('monsters chase when within sight and line of sight', () => {
    const s = setup('forest', P, [['wolf', { x: 6, y: 4 }]]);
    expect(los(WORLD.forest, mon(s).pos, P)).toBe(true);
    for (let k = 0; k < 20; k++) {
      s.rolls = k;
      expect(chebyshev(mon(applyAction(s, WAIT).state).pos, P)).toBe(3);
    }
  });

  it('monsters without line of sight or out of range do not chase', () => {
    // Trees at (24,10..12) hide the wolf; then a wolf in the open but beyond its sight 7.
    const hidden = setup('forest', { x: 24, y: 13 }, [['wolf', { x: 24, y: 9 }]]);
    expect(los(WORLD.forest, { x: 24, y: 9 }, { x: 24, y: 13 })).toBe(false);
    const far = setup('forest', P, [['wolf', { x: 1, y: 4 }]]);
    expect(los(WORLD.forest, { x: 1, y: 4 }, P)).toBe(true);
    for (const s of [hidden, far]) {
      let closer = 0;
      const d0 = chebyshev(mon(s).pos, s.player.pos);
      for (let k = 0; k < 40; k++) {
        s.rolls = k;
        if (chebyshev(mon(applyAction(s, WAIT).state).pos, s.player.pos) < d0) closer++;
      }
      expect(closer).toBeLessThan(10); // only random wandering (25%, 1 in ~3 of those is closer)
    }
  });

  it('monsters never step onto an exit', () => {
    // From (35,3) the only cell closer to (37,1) is the cave mouth 'C' at (36,2).
    const s = setup('forest', { x: 37, y: 1 }, [['wolf', { x: 35, y: 3 }]]);
    expect(markerAt(WORLD.forest, { x: 36, y: 2 })?.kind).toBe('exit');
    for (let k = 0; k < 20; k++) {
      s.rolls = k;
      expect(mon(applyAction(s, WAIT).state).pos).toEqual({ x: 35, y: 3 });
    }
  });

  it('monsters never step onto each other', () => {
    // A one-wide corridor: the rear rat can only get closer through the front rat.
    const s = setup('cave1', { x: 2, y: 3 }, [
      ['rat', { x: 2, y: 4 }],
      ['rat', { x: 2, y: 5 }],
    ]);
    for (let k = 0; k < 20; k++) {
      s.rolls = k;
      const { state } = applyAction(s, WAIT);
      expect(mon(state, 0).pos).toEqual({ x: 2, y: 4 });
      expect(mon(state, 1).pos).toEqual({ x: 2, y: 5 });
    }
  });

  it('over long random play, monsters stay on free ground (no exits, NPCs, markers, walls, overlaps)', () => {
    const rng = new Rng(7);
    for (const map of MAP_IDS) {
      const m = WORLD[map];
      const start = map === 'village' ? markerPos(m, '@') : arrivalPos(m, [...m.markers.values()].find((v) => v.marker.kind === 'exit')!.char);
      let s = newGame(3);
      s.player.map = map;
      s.player.pos = start;
      s.player.hp = s.player.maxHp = 1e6;
      s.player.baseAtk = -100; // 1 damage a hit: kills are rare
      if (map === 'village') {
        // Crowd the NPCs with wolves and bats.
        const spots = [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 23, y: 11 }, { x: 15, y: 11 }, { x: 16, y: 6 }, { x: 29, y: 8 }];
        spots.forEach((pos, i) => s.monsters.push({ id: 900 + i, kind: i % 2 ? 'bat' : 'wolf', map, pos, hp: 9 }));
      }
      for (let t = 0; t < 400; t++) {
        const legal = [...DIRS8.keys()].map(step).filter((a) => {
          if (!isLegal(s, a)) return false;
          return markerAt(m, addPos(s.player.pos, DIRS8[(a as { dir: number }).dir]))?.kind !== 'exit';
        });
        s = applyAction(s, rng.next() < 0.3 ? WAIT : rng.pick(legal)).state;
        const live = s.monsters.filter((mo) => mo.hp > 0 && mo.map === map);
        const keys = new Set(live.map((mo) => `${mo.pos.x},${mo.pos.y}`));
        expect(keys.size).toBe(live.length);
        for (const mo of live) {
          expect(passable(m, mo.pos), `${map} ${mo.kind} ${mo.pos.x},${mo.pos.y}`).toBe(true);
          expect(markerAt(m, mo.pos)?.kind ?? 'none').not.toBe('exit');
          expect(samePos(mo.pos, s.player.pos)).toBe(false);
        }
      }
    }
  });
});

describe('items and shops', () => {
  const NEAR_SMITH = { x: 26, y: 5 };
  const NEAR_HEALER = { x: 24, y: 11 };

  it('potion heals up to 12, capped at max HP, and takes a turn', () => {
    const s = setup('forest', { x: 10, y: 4 });
    s.player.hp = 5;
    let r = applyAction(s, { type: 'potion' });
    expect(r.state.player.hp).toBe(17);
    expect(r.state.player.potions).toBe(s.player.potions - 1);
    expect(r.state.turn).toBe(1);
    expect(r.events).toEqual([{ type: 'heal', amount: 12 }]);
    s.player.hp = 15;
    r = applyAction(s, { type: 'potion' });
    expect(r.state.player.hp).toBe(20);
    expect(r.events).toEqual([{ type: 'heal', amount: 5 }]);
  });

  it('potion is illegal at full HP or with none', () => {
    const s = setup('forest', { x: 10, y: 4 });
    expect(isLegal(s, { type: 'potion' })).toBe(false);
    s.player.hp = 3;
    s.player.potions = 0;
    expect(isLegal(s, { type: 'potion' })).toBe(false);
    expect(() => applyAction(s, { type: 'potion' })).toThrow();
  });

  it('buying needs the right NPC next to you and enough gold, and is free', () => {
    const smith = setup('village', NEAR_SMITH);
    smith.player.gold = 100;
    expect(isLegal(smith, { type: 'buy', item: 'potion' })).toBe(false);
    const { state } = applyAction(smith, { type: 'buy', item: 'sword' });
    expect(state.player.weapon).toBe('sword');
    expect(state.player.gold).toBe(80);
    expect(state.turn).toBe(0);

    const healer = setup('village', NEAR_HEALER);
    healer.player.gold = 100;
    expect(isLegal(healer, { type: 'buy', item: 'sword' })).toBe(false);
    const pot = applyAction(healer, { type: 'buy', item: 'potion' }).state;
    expect([pot.player.potions, pot.player.gold]).toEqual([healer.player.potions + 1, 100 - PRICES.potion]);

    const away = setup('village', { x: 20, y: 8 });
    away.player.gold = 100;
    for (const item of ['sword', 'leather', 'chain', 'potion'] as const) expect(isLegal(away, { type: 'buy', item })).toBe(false);

    const poor = setup('village', NEAR_SMITH);
    poor.player.gold = 19;
    expect(isLegal(poor, { type: 'buy', item: 'sword' })).toBe(false);
    expect(isLegal(poor, { type: 'buy', item: 'leather' })).toBe(true);
  });

  it("can't buy a sword twice, over an axe, or downgrade armor", () => {
    const s = setup('village', NEAR_SMITH);
    s.player.gold = 200;
    const sword = applyAction(s, { type: 'buy', item: 'sword' }).state;
    expect(isLegal(sword, { type: 'buy', item: 'sword' })).toBe(false);
    const axe = structuredClone(s);
    axe.player.weapon = 'axe';
    expect(isLegal(axe, { type: 'buy', item: 'sword' })).toBe(false);

    const leather = applyAction(s, { type: 'buy', item: 'leather' }).state;
    expect(isLegal(leather, { type: 'buy', item: 'leather' })).toBe(false);
    const chain = applyAction(leather, { type: 'buy', item: 'chain' }).state;
    expect(chain.player.armor).toBe('chain');
    expect(chain.player.gold).toBe(200 - PRICES.leather - PRICES.chain);
    expect(isLegal(chain, { type: 'buy', item: 'leather' })).toBe(false);
    expect(isLegal(chain, { type: 'buy', item: 'chain' })).toBe(false);
  });

  it('shop dialogue options are enabled exactly when the purchase is legal', () => {
    for (const gold of [0, 12, 20, 35, 100])
      for (const armor of ['cloth', 'leather', 'chain'] as const)
        for (const weapon of ['dagger', 'sword', 'axe'] as const)
          for (const [npc, pos] of [['smith', NEAR_SMITH], ['healer', NEAR_HEALER]] as const) {
            const s = setup('village', pos);
            Object.assign(s.player, { gold, armor, weapon, hp: 10 });
            for (const o of dialogue(s, npc).options) expect(o.enabled, `${npc} ${o.label} ${gold}g ${weapon}/${armor}`).toBe(isLegal(s, o.action));
          }
  });

  it('rest needs the healer, 2 gold and missing HP; it heals fully without a turn', () => {
    const s = setup('village', NEAR_HEALER);
    s.player.hp = 4;
    const { state, events } = applyAction(s, { type: 'rest' });
    expect(state.player.hp).toBe(20);
    expect(state.player.gold).toBe(s.player.gold - PRICES.rest);
    expect(state.turn).toBe(0);
    expect(events).toEqual([{ type: 'heal', amount: 16 }]);
    expect(isLegal(state, { type: 'rest' })).toBe(false); // full HP
    const broke = structuredClone(s);
    broke.player.gold = 1;
    expect(isLegal(broke, { type: 'rest' })).toBe(false);
    const away = setup('village', NEAR_SMITH);
    away.player.hp = 4;
    expect(isLegal(away, { type: 'rest' })).toBe(false);
  });
});

describe('quest', () => {
  it('the Elder starts the quest', () => {
    const s = setup('village', { x: 5, y: 5 });
    const r = applyAction(s, step(0));
    expect(r.state.quest).toBe('started');
    expect(r.events).toEqual([{ type: 'talk', npc: 'elder' }]);
    expect(applyAction(r.state, step(0)).state.quest).toBe('started');
  });

  it('bringing the Ember back to the Elder wins', () => {
    const s = setup('village', { x: 5, y: 5 });
    s.quest = 'ember';
    const { state, events } = applyAction(s, step(0));
    expect(state.quest).toBe('won');
    expect(events).toEqual([{ type: 'talk', npc: 'elder' }, { type: 'win' }]);
    expect(applyAction(state, step(0)).events).not.toContainEqual({ type: 'win' });
    // After the win you can still walk around, but not shop or drink.
    state.player.hp = 1;
    expect(isLegal(state, { type: 'potion' })).toBe(false);
    expect(isLegal(state, WAIT)).toBe(true);
    const lantern = setup('village', { x: 16, y: 6 });
    lantern.quest = 'won';
    expect(applyAction(lantern, step(0)).events).toEqual([{ type: 'read', text: LANTERN_TEXT.lit }]);
  });

  it('the Hermit gives exactly one potion', () => {
    const s = setup('forest', { x: 9, y: 14 });
    const once = applyAction(s, step(6)).state;
    expect(once.player.potions).toBe(s.player.potions + 1);
    expect(once.done).toContain('hermit-gift');
    const twice = applyAction(once, step(6)).state;
    expect(twice.player.potions).toBe(once.player.potions);
    expect(twice.done.filter((d) => d === 'hermit-gift')).toHaveLength(1);
  });
});

describe('knock-out', () => {
  it('wakes you at the village with full HP, half gold; survivors reset, the dead stay dead', () => {
    const s = newGame(1);
    s.player.map = 'forest';
    s.player.pos = { x: 10, y: 4 };
    s.player.hp = 1;
    s.player.gold = 7;
    s.player.maxHp = 32;
    const homes = new Map(s.monsters.map((mo) => [mo.id, { ...mo.pos }]));
    const wolf = s.monsters.find((mo) => mo.kind === 'wolf')!;
    wolf.pos = { x: 11, y: 4 };
    wolf.hp = 2;
    const goblin = s.monsters.find((mo) => mo.kind === 'goblin')!;
    goblin.pos = { x: 3, y: 3 }; // wandered away, hurt
    goblin.hp = 3;
    const deadRat = s.monsters.find((mo) => mo.kind === 'rat')!;
    deadRat.hp = 0;
    deadRat.pos = { x: 5, y: 5 };
    const spider = s.monsters.find((mo) => mo.kind === 'spider')!; // another map
    spider.hp = 1;
    spider.pos = { x: 2, y: 5 };

    const { state, events } = withRoll(s, WAIT, hits(true));
    expect(events).toContainEqual({ type: 'playerDown' });
    expect(state.deaths).toBe(1);
    expect(state.player.gold).toBe(3);
    expect(state.player.hp).toBe(32);
    expect(state.player.map).toBe('village');
    expect(state.player.pos).toEqual(markerPos(WORLD.village, '@'));
    for (const mo of [wolf, goblin, spider]) {
      const after = state.monsters.find((m) => m.id === mo.id)!;
      expect(after.hp).toBe(MONSTERS[mo.kind].hp);
      expect(after.pos).toEqual(homes.get(mo.id));
    }
    const rat = state.monsters.find((m) => m.id === deadRat.id)!;
    expect(rat.hp).toBe(0);
    expect(rat.pos).toEqual({ x: 5, y: 5 });
  });
});

describe('dark maps', () => {
  it('records what the lantern lights, remembers it, and never marks lit maps', () => {
    let s = setup('forest', { x: 36, y: 3 });
    s = applyAction(s, step(0)).state; // into the cave
    expect(s.player.map).toBe('cave1');
    const m = WORLD.cave1;
    const seen = s.seen.cave1!;
    expect(seen).toHaveLength(m.w * m.h);
    const lit = fov(m, s.player.pos);
    for (let i = 0; i < seen.length; i++) expect(seen[i], `cell ${i}`).toBe(lit.has(i) ? '1' : '0');
    expect(seen.includes('0')).toBe(true);
    expect(s.seen.forest).toBeUndefined();
    expect(s.seen.village).toBeUndefined();
    // Walk on: what was seen stays seen.
    const before = s.seen.cave1!;
    s = applyAction(s, step([0, 1, 2, 3, 4, 5, 6, 7].find((d) => isLegal(s, step(d)))!)).state;
    for (let i = 0; i < before.length; i++) if (before[i] === '1') expect(s.seen.cave1![i]).toBe('1');
  });

  it('pathTo only routes through seen cells on dark maps', () => {
    let s = setup('forest', { x: 36, y: 3 });
    s = applyAction(s, step(0)).state;
    const m = WORLD.cave1;
    const stairs = markerPos(m, 'D');
    expect(pathTo(s, stairs)).toBeNull();
    // Every path that does exist stays on seen ground.
    for (const to of cellsOf('cave1')) {
      const path = pathTo(s, to);
      if (!path) continue;
      let at = s.player.pos;
      for (const d of path.slice(0, -1)) {
        at = addPos(at, DIRS8[d]);
        expect(s.seen.cave1![at.y * m.w + at.x], `${to.x},${to.y}`).toBe('1');
      }
    }
    // Once everything is known, the stairs are a walk away.
    s.seen.cave1 = '1'.repeat(m.w * m.h);
    s.monsters = [];
    const path = pathTo(s, stairs)!;
    expect(path).not.toBeNull();
    for (const d of path) s = applyAction(s, step(d)).state;
    expect(s.player.map).toBe('cave2');
  });

  it('pathTo works without memory on lit maps', () => {
    let s = setup('village', markerPos(WORLD.village, '@'));
    const exit = markerPos(WORLD.village, 'E');
    const path = pathTo(s, exit)!;
    for (const d of path) s = applyAction(s, step(d)).state;
    expect(s.player.map).toBe('forest');
  });

  // BUG (world.ts pathTo, the `isGoal && !goalOpen` branch): any non-walkable goal is treated
  // as bumpable, including walls/trees/water, so the last step is illegal. Tapping a tree in the
  // UI would make applyAction throw. Fix: only bump when the goal holds a monster or a non-exit
  // marker; otherwise return null.
  it('pathTo never ends with an illegal step', () => {
    const s = setup('forest', { x: 5, y: 4 });
    const path = pathTo(s, { x: 3, y: 5 }); // a tree
    if (!path) return;
    let t = s;
    for (const d of path) {
      expect(isLegal(t, step(d))).toBe(true);
      t = applyAction(t, step(d)).state;
    }
  });
});

describe('replay', () => {
  it('encodes and decodes every action', () => {
    const all: Action[] = [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(step),
      WAIT,
      { type: 'potion' },
      { type: 'rest' },
      ...(['sword', 'leather', 'chain', 'potion'] as const).map((item) => ({ type: 'buy' as const, item })),
    ];
    const codes = all.map(encodeAction);
    expect(new Set(codes).size).toBe(all.length);
    for (const c of codes) expect(c).toHaveLength(1);
    for (const a of all) expect(decodeAction(encodeAction(a))).toEqual(a);
  });

  it('replay reproduces a played game exactly, including purchases', () => {
    const { state, actions } = playCompletion(5, 700);
    expect(actions).toMatch(/[SLCP]/);
    expect(replay(5, actions)).toEqual(state);
  });

  it('replay reproduces a random walk', () => {
    const rng = new Rng(11);
    let s = newGame(42);
    let codes = '';
    const options: Action[] = [...[0, 1, 2, 3, 4, 5, 6, 7].map(step), WAIT, { type: 'potion' }];
    for (let i = 0; i < 300; i++) {
      const a = rng.pick(options.filter((o) => isLegal(s, o)));
      s = applyAction(s, a).state;
      codes += encodeAction(a);
    }
    expect(replay(42, codes)).toEqual(s);
  });

  it('malformed or illegal codes throw', () => {
    for (const bad of ['x', '8', '9', 'Q', 's', ' ']) expect(() => replay(1, `00${bad}`)).toThrow(/bad action/);
    expect(() => decodeAction('')).toThrow();
    expect(() => decodeAction('SS')).toThrow();
    expect(() => replay(1, 'p')).toThrow(/illegal/); // full HP
  });

  it('newGame places every monster at full HP with unique ids', () => {
    const s = newGame(9);
    expect(s.monsters.map((m) => m.id)).toEqual(s.monsters.map((_, i) => i));
    for (const mo of s.monsters) {
      expect(mo.hp).toBe(MONSTERS[mo.kind].hp);
      expect(inMap(WORLD[mo.map], mo.pos)).toBe(true);
    }
  });
});
