// Which games were played lately, newest first, for the hub's Continue card and
// its "Recently played" row. Every game notes itself on load (installErrorOverlay).
// 'hub.last' (one slug) is older than 'hub.recent' and is kept in step with it.

export const RECENT_MAX = 6;

/** The list with `game` moved (or added) to the front, at most `max` long. */
export function pushRecent(list: readonly string[], game: string, max = RECENT_MAX): string[] {
  return [game, ...list.filter((g) => g !== game)].slice(0, max);
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Recent games from the raw stored values; a lone 'hub.last' (older saves) leads the list. */
export function recentFrom(recentRaw: string | null, last: string | null): string[] {
  const list = parseList(recentRaw);
  return last && list[0] !== last ? pushRecent(list, last) : list.slice(0, RECENT_MAX);
}

export function noteRecent(game: string): void {
  try {
    const list = recentFrom(localStorage.getItem('hub.recent'), localStorage.getItem('hub.last'));
    localStorage.setItem('hub.last', game);
    localStorage.setItem('hub.recent', JSON.stringify(pushRecent(list, game)));
  } catch {
    // storage blocked: no Continue button
  }
}

export function loadRecent(): string[] {
  try {
    return recentFrom(localStorage.getItem('hub.recent'), localStorage.getItem('hub.last'));
  } catch {
    return [];
  }
}
