import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pushRecent, recentFrom, RECENT_MAX } from '../../src/shared/recent';
import { dailyState, newsDigest, orderDaily, sortGames } from '../../src/hub/logic';
import { DAILY, GAMES, KINDS } from '../../src/hub/games';
import { NEWS, type News } from '../../src/hub/news';
import type { Store } from '../../src/shared/storage';

const memStore = (init: Record<string, unknown> = {}): Store => {
  const m = new Map<string, string>(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    load: <T>(k: string, f: T) => (m.has(k) ? (JSON.parse(m.get(k)!) as T) : f),
    save: (k, v) => void m.set(k, JSON.stringify(v)),
  };
};
const root = resolve(__dirname, '../..');
const slug = (path: string) => path.replace(/[./]/g, '');

describe('recently played', () => {
  it('moves a game to the front, no repeats, capped', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent([], 'a')).toEqual(['a']);
    const long = 'abcdefgh'.split('');
    expect(pushRecent(long, 'z')).toHaveLength(RECENT_MAX);
  });
  it('older saves with only hub.last still get a Continue', () => {
    expect(recentFrom(null, 'grove')).toEqual(['grove']);
    expect(recentFrom('["kitbag","gleam"]', 'kitbag')).toEqual(['kitbag', 'gleam']);
    expect(recentFrom('["kitbag","gleam"]', 'gleam')).toEqual(['gleam', 'kitbag']);
    expect(recentFrom('not json', null)).toEqual([]);
    expect(recentFrom('{"a":1}', null)).toEqual([]);
  });
});

describe('daily status', () => {
  const day = '2026-11-14';
  it('done when today has a recorded result', () => {
    const s = memStore({ daily: { day, score: 5, label: 'wave 5', plays: 1 } });
    expect(dailyState(s, day)).toEqual({ state: 'done', label: 'wave 5' });
  });
  it("yesterday's result or run doesn't count", () => {
    const s = memStore({ daily: { day: '2026-11-13', score: 5, label: 'x', plays: 1 }, dailyRun: { day: '2026-11-13', a: 'B1' } });
    expect(dailyState(s, day).state).toBe('todo');
  });
  it('started when a run for today has moves; an untouched run is still to do', () => {
    expect(dailyState(memStore({ dailyRun: { day, a: 'B1,G' } }), day).state).toBe('started');
    expect(dailyState(memStore({ dailyRun: { day, a: ['x'] } }), day).state).toBe('started');
    expect(dailyState(memStore({ dailyRun: { day, seed: 3 } }), day).state).toBe('started');
    expect(dailyState(memStore({ dailyRun: { day, a: '' } }), day).state).toBe('todo');
    expect(dailyState(memStore({ dailyRun: null }), day).state).toBe('todo');
  });
  it('orders in progress, then to do, then done, keeping the list order within each', () => {
    const items = [
      { id: 1, state: 'done' as const },
      { id: 2, state: 'todo' as const },
      { id: 3, state: 'started' as const },
      { id: 4, state: 'todo' as const },
      { id: 5, state: 'done' as const },
    ];
    expect(orderDaily(items).map((x) => x.id)).toEqual([3, 2, 4, 1, 5]);
  });
});

describe("what's new digest", () => {
  const n = (day: string, game: string): News => ({ day, path: `./${game.toLowerCase()}/`, game, text: `${game} ${day}` });
  const news = [n('2026-11-14', 'A'), n('2026-11-14', 'B'), n('2026-11-13', 'A'), n('2026-11-13', 'C'), n('2026-11-12', 'D'), n('2026-11-10', 'E')];
  it('collapsed: the newest line per game since the last visit, with how many more', () => {
    const d = newsDigest(news, '2026-11-12', false);
    expect(d.fresh).toBe(4);
    expect(d.lines.map((l) => [l.game, l.more, l.fresh])).toEqual([
      ['A', 1, true],
      ['B', 0, true],
      ['C', 0, true],
    ]);
  });
  it('caps the games shown', () => {
    expect(newsDigest(news, '2026-01-01', false, 2).lines.map((l) => l.game)).toEqual(['A', 'B']);
  });
  it('nothing new: the latest few, unmarked, no counts', () => {
    const d = newsDigest(news, '2026-11-14', false);
    expect(d.fresh).toBe(0);
    expect(d.lines.map((l) => [l.game, l.more, l.fresh])).toEqual([
      ['A', 0, false],
      ['B', 0, false],
      ['C', 0, false],
    ]);
  });
  it('expanded: every change in order', () => {
    const d = newsDigest(news, '2026-11-12', true);
    expect(d.lines).toHaveLength(news.length);
    expect(d.lines.filter((l) => l.fresh)).toHaveLength(4);
  });
  it('real news is newest first and points at real games (or the hub)', () => {
    for (let i = 1; i < NEWS.length; i++) expect(NEWS[i].day <= NEWS[i - 1].day).toBe(true);
    const paths = new Set(GAMES.map((g) => g.path));
    for (const item of NEWS) expect(paths.has(item.path) || item.path.startsWith('./#') || item.path === './', item.path).toBe(true);
  });
});

describe('game list', () => {
  it('sorts A–Z by title, or keeps newest first', () => {
    const az = sortGames(GAMES, 'az').map((g) => g.title);
    expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b, 'en')));
    expect(sortGames(GAMES, 'new')).toEqual(GAMES);
  });
  it('every game page has one card, and every card a filter kind', () => {
    const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    const pages = [...config.matchAll(/resolve\(__dirname, '(\w+)\/index\.html'\)/g)].map((m) => m[1]);
    expect(pages.length).toBeGreaterThan(20);
    expect(GAMES.map((g) => slug(g.path)).sort()).toEqual([...pages].sort());
    const kinds = new Set(Object.values(KINDS).flat());
    for (const g of GAMES) expect(kinds.has(slug(g.path)), g.title).toBe(true);
  });
  it('every game with a daily has a daily link', () => {
    const withDaily = readdirSync(resolve(root, 'src'))
      .filter((d) => existsSync(resolve(root, 'src', d, 'game.ts')))
      .filter((d) => /recordDaily\(/.test(readFileSync(resolve(root, 'src', d, 'game.ts'), 'utf8')));
    expect(DAILY.map((d) => d.path.replace(/^\.\/(\w+)\/\?daily$/, '$1')).sort()).toEqual(withDaily.sort());
  });
});
