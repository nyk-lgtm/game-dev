import { describe, expect, it } from 'vitest';
import type { Enemy } from '../../src/afterglow/core';
import { SpatialHash } from '../../src/afterglow/core/spatial';
import { Rng } from '../../src/shared/rng';

function fake(id: number, x: number, y: number): Enemy {
  return { id, x, y, alive: true, r: 5 } as Enemy;
}

function layout(rng: Rng, n: number, span: number): Enemy[] {
  const out: Enemy[] = [];
  for (let i = 0; i < n; i++) out.push(fake(i + 1, (rng.next() - 0.5) * span, (rng.next() - 0.5) * span));
  return out;
}

function queryIds(h: SpatialHash, x: number, y: number, r: number): number[] {
  const ids: number[] = [];
  h.query(x, y, r, (e) => ids.push(e.id));
  return ids;
}

describe('SpatialHash', () => {
  for (const size of [32, 64, 150]) {
    it(`query covers every enemy within the radius (cell size ${size}, random layouts)`, () => {
      const rng = new Rng(size);
      for (let trial = 0; trial < 20; trial++) {
        const enemies = layout(rng, 300, 1500);
        const h = new SpatialHash(size);
        h.rebuild(enemies);
        for (let q = 0; q < 20; q++) {
          const x = (rng.next() - 0.5) * 1500;
          const y = (rng.next() - 0.5) * 1500;
          const r = 10 + rng.next() * 400;
          const got = queryIds(h, x, y, r);
          expect(new Set(got).size).toBe(got.length); // no duplicates
          const brute = enemies.filter((e) => (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r).map((e) => e.id);
          for (const id of brute) expect(got).toContain(id);
          // Anything extra must still be inside the bounding box padded by a cell.
          const byId = new Map(enemies.map((e) => [e.id, e]));
          for (const id of got) {
            const e = byId.get(id)!;
            expect(Math.abs(e.x - x)).toBeLessThanOrEqual(r + size);
            expect(Math.abs(e.y - y)).toBeLessThanOrEqual(r + size);
          }
        }
      }
    });
  }

  it('handles negative coordinates and cell boundaries', () => {
    const h = new SpatialHash(64);
    const es = [fake(1, -0.001, -0.001), fake(2, 0, 0), fake(3, -64, -64), fake(4, 63.999, 64), fake(5, -1000, 1000)];
    h.rebuild(es);
    const near = queryIds(h, 0, 0, 1);
    expect(near).toContain(1);
    expect(near).toContain(2);
    expect(near).not.toContain(5);
    expect(queryIds(h, -64, -64, 0.5)).toContain(3);
    expect(queryIds(h, 64, 64, 1)).toContain(4);
    expect(queryIds(h, -1000, 1000, 1)).toEqual([5]);
  });

  it('skips dead enemies, both at rebuild time and after', () => {
    const h = new SpatialHash(64);
    const a = fake(1, 10, 10);
    const b = fake(2, 12, 12);
    b.alive = false;
    h.rebuild([a, b]);
    expect(queryIds(h, 10, 10, 50)).toEqual([1]);
    a.alive = false;
    expect(queryIds(h, 10, 10, 50)).toEqual([]);
  });

  it('rebuild reflects moved and removed enemies (no stale entries)', () => {
    const h = new SpatialHash(64);
    const a = fake(1, 0, 0);
    const b = fake(2, 500, 500);
    h.rebuild([a, b]);
    a.x = 900;
    a.y = 900;
    h.rebuild([a]);
    expect(queryIds(h, 0, 0, 100)).toEqual([]);
    expect(queryIds(h, 500, 500, 100)).toEqual([]);
    expect(queryIds(h, 900, 900, 10)).toEqual([1]);
  });

  it('stays correct after the cell map is flushed for being too large', () => {
    const rng = new Rng(99);
    const h = new SpatialHash(8);
    // Spread over many tiny cells to exceed the internal flush threshold.
    h.rebuild(layout(rng, 7000, 20000));
    const enemies = layout(rng, 200, 800);
    h.rebuild(enemies);
    const got = queryIds(h, 0, 0, 300);
    const brute = enemies.filter((e) => e.x * e.x + e.y * e.y <= 300 * 300).map((e) => e.id);
    for (const id of brute) expect(got).toContain(id);
    expect(new Set(got).size).toBe(got.length);
    for (const id of got) expect(enemies.some((e) => e.id === id)).toBe(true);
  });

  it('empty hash and zero-radius queries are safe', () => {
    const h = new SpatialHash(64);
    h.rebuild([]);
    expect(queryIds(h, 0, 0, 100)).toEqual([]);
    h.rebuild([fake(1, 5, 5)]);
    expect(queryIds(h, 5, 5, 0)).toEqual([1]);
  });
});
