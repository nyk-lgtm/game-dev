// Daily bookkeeping for Gleam: the week-long archive. Results per day and the
// streak live in src/shared/streak.ts (Triad uses them too).

import { todayKey } from '../shared/daily';
import { dayBefore } from '../shared/streak';

export { dayBefore, streakOf, type DailyResult } from '../shared/streak';

/** Dailies you can play: today and the week before it (today first). */
export const ARCHIVE_DAYS = 8;
export const archiveDays = (today = todayKey()): string[] => Array.from({ length: ARCHIVE_DAYS }, (_, k) => dayBefore(today, k));
