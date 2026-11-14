// Daily streaks: one result per day, kept by each game (Gleam, Triad), and the
// run of days in a row solved on the day. Page-side (local dates).

import { todayKey } from './daily';

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

/** Drop results older than `keep` days (in place). */
export function pruneDailies(dailies: Record<string, DailyResult>, today = todayKey(), keep = 60): void {
  for (const d of Object.keys(dailies)) if (d < dayBefore(today, keep)) delete dailies[d];
}

/** "14 Nov" for share lines (the same wording in every locale). */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return new Date(2000, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
