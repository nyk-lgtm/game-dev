// The language generator. From a seed it invents a grammar (word order,
// where adjectives go, how plurals, negation, tense and direction are
// marked), a sound system (for names and pronunciations), and a script:
// one glyph per concept, built from strokes, with a shared "radical" for
// each category so related words look related.

import { Rng, mixSeed } from '../../shared/rng';
import { CONCEPTS, CONCEPT, type Category } from './concepts';

export type Order = 'SVO' | 'SOV' | 'VSO' | 'VOS';

export interface Grammar {
  order: Order;
  /** Adjective before or after its noun. */
  adj: 'before' | 'after';
  /** Plural: a mark under the noun, a separate particle, or the noun written twice. */
  plural: 'mark' | 'particle' | 'double';
  /** Side of the noun the plural particle goes on. */
  pluralSide: 'before' | 'after';
  /** Negation particle: right before the verb, right after it, or at the end. */
  neg: 'preverb' | 'postverb' | 'final';
  /** Tense: a mark on the verb, or a time particle opening the sentence. */
  tense: 'mark' | 'initial';
  /** Direction word before (preposition) or after (postposition) its noun. */
  adpos: 'pre' | 'post';
}

/** A glyph is a list of strokes in a unit box (0..1, y down). */
export type Stroke =
  | { k: 'L'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'Q'; x1: number; y1: number; cx: number; cy: number; x2: number; y2: number }
  | { k: 'O'; x: number; y: number; r: number }
  | { k: 'D'; x: number; y: number };

export interface Glyph {
  strokes: Stroke[];
  /** Names are written inside a cartouche. */
  frame: boolean;
  /** Marks are drawn small, attached under (PL) or over (tense) a word. */
  mark: 'under' | 'over' | null;
}

export interface Style {
  /** 0 = all straight lines, 1 = mostly curves. */
  curvy: number;
  /** Radical on the left or along the top. */
  radical: 'left' | 'top';
  /** Stroke weight relative to glyph size. */
  weight: number;
  /** Ink color for this people's script. */
  ink: string;
}

export interface Language {
  seed: number;
  name: string;
  grammar: Grammar;
  style: Style;
  glyphs: Record<string, Glyph>;
  /** Pronunciation of each concept (romanized). */
  words: Record<string, string>;
}

// ---------------------------------------------------------------- sounds

const CONS_SETS = [
  ['k', 't', 'm', 'n', 's', 'r', 'l', 'h'],
  ['p', 't', 'k', 'm', 'n', 'v', 'sh', 'r'],
  ['b', 'd', 'g', 'm', 'n', 'z', 'l', 'y'],
  ['t', 'k', 'q', 'n', 'm', 's', 'w', 'r'],
];
const VOWEL_SETS = [
  ['a', 'i', 'u'],
  ['a', 'e', 'i', 'o', 'u'],
  ['a', 'e', 'o'],
  ['i', 'a', 'u', 'ei'],
];

function makeWord(rng: Rng, cons: string[], vows: string[], syllables: number, coda: boolean): string {
  let w = '';
  for (let i = 0; i < syllables; i++) {
    w += rng.pick(cons) + rng.pick(vows);
    if (coda && i === syllables - 1 && rng.next() < 0.35) w += rng.pick(['n', 'r', 'l', 's']);
  }
  return w;
}

// ---------------------------------------------------------------- strokes

const r2 = (n: number) => Math.round(n * 100) / 100;

function line(x1: number, y1: number, x2: number, y2: number): Stroke {
  return { k: 'L', x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2) };
}

function curve(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): Stroke {
  return { k: 'Q', x1: r2(x1), y1: r2(y1), cx: r2(cx), cy: r2(cy), x2: r2(x2), y2: r2(y2) };
}

/** Map a stroke from a unit box into the box (x, y, w, h). */
function place(s: Stroke, x: number, y: number, w: number, h: number): Stroke {
  const X = (v: number) => x + v * w;
  const Y = (v: number) => y + v * h;
  switch (s.k) {
    case 'L':
      return line(X(s.x1), Y(s.y1), X(s.x2), Y(s.y2));
    case 'Q':
      return curve(X(s.x1), Y(s.y1), X(s.cx), Y(s.cy), X(s.x2), Y(s.y2));
    case 'O':
      return { k: 'O', x: r2(X(s.x)), y: r2(Y(s.y)), r: r2(s.r * Math.min(w, h)) };
    case 'D':
      return { k: 'D', x: r2(X(s.x)), y: r2(Y(s.y)) };
  }
}

/** Iconic shapes: some concepts start as little pictures in some scripts. */
const ICONS: Record<string, Stroke[]> = {
  sun: [{ k: 'O', x: 0.5, y: 0.5, r: 0.3 }, { k: 'D', x: 0.5, y: 0.5 }],
  moon: [curve(0.6, 0.15, 0.05, 0.5, 0.6, 0.85), curve(0.6, 0.15, 0.35, 0.5, 0.6, 0.85)],
  river: [curve(0.1, 0.35, 0.3, 0.15, 0.5, 0.35), curve(0.5, 0.35, 0.7, 0.55, 0.9, 0.35), curve(0.1, 0.65, 0.3, 0.45, 0.5, 0.65), curve(0.5, 0.65, 0.7, 0.85, 0.9, 0.65)],
  rain: [line(0.3, 0.15, 0.2, 0.45), line(0.6, 0.15, 0.5, 0.45), line(0.45, 0.55, 0.35, 0.85), line(0.8, 0.5, 0.7, 0.8)],
  mountain: [line(0.1, 0.85, 0.45, 0.2), line(0.45, 0.2, 0.9, 0.85), line(0.3, 0.5, 0.6, 0.5)],
  fire: [curve(0.5, 0.9, 0.1, 0.5, 0.45, 0.1), curve(0.5, 0.9, 0.9, 0.55, 0.6, 0.25)],
  tree: [line(0.5, 0.1, 0.5, 0.9), line(0.5, 0.4, 0.2, 0.2), line(0.5, 0.4, 0.8, 0.2), line(0.5, 0.65, 0.25, 0.5), line(0.5, 0.65, 0.75, 0.5)],
  house: [line(0.2, 0.45, 0.5, 0.15), line(0.5, 0.15, 0.8, 0.45), line(0.25, 0.45, 0.25, 0.85), line(0.75, 0.45, 0.75, 0.85), line(0.25, 0.85, 0.75, 0.85)],
  fish: [curve(0.15, 0.5, 0.45, 0.15, 0.75, 0.5), curve(0.15, 0.5, 0.45, 0.85, 0.75, 0.5), line(0.75, 0.5, 0.9, 0.3), line(0.75, 0.5, 0.9, 0.7)],
  see: [curve(0.1, 0.5, 0.5, 0.15, 0.9, 0.5), curve(0.1, 0.5, 0.5, 0.85, 0.9, 0.5), { k: 'D', x: 0.5, y: 0.5 }],
  bird: [curve(0.1, 0.45, 0.3, 0.2, 0.5, 0.45), curve(0.5, 0.45, 0.7, 0.2, 0.9, 0.45)],
  boat: [curve(0.1, 0.55, 0.5, 0.95, 0.9, 0.55), line(0.1, 0.55, 0.9, 0.55), line(0.5, 0.55, 0.5, 0.1), line(0.5, 0.1, 0.8, 0.45)],
  go: [line(0.15, 0.5, 0.8, 0.5), line(0.8, 0.5, 0.55, 0.25), line(0.8, 0.5, 0.55, 0.75)],
  sleep: [line(0.2, 0.3, 0.5, 0.3), line(0.5, 0.3, 0.2, 0.6), line(0.2, 0.6, 0.5, 0.6), line(0.55, 0.55, 0.8, 0.55), line(0.8, 0.55, 0.55, 0.8), line(0.55, 0.8, 0.8, 0.8)],
};

/** Which concepts get an iconic glyph in this script (about half the iconic ones). */
function iconic(rng: Rng): Set<string> {
  const keys = Object.keys(ICONS);
  return new Set(rng.shuffle([...keys]).slice(0, Math.ceil(keys.length * (0.35 + rng.next() * 0.3))));
}

const LATTICE = [0, 0.5, 1];

/** A random body of n strokes on a 3x3 lattice in the unit box. */
function randomBody(rng: Rng, n: number, curvy: number): Stroke[] {
  const out: Stroke[] = [];
  const pt = () => [rng.pick(LATTICE), rng.pick(LATTICE)];
  let guard = 0;
  while (out.length < n && guard++ < 50) {
    const roll = rng.next();
    if (roll < 0.08) {
      const [x, y] = pt();
      out.push({ k: 'D', x: 0.25 + x * 0.5, y: 0.25 + y * 0.5 });
      continue;
    }
    if (roll < 0.14) {
      out.push({ k: 'O', x: 0.5, y: rng.pick([0.3, 0.5, 0.7]), r: 0.18 });
      continue;
    }
    const [x1, y1] = pt();
    const [x2, y2] = pt();
    if (x1 === x2 && y1 === y2) continue;
    if (rng.next() < curvy) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = y2 - y1;
      const dy = x1 - x2;
      const bend = rng.pick([-0.45, 0.45]);
      out.push(curve(x1, y1, mx + dx * bend, my + dy * bend, x2, y2));
    } else out.push(line(x1, y1, x2, y2));
  }
  return out;
}

const key = (strokes: Stroke[]) =>
  strokes
    .map((s) => JSON.stringify(s))
    .sort()
    .join('|');

// ---------------------------------------------------------------- the language

const INKS = ['#2b2118', '#3a1f4a', '#123b3a', '#4a1d1d', '#1d2f4a'];

export function makeLanguage(seed: number): Language {
  const rng = new Rng(mixSeed(seed, 1701));

  // Grammar. Direction words tend to follow word order (as in real languages).
  const order = rng.pick<Order>(['SVO', 'SVO', 'SOV', 'SOV', 'VSO', 'VOS']);
  const verbFirstish = order === 'SVO' || order === 'VSO' || order === 'VOS';
  const grammar: Grammar = {
    order,
    adj: rng.next() < 0.5 ? 'before' : 'after',
    plural: rng.pick(['mark', 'particle', 'double']),
    pluralSide: rng.next() < 0.5 ? 'before' : 'after',
    neg: rng.pick(['preverb', 'postverb', 'final']),
    tense: rng.next() < 0.55 ? 'mark' : 'initial',
    adpos: rng.next() < 0.85 ? (verbFirstish ? 'pre' : 'post') : verbFirstish ? 'post' : 'pre',
  };

  const style: Style = {
    curvy: rng.pick([0.1, 0.35, 0.6, 0.85]),
    radical: rng.next() < 0.5 ? 'left' : 'top',
    weight: 0.075 + rng.next() * 0.035,
    ink: rng.pick(INKS),
  };

  // Sounds.
  const ci = rng.int(0, CONS_SETS.length - 1);
  const cons = CONS_SETS[ci];
  const vows = VOWEL_SETS[rng.int(0, VOWEL_SETS.length - 1)];
  const coda = rng.next() < 0.5;
  const words: Record<string, string> = {};
  const used = new Set<string>();
  for (const c of CONCEPTS) {
    let w = '';
    for (let t = 0; t < 30; t++) {
      const syl = c.cat === 'grammar' ? 1 : c.cat === 'name' ? rng.int(2, 3) : rng.int(1, 2) + (rng.next() < 0.25 ? 1 : 0);
      w = makeWord(rng, cons, vows, syl, coda);
      if (!used.has(w)) break;
    }
    used.add(w);
    words[c.id] = w;
  }
  const name = makeWord(rng, cons, vows, 2, false);
  const langName = name.charAt(0).toUpperCase() + name.slice(1) + rng.pick(['i', 'an', 'ish', 'e']);

  // Script: one radical per noun/verb category.
  const radicals: Partial<Record<Category, Stroke[]>> = {};
  const radCats: Category[] = ['person', 'animal', 'thing', 'nature', 'place', 'action', 'quality'];
  const radKeys = new Set<string>();
  for (const cat of radCats) {
    let r: Stroke[] = [];
    for (let t = 0; t < 30; t++) {
      r = randomBody(rng, rng.int(1, 2), style.curvy);
      const k = key(r);
      if (!radKeys.has(k)) {
        radKeys.add(k);
        break;
      }
    }
    radicals[cat] = r;
  }
  const icons = iconic(rng);

  const glyphs: Record<string, Glyph> = {};
  const seen = new Set<string>();
  const rz = style.radical;
  const radBox = rz === 'left' ? [0.04, 0.12, 0.24, 0.76] : [0.12, 0.04, 0.76, 0.24];
  const bodyBox = rz === 'left' ? [0.36, 0.08, 0.58, 0.84] : [0.1, 0.36, 0.8, 0.58];

  for (const c of CONCEPTS) {
    if (c.cat === 'grammar') continue;
    let strokes: Stroke[] = [];
    for (let t = 0; t < 60; t++) {
      const body = icons.has(c.id) && t < 1 ? ICONS[c.id] : randomBody(rng, rng.int(2, 3), style.curvy);
      const rad = c.cat === 'name' ? [] : radicals[c.cat] ?? [];
      // Names have no radical: they fill the cartouche.
      strokes =
        c.cat === 'name'
          ? body.map((s) => place(s, 0.18, 0.18, 0.64, 0.64))
          : [...rad.map((s) => place(s, radBox[0], radBox[1], radBox[2], radBox[3])), ...body.map((s) => place(s, bodyBox[0], bodyBox[1], bodyBox[2], bodyBox[3]))];
      const k = key(strokes);
      if (!seen.has(k)) {
        seen.add(k);
        break;
      }
    }
    glyphs[c.id] = { strokes, frame: c.cat === 'name', mark: null };
  }

  // Grammar glyphs: particles are small simple shapes; marks attach to words.
  const particle = (): Stroke[] => {
    for (let t = 0; t < 40; t++) {
      const s = randomBody(rng, rng.int(1, 2), style.curvy).map((x) => place(x, 0.25, 0.25, 0.5, 0.5));
      const k = key(s);
      if (!seen.has(k)) {
        seen.add(k);
        return s;
      }
    }
    return [{ k: 'D', x: 0.5, y: 0.5 }];
  };
  const MARK_SHAPES: Stroke[][] = rng.shuffle([
    [{ k: 'D', x: 0.35, y: 0.5 }, { k: 'D', x: 0.65, y: 0.5 }],
    [line(0.25, 0.5, 0.75, 0.5)],
    [line(0.25, 0.3, 0.5, 0.7), line(0.5, 0.7, 0.75, 0.3)],
    [{ k: 'O', x: 0.5, y: 0.5, r: 0.2 }],
    [line(0.25, 0.65, 0.5, 0.3), line(0.5, 0.3, 0.75, 0.65)],
    [{ k: 'D', x: 0.3, y: 0.5 }, { k: 'D', x: 0.5, y: 0.5 }, { k: 'D', x: 0.7, y: 0.5 }],
  ]);
  const mark = (where: 'under' | 'over'): Glyph => ({ strokes: MARK_SHAPES.pop()!, frame: false, mark: where });

  glyphs.PL = grammar.plural === 'mark' ? mark('under') : { strokes: particle(), frame: false, mark: null };
  glyphs.PAST = grammar.tense === 'mark' ? mark('over') : { strokes: particle(), frame: false, mark: null };
  glyphs.FUT = grammar.tense === 'mark' ? mark('over') : { strokes: particle(), frame: false, mark: null };
  glyphs.NEG = { strokes: particle(), frame: false, mark: null };
  glyphs.Q = { strokes: particle(), frame: false, mark: null };
  glyphs.TO = { strokes: particle(), frame: false, mark: null };
  // With doubling, PL has no glyph of its own; keep a placeholder for completeness.
  if (grammar.plural === 'double') glyphs.PL = { strokes: [], frame: false, mark: null };

  return { seed, name: langName, grammar, style, glyphs, words };
}

/** Grammar concepts that are actually written in this language. */
export function writtenGrammar(lang: Language): string[] {
  return ['PL', 'NEG', 'PAST', 'FUT', 'Q', 'TO'].filter((g) => lang.glyphs[g].strokes.length > 0);
}

export const isMark = (lang: Language, id: string) => !!lang.glyphs[id]?.mark;
export const conceptOf = (id: string) => CONCEPT.get(id)!;
