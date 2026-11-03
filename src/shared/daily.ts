// Daily challenges: one seed per game per (local) day, the same for everyone,
// and each game's best result for today. Open a game with ?daily to play it.

import { mixSeed } from './rng';
import type { Store } from './storage';

/** Today's date as YYYY-MM-DD in the player's own time zone. */
export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function dailySeed(game: string, day = todayKey()): number {
  return mixSeed(strHash(day), strHash(game));
}

/** True if the page was opened as today's daily (?daily). */
export function wantsDaily(): boolean {
  return new URLSearchParams(location.search).has('daily');
}

/** Leave daily mode: drop ?daily from the address so a reload starts normally. */
export function leaveDaily(): void {
  const p = new URLSearchParams(location.search);
  if (!p.has('daily')) return;
  p.delete('daily');
  const q = p.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : ''));
}

export interface DailyBest {
  day: string;
  /** Higher is better; games choose the scale. */
  score: number;
  /** How the score reads, e.g. "wave 11" or "8:42". */
  label: string;
  plays: number;
}

export function loadDaily(store: Store, day = todayKey()): DailyBest | null {
  const d = store.load<DailyBest | null>('daily', null);
  return d && d.day === day ? d : null;
}

/** Record a finished daily attempt; returns today's best and whether this beat it. */
export function recordDaily(store: Store, score: number, label: string, day = todayKey()): { best: DailyBest; improved: boolean } {
  const prev = loadDaily(store, day);
  const improved = !prev || score > prev.score;
  const best: DailyBest = improved ? { day, score, label, plays: (prev?.plays ?? 0) + 1 } : { ...prev!, plays: prev!.plays + 1 };
  store.save('daily', best);
  return { best, improved };
}

/** "Sunday 2 November" style label for headers. */
export function prettyDay(day = todayKey()): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
