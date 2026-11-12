import { describe, expect, it } from 'vitest';
import { END_T, FOG_T, HEAT, act, choices, clock, newGame, replay } from '../../src/lastlight/core/night2';
import { NIGHT1, NIGHT2 } from '../../src/lastlight/core/nights';

// The best route: Bramble on her lead, the logbook and the news win Bassett over, heat the bulb,
// fetch Nell with the dog while it warms, promise her the horn, then swing the flywheel together.
const BEST = [
  'take:matches', 'take:logbook', 'lead', 'go:yard', 'go:store', 'take:blowlamp', 'use:blowlamp:drum',
  'go:yard', 'go:tower', 'show:logbook:bassett', 'say:bassett:nell', 'say:bassett:signal',
  'go:yard', 'use:keys:door', 'go:signal', 'use:blowlamp:bulb',
  'go:yard', 'go:moor', 'go:point', 'say:nell:horn', 'say:nell:come',
  'go:moor', 'go:yard', 'go:cottage',
  'go:yard', 'go:signal', 'swing', 'open:valve', 'wait',
];

const play = (ids: string[]) => {
  const s = newGame();
  for (const id of ids) expect(act(s, id), `${id} at ${clock(s)} in ${s.room}`).not.toBeNull();
  return s;
};

describe('Last Light, night 2', () => {
  it('the best route earns all three stars before one o’clock', () => {
    const s = play(BEST.slice(0, -1));
    expect(s.f.horn).toBe(true);
    expect(s.t).toBeLessThan(END_T);
    expect(s.nell.room).toBe('cottage');
    act(s, 'wait');
    expect(s.over?.stars).toBe(3);
    expect(s.over?.title).toBe('All Ashore');
  });

  it('forcing the door costs Bassett’s trust, and leaving Nell out costs her star', () => {
    // Crowbar route: no Bassett, lever the flywheel alone, never go to the Point.
    const s = play([
      'take:matches', 'go:yard', 'go:store', 'take:blowlamp', 'use:blowlamp:drum', 'take:crowbar',
      'go:yard', 'use:crowbar:door', 'go:signal', 'use:blowlamp:bulb',
      'look:engine', 'use:crowbar:flywheel', 'wait:bulb', 'use:crowbar:flywheel', 'open:valve',
    ]);
    expect(s.f.forced).toBe(true);
    expect(s.bassett.trust).toBe(-2);
    expect(s.f.horn).toBe(true);
    act(s, 'wait');
    expect(s.over?.stars).toBe(1);
    expect(s.over?.title).toBe('The Horn Sounds');
    expect(s.over?.text.join(' ')).toContain('inquiry');
  });

  it('doing nothing ends in fog on the Teeth with no stars', () => {
    const s = newGame();
    while (!s.over) act(s, s.room === 'cottage' ? 'go:yard' : 'go:cottage');
    expect(s.t).toBe(END_T);
    expect(s.over!.stars).toBe(0);
    expect(s.over!.title).toBe('Fog on the Teeth');
    expect(choices(s)).toEqual([]);
  });

  it('the fog shuts the moor without something to steer by, with warning first', () => {
    const s = replay(['go:yard']);
    s.t = FOG_T - 7;
    const warn = act(s, 'go:moor')!;
    expect(warn.join(' ')).toContain('fog is thickening');
    s.t = FOG_T;
    const out = act(s, 'go:point')!;
    expect(s.room).toBe('moor');
    expect(out.join(' ')).toContain('something to steer by');
    // The wall always leads home.
    act(s, 'go:yard');
    expect(s.room).toBe('yard');
    // With Bramble you can cross.
    const d = replay(['lead', 'go:yard', 'go:moor']);
    d.t = FOG_T;
    act(d, 'go:point');
    expect(d.room).toBe('point');
    expect(d.nell.trust).toBe(2);
  });

  it('the bulb takes a quarter hour to heat; swinging early only coughs', () => {
    const s = play(BEST.slice(0, 16));
    expect(s.f.heatAt).toBeGreaterThan(0);
    act(s, 'swing');
    expect(s.f.running).toBe(false);
    expect(s.t - s.f.heatAt).toBeLessThan(HEAT);
    act(s, 'wait:bulb');
    expect(s.t - s.f.heatAt).toBe(HEAT);
    act(s, 'swing');
    expect(s.f.running).toBe(true);
  });

  it('Bassett needs two reasons; Nell needs comfort and something for her mam’s boat', () => {
    const s = replay(['go:yard', 'go:tower', 'say:bassett:signal']);
    expect(s.bassett.agreed).toBe(false);
    act(s, 'say:bassett:nell');
    act(s, 'say:bassett:signal');
    expect(s.bassett.agreed).toBe(false);
    const n = replay(['go:yard', 'go:moor', 'take:lantern', 'go:point', 'say:nell:come']);
    expect(n.nell.follows).toBe(false);
    act(n, 'give:lantern:nell');
    act(n, 'say:nell:cross');
    act(n, 'say:nell:come');
    expect(n.nell.follows).toBe(false);
    act(n, 'say:nell:horn');
    expect(n.nell.promised).toBe(true);
    act(n, 'say:nell:come');
    expect(n.nell.follows).toBe(true);
  });

  // Nell first, then Bassett: she can be brought to the watch room and left there.
  const NELL_FIRST = [
    'take:matches', 'lead', 'go:yard', 'go:moor', 'go:point', 'say:nell:horn', 'say:nell:come',
    'go:moor', 'go:yard', 'go:tower',
  ];

  it('once Nell is found Bassett hears she’s safe, and that counts as much as her being missing', () => {
    const s = play(NELL_FIRST);
    const labels = choices(s).filter((c) => c.about === 'bassett').map((c) => c.label);
    expect(labels).not.toContain('Tell him Nell is missing');
    expect(labels).toContain('Tell him Nell’s safe');
    const out = act(s, 'say:bassett:nell')!;
    expect(out.join(' ')).toContain('toffee');
    expect(s.bassett.trust).toBe(1);
  });

  it('endings put Nell where she really is', () => {
    // Left in the watch room.
    const w = play([...NELL_FIRST, 'say:nell:stay']);
    while (!w.over) act(w, w.room === 'tower' ? 'go:yard' : 'go:tower');
    expect(w.over!.stars).toBe(1);
    expect(w.over!.text.join(' ')).toContain('watch-room floor');
    expect(w.over!.text.join(' ')).not.toContain('Ada’s chair');
    // Standing beside her at the cairn at one o'clock.
    const p = play(['go:yard', 'go:moor', 'go:point']);
    while (!p.over) act(p, 'say:nell:come');
    expect(p.over!.text.join(' ')).toContain('beside you');
    expect(p.over!.text.join(' ')).not.toContain('They find her at dawn');
    // Taken home to bed.
    const h = play(['lead', 'go:yard', 'go:moor', 'go:point', 'say:nell:horn', 'say:nell:come', 'go:moor', 'go:house']);
    expect(h.nell.home).toBe(true);
    while (!h.over) expect(act(h, h.room === 'house' ? 'go:moor' : 'go:house')).not.toBeNull();
    expect(h.over!.text.join(' ')).toContain('her own bed');
  });

  it('Bramble stays with Nell once found; no stray dog buttons, and waiting is for indoors', () => {
    const s = play(['take:matches', 'lead', 'go:yard', 'go:moor', 'go:point']);
    expect(s.bramble.withNell).toBe(true);
    expect(choices(s).some((c) => c.about === 'bramble')).toBe(false);
    // Leaving Nell at the cairn leaves the dog with her.
    const out = act(s, 'go:moor')!;
    expect(out.join(' ')).toContain('won’t leave her');
    expect(s.bramble.room).toBe('point');
    const done = play(BEST.slice(0, -1));
    expect(done.room).toBe('signal');
    expect(choices(done).map((c) => c.id)).toContain('wait');
    act(done, 'go:yard');
    expect(choices(done).map((c) => c.id)).not.toContain('wait');
  });

  it('later visits get the short description, and the fog is described as it is on arrival', () => {
    const s = play(['go:yard', 'go:cottage']);
    const again = act(s, 'go:yard')!;
    expect(again[0]).toBe('The yard, deep in fog. Overhead the beam swings round.');
    s.t = FOG_T - 1;
    const moor = act(s, 'go:moor')!.join(' ');
    expect(moor).toContain('The fog is total');
    expect(moor).not.toContain('thickening fast');
  });

  it('asking about the fog signal first gets an answer, not a plea', () => {
    const s = play(['take:logbook', 'go:yard', 'go:tower', 'show:logbook:bassett']);
    const out = act(s, 'say:bassett:signal')!;
    expect(out[0]).toMatch(/^“Condemned,”/);
  });

  it('the Story wrappers keep night 1 as it was', () => {
    expect(NIGHT1.saveKey).toBe('run');
    expect(NIGHT1.RULES_VERSION).toBe(1);
    expect(NIGHT2.saveKey).toBe('run2');
    const s = NIGHT2.newGame();
    expect(NIGHT2.clock(s)).toBe('11:00 pm');
    expect(NIGHT2.roomName(s)).toBe('Keeper’s cottage');
  });

  it('random play never crashes and always ends by one o’clock', () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const stars = [0, 0, 0, 0];
    for (let g = 0; g < 300; g++) {
      const s = newGame();
      for (let k = 0; k < 400 && !s.over; k++) {
        const c = choices(s);
        expect(c.length).toBeGreaterThan(0);
        expect(act(s, c[Math.floor(rnd() * c.length)].id)).not.toBeNull();
        expect(s.t).toBeLessThanOrEqual(END_T);
      }
      expect(s.over).not.toBeNull();
      stars[s.over!.stars]++;
    }
    expect(stars[3]).toBeLessThan(10);
  });
});
