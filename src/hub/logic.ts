// Pure helpers behind the hub page (tested in tests/hub): daily status per game,
// the What's new digest and the game list's sort order.

import { loadDaily } from '../shared/daily';
import type { Store } from '../shared/storage';
import type { News } from './news';

export type DailyState = 'done' | 'started' | 'todo';

/**
 * Today's daily in one game: done (a finished attempt recorded under 'daily', with
 * its label), started (a 'dailyRun' for today with moves in it) or still to do.
 */
export function dailyState(store: Store, day: string): { state: DailyState; label: string | null } {
  const best = loadDaily(store, day);
  if (best) return { state: 'done', label: best.label };
  const run = store.load<{ day?: unknown; a?: unknown } | null>('dailyRun', null);
  if (!run || run.day !== day) return { state: 'todo', label: null };
  // A run saved the moment the daily opened, before any move, is not "started".
  const a = run.a;
  const empty = (typeof a === 'string' || Array.isArray(a)) && a.length === 0;
  return { state: empty ? 'todo' : 'started', label: null };
}

const DAILY_RANK: Record<DailyState, number> = { started: 0, todo: 1, done: 2 };

/** Unfinished first (ones in progress at the very top), done today last; otherwise the given order. */
export function orderDaily<T extends { state: DailyState }>(items: readonly T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => DAILY_RANK[a.it.state] - DAILY_RANK[b.it.state] || a.i - b.i)
    .map((x) => x.it);
}

export interface NewsLine extends News {
  /** Newer than the last visit. */
  fresh: boolean;
  /** Other changes to the same game folded under this line (collapsed view only). */
  more: number;
}

/**
 * What's new. Collapsed: the latest line per game, at most `max` games (`max` from the
 * changes since `seen` if there are any, else the latest `quiet`); expanded: every change.
 * `seen` null = a first visit (nothing is marked new).
 */
export function newsDigest(news: readonly News[], seen: string | null, all: boolean, max = 5, quiet = 3): { lines: NewsLine[]; fresh: number; total: number } {
  const isFresh = (n: News) => seen !== null && n.day > seen;
  const fresh = news.filter(isFresh).length;
  if (all) return { lines: news.map((n) => ({ ...n, fresh: isFresh(n), more: 0 })), fresh, total: news.length };
  const pool = fresh ? news.filter(isFresh) : news;
  const cap = fresh ? max : quiet;
  const lines: NewsLine[] = [];
  for (const n of pool) {
    const line = lines.find((l) => l.game === n.game);
    if (line) line.more++;
    else if (lines.length < cap) lines.push({ ...n, fresh: isFresh(n), more: 0 });
  }
  // Without fresh news the folded counts would just count history: leave them out.
  if (!fresh) for (const l of lines) l.more = 0;
  return { lines, fresh, total: news.length };
}

export type SortMode = 'new' | 'az';

/** Newest first is the list's own order; A–Z sorts by title. */
export function sortGames<T extends { title: string }>(games: readonly T[], mode: SortMode): T[] {
  return mode === 'az' ? [...games].sort((a, b) => a.title.localeCompare(b.title, 'en')) : [...games];
}
