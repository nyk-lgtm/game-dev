import { describe, expect, it } from 'vitest';
import {
  DIRS,
  MIN_APART,
  add,
  bombTrapped,
  distance,
  eq,
  floorEnds,
  generateFloor,
  hex,
  key,
  legalMoves,
  neighbors,
  previewAction,
  type Hex,
  type Tile,
} from '../../src/telegraph/core';
import { addEnemy, blankState } from './helpers';

const move = (to: Hex) => ({ type: 'move' as const, to });
const at = (h: Hex, dir: number, n = 1): Hex => {
  let cur = h;
  for (let i = 0; i < n; i++) cur = add(cur, DIRS[dir]);
  return cur;
};

describe('playtest 3: the preview tells your kills from friendly fire', () => {
  it("an archer shooting another archer is the enemies' kill, not yours", () => {
    const s = blankState(hex(0, 8));
    const a = addEnemy(s, 'archer', hex(3, 0), { aim: 2 });
    const b = addEnemy(s, 'archer', at(hex(3, 0), 2, 2));
    const o = previewAction(s, move(legalMoves(s)[0]));
    expect(o.kills).toEqual([]);
    expect(o.friendlyKills).toEqual([b.id]);
    expect(o.friendlyKills).not.toContain(a.id);
  });

  it("a plain step beside a charged pylon credits its zaps to the enemies; a lunge's kill is yours", () => {
    const P = hex(1, 5);
    const s = blankState(P);
    const PY = hex(4, 2);
    addEnemy(s, 'pylon', PY, { aim: 0 });
    const zapped = addEnemy(s, 'archer', at(PY, 1, 2), { reload: 1 });
    const hurt = addEnemy(s, 'brute', at(PY, 4, 2));
    // A plain step: no blow of yours lands.
    const step = legalMoves(s).find((m) => neighbors(m).every((n) => !s.enemies.some((e) => eq(e.pos, n))))!;
    const o = previewAction(s, move(step));
    expect(o.kills).toEqual([]);
    expect(o.wounded).toEqual([]);
    expect(o.friendlyKills).toContain(zapped.id);
    expect(o.friendlyWounds).toContain(hurt.id);
    // Lunge the brute (2 damage kills it): that one is yours, the zapped archer is still theirs.
    const s2 = blankState(at(hurt.pos, 5, 2));
    addEnemy(s2, 'pylon', PY, { aim: 0 });
    const z2 = addEnemy(s2, 'archer', at(PY, 1, 2), { reload: 1 });
    const br = addEnemy(s2, 'brute', hurt.pos);
    const o2 = previewAction(s2, move(at(hurt.pos, 5)));
    expect(o2.kills).toEqual([br.id]);
    expect(o2.friendlyKills).toEqual([z2.id]);
  });
});

describe('playtest 3: bomb traps', () => {
  // A two-hex pocket: P and its neighbour N, walled all round.
  const pocket = (P: Hex) => {
    const N = neighbors(P)[0];
    const walls: [Hex, Tile][] = [...neighbors(P), ...neighbors(N)]
      .filter((h) => !eq(h, P) && !eq(h, N))
      .map((h) => [h, 'wall']);
    return { N, walls };
  };

  it('stepping into a dead end a bomb will be lobbed at is flagged as a trap', () => {
    const P = hex(3, 5);
    const { N, walls } = pocket(P);
    const s = blankState(N, { tiles: walls });
    const B = hex(3, 1);
    expect(s.tiles[key(B)]).toBe('floor');
    expect(distance(B, P)).toBeGreaterThanOrEqual(2);
    expect(distance(B, P)).toBeLessThanOrEqual(4);
    addEnemy(s, 'bomber', B);
    const o = previewAction(s, move(P));
    expect(o.damageTaken).toBe(0);
    expect(o.next.some((t) => t.kind === 'bomb')).toBe(true);
    expect(o.trapped).toBe(true);
  });

  it('on open floor a bomb at your feet is no trap: two steps clear it', () => {
    const s = blankState(hex(3, 3));
    addEnemy(s, 'bomber', hex(3, 0));
    const o = previewAction(s, move(hex(3, 4)));
    expect(o.next.some((t) => t.kind === 'bomb')).toBe(true);
    expect(o.trapped).toBe(false);
    s.bombs.push({ pos: s.player.pos, by: 1, fuse: 2 });
    expect(bombTrapped(s)).toBe(false);
  });
});

describe('playtest 3: starts and stairs vary', () => {
  it('start and stairs sit on the rim, far apart, and the stairs never repeat on the next floor', () => {
    const starts = new Set<string>();
    const stairs = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      let prev: { start: Hex; stairs: Hex } | null = null;
      for (let d = 1; d <= 10; d++) {
        const e = floorEnds(seed, d);
        expect(distance(e.start, e.stairs)).toBeGreaterThanOrEqual(MIN_APART);
        if (prev) expect(eq(prev.stairs, e.stairs)).toBe(false);
        const f = generateFloor(seed, d);
        expect(f.start).toEqual(e.start);
        expect(f.stairs).toEqual(e.stairs);
        expect(f.tiles[key(f.stairs)]).toBe('stairs');
        starts.add(key(e.start));
        stairs.add(key(e.stairs));
        prev = e;
      }
    }
    expect(starts.size).toBeGreaterThan(15);
    expect(stairs.size).toBeGreaterThan(15);
  });
});
