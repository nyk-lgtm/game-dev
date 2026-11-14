import { describe, expect, it } from 'vitest';
import { NIGHT1, NIGHT2 } from '../../src/lastlight/core/nights';
import type { Story } from '../../src/lastlight/core/types';
import * as n2 from '../../src/lastlight/core/night2';

const nights = [NIGHT1, NIGHT2] as unknown as Story[];

/** Taps each hint's target until the night ends or a hint has nothing to tap. */
function follow(st: Story, s = st.newGame(), max = 80) {
  const ids: string[] = [];
  let last = '';
  for (let k = 0; k < max && !s.over; k++) {
    const h = st.hint(s);
    last = h?.key ?? '';
    expect(h, `no hint at ${st.clock(s)} in ${s.room}`).not.toBeNull();
    if (!h!.target) break;
    expect(st.choices(s).map((c) => c.id)).toContain(h!.target);
    ids.push(h!.target);
    expect(st.act(s, h!.target)).not.toBeNull();
  }
  return { s, ids, last };
}

describe('Last Light hints', () => {
  for (const st of nights)
    it(`night ${st.night}: following every hint from the start earns all three stars`, () => {
      const { s } = follow(st);
      expect(s.over?.stars).toBe(3);
    });

  it('every hint has a nudge and a pointer, and its target is always a legal tap', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (const st of nights) {
      for (let g = 0; g < 150; g++) {
        const s = st.newGame();
        const n = Math.floor(rnd() * 30);
        for (let k = 0; k < n && !s.over; k++) {
          const c = st.choices(s);
          st.act(s, c[Math.floor(rnd() * c.length)].id);
        }
        const h = st.hint(s);
        if (s.over) {
          expect(h).toBeNull();
          continue;
        }
        expect(h!.nudge.length).toBeGreaterThan(10);
        expect(h!.pointer.length).toBeGreaterThan(10);
        // A hint without a tap only comes when nothing useful is left (the oil lost to the tide).
        const { s: end, last } = follow(st, s);
        if (!end.over) expect(last).toBe('lost');
      }
    }
  });

  it('night 2: holding Bassett’s keys, the hint and the door both say so', () => {
    const s = n2.replay(['take:matches', 'take:logbook', 'go:yard', 'go:tower', 'show:logbook:bassett', 'say:bassett:nell', 'say:bassett:signal', 'go:yard']);
    expect(NIGHT2.hint(s)!.target).toBe('use:keys:door');
    expect(n2.act(s, 'look:door')!.join(' ')).toContain('Bassett’s keys are in your pocket');
  });
});
