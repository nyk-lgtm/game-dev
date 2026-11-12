import { describe, expect, it } from 'vitest';
import {
  ALL_CONCEPTS,
  CHAPTERS2,
  apply,
  contexts,
  decode,
  encode,
  makeLanguage,
  morphemes,
  newGame,
  realize,
  replay,
  sameTokens,
  tokenKey,
  writings,
  writtenGrammar,
  type Action,
  type Frame,
  type NP,
  type State,
  type Token,
} from '../../src/unspoken/core';
import { Rng } from '../../src/shared/rng';

const SEEDS = [1, 2, 3, 7, 11, 23, 99, 500, 1234, 98765];

const fnv = (s: string) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0).toString(16);
};

describe('village 1 is unchanged', () => {
  it('builds byte-identical languages and worlds to before village 2 existed', () => {
    // Hashes of JSON.stringify({lang, world}) taken before the second village was added.
    const before: Record<number, string> = {
      1: '48f56d66',
      2: 'ff8b7aca',
      3: '7d0093ad',
      7: '1c59abab',
      11: '43451466',
      42: 'bb721c2f',
      99: '7df28d9a',
      500: '2b632422',
      1234: '886e4e97',
      98765: 'cdb6d624',
      4000000000: '6a869cf9',
    };
    for (const [seed, h] of Object.entries(before)) {
      const s = newGame(+seed);
      expect(s.village).toBe(1);
      expect(fnv(JSON.stringify({ lang: s.lang, world: s.world })), seed).toBe(h);
      expect(newGame(+seed, 1).world).toEqual(s.world);
    }
  });

  it('has none of the second village grammar', () => {
    for (const seed of SEEDS) {
      const L = makeLanguage(seed);
      expect(L.grammar.cased).toBeUndefined();
      expect(writtenGrammar(L)).not.toContain('SUBJ');
    }
  });
});

describe('village 2 language', () => {
  it('is deterministic, new, and writes the doer, done-to and agreement', () => {
    for (const seed of SEEDS) {
      const L = makeLanguage(seed, 2);
      expect(makeLanguage(seed, 2)).toEqual(L);
      expect(L.village).toBe(2);
      expect(L.name).not.toBe(makeLanguage(seed).name);
      expect(L.grammar.cased).toBeDefined();
      expect(L.grammar.agree).toBe(true);
      for (const g of ['SUBJ', 'OBJ', 'PLV']) expect(writtenGrammar(L)).toContain(g);
      expect(L.glyphs.PLV.mark).toBe('under');
      const keys = new Set<string>();
      for (const c of ALL_CONCEPTS) {
        if (c.cat === 'grammar' && !writtenGrammar(L).includes(c.id)) continue;
        const k = JSON.stringify(L.glyphs[c.id].strokes);
        expect(keys.has(k), `${seed} ${c.id}`).toBe(false);
        keys.add(k);
      }
      expect(new Set(Object.values(L.words)).size).toBe(ALL_CONCEPTS.length);
    }
  });

  it('varies where the action goes and where the particles go', () => {
    const verbs = new Set<string>();
    const sides = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const c = makeLanguage(seed, 2).grammar.cased!;
      verbs.add(c.verb);
      sides.add(c.side);
    }
    expect(verbs.size).toBe(3);
    expect(sides.size).toBe(2);
  });
});

/** The tokens of a noun phrase, as writeNP makes them (for checking particles sit beside them). */
function npTokens(s: State, np: NP): string[] {
  return realize(s.lang, { v: 'sleep', s: np, tense: 'now' })
    .map((t) => t.m)
    .filter((m) => m !== 'sleep' && m !== 'SUBJ' && m !== 'NEG');
}

/** Check one written sentence follows the second village's grammar. */
function checkGrammar(s: State, f: Frame, toks: Token[]) {
  const c = s.lang.grammar.cased!;
  const ms = toks.map((t) => t.m);
  const near = (np: NP, k: string) => {
    const i = ms.indexOf(k);
    expect(i, `${k} in ${ms.join(' ')}`).toBeGreaterThanOrEqual(0);
    const words = npTokens(s, np);
    const span = c.side === 'after' ? ms.slice(i - words.length, i) : ms.slice(i + 1, i + 1 + words.length);
    expect(span, `${k} beside ${np.n} in ${ms.join(' ')}`).toEqual(words);
  };
  near(f.s, 'SUBJ');
  if (f.o) near(f.o, 'OBJ');
  else expect(ms).not.toContain('OBJ');
  const verb = toks.find((t) => t.m === f.v)!;
  expect(verb.marks.includes('PLV'), `agreement in ${ms.join(' ')}`).toBe(!!f.s.pl);
  // The action keeps its place: first, between, or last of the doer/done-to.
  const vi = ms.indexOf(f.v);
  const si = ms.indexOf('SUBJ');
  const oi = f.o ? ms.indexOf('OBJ') : si;
  if (c.verb === 'first') expect(vi).toBeLessThan(Math.min(si, oi));
  if (c.verb === 'last') expect(vi).toBeGreaterThan(Math.max(si, oi));
  if (c.verb === 'middle' && f.o) expect(vi > Math.min(si, oi) && vi < Math.max(si, oi)).toBe(true);
  // The order of doer and done-to follows the frame.
  if (f.o) expect(oi < si).toBe(!!f.ofirst);
}

describe('village 2 world', () => {
  it('has the authored places, every written word in two or more scenes, and riddles everywhere', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 2);
      expect(s.world.chapters.map((c) => c.title)).toEqual(CHAPTERS2.map((c) => c.title));
      const ctx = contexts(s.world, s.world.chapters.length - 1);
      for (const [m, ps] of ctx) expect(ps.length, `${seed} ${m}`).toBeGreaterThanOrEqual(2);
      for (const g of ['SUBJ', 'OBJ', 'PLV', 'PAST', 'FUT', 'NEG', 'Q', 'TO']) expect(ctx.has(g), `${seed} ${g}`).toBe(true);
      for (const ch of s.world.chapters) expect(ch.challenges.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('writes every panel and riddle with consistent case, order and agreement', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 2);
      for (const ch of s.world.chapters) {
        for (const p of ch.panels) checkGrammar(s, p.frame, p.tokens);
        for (const c of ch.challenges) {
          checkGrammar(s, c.frame, c.tokens);
          for (const o of c.options) checkGrammar(s, o, realize(s.lang, o));
        }
      }
      // The pass shows both orders, and the same scene written both ways.
      const pass = s.world.chapters[0].panels.filter((p) => p.frame.o);
      expect(pass.some((p) => p.frame.ofirst)).toBe(true);
      expect(pass.some((p) => !p.frame.ofirst)).toBe(true);
    }
  });

  it('pick riddles have three distinct options and one right answer; roles riddles put the done-to first and offer the swap', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 2);
      let roles = 0;
      for (const ch of s.world.chapters)
        for (const c of ch.challenges) {
          if (c.kind !== 'pick') continue;
          const written = c.options.map((f) => realize(s.lang, f).map(tokenKey).join(' '));
          expect(new Set(written).size).toBe(3);
          expect(sameTokens(realize(s.lang, c.options[c.answer]), c.tokens)).toBe(true);
          if (c.tests === 'roles' && c.frame.ofirst) {
            roles++;
            const swap = c.options.some((o, k) => k !== c.answer && o.s.n === c.frame.o!.n && o.o!.n === c.frame.s.n);
            expect(swap, `${seed} ${c.id}`).toBe(true);
          }
        }
      expect(roles).toBeGreaterThanOrEqual(5);
    }
  });

  it('compose riddles can be spelled from their tiles, in either order', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 2);
      for (const ch of s.world.chapters)
        for (const c of ch.challenges) {
          if (c.kind !== 'compose') continue;
          for (const w of [c.tokens, ...(c.alts ?? [])]) expect(assign(c.tiles, w).every((i) => i >= 0), `${seed} ${c.id}`).toBe(true);
          if (c.frame.o) expect(c.alts?.length).toBe(1);
          expect(writings(s.lang, c.frame).length).toBe(c.frame.o ? 2 : 1);
        }
      const fin = s.world.chapters[s.world.chapters.length - 1].challenges.find((c) => c.question)!;
      expect(fin).toBeDefined();
      expect(morphemes(fin.question!)).toContain('Q');
      // The trap: the action marked for many doers is on offer.
      expect(fin.tiles.some((t) => t.m === 'find' && t.marks.includes('PLV'))).toBe(true);
    }
  });

  it('riddles only use words already seen in that place or before', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 2);
      s.world.chapters.forEach((ch, i) => {
        const seen = contexts(s.world, i);
        for (const c of ch.challenges) {
          for (const m of morphemes(c.tokens)) expect(seen.has(m), `${seed} ${c.id} ${m}`).toBe(true);
          for (const m of morphemes(c.question ?? [])) expect(seen.has(m), `${seed} ${c.id} ${m}`).toBe(true);
        }
      });
    }
  });
});

/** Tile indices that spell the tokens, each tile used once (-1 when impossible). */
function assign(tiles: Token[], tokens: Token[]): number[] {
  const used = new Set<number>();
  return tokens.map((t) => {
    const i = tiles.findIndex((x, k) => !used.has(k) && tokenKey(x) === tokenKey(t));
    if (i >= 0) used.add(i);
    return i;
  });
}

/** Solve a whole run perfectly; compose answers use the other order when there is one. */
function solveAll(seed: number, village: number) {
  const s = newGame(seed, village);
  const acts: string[] = [];
  const act = (a: Action) => {
    const r = apply(s, a);
    expect(r).not.toBeNull();
    acts.push(encode(a));
    return r!;
  };
  while (!s.over) {
    const ch = s.world.chapters[s.chapter];
    for (const p of ch.panels) for (const m of morphemes(p.tokens)) if (!s.confirmed.includes(m) && s.notebook[m] !== m) act({ t: 'guess', glyph: m, meaning: m });
    for (const c of ch.challenges) {
      if (s.solved.includes(c.id)) continue;
      const way = c.alts?.[0] ?? c.tokens;
      const r = c.kind === 'pick' ? act({ t: 'answer', challenge: c.id, pick: c.answer }) : act({ t: 'answer', challenge: c.id, tiles: assign(c.tiles, way) });
      expect(r.ok).toBe(true);
    }
  }
  return { s, acts };
}

describe('village 2 play', () => {
  it('a perfect run (writing the other order) reads every glyph and finishes', () => {
    for (const seed of [7, 23]) {
      const { s } = solveAll(seed, 2);
      expect(s.over).toBe(true);
      expect(s.mistakes).toBe(0);
      expect(s.understood.length).toBe(s.world.chapters.reduce((n, ch) => n + ch.panels.length, 0));
    }
  });

  it('the wrong agreement on the action is a mistake', () => {
    const s = newGame(5, 2);
    const fin = s.world.chapters[4].challenges.find((c) => c.question)!;
    s.chapter = 4;
    const bad = fin.tokens.map((t) => (t.m === 'find' ? { ...t, marks: [...t.marks, 'PLV'].sort() } : t));
    const r = apply(s, { t: 'answer', challenge: fin.id, tiles: assign(fin.tiles, bad) });
    expect(r?.ok).toBe(false);
    expect(r?.right?.filter((x) => !x).length).toBe(1);
  });

  it('replays exactly from its action string, kept apart from village 1', () => {
    const { s, acts } = solveAll(11, 2);
    for (const a of acts) expect(decode(a)).not.toBeNull();
    const r = replay(11, acts.join(','), 2);
    expect(r.village).toBe(2);
    expect(r.confirmed.sort()).toEqual(s.confirmed.sort());
    expect(r.over).toBe(true);
    expect(JSON.stringify(replay(11, acts.slice(0, 40).join(','), 2))).toBe(JSON.stringify(replay(11, acts.slice(0, 40).join(','), 2)));
  });

  it('random play never throws and replays to the same state, in both villages', () => {
    for (const village of [1, 2]) {
      for (const seed of [3, 42, 777]) {
        const rng = new Rng(seed * 31 + village);
        const s = newGame(seed, village);
        const acts: string[] = [];
        const ids = ALL_CONCEPTS.map((c) => c.id);
        for (let i = 0; i < 400 && !s.over; i++) {
          const ch = s.world.chapters[s.chapter];
          let a: Action;
          if (rng.next() < 0.6) {
            const p = rng.pick(ch.panels);
            const m = rng.pick(morphemes(p.tokens));
            // Mostly right guesses (so the run moves on), some wrong ones and clears.
            const roll = rng.next();
            a = { t: 'guess', glyph: m, meaning: roll < 0.7 ? m : roll < 0.9 ? rng.pick(ids) : null };
          } else {
            const c = rng.pick(ch.challenges);
            if (c.kind === 'pick') a = { t: 'answer', challenge: c.id, pick: rng.next() < 0.6 ? c.answer : rng.int(0, 2) };
            else a = { t: 'answer', challenge: c.id, tiles: rng.next() < 0.6 ? assign(c.tiles, (rng.next() < 0.5 ? c.alts?.[0] : undefined) ?? c.tokens) : rng.shuffle(c.tiles.map((_, k) => k)).slice(0, rng.int(1, c.tiles.length)) };
          }
          if (apply(s, a)) acts.push(encode(a));
        }
        const r = replay(seed, acts.join(','), village);
        expect(r.confirmed).toEqual(s.confirmed);
        expect(r.solved).toEqual(s.solved);
        expect(r.mistakes).toBe(s.mistakes);
        expect(r.chapter).toBe(s.chapter);
      }
    }
  });
});
