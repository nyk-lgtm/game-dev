// The hub: one card per game. Add a game here and in vite.config.ts.

import { BUILD } from '../shared/debug';
import { makeStore } from '../shared/storage';

interface GameCard {
  path: string;
  title: string;
  tag: string;
  pitch: string;
  accent: string;
  /** Best result line from the game's own storage, if any. */
  best: () => string | null;
  thumb: string;
}

const telegraph = makeStore('telegraph.');
const grove = makeStore('grove.');
const lantern = makeStore('lantern.');
const afterglow = makeStore('afterglow.');
const delve = makeStore('delve.');
const nightline = makeStore('nightline.');

const GAMES: GameCard[] = [
  {
    path: './afterglow/',
    title: 'Afterglow',
    tag: 'Survivor-like',
    pitch: 'Ten minutes of neon swarms. Build a weapon combo, evolve it, outlast the Eclipse.',
    accent: '#ff3d8b',
    best: () => {
      const p = afterglow.load<{ bestTime?: number; wins?: number } | null>('profile', null);
      if (!p?.bestTime) return null;
      const m = Math.floor(p.bestTime / 60);
      const s = String(Math.floor(p.bestTime % 60)).padStart(2, '0');
      return `Best: ${m}:${s}${p.wins ? ` · ${p.wins} win${p.wins > 1 ? 's' : ''}` : ''}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><defs><filter id="ag" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>
      <rect width="76" height="76" fill="#05060d"/>
      <g filter="url(#ag)" opacity="0.9"><circle cx="38" cy="40" r="7" fill="#5ee7ff"/><path d="M16 18l7 3-6 5zM60 20l-3 7-5-6zM58 60l-7-1 4-6zM14 56l5-6 3 7z" fill="#ff3d8b"/><rect x="50" y="34" width="9" height="9" fill="#ff9a3d"/></g>
      <circle cx="38" cy="40" r="6" fill="#bff6ff"/><circle cx="38" cy="40" r="20" fill="none" stroke="#b88cff" stroke-width="2" opacity="0.7"/>
      <path d="M16 18l7 3-6 5zM60 20l-3 7-5-6zM58 60l-7-1 4-6zM14 56l5-6 3 7z" fill="#ff3d8b"/></svg>`,
  },
  {
    path: './nightline/',
    title: 'Nightline',
    tag: 'ASCII racer',
    pitch: 'An OutRun-style night drive drawn in text. Beat the clock, pick your road at every fork.',
    accent: '#ff2a6d',
    best: () => {
      const b = nightline.load<number>('best', 0);
      return b ? `Best score: ${b.toLocaleString()}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#05010f"/><rect width="76" height="34" fill="#1a0533"/>
      <g font-family="monospace" font-weight="700" font-size="8"><text x="4" y="30" fill="#7a3cff">|#|_|##|_|#|</text>
      <text x="22" y="44" fill="#ff2a6d">#</text><text x="50" y="44" fill="#e8e8ff">#</text><text x="16" y="56" fill="#e8e8ff">##</text><text x="52" y="56" fill="#ff2a6d">##</text>
      <text x="35" y="50" fill="#05d9e8">|</text><text x="35" y="62" fill="#05d9e8">|</text><text x="20" y="72" fill="#ff2a6d">[=NL84=]</text></g>
      <circle cx="60" cy="14" r="6" fill="none" stroke="#e8e0c0" stroke-dasharray="2 2"/></svg>`,
  },
  {
    path: './delve/',
    title: 'Delve',
    tag: 'First-person ASCII crawler',
    pitch: 'Ten floors of dark corridors, drawn entirely in text. Find the stairs, face the Warden.',
    accent: '#ffb347',
    best: () => {
      const d = delve.load<number>('best', 0);
      const wins = delve.load<number>('wins', 0);
      return d ? `Deepest: ${d}${wins ? ` · ${wins} win${wins > 1 ? 's' : ''}` : ''}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#000"/>
      <g font-family="monospace" font-weight="700" font-size="9" fill="#8a7a5c">
      <text x="2" y="12">##|___|##</text><text x="2" y="22" fill="#a08c66">#|_|_|_|#</text><text x="2" y="32" fill="#c0a87a">%|  /\  |</text>
      <text x="2" y="42" fill="#c0a87a">%| (oo) |</text><text x="2" y="52" fill="#a08c66">#|  ||  |</text><text x="2" y="62" fill="#5c5446">. , . , .</text></g>
      <text x="58" y="70" font-family="monospace" font-size="11" fill="#ffb347">)(</text></svg>`,
  },
  {
    path: './telegraph/',
    title: 'Telegraph',
    tag: 'Tactics roguelike',
    pitch: 'Every enemy shows its next attack. Moving is attacking. Get deeper.',
    accent: '#5ee7ff',
    best: () => {
      const d = telegraph.load<number>('best', 0);
      return d ? `Deepest floor: ${d}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0f1118"/>
      <path d="M20 14h14l7 12-7 12H20l-7-12z" fill="#232838"/><path d="M42 26h14l7 12-7 12H42l-7-12z" fill="#3a1d2a"/>
      <path d="M20 38h14l7 12-7 12H20l-7-12z" fill="#232838"/><circle cx="27" cy="50" r="7" fill="#5ee7ff"/>
      <rect x="44" y="31" width="10" height="10" rx="2" fill="#ff4d6d"/>
      <path d="M49 44 L31 48" stroke="#ff3355" stroke-width="2.5" stroke-dasharray="4 3"/></svg>`,
  },
  {
    path: './grove/',
    title: 'Grove',
    tag: 'Merge puzzle',
    pitch: 'Grow seeds into a spirit tree. Three alike merge. Trap the wandering wisps.',
    accent: '#9bd66a',
    best: () => {
      const s = grove.load<number>('best', 0);
      return s ? `Best score: ${s.toLocaleString()}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#10140f"/>
      <path d="M24 10h28l14 24-14 24H24L10 34z" fill="#1f261c"/>
      <rect x="35" y="34" width="6" height="16" fill="#7a5636"/>
      <circle cx="38" cy="28" r="11" fill="#3fa860" stroke="#1d3a1a" stroke-width="2"/>
      <circle cx="29" cy="35" r="7" fill="#3fa860" stroke="#1d3a1a" stroke-width="2"/>
      <circle cx="47" cy="35" r="7" fill="#3fa860" stroke="#1d3a1a" stroke-width="2"/>
      <path d="M60 52 q4 -6 0 -12 q-4 6 0 12z" fill="#c9b8ff"/></svg>`,
  },
  {
    path: './lantern/',
    title: 'Lantern',
    tag: 'ASCII RPG',
    pitch: 'A tiny text-mode quest. Relight the village Lantern from the dark of the Hollow.',
    accent: '#ffd166',
    best: () => {
      const t = lantern.load<number | null>('bestTurns', null);
      if (t !== null) return `Finished in ${t} turns`;
      return lantern.load('game', null) ? 'Quest in progress' : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0b0b0e"/>
      <g font-family="monospace" font-weight="700" font-size="13" text-anchor="middle">
      <text x="14" y="20" fill="#646a7d">#</text><text x="28" y="20" fill="#646a7d">#</text><text x="42" y="20" fill="#646a7d">#</text><text x="56" y="20" fill="#646a7d">#</text><text x="66" y="20" fill="#646a7d">#</text>
      <text x="14" y="38" fill="#3d4150">·</text><text x="28" y="38" fill="#ffffff">@</text><text x="42" y="38" fill="#3d4150">·</text><text x="56" y="38" fill="#ff6b6b">s</text>
      <text x="14" y="56" fill="#3d4150">·</text><text x="28" y="56" fill="#3d4150">·</text><text x="42" y="56" fill="#e7b84a">≡</text><text x="56" y="56" fill="#ffd166">&gt;</text>
      <text x="38" y="70" fill="#2f8a3e">♣ ♣ ♣</text></g>
      <circle cx="28" cy="34" r="20" fill="rgba(255,190,90,0.12)"/></svg>`,
  },
];

const list = document.getElementById('games')!;
for (const g of GAMES) {
  const a = document.createElement('a');
  a.className = 'game';
  a.href = g.path;
  a.style.setProperty('--accent', g.accent);
  const best = g.best();
  a.innerHTML = `${g.thumb}<div class="body"><span class="tag">${g.tag}</span><h2>${g.title}</h2><p>${g.pitch}</p>${
    best ? `<span class="best">${best}</span>` : ''
  }</div><span class="go">›</span>`;
  list.appendChild(a);
}
document.getElementById('build')!.textContent = `build ${BUILD}`;
