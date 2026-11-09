// The village and its story, told in five places. Each chapter has panels
// (illustrated scenes with a caption in the language) and challenges that
// test whether you can read and write what you've seen. Panels are
// authored so that every word appears in at least two different scenes,
// with small seeded variations; challenge sentences are generated from the
// words you've met so far.

import { Rng, mixSeed } from '../../shared/rng';
import { BREAKABLE, CONCEPT, COUNTABLE, EDIBLE, FORCES, MAKEABLE, PORTABLE, VERBS, type Category } from './concepts';
import { type Language } from './lang';
import { realize, frameKey, morphemes, tokenKey, type Frame, type NP, type Tense, type Token } from './sentence';

export type Backdrop = 'shore' | 'market' | 'houses' | 'murals' | 'mountain';

export interface Panel {
  id: string;
  ch: number;
  frame: Frame;
  tokens: Token[];
}

export interface Challenge {
  id: string;
  ch: number;
  kind: 'pick' | 'compose';
  /** What to read (pick) or write (compose). */
  frame: Frame;
  tokens: Token[];
  /** pick: three scenes, one of which matches. */
  options: Frame[];
  answer: number;
  /** compose: the tiles on offer (the right ones plus decoys), shuffled. */
  tiles: Token[];
  /** The final question, asked by the elder, when this challenge answers it. */
  question?: Token[];
}

export interface Chapter {
  title: string;
  backdrop: Backdrop;
  /** One line of the traveler's journal, setting the scene. */
  intro: string;
  panels: Panel[];
  challenges: Challenge[];
}

export interface World {
  chapters: Chapter[];
  /** The story, in order, for the ending's translation. */
  story: Frame[];
}

// ---------------------------------------------------------------- templates

/** "big fish*" -> {n: fish, adj: big, pl: true}; a|b picks one at random. */
function np(rng: Rng, s: string): NP {
  const parts = s.split(' ').map((p) => (p.includes('|') ? rng.pick(p.split('|')) : p));
  let n = parts[parts.length - 1];
  const pl = n.endsWith('*');
  if (pl) n = n.slice(0, -1);
  const out: NP = { n };
  if (parts.length > 1) out.adj = parts[0];
  if (pl) out.pl = true;
  return out;
}

interface T {
  v: string;
  s: string;
  o?: string;
  d?: string;
  t?: Tense;
  neg?: boolean;
}

const t = (v: string, s: string, o?: string, d?: string, extra: Partial<T> = {}): T => ({ v, s, o, d, ...extra });

function frameOf(rng: Rng, x: T): Frame {
  const f: Frame = { v: x.v, s: np(rng, x.s), tense: x.t ?? 'now' };
  if (x.o) f.o = np(rng, x.o);
  if (x.d) f.d = np(rng, x.d);
  if (x.neg) f.neg = true;
  return f;
}

interface ChapterDef {
  title: string;
  backdrop: Backdrop;
  intro: string;
  panels: T[];
  /** Grammar this chapter is about; challenges lean on it. */
  focus: ('PL' | 'NEG' | 'PAST' | 'FUT' | 'TO' | 'ADJ')[];
}

const CHAPTERS: ChapterDef[] = [
  {
    title: 'The Shore',
    backdrop: 'shore',
    intro: 'My boat ran aground by a quiet village. No one here speaks a word I know. Their walls are covered in writing, each sign beside a painted scene.',
    focus: ['ADJ'],
    panels: [
      t('see', 'sef', 'fish'),
      t('eat', 'bird', 'fish'),
      t('see', 'child', 'bird'),
      t('carry', 'sef', 'big fish'),
      t('eat', 'dog', 'small fish'),
      t('carry', 'child', 'small dog'),
      t('see', 'dog', 'big bird'),
      t('see', 'child', 'small|big boat'),
    ],
  },
  {
    title: 'The Market',
    backdrop: 'market',
    intro: 'The market is half empty, but the stalls still carry their painted signs. Two names keep returning: a woman in red, and a boy in a cap.',
    focus: ['PL', 'TO'],
    panels: [
      t('give', 'ama', 'bread', 'tor'),
      t('give', 'tor', 'fish', 'ama'),
      t('make', 'ama', 'basket*'),
      t('eat', 'goat*', 'bread'),
      t('go', 'tor', undefined, 'market'),
      t('go', 'person*', undefined, 'market'),
      t('see', 'goat', 'person*'),
      t('give', 'sef', 'basket', 'child'),
      t('take', 'dog|goat', 'fish'),
    ],
  },
  {
    title: 'The Houses',
    backdrop: 'houses',
    intro: 'Evening among the houses. Lamps in a few windows, most of them dark. The signs here seem to speak of what does not happen.',
    focus: ['NEG', 'ADJ'],
    panels: [
      t('sleep', 'child'),
      t('sleep', 'tor', undefined, undefined, { neg: true }),
      t('make', 'ama', 'lamp'),
      t('see', 'elder', 'dark house'),
      t('fear', 'dog', 'fire'),
      t('fear', 'elder', 'dog', undefined, { neg: true }),
      t('carry', 'tor', 'new lamp', 'old house'),
      t('break', 'child', 'old lamp'),
      t('make', 'elder', 'fire'),
      t('go', 'child', undefined, 'dark house'),
      t('make', 'sef', 'new boat'),
    ],
  },
  {
    title: 'The Murals',
    backdrop: 'murals',
    intro: 'Behind the shrine, a long wall painted in faded colors. The same story, scene after scene. Something happened here, before.',
    focus: ['PAST', 'PL'],
    panels: [
      t('break', 'rain', 'house*', undefined, { t: 'past' }),
      t('break', 'river', 'boat*', undefined, { t: 'past' }),
      t('take', 'river', 'basket*', undefined, { t: 'past' }),
      t('fear', 'person*', 'river', undefined, { t: 'past' }),
      t('carry', 'person*', 'basket*', 'mountain', { t: 'past' }),
      t('go', 'person*', undefined, 'mountain', { t: 'past' }),
      t('go', 'elder', undefined, 'mountain', { t: 'past', neg: true }),
      t('see', 'elder', 'rain', undefined, { t: 'past' }),
    ],
  },
  {
    title: 'The Mountain Path',
    backdrop: 'mountain',
    intro: 'At the foot of the mountain the elder waits with the boy. They are packing. Their signs point up the path, toward what is still to come.',
    focus: ['FUT'],
    panels: [
      t('go', 'elder', undefined, 'mountain', { t: 'fut' }),
      t('carry', 'tor', 'lamp', 'mountain', { t: 'fut' }),
      t('find', 'ama', 'Q'),
      t('find', 'ama', 'stone'),
      t('see', 'child', 'sun'),
      t('see', 'bird', 'moon', undefined, { neg: true }),
      t('find', 'tor', 'stone', undefined, { t: 'past' }),
      t('see', 'elder', 'moon', undefined, { t: 'fut' }),
      t('see', 'elder', 'sun'),
      t('see', 'bird', 'tree'),
      t('go', 'child', undefined, 'Q'),
      t('go', 'child', undefined, 'tree'),
    ],
  },
];

// ---------------------------------------------------------------- random sentences

const catOf = (id: string): Category => CONCEPT.get(id)!.cat;

function objectOk(v: string, o: string, s: string): boolean {
  if (o === s) return false;
  switch (v) {
    case 'eat':
      return EDIBLE.has(o) && catOf(s) !== 'nature';
    case 'carry':
    case 'give':
    case 'take':
    case 'find':
      return PORTABLE.has(o);
    case 'make':
      return MAKEABLE.has(o);
    case 'break':
      return BREAKABLE.has(o);
    case 'fear':
      return ['animal', 'nature'].includes(catOf(o)) || o === 'fire';
    default:
      return true;
  }
}

function randomFrame(rng: Rng, known: Set<string>, focus: ChapterDef['focus']): Frame | null {
  const verbs = Object.keys(VERBS).filter((v) => known.has(v));
  const nouns = [...known].filter((id) => ['name', 'person', 'animal', 'thing', 'nature', 'place'].includes(catOf(id)));
  const adjs = [...known].filter((id) => catOf(id) === 'quality');
  for (let tries = 0; tries < 80; tries++) {
    const v = rng.pick(verbs);
    const vf = VERBS[v];
    const subs = nouns.filter((n) => vf.subj.includes(catOf(n)) && (catOf(n) !== 'nature' || FORCES.has(n)) && n !== 'fish');
    if (!subs.length) continue;
    const s = rng.pick(subs);
    const f: Frame = { v, s: { n: s }, tense: 'now' };
    if (vf.obj) {
      const objs = nouns.filter((n) => vf.obj!.includes(catOf(n)) && objectOk(v, n, s));
      if (!objs.length) continue;
      f.o = { n: rng.pick(objs) };
    }
    if (vf.dest) {
      const dests = nouns.filter((n) => vf.dest!.includes(catOf(n)) && n !== s && n !== f.o?.n);
      if (dests.length && known.has('TO') && (v !== 'give' || true)) f.d = { n: rng.pick(dests) };
      else if (v === 'give' || v === 'go') continue;
    }
    const want = (k: ChapterDef['focus'][number]) => (focus.includes(k) ? 0.6 : 0.2);
    const nps = [f.s, f.o, f.d].filter((x): x is NP => !!x);
    for (const p of nps) {
      if (known.has('PL') && COUNTABLE.has(p.n) && rng.next() < want('PL') / 1.5) p.pl = true;
      if (adjs.length && catOf(p.n) !== 'name' && rng.next() < want('ADJ') / 1.5) p.adj = rng.pick(adjs);
    }
    if (known.has('NEG') && rng.next() < want('NEG')) f.neg = true;
    if (known.has('PAST') && rng.next() < want('PAST')) f.tense = 'past';
    else if (known.has('FUT') && rng.next() < want('FUT')) f.tense = 'fut';
    return f;
  }
  return null;
}

/** Variations of a frame that change exactly one thing, for wrong answers. */
function mutations(rng: Rng, f: Frame, known: Set<string>): Frame[] {
  const out: Frame[] = [];
  const clone = (): Frame => JSON.parse(JSON.stringify(f));
  const nouns = [...known].filter((id) => ['name', 'person', 'animal', 'thing', 'nature', 'place'].includes(catOf(id)));
  // Who did it to whom: the word-order test.
  if (f.o && VERBS[f.v].subj.includes(catOf(f.o.n)) && objectOk(f.v, f.s.n, f.o.n)) {
    const m = clone();
    [m.s, m.o] = [m.o!, m.s];
    out.push(m);
  }
  // A different subject, object or destination.
  for (const slot of ['s', 'o', 'd'] as const) {
    const p = f[slot];
    if (!p) continue;
    const pool = nouns.filter(
      (n) =>
        n !== p.n &&
        catOf(n) === catOf(p.n) &&
        (catOf(n) !== 'nature' || slot !== 's' || FORCES.has(n)) &&
        (slot !== 'o' || objectOk(f.v, n, f.s.n)) &&
        (slot !== 's' || !f.o || objectOk(f.v, f.o.n, n)),
    );
    if (pool.length) {
      const m = clone();
      m[slot]!.n = rng.pick(pool);
      if (!COUNTABLE.has(m[slot]!.n)) delete m[slot]!.pl;
      out.push(m);
    }
  }
  if (known.has('NEG')) {
    const m = clone();
    m.neg = !f.neg;
    out.push(m);
  }
  if (known.has('PAST')) {
    const m = clone();
    m.tense = f.tense === 'past' ? 'now' : 'past';
    out.push(m);
  }
  if (known.has('FUT')) {
    const m = clone();
    m.tense = f.tense === 'fut' ? 'now' : 'fut';
    out.push(m);
  }
  if (known.has('PL')) {
    for (const slot of ['s', 'o'] as const) {
      const p = f[slot];
      if (p && COUNTABLE.has(p.n)) {
        const m = clone();
        m[slot]!.pl = !p.pl;
        if (!m[slot]!.pl) delete m[slot]!.pl;
        out.push(m);
      }
    }
  }
  const adjs = [...known].filter((id) => catOf(id) === 'quality');
  for (const slot of ['s', 'o'] as const) {
    const p = f[slot];
    if (p?.adj) {
      const other = adjs.filter((a) => a !== p.adj);
      if (other.length) {
        const m = clone();
        m[slot]!.adj = rng.pick(other);
        out.push(m);
      }
    }
  }
  return rng.shuffle(out);
}

// ---------------------------------------------------------------- the world

export function makeWorld(lang: Language): World {
  const rng = new Rng(mixSeed(lang.seed, 2024));
  const known = new Set<string>();
  const chapters: Chapter[] = [];
  const story: Frame[] = [];
  const usedKeys = new Set<string>();

  CHAPTERS.forEach((def, ch) => {
    const panels: Panel[] = def.panels.map((x, i) => {
      const frame = frameOf(rng, x);
      usedKeys.add(frameKey(frame));
      return { id: `p${ch}.${i}`, ch, frame, tokens: realize(lang, frame) };
    });
    for (const p of panels) for (const m of morphemes(p.tokens)) known.add(m);
    if (def.backdrop === 'murals') story.push(...panels.map((p) => p.frame));

    const challenges: Challenge[] = [];
    const kinds: Challenge['kind'][] = ch === 0 ? ['pick', 'pick', 'compose'] : ['pick', 'compose', 'pick'];
    let n = 0;
    for (const kind of kinds) {
      for (let tries = 0; tries < 60; tries++) {
        const frame = randomFrame(rng, known, def.focus);
        if (!frame || usedKeys.has(frameKey(frame))) continue;
        const tokens = realize(lang, frame);
        if (tokens.length > 7) continue;
        const muts = mutations(rng, frame, known).filter((m) => frameKey(m) !== frameKey(frame));
        // Distinct wrong answers whose writing differs from the right one.
        const wrong: Frame[] = [];
        const seenW = new Set([tokens.map(tokenKey).join(' ')]);
        for (const m of muts) {
          const w = realize(lang, m).map(tokenKey).join(' ');
          if (seenW.has(w)) continue;
          seenW.add(w);
          wrong.push(m);
          if (wrong.length === 2) break;
        }
        if (kind === 'pick' && wrong.length < 2) continue;
        usedKeys.add(frameKey(frame));
        const answer = rng.int(0, 2);
        const options = [...wrong];
        options.splice(answer, 0, frame);
        // Tiles: the right words plus decoys drawn from the wrong versions.
        const right = new Set(tokens.map(tokenKey));
        const decoys: Token[] = [];
        for (const m of muts) {
          for (const tk of realize(lang, m)) {
            const k = tokenKey(tk);
            if (!right.has(k) && !decoys.some((d) => tokenKey(d) === k)) decoys.push(tk);
          }
        }
        const tiles = rng.shuffle([...tokens, ...rng.shuffle(decoys).slice(0, 3)]);
        challenges.push({ id: `c${ch}.${n++}`, ch, kind, frame, tokens, options: kind === 'pick' ? options : [], answer: kind === 'pick' ? answer : -1, tiles });
        break;
      }
    }

    // The last chapter ends with the elder's question about the story.
    if (ch === CHAPTERS.length - 1) {
      const answerFrame: Frame = { v: 'go', s: { n: 'person', pl: true }, d: { n: 'mountain' }, tense: 'past' };
      const question: Frame = { ...answerFrame, d: { n: 'Q' } };
      const tokens = realize(lang, answerFrame);
      const decoys: Token[] = [];
      for (const alt of [
        { ...answerFrame, d: { n: 'market' } },
        { ...answerFrame, tense: 'fut' as Tense },
        { ...answerFrame, s: { n: 'person' } },
        { ...answerFrame, neg: true },
      ]) {
        for (const tk of realize(lang, alt)) if (!tokens.some((x) => tokenKey(x) === tokenKey(tk)) && !decoys.some((d) => tokenKey(d) === tokenKey(tk))) decoys.push(tk);
      }
      challenges.push({
        id: `c${ch}.final`,
        ch,
        kind: 'compose',
        frame: answerFrame,
        tokens,
        options: [],
        answer: -1,
        tiles: rng.shuffle([...tokens, ...decoys.slice(0, 3)]),
        question: realize(lang, question),
      });
      story.push({ v: 'go', s: { n: 'elder' }, d: { n: 'mountain' }, tense: 'fut' });
    }

    chapters.push({ title: def.title, backdrop: def.backdrop, intro: def.intro, panels, challenges });
  });

  return { chapters, story };
}

/** Every concept that appears in the world's writing. */
export function writtenConcepts(world: World): string[] {
  const out = new Set<string>();
  for (const ch of world.chapters) {
    for (const p of ch.panels) for (const m of morphemes(p.tokens)) out.add(m);
    for (const c of ch.challenges) for (const m of morphemes(c.tokens)) out.add(m);
  }
  return [...out];
}

/** Where each concept appears (panel ids), for the notebook's context list. */
export function contexts(world: World, upToChapter: number): Map<string, Panel[]> {
  const map = new Map<string, Panel[]>();
  for (const ch of world.chapters.slice(0, upToChapter + 1)) {
    for (const p of ch.panels) {
      for (const m of morphemes(p.tokens)) {
        if (!map.has(m)) map.set(m, []);
        map.get(m)!.push(p);
      }
    }
  }
  return map;
}
