import { describe, expect, it } from 'vitest';
import { BASE_WEAPONS, PASSIVES, WEAPONS, step, type PassiveId, type WeaponId } from '../../src/afterglow/core';
import { calmWorld, makeImmortal, put, secondsToSteps } from './helpers';
import { recomputeStats } from '../../src/afterglow/core';

const ALL = Object.keys(WEAPONS) as WeaponId[];

describe('weapons', () => {
  it('registers 20 weapons whose ids match their keys', () => {
    expect(ALL).toHaveLength(20);
    for (const id of ALL) {
      expect(WEAPONS[id].id).toBe(id);
      expect(WEAPONS[id].maxLevel).toBeGreaterThanOrEqual(1);
      expect(WEAPONS[id].levels.length).toBeGreaterThanOrEqual(1);
    }
  });

  for (const id of ALL) {
    it(`${id} damages a nearby enemy when it is the only weapon`, () => {
      const w = calmWorld(21);
      makeImmortal(w);
      w.weapons = [{ id, level: 1, cd: 0, t: 0, dealt: 0 }];
      // Facing up so Lance/Railgun beams point at the target.
      w.player.fx = 0;
      w.player.fy = -1;
      // A tough brute so it survives long enough to be measured; it walks
      // toward the player, which also lets Mines trip.
      const e = put(w, 'brute', 0, -60, 1e9);
      const hp0 = e.hp;
      for (let i = 0; i < secondsToSteps(6) && !(w.dealt[id]! > 0); i++) step(w, 0, 0);
      expect(w.dealt[id] ?? 0).toBeGreaterThan(0);
      expect(e.hp).toBeLessThan(hp0);
    });
  }

  it('weapons do nothing with no enemies around (no damage bookkeeping)', () => {
    for (const id of ALL) {
      const w = calmWorld(5);
      w.weapons = [{ id, level: 1, cd: 0, t: 0, dealt: 0 }];
      for (let i = 0; i < 120; i++) step(w, 0, 0);
      expect(w.dealt[id] ?? 0).toBe(0);
    }
  });

  it('higher weapon levels never do less total damage over the same fight', () => {
    // Compare level 1 and max level of the same weapon against a sturdy target.
    for (const id of ['pulse', 'nova', 'halo', 'orbit'] as WeaponId[]) {
      const dealt = (level: number) => {
        const w = calmWorld(9);
        makeImmortal(w);
        w.weapons = [{ id, level, cd: 0, t: 0, dealt: 0 }];
        put(w, 'brute', 0, -50, 1e9);
        for (let i = 0; i < secondsToSteps(8); i++) step(w, 0, 0);
        return w.dealt[id] ?? 0;
      };
      expect(dealt(WEAPONS[id].maxLevel), id).toBeGreaterThanOrEqual(dealt(1));
    }
  });

  it('mines detonate when an enemy walks over them and are consumed', () => {
    const w = calmWorld(2);
    makeImmortal(w);
    w.weapons = [{ id: 'mines', level: 1, cd: 0, t: 0, dealt: 0 }];
    put(w, 'brute', 0, -200, 1e9);
    let sawMine = false;
    let detonated = false;
    for (let i = 0; i < secondsToSteps(12) && !detonated; i++) {
      step(w, 0, 0);
      if (w.mines.length > 0) sawMine = true;
      if (w.fx.some((f) => f.type === 'boom')) detonated = true;
    }
    expect(sawMine).toBe(true);
    expect(detonated).toBe(true);
  });

  it('lance only hits along the facing axis (ahead and behind) at level 1', () => {
    const run = (fx: number, fy: number) => {
      const w = calmWorld(3);
      makeImmortal(w);
      w.weapons = [{ id: 'lance', level: 1, cd: 0, t: 0, dealt: 0 }];
      w.player.fx = fx;
      w.player.fy = fy;
      const e = put(w, 'brute', 0, -100, 1e9);
      e.speed = 0; // stay put
      for (let i = 0; i < 20; i++) step(w, 0, 0);
      return w.dealt.lance ?? 0;
    };
    expect(run(0, -1)).toBeGreaterThan(0);
    expect(run(0, 1)).toBeGreaterThan(0);
    expect(run(1, 0)).toBe(0);
  });

  it('weapon kills of weak enemies produce gems and count kills', () => {
    const w = calmWorld(4);
    makeImmortal(w);
    w.weapons = [{ id: 'nova', level: 1, cd: 0, t: 0, dealt: 0 }];
    put(w, 'drone', 40, 0, 1);
    put(w, 'drone', -40, 0, 1);
    step(w, 0, 0);
    // Nova fires on the first step (cd 0): both die.
    expect(w.kills).toBe(2);
    expect(w.pickups.filter((p) => p.kind === 'gem').length).toBeGreaterThan(0);
  });

  it('every passive is the catalyst for exactly one base weapon, and every base weapon evolves', () => {
    const catalysts = BASE_WEAPONS.map((id) => WEAPONS[id].evolvesWith);
    expect(new Set(catalysts).size).toBe(BASE_WEAPONS.length);
    for (const id of Object.keys(PASSIVES) as PassiveId[]) expect(catalysts, id).toContain(id);
    for (const id of BASE_WEAPONS) {
      const into = WEAPONS[id].evolvesInto!;
      expect(WEAPONS[into].from).toBe(id);
    }
  });

  it('gravity wells drag enemies toward their center', () => {
    const w = calmWorld(6);
    makeImmortal(w);
    w.weapons = [{ id: 'well', level: 1, cd: 0, t: 0, dealt: 0 }];
    const e = put(w, 'brute', 0, -150, 1e9);
    e.speed = 0;
    step(w, 0, 0);
    expect(w.wells.length).toBe(1);
    const well = w.wells[0];
    // Nudge the brute off-center inside the well and watch it get pulled in.
    e.x = well.x + 50;
    e.y = well.y;
    for (let i = 0; i < 30; i++) step(w, 0, 0);
    expect(Math.hypot(e.x - well.x, e.y - well.y)).toBeLessThan(50);
    expect(w.dealt.well ?? 0).toBeGreaterThan(0);
  });

  it('wellspring heals the player while it drains', () => {
    const w = calmWorld(7);
    makeImmortal(w);
    w.weapons = [{ id: 'wellspring', level: 1, cd: 0, t: 0, dealt: 0 }];
    for (let i = 0; i < 3; i++) put(w, 'brute', 60 - i * 60, -80, 1e9).speed = 0;
    w.player.hp = 10;
    for (let i = 0; i < secondsToSteps(2); i++) step(w, 0, 0);
    expect(w.player.hp).toBeGreaterThan(10);
    expect(w.tethers.length).toBe(3);
  });

  it('event horizon sends loose gems to the player', () => {
    const w = calmWorld(8);
    makeImmortal(w);
    w.weapons = [{ id: 'horizon', level: 1, cd: 0, t: 0, dealt: 0 }];
    const e = put(w, 'brute', 0, -250, 1e9);
    e.speed = 0;
    step(w, 0, 0);
    const well = w.wells[0];
    w.pickups.push({ kind: 'gem', x: well.x + 30, y: well.y, value: 1, pulled: false, alive: true });
    step(w, 0, 0);
    expect(w.pickups.some((p) => p.kind === 'gem' && p.pulled)).toBe(true);
  });

  it('lance multicast beams come in mirrored pairs, front and back', () => {
    const hits = (ex: number, ey: number) => {
      const w = calmWorld(10);
      makeImmortal(w);
      w.weapons = [{ id: 'lance', level: 1, cd: 0, t: 0, dealt: 0 }];
      w.passives = { multicast: 1 };
      recomputeStats(w);
      w.player.fx = 0;
      w.player.fy = -1;
      const e = put(w, 'brute', ex, ey, 1e9);
      e.speed = 0;
      for (let i = 0; i < 20; i++) step(w, 0, 0);
      return w.dealt.lance ?? 0;
    };
    // The extra beam leans 0.35 rad off the facing axis; its twin points the opposite way.
    const off = 0.35;
    const r = 150;
    expect(hits(Math.sin(off) * r, -Math.cos(off) * r)).toBeGreaterThan(0);
    expect(hits(-Math.sin(off) * r, Math.cos(off) * r)).toBeGreaterThan(0);
  });

  it('multicast gives nova an echo burst', () => {
    const run = (multicast: number) => {
      const w = calmWorld(11);
      makeImmortal(w);
      w.weapons = [{ id: 'nova', level: 1, cd: 0, t: 0, dealt: 0 }];
      if (multicast) w.passives = { multicast };
      recomputeStats(w);
      put(w, 'brute', 0, -60, 1e9).speed = 0;
      for (let i = 0; i < 60; i++) step(w, 0, 0);
      return w.dealt.nova ?? 0;
    };
    expect(run(2)).toBeGreaterThan(run(0) * 1.5);
  });
});
