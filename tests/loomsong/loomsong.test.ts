import { describe, expect, it } from 'vitest';
import {
  FLICK_CLEAR, GOOD, SCALES, J_GOOD, J_MISS, J_PERFECT, Judge, LEVELS, PERFECT, STEPS_PER_BAR, TAIL_GRACE, botEvents, chartStats, decodeEvents, encodeEvents,
  judgePlay, makeChart, makeSong, replay, type InputEv, type Level,
} from '../../src/loomsong/core';

const LVS: Level[] = [0, 1, 2];

describe('songs', () => {
  it('are a pure function of the seed', () => {
    for (const seed of [1, 99, 123456789]) expect(JSON.stringify(makeSong(seed))).toBe(JSON.stringify(makeSong(seed)));
    expect(JSON.stringify(makeSong(1).notes)).not.toBe(JSON.stringify(makeSong(2).notes));
  });

  it('last 90-120 s at 90-140 BPM, with every part and a lead in the key', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const s = makeSong(seed);
      expect(s.bpm).toBeGreaterThanOrEqual(90);
      expect(s.bpm).toBeLessThanOrEqual(140);
      expect(s.durationMs).toBeGreaterThanOrEqual(90_000);
      expect(s.durationMs).toBeLessThanOrEqual(121_000);
      const insts = new Set(s.notes.map((n) => n.inst));
      for (const i of ['kick', 'snare', 'hat', 'bass', 'pad', 'lead']) expect(insts.has(i as never)).toBe(true);
      expect(s.sections[0].kind).toBe('intro');
      expect(s.sections[s.sections.length - 1].kind).toBe('outro');
      expect(s.bars * STEPS_PER_BAR).toBe(s.steps);
      // Every lead note is in the song's scale, and everything is inside the song.
      const scale = new Set(SCALES[s.mode]);
      expect(s.notes.filter((n) => n.inst === 'lead' && !scale.has((((n.midi - s.root) % 12) + 12) % 12)).length).toBe(0);
      expect(s.notes.every((n) => n.step >= 0 && n.step < s.steps)).toBe(true);
    }
  });
});

describe('charts', () => {
  it('are deterministic, sorted, and get denser with the level', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const song = makeSong(seed);
      const nps = LVS.map((lv) => chartStats(makeChart(song, lv), song).nps);
      expect(nps[0]).toBeLessThan(nps[1]);
      expect(nps[1]).toBeLessThan(nps[2]);
      for (const lv of LVS) {
        const a = makeChart(song, lv), b = makeChart(song, lv);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        for (let i = 1; i < a.notes.length; i++) expect(a.notes[i].t).toBeGreaterThanOrEqual(a.notes[i - 1].t);
      }
    }
  });

  it('sit on the music: every note is an onset of the song', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const song = makeSong(seed);
      const onsets = new Set(song.notes.filter((n) => n.inst !== 'pad' && n.inst !== 'arp').map((n) => n.step));
      for (const lv of LVS) for (const n of makeChart(song, lv).notes) expect(onsets.has(n.step)).toBe(true);
    }
  });

  it('keep lanes playable: spacing, holds alone in their lane, flicks clear, chords two lanes', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const song = makeSong(seed);
      for (const lv of LVS) {
        const L = LEVELS[lv];
        const ch = makeChart(song, lv);
        const byLane: number[][] = [[], [], [], []];
        ch.notes.forEach((n, i) => byLane[n.lane].push(i));
        for (const ids of byLane)
          for (let k = 1; k < ids.length; k++) {
            const a = ch.notes[ids[k - 1]], b = ch.notes[ids[k]];
            expect(b.t - a.end).toBeGreaterThanOrEqual(L.jackMs - 1e-6);
            if (a.kind === 'flick' || b.kind === 'flick') expect(b.t - a.end).toBeGreaterThanOrEqual(FLICK_CLEAR - 1e-6);
          }
        // Two notes at one time are a chord, in two lanes; never three.
        const at = new Map<number, number[]>();
        for (const n of ch.notes) at.set(n.t, [...(at.get(n.t) ?? []), n.lane]);
        for (const [, ls] of at) {
          expect(ls.length).toBeLessThanOrEqual(2);
          if (ls.length === 2) expect(ls[0]).not.toBe(ls[1]);
        }
        if (lv === 0) expect(ch.notes.every((n) => !n.chord)).toBe(true);
        // At most one hold at a time.
        const holds = ch.notes.filter((n) => n.kind === 'hold');
        for (let k = 1; k < holds.length; k++) expect(holds[k].t).toBeGreaterThanOrEqual(holds[k - 1].end);
        expect(ch.objects).toBe(ch.notes.length);
        expect(ch.notes[0].t).toBeGreaterThanOrEqual(song.stepMs * STEPS_PER_BAR - 1e-6);
      }
    }
  });

  it('have holds, flicks and (from Normal) chords', () => {
    let holds = [0, 0, 0], flicks = [0, 0, 0], chords = [0, 0, 0];
    for (let seed = 1; seed <= 20; seed++)
      for (const lv of LVS) {
        const s = chartStats(makeChart(makeSong(seed), lv), makeSong(seed));
        holds[lv] += s.holds;
        flicks[lv] += s.flicks;
        chords[lv] += s.chords;
      }
    for (const lv of LVS) {
      expect(holds[lv]).toBeGreaterThan(20);
      expect(flicks[lv]).toBeGreaterThan(10);
    }
    expect(chords[0]).toBe(0);
    expect(chords[1]).toBeGreaterThan(40);
    expect(chords[2]).toBeGreaterThan(chords[1]);
  });
});

describe('judging', () => {
  it('a bot pressing every note at its exact time scores a perfect million', () => {
    for (let seed = 1; seed <= 12; seed++)
      for (const lv of LVS) {
        const ch = makeChart(makeSong(seed), lv);
        const r = judgePlay(ch, botEvents(ch));
        expect(r.score).toBe(1_000_000);
        expect(r.allPerfect).toBe(true);
        expect(r.maxCombo).toBe(ch.objects);
        expect(r.grade).toBe('S');
        expect(r.acc).toBe(100);
      }
  });

  it('scores are recomputed exactly from the encoded record', () => {
    for (let seed = 5; seed <= 8; seed++)
      for (const lv of LVS) {
        const ch = makeChart(makeSong(seed), lv);
        const evs = botEvents(ch, { jitter: 55, skip: 0.04, drop: 0.2, seed });
        const a = judgePlay(ch, evs);
        const b = replay(seed, lv, decodeEvents(encodeEvents(evs)));
        expect(b).toEqual(a);
        expect(a.score).toBeLessThan(1_000_000);
        expect(a.miss).toBeGreaterThan(0);
      }
  });

  it('the live judge (events as they come, time advancing) agrees with the recompute', () => {
    const ch = makeChart(makeSong(42), 2);
    const evs = botEvents(ch, { jitter: 70, skip: 0.05, drop: 0.25, seed: 3 });
    const j = new Judge(ch);
    let k = 0;
    for (let now = -1000; now < ch.notes[ch.notes.length - 1].end + 2000; now += 16) {
      while (k < evs.length && evs[k].t <= now) j.apply(evs[k++]);
      j.advance(now - 50);
    }
    j.advance(Infinity);
    expect(j.result()).toEqual(judgePlay(ch, evs));
  });

  it('uses the windows: perfect, good, miss, stray taps ignored', () => {
    const ch = makeChart(makeSong(7), 1);
    const n = ch.notes.find((x) => x.kind === 'tap' && !x.chord)!;
    const one = (dt: number) => {
      const j = new Judge(ch);
      j.press(n.lane, n.t + dt);
      return j.head[n.id];
    };
    expect(one(0)).toBe(J_PERFECT);
    expect(one(PERFECT)).toBe(J_PERFECT);
    expect(one(-PERFECT - 1)).toBe(J_GOOD);
    expect(one(GOOD)).toBe(J_GOOD);
    expect(one(GOOD + 20)).toBe(J_MISS);
    expect(one(400)).toBe(-1);
    // A tap in an empty lane does nothing at all.
    const j = new Judge(ch);
    j.press((n.lane + 1) % 4, -5000);
    expect(j.out.length).toBe(0);
  });

  it('a hold let go early loses its tail; one held to the end keeps it', () => {
    const ch = makeChart(makeSong(9), 1);
    const h = ch.notes.find((x) => x.kind === 'hold')!;
    const play = (upAt: number) => {
      const j = new Judge(ch);
      j.press(h.lane, h.t);
      j.release(h.lane, upAt);
      return j.tail[h.id];
    };
    expect(play(h.end)).toBe(J_PERFECT);
    expect(play(h.end - TAIL_GRACE)).toBe(J_PERFECT);
    expect(play(h.end - TAIL_GRACE - 30)).toBe(J_MISS);
  });

  it('one judgement per note: a dropped hold is one miss, an untouched one too', () => {
    const ch = makeChart(makeSong(9), 1);
    const h = ch.notes.find((x) => x.kind === 'hold')!;
    const all = botEvents(ch);
    const dropped = all.map((e) => (e.k === 'u' && e.lane === h.lane && Math.abs(e.t - h.end) < 40 ? { ...e, t: Math.round(h.t + 60) } : e));
    const r = judgePlay(ch, dropped);
    expect(r.miss).toBe(1);
    expect(r.perfect).toBe(ch.objects - 1);
    expect(r.cloth.length).toBe(ch.notes.length);
    const untouched = judgePlay(ch, all.filter((e) => !(e.lane === h.lane && e.t >= h.t - 5 && e.t <= h.end + 20)));
    expect(untouched.miss).toBe(1);
  });

  it('a full combo of Goods is a B; Perfects and Goods half and half an A', () => {
    const ch = makeChart(makeSong(13), 1);
    const goods = judgePlay(ch, botEvents(ch, { bias: 70 }));
    expect(goods.fullCombo).toBe(true);
    expect(goods.good).toBe(ch.objects);
    expect(goods.grade).toBe('B');
    const mixed: InputEv[] = [];
    let k = 0;
    for (const n of ch.notes) {
      const t = Math.round(n.t + (k++ % 2 ? 70 : 0));
      mixed.push({ k: 'd', lane: n.lane, t });
      if (n.kind === 'flick') mixed.push({ k: 'f', lane: n.lane, t });
      mixed.push({ k: 'u', lane: n.lane, t: n.kind === 'hold' ? Math.round(n.end) + 10 : t + 40 });
    }
    mixed.sort((a, b) => a.t - b.t);
    expect(judgePlay(ch, mixed).grade).toBe('A');
  });

  it('flicks need a flick, not a tap', () => {
    const ch = makeChart(makeSong(11), 1);
    const f = ch.notes.find((x) => x.kind === 'flick')!;
    const tapOnly: InputEv[] = [{ k: 'd', lane: f.lane, t: f.t }, { k: 'u', lane: f.lane, t: f.t + 40 }];
    const j = new Judge(ch);
    for (const e of tapOnly) j.apply(e);
    j.advance(f.t + 2000);
    expect(j.head[f.id]).toBe(J_MISS);
    const k = new Judge(ch);
    k.apply({ k: 'd', lane: f.lane, t: f.t + 20 });
    k.apply({ k: 'f', lane: f.lane, t: f.t + 20 });
    expect(k.head[f.id]).toBe(J_PERFECT);
  });

  it('a steady late bias shows up as the mean error, and nothing at all is a D', () => {
    const ch = makeChart(makeSong(3), 1);
    const r = judgePlay(ch, botEvents(ch, { bias: 30 }));
    expect(Math.round(r.meanDt)).toBe(30);
    expect(r.allPerfect).toBe(true);
    const r2 = judgePlay(ch, botEvents(ch, { bias: 70 }));
    expect(r2.late).toBeGreaterThan(r2.objects / 2);
    const none = judgePlay(ch, []);
    expect(none.score).toBe(0);
    expect(none.grade).toBe('D');
    expect(none.miss).toBe(ch.objects);
  });
});
