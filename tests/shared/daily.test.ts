import { describe, expect, it } from 'vitest';
import { dailySeed, loadDaily, recordDaily, todayKey } from '../../src/shared/daily';
import type { Store } from '../../src/shared/storage';

const memStore = (): Store => {
  const m = new Map<string, string>();
  return {
    load: <T>(k: string, f: T) => (m.has(k) ? (JSON.parse(m.get(k)!) as T) : f),
    save: (k, v) => void m.set(k, JSON.stringify(v)),
  };
};

describe('daily challenges', () => {
  it('dates are local YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('seeds are stable per day and differ by game and day', () => {
    expect(dailySeed('rewild', '2026-11-03')).toBe(dailySeed('rewild', '2026-11-03'));
    expect(dailySeed('rewild', '2026-11-03')).not.toBe(dailySeed('glyph', '2026-11-03'));
    expect(dailySeed('rewild', '2026-11-03')).not.toBe(dailySeed('rewild', '2026-11-04'));
  });

  it('keeps only the best result of the day and forgets old days', () => {
    const s = memStore();
    expect(recordDaily(s, 10, 'ten', '2026-11-03').improved).toBe(true);
    expect(recordDaily(s, 5, 'five', '2026-11-03').improved).toBe(false);
    expect(loadDaily(s, '2026-11-03')).toMatchObject({ score: 10, label: 'ten', plays: 2 });
    expect(loadDaily(s, '2026-11-04')).toBeNull();
    expect(recordDaily(s, 1, 'one', '2026-11-04').improved).toBe(true);
  });
});
