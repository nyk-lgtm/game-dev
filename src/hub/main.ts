// The hub page. The game list lives in games.ts (add a game there and in vite.config.ts);
// the pure bits (daily status, news digest, sorting) in logic.ts.

import { BUILD } from '../shared/debug';
import { makeStore } from '../shared/storage';
import { prettyDay, todayKey } from '../shared/daily';
import { loadRecent } from '../shared/recent';
import { loadSettings, saveSettings } from '../shared/settings';
import { NEWS } from './news';
import { DAILY, GAMES, KINDS } from './games';
import { dailyState, newsDigest, orderDaily, sortGames, type SortMode } from './logic';

const slug = (path: string) => path.replace(/[./]/g, '');
const hubStore = makeStore('hub.');
const pref = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const setPref = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // per-visit only
  }
};

// Continue: the game played last, one tap away; the few before it as a row of chips.
{
  const el = document.getElementById('continue') as HTMLAnchorElement;
  const recent = loadRecent()
    .map((s) => GAMES.find((x) => x.path === `./${s}/`))
    .filter((g): g is (typeof GAMES)[number] => !!g);
  const g = recent[0];
  if (g) {
    el.href = g.path;
    el.style.setProperty('--accent', g.accent);
    const best = g.best();
    el.innerHTML = `<span class="lab">Continue</span><b>${g.title}</b>${best ? `<span class="sub">${best}</span>` : ''}<span class="go">›</span>`;
    el.hidden = false;
  }
  const more = recent.slice(1, 5);
  if (more.length) {
    const row = document.createElement('div');
    row.id = 'recent';
    row.innerHTML = `<span class="lab">Recently</span>${more
      .map((r) => `<a href="${r.path}" style="--accent:${r.accent}">${r.title}</a>`)
      .join('')}`;
    el.after(row);
  }
}

// What's new: the latest line per game since the last visit (or the latest few), then remember this visit.
{
  // A first-ever visit has nothing to compare with: show the latest few, unmarked.
  const seen = hubStore.load<string | null>('seenNews', null) ?? NEWS[0].day;
  const news = document.getElementById('news')!;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const render = (all: boolean) => {
    const { lines, fresh, total } = newsDigest(NEWS, seen, all);
    news.classList.toggle('all', all);
    news.innerHTML = `<h3>What's new${fresh ? `<span>${fresh} since your last visit</span>` : ''}</h3><ul>${lines
      .map(
        (n) =>
          `<li class="${n.fresh ? 'new' : ''}"><a href="${n.path}"><i class="who"><b>${n.game}</b>${n.more ? `<small>+${n.more} more</small>` : ''}</i><span>${esc(n.text)}</span></a></li>`,
      )
      .join('')}</ul><button id="newsAll">${all ? 'Show less' : `Show all ${total} changes`}</button>`;
    document.getElementById('newsAll')!.onclick = () => {
      render(!all);
      if (all) news.scrollIntoView({ block: 'nearest' });
    };
  };
  render(false);
  hubStore.save('seenNews', NEWS[0].day);
}

// Today's challenges: the same seed for everyone, one per game. Unfinished ones first.
{
  const day = todayKey();
  const items = orderDaily(DAILY.map((d) => ({ ...d, ...dailyState(d.store, day) })));
  const done = items.filter((d) => d.state === 'done').length;
  const daily = document.getElementById('daily')!;
  const tally = done === items.length ? `All ${done} done today ✓` : done ? `${done} of ${items.length} done today.` : '';
  daily.innerHTML = `<h3>Daily challenges <span>${prettyDay(day)}</span></h3><p>${tally ? `<b>${tally}</b> ` : ''}The same run for everyone today. A new one at midnight.</p>`;
  const row = document.createElement('div');
  row.className = 'daily-row';
  for (const d of items) {
    const a = document.createElement('a');
    a.href = d.path;
    a.style.setProperty('--accent', d.accent);
    a.className = d.state;
    const sub = d.state === 'done' ? `✓ ${d.label}` : d.state === 'started' ? '● Resume' : 'Play';
    a.innerHTML = `<b>${d.title}</b><span>${sub}</span>`;
    row.appendChild(a);
  }
  daily.appendChild(row);
}

// The games: filter chips by kind, then sort (newest / A–Z) and view (cards / compact list).
{
  const list = document.getElementById('games')!;
  const chips = document.createElement('div');
  chips.id = 'kinds';
  const tools = document.createElement('div');
  tools.id = 'listTools';
  let kind = pref('hub.kind', 'All');
  if (kind !== 'All' && !KINDS[kind]) kind = 'All';
  let sort: SortMode = pref('hub.sort', 'new') === 'az' ? 'az' : 'new';
  let compact = pref('hub.view', 'cards') === 'list';

  const cards = new Map<string, HTMLAnchorElement>();
  for (const g of GAMES) {
    const a = document.createElement('a');
    a.className = 'game';
    a.dataset.slug = slug(g.path);
    a.href = g.path;
    a.style.setProperty('--accent', g.accent);
    const best = g.best();
    a.innerHTML = `${g.thumb}<div class="body"><span class="tag">${g.tag}</span><h2>${g.title}</h2><p>${g.pitch}</p>${
      best ? `<span class="best">${best}</span>` : ''
    }</div><span class="go">›</span>`;
    cards.set(g.path, a);
  }

  const render = () => {
    chips.innerHTML = ['All', ...Object.keys(KINDS)].map((k) => `<button class="${k === kind ? 'on' : ''}" data-k="${k}">${k}</button>`).join('');
    const seg = (key: string, opts: [string, string][], cur: string) =>
      `<div class="seg">${opts.map(([v, label]) => `<button data-${key}="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${label}</button>`).join('')}</div>`;
    tools.innerHTML =
      seg('sort', [['new', 'Newest'], ['az', 'A–Z']], sort) + seg('view', [['cards', 'Cards'], ['list', 'Compact']], compact ? 'list' : 'cards');
    list.classList.toggle('compact', compact);
    for (const g of sortGames(GAMES, sort)) {
      const el = cards.get(g.path)!;
      el.hidden = kind !== 'All' && !KINDS[kind].includes(slug(g.path));
      list.appendChild(el);
    }
  };
  chips.onclick = (e) => {
    const k = (e.target as HTMLElement).dataset.k;
    if (!k) return;
    kind = k;
    setPref('hub.kind', k);
    render();
  };
  tools.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.sort) {
      sort = b.dataset.sort === 'az' ? 'az' : 'new';
      setPref('hub.sort', sort);
    } else if (b.dataset.view) {
      compact = b.dataset.view === 'list';
      setPref('hub.view', compact ? 'list' : 'cards');
    } else return;
    render();
  };
  list.before(chips, tools);
  render();
}

document.getElementById('build')!.textContent = `build ${BUILD}`;

// Settings for every game.
const settingsBox = document.getElementById('settings')!;
const renderSettings = () => {
  const st = loadSettings();
  settingsBox.innerHTML = `<button id="setSound" class="${st.sound ? '' : 'off'}">${st.sound ? '🔊 Sound on' : '🔇 Sound off'}</button><button id="setVib" class="${st.vibrate ? '' : 'off'}">${st.vibrate ? '📳 Vibration on' : '📴 Vibration off'}</button><button id="setFx" class="wide ${st.reduced ? 'off' : ''}">${st.reduced ? '✨ Effects: reduced (no shake or flashes)' : '✨ Effects: full'}</button>`;
  document.getElementById('setFx')!.onclick = () => {
    saveSettings({ ...st, reduced: !st.reduced });
    renderSettings();
  };
  document.getElementById('setSound')!.onclick = () => {
    saveSettings({ ...st, sound: !st.sound });
    renderSettings();
  };
  document.getElementById('setVib')!.onclick = () => {
    saveSettings({ ...st, vibrate: !st.vibrate });
    if (!st.vibrate) navigator.vibrate?.(30);
    renderSettings();
  };
};
renderSettings();
