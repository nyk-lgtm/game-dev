import { describe, expect, it } from 'vitest';
import {
  CHARMS,
  DEAL_DRAWS,
  FLOORS,
  LARGE,
  MEDIUM,
  MERCY,
  SMALL,
  TUNE,
  act,
  cardsLeft,
  fitKind,
  freshDraws,
  isCovered,
  legal,
  newRun,
  playable,
  playableSlots,
  nextDraws,
  rankGap,
  replay,
  shown,
  slotsOf,
  startAt,
  top,
  type Card,
  type Run,
} from '../../src/summit/core';
import { Rng } from '../../src/shared/rng';
import { botAction } from '../../scripts/summit/bot';

const strip = (r: Run) => JSON.stringify({ ...r, hist: r.hist.length });

/** Puts a card on the waste and returns the index of an uncovered slot holding `c`. */
function setup(r: Run, wasteTop: Card, c: Card): number {
  const d = r.deal;
  d.waste.push(wasteTop);
  const i = d.slots.findIndex((_, k) => !isCovered(d, k));
  d.slots[i].card = c;
  // Nothing else on the bottom row may play, so tests see only this card.
  return i;
}

function playBot(seed: number): Run {
  const r = newRun(seed);
  for (let guard = 0; r.phase !== 'over' && guard < 5000; guard++) expect(act(r, botAction(r))).not.toBeNull();
  return r;
}

describe('layouts', () => {
  it('fit 8 cards across, rows alternate half steps, every covered card has coverers below', () => {
    for (const l of [...SMALL, ...MEDIUM, ...LARGE]) {
      const s = slotsOf(l);
      const xs = s.map((p) => p.x);
      expect(Math.max(...xs) + 2 - Math.min(...xs)).toBeLessThanOrEqual(16);
      for (const p of s) {
        expect(p.x % 2).toBe(s.filter((q) => q.row === p.row)[0].x % 2);
        if (p.row < l.rows.length - 1) expect(p.coveredBy.length).toBeGreaterThan(0);
        else expect(p.coveredBy.length).toBe(0);
      }
    }
  });
});

describe('deals', () => {
  it('are deterministic, and the tableau plus the first waste card are distinct cards', () => {
    expect(strip(newRun(42))).toBe(strip(newRun(42)));
    expect(strip(newRun(42))).not.toBe(strip(newRun(43)));
    for (let f = 0; f < FLOORS; f++) {
      const r = startAt(7, f);
      const ids = [...r.deal.slots.map((s) => s.card), r.deal.waste[0]].map((c) => `${c.r}.${c.s}`);
      expect(new Set(ids).size).toBe(ids.length);
      expect(r.deal.stock.length).toBe(DEAL_DRAWS[f]);
    }
  });
  it('the first floor is all face up; the last is face down wherever covered', () => {
    expect(startAt(3, 0).deal.slots.every((s) => !s.down)).toBe(true);
    const r = startAt(3, FLOORS - 1);
    r.deal.slots.forEach((s, i) => expect(s.down).toBe(isCovered(r.deal, i)));
  });
});

describe('rules', () => {
  it('ranks wrap: K plays on A and A on K', () => {
    expect(rankGap(13, 1)).toBe(1);
    expect(rankGap(1, 13)).toBe(1);
    expect(rankGap(5, 7)).toBe(2);
  });
  it('only uncovered cards one rank away play; illegal actions change nothing', () => {
    const r = newRun(11);
    const i = setup(r, { r: 5, s: 0 }, { r: 6, s: 1 });
    expect(playable(r, i)).toBe(true);
    r.deal.slots[i].card = { r: 8, s: 1 };
    expect(playable(r, i)).toBe(false);
    const covered = r.deal.slots.findIndex((_, k) => isCovered(r.deal, k));
    r.deal.slots[covered].card = { r: 4, s: 2 };
    expect(playable(r, covered)).toBe(false);
    const before = strip(r);
    expect(act(r, `P${covered}`)).toBeNull();
    expect(act(r, 'U')).toBeNull();
    expect(act(r, 'Cjoker')).toBeNull();
    expect(strip(r)).toBe(before);
  });
  it('streaks score 10, 20, 30… and a draw resets them', () => {
    const r = newRun(5);
    const d = r.deal;
    const bottom = d.slots.map((_, k) => k).filter((k) => !isCovered(d, k));
    d.waste.push({ r: 1, s: 0 });
    bottom.slice(0, 3).forEach((k, n) => (d.slots[k].card = { r: 2 + n, s: 1 }));
    bottom.slice(3).forEach((k) => (d.slots[k].card = { r: 9, s: 3 }));
    expect(act(r, `P${bottom[0]}`)!.points).toBe(10);
    expect(act(r, `P${bottom[1]}`)!.points).toBe(20);
    expect(act(r, `P${bottom[2]}`)!.points).toBe(30);
    expect(r.score).toBe(60);
    act(r, 'D');
    expect(r.deal.streak).toBe(0);
  });
  it('uncovering a face-down card turns it up', () => {
    const r = startAt(9, FLOORS - 1);
    const d = r.deal;
    const i = d.slots.findIndex((s) => s.down && s.coveredBy.length === 2);
    const [a, b] = d.slots[i].coveredBy;
    d.blasts = 2;
    act(r, `B${a}`);
    expect(d.slots[i].down).toBe(true);
    const o = act(r, `B${b}`)!;
    expect(o.flipped).toContain(i);
    expect(d.slots[i].down).toBe(false);
  });
  it('clearing a deal pays a bonus, carries unused draws and offers three new charms', () => {
    const r = newRun(21);
    const d = r.deal;
    for (const s of d.slots) s.gone = true;
    d.slots[0].gone = false;
    d.slots[0].card = { r: 2, s: 0 };
    d.waste.push({ r: 3, s: 1 });
    const o = act(r, 'P0')!;
    expect(o.cleared).toBe(true);
    expect(r.phase).toBe('charm');
    expect(r.offer.length).toBe(3);
    expect(r.carry).toBe(Math.min(TUNE.carry, d.stock.length));
    const pick = r.offer[1];
    act(r, `C${pick}`);
    expect(r.charms).toEqual([pick]);
    expect(r.floor).toBe(1);
    expect(r.deal.stock.length).toBe(Math.min(TUNE.carry, o.unused!) + freshDraws(r) + (pick === 'joker' ? 1 : 0));
  });
  it('running out of plays and draws ends the run', () => {
    const r = newRun(4);
    r.deal.stock = [];
    r.deal.waste.push({ r: 7, s: 0 });
    r.deal.slots.forEach((s) => (s.card = { r: 1, s: 1 }));
    const o = act(r, 'X')!;
    expect(o.over).toBe(true);
    expect(act(r, 'D')).toBeNull();
    const q = newRun(4);
    q.deal.stock = [{ r: 1, s: 0 }];
    q.deal.waste.push({ r: 7, s: 0 });
    q.deal.slots.forEach((s) => (s.card = { r: 1, s: 1 }));
    expect(act(q, 'D')!.over).toBe(true);
    expect(q.phase).toBe('over');
  });
});

describe('charms', () => {
  it('there are 13, all distinct, never offered twice', () => {
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(13);
    const r = playBot(77);
    expect(new Set(r.charms).size).toBe(r.charms.length);
  });
  it('Joker: one wild card in the pile; anything plays on it', () => {
    const r = startAt(2, 1, ['joker']);
    expect(r.deal.stock.filter((c) => c.r === 0).length).toBe(1);
    const i = setup(r, { r: 0, s: -1 }, { r: 9, s: 2 });
    expect(playable(r, i)).toBe(true);
  });
  it('Deep Pockets, High Stakes and Lantern change the draws', () => {
    expect(startAt(2, 3, ['pockets']).deal.stock.length).toBe(DEAL_DRAWS[3] + 3);
    expect(startAt(2, 3, ['stakes']).deal.stock.length).toBe(DEAL_DRAWS[3] - 1);
    expect(startAt(2, 3, ['lantern']).deal.stock.length).toBe(DEAL_DRAWS[3] + TUNE.lantern);
  });
  it('Mirror plays the same rank a few times per deal; Long Stride plays two away but discards a draw and the streak', () => {
    const m = newRun(8);
    const i = setup(m, { r: 7, s: 0 }, { r: 7, s: 1 });
    expect(playable(m, i)).toBe(false);
    m.charms.push('mirror');
    m.deal.mirrors = 1;
    expect(playable(m, i)).toBe(true);
    expect(act(m, `P${i}`)!.mirror).toBe(true);
    expect(m.deal.mirrors).toBe(0);
    const i2 = setup(m, { r: 9, s: 0 }, { r: 9, s: 2 });
    expect(playable(m, i2)).toBe(false);
    expect(startAt(8, 0, ['mirror']).deal.mirrors).toBe(TUNE.mirrors);
    const s = startAt(8, 0, ['stride']);
    const j = setup(s, { r: 7, s: 0 }, { r: 5, s: 1 });
    s.deal.streak = 3;
    const n = s.deal.stock.length;
    const o = act(s, `P${j}`)!;
    expect(o.stride).toBe(true);
    expect(o.points).toBe(0);
    expect(s.deal.streak).toBe(0);
    expect(s.deal.stock.length).toBe(n - 1);
    s.deal.stock = [];
    const k = setup(s, { r: 7, s: 0 }, { r: 9, s: 1 });
    expect(playable(s, k)).toBe(false);
  });
  it('Blasting Cap clears a covered card once per deal and keeps the streak', () => {
    const r = startAt(5, 2, ['blast']);
    r.deal.streak = 4;
    const i = r.deal.slots.findIndex((_, k) => isCovered(r.deal, k));
    expect(act(r, `B${i}`)!.kind).toBe('blast');
    expect(r.deal.slots[i].gone).toBe(true);
    expect(r.deal.streak).toBe(4);
    expect(act(r, `B${i + 1}`)).toBeNull();
  });
  it('Rewind undoes twice per deal, score and all', () => {
    const r = startAt(6, 0, ['rewind']);
    const start = JSON.stringify(r.deal);
    act(r, 'D');
    act(r, 'D');
    act(r, 'D');
    expect(act(r, 'U')).not.toBeNull();
    expect(act(r, 'U')).not.toBeNull();
    expect(act(r, 'U')).toBeNull();
    act(r, 'U');
    expect(r.deal.stock.length).toBe(JSON.parse(start).stock.length - 1);
  });
  it('a real run that picks Rewind and undoes replays exactly', () => {
    for (let seed = 1; ; seed++) {
      const r = newRun(seed);
      while (r.phase === 'play') act(r, botAction(r));
      if (r.phase !== 'charm' || !r.offer.includes('rewind')) continue;
      act(r, 'Crewind');
      act(r, 'D');
      act(r, botAction(r));
      expect(act(r, 'U')).not.toBeNull();
      expect(r.undos).toBe(1);
      expect(strip(replay(seed, r.actions))).toBe(strip(r));
      break;
    }
  });
  it('Flush doubles plays on their own suit and gives back a draw on the third in a row; Momentum on every 5th', () => {
    const r = startAt(12, 0, ['flush', 'momentum']);
    const d = r.deal;
    const bottom = d.slots.map((_, k) => k).filter((k) => !isCovered(d, k));
    d.waste.push({ r: 1, s: 2 });
    bottom.forEach((k, n) => (d.slots[k].card = { r: 2 + n, s: 2 }));
    const n0 = d.stock.length;
    const pts = [0, 1, 2, 3, 4].map((n) => act(r, `P${bottom[n]}`)!);
    expect(pts[0].points).toBe(20);
    expect(pts[0].flush).toBe(true);
    expect(pts[2].refund).toBe(1);
    expect(pts[4].refund).toBe(1);
    expect(d.stock.length).toBe(n0 + 2);
  });
  it('Peak Flags gives back a draw for a peak top', () => {
    const r = startAt(14, 0, ['flags']);
    const d = r.deal;
    const peak = d.slots.findIndex((s) => s.row === 0);
    const n0 = d.stock.length;
    d.blasts = 1;
    expect(act(r, `B${peak}`)!.refund).toBe(1);
    expect(d.stock.length).toBe(n0 + 1);
  });
  it('Lantern shows face-down cards; Spyglass needs no rule change', () => {
    const r = startAt(3, 7, ['lantern']);
    expect(r.deal.slots.every((_, i) => shown(r, i))).toBe(true);
  });
  it('Second Wind gives its draws once when you run out', () => {
    const r = startAt(4, 0, ['wind']);
    r.deal.stock = [{ r: 1, s: 0 }];
    r.deal.waste.push({ r: 7, s: 0 });
    r.deal.slots.forEach((s) => (s.card = { r: 1, s: 1 }));
    const o = act(r, 'D')!;
    expect(o.wind).toBe(true);
    expect(r.deal.stock.length).toBe(TUNE.wind);
    for (let k = 0; k < TUNE.wind; k++) act(r, 'D');
    if (!playable(r, r.deal.slots.findIndex((_, k) => !isCovered(r.deal, k)))) expect(r.phase).toBe('over');
  });
});

describe('dead draws', () => {
  it('a fresh pile never has two cards of one rank back to back', () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const f of [0, 4, 7]) {
        const st = startAt(seed, f).deal.stock;
        for (let i = 1; i < st.length; i++) expect(st[i].r === st[i - 1].r).toBe(false);
      }
  });
  it(`the ${MERCY}rd draw in a row without a play fits an open card when the pile has one`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = startAt(seed, 3);
      for (let k = 0; k < MERCY && r.phase === 'play' && r.deal.stock.length; k++) {
        const pileHasFit = r.deal.stock.some((c) => r.deal.slots.some((s, i) => !s.gone && !isCovered(r.deal, i) && fitKind(r, s.card, c)));
        const o = act(r, 'D')!;
        if (k === MERCY - 1 && pileHasFit) expect(playableSlots(r).length).toBeGreaterThan(0);
        if (o.lucky) expect(k).toBe(MERCY - 1);
      }
    }
  });
  it('Second Wind blows when draws run out even with an undo or blast left', () => {
    const r = startAt(4, 0, ['wind', 'blast']);
    r.deal.stock = [{ r: 1, s: 0 }];
    r.deal.waste.push({ r: 7, s: 0 });
    r.deal.slots.forEach((s) => (s.card = { r: 1, s: 1 }));
    expect(act(r, 'D')!.wind).toBe(true);
    expect(r.deal.blasts).toBe(1);
  });
  it('Flush counts cards of one suit played in a row, whatever was on the waste', () => {
    const r = startAt(12, 0, ['flush']);
    const d = r.deal;
    const bottom = d.slots.map((_, k) => k).filter((k) => !isCovered(d, k));
    d.waste.push({ r: 6, s: 0 });
    bottom.forEach((k, n) => (d.slots[k].card = { r: 5 - n, s: 2 }));
    const a = act(r, `P${bottom[0]}`)!;
    expect(a.flush).toBeFalsy();
    act(r, `P${bottom[1]}`);
    expect(act(r, `P${bottom[2]}`)!.refund).toBe(1);
  });
});

describe('draws and charms keep their word', () => {
  /** Plays bot runs that start holding these charms, calling check(run, action) before each action. */
  function botRuns(charms: Parameters<typeof startAt>[2], seeds: number, check: (r: Run, a: string) => void) {
    for (let seed = 1; seed <= seeds; seed++) {
      const r = startAt(seed, 0, charms);
      for (let guard = 0; r.phase !== 'over' && guard < 3000; guard++) {
        const a = botAction(r);
        check(r, a);
        act(r, a);
      }
    }
  }
  it('a draw never turns up the rank already on the waste', () => {
    let draws = 0;
    botRuns(['joker', 'flags', 'momentum', 'flush', 'blast', 'stride', 'mirror'], 40, (r, a) => {
      if (a !== 'D') return;
      const sim = JSON.parse(JSON.stringify(r)) as Run;
      const before = top(sim.deal);
      const avoidable = sim.deal.stock.some((c) => c.r !== before.r);
      act(sim, 'D');
      if (before.r !== 0 && avoidable) expect(top(sim.deal).r).not.toBe(before.r);
      draws++;
    });
    expect(draws).toBeGreaterThan(500);
  });
  it('Spyglass shows exactly the next draws (lucky draws included)', () => {
    let checked = 0;
    botRuns(['spyglass', 'joker'], 40, (r) => {
      if (r.phase !== 'play' || !r.deal.stock.length) return;
      const peek = nextDraws(r, 3);
      const sim = JSON.parse(JSON.stringify(r)) as Run;
      const got = peek.map(() => (act(sim, 'D'), JSON.stringify(top(sim.deal))));
      expect(got).toEqual(peek.map((c) => JSON.stringify(c)));
      checked++;
    });
    expect(checked).toBeGreaterThan(200);
  });
  it('the lucky draw picks a plain card before the Joker', () => {
    const r = startAt(3, 2, ['joker']);
    const d = r.deal;
    d.waste.push({ r: 7, s: 0 });
    d.slots.forEach((s) => (s.card = { r: 1, s: 1 }));
    const open = d.slots.findIndex((_, i) => !isCovered(d, i));
    d.slots[open].card = { r: 3, s: 1 };
    // Pile (next card last): a fitting 4, the Joker, then dead cards.
    d.stock = [{ r: 4, s: 2 }, { r: 0, s: -1 }, { r: 10, s: 0 }, { r: 10, s: 1 }, { r: 11, s: 0 }];
    d.dry = MERCY - 1;
    const o = act(r, 'D')!;
    expect(o.lucky).toBe(true);
    expect(top(d).r).toBe(4);
    expect(d.stock.some((c) => c.r === 0)).toBe(true);
  });
  it('says so when no card in the pile can fit', () => {
    const r = startAt(3, 2);
    const d = r.deal;
    d.waste.push({ r: 7, s: 0 });
    d.slots.forEach((s) => (s.card = { r: 1, s: 1 }));
    d.stock = [{ r: 10, s: 0 }, { r: 11, s: 1 }, { r: 10, s: 2 }];
    d.dry = MERCY - 1;
    expect(act(r, 'D')!.noLuck).toBe(true);
  });
  it('undo never hides a card you have already seen', () => {
    const r = startAt(9, FLOORS - 1, ['rewind']);
    const d = r.deal;
    const i = d.slots.findIndex((s) => s.down && s.coveredBy.length === 2);
    const [a, b] = d.slots[i].coveredBy;
    d.blasts = 2;
    act(r, `B${a}`);
    act(r, `B${b}`);
    expect(r.deal.slots[i].down).toBe(false);
    act(r, 'U');
    expect(r.deal.slots[b].gone).toBe(false);
    expect(r.deal.slots[i].down).toBe(false);
  });
  it('at most TUNE.carry unused draws carry up', () => {
    const r = newRun(21);
    const d = r.deal;
    d.stock = [...Array(TUNE.carry + 7)].map((_, k) => ({ r: (k % 13) + 1, s: 0 }));
    for (const s of d.slots) s.gone = true;
    d.slots[0].gone = false;
    d.slots[0].card = { r: 2, s: 0 };
    d.waste.push({ r: 3, s: 1 });
    expect(act(r, 'P0')!.unused).toBe(TUNE.carry + 7);
    expect(r.carry).toBe(TUNE.carry);
  });
  it('charm texts match the rules', () => {
    const text = (id: string) => CHARMS.find((c) => c.id === id)!.text;
    expect(text('flags')).toContain(TUNE.flags === 1 ? 'gives back a draw' : `gives back ${TUNE.flags} draws`);
    expect(text('mirror')).toContain(['', 'Once', 'Twice', 'Three times'][TUNE.mirrors]);
    expect(text('stride')).toContain(['', 'Once', 'Twice', 'Three times'][TUNE.strides]);
    expect(text('wind')).toContain(`${TUNE.wind} fresh draws`);
    expect(text('pockets')).toContain(`+${TUNE.pockets} draws`);
    expect(text('lantern')).toContain(`+${TUNE.lantern} draw`);
  });
});

describe('runs', () => {
  it('replay rebuilds a bot run exactly', () => {
    for (const seed of [1, 2, 3, 99]) {
      const r = playBot(seed);
      expect(strip(replay(seed, r.actions))).toBe(strip(r));
      for (const cut of [5, 40, Math.floor(r.actions.length / 2)]) {
        const part = replay(seed, r.actions.slice(0, cut));
        expect(part.actions.length).toBe(Math.min(cut, r.actions.length));
      }
    }
  });
  it('random legal play never throws and always ends', () => {
    const rng = new Rng(123);
    for (let g = 0; g < 150; g++) {
      const r = newRun(rng.int(0, 1e9));
      let steps = 0;
      while (r.phase !== 'over') {
        const opts = legal(r).filter((a) => a !== 'X' || rng.next() < 0.002);
        // Mostly sensible: play when you can.
        const plays = opts.filter((a) => a[0] === 'P' || a[0] === 'C');
        const a = plays.length && rng.next() < 0.8 ? rng.pick(plays) : rng.pick(opts.length ? opts : ['X']);
        expect(act(r, a)).not.toBeNull();
        expect(cardsLeft(r.deal)).toBeGreaterThanOrEqual(0);
        expect(top(r.deal)).toBeTruthy();
        if (++steps > 4000) throw new Error('run never ended');
      }
      expect(legal(r)).toEqual([]);
    }
  });
  it('bot: floor 1 almost always cleared, median floor 4-6, some wins', () => {
    const n = 120;
    const floors: number[] = [];
    let first = 0, wins = 0;
    for (let k = 0; k < n; k++) {
      const r = playBot(9000 + k);
      floors.push(r.won ? FLOORS + 1 : r.floor + 1);
      if (r.cleared >= 1) first++;
      if (r.won) wins++;
    }
    floors.sort((a, b) => a - b);
    expect(first / n).toBeGreaterThan(0.93);
    expect(floors[n >> 1]).toBeGreaterThanOrEqual(4);
    expect(floors[n >> 1]).toBeLessThanOrEqual(6);
    expect(wins / n).toBeGreaterThan(0.05);
    expect(wins / n).toBeLessThan(0.35);
  });
});
