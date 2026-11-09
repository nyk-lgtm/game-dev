// Meaning -> writing. A Frame is what a scene means (who does what to
// whom, when, whether not); realize() writes it in a given language.

import type { Language } from './lang';

export interface NP {
  /** Noun concept id, or 'Q' for the question word (what/where/who). */
  n: string;
  adj?: string;
  pl?: boolean;
}

export type Tense = 'now' | 'past' | 'fut';

export interface Frame {
  v: string;
  s: NP;
  o?: NP;
  /** Destination or recipient, written with TO. */
  d?: NP;
  tense: Tense;
  neg?: boolean;
}

/** One written word: a glyph plus any marks attached to it. */
export interface Token {
  m: string;
  marks: string[];
}

const tok = (m: string, marks: string[] = []): Token => ({ m, marks: [...marks].sort() });

function writeNP(lang: Language, np: NP): Token[] {
  const g = lang.grammar;
  if (np.n === 'Q') return [tok('Q')];
  const pl = !!np.pl;
  let noun: Token[] = [tok(np.n, pl && g.plural === 'mark' ? ['PL'] : [])];
  if (pl && g.plural === 'double') noun = [tok(np.n), tok(np.n)];
  if (pl && g.plural === 'particle') noun = g.pluralSide === 'before' ? [tok('PL'), ...noun] : [...noun, tok('PL')];
  if (!np.adj) return noun;
  return g.adj === 'before' ? [tok(np.adj), ...noun] : [...noun, tok(np.adj)];
}

function writeDest(lang: Language, np: NP): Token[] {
  const inner = writeNP(lang, np);
  return lang.grammar.adpos === 'pre' ? [tok('TO'), ...inner] : [...inner, tok('TO')];
}

export function realize(lang: Language, f: Frame): Token[] {
  const g = lang.grammar;
  const verbMarks = g.tense === 'mark' && f.tense !== 'now' ? [f.tense === 'past' ? 'PAST' : 'FUT'] : [];
  let verb: Token[] = [tok(f.v, verbMarks)];
  if (f.neg && g.neg === 'preverb') verb = [tok('NEG'), ...verb];
  if (f.neg && g.neg === 'postverb') verb = [...verb, tok('NEG')];
  const S = writeNP(lang, f.s);
  const O = f.o ? writeNP(lang, f.o) : [];
  const D = f.d ? writeDest(lang, f.d) : [];
  let out: Token[];
  switch (g.order) {
    case 'SVO':
      out = [...S, ...verb, ...O, ...D];
      break;
    case 'SOV':
      out = [...S, ...O, ...D, ...verb];
      break;
    case 'VSO':
      out = [...verb, ...S, ...O, ...D];
      break;
    case 'VOS':
      out = [...verb, ...O, ...D, ...S];
      break;
  }
  if (f.neg && g.neg === 'final') out.push(tok('NEG'));
  if (g.tense === 'initial' && f.tense !== 'now') out.unshift(tok(f.tense === 'past' ? 'PAST' : 'FUT'));
  return out;
}

export const tokenKey = (t: Token) => (t.marks.length ? `${t.m}+${t.marks.join('+')}` : t.m);
export const sameTokens = (a: Token[], b: Token[]) => a.length === b.length && a.every((t, i) => tokenKey(t) === tokenKey(b[i]));

/** Every concept (glyph or mark) a sentence uses, once each. */
export function morphemes(tokens: Token[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    out.add(t.m);
    for (const m of t.marks) out.add(m);
  }
  return [...out];
}

export const frameKey = (f: Frame) => JSON.stringify([f.v, f.s, f.o ?? null, f.d ?? null, f.tense, !!f.neg]);

// ---------------------------------------------------------------- English

import { CONCEPT } from './concepts';

const PAST: Record<string, string> = { see: 'saw', eat: 'ate', give: 'gave', take: 'took', carry: 'carried', go: 'went', sleep: 'slept', make: 'made', fear: 'feared', find: 'found', break: 'broke' };
const THIRD: Record<string, string> = { carry: 'carries', go: 'goes', fear: 'fears' };

function npEn(np: NP, gloss: (id: string) => string): string {
  if (np.n === 'Q') return 'what';
  const c = CONCEPT.get(np.n)!;
  const noun = gloss(np.n);
  const name = c.cat === 'name';
  const plural = np.pl ? (noun === 'person' ? 'people' : noun.endsWith('fish') ? noun : noun.endsWith('child') ? noun + 'ren' : noun.endsWith('s') ? noun : noun + 's') : noun;
  const adj = np.adj ? gloss(np.adj) + ' ' : '';
  return name ? noun : `the ${adj}${plural}`;
}

/** A plain English rendering, for the ending's translation. `gloss` lets the UI substitute unknown words. */
export function english(f: Frame, gloss: (id: string) => string = (id) => CONCEPT.get(id)!.en): string {
  const s = npEn(f.s, gloss);
  const plural = !!f.s.pl;
  const v = f.v;
  let verb: string;
  if (f.tense === 'past') verb = f.neg ? `did not ${gloss(v)}` : PAST[v] && gloss(v) === CONCEPT.get(v)!.en ? PAST[v] : `${gloss(v)} (before)`;
  else if (f.tense === 'fut') verb = `${f.neg ? 'will not' : 'will'} ${gloss(v)}`;
  else if (f.neg) verb = `${plural ? 'do' : 'does'} not ${gloss(v)}`;
  else verb = plural || gloss(v) !== CONCEPT.get(v)!.en ? gloss(v) : THIRD[v] ?? `${v}s`;
  const o = f.o ? ' ' + npEn(f.o, gloss) : '';
  const d = f.d ? (f.v === 'give' ? ' to ' : ' to ') + npEn(f.d, gloss) : '';
  const text = `${s} ${verb}${o}${d}`;
  return text.charAt(0).toUpperCase() + text.slice(1) + (f.s.n === 'Q' || f.o?.n === 'Q' || f.d?.n === 'Q' ? '?' : '.');
}
