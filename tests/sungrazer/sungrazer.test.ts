import { describe, expect, it } from 'vitest';
import {
  COMET_R, LOCK, gravityAt, riseAt, MAX_LINK, MODE_IDS, REGRAB, START_Y, W, World, altitude, cinderX, cloneRun, decodeInputs, encodeInputs, heldAt,
  isLit, newRun, replay, step, target, type Ev, type Mode, type Run,
} from '../../src/sungrazer/core';
import { Rng } from '../../src/shared/rng';
import { SKILLS, playBot } from '../../scripts/sungrazer/bot';

/** A cheap, careless player: holds and lets go at random. */
function randomRun(seed: number, mode: Mode = 'n', maxTicks = 240 * 120): { run: Run; inputs: number[] } {
  const r = newRun(seed, mode);
  const rng = new Rng(seed ^ 0xabc);
  const inputs: number[] = [];
  let held = false;
  while (r.alive && r.tick < maxTicks) {
    if (rng.next() < 0.012) {
      held = !held;
      inputs.push(r.tick);
    }
    step(r, held);
  }
  return { run: r, inputs };
}

describe('sky', () => {
  it('is the same for a seed and mode, and grows in order', () => {
    const a = new World(77, 'n'), b = new World(77, 'n');
    a.ensure(3000);
    b.ensure(1500);
    b.ensure(3000);
    expect(JSON.stringify(a.stars)).toBe(JSON.stringify(b.stars));
    expect(JSON.stringify(a.cinders)).toBe(JSON.stringify(b.cinders));
    expect(JSON.stringify(a.motes)).toBe(JSON.stringify(b.motes));
    for (const arr of [a.stars, a.cinders, a.motes]) for (let i = 1; i < arr.length; i++) expect(arr[i].y).toBeGreaterThanOrEqual(arr[i - 1].y);
  });

  it('always has a next star in reach, and nothing overlaps', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 16; seed++)
      for (const mode of MODE_IDS) {
        const w = new World(seed, mode);
        w.ensure(4500);
        const spine = w.stars.filter((s) => s.spine);
        if (spine[0].y - START_Y > LOCK + 20) bad.push(`${seed}${mode}: first star too far`);
        for (let i = 1; i < spine.length; i++) {
          const p = spine[i - 1], s = spine[i];
          if (s.y - p.y < 17.9 || Math.hypot(s.x - p.x, s.y - p.y) > MAX_LINK + 1e-6 || s.x < 12 || s.x > W - 12) bad.push(`${seed}${mode}: link ${i}`);
          // Never stacked straight above: a plain upward fling shouldn't fly into the next star.
          if (Math.abs(s.x - p.x) < 12) bad.push(`${seed}${mode}: link ${i} is a column`);
        }
        for (let i = 0; i < w.stars.length; i++)
          for (let j = i + 1; j < w.stars.length && w.stars[j].y < w.stars[i].y + 60; j++) {
            const s = w.stars[i], t = w.stars[j];
            if (Math.hypot(s.x - t.x, s.y - t.y) <= s.r + t.r + 12) bad.push(`${seed}${mode}: stars ${s.id}/${t.id} overlap`);
          }
        // Cinders keep clear of every corona over their whole swing.
        let lo = 0;
        for (const c of w.cinders) {
          while (lo < w.stars.length && w.stars[lo].y < c.y - 40) lo++;
          for (let k = lo; k < w.stars.length && w.stars[k].y < c.y + 40; k++) {
            const s = w.stars[k];
            for (let t = 0; t < c.period; t += Math.max(1, Math.floor(c.period / 24)))
              if (Math.hypot(cinderX(c, t) - s.x, c.y - s.y) <= s.r + c.r + 9) bad.push(`${seed}${mode}: cinder ${c.id} near star ${s.id}`);
          }
        }
        for (const m of w.motes)
          for (const s of w.stars) if (Math.abs(s.y - m.y) < 20 && Math.hypot(m.x - s.x, m.y - s.y) <= s.r + COMET_R + 2) bad.push(`${seed}${mode}: mote ${m.id} in star ${s.id}`);
      }
    expect(bad).toEqual([]);
  });

  it('brings in cinders, pulsars and giants as you climb', () => {
    const w = new World(5, 'n');
    w.ensure(4000);
    const firstCinder = Math.min(...w.cinders.map((c) => c.y));
    expect(firstCinder).toBeGreaterThan(400);
    expect(w.stars.some((s) => s.kind === 'pulsar')).toBe(true);
    expect(w.stars.some((s) => s.kind === 'giant')).toBe(true);
    expect(Math.min(...w.stars.filter((s) => s.kind !== 'star').map((s) => s.y))).toBeGreaterThan(900);
    const shower = new World(5, 'm');
    shower.ensure(400);
    expect(shower.cinders.length).toBeGreaterThan(0);
  });
});

describe('flight', () => {
  it('holding grabs the nearest star in reach, swings at the tether length, and reels in', () => {
    const r = newRun(3);
    let t = 0;
    while (!r.tether && t++ < 400) step(r, true);
    expect(r.tether).not.toBeNull();
    const s = r.tether!.star;
    const d0 = r.tether!.r;
    expect(d0).toBeLessThanOrEqual(LOCK + 1e-9);
    for (let i = 0; i < 120; i++) step(r, true);
    expect(Math.abs(Math.hypot(r.x - s.x, r.y - s.y) - r.tether!.r)).toBeLessThan(1e-6);
    expect(r.tether!.r).toBeLessThan(d0);
    // Hold on long enough and you burn.
    while (r.alive && r.tick < 240 * 20) step(r, true);
    expect(r.alive).toBe(false);
    expect(r.cause === 'burn' || r.cause === 'void').toBe(true);
  });

  it('a press grabs once; the star just left can’t be re-grabbed at once', () => {
    const r = newRun(9);
    while (!r.tether && r.tick < 400) step(r, true);
    const s = r.tether!.star;
    for (let i = 0; i < 60; i++) step(r, true);
    step(r, false);
    expect(r.tether).toBeNull();
    step(r, true);
    // Still in reach of the same star, but it's off limits for a moment.
    if (Math.hypot(r.x - s.x, r.y - s.y) <= LOCK) expect(r.tether?.star ?? null).not.toBe(s);
    expect(r.since).toBeLessThan(REGRAB);
  });

  it('flying into a star is its own cause; the opening is gentler than later', () => {
    const w = new World(21, 'n');
    const s = w.stars[0];
    const r = newRun(21, 'n', w);
    r.x = s.x;
    r.y = s.y - 12;
    r.vx = 0;
    r.vy = 60;
    while (r.alive && r.tick < 240) step(r, false);
    expect(r.cause).toBe('star');
    expect(riseAt(0)).toBeLessThan(1);
    expect(riseAt(0)).toBeLessThan(riseAt(400) / 2);
    expect(gravityAt(0)).toBeLessThan(gravityAt(800));
    expect(riseAt(3000)).toBe(13);
  });

  it('does not touch the bottom of the screen while you dawdle: the void takes you', () => {
    const r = newRun(1);
    while (r.alive && r.tick < 240 * 30) step(r, false);
    expect(r.alive).toBe(false);
    expect(r.cause).toBe('void');
  });

  it('pulsars can only be grabbed while lit', () => {
    const w = new World(11, 'n');
    w.ensure(5000);
    const p = w.stars.find((s) => s.kind === 'pulsar')!;
    const r = newRun(11, 'n', w);
    r.x = p.x + 12;
    r.y = p.y;
    r.vx = 0;
    r.vy = 50;
    r.camY = p.y - 60;
    for (let t = 0; t < p.period; t += 7) {
      r.tick = t;
      const got = target(r);
      if (!isLit(p, t)) expect(got).not.toBe(p);
    }
  });
});

describe('replays', () => {
  it('inputs round-trip and replay rebuilds a run exactly', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const mode = MODE_IDS[seed % MODE_IDS.length];
      const { run, inputs } = randomRun(seed, mode);
      expect(decodeInputs(encodeInputs(inputs))).toEqual(inputs);
      const again = replay(seed, mode, decodeInputs(encodeInputs(inputs)), run.tick + 1);
      expect(again.tick).toBe(run.tick);
      expect(again.score).toBe(run.score);
      expect(again.x).toBe(run.x);
      expect(again.cause).toBe(run.cause);
      expect(heldAt(inputs, inputs[0] ?? 0)).toBe(inputs.length > 0);
    }
  });

  it('a clone runs on exactly like the original', () => {
    const { run } = randomRun(4, 'n', 240 * 6);
    const c = cloneRun(run);
    const evA: Ev[] = [], evB: Ev[] = [];
    for (let i = 0; i < 2000; i++) {
      step(run, i % 300 < 150, evA);
      step(c, i % 300 < 150, evB);
    }
    expect(c.score).toBe(run.score);
    expect(JSON.stringify(evB)).toBe(JSON.stringify(evA));
  });

  it('bot runs replay exactly and never throw', () => {
    for (let seed = 100; seed < 106; seed++) {
      const { run, inputs } = playBot(seed, 'n', SKILLS.human, seed, 240 * 90);
      expect(Number.isFinite(run.score)).toBe(true);
      const again = replay(seed, 'n', inputs, run.tick + (run.alive ? 0 : 1));
      expect(again.score).toBe(run.score);
      expect(again.alive).toBe(run.alive);
    }
  });

  it('many careless runs, in every mode, end cleanly', () => {
    for (let seed = 200; seed < 240; seed++) {
      const { run } = randomRun(seed, MODE_IDS[seed % 4], 240 * 60);
      expect(Number.isFinite(run.score) && run.score >= 0).toBe(true);
      if (!run.alive) expect(['burn', 'star', 'cinder', 'void']).toContain(run.cause);
    }
  });
});

describe('balance', () => {
  it('the sky is passable: a sharp bot climbs far', () => {
    let far = 0;
    for (const seed of [1, 2, 3]) {
      const { run } = playBot(seed, 'n', SKILLS.perfect, seed, 240 * 75);
      if (altitude(run) > 900) far++;
    }
    expect(far).toBeGreaterThanOrEqual(2);
  });
});
