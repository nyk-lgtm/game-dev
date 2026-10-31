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

const GAMES: GameCard[] = [
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
