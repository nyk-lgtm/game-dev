// The second village: the mountain hamlet where the river people went. Its
// language marks who acts and who is acted on with little particles, so the
// two may come in either order; and the action itself carries a mark when
// many do it. Five places of authored scenes (every word in two or more),
// riddles that test exactly that (the done-to is often written first), and
// the elder's last question.

import { Rng, mixSeed } from '../../shared/rng';
import { COUNTABLE, VERBS } from './concepts';
import type { Language } from './lang';
import { frameKey, morphemes, realize, tokenKey, writings, type Frame, type Tense, type Token } from './sentence';
import { catOf, frameOf, mutations, objectOk, randomFrame, t, type Backdrop, type Challenge, type Chapter, type Focus, type Panel, type T, type World } from './world';

type Focus2 = Focus | 'CASE' | 'AGR';

interface ChapterDef2 {
  title: string;
  backdrop: Backdrop;
  intro: string;
  panels: T[];
  focus: Focus2[];
  /** Riddle kinds, in order. 'roles' is a pick whose sign puts the done-to first. */
  riddles: ('roles' | 'pick' | 'compose')[];
}

const OF = { of: true };

export const CHAPTERS2: ChapterDef2[] = [
  {
    title: 'The Pass',
    backdrop: 'mountain',
    intro:
      'I followed the river people’s trail up the mountain. Above the last trees the cairns carry signs again, but in another hand. The words seem to wander: the same scene, the words in a different order.',
    focus: ['CASE'],
    riddles: ['roles', 'roles', 'compose'],
    panels: [
      t('see', 'dog', 'goat'),
      t('see', 'dog', 'goat', undefined, OF),
      t('see', 'goat', 'dog'),
      t('fear', 'goat', 'dog', undefined, OF),
      t('eat', 'goat', 'bread', undefined, OF),
      t('see', 'child', 'goat', undefined, OF),
      t('find', 'dog', 'bread'),
      t('fear', 'goat', 'rain'),
      t('fear', 'bird', 'dog'),
      t('see', 'bird', 'child', undefined, OF),
      t('sleep', 'dog'),
    ],
  },
  {
    title: 'The Lake',
    backdrop: 'lake',
    intro:
      'A high lake, cold and still. People fish from the stones, and two of them wear river clothes: the fisher in the yellow hat, and the woman in red. When many do something here, the sign changes in two places.',
    focus: ['AGR', 'PL', 'TO'],
    riddles: ['roles', 'compose', 'pick', 'compose'],
    panels: [
      t('eat', 'bird*', 'fish'),
      t('eat', 'bird', 'fish*', undefined, OF),
      t('see', 'sef', 'bird*'),
      t('see', 'bird*', 'sef', undefined, OF),
      t('carry', 'person*', 'fish'),
      t('carry', 'person', 'fish*', undefined, OF),
      t('take', 'dog*', 'fish'),
      t('see', 'person*', 'moon'),
      t('give', 'sef', 'fish', 'ama'),
      t('give', 'ama', 'bread', 'sef', OF),
      t('go', 'child*', undefined, 'house'),
      t('sleep', 'dog*'),
    ],
  },
  {
    title: 'The Hamlet',
    backdrop: 'hamlet',
    intro:
      'Stone houses huddle against the slope, roofs weighed down with rocks. Lamps burn in the doorways. As in the river village, some signs speak of what does not happen.',
    focus: ['NEG', 'ADJ', 'CASE'],
    riddles: ['roles', 'compose', 'pick', 'compose'],
    panels: [
      t('make', 'ama', 'basket'),
      t('see', 'elder', 'new basket', undefined, OF),
      t('sleep', 'child*'),
      t('sleep', 'dog', undefined, undefined, { neg: true }),
      t('fear', 'goat*', 'fire'),
      t('fear', 'elder', 'fire', undefined, { neg: true, of: true }),
      t('break', 'child', 'old lamp', undefined, OF),
      t('carry', 'ama', 'new lamp', 'dark house'),
      t('see', 'elder', 'dark house'),
      t('see', 'goat', 'sun'),
      t('go', 'dog', undefined, 'house', { neg: true }),
      t('find', 'child*', 'stone', undefined, OF),
      t('eat', 'person*', 'bread', undefined, { neg: true }),
    ],
  },
  {
    title: 'The Carvings',
    backdrop: 'murals',
    intro:
      'Inside the meeting hall, fresh carvings on the old stone: the river people’s arrival, told by the mountain folk. The flood, the long climb, and the one who found them.',
    focus: ['PAST', 'CASE', 'AGR'],
    riddles: ['roles', 'compose', 'pick', 'compose'],
    panels: [
      t('break', 'river', 'house*', undefined, { t: 'past' }),
      t('take', 'river', 'basket*', undefined, { t: 'past', of: true }),
      t('fear', 'person*', 'rain', undefined, { t: 'past' }),
      t('go', 'person*', undefined, 'mountain', { t: 'past' }),
      t('find', 'dog', 'person*', undefined, { t: 'past', of: true }),
      t('see', 'goat*', 'person*', undefined, { t: 'past' }),
      t('give', 'elder', 'fire', 'person*', { t: 'past' }),
      t('give', 'person*', 'basket*', 'elder', { t: 'past', of: true }),
      t('carry', 'sef', 'old lamp', 'mountain', { t: 'past' }),
      t('sleep', 'person*', undefined, undefined, { t: 'past', neg: true }),
    ],
  },
  {
    title: 'The Terraces',
    backdrop: 'terraces',
    intro:
      'Dawn on the terraced fields. The boy in the cap has climbed up after all, a lamp on his back, and the woman in red runs to meet him. Tonight there will be a feast, and the elder has a question for you.',
    focus: ['FUT', 'CASE', 'AGR'],
    riddles: ['roles', 'compose', 'pick'],
    panels: [
      t('see', 'ama', 'tor'),
      t('see', 'tor', 'ama', undefined, OF),
      t('go', 'tor', undefined, 'house', { t: 'fut' }),
      t('make', 'person*', 'fire', undefined, { t: 'fut' }),
      t('eat', 'person*', 'bread', undefined, { t: 'fut', of: true }),
      t('find', 'dog', 'Q'),
      t('find', 'dog', 'stone', undefined, OF),
      t('see', 'Q', 'goat', undefined, OF),
      t('see', 'child*', 'sun'),
      t('see', 'bird*', 'moon', undefined, { t: 'fut' }),
    ],
  },
];

/** Describing words the pictures show unmistakably (stricter than the first village's rule):
 *  big/small on things and animals; old/new on things that wear or shine; dark on houses and lamps. */
export function adjShown2(n: string, a: string): boolean {
  const cat = catOf(n);
  if (a === 'big' || a === 'small') return cat === 'thing' || cat === 'animal';
  if (a === 'old' || a === 'new') return ['basket', 'lamp', 'boat', 'house'].includes(n);
  if (a === 'dark') return n === 'house' || n === 'lamp';
  return false;
}

/** A random sentence for a riddle, with the grammar of the chapter's focus. */
function frame2(rng: Rng, known: Set<string>, focus: Focus2[], needObj: boolean, needSwap: boolean): Frame | null {
  const base = focus.filter((f): f is Focus => f !== 'CASE' && f !== 'AGR');
  if (focus.includes('AGR') && !base.includes('PL')) base.push('PL');
  for (let tries = 0; tries < 40; tries++) {
    const f = randomFrame(rng, known, base, adjShown2);
    if (!f) return null;
    if (needObj && !f.o) continue;
    if (needSwap && !canSwap(f)) continue;
    // Agreement: let many do it more often, so the action's mark matters.
    if (focus.includes('AGR') && COUNTABLE.has(f.s.n) && rng.next() < 0.5) f.s.pl = true;
    if (f.o && rng.next() < 0.5) f.ofirst = true;
    return f;
  }
  return null;
}

/** Can the done-to do it to the doer instead (so "who did what to whom" is a real question)? */
const canSwap = (f: Frame) => !!f.o && f.o.n !== f.s.n && f.o.n !== 'fish' && VERBS[f.v].subj.includes(catOf(f.o.n)) && objectOk(f.v, f.s.n, f.o.n);

function swapped(f: Frame): Frame {
  const m: Frame = JSON.parse(JSON.stringify(f));
  [m.s, m.o] = [m.o!, m.s];
  return m;
}

/** The plural moved from the doer to the done-to (or back): tests the action's mark. */
function pluralMoved(f: Frame): Frame | null {
  if (!f.o || !COUNTABLE.has(f.s.n) || !COUNTABLE.has(f.o.n) || !!f.s.pl === !!f.o.pl) return null;
  const m: Frame = JSON.parse(JSON.stringify(f));
  if (m.s.pl) {
    delete m.s.pl;
    m.o!.pl = true;
  } else {
    delete m.o!.pl;
    m.s.pl = true;
  }
  return m;
}

const writeKey = (lang: Language, f: Frame) => realize(lang, f).map(tokenKey).join(' ');

/** Decoy tiles from wrong versions of a sentence, the action with the wrong agreement first. */
function decoysFor(lang: Language, tokens: Token[], alts: Frame[]): Token[] {
  const right = new Set(tokens.map(tokenKey));
  const out: Token[] = [];
  for (const m of alts) {
    for (const tk of realize(lang, m)) {
      const k = tokenKey(tk);
      if (!right.has(k) && !out.some((d) => tokenKey(d) === k)) out.push(tk);
    }
  }
  return out;
}

/** The action written with the other agreement (many doers vs one). */
function otherAgreement(f: Frame): Frame | null {
  if (!COUNTABLE.has(f.s.n)) return null;
  const m: Frame = JSON.parse(JSON.stringify(f));
  if (m.s.pl) delete m.s.pl;
  else m.s.pl = true;
  return m;
}

export function makeWorld2(lang: Language): World {
  const rng = new Rng(mixSeed(lang.seed, 2026));
  const known = new Set<string>();
  const chapters: Chapter[] = [];
  const story: Frame[] = [];
  const usedKeys = new Set<string>();

  CHAPTERS2.forEach((def, ch) => {
    const panels: Panel[] = def.panels.map((x, i) => {
      const frame = frameOf(rng, x);
      // The pass sets each order by hand (it teaches them); later places mix freely.
      const of = x.of ?? (ch > 0 && !!frame.o && rng.next() < 0.4);
      if (of && frame.o) frame.ofirst = true;
      usedKeys.add(frameKey(frame));
      return { id: `p${ch}.${i}`, ch, frame, tokens: realize(lang, frame) };
    });
    for (const p of panels) for (const m of morphemes(p.tokens)) known.add(m);
    if (def.backdrop === 'murals') story.push(...panels.map((p) => p.frame));

    const challenges: Challenge[] = [];
    let n = 0;
    for (const kind of def.riddles) {
      for (let tries = 0; tries < 80; tries++) {
        const roles = kind === 'roles';
        const frame = frame2(rng, known, def.focus, roles || kind === 'pick' || rng.next() < 0.8, roles);
        if (!frame || usedKeys.has(frameKey(frame))) continue;
        if (roles) frame.ofirst = true;
        const tokens = realize(lang, frame);
        if (tokens.length > 9) continue;
        const key = writeKey(lang, frame);
        const muts = mutations(rng, frame, known, adjShown2).filter((m) => frameKey(m) !== frameKey(frame) && m.s.n !== m.d?.n && (m.s.n !== 'fish' || frame.s.n === 'fish'));
        const wrong: Frame[] = [];
        const seenW = new Set([key]);
        const add = (m: Frame | null) => {
          if (!m || wrong.length >= 2) return;
          const w = writeKey(lang, m);
          if (seenW.has(w)) return;
          seenW.add(w);
          wrong.push(m);
        };
        // Roles riddles always offer the swapped scene; others the moved plural when there is one.
        if (roles) add(swapped(frame));
        else if (kind === 'pick') add(pluralMoved(frame) ?? (canSwap(frame) ? swapped(frame) : null));
        for (const m of muts) add(m);
        if (kind !== 'compose' && wrong.length < 2) continue;
        if (roles && !wrong.some((w) => frameKey(w) === frameKey(swapped(frame)))) continue;
        usedKeys.add(frameKey(frame));
        const answer = rng.int(0, 2);
        const options = [...wrong];
        options.splice(answer, 0, frame);
        const agree = otherAgreement(frame);
        const decoys = decoysFor(lang, tokens, [...(agree ? [agree] : []), ...muts]);
        const tiles = rng.shuffle([...tokens, ...(agree ? decoys.slice(0, 1) : []), ...rng.shuffle(decoys.slice(agree ? 1 : 0)).slice(0, agree ? 2 : 3)]);
        const c: Challenge = {
          id: `c${ch}.${n++}`,
          ch,
          kind: kind === 'compose' ? 'compose' : 'pick',
          frame,
          tokens,
          options: kind === 'compose' ? [] : options,
          answer: kind === 'compose' ? -1 : answer,
          tiles,
        };
        if (kind === 'compose') c.alts = writings(lang, frame).slice(1);
        if (kind !== 'compose') c.tests = roles || wrong.some((w) => frameKey(w) === frameKey(swapped(frame))) ? 'roles' : 'many';
        challenges.push(c);
        break;
      }
    }

    // The last place ends with the elder's question: who found the river people?
    if (ch === CHAPTERS2.length - 1) {
      const answerFrame: Frame = { v: 'find', s: { n: 'dog' }, o: { n: 'person', pl: true }, tense: 'past' };
      const question: Frame = { ...answerFrame, s: { n: 'Q' }, ofirst: true };
      const tokens = realize(lang, answerFrame);
      const decoys = decoysFor(lang, tokens, [swapped(answerFrame), { ...answerFrame, s: { n: 'goat' } }, { ...answerFrame, tense: 'fut' as Tense }, { ...answerFrame, o: { n: 'person' } }]);
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
        alts: writings(lang, answerFrame).slice(1),
        tests: 'roles',
      });
      story.push({ v: 'see', s: { n: 'ama' }, o: { n: 'tor' }, tense: 'now' });
      story.push({ v: 'eat', s: { n: 'person', pl: true }, o: { n: 'bread' }, tense: 'fut' });
    }

    chapters.push({ title: def.title, backdrop: def.backdrop, intro: def.intro, panels, challenges });
  });

  return { chapters, story };
}
