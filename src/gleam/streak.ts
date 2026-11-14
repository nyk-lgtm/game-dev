// Daily bookkeeping for Gleam: results per day, the streak and the week-long archive.
// Page-side (uses the local date), kept apart from game.ts so tests can import it.

import { todayKey } from '../shared/daily';

export interface DailyResult {
  ms: number;
  hints: number;
  /** Solved on its own day (counts for the streak); archive solves don't. */
  onDay: boolean;
}

/** The day `k` days before `day` (YYYY-MM-DD, local). */
export const dayBefore = (day: string, k: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d - k));
};

/** Dailies you can play: today and the week before it (today first). */
export const ARCHIVE_DAYS = 8;
export const archiveDays = (today = todayKey()): string[] => Array.from({ length: ARCHIVE_DAYS }, (_, k) => dayBefore(today, k));

/** Days in a row, up to today (or yesterday if today's isn't done yet), whose daily was solved on the day. */
export function streakOf(dailies: Record<string, DailyResult>, today = todayKey()): number {
  let k = dailies[today]?.onDay ? 0 : 1;
  let n = 0;
  while (dailies[dayBefore(today, k)]?.onDay) {
    n++;
    k++;
  }
  return n;
}
