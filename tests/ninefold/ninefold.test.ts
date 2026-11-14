import { describe, expect, it } from 'vitest';
import { BALL_R, CELL, COLS, DAILY_PICK, HOLES, MAX_STROKES, courseBite, dailyCourseSeed, encodeShot, makeCourse, newRound, play, replay, rollShare, simulate, toPar } from '../../src/ninefold/core';
import { mixSeed } from '../../src/shared/rng';
import { bestShot, distanceField } from '../../scripts/ninefold/bot';

describe('courses', () => {
  it('are deterministic and have nine holes with par 2-5', () => {
    const a = makeCourse(42), b = makeCourse(42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBe(HOLES);
    for (const h of a) expect(h.par).toBeGreaterThanOrEqual(2), expect(h.par).toBeLessThanOrEqual(5);
  });
  it('tee and cup sit on the fairway, clear of every obstacle', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const h of makeCourse(seed)) {
        const cell = (p: { x: number; y: number }) => Math.floor(p.y / CELL) * COLS + Math.floor(p.x / CELL);
        expect(h.cells[cell(h.tee)]).toBe(true);
        expect(h.cells[cell(h.cup)]).toBe(true);
        for (const z of h.zones) {
          for (const p of [h.tee, h.cup]) expect(p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h).toBe(false);
        }
        for (const p of h.posts) for (const q of [h.tee, h.cup]) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(p.r + BALL_R + 2);
      }
  });
  it('every cup is reachable on foot from the tee (no sealed routes)', () => {
    for (let seed = 1; seed <= 25; seed++)
      for (const h of makeCourse(seed)) {
        const f = distanceField(h);
        expect(Number.isFinite(f[Math.floor(h.tee.y) * COLS * CELL + Math.floor(h.tee.x)])).toBe(true);
      }
  });
});

describe('shapes and the daily', () => {
  it('some holes open into a green or split round a divider rail (rules v8)', () => {
    const shapes = new Map<string, number>();
    for (let seed = 1; seed <= 40; seed++)
      for (const h of makeCourse(seed)) {
        shapes.set(h.shape, (shapes.get(h.shape) ?? 0) + 1);
        if (h.shape === 'split') {
          expect(h.rails.length).toBe(1);
          // The divider is a real rail for the ball too.
          expect(h.walls.some((w) => w.ax === h.rails[0].ax && w.ay === h.rails[0].ay && w.bx === h.rails[0].bx)).toBe(true);
        } else expect(h.rails.length).toBe(0);
        if (h.n < 2) expect(h.shape).toBe('corridor');
      }
    expect(shapes.get('green')! / 360).toBeGreaterThan(0.1);
    expect(shapes.get('split')! / 360).toBeGreaterThan(0.08);
  });
  it('the daily course is the toughest of its candidates, and stays put', () => {
    for (const day of [11, 12, 13]) {
      const s = dailyCourseSeed(day);
      expect(dailyCourseSeed(day)).toBe(s);
      const bites = [...Array(DAILY_PICK).keys()].map((k) => courseBite(makeCourse(k ? mixSeed(day, k) : day)));
      expect(courseBite(makeCourse(s))).toBe(Math.max(...bites));
    }
  });
  it('a shot says what it met (for tips), and the roll readout matches the roll', () => {
    const c = makeCourse(9);
    for (const h of c) {
      const r = simulate(h, h.tee, { angle: -Math.PI / 2, power: 0.6 });
      expect(r.met.includes('sand')).toBe(r.sand.length > 0);
      for (const hit of r.hits) expect(r.met).toContain(hit.kind);
    }
    expect(rollShare(1)).toBe(1);
    expect(rollShare(0.2)).toBeCloseTo(0.2 ** 1.25);
  });
});

describe('physics', () => {
  it('the ball never leaves the fairway', () => {
    const c = makeCourse(7);
    for (const h of c)
      for (let k = 0; k < 24; k++) {
        const r = simulate(h, h.tee, { angle: (k / 24) * Math.PI * 2, power: 1 });
        for (let i = 0; i < r.frames.length; i += 2) {
          const cell = Math.floor(r.frames[i + 1] / CELL) * COLS + Math.floor(r.frames[i] / CELL);
          expect(h.cells[cell]).toBe(true);
        }
      }
  });
  it('a bot sinks every hole of a course', () => {
    const r = newRound(3);
    while (!r.over) {
      const h = r.holes[r.hole];
      play(r, encodeShot(bestShot(h, r.ball, distanceField(h), 36)));
    }
    expect(r.strokes.every((s) => s < MAX_STROKES)).toBe(true);
    // A noise-free search bot is far better than a thumb: it beats par.
    expect(toPar(r)).toBeLessThanOrEqual(0);
  });
});

describe('rounds', () => {
  it('replay rebuilds a round exactly; water costs a penalty stroke', () => {
    const r = newRound(11);
    const acts = ['-1571.400', '-1200.900', '0.300', '3000.1000', '-1571.1000'];
    for (const a of acts) play(r, a);
    const b = replay(11, acts);
    expect(b.strokes).toEqual(r.strokes);
    expect(b.ball).toEqual(r.ball);
    expect(b.hole).toBe(r.hole);
  });
  it('picks the ball up after the stroke limit', () => {
    const r = newRound(5);
    for (let i = 0; i < MAX_STROKES; i++) play(r, '0.000');
    expect(r.hole).toBe(1);
    expect(r.strokes[0]).toBe(MAX_STROKES);
  });
});
