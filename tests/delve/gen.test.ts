import { describe, expect, it } from 'vitest';
import { MAX_DEPTH, MONSTERS, SIZE, distances, generateFloor, newGame } from '../../src/delve/core';

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const DEPTHS = Array.from({ length: MAX_DEPTH }, (_, i) => i + 1);
const at = (x: number, y: number) => y * SIZE + x;

describe('floor generation', () => {
  it('every floor 1..10 for 100 seeds is well formed', () => {
    const bad: string[] = [];
    const check = (ok: boolean, msg: string) => {
      if (!ok) bad.push(msg);
    };
    for (const seed of SEEDS)
      for (const depth of DEPTHS) {
        const f = generateFloor(seed, depth);
        const t = f.level.tiles;
        const tag = `seed ${seed} depth ${depth}`;
        check(t.length === SIZE * SIZE && f.level.seen.length === SIZE * SIZE && !f.level.seen.some(Boolean), `${tag}: size`);
        // A solid border, so nothing (not even a wraith) can leave the map.
        for (let i = 0; i < SIZE; i++)
          for (const k of [at(i, 0), at(i, SIZE - 1), at(0, i), at(SIZE - 1, i)]) check(t[k] === 'wall', `${tag}: open border at ${k}`);
        check(t[at(f.start.x, f.start.y)] === 'floor', `${tag}: start on ${t[at(f.start.x, f.start.y)]}`);
        const dist = distances(t, f.start);
        // Everything walkable is connected to the start.
        for (let k = 0; k < t.length; k++) if (t[k] !== 'wall' && t[k] !== 'pillar') check(dist[k] >= 0, `${tag}: unreachable ${t[k]} at ${k % SIZE},${Math.floor(k / SIZE)}`);
        const stairs = t.flatMap((x, k) => (x === 'stairs' ? [k] : []));
        if (depth === MAX_DEPTH) check(stairs.length === 0, `${tag}: stairs on the boss floor`);
        else check(stairs.length === 1 && dist[stairs[0]] > 5, `${tag}: stairs ${stairs} at distance ${dist[stairs[0]]}`);
        const used = new Set<number>([at(f.start.x, f.start.y)]);
        for (const m of [...f.monsters, ...f.items]) {
          const k = at(m.x, m.y);
          check(t[k] === 'floor', `${tag}: ${m.kind} on ${t[k]} at ${m.x},${m.y}`);
          check(dist[k] > 0, `${tag}: ${m.kind} unreachable at ${m.x},${m.y}`);
          check(!used.has(k), `${tag}: overlap at ${m.x},${m.y}`);
          used.add(k);
        }
        for (const m of f.monsters) {
          check(m.hp === MONSTERS[m.kind].hp && m.maxHp === m.hp && !m.awake && m.stun === 0, `${tag}: ${m.kind} state`);
          const [lo, hi] = MONSTERS[m.kind].depths;
          if (depth !== MAX_DEPTH) check(depth >= lo && depth <= hi, `${tag}: ${m.kind} out of its depths`);
        }
        check(f.monsters.filter((m) => m.kind === 'warden').length === (depth === MAX_DEPTH ? 1 : 0), `${tag}: wardens`);
        if (depth !== MAX_DEPTH) check(f.monsters.length >= 3, `${tag}: only ${f.monsters.length} monsters`);
        for (const it of f.items) {
          if (it.kind === 'weapon' || it.kind === 'armor') check(it.value >= 0 && it.value <= 4, `${tag}: gear tier ${it.value}`);
          if (it.kind === 'gold') check(it.value > 0, `${tag}: empty gold`);
        }
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('is deterministic per seed and depth, and differs between seeds and depths', () => {
    for (const seed of [1, 7, 12345, 0xffffffff])
      for (const depth of DEPTHS) expect(generateFloor(seed, depth)).toEqual(generateFloor(seed, depth));
    expect(generateFloor(1, 3).level.tiles).not.toEqual(generateFloor(2, 3).level.tiles);
    expect(generateFloor(1, 3).level.tiles).not.toEqual(generateFloor(1, 4).level.tiles);
    expect(newGame(99)).toEqual(newGame(99));
  });

  it('has doors and pillars somewhere, and more monsters deeper', () => {
    let doors = 0;
    let pillars = 0;
    const count = (d: number) => SEEDS.slice(0, 20).reduce((n, seed) => n + generateFloor(seed, d).monsters.length, 0);
    for (const seed of SEEDS.slice(0, 20)) {
      const t = generateFloor(seed, 3).level.tiles;
      doors += t.filter((x) => x === 'door').length;
      pillars += t.filter((x) => x === 'pillar').length;
    }
    expect(doors).toBeGreaterThan(20);
    expect(pillars).toBeGreaterThan(10);
    expect(count(8)).toBeGreaterThan(count(2));
  });

  it("the boss floor is the Warden's pillared hall with its guard", () => {
    const f = generateFloor(5, MAX_DEPTH);
    expect(f.monsters.map((m) => m.kind).sort()).toEqual(['skeleton', 'skeleton', 'skeleton', 'skeleton', 'warden']);
    expect(f.level.tiles.filter((x) => x === 'pillar').length).toBe(4);
  });
});
