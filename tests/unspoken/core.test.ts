import { describe, expect, it } from 'vitest';
import {
  CONCEPTS,
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
  writtenGrammar,
  type Frame,
  type Token,
} from '../../src/unspoken/core';

const SEEDS = [1, 2, 3, 7, 11, 23, 99, 500, 1234, 98765];

describe('language', () => {
  it('is deterministic and gives every concept a distinct glyph and word', () => {
    for (const seed of SEEDS) {
      const a = makeLanguage(seed);
      expect(makeLanguage(seed)).toEqual(a);
      const keys = new Set<string>();
      for (const c of CONCEPTS) {
        if (c.cat === 'grammar' && !writtenGrammar(a).includes(c.id)) continue;
        const k = JSON.stringify(a.glyphs[c.id].strokes);
        expect(keys.has(k), `${seed} ${c.id}`).toBe(false);
        keys.add(k);
        expect(a.words[c.id].length).toBeGreaterThan(0);
      }
      expect(new Set(Object.values(a.words)).size).toBe(CONCEPTS.length);
    }
  });

  it('varies grammar across seeds', () => {
    const orders = new Set<string>();
    const plurals = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const g = makeLanguage(seed).grammar;
      orders.add(g.order);
      plurals.add(g.plural);
    }
    expect(orders.size).toBe(4);
    expect(plurals.size).toBe(3);
  });
});

describe('sentences', () => {
  it('follow the language word order', () => {
    const f: Frame = { v: 'see', s: { n: 'sef' }, o: { n: 'fish' }, tense: 'now' };
    for (let seed = 0; seed < 40; seed++) {
      const L = makeLanguage(seed);
      const order = realize(L, f).map((t) => t.m);
      const expected = { SVO: ['sef', 'see', 'fish'], SOV: ['sef', 'fish', 'see'], VSO: ['see', 'sef', 'fish'], VOS: ['see', 'fish', 'sef'] }[L.grammar.order];
      expect(order).toEqual(expected);
    }
  });

  it('marks plural, negation, tense and direction somewhere', () => {
    const f: Frame = { v: 'carry', s: { n: 'person', pl: true }, o: { n: 'basket' }, d: { n: 'mountain' }, tense: 'past', neg: true };
    for (let seed = 0; seed < 40; seed++) {
      const L = makeLanguage(seed);
      const toks = realize(L, f);
      const ms = morphemes(toks);
      expect(ms).toContain('NEG');
      expect(ms).toContain('PAST');
      expect(ms).toContain('TO');
      if (L.grammar.plural === 'double') expect(toks.filter((t) => t.m === 'person').length).toBe(2);
      else expect(ms).toContain('PL');
    }
  });
});

describe('world', () => {
  it('every written word appears in at least two scenes, and every chapter has riddles', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed);
      const ctx = contexts(s.world, 4);
      for (const [m, ps] of ctx) expect(ps.length, `${seed} ${m}`).toBeGreaterThanOrEqual(2);
      for (const ch of s.world.chapters) expect(ch.challenges.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('pick riddles have three distinct options and one right answer', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed);
      for (const ch of s.world.chapters)
        for (const c of ch.challenges) {
          if (c.kind !== 'pick') continue;
          const written = c.options.map((f) => realize(s.lang, f).map(tokenKey).join(' '));
          expect(new Set(written).size).toBe(3);
          expect(sameTokens(realize(s.lang, c.options[c.answer]), c.tokens)).toBe(true);
        }
    }
  });

  it('riddles only use words already seen in that chapter or before', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed);
      s.world.chapters.forEach((ch, i) => {
        const seen = contexts(s.world, i);
        for (const c of ch.challenges) for (const m of morphemes(c.tokens)) expect(seen.has(m), `${seed} ${c.id} ${m}`).toBe(true);
      });
    }
  });
});

/** Solve a whole run perfectly: read every glyph right, then answer every riddle. */
function solveAll(seed: number) {
  const s = newGame(seed);
  const acts: string[] = [];
  const act = (a: Parameters<typeof apply>[1]) => {
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
      const r = c.kind === 'pick' ? act({ t: 'answer', challenge: c.id, pick: c.answer }) : act({ t: 'answer', challenge: c.id, tiles: assign(c.tiles, c.tokens) });
      expect(r.ok).toBe(true);
    }
  }
  return { s, acts };
}

/** Tile indices that spell the tokens, each tile used once. */
function assign(tiles: Token[], tokens: Token[]): number[] {
  const used = new Set<number>();
  return tokens.map((t) => {
    const i = tiles.findIndex((x, k) => !used.has(k) && tokenKey(x) === tokenKey(t));
    used.add(i);
    return i;
  });
}

describe('play', () => {
  it('a perfect run reads every glyph and finishes', () => {
    const { s } = solveAll(7);
    expect(s.over).toBe(true);
    expect(s.mistakes).toBe(0);
    expect(s.understood.length).toBe(s.world.chapters.reduce((n, ch) => n + ch.panels.length, 0));
  });

  it('a wrong answer is a mistake and does not solve', () => {
    const s = newGame(3);
    const c = s.world.chapters[0].challenges.find((x) => x.kind === 'pick')!;
    const r = apply(s, { t: 'answer', challenge: c.id, pick: (c.answer + 1) % 3 })!;
    expect(r.ok).toBe(false);
    expect(s.mistakes).toBe(1);
    expect(s.solved).not.toContain(c.id);
  });

  it('solving a riddle proves right guesses and clears wrong ones', () => {
    const s = newGame(5);
    const c = s.world.chapters[0].challenges.find((x) => x.kind === 'pick')!;
    const [a, b] = morphemes(c.tokens);
    apply(s, { t: 'guess', glyph: a, meaning: a });
    apply(s, { t: 'guess', glyph: b, meaning: a });
    apply(s, { t: 'answer', challenge: c.id, pick: c.answer });
    expect(s.confirmed).toContain(a);
    expect(s.notebook[b]).toBeUndefined();
    expect(s.doubted).toContain(b);
  });

  it('later chapters stay closed until the riddles are solved', () => {
    const s = newGame(9);
    const later = s.world.chapters[1].challenges[0];
    expect(apply(s, { t: 'answer', challenge: later.id, pick: 0 })).toBeNull();
  });

  it('replays exactly from its action string', () => {
    const { s, acts } = solveAll(11);
    for (const a of acts) expect(decode(a)).not.toBeNull();
    const r = replay(11, acts.join(','));
    expect(r.confirmed.sort()).toEqual(s.confirmed.sort());
    expect(r.over).toBe(true);
  });
});
