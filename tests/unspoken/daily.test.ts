import { describe, expect, it } from 'vitest';
import { apply, contexts, encode, features, makeLanguage, makeWorld, morphemes, newGame, realize, replay, sameTokens, tokenKey, type Token } from '../../src/unspoken/core';

const SEEDS = [1, 2, 3, 7, 11, 23, 99, 500, 1234, 98765, 4000000000];
const assign = (tiles: Token[], tokens: Token[]) => {
  const used = new Set<number>();
  return tokens.map((t) => {
    const i = tiles.findIndex((x, k) => !used.has(k) && tokenKey(x) === tokenKey(t));
    used.add(i);
    return i;
  });
};
const sig = (fs: { frame: object }[]) => fs.map((x) => JSON.stringify(x.frame)).join('|');

describe("today's language (daily world)", () => {
  it('keeps the authored scenes and story but shuffles their order and draws its own riddles', () => {
    let shuffled = 0;
    for (const seed of SEEDS) {
      const lang = makeLanguage(seed);
      const plain = makeWorld(lang);
      const d = makeWorld(lang, { daily: true });
      expect(makeWorld(lang, { daily: true })).toEqual(d);
      expect(d.chapters.map((c) => c.title)).toEqual(plain.chapters.map((c) => c.title));
      expect(d.story.length).toBe(plain.story.length);
      d.chapters.forEach((ch, i) => {
        expect(ch.panels.length).toBe(plain.chapters[i].panels.length);
        // The same scenes (verb and object) in some order; the murals keep the story's order.
        const key = (p: { frame: { v: string; o?: { n: string } } }) => `${p.frame.v}:${p.frame.o?.n ?? ""}`;
        expect(ch.panels.map(key).sort()).toEqual(plain.chapters[i].panels.map(key).sort());
        if (ch.backdrop === 'murals') expect(ch.panels.map(key)).toEqual(plain.chapters[i].panels.map(key));
        else if (ch.panels.map(key).join() !== plain.chapters[i].panels.map(key).join()) shuffled++;
        expect(ch.panels[0].frame.v).toBe(plain.chapters[i].panels[0].frame.v);
        ch.panels.forEach((p, k) => expect(p.id).toBe(`p${i}.${k}`));
      });
      expect(sig(d.chapters.flatMap((c) => c.challenges))).not.toBe(sig(plain.chapters.flatMap((c) => c.challenges)));
    }
    expect(shuffled).toBeGreaterThan(SEEDS.length * 3);
  });

  it('is fair: every word in two scenes, riddles only use words seen so far, picks have one right answer', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 1, true);
      expect(s.daily).toBe(true);
      for (const [m, ps] of contexts(s.world, 4)) expect(ps.length, `${seed} ${m}`).toBeGreaterThanOrEqual(2);
      s.world.chapters.forEach((ch, i) => {
        expect(ch.challenges.length, `${seed} ${ch.title}`).toBeGreaterThanOrEqual(i >= 2 ? 4 : 3);
        const seen = contexts(s.world, i);
        for (const c of ch.challenges) {
          for (const m of morphemes(c.tokens)) expect(seen.has(m), `${seed} ${c.id} ${m}`).toBe(true);
          if (c.kind !== 'pick') continue;
          const written = c.options.map((f) => realize(s.lang, f).map(tokenKey).join(' '));
          expect(new Set(written).size).toBe(3);
          expect(sameTokens(realize(s.lang, c.options[c.answer]), c.tokens)).toBe(true);
        }
      });
    }
  });

  it('asks harder riddles after the Market than normal play does', () => {
    let dailyF = 0;
    let plainF = 0;
    let dailyTiles = 0;
    let plainTiles = 0;
    let dn = 0;
    let pn = 0;
    for (let seed = 0; seed < 60; seed++) {
      const lang = makeLanguage(seed);
      const later = (w: ReturnType<typeof makeWorld>) => w.chapters.slice(2).flatMap((c) => c.challenges.filter((x) => !x.question));
      for (const c of later(makeWorld(lang, { daily: true }))) {
        dailyF += features(c.frame);
        dn++;
        if (c.kind === 'compose') dailyTiles += c.tiles.length - c.tokens.length;
      }
      for (const c of later(makeWorld(lang))) {
        plainF += features(c.frame);
        pn++;
        if (c.kind === 'compose') plainTiles += c.tiles.length - c.tokens.length;
      }
    }
    expect(dn).toBeGreaterThan(pn);
    expect(dailyF / dn).toBeGreaterThan(plainF / pn + 0.5);
    expect(dailyTiles).toBeGreaterThan(plainTiles);
  });

  it('plays through and replays exactly', () => {
    for (const seed of [5, 77]) {
      const s = newGame(seed, 1, true);
      const acts: string[] = [];
      while (!s.over) {
        const ch = s.world.chapters[s.chapter];
        for (const p of ch.panels)
          for (const m of morphemes(p.tokens))
            if (!s.confirmed.includes(m) && s.notebook[m] !== m) {
              const a = { t: 'guess' as const, glyph: m, meaning: m };
              expect(apply(s, a)).not.toBeNull();
              acts.push(encode(a));
            }
        for (const c of ch.challenges) {
          if (s.solved.includes(c.id)) continue;
          const a = c.kind === 'pick' ? { t: 'answer' as const, challenge: c.id, pick: c.answer } : { t: 'answer' as const, challenge: c.id, tiles: assign(c.tiles, c.tokens) };
          expect(apply(s, a)?.ok).toBe(true);
          acts.push(encode(a));
        }
      }
      const r = replay(seed, acts.join(','), 1, true);
      expect(r.over).toBe(true);
      expect(r.solved).toEqual(s.solved);
      // The same actions do not replay in the normal world.
      expect(() => replay(seed, acts.join(','))).toThrow();
    }
  });
});
