import { describe, expect, it } from 'vitest';
import { BALL_R, CELL, COLS, HOLES, MAX_STROKES, encodeShot, makeCourse, newRound, play, replay, simulate, toPar } from '../../src/ninefold/core';
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
