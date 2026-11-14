import { describe, expect, it } from 'vitest';
import {
  ALL_CONCEPTS,
  CHAPTERS2,
  CONCEPTS,
  makeWorld,
  glyphsAlike,
  adjShown2,
  linkActions,
  unlinkActions,
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
  type Stroke,
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
    // The raw language (before the look-alike glyph fix) is exactly the old one; the world never depends on
    // glyph shapes, so the real game's world is the old world too.
    for (const [seed, h] of Object.entries(before)) {
      const raw = makeLanguage(+seed, 1, false);
      const s = newGame(+seed);
      expect(s.village).toBe(1);
      expect(fnv(JSON.stringify({ lang: raw, world: makeWorld(raw) })), seed).toBe(h);
      expect(s.world).toEqual(makeWorld(raw));
    }
  });

  it('the look-alike fix only redraws glyphs that looked like an earlier one', () => {
    let fixed = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (const village of [1, 2]) {
        const raw = makeLanguage(seed, village, false);
        const L = makeLanguage(seed, village);
        expect({ ...L, glyphs: null }).toEqual({ ...raw, glyphs: null });
        const shapes: Stroke[][] = [];
        for (const c of village === 2 ? ALL_CONCEPTS : CONCEPTS) {
          const g = raw.glyphs[c.id];
          if (!g || g.mark || !g.strokes.length) continue;
          const same = JSON.stringify(L.glyphs[c.id]) === JSON.stringify(g);
          if (!same) fixed++;
          // Changed exactly when it looked like a glyph before it (in the fixed language).
          expect(same, `${seed}/${village} ${c.id}`).toBe(!shapes.some((o) => glyphsAlike(o, g.strokes)));
          shapes.push(L.glyphs[c.id].strokes);
        }
      }
    }
    expect(fixed).toBeGreaterThan(0);
  });

  it('never gives two meanings look-alike glyphs (both villages)', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const village of [1, 2]) {
        const L = makeLanguage(seed * 2654435761 >>> 0, village);
        const seen: [string, Stroke[]][] = [];
        for (const [id, g] of Object.entries(L.glyphs)) {
          if (g.mark || !g.strokes.length) continue;
          const twin = seen.find(([, o]) => glyphsAlike(o, g.strokes));
          expect(twin?.[0], `${seed}/${village} ${id}`).toBeUndefined();
          seen.push([id, g.strokes]);
        }
      }
    }
    // The playtest's language: "before" and "what?" were the same arc, a quarter box apart.
    const raw = makeLanguage(2043983302, 1, false);
    expect(glyphsAlike(raw.glyphs.PAST.strokes, raw.glyphs.Q.strokes)).toBe(true);
    const L = makeLanguage(2043983302);
    expect(glyphsAlike(L.glyphs.PAST.strokes, L.glyphs.Q.strokes)).toBe(false);
  });

  it('counts lone strokes, and a dot against a short tick, as look-alikes', () => {
    const line = (x1: number, y1: number, x2: number, y2: number): Stroke => ({ k: 'L', x1, y1, x2, y2 });
    // Any two single short strokes ("before" and "what?" in the third playtest).
    expect(glyphsAlike([line(0.25, 0.25, 0.75, 0.25)], [line(0.5, 0.25, 0.5, 0.75)])).toBe(true);
    expect(glyphsAlike([line(0.25, 0.25, 0.75, 0.25)], [{ k: 'Q', x1: 0.25, y1: 0.75, cx: 0.26, cy: 0.52, x2: 0.5, y2: 0.5 }])).toBe(true);
    // A lone dot or ring is not a stroke.
    expect(glyphsAlike([line(0.25, 0.25, 0.75, 0.25)], [{ k: 'D', x: 0.5, y: 0.5 }])).toBe(false);
    // The same radical and body, but a dot where the other has a short tick (dog and bird in village 2).
    const body = [line(0.04, 0.12, 0.28, 0.12), line(0.04, 0.12, 0.04, 0.88), line(0.36, 0.5, 0.94, 0.5), line(0.65, 0.08, 0.65, 0.92)];
    expect(glyphsAlike([...body, { k: 'D', x: 0.8, y: 0.3 }], [...body, line(0.75, 0.25, 0.85, 0.35)])).toBe(true);
    // A long stroke is no tick.
    expect(glyphsAlike([...body, { k: 'D', x: 0.8, y: 0.3 }], [...body, line(0.36, 0.92, 0.94, 0.92)])).toBe(false);
    // In the fixed languages no glyph is a lone stroke beside another lone stroke.
    for (let seed = 0; seed < 100; seed++)
      for (const village of [1, 2]) {
        const L = makeLanguage(seed, village);
        const lone = Object.values(L.glyphs).filter((g) => !g.mark && g.strokes.length === 1 && (g.strokes[0].k === 'L' || g.strokes[0].k === 'Q'));
        expect(lone.length, `${seed}/${village}`).toBeLessThanOrEqual(1);
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

describe('playtest fixes', () => {
  it('scenes in a newly opened place come clear at once when their glyphs are already read', () => {
    for (const village of [1, 2]) {
      for (const seed of [4242, 7]) {
        const s = newGame(seed, village);
        const ch0 = s.world.chapters[0];
        for (const p of ch0.panels) for (const m of morphemes(p.tokens)) if (s.notebook[m] !== m && !s.confirmed.includes(m)) apply(s, { t: 'guess', glyph: m, meaning: m });
        let r = null;
        for (const c of ch0.challenges) r = apply(s, c.kind === 'pick' ? { t: 'answer', challenge: c.id, pick: c.answer } : { t: 'answer', challenge: c.id, tiles: assign(c.tiles, c.tokens) });
        expect(r?.opened).toBe(1);
        for (const p of s.world.chapters[1].panels) {
          const ready = morphemes(p.tokens).every((m) => s.notebook[m] === m);
          expect(s.understood.includes(p.id), `${village} ${seed} ${p.id}`).toBe(ready);
        }
      }
    }
  });

  it('old runs that re-guess a glyph proven by a newly opened place still replay', () => {
    const { acts } = solveAll(4242, 2);
    // Find the answer that opened place 2, then re-guess a glyph it proved, as older runs could.
    const s = newGame(4242, 2);
    let at = -1;
    acts.forEach((tk, i) => {
      const r = apply(s, decode(tk)!);
      if (r?.opened === 1) at = i;
    });
    const s2 = replay(4242, acts.slice(0, at + 1).join(','), 2);
    const g = s2.confirmed[0];
    const patched = [...acts.slice(0, at + 1), `G${g}=${g}`, ...acts.slice(at + 1)];
    expect(replay(4242, patched.join(','), 2).over).toBe(true);
  });

  it('bug-report links hide meanings and map back to the same run', () => {
    for (const village of [1, 2]) {
      const { acts } = solveAll(4242, village);
      const link = linkActions(4242, village, acts);
      expect(link).not.toMatch(/G[a-z]+=|see|dog/);
      expect(unlinkActions(4242, village, link)).toBe(acts.join(','));
      // Old links with plain glyph names still load.
      expect(unlinkActions(4242, village, acts.join(','))).toBe(acts.join(','));
      // A clear (no meaning) round-trips too.
      expect(unlinkActions(4242, village, linkActions(4242, village, ['Gdog=']))).toBe('Gdog=');
    }
  });

  it('village 2 riddles only use describing words the pictures show clearly', () => {
    for (const seed of SEEDS) {
      const s = newGame(seed, 2);
      for (const ch of s.world.chapters)
        for (const c of ch.challenges)
          for (const f of [c.frame, ...c.options])
            for (const p of [f.s, f.o, f.d]) if (p?.adj) expect(adjShown2(p.n, p.adj), `${seed} ${c.id} ${p.adj} ${p.n}`).toBe(true);
    }
  });
});
