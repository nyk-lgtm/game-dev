// The hub's game list: one card per game (newest first), the filter kinds and the
// daily links. Add a game here and in vite.config.ts.

import { makeStore } from '../shared/storage';
import type { Store } from '../shared/storage';
import { streakOf, type DailyResult } from '../shared/streak';

export interface GameCard {
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
const glyph = makeStore('glyph.');
const rewild = makeStore('rewild.');
const unspoken = makeStore('unspoken.');
const hexhold = makeStore('hexhold.');
const triad = makeStore('triad.');
const lastlight = makeStore('lastlight.');
const ninefold = makeStore('ninefold.');
const summit = makeStore('summit.');
const quarry = makeStore('quarry.');
const sungrazer = makeStore('sungrazer.');
const kitbag = makeStore('kitbag.');
const brink = makeStore('brink.');
const loomsong = makeStore('loomsong.');
const simmer = makeStore('simmer.');
const gleam = makeStore('gleam.');
const lull = makeStore('lull.');
const trestle = makeStore('trestle.');
const tidings = makeStore('tidings.');

export const GAMES: GameCard[] = [
  {
    path: './tidings/',
    title: 'Tidings',
    tag: 'Narrative roguelite',
    pitch: 'Carry the winter post over the mountains to Hollin. Each stop deals three little stories; face two, trading food, oil, coin, health and your band’s trust. Recruit a climber, a fiddler or a tinker, keep your promises, and meet strangers you helped again further up the road.',
    accent: '#e9b45a',
    best: () => {
      const p = tidings.load<{ runs?: number; arrivals?: number; best?: number; bestStars?: number; endings?: string[] } | null>('profile', null);
      if (!p?.runs) return null;
      return `${p.arrivals ?? 0}/${p.runs} reached Hollin${p.best ? ` · best ${'★'.repeat(p.bestStars ?? 0)} ${p.best}` : ''} · ${p.endings?.length ?? 0} endings`;
    },
    thumb: `<svg viewBox="0 0 76 76"><defs><linearGradient id="tdsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36345f"/><stop offset="1" stop-color="#e8936a"/></linearGradient></defs>
      <rect width="76" height="76" fill="url(#tdsky)"/>
      <circle cx="58" cy="20" r="6" fill="#ffd38a"/>
      <path d="M0 52L14 30L22 40L34 18L48 42L58 32L76 50V76H0Z" fill="#8ea2b8"/>
      <path d="M30 24L34 18L38 24L35 23L34 26L32 23Z" fill="#fff"/>
      <path d="M0 62C20 54 40 66 76 56V76H0Z" fill="#2f5446"/>
      <path d="M10 70C24 64 34 66 46 60" stroke="#e9b45a" stroke-width="2" stroke-dasharray="3 3" fill="none"/>
      <rect x="20" y="44" width="22" height="15" rx="2" fill="#f4e9d0" transform="rotate(-6 31 51)"/>
      <path d="M20.5 45.5l10.5 7 10-9" stroke="#8a5a2e" stroke-width="1.6" fill="none" transform="rotate(-6 31 51)"/>
      <circle cx="52" cy="58" r="3.4" fill="#ffcf6a"/><circle cx="52" cy="58" r="7" fill="#ffcf6a" opacity="0.25"/></svg>`,
  },
  {
    path: './trestle/',
    title: 'Trestle',
    tag: 'Physics builder',
    pitch: 'Get the beetle’s acorn cart over the stream with a few planks, twigs and twine, or hang a lantern out over the drop. Drag peg to peg, press Go and watch it creak, hold or snap. Every level is proven buildable within budget; stars for building as lean as the surveyor.',
    accent: '#e0b25a',
    best: () => {
      const p = trestle.load<{ stars?: Record<string, number>; top?: number } | null>('profile', null);
      const n = Object.values(p?.stars ?? {}).reduce((a, b) => a + b, 0);
      return n ? `${n} ★ · level ${p?.top ?? 1}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><defs><linearGradient id="trsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2547"/><stop offset="0.7" stop-color="#7a5f86"/><stop offset="1" stop-color="#f0b37a"/></linearGradient></defs>
      <rect width="76" height="76" fill="url(#trsky)"/>
      <circle cx="58" cy="14" r="5" fill="#fbefc8"/>
      <rect y="62" width="76" height="14" fill="#2c4f63"/>
      <rect x="-2" y="36" width="18" height="40" fill="#6b4a33"/><rect x="60" y="36" width="18" height="40" fill="#6b4a33"/>
      <rect x="-2" y="35" width="18" height="3" fill="#5f9e4f"/><rect x="60" y="35" width="18" height="3" fill="#5f9e4f"/>
      <path d="M16 36L26 46L36 36L46 46L56 36M26 46H46" stroke="#5d5233" stroke-width="3.6" fill="none" stroke-linejoin="round"/>
      <path d="M16 36L26 46L36 36L46 46L56 36M26 46H46" stroke="#c9b27a" stroke-width="2" fill="none" stroke-linejoin="round"/>
      <path d="M16 36H60" stroke="#5a3418" stroke-width="5" stroke-linecap="round"/><path d="M16 36H60" stroke="#b0773f" stroke-width="3.4" stroke-linecap="round"/>
      <g fill="#2a2320" stroke="#e0b25a" stroke-width="1.4"><circle cx="16" cy="36" r="2.6"/><circle cx="60" cy="36" r="2.6"/></g>
      <rect x="27" y="27" width="11" height="5" rx="1.5" fill="#8a5a32"/><circle cx="29.5" cy="26.5" r="1.8" fill="#c98a3e"/><circle cx="34" cy="26" r="1.8" fill="#c98a3e"/>
      <path d="M38.5 30.5a3 2.6 0 0 1 6 0z" fill="#d0453a"/><circle cx="45" cy="30" r="1.1" fill="#1e1416"/>
      <g fill="#5a3a20" stroke="#2a1a0e"><circle cx="29" cy="33" r="2.2"/><circle cx="36" cy="33" r="2.2"/></g>
      <path d="M64 35v-9" stroke="#3a2a1c" stroke-width="1.2"/><path d="M64 26l5 2-5 2z" fill="#ffd36a"/></svg>`,
  },
  {
    path: './lull/',
    title: 'Lull',
    tag: 'Musical garden',
    pitch: 'A little garden that sings. Plant chimebells, ferns, reeds, lilies, glowcaps and willows: left to right is the note, back to front is the beat. Bees and fireflies carry the tune while days, rain and mist drift by. Nothing can go wrong.',
    accent: '#b9e48c',
    best: () => {
      const p = lull.load<{ wishes?: string[]; planted?: number; streak?: { last: string; n: number } } | null>('profile', null);
      if (!p?.planted) return null;
      const streak = p.streak && p.streak.n > 1 ? ` · 🔥 ${p.streak.n}-day wish streak` : '';
      return `${p.planted} planted${p.wishes?.length ? ` · ★ ${p.wishes.length} milestone${p.wishes.length === 1 ? '' : 's'}` : ''}${streak}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><defs><linearGradient id="lullsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3a7c"/><stop offset="1" stop-color="#ffa274"/></linearGradient></defs>
      <rect width="76" height="76" fill="url(#lullsky)"/>
      <circle cx="58" cy="22" r="6" fill="#ffd09a"/>
      <path d="M0 40Q18 28 38 36T76 32V76H0z" fill="#6a7fa0"/>
      <rect y="44" width="76" height="32" fill="#5a8a4e"/>
      <rect y="52" width="76" height="6" fill="#ffffff" opacity="0.06"/>
      <ellipse cx="46" cy="60" rx="20" ry="6" fill="#b7ab78"/><ellipse cx="46" cy="60" rx="17" ry="4.6" fill="#3f86a0"/>
      <path d="M14 66C14 52 18 44 28 40" stroke="#4f7a3a" stroke-width="1.6" fill="none"/>
      <path d="M26 41l-3 0.5-1 5 6-1z" fill="#c4b0ff"/><path d="M19 47l-3 0.5-1 5 6-1z" fill="#c4b0ff"/>
      <circle cx="22" cy="50" r="5" fill="#fff6c8" opacity="0.35"/>
      <path d="M50 58c-3-4 1-6 0-9M52 58c3-3 1-6 4-8" stroke="#6aa85a" stroke-width="1.4" fill="none"/>
      <ellipse cx="44" cy="58.5" rx="4.5" ry="1.6" fill="#3f8a4a"/><path d="M42.5 57.5l1.5-3 1.5 3z" fill="#ffd0e6"/>
      <path d="M62 68v-6" stroke="#e8e2d0" stroke-width="2"/><path d="M57 62a5 3.5 0 0 1 10 0z" fill="#3fc8c0"/>
      <circle cx="62" cy="61" r="7" fill="#9ff0e8" opacity="0.25"/>
      <ellipse cx="34" cy="30" rx="3" ry="2" fill="#ffcc33"/><path d="M33 28.5l1-1.6M34.5 28.5l1.5-1.6" stroke="#fff" stroke-width="1"/>
      <path d="M8 26v-9l6-2v9" stroke="#fff6dc" stroke-width="1.3" fill="none"/><circle cx="6.5" cy="26" r="2" fill="#fff6dc"/><circle cx="12.5" cy="24" r="2" fill="#fff6dc"/></svg>`,
  },
  {
    path: './gleam/',
    title: 'Gleam',
    tag: 'Light puzzle',
    pitch: 'Bend coloured beams with mirrors, splitters and filters until every crystal glows its exact colour: red and blue make magenta where they meet. Dark crystals must stay dark. One answer each, no guessing.',
    accent: '#ff5cf0',
    best: () => {
      const p = gleam.load<{ solved?: number; dailies?: Parameters<typeof streakOf>[0] } | null>('profile', null);
      const streak = streakOf(p?.dailies ?? {});
      return p?.solved ? `${p.solved} solved${streak ? ` · 🔥 ${streak}-day daily streak` : ''}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0b0d18"/>
      <g fill="#141830"><rect x="4" y="4" width="22" height="22" rx="3"/><rect x="27" y="4" width="22" height="22" rx="3"/><rect x="50" y="4" width="22" height="22" rx="3"/><rect x="4" y="27" width="22" height="22" rx="3"/><rect x="27" y="27" width="22" height="22" rx="3"/><rect x="50" y="27" width="22" height="22" rx="3"/><rect x="4" y="50" width="22" height="22" rx="3"/><rect x="27" y="50" width="22" height="22" rx="3"/><rect x="50" y="50" width="22" height="22" rx="3"/></g>
      <g stroke-linecap="round" fill="none"><path d="M8 38H38V58" stroke="#ff4f5e" stroke-width="7" opacity="0.25"/><path d="M8 38H38V58" stroke="#ff8a94" stroke-width="2.2"/>
      <path d="M68 61H44" stroke="#5b8cff" stroke-width="7" opacity="0.25"/><path d="M68 61H44" stroke="#9db8ff" stroke-width="2.2"/></g>
      <path d="M31 31L45 45" stroke="#e8eeff" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M38 52l7 4.5-3.5 7.5h-7l-3.5-7.5z" fill="#ff5cf0" stroke="#ffd0fa" stroke-width="1"/>
      <rect x="2" y="32" width="9" height="12" rx="3" fill="#262b45"/><circle cx="10" cy="38" r="3" fill="#ff4f5e"/>
      <rect x="65" y="55" width="9" height="12" rx="3" fill="#262b45"/><circle cx="66" cy="61" r="3" fill="#5b8cff"/>
      <path d="M61 10l5 3.5-2.5 6h-5l-2.5-6z" fill="#0b0912" stroke="#7a64a8"/></svg>`,
  },
  {
    path: './simmer/',
    title: 'Simmer',
    tag: 'Cozy management',
    pitch: 'Keep a little food stall at the night market for twenty nights. Pick the menu and prices, buy ingredients before they spoil, then watch mice, foxes, moles and owls queue up, order and spread the word.',
    accent: '#ffb35c',
    best: () => {
      const p = simmer.load<{ seasons?: number; best?: number; bestStars?: number } | null>('profile', null);
      if (!p?.seasons) return null;
      const st = p.bestStars ?? 0;
      return `Best ${(p.best ?? 0).toLocaleString('en-US')} ${'★'.repeat(st)}${'☆'.repeat(3 - st)} · ${p.seasons} season${p.seasons === 1 ? '' : 's'}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#1a1424"/>
      <path d="M0 8Q38 22 76 8" stroke="#f6e0b8" stroke-opacity="0.35" fill="none"/>
      <g fill="#ffcf6b"><ellipse cx="14" cy="13" rx="3" ry="3.6"/><ellipse cx="38" cy="16" rx="3" ry="3.6"/><ellipse cx="62" cy="13" rx="3" ry="3.6"/></g>
      <rect x="14" y="30" width="48" height="22" fill="#4a2f24"/>
      <g><rect x="10" y="22" width="8" height="9" fill="#c9473f"/><rect x="18" y="22" width="8" height="9" fill="#e8d6b4"/><rect x="26" y="22" width="8" height="9" fill="#c9473f"/><rect x="34" y="22" width="8" height="9" fill="#e8d6b4"/><rect x="42" y="22" width="8" height="9" fill="#c9473f"/><rect x="50" y="22" width="8" height="9" fill="#e8d6b4"/><rect x="58" y="22" width="8" height="9" fill="#c9473f"/></g>
      <circle cx="38" cy="38" r="6" fill="#c95a30"/><circle cx="33" cy="33" r="2.4" fill="#c95a30"/><circle cx="43" cy="33" r="2.4" fill="#c95a30"/><ellipse cx="38" cy="40" rx="3" ry="2.2" fill="#fff3e6"/><circle cx="35.6" cy="37.4" r="0.9" fill="#1b1420"/><circle cx="40.4" cy="37.4" r="0.9" fill="#1b1420"/>
      <rect x="10" y="46" width="56" height="6" fill="#8a5a3c"/>
      <path d="M48 44c-1-3 2-4 0-7M53 44c-1-3 2-4 0-7" stroke="#fff" stroke-opacity="0.45" fill="none"/>
      <rect x="0" y="52" width="76" height="24" fill="#2e2330"/>
      <g><ellipse cx="20" cy="64" rx="6" ry="6.5" fill="#e57a35"/><path d="M16 59l1-6 3 4zM21 58l3-5 1 6z" fill="#e57a35"/><ellipse cx="22" cy="66" rx="3" ry="3" fill="#fbf1e4"/><circle cx="21" cy="62" r="0.9" fill="#1b1420"/><circle cx="24" cy="62" r="0.9" fill="#1b1420"/></g>
      <g><ellipse cx="44" cy="65" rx="6" ry="6" fill="#b9b2c6"/><circle cx="41" cy="58" r="3" fill="#b9b2c6"/><circle cx="48" cy="58" r="3" fill="#b9b2c6"/><circle cx="41" cy="58" r="1.6" fill="#f2b6c6"/><circle cx="48" cy="58" r="1.6" fill="#f2b6c6"/><circle cx="43" cy="63" r="0.9" fill="#1b1420"/><circle cx="46.5" cy="63" r="0.9" fill="#1b1420"/></g>
      <rect x="32" y="45" width="14" height="11" rx="4" fill="#fff8eb"/><text x="39" y="53.5" text-anchor="middle" font-size="8">🍢</text>
      <text x="60" y="64" font-family="system-ui,sans-serif" font-weight="900" font-size="11" fill="#ff7aa2">♥</text></svg>`,
  },
  {
    path: './loomsong/',
    title: 'Loomsong',
    tag: 'Rhythm',
    pitch: 'Every song is made up on the spot from a seed: drums, bass, chords and a tune. Beads slide down four threads on its kicks, snares and melody; tap, hold and flick them in time and weave the song into cloth.',
    accent: '#ffc857',
    best: () => {
      const p = loomsong.load<{ plays?: number; best?: number; bestGrade?: string | null } | null>('profile', null);
      if (!p?.plays) return null;
      return `Best ${p.bestGrade ?? ''} ${(p.best ?? 0).toLocaleString('en-US')} · ${p.plays} song${p.plays === 1 ? '' : 's'} played`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#120d1b"/>
      <g stroke-width="2" opacity="0.5"><path d="M14 0v52" stroke="#ff7a6b"/><path d="M30 0v52" stroke="#ffc857"/><path d="M46 0v52" stroke="#4fd1c5"/><path d="M62 0v52" stroke="#a78bfa"/></g>
      <rect x="7" y="30" width="14" height="7" rx="3.5" fill="#ff7a6b"/>
      <rect x="27" y="6" width="6" height="34" rx="3" fill="#ffc857" opacity="0.8"/><rect x="23" y="36" width="14" height="7" rx="3.5" fill="#ffc857"/>
      <path d="M46 16H62" stroke="#fff7ea" stroke-width="1.5" stroke-dasharray="3 2"/>
      <rect x="39" y="13" width="14" height="7" rx="3.5" fill="#4fd1c5"/><rect x="55" y="13" width="14" height="7" rx="3.5" fill="#a78bfa"/>
      <rect x="4" y="50" width="68" height="4" rx="2" fill="#c89b6d"/>
      <g fill="none" stroke-width="1.5"><circle cx="14" cy="52" r="5" stroke="#ff7a6b"/><circle cx="30" cy="52" r="5" stroke="#ffc857"/><circle cx="46" cy="52" r="5" stroke="#4fd1c5"/><circle cx="62" cy="52" r="5" stroke="#a78bfa"/></g>
      <g><rect x="6" y="60" width="8" height="4" fill="#ff7a6b"/><rect x="14" y="60" width="8" height="4" fill="#ffc857"/><rect x="22" y="60" width="8" height="4" fill="#5a4a22"/><rect x="30" y="60" width="8" height="4" fill="#4fd1c5"/><rect x="38" y="60" width="8" height="4" fill="#a78bfa"/><rect x="46" y="60" width="8" height="4" fill="#ff7a6b"/><rect x="54" y="60" width="8" height="4" fill="#4fd1c5"/><rect x="62" y="60" width="8" height="4" fill="#ffc857"/>
      <rect x="6" y="65" width="8" height="4" fill="#4fd1c5"/><rect x="14" y="65" width="8" height="4" fill="#a78bfa"/><rect x="22" y="65" width="8" height="4" fill="#ffc857"/><rect x="30" y="65" width="8" height="4" fill="#ff7a6b"/><rect x="38" y="65" width="8" height="4" fill="#3d3260"/><rect x="46" y="65" width="8" height="4" fill="#ffc857"/><rect x="54" y="65" width="8" height="4" fill="#ff7a6b"/><rect x="62" y="65" width="8" height="4" fill="#a78bfa"/></g></svg>`,
  },
  {
    path: './brink/',
    title: 'Brink',
    tag: 'Strategy duel',
    pitch: 'Sumo on a crumbling island. Step and shove your stones against the AI: lines of two go over, lines of three hold firm. Push three off while the edge falls away. Daily win-in-2 puzzles.',
    accent: '#ff8a6e',
    best: () => {
      const p = brink.load<{ games?: number; won?: Record<string, number>; dailies?: number } | null>('profile', null);
      if (!p?.games && !p?.dailies) return null;
      const w = p.won ?? {};
      const top = (['hard', 'normal', 'easy'] as const).find((l) => (w[l] ?? 0) > 0);
      const wins = (w.easy ?? 0) + (w.normal ?? 0) + (w.hard ?? 0);
      return `${wins} win${wins === 1 ? '' : 's'}${top ? ` · beat ${top[0].toUpperCase()}${top.slice(1)}` : ''}${p.dailies ? ` · ${p.dailies} daily` : ''}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0b1020"/>
      <g stroke="#1c2523" stroke-width="1.2"><path d="M22 20l10 0 5 8.7-5 8.7H22l-5-8.7z" fill="#4d625e"/><path d="M37 28.7l10 0 5 8.7-5 8.7H37l-5-8.7z" fill="#4d625e"/><path d="M22 37.4l10 0 5 8.7-5 8.7H22l-5-8.7z" fill="#4d625e"/><path d="M37 46.1l10 0 5 8.7-5 8.7H37l-5-8.7z" fill="#5a3a33"/><path d="M52 37.4l10 0 5 8.7-5 8.7H52l-5-8.7z" fill="#4d625e"/></g>
      <path d="M39 50l4 3 3-2M41 56l3-2" stroke="#1a0806" stroke-width="1.2" fill="none"/>
      <circle cx="27" cy="46" r="6.5" fill="#f4ecd8" stroke="#a8987a"/><circle cx="42" cy="37.4" r="6.5" fill="#e8553c" stroke="#8e2a1d"/>
      <circle cx="62" cy="27" r="6" fill="#e8553c" stroke="#8e2a1d" opacity="0.45"/>
      <path d="M31 43l6-3" stroke="#ffd77a" stroke-width="2" stroke-linecap="round"/><path d="M48 33l7-4" stroke="#ff5a4a" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="2 2.5"/></svg>`,
  },
  {
    path: './kitbag/',
    title: 'Kitbag',
    tag: 'Dice roguelite',
    pitch: 'Roll your dice and slot them into your gear: a 2 in the Dagger, a 6 in the Maul, a pair in the Twinblade. Read the enemy’s next move, climb twelve floors and beat The House.',
    accent: '#e8b04a',
    best: () => {
      const p = kitbag.load<{ runs?: number; best?: number; bestFloor?: number; wins?: number } | null>('profile', null);
      if (!p?.runs) return null;
      return `Best ${(p.best ?? 0).toLocaleString('en-US')} · ${p.wins ? `${p.wins} win${p.wins === 1 ? '' : 's'}` : `floor ${p.bestFloor ?? 1}`}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#1c1410"/>
      <rect x="6" y="40" width="64" height="30" rx="7" fill="#3a2a20" stroke="#5b4031" stroke-width="1.5"/>
      <rect x="12" y="46" width="20" height="20" rx="4" fill="none" stroke="#e8b04a" stroke-width="2"/>
      <rect x="40" y="46" width="22" height="20" rx="4" fill="none" stroke="#7a5a3c" stroke-width="2" stroke-dasharray="3 2.5"/>
      <text x="51" y="60" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="9" fill="#d9b98c">≤3</text>
      <g transform="rotate(-14 22 22)"><rect x="10" y="10" width="24" height="24" rx="5" fill="#f4ead8"/><g fill="#2a1f18"><circle cx="16" cy="16" r="2.4"/><circle cx="28" cy="16" r="2.4"/><circle cx="22" cy="22" r="2.4"/><circle cx="16" cy="28" r="2.4"/><circle cx="28" cy="28" r="2.4"/></g></g>
      <g transform="rotate(10 50 20)"><rect x="40" y="10" width="20" height="20" rx="4" fill="#f4ead8"/><g fill="#2a1f18"><circle cx="45" cy="15" r="2"/><circle cx="55" cy="25" r="2"/></g></g>
      <path d="M22 36v6" stroke="#e8b04a" stroke-width="2" stroke-dasharray="2 2"/>
</svg>`,
  },
  {
    path: './sungrazer/',
    title: 'Sungrazer',
    tag: 'One-thumb arcade',
    pitch: 'Hold to swing a comet round a star, let go to fling it to the next. Graze the coronas and shave past cinders for combos while the void rises below.',
    accent: '#ffc35a',
    best: () => {
      const p = sungrazer.load<{ runs?: number; best?: number; bestAlt?: number } | null>('profile', null);
      if (!p?.runs) return null;
      return `Best ${(p.best ?? 0).toLocaleString('en-US')} · altitude ${p.bestAlt ?? 0}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0a0f2c"/>
      <g fill="#cfd8ff"><rect x="8" y="12" width="1.5" height="1.5"/><rect x="60" y="8" width="1.5" height="1.5"/><rect x="66" y="40" width="1" height="1"/><rect x="14" y="56" width="1" height="1"/><rect x="40" y="6" width="1" height="1"/></g>
      <path d="M0 76h76v-8q-19 -5 -38 0t-38 0z" fill="#ff3264" opacity="0.45"/>
      <circle cx="28" cy="46" r="17" fill="none" stroke="#ffd9a8" stroke-opacity="0.45" stroke-dasharray="2 3"/>
      <circle cx="28" cy="46" r="8" fill="#fff1c4" stroke="#ffb547" stroke-width="2"/>
      <path d="M28 46 41 34" stroke="#dff2ff" stroke-width="1.5"/>
      <path d="M41 34Q30 46 18 50" fill="none" stroke="#a0e6ff" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
      <circle cx="41" cy="34" r="3" fill="#fff"/>
      <path d="M45 30q8 -12 14 -14" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="1.5 3.5"/>
      <circle cx="62" cy="20" r="5" fill="#fff1c4" stroke="#ffb547" stroke-width="1.5"/>
      <circle cx="62" cy="20" r="9" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 3"/>
      <path d="M56 54l3-5 5 2-2 5z" fill="#3b2420" stroke="#ff6a3d" stroke-width="1.2"/></svg>`,
  },
  {
    path: './quarry/',
    title: 'Quarry',
    tag: 'Word roguelite',
    pitch: 'Trace words through a wall of letter stones; long words pay. Hit each depth’s target before your words run out, dodge fuses, break rocks, and pick a perk on the way down.',
    accent: '#ffc857',
    best: () => {
      const p = quarry.load<{ runs?: number; best?: number; bestDepth?: number; wins?: number } | null>('profile', null);
      if (!p?.runs) return null;
      return `Best ${(p.best ?? 0).toLocaleString('en-US')} · ${p.wins ? `${p.wins} win${p.wins === 1 ? '' : 's'}` : `depth ${p.bestDepth ?? 1}`}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#1f1a25"/>
      <g font-family="system-ui,sans-serif" font-weight="900" font-size="10" text-anchor="middle" fill="#2a2230"><path d="M-1.4 12.0 3.3 3.9 12.7 3.9 17.4 12.0 12.7 20.1 3.3 20.1z" fill="#ecdcb6"/><text x="8.0" y="15.5">Qu</text><path d="M-1.4 29.3 3.3 21.2 12.7 21.2 17.4 29.3 12.7 37.5 3.3 37.5z" fill="#6a6272"/><path d="M-1.4 46.6 3.3 38.5 12.7 38.5 17.4 46.6 12.7 54.8 3.3 54.8z" fill="#ecdcb6"/><text x="8.0" y="50.1">E</text><path d="M-1.4 64.0 3.3 55.8 12.7 55.8 17.4 64.0 12.7 72.1 3.3 72.1z" fill="#ecdcb6"/><text x="8.0" y="67.5">S</text><path d="M13.6 20.7 18.3 12.5 27.7 12.5 32.4 20.7 27.7 28.8 18.3 28.8z" fill="#9ae8b5"/><text x="23.0" y="24.2">D</text><path d="M13.6 38.0 18.3 29.8 27.7 29.8 32.4 38.0 27.7 46.1 18.3 46.1z" fill="#ecdcb6"/><text x="23.0" y="41.5">O</text><path d="M13.6 55.3 18.3 47.2 27.7 47.2 32.4 55.3 27.7 63.4 18.3 63.4z" fill="#ecdcb6"/><text x="23.0" y="58.8">T</text><path d="M13.6 72.6 18.3 64.5 27.7 64.5 32.4 72.6 27.7 80.8 18.3 80.8z" fill="#ecdcb6"/><text x="23.0" y="76.1">A</text><path d="M28.6 12.0 33.3 3.9 42.7 3.9 47.4 12.0 42.7 20.1 33.3 20.1z" fill="#ecdcb6"/><text x="38.0" y="15.5">R</text><path d="M28.6 29.3 33.3 21.2 42.7 21.2 47.4 29.3 42.7 37.5 33.3 37.5z" fill="#9ae8b5"/><text x="38.0" y="32.8">I</text><path d="M28.6 46.6 33.3 38.5 42.7 38.5 47.4 46.6 42.7 54.8 33.3 54.8z" fill="#ecdcb6"/><text x="38.0" y="50.1">N</text><path d="M28.6 64.0 33.3 55.8 42.7 55.8 47.4 64.0 42.7 72.1 33.3 72.1z" fill="#ecdcb6"/><text x="38.0" y="67.5">L</text><path d="M43.6 20.7 48.3 12.5 57.7 12.5 62.4 20.7 57.7 28.8 48.3 28.8z" fill="#ffd060"/><text x="53.0" y="24.2">A</text><path d="M43.6 38.0 48.3 29.8 57.7 29.8 62.4 38.0 57.7 46.1 48.3 46.1z" fill="#9ae8b5"/><text x="53.0" y="41.5">G</text><path d="M43.6 55.3 48.3 47.2 57.7 47.2 62.4 55.3 57.7 63.4 48.3 63.4z" fill="#ecdcb6"/><text x="53.0" y="58.8">E</text><path d="M43.6 72.6 48.3 64.5 57.7 64.5 62.4 72.6 57.7 80.8 48.3 80.8z" fill="#6a6272"/><path d="M58.6 12.0 63.3 3.9 72.7 3.9 77.4 12.0 72.7 20.1 63.3 20.1z" fill="#ecdcb6"/><text x="68.0" y="15.5">M</text><path d="M58.6 29.3 63.3 21.2 72.7 21.2 77.4 29.3 72.7 37.5 63.3 37.5z" fill="#f6c9b4"/><text x="68.0" y="32.8">U</text><path d="M58.6 46.6 63.3 38.5 72.7 38.5 77.4 46.6 72.7 54.8 63.3 54.8z" fill="#ecdcb6"/><text x="68.0" y="50.1">O</text><path d="M58.6 64.0 63.3 55.8 72.7 55.8 77.4 64.0 72.7 72.1 63.3 72.1z" fill="#ecdcb6"/><text x="68.0" y="67.5">W</text></g>
      <path d="M23 21 38 29 53 38" fill="none" stroke="#2f9a5a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/><circle cx="73" cy="24" r="3" fill="#d63c2f"/></svg>`,
  },
  {
    path: './summit/',
    title: 'Summit',
    tag: 'Solitaire roguelite',
    pitch: 'Eight deals of peaks solitaire: play cards one up or down, chain streaks, and pick a charm after every floor. Unused draws carry up, and the air gets thin.',
    accent: '#8fc4ff',
    best: () => {
      const p = summit.load<{ runs?: number; best?: number; bestFloor?: number; wins?: number } | null>('profile', null);
      if (!p?.runs) return null;
      return `Best ${(p.best ?? 0).toLocaleString('en-US')} · ${p.wins ? `${p.wins} summit${p.wins === 1 ? '' : 's'}` : `floor ${p.bestFloor ?? 1}`}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0e1522"/>
      <path d="M0 76L22 40l10 14 12-20 32 42z" fill="#1d2f52"/><path d="M44 34l5 8-5-2-4 3z" fill="#f7f2e6"/>
      <g stroke="#0e1522" stroke-width="1.2"><rect x="27" y="8" width="20" height="28" rx="3" fill="#f7f2e6"/>
      <rect x="16" y="22" width="20" height="28" rx="3" fill="#f7f2e6"/><rect x="38" y="22" width="20" height="28" rx="3" fill="#3a5a8c"/></g>
      <text x="31" y="20" font-family="system-ui,sans-serif" font-weight="800" font-size="10" fill="#c92c3a">7</text>
      <text x="20" y="34" font-family="system-ui,sans-serif" font-weight="800" font-size="10" fill="#1b2233">8</text>
      <rect x="28" y="52" width="20" height="22" rx="3" fill="#f7f2e6" stroke="#ffcf6e" stroke-width="2"/>
      <text x="32" y="65" font-family="system-ui,sans-serif" font-weight="800" font-size="10" fill="#c92c3a">6</text></svg>`,
  },
  {
    path: './ninefold/',
    title: 'Ninefold',
    tag: 'Mini-golf',
    pitch: 'Nine holes grown fresh from a seed: rails to bank off, sand, ponds, slopes and bumpers. Pull back, let go, and try to beat par.',
    accent: '#9be15d',
    best: () => {
      const p = ninefold.load<{ rounds?: number; best?: number | null; aces?: number; under?: number } | null>('profile', null);
      if (!p?.rounds || p.best == null) return null;
      const d = p.best;
      return `Best ${d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`}${p.under ? ` · ${p.under} under par` : ''}${p.aces ? ` · ${p.aces} ace${p.aces === 1 ? '' : 's'}` : ''}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0c1613"/>
      <path d="M14 70V36h24V8h24v28H38v34z" fill="#2f8a50" stroke="#b8875a" stroke-width="3" stroke-linejoin="round"/>
      <rect x="18" y="44" width="14" height="10" rx="3" fill="#d9c08a"/>
      <circle cx="50" cy="20" r="4" fill="#0a0d0b"/><path d="M50 20V4" stroke="#e8e2d0" stroke-width="1.5"/><path d="M50 4l9 3-9 3z" fill="#ff5a4e"/>
      <circle cx="26" cy="64" r="3" fill="#fafafa"/><path d="M26 60V48" stroke="#9be15d" stroke-width="1.5" stroke-dasharray="2 2"/></svg>`,
  },
  {
    path: './lastlight/',
    title: 'Last Light',
    tag: 'Interactive story',
    pitch: 'Two nights on a lighthouse island: a storm and a ship running for the rocks, then fog and a missing child. Every tap costs three minutes, and the people remember what you do.',
    accent: '#ffd77a',
    best: () => {
      type N = { plays?: number; best?: number; endings?: string[] };
      const p = lastlight.load<(N & { n2?: N }) | null>('profile', null);
      const nights = [p, p?.n2].filter((n): n is N => !!n?.plays);
      if (!nights.length) return null;
      const found = nights.reduce((k, n) => k + (n.endings?.length ?? 0), 0);
      const stars = [p, p?.n2].map((n, i) => (n?.plays ? `Night ${i + 1} ${'★'.repeat(n.best ?? 0) || '–'}` : '')).filter(Boolean);
      return `${stars.join(' · ')} · ${found} ending${found === 1 ? '' : 's'}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0a0f1c"/>
      <path d="M0 56 Q19 52 38 56 T76 56 V76 H0z" fill="#0c1626"/><path d="M48 76 L52 52 L76 46 V76z" fill="#05080f"/>
      <path d="M56 50 L58 22 H64 L66 50z" fill="#1d2638"/><rect x="57" y="16" width="8" height="6" fill="#ffd77a"/>
      <path d="M58 19 L4 8 L4 30z" fill="#ffd77a" opacity="0.28"/><circle cx="14" cy="55" r="2" fill="#ffcf7a"/>
      <g stroke="#9fb4d2" stroke-opacity="0.35"><path d="M10 10l-3 7M24 20l-3 7M38 6l-3 7M30 34l-3 7M8 36l-3 7"/></g></svg>`,
  },
  {
    path: './triad/',
    title: 'Triad',
    tag: 'Logic puzzle',
    pitch: 'Fire burns leaf, leaf drinks water, water douses fire. Fill the hexes so every number counts the neighbors it beats. Fresh puzzles, one answer each, no guessing.',
    accent: '#ff8a3d',
    best: () => {
      const p = triad.load<{ solved?: number } | null>('profile', null);
      const streak = streakOf(triad.load<Record<string, DailyResult>>('dailies', {}));
      return p?.solved ? `${p.solved} solved${streak ? ` · 🔥 ${streak}-day daily streak` : ''}` : null;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#11141d"/>
      <path d="M38 8l13 7.5v15L38 38l-13-7.5v-15z" fill="#5a2a14" stroke="#ff8a3d" stroke-width="1.5"/>
      <path d="M24 32l13 7.5v15L24 62l-13-7.5v-15z" fill="#1f4a22" stroke="#6fd36f" stroke-width="1.5"/>
      <path d="M52 32l13 7.5v15L52 62l-13-7.5v-15z" fill="#143a5c" stroke="#4fb3ff" stroke-width="1.5"/>
      <g font-family="system-ui" font-weight="800" font-size="13" fill="#f4f1ea" text-anchor="middle"><text x="38" y="28">1</text><text x="24" y="52">1</text><text x="52" y="52">1</text></g></svg>`,
  },
  {
    path: './hexhold/',
    title: 'Hexhold',
    tag: 'Maze tower defense',
    pitch: 'Your towers are the walls. Bend the path into a long maze, cluster towers so they boost each other, and hold for 30 waves.',
    accent: '#ffd77a',
    best: () => {
      const p = hexhold.load<{ best?: number; wins?: number } | null>('profile', null);
      if (!p?.best) return null;
      return p.wins ? `Held ${p.wins} time${p.wins > 1 ? 's' : ''}` : `Best: wave ${p.best}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#0e1424"/>
      <g fill="#1c2539" stroke="#2a3550"><path d="M20 14l9 5v10l-9 5-9-5V19z"/><path d="M38 24l9 5v10l-9 5-9-5V29z"/><path d="M56 14l9 5v10l-9 5-9-5V19z"/><path d="M20 44l9 5v10l-9 5-9-5V49z"/><path d="M56 44l9 5v10l-9 5-9-5V49z"/></g>
      <path d="M38 6 C 38 20 20 26 20 38 S 56 46 56 58 S 38 66 38 72" fill="none" stroke="#ffd77a" stroke-width="2" stroke-dasharray="3 4" opacity="0.6"/>
      <circle cx="38" cy="34" r="6" fill="#ffb35c"/><path d="M14 46l12 8M50 16l12 8" stroke="#7ad7ff" stroke-width="3" stroke-linecap="round"/><circle cx="56" cy="54" r="3" fill="#ff8a8a"/></svg>`,
  },
  {
    path: './unspoken/',
    title: 'Unspoken',
    tag: 'Language puzzle',
    pitch: 'A village whose language no one has written down for you, invented fresh each time. Learn it from its pictures, then answer the elder.',
    accent: '#c8643c',
    best: () => {
      const p = unspoken.load<{ finished?: number; best?: number; finished2?: number } | null>('profile', null);
      if (!p?.finished) return null;
      const n = p.finished + (p.finished2 ?? 0);
      return `Best: ${p.best}% understood · ${n} language${n > 1 ? 's' : ''} learned${p.finished2 ? ' · mountain village ✓' : ''}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#efe6d2"/>
      <rect x="10" y="10" width="56" height="34" rx="5" fill="#e3d3b0"/><circle cx="24" cy="24" r="6" fill="#c8643c"/><path d="M14 40l14-12 10 8 8-6 14 10z" fill="#9c8a62"/>
      <g stroke="#2b2118" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M14 54h10M19 54v10"/><path d="M33 52c6 0 6 12 0 12"/><rect x="45" y="51" width="16" height="14" rx="4"/><path d="M49 56l8 4"/></g></svg>`,
  },
  {
    path: './rewild/',
    title: 'Rewild',
    tag: 'Ecosystem builder',
    pitch: 'A bare island, five years. Seed lichen and grass, then bees, oaks, deer and wolves. Keep the web of life in balance.',
    accent: '#7bd88f',
    best: () => {
      const p = rewild.load<{ best?: number; bestStars?: number } | null>('profile', null);
      if (!p?.best) return null;
      return `Best: ${p.best}${p.bestStars ? ` · ${'★'.repeat(p.bestStars)}` : ''}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><rect width="76" height="76" fill="#123a44"/>
      <path d="M38 12l20 11v24L38 58 18 47V23z" fill="#c9b38a"/><path d="M38 20l13 7v16l-13 7-13-7V27z" fill="#6f8f4a"/>
      <path d="M18 47l20 11 20-11v5L38 64 18 52z" fill="#7fc8d8" opacity="0.8"/>
      <circle cx="33" cy="31" r="7" fill="#3f7a3a"/><circle cx="31" cy="29" r="3" fill="#5fa04e"/><rect x="32" y="36" width="2.4" height="6" fill="#6b4a2b"/>
      <circle cx="45" cy="38" r="2" fill="#f2d14a"/><circle cx="42" cy="42" r="2" fill="#e86aa0"/><circle cx="47" cy="43" r="2" fill="#ffffff"/>
      <ellipse cx="40" cy="48" rx="4" ry="2.4" fill="#b8763e"/></svg>`,
  },
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
    path: './glyph/',
    title: 'Glyphwright',
    tag: 'Spell-crafting autobattler',
    pitch: 'Weave runes into spells, three rows on a loom. Order matters. Hold the tower for 15 waves.',
    accent: '#b08cff',
    best: () => {
      const p = glyph.load<{ bestWave?: number; wins?: number } | null>('profile', null);
      if (!p?.bestWave) return null;
      return `Best: wave ${p.bestWave}${p.wins ? ` · ${p.wins} win${p.wins > 1 ? 's' : ''}` : ''}`;
    },
    thumb: `<svg viewBox="0 0 76 76"><defs><filter id="gw" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs>
      <rect width="76" height="76" fill="#0b0716"/>
      <g fill="none" stroke-linecap="round" stroke-width="3"><g filter="url(#gw)"><path d="M14 30L30 14M30 14h-7M30 14v7" stroke="#5ec8ff"/><path d="M46 14v16M40 22h12" stroke="#ff7a3d"/><circle cx="60" cy="22" r="6" stroke="#c77dff"/></g>
      <path d="M14 30L30 14M30 14h-7M30 14v7" stroke="#bfe9ff"/><path d="M46 14v16M40 22h12" stroke="#ffc7a8"/><circle cx="60" cy="22" r="6" stroke="#e7cfff"/></g>
      <path d="M38 66l6-10-6-10-6 10z" fill="#c9b2ff"/><circle cx="24" cy="44" r="4" fill="#ff5d7a"/><path d="M52 40l4 7h-8z" fill="#ffb347"/>
      <path d="M38 46L26 45" stroke="#5ec8ff" stroke-width="1.5"/></svg>`,
  },
  {
    path: './nightline/',
    title: 'Nightline',
    tag: 'ASCII racer',
    pitch: 'An OutRun-style night drive drawn in text. Beat the clock, pick your road at every fork.',
    accent: '#ff2a6d',
    best: () => {
      // Each clock (rules version) keeps its own best (best4 now); an older one shows only until there is one.
      const b = nightline.load<number>('best4', 0);
      const old = ([['best3', 'v3'], ['best', 'v2']] as const).map(([k, v]) => [nightline.load<number>(k, 0), v] as const).find(([x]) => x > 0);
      return b ? `Best score: ${b.toLocaleString()}` : old ? `Old best (${old[1]} clock): ${old[0].toLocaleString()}` : null;
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
    pitch: 'Every enemy shows its next attack. Moving is attacking. Get deeper. Daily run.',
    accent: '#5ee7ff',
    best: () => {
      const d = telegraph.load<number>('best', 0);
      const streak = streakOf(telegraph.load<Record<string, DailyResult>>('dailies', {}));
      return d ? `Deepest floor: ${d}${streak ? ` · 🔥 ${streak}-day daily streak` : ''}` : null;
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
    pitch: 'A tiny text-mode quest. Relight the village Lantern from the dark of the Hollow. Monsters and loot shift every run; daily quest.',
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

// Filter chips: the hub has grown long, so games can be narrowed by kind.
export const KINDS: Record<string, string[]> = {
  Puzzle: ['trestle', 'gleam', 'triad', 'unspoken', 'grove', 'quarry', 'ninefold', 'summit'],
  Action: ['loomsong', 'sungrazer', 'afterglow', 'nightline', 'hexhold'],
  Strategy: ['tidings', 'simmer', 'brink', 'kitbag', 'glyph', 'telegraph', 'rewild', 'hexhold', 'summit'],
  Story: ['tidings', 'lastlight', 'lantern', 'delve', 'unspoken'],
  Calm: ['lull', 'simmer', 'grove', 'ninefold'],
};

export interface DailyLink {
  path: string;
  title: string;
  store: Store;
  accent: string;
}

// Today's challenges: the same seed for everyone, one per game.
export const DAILY: DailyLink[] = [
  { path: './afterglow/?daily', title: 'Afterglow', store: afterglow, accent: '#ff3d8b' },
  { path: './rewild/?daily', title: 'Rewild', store: rewild, accent: '#7bd88f' },
  { path: './glyph/?daily', title: 'Glyph\u00ADwright', store: glyph, accent: '#b08cff' },
  { path: './delve/?daily', title: 'Delve', store: delve, accent: '#ffb347' },
  { path: './nightline/?daily', title: 'Nightline', store: nightline, accent: '#ff2a6d' },
  { path: './unspoken/?daily', title: 'Unspoken', store: unspoken, accent: '#c8643c' },
  { path: './hexhold/?daily', title: 'Hexhold', store: hexhold, accent: '#ffd77a' },
  { path: './triad/?daily', title: 'Triad', store: triad, accent: '#ff8a3d' },
  { path: './ninefold/?daily', title: 'Ninefold', store: ninefold, accent: '#9be15d' },
  { path: './summit/?daily', title: 'Summit', store: summit, accent: '#8fc4ff' },
  { path: './quarry/?daily', title: 'Quarry', store: quarry, accent: '#ffc857' },
  { path: './sungrazer/?daily', title: 'Sungrazer', store: sungrazer, accent: '#ffc35a' },
  { path: './kitbag/?daily', title: 'Kitbag', store: kitbag, accent: '#e8b04a' },
  { path: './brink/?daily', title: 'Brink', store: brink, accent: '#ff8a6e' },
  { path: './loomsong/?daily', title: 'Loomsong', store: loomsong, accent: '#ffc857' },
  { path: './simmer/?daily', title: 'Simmer', store: simmer, accent: '#ffb35c' },
  { path: './gleam/?daily', title: 'Gleam', store: gleam, accent: '#ff5cf0' },
  { path: './trestle/?daily', title: 'Trestle', store: trestle, accent: '#e0b25a' },
  { path: './tidings/?daily', title: 'Tidings', store: tidings, accent: '#e9b45a' },
  { path: './lull/?daily', title: 'Lull', store: lull, accent: '#b9e48c' },
  { path: './telegraph/?daily', title: 'Telegraph', store: telegraph, accent: '#5ee7ff' },
  { path: './lantern/?daily', title: 'Lantern', store: lantern, accent: '#ffd166' },
];
