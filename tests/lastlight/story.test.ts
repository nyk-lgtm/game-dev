import { describe, expect, it } from 'vitest';
import { END_T, TIDE_T, act, choices, clock, newGame, replay } from '../../src/lastlight/core/story';

// The best route: coat, matches, tea for Tomas, Tomas carries the oil, free Ada, light and wind the lamp.
const BEST = [
  'take:coat', 'wear', 'open:drawer', 'take:matches', 'take:kettle', 'use:kettle:stove',
  'go:yard', 'go:cliff', 'go:shore', 'go:boathouse', 'give:tea:tomas', 'say:tomas:help', 'take:oil',
  'go:shore', 'go:cliff', 'go:road', 'say:ada:keys', 'lift',
  'take:oil', 'go:cliff', 'go:yard', 'use:keys:door', 'go:base', 'go:lamp',
  'use:keys:box', 'take:wick', 'use:wick:lamp', 'use:oil:lamp', 'use:matches:lamp', 'wind', 'watch',
];

describe('Last Light', () => {
  it('the best route earns all three stars before midnight', () => {
    const s = newGame();
    for (const id of BEST) {
      const out = act(s, id);
      expect(out, `${id} at ${clock(s)} in ${s.room}`).not.toBeNull();
    }
    expect(s.over?.stars).toBe(3);
    expect(s.over?.title).toBe('The Last Light');
  });

  it('the clock starts at ten, the tide closes the shore, and midnight ends it', () => {
    const s = newGame();
    expect(clock(s)).toBe('10:00 pm');
    s.t = TIDE_T;
    s.room = 'cliff';
    expect(act(s, 'go:shore')).toContain('The steps are under churning water. There’s no way through until the tide turns, long after midnight.');
    expect(s.room).toBe('cliff');
    s.t = END_T - 1;
    act(s, 'go:yard');
    expect(s.over).not.toBeNull();
    expect(s.over!.title).toBe('The Dark Tower');
    expect(choices(s)).toEqual([]);
  });

  it('rain soaks the matches without the coat, and the stove dries them', () => {
    const s = replay(['open:drawer', 'take:matches', 'go:yard']);
    expect(s.wet).toBe(true);
    act(s, 'go:cottage');
    expect(act(s, 'use:matches:stove')).not.toBeNull();
    expect(s.wet).toBe(false);
  });

  it('a broken window lets the wind snuff the match until the trapdoor is shut', () => {
    const s = replay(['take:coat', 'wear', 'open:drawer', 'take:matches', 'go:yard', 'take:stone', 'use:stone:window', 'go:base', 'go:lamp', 'use:stone:box', 'take:wick', 'use:wick:lamp']);
    s.f.oil = true;
    act(s, 'use:matches:lamp');
    expect(s.f.lit).toBe(false);
    act(s, 'shut:hatch');
    act(s, 'use:matches:lamp');
    expect(s.f.lit).toBe(true);
  });

  it('Tomas only comes when he trusts you, and remembers what you told him', () => {
    const s = replay(['go:yard', 'go:cliff', 'go:shore', 'go:boathouse']);
    act(s, 'say:tomas:help');
    expect(s.tomas.follows).toBe(false);
    act(s, 'say:tomas:ship');
    expect(s.tomas.told).toContain('ship');
    act(s, 'say:tomas:help');
    expect(s.tomas.follows).toBe(false);
  });

  it('random play never crashes and always ends by midnight', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let g = 0; g < 200; g++) {
      const s = newGame();
      for (let k = 0; k < 400 && !s.over; k++) {
        const c = choices(s);
        expect(c.length).toBeGreaterThan(0);
        expect(act(s, c[Math.floor(rnd() * c.length)].id)).not.toBeNull();
      }
      expect(s.over).not.toBeNull();
    }
  });
});
