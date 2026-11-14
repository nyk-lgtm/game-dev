import { describe, expect, it } from 'vitest';
import {
  MAPS,
  WORLD,
  applyAction,
  chebyshev,
  chestGold,
  detourLimit,
  explorePath,
  fov,
  los,
  markerAt,
  newGame,
  passable,
  pathTo,
  pathToward,
  planWalk,
  replay,
  spawnPositions,
  type GameState,
  type MapId,
  type Pos,
} from '../../src/lantern/core';

/** The player in the Deep Hollow at `pos`, no monsters, the cells `known` marked seen. */
function hollow(pos: Pos, known: (x: number, y: number) => boolean): GameState {
  const s = newGame(1);
  const m = WORLD.cave2;
  s.player.map = 'cave2';
  s.player.pos = pos;
  s.monsters = [];
  let seen = '';
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) seen += known(x, y) ? '1' : '0';
  s.seen.cave2 = seen;
  return s;
}

describe('tap walks (rules v3)', () => {
  it('a tap into the King’s hall from the east pocket never loops ~45 turns round the map', () => {
    // Everything known except the hall's door corridor: the only known way "closer" is the long loop.
    const s = hollow({ x: 28, y: 6 }, (x, y) => !(y >= 10 && y <= 11 && x >= 21 && x <= 24));
    const target = { x: 24, y: 6 };
    expect(pathTo(s, target)).toBeNull();
    expect(detourLimit(chebyshev(s.player.pos, target))).toBe(8);
    expect(planWalk(s, target)).toBeNull(); // "No way through from here." plus the map's route note
    expect(MAPS.cave2.notes?.some((n) => target.x >= n.x0 && target.x <= n.x1 && target.y >= n.y0 && target.y <= n.y1)).toBe(true);
  });

  it('when only a monster blocks the way, the walk goes straight there and stops at it', () => {
    const s = hollow({ x: 28, y: 6 }, () => true);
    s.monsters = [{ id: 0, kind: 'skeleton', map: 'cave2', pos: { x: 24, y: 11 }, hp: 16 }];
    const plan = planWalk(s, { x: 24, y: 6 })!;
    expect(plan.blocked).toBe(true);
    expect(plan.direct).toBe(true);
    expect(plan.dirs.length).toBeLessThan(15);
  });

  it('heading into the dark still goes straight on down a tunnel', () => {
    let s = hollow({ x: 1, y: 14 }, (x, y) => y === 14 && x <= 8);
    const dirs = pathToward(s, { x: 28, y: 14 })!;
    expect(dirs.length).toBe(7);
    for (const d of dirs) s = applyAction(s, { type: 'step', dir: d }).state;
    expect(s.player.pos).toEqual({ x: 8, y: 14 });
  });
});

describe('sight and reach through wall corners (rules v3)', () => {
  it('you can’t see into the King’s hall through the diagonal gap at (27,3)', () => {
    const lit = fov(WORLD.cave2, { x: 27, y: 3 });
    for (let y = 4; y <= 9; y++)
      for (let x = 21; x <= 26; x++) expect(lit.has(y * WORLD.cave2.w + x), `${x},${y}`).toBe(false);
    expect(los(WORLD.cave2, { x: 27, y: 3 }, { x: 25, y: 5 })).toBe(false);
    // The wall right behind a corner still shows, so rooms draw whole.
    expect(los(WORLD.cave2, { x: 1, y: 1 }, { x: 0, y: 0 })).toBe(true);
  });

  it('a monster can’t hit you across a wall corner', () => {
    const s = hollow({ x: 19, y: 4 }, () => true);
    s.monsters = [{ id: 0, kind: 'king', map: 'cave2', pos: { x: 20, y: 3 }, hp: 70 }];
    for (let k = 0; k < 30; k++) {
      s.rolls = k;
      const r = applyAction(s, { type: 'wait' });
      expect(r.events.some((e) => e.type === 'hit' || e.type === 'miss')).toBe(false);
    }
  });
});

describe('auto-explore', () => {
  it('uncovers all of the Hollow and opens its chest, then has nothing left', () => {
    let s: GameState = newGame(1);
    s.player.map = 'cave1';
    s.player.pos = { x: 1, y: 2 };
    s.monsters = [];
    s = applyAction(s, { type: 'wait' }).state;
    let steps = 0;
    for (let plan = explorePath(s); plan && steps < 1500; plan = explorePath(s), steps++)
      s = applyAction(s, { type: 'step', dir: plan.dirs[0] }).state;
    expect(explorePath(s)).toBeNull();
    expect(s.done).toContain('cave-chest');
    expect(s.player.map).toBe('cave1');
    const m = WORLD.cave1;
    for (let i = 0; i < m.w * m.h; i++) {
      const p = { x: i % m.w, y: Math.floor(i / m.w) };
      if (passable(m, p)) expect(s.seen.cave1![i], `${p.x},${p.y}`).toBe('1');
    }
    expect(steps).toBeLessThan(400);
    expect(explorePath(newGame(1))).toBeNull(); // lit maps have nothing to explore
  });
});

describe('healing (rules v3)', () => {
  it('wounds heal in daylight but not in the dark', () => {
    let day = newGame(1);
    day.player.map = 'forest';
    day.player.pos = { x: 10, y: 4 };
    day.monsters = [];
    day.player.hp = 5;
    let dark = hollow({ x: 1, y: 14 }, () => true);
    dark.player.hp = 5;
    for (let i = 0; i < 30; i++) {
      day = applyAction(day, { type: 'wait' }).state;
      dark = applyAction(dark, { type: 'wait' }).state;
    }
    expect(day.player.hp).toBe(15);
    expect(dark.player.hp).toBe(5);
  });
});

describe('seeded runs (rules v3)', () => {
  it('monster spots shift per seed, near where the map draws them, on free ground; the King stays put', () => {
    const drawn = (Object.keys(WORLD) as MapId[]).flatMap((id) => WORLD[id].monsters.map((mo) => ({ ...mo, map: id })));
    let moved = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const spots = spawnPositions(seed);
      expect(spots).toEqual(spawnPositions(seed));
      expect(spots.map((x) => x.kind)).toEqual(drawn.map((x) => x.kind));
      const keys = new Set<string>();
      spots.forEach((sp, i) => {
        const m = WORLD[sp.map];
        expect(sp.map).toBe(drawn[i].map);
        expect(passable(m, sp.pos) && !markerAt(m, sp.pos)).toBe(true);
        expect(chebyshev(sp.pos, drawn[i].pos)).toBeLessThanOrEqual(3);
        keys.add(`${sp.map}:${sp.pos.x},${sp.pos.y}`);
        if (sp.kind === 'king') expect(sp.pos).toEqual(drawn[i].pos);
        if (sp.pos.x !== drawn[i].pos.x || sp.pos.y !== drawn[i].pos.y) moved++;
      });
      expect(keys.size).toBe(spots.length);
      const s = newGame(seed);
      expect(s.monsters.map((mo) => mo.pos)).toEqual(spots.map((x) => x.pos));
      expect(s.monsters.map((mo) => mo.home)).toEqual(spots.map((x) => x.pos));
    }
    expect(moved).toBeGreaterThan(30 * 5);
  });

  it('chest gold varies by seed within ±40% and replays the same', () => {
    const golds = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const g = chestGold(seed, 'deep-chest', 25);
      expect(g).toBeGreaterThanOrEqual(15);
      expect(g).toBeLessThanOrEqual(35);
      expect(chestGold(seed, 'deep-chest', 25)).toBe(g);
      golds.add(g);
    }
    expect(golds.size).toBeGreaterThan(8);
    expect(chestGold(1, 'cave-chest', 0)).toBe(0);
    expect(replay(5, '').monsters).toEqual(newGame(5).monsters);
  });
});
