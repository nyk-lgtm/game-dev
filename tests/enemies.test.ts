import { describe, expect, it } from 'vitest';
import {
  DIRS,
  PLAYER_ID,
  Rng,
  add,
  applyAction,
  bashTargets,
  encodeAction,
  eq,
  frontArc,
  hex,
  isLegal,
  key,
  legalActions,
  legalMoves,
  newRun,
  previewAction,
  replay,
  threats,
  type Action,
  type GameEvent,
  type GameState,
  type Hex,
} from '../src/core';
import { greedyAction } from '../scripts/bot';
import { addEnemy, blankState } from './helpers';

const P = hex(3, 3);
const move = (to: Hex) => ({ type: 'move' as const, to });
const bash = (target: Hex) => ({ type: 'bash' as const, target });
const at = (h: Hex, dir: number, n = 1): Hex => {
  let cur = h;
  for (let i = 0; i < n; i++) cur = add(cur, DIRS[dir]);
  return cur;
};
const enemy = (s: GameState, id: number) => s.enemies.find((e) => e.id === id);
const has = (events: GameEvent[], type: GameEvent['type']) => events.some((e) => e.type === type);

describe('bash', () => {
  it('is legal only against an adjacent enemy with the cooldown ready', () => {
    const s = blankState(P);
    const b = addEnemy(s, 'brute', at(P, 1));
    addEnemy(s, 'brute', at(P, 4, 2));
    expect(bashTargets(s)).toEqual([at(P, 1)]);
    expect(isLegal(s, bash(at(P, 1)))).toBe(true);
    expect(isLegal(s, bash(at(P, 4, 2)))).toBe(false); // not adjacent
    expect(isLegal(s, bash(at(P, 2)))).toBe(false); // empty hex
    expect(() => applyAction(s, bash(at(P, 2)))).toThrow();

    s.player.bashCd = 1;
    expect(isLegal(s, bash(b.pos))).toBe(false);
    expect(bashTargets(s)).toEqual([]);
  });

  it('sets the cooldown to 3, ticks down on every non-bash action, then is ready again', () => {
    let s = blankState(P);
    addEnemy(s, 'brute', at(P, 1));
    s = applyAction(s, bash(at(P, 1))).state;
    expect(s.player.bashCd).toBe(3);

    // Probe: would a bash be legal if an enemy stood next to us right now?
    const bashLegalNow = (st: GameState) => {
      const probe = structuredClone(st);
      addEnemy(probe, 'brute', at(probe.player.pos, 3));
      return isLegal(probe, bash(at(probe.player.pos, 3)));
    };
    expect(bashLegalNow(s)).toBe(false);

    // Walk west, away from the dazed brute: 3 -> 2 -> 1 -> 0.
    let pos = s.player.pos;
    for (const expected of [2, 1, 0]) {
      pos = at(pos, 4);
      s = applyAction(s, move(pos)).state;
      expect(s.player.bashCd).toBe(expected);
      expect(bashLegalNow(s)).toBe(expected === 0);
    }
  });

  it('wait (when walled in) also ticks the cooldown', () => {
    // Fully walled in with the cooldown running: the only action is wait.
    const s = blankState(P);
    for (const d of DIRS) s.tiles[key(add(P, d))] = 'wall';
    s.player.bashCd = 2;
    expect(legalActions(s)).toEqual([{ type: 'wait' }]);
    expect(applyAction(s, { type: 'wait' }).state.player.bashCd).toBe(1);
  });

  it('pushes the enemy exactly 1 hex directly away, in every direction', () => {
    for (let d = 0; d < 6; d++) {
      const s = blankState(P);
      const b = addEnemy(s, 'brute', at(P, d));
      const { state, events } = applyAction(s, bash(b.pos));
      expect(enemy(state, b.id)!.pos).toEqual(at(P, d, 2));
      expect(enemy(state, b.id)!.hp).toBe(2);
      expect(events).toContainEqual({ type: 'push', id: b.id, from: at(P, d), to: at(P, d, 2) });
      expect(state.player.facing).toBe(d);
      expect(state.player.hp).toBe(3);
    }
  });

  it('dazes a pushed survivor: it skips its next action, then resumes', () => {
    const s = blankState(P);
    const b = addEnemy(s, 'brute', at(P, 1));
    const s1 = applyAction(s, bash(b.pos));
    expect(has(s1.events, 'stagger')).toBe(true);
    // Without the daze it would have walked back next to us; instead it stays put.
    expect(enemy(s1.state, b.id)!.pos).toEqual(at(P, 1, 2));
    // Next turn it acts normally again.
    const s2 = applyAction(s1.state, move(at(P, 4)));
    expect(eq(enemy(s2.state, b.id)!.pos, at(P, 1, 2))).toBe(false);
  });

  it('a bashed aiming archer loses its aim and does not fire', () => {
    const make = () => {
      const s = blankState(P);
      const a = addEnemy(s, 'archer', at(P, 5), { aim: 2 }); // adjacent, aiming at us
      return { s, a };
    };
    // Control: stepping along the line takes the arrow.
    const control = make();
    const c = applyAction(control.s, move(at(P, 2)));
    expect(has(c.events, 'shot')).toBe(true);
    expect(c.state.player.hp).toBe(2);

    const { s, a } = make();
    const { state, events } = applyAction(s, bash(a.pos));
    expect(has(events, 'shot')).toBe(false);
    expect(state.player.hp).toBe(3);
    expect(enemy(state, a.id)!.aim).toBeNull();
    expect(enemy(state, a.id)!.hp).toBe(1);
  });

  it('pushed into lava: dies and counts as a kill', () => {
    const s = blankState(P, { tiles: [[at(P, 1, 2), 'lava']] });
    const b = addEnemy(s, 'brute', at(P, 1));
    expect(previewAction(s, bash(b.pos)).kills).toEqual([b.id]);
    const { state, events } = applyAction(s, bash(b.pos));
    expect(events).toContainEqual({ type: 'fall', id: b.id });
    expect(events).toContainEqual({ type: 'death', target: b.id });
    expect(enemy(state, b.id)).toBeUndefined();
    expect(state.kills).toBe(1);
  });

  it('pushed into a wall: the enemy takes 1 damage and stays put', () => {
    const s = blankState(P, { tiles: [[at(P, 1, 2), 'wall']] });
    const b = addEnemy(s, 'brute', at(P, 1));
    const { state, events } = applyAction(s, bash(b.pos));
    expect(events).toContainEqual({ type: 'slam', id: b.id, into: null, at: at(P, 1, 2) });
    expect(enemy(state, b.id)).toMatchObject({ hp: 1, pos: at(P, 1) });
    expect(state.kills).toBe(0);
  });

  it('pushed into the stairs: the enemy takes 1 damage and stays put', () => {
    const s = blankState(hex(2, 0));
    const b = addEnemy(s, 'brute', hex(1, 0));
    expect(eq(at(b.pos, 4), s.stairs)).toBe(true);
    const { state, events } = applyAction(s, bash(b.pos));
    expect(events).toContainEqual({ type: 'slam', id: b.id, into: null, at: s.stairs });
    expect(enemy(state, b.id)).toMatchObject({ hp: 1, pos: hex(1, 0) });
  });

  it('pushed off the board edge: the enemy takes 1 damage and stays put', () => {
    const s = blankState(hex(3, 0));
    const b = addEnemy(s, 'brute', hex(3, -1));
    expect(s.tiles[key(at(b.pos, 5))]).toBeUndefined();
    const { state, events } = applyAction(s, bash(b.pos));
    expect(events).toContainEqual({ type: 'slam', id: b.id, into: null, at: at(b.pos, 5) });
    expect(enemy(state, b.id)).toMatchObject({ hp: 1, pos: hex(3, -1) });
  });

  it('pushed into another enemy: both take 1 damage', () => {
    const s = blankState(P);
    const a = addEnemy(s, 'brute', at(P, 1));
    const b = addEnemy(s, 'brute', at(P, 1, 2));
    const { state, events } = applyAction(s, bash(a.pos));
    expect(events).toContainEqual({ type: 'slam', id: a.id, into: b.id, at: b.pos });
    expect(enemy(state, a.id)).toMatchObject({ hp: 1, pos: at(P, 1) });
    expect(enemy(state, b.id)!.hp).toBe(1);
    expect(state.player.hp).toBe(3);
  });

  it('a slam can kill: a 1-HP unit in the way dies and counts as a kill', () => {
    const s = blankState(P);
    const a = addEnemy(s, 'brute', at(P, 1));
    const b = addEnemy(s, 'archer', at(P, 1, 2));
    const { state } = applyAction(s, bash(a.pos));
    expect(enemy(state, b.id)).toBeUndefined();
    expect(state.kills).toBe(1);
    expect(enemy(state, a.id)!.hp).toBe(1);
  });

  it('wait is illegal when a bash is available, even with no moves', () => {
    const s = blankState(P);
    const walls = [0, 1, 2, 3, 4];
    for (const d of walls) s.tiles[key(at(P, d))] = 'wall';
    const b = addEnemy(s, 'brute', at(P, 5));
    expect(legalMoves(s)).toHaveLength(0);
    expect(legalActions(s)).toEqual([bash(b.pos)]);
    expect(isLegal(s, { type: 'wait' })).toBe(false);
    expect(() => applyAction(s, { type: 'wait' })).toThrow();

    s.player.bashCd = 3;
    expect(legalActions(s)).toEqual([{ type: 'wait' }]);
    expect(isLegal(s, { type: 'wait' })).toBe(true);
  });
});

describe('bash replay encoding', () => {
  it('bash encodes as the letters a-f for each direction', () => {
    const s = blankState(P);
    for (let d = 0; d < 6; d++) {
      expect(encodeAction(s, bash(at(P, d)))).toBe('abcdef'[d]);
      expect(encodeAction(s, move(at(P, d)))).toBe(String(d));
    }
    expect(encodeAction(s, { type: 'wait' })).toBe('w');
  });

  it('replay(seed, string) round-trips a run containing bashes', { timeout: 60_000 }, () => {
    let totalBashes = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rng = new Rng(seed * 31 + 7);
      let s = newRun(seed);
      let code = '';
      while (s.status === 'playing' && s.turn < 300) {
        const acts = legalActions(s);
        const bashes = acts.filter((a) => a.type === 'bash');
        const a = bashes.length ? bashes[0] : rng.pick(acts);
        code += encodeAction(s, a);
        s = applyAction(s, a).state;
      }
      totalBashes += (code.match(/[a-f]/g) ?? []).length;
      expect(replay(seed, code)).toEqual(s);
    }
    expect(totalBashes).toBeGreaterThan(0);
  });
});

describe('stab and lunge do not daze', () => {
  it('a stabbed 2-HP brute is wounded, not staggered, and smashes back', () => {
    const s = blankState(P);
    const b = addEnemy(s, 'brute', at(P, 0));
    const { state, events } = applyAction(s, move(at(P, 5)));
    expect(has(events, 'stagger')).toBe(false);
    expect(enemy(state, b.id)).toMatchObject({ hp: 1, staggered: false });
    expect(state.player.hp).toBe(2);
  });

  it('a lunge kills outright and never staggers', () => {
    // Lunge deals 2 so it kills a brute outright; check no stagger event and no damage taken.
    const s = blankState(P);
    addEnemy(s, 'brute', at(P, 5, 2));
    const { events, state } = applyAction(s, move(at(P, 5)));
    expect(has(events, 'stagger')).toBe(false);
    expect(state.kills).toBe(1);
  });
});

describe('guard', () => {
  // Default facing is 2, so the front arc is dirs 1, 2, 3 and the back arc dirs 4, 5, 0.
  const G = P;
  const guardState = (player: Hex) => {
    const s = blankState(player);
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    return { s, g };
  };

  it('front arc is the facing direction and the two either side', () => {
    const { g } = guardState(hex(0, 6));
    expect(frontArc(g)).toEqual([at(G, 1), at(G, 2), at(G, 3)]);
  });

  it('smashes a player who ends in its front arc', () => {
    const { s } = guardState(hex(4, 4));
    // (4,4) -> (4,3): sideways move, no stab (guard is not adjacent to (4,4)); ends in front arc.
    expect(eq(at(hex(4, 4), 5), at(G, 1))).toBe(true);
    const { state, events } = applyAction(s, move(at(G, 1)));
    expect(has(events, 'attack')).toBe(true);
    expect(events).toContainEqual({ type: 'attack', kind: 'smash', by: 1, target: PLAYER_ID });
    expect(state.player.hp).toBe(2);
  });

  it('does not smash a player who ends adjacent behind it', () => {
    const { s } = guardState(hex(4, 1));
    const { state, events } = applyAction(s, move(at(G, 0))); // (4,2), back arc
    expect(events.some((e) => e.type === 'attack')).toBe(false);
    expect(state.player.hp).toBe(3);
  });

  it('a stab ending in its front arc is blocked', () => {
    const s = blankState(at(G, 0)); // start behind it at (4,2)
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    const { events, state } = applyAction(s, move(at(G, 1))); // to (4,3): front arc, adjacent to both
    expect(events).toContainEqual({ type: 'attack', kind: 'stab', by: PLAYER_ID, target: g.id });
    expect(events).toContainEqual({ type: 'blocked', target: g.id });
    expect(enemy(state, g.id)!.hp).toBe(2);
    expect(events.some((e) => e.type === 'damage' && e.target === g.id)).toBe(false);
  });

  it('a lunge arriving in its front arc is blocked', () => {
    const s = blankState(at(G, 2, 2)); // (3,5)
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    const { events, state } = applyAction(s, move(at(G, 2))); // (3,4) straight at it
    expect(events).toContainEqual({ type: 'attack', kind: 'lunge', by: PLAYER_ID, target: g.id });
    expect(events).toContainEqual({ type: 'blocked', target: g.id });
    expect(enemy(state, g.id)!.hp).toBe(2);
  });

  it('a stab from behind works', () => {
    const s = blankState(at(G, 5)); // (3,2), back arc
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    const { events, state } = applyAction(s, move(at(G, 0))); // (4,2), still back arc
    expect(events.some((e) => e.type === 'blocked')).toBe(false);
    expect(enemy(state, g.id)!.hp).toBe(1);
  });

  it('a lunge from behind kills it', () => {
    const s = blankState(at(G, 5, 2)); // (3,1)
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    const { events, state } = applyAction(s, move(at(G, 5))); // (3,2) with guard straight ahead
    expect(events).toContainEqual({ type: 'attack', kind: 'lunge', by: PLAYER_ID, target: g.id });
    expect(enemy(state, g.id)).toBeUndefined();
    expect(state.kills).toBe(1);
    expect(state.player.hp).toBe(3);
  });

  it('arrows arriving from its front are blocked', () => {
    const s = blankState(hex(1, 3));
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    // Archer south of the guard, shooting north: the arrow arrives via (3,4), the guard's front.
    const a = addEnemy(s, 'archer', at(G, 2, 3), { aim: 5 });
    const { events, state } = applyAction(s, move(hex(1, 4)));
    expect(events).toContainEqual({ type: 'shot', by: a.id, path: [at(G, 2, 2), at(G, 2), G], hit: g.id });
    expect(events).toContainEqual({ type: 'blocked', target: g.id });
    expect(enemy(state, g.id)!.hp).toBe(2);
  });

  it('arrows arriving from behind hit', () => {
    const s = blankState(hex(1, 3));
    const g = addEnemy(s, 'guard', G, { facing: 2 });
    const a = addEnemy(s, 'archer', at(G, 5, 3), { aim: 2 }); // (3,0) shooting south
    const { events, state } = applyAction(s, move(hex(1, 4)));
    expect(events).toContainEqual({ type: 'shot', by: a.id, path: [at(G, 5, 2), at(G, 5), G], hit: g.id });
    expect(events.some((e) => e.type === 'blocked')).toBe(false);
    expect(enemy(state, g.id)!.hp).toBe(1);
  });

  it('rotates one step toward a player outside its front arc instead of moving', () => {
    // Player ends at (4,2), the back arc (dir 0). Facing 2 -> 1 (the short way round).
    const { s, g } = guardState(hex(4, 1));
    const { state, events } = applyAction(s, move(at(G, 0)));
    expect(events).toContainEqual({ type: 'face', id: g.id, dir: 1 });
    expect(enemy(state, g.id)).toMatchObject({ facing: 1, pos: G });
  });

  it('turns only one step even when the player is directly behind it', () => {
    const { s, g } = guardState(hex(3, 0));
    const { state } = applyAction(s, move(hex(3, 1)));
    const f = enemy(state, g.id)!.facing;
    expect([1, 3]).toContain(f);
    expect(enemy(state, g.id)!.pos).toEqual(G);
  });

  it('steps forward into its front arc when already facing the player', () => {
    const { s, g } = guardState(hex(3, 6));
    const arc = frontArc(g);
    const { state, events } = applyAction(s, move(hex(3, 7)));
    const after = enemy(state, g.id)!;
    expect(after.facing).toBe(2);
    expect(arc.some((h) => eq(h, after.pos))).toBe(true);
    expect(after.pos).toEqual(at(G, 2));
    expect(events.some((e) => e.type === 'face')).toBe(false);
  });
});

describe('bomber', () => {
  const bomberState = (player: Hex, bomber: Hex) => {
    const s = blankState(player);
    const b = addEnemy(s, 'bomber', bomber);
    return { s, b };
  };

  it('throws at the player hex when the distance is 2..4', () => {
    // Player ends at (3,3), distance 3 from the bomber at (3,0).
    const { s, b } = bomberState(hex(3, 4), hex(3, 0));
    const { state, events } = applyAction(s, move(P));
    expect(events).toContainEqual({ type: 'throw', by: b.id, at: P });
    expect(state.bombs).toEqual([{ pos: P, by: b.id, fuse: 2 }]);
    expect(enemy(state, b.id)!.reload).toBe(2);
  });

  it('throws at the boundary ranges 2 and 4', () => {
    for (const [from, to, bomber] of [
      [hex(3, 4), hex(3, 3), hex(3, 1)], // d = 2
      [hex(3, 3), hex(3, 4), hex(3, 0)], // d = 4
    ] as const) {
      const { s } = bomberState(from, bomber);
      expect(applyAction(s, move(to)).state.bombs).toHaveLength(1);
    }
  });

  it('does not throw at distance 1 or 5', () => {
    // d = 5: player steps to (3,5), bomber at (3,0).
    const far = bomberState(hex(3, 4), hex(3, 0));
    expect(applyAction(far.s, move(hex(3, 5))).state.bombs).toHaveLength(0);
    // d = 1: player steps from distance 2 to adjacent without stabbing it.
    const near = bomberState(hex(5, 2), P);
    const { state } = applyAction(near.s, move(hex(4, 2)));
    expect(enemy(state, near.b.id)).toBeDefined();
    expect(state.bombs).toHaveLength(0);
  });

  it('does not throw while reloading', () => {
    const { s } = bomberState(hex(3, 4), hex(3, 0));
    s.enemies[0].reload = 1;
    expect(applyAction(s, move(P)).state.bombs).toHaveLength(0);
  });

  it('fuse 2: nothing on the next enemy phase, explodes on the second', () => {
    const { s } = bomberState(hex(3, 4), hex(3, 0));
    const s1 = applyAction(s, move(P));
    expect(s1.state.bombs).toHaveLength(1);
    // Step away, but stay inside the blast radius on purpose: nothing happens yet.
    const s2 = applyAction(s1.state, move(hex(3, 4)));
    expect(has(s2.events, 'explode')).toBe(false);
    expect(s2.state.bombs).toEqual([{ pos: P, by: 1, fuse: 1 }]);
    expect(s2.state.player.hp).toBe(3);
    const s3 = applyAction(s2.state, move(hex(2, 4)));
    expect(s3.events).toContainEqual({ type: 'explode', at: P });
    expect(s3.state.bombs).toHaveLength(0);
    expect(s3.state.player.hp).toBe(2); // (2,4) is adjacent to (3,3)
  });

  it('the player escapes by moving 2 hexes away over the two turns', () => {
    const { s } = bomberState(hex(3, 4), hex(3, 0));
    let st = applyAction(s, move(P)).state; // bomb lands on (3,3)
    st = applyAction(st, move(hex(3, 4))).state;
    const last = applyAction(st, move(hex(3, 5)));
    expect(last.events).toContainEqual({ type: 'explode', at: P });
    expect(last.state.player.hp).toBe(3);
  });

  it('the blast hits the center and all 6 neighbors, enemies included, and nothing further', () => {
    const s = blankState(hex(0, 6));
    s.bombs.push({ pos: P, by: 99, fuse: 1 });
    const inside = [P, ...DIRS.map((d) => add(P, d))].map((h) => addEnemy(s, 'brute', h));
    const outside = addEnemy(s, 'brute', at(P, 1, 2));
    const { state, events } = applyAction(s, move(hex(0, 5)));
    expect(events).toContainEqual({ type: 'explode', at: P });
    for (const e of inside) expect(enemy(state, e.id)!.hp).toBe(1);
    expect(enemy(state, outside.id)!.hp).toBe(2);
    expect(state.bombs).toHaveLength(0);
  });

  it('a blast kills 1-HP enemies and counts kills', () => {
    const s = blankState(hex(0, 6));
    s.bombs.push({ pos: P, by: 99, fuse: 1 });
    addEnemy(s, 'archer', at(P, 3));
    addEnemy(s, 'bomber', at(P, 0));
    const { state } = applyAction(s, move(hex(0, 5)));
    expect(state.kills).toBe(2);
    expect(state.enemies).toHaveLength(0);
  });

  it('threats().blasts reflects bombs with their fuse', () => {
    const { s } = bomberState(hex(3, 4), hex(3, 0));
    const s1 = applyAction(s, move(P)).state;
    const t1 = threats(s1).blasts;
    expect(t1).toHaveLength(1);
    expect(t1[0].fuse).toBe(2);
    expect(t1[0].hexes[0]).toEqual(P);
    expect(t1[0].hexes).toHaveLength(7);
    const s2 = applyAction(s1, move(hex(3, 4))).state;
    expect(threats(s2).blasts[0].fuse).toBe(1);

    // Blast areas are clipped to the board.
    const edge = blankState(hex(3, 5));
    edge.bombs.push({ pos: hex(3, -1), by: 1, fuse: 1 });
    expect(threats(edge).blasts[0].hexes.length).toBeLessThan(7);
  });
});

describe('charger', () => {
  /** Charger at (3,0) with the player down the same column. */
  const lineState = (player: Hex, extra: Partial<Parameters<typeof addEnemy>[3]> = {}) => {
    const s = blankState(player);
    const c = addEnemy(s, 'charger', hex(3, 0), extra);
    return { s, c };
  };

  it('aims when the player is in a straight line 2..6 away over clear floor', () => {
    for (const to of [hex(3, 2), hex(3, 6)]) {
      const from = at(to, 5);
      const { s, c } = lineState(from);
      const { state, events } = applyAction(s, move(to));
      expect(events).toContainEqual({ type: 'aim', by: c.id, dir: 2 });
      expect(enemy(state, c.id)).toMatchObject({ aim: 2, facing: 2 });
    }
  });

  it('does not aim at distance 7, off-line, or through lava, a wall, or another unit', () => {
    const far = lineState(hex(3, 6));
    far.s.enemies[0].pos = hex(3, -1);
    expect(enemy(applyAction(far.s, move(hex(3, 7))).state, far.c.id)!.aim).toBeNull();

    const off = lineState(hex(4, 3));
    expect(enemy(applyAction(off.s, move(hex(4, 4))).state, off.c.id)!.aim).toBeNull();

    for (const block of ['lava', 'wall'] as const) {
      const w = lineState(hex(3, 3));
      w.s.tiles[key(hex(3, 2))] = block;
      expect(enemy(applyAction(w.s, move(hex(3, 4))).state, w.c.id)!.aim).toBeNull();
    }

    const u = lineState(hex(3, 3));
    addEnemy(u.s, 'brute', hex(3, 2));
    expect(enemy(applyAction(u.s, move(hex(3, 4))).state, u.c.id)!.aim).toBeNull();
  });

  it('threats() shows the readied charge line, running past the player (who moves first)', () => {
    const { s } = lineState(hex(3, 3), { aim: 2 });
    const line = threats(s).lines.find((l) => l.kind === 'charge')!;
    expect(line.path[0]).toEqual(hex(3, 1));
    expect(line.path).toContainEqual(hex(3, 4)); // stepping back along the line is not safe
    expect(line.path.at(-1)).toEqual(hex(3, 7)); // board edge
  });

  it('threats() charge line stops at an enemy that will still be standing there', () => {
    const { s } = lineState(hex(5, 3), { aim: 2 });
    addEnemy(s, 'brute', hex(3, 3));
    const line = threats(s).lines.find((l) => l.kind === 'charge')!;
    expect(line.path.at(-1)).toEqual(hex(3, 3));
  });

  it('charges until it hits a unit: that unit takes 1 damage and the charger stops adjacent', () => {
    const { s, c } = lineState(hex(3, 4), { aim: 2 });
    const { state, events } = applyAction(s, move(hex(3, 5))); // stays in the line
    expect(events).toContainEqual({ type: 'charge', id: c.id, from: hex(3, 0), to: hex(3, 4) });
    expect(events).toContainEqual({ type: 'attack', kind: 'charge', by: c.id, target: PLAYER_ID });
    expect(state.player.hp).toBe(2);
    expect(enemy(state, c.id)!.aim).toBeNull();
  });

  it('misses a player who stepped out of the line, and runs to the board edge', () => {
    const { s, c } = lineState(hex(3, 4), { aim: 2 });
    const { state, events } = applyAction(s, move(hex(4, 4)));
    expect(events).toContainEqual({ type: 'charge', id: c.id, from: hex(3, 0), to: hex(3, 7) });
    expect(state.player.hp).toBe(3);
  });

  it('stops in front of a wall', () => {
    const { s, c } = lineState(hex(1, 3), { aim: 2 });
    s.tiles[key(hex(3, 3))] = 'wall';
    const { state, events } = applyAction(s, move(hex(1, 4)));
    expect(events).toContainEqual({ type: 'charge', id: c.id, from: hex(3, 0), to: hex(3, 2) });
    expect(state.player.hp).toBe(3);
  });

  it('charges into lava and dies', () => {
    const { s, c } = lineState(hex(1, 3), { aim: 2 });
    s.tiles[key(hex(3, 3))] = 'lava';
    const { state, events } = applyAction(s, move(hex(1, 4)));
    expect(events).toContainEqual({ type: 'charge', id: c.id, from: hex(3, 0), to: hex(3, 3) });
    expect(events).toContainEqual({ type: 'fall', id: c.id });
    expect(enemy(state, c.id)).toBeUndefined();
    expect(state.kills).toBe(1);
  });

  it('a charge that hits another enemy damages it and stops adjacent', () => {
    const { s, c } = lineState(hex(1, 3), { aim: 2 });
    const b = addEnemy(s, 'brute', hex(3, 3));
    const { events, state } = applyAction(s, move(hex(1, 4)));
    expect(events).toContainEqual({ type: 'charge', id: c.id, from: hex(3, 0), to: hex(3, 2) });
    expect(events).toContainEqual({ type: 'attack', kind: 'charge', by: c.id, target: b.id });
    expect(enemy(state, b.id)!.hp).toBe(1);
    expect(enemy(state, c.id)!.hp).toBe(2);
  });

  it('rests after charging: reload is set and it does not aim the next turn', () => {
    const { s, c } = lineState(hex(3, 4), { aim: 2 });
    const s1 = applyAction(s, move(hex(4, 4))).state; // dodge sideways; charger runs to the edge
    expect(enemy(s1, c.id)).toMatchObject({ aim: null, reload: 1 });

    // Constructed: reloading charger with a perfect line does not aim, a ready one does.
    const reloading = lineState(hex(3, 3), { reload: 1 });
    const r = enemy(applyAction(reloading.s, move(hex(3, 4))).state, reloading.c.id)!;
    expect(r.aim).toBeNull();
    expect(r.reload).toBe(0);
    const ready = lineState(hex(3, 3));
    expect(enemy(applyAction(ready.s, move(hex(3, 4))).state, ready.c.id)!.aim).toBe(2);
  });

  it('bashing a charger cancels its readied charge', () => {
    const make = () => {
      const s = blankState(P);
      const c = addEnemy(s, 'charger', at(P, 5), { aim: 2 }); // adjacent, aiming at us
      return { s, c };
    };
    // Control: stepping along the line gets rammed.
    const control = make();
    const cr = applyAction(control.s, move(at(P, 2)));
    expect(cr.events).toContainEqual({ type: 'charge', id: control.c.id, from: at(P, 5), to: P });
    expect(cr.events).toContainEqual({ type: 'attack', kind: 'charge', by: control.c.id, target: PLAYER_ID });
    expect(cr.state.player.hp).toBe(2);

    const { s, c } = make();
    const { state, events } = applyAction(s, bash(c.pos));
    expect(has(events, 'charge')).toBe(false);
    expect(events.some((e) => e.type === 'attack' && e.kind === 'charge')).toBe(false);
    expect(state.player.hp).toBe(3);
    expect(enemy(state, c.id)).toMatchObject({ aim: null, hp: 2 });
  });
});

describe('fuzz: greedy bot mixed with random actions', () => {
  function checkInvariants(s: GameState): void {
    const spots = new Set<string>([key(s.player.pos)]);
    expect(['floor', 'stairs']).toContain(s.tiles[key(s.player.pos)]);
    expect(s.player.hp).toBeGreaterThanOrEqual(0);
    expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
    expect(s.player.bashCd).toBeGreaterThanOrEqual(0);
    expect(s.player.bashCd).toBeLessThanOrEqual(3);
    expect(s.status === 'dead').toBe(s.player.hp === 0);
    for (const e of s.enemies) {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.hp).toBeLessThanOrEqual(e.maxHp);
      expect(s.tiles[key(e.pos)]).toBe('floor');
      expect(spots.has(key(e.pos))).toBe(false);
      spots.add(key(e.pos));
      expect(e.reload).toBeGreaterThanOrEqual(0);
      if (e.aim !== null) expect([0, 1, 2, 3, 4, 5]).toContain(e.aim);
    }
    for (const b of s.bombs) {
      expect(s.tiles[key(b.pos)]).toBeDefined();
      expect(b.fuse).toBeGreaterThan(0);
    }
  }

  it('keeps invariants over 40 runs and replays exactly', { timeout: 60_000 }, () => {
    let bashes = 0;
    for (let run = 1; run <= 40; run++) {
      const rng = new Rng(run * 104729 + 13);
      let s = newRun(run);
      let code = '';
      let lastKills = 0;
      for (let i = 0; i < 400 && s.status === 'playing'; i++) {
        const acts = legalActions(s);
        const a: Action = rng.next() < 0.2 ? rng.pick(acts) : greedyAction(s);
        const c = encodeAction(s, a);
        if (a.type === 'bash') bashes++;
        code += c;
        s = applyAction(s, a).state;
        checkInvariants(s);
        expect(s.kills).toBeGreaterThanOrEqual(lastKills);
        lastKills = s.kills;
      }
      expect(replay(run, code)).toEqual(s);
    }
    expect(bashes).toBeGreaterThan(0);
  });
});
