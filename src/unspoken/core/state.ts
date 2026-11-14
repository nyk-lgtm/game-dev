// Game state: your notebook (a guess per glyph), what's been confirmed,
// which challenges are solved, and how far you've come. Pure; a run is a
// seed plus a list of actions, so replay(seed, actions) rebuilds it.

import { makeLanguage, type Language } from './lang';
import { makeWorld, type World } from './world';
import { makeWorld2 } from './world2';
import { morphemes, sameTokens, tokenKey, type Token } from './sentence';
import { ALL_CONCEPTS } from './concepts';
import { Rng, mixSeed } from '../../shared/rng';

export const RULES_VERSION = 2;
/** The mountain village's own save version (its first release saved as 2; v3 changed its riddles). */
export const RULES_VERSION2 = 3;
export const rulesVersion = (village: number) => (village === 2 ? RULES_VERSION2 : RULES_VERSION);
/** Today's language has its own world (shuffled scenes, harder riddles: `makeWorld(lang, { daily: true })`); its saves carry this. */
export const DAILY_VERSION = 3;

export interface State {
  seed: number;
  /** 1: the river village (the original game); 2: the mountain village. */
  village: number;
  lang: Language;
  world: World;
  /** Glyph concept id -> your guess (a concept id). */
  notebook: Record<string, string>;
  /** Glyphs whose meaning you've proven. */
  confirmed: string[];
  /** Glyphs whose guess was shown wrong by a solved challenge (cleared). */
  doubted: string[];
  /** Panels whose every word you've read correctly. */
  understood: string[];
  solved: string[];
  /** Wrong answers given. */
  mistakes: number;
  /** Highest chapter open (index). */
  chapter: number;
  over: boolean;
  /** Today's language (its own world); absent in normal play. */
  daily?: true;
}

export type Action =
  | { t: 'guess'; glyph: string; meaning: string | null }
  | { t: 'answer'; challenge: string; pick?: number; tiles?: number[] };

export function newGame(seed: number, village = 1, daily = false): State {
  const lang = makeLanguage(seed, village);
  const world = village === 2 ? makeWorld2(lang) : makeWorld(lang, { daily });
  const s: State = { seed, village, lang, world, notebook: {}, confirmed: [], doubted: [], understood: [], solved: [], mistakes: 0, chapter: 0, over: false };
  if (daily && village !== 2) s.daily = true;
  return s;
}

export function findChallenge(s: State, id: string) {
  for (const ch of s.world.chapters) for (const c of ch.challenges) if (c.id === id) return c;
  return null;
}

/** Panels become understood when every word in them has the right guess; that confirms them. */
function checkPanels(s: State): string[] {
  const fresh: string[] = [];
  for (const ch of s.world.chapters.slice(0, s.chapter + 1)) {
    for (const p of ch.panels) {
      if (s.understood.includes(p.id)) continue;
      const ms = morphemes(p.tokens);
      if (ms.every((m) => s.notebook[m] === m)) {
        s.understood.push(p.id);
        fresh.push(p.id);
        for (const m of ms) if (!s.confirmed.includes(m)) s.confirmed.push(m);
      }
    }
  }
  return fresh;
}

export interface Result {
  ok: boolean;
  /** For a wrong compose: which positions were right. */
  right?: boolean[];
  /** Newly confirmed glyphs. */
  confirmed: string[];
  /** Guesses a solved challenge proved wrong (now cleared). */
  doubted: string[];
  /** Newly understood panels. */
  understood: string[];
  /** A new chapter opened. */
  opened?: number;
  over?: boolean;
}

export function apply(s: State, a: Action): Result | null {
  if (a.t === 'guess') {
    if (s.confirmed.includes(a.glyph)) return null;
    if (a.meaning === null) delete s.notebook[a.glyph];
    else s.notebook[a.glyph] = a.meaning;
    s.doubted = s.doubted.filter((g) => g !== a.glyph);
    const before = s.confirmed.length;
    const understood = checkPanels(s);
    return { ok: true, confirmed: s.confirmed.slice(before), doubted: [], understood };
  }

  const c = findChallenge(s, a.challenge);
  if (!c || c.ch > s.chapter || s.solved.includes(c.id)) return null;
  let ok = false;
  let right: boolean[] | undefined;
  if (c.kind === 'pick') {
    if (a.pick === undefined || a.pick < 0 || a.pick > 2) return null;
    ok = a.pick === c.answer;
  } else {
    if (!a.tiles || a.tiles.some((i) => i < 0 || i >= c.tiles.length) || new Set(a.tiles).size !== a.tiles.length) return null;
    const written: Token[] = a.tiles.map((i) => c.tiles[i]);
    // The second village accepts the doer and done-to in either order.
    const ways = [c.tokens, ...(c.alts ?? [])];
    ok = ways.some((w) => sameTokens(written, w));
    if (!ok) {
      const marks = ways.map((w) => written.map((tk, i) => !!w[i] && tokenKey(tk) === tokenKey(w[i])));
      right = marks.reduce((a, b) => (b.filter(Boolean).length > a.filter(Boolean).length ? b : a));
    }
  }
  if (!ok) {
    s.mistakes++;
    return { ok: false, right, confirmed: [], doubted: [], understood: [] };
  }
  s.solved.push(c.id);
  // Solving proves the reading: correct guesses lock in, wrong ones are cleared.
  const confirmed: string[] = [];
  const doubted: string[] = [];
  for (const m of morphemes(c.tokens)) {
    if (s.confirmed.includes(m)) continue;
    if (s.notebook[m] === m) {
      s.confirmed.push(m);
      confirmed.push(m);
    } else if (s.notebook[m]) {
      delete s.notebook[m];
      if (!s.doubted.includes(m)) s.doubted.push(m);
      doubted.push(m);
    }
  }
  const understood = checkPanels(s);
  const res: Result = { ok: true, confirmed, doubted, understood };
  const chapter = s.world.chapters[s.chapter];
  if (chapter.challenges.every((x) => s.solved.includes(x.id))) {
    if (s.chapter < s.world.chapters.length - 1) {
      s.chapter++;
      res.opened = s.chapter;
      // Scenes in the new place whose glyphs you already read come clear at once.
      res.understood.push(...checkPanels(s));
    } else {
      s.over = true;
      res.over = true;
    }
  }
  return res;
}

// ---------------------------------------------------------------- replay

export function encode(a: Action): string {
  if (a.t === 'guess') return `G${a.glyph}=${a.meaning ?? ''}`;
  return a.pick !== undefined ? `A${a.challenge}~p${a.pick}` : `A${a.challenge}~${(a.tiles ?? []).join('.')}`;
}

export function decode(tok: string): Action | null {
  let m = /^G([A-Za-z]+)=([A-Za-z]*)$/.exec(tok);
  if (m) return { t: 'guess', glyph: m[1], meaning: m[2] || null };
  m = /^A(c\d+\.(?:\d+|final))~p(\d)$/.exec(tok);
  if (m) return { t: 'answer', challenge: m[1], pick: +m[2] };
  m = /^A(c\d+\.(?:\d+|final))~([\d.]*)$/.exec(tok);
  if (m) return { t: 'answer', challenge: m[1], tiles: m[2] ? m[2].split('.').map(Number) : [] };
  return null;
}

export function replay(seed: number, actions: string, village = 1, daily = false): State {
  const s = newGame(seed, village, daily);
  const toks = actions ? actions.split(',') : [];
  toks.forEach((tk, i) => {
    const a = decode(tk);
    if (!a) throw new Error(`bad action ${tk}`);
    if (apply(s, a) !== null) return;
    // Older runs could still re-guess a glyph that a newly opened place has since proven; skip those.
    if (a.t === 'guess' && s.confirmed.includes(a.glyph)) return;
    throw new Error(`illegal action #${i} ${tk}`);
  });
  return s;
}

// ---------------------------------------------------------------- shareable links

/** Glyph codes for links: a per-language shuffle, so a code says nothing about the meaning. */
function glyphCodes(seed: number, village: number): string[] {
  return new Rng(mixSeed(seed, 4400 + village)).shuffle(ALL_CONCEPTS.map((c) => c.id));
}
const b36 = (n: number) => n.toString(36);

/** Actions for a bug-report link: guesses as `g<glyph code>-<meaning code>` so the link doesn't spell out answers. */
export function linkActions(seed: number, village: number, actions: string[]): string {
  const codes = glyphCodes(seed, village);
  return actions
    .map((tk) => {
      const a = decode(tk);
      if (!a || a.t !== 'guess') return tk;
      const m = a.meaning === null ? '' : b36(ALL_CONCEPTS.findIndex((c) => c.id === a.meaning));
      return `g${b36(codes.indexOf(a.glyph))}-${m}`;
    })
    .join(',');
}

/** Back from a link's actions to saved actions (old links with plain `G<glyph>=<meaning>` pass through). */
export function unlinkActions(seed: number, village: number, link: string): string {
  if (!link) return '';
  const codes = glyphCodes(seed, village);
  return link
    .split(',')
    .map((tk) => {
      const m = /^g([0-9a-z]+)-([0-9a-z]*)$/.exec(tk);
      if (!m) return tk;
      const glyph = codes[parseInt(m[1], 36)];
      const meaning = m[2] ? ALL_CONCEPTS[parseInt(m[2], 36)]?.id : '';
      if (!glyph || meaning === undefined) throw new Error(`bad link action ${tk}`);
      return `G${glyph}=${meaning}`;
    })
    .join(',');
}

/** Share of the language you've proven, and how many glyphs that is. */
export function progress(s: State): { confirmed: number; total: number } {
  const total = new Set<string>();
  for (const ch of s.world.chapters) for (const p of ch.panels) for (const m of morphemes(p.tokens)) total.add(m);
  return { confirmed: s.confirmed.filter((m) => total.has(m)).length, total: total.size };
}
