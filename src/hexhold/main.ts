import { installErrorOverlay } from '../shared/debug';
import { wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { RULES_VERSION } from './core';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=...&t=... replays a bug report exactly (without touching the saved run).
const p = new URLSearchParams(location.search);
const saved = store.load<{ v: number; seed: number; a: string; tick: number } | null>('run', null);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  game.start(Number(p.get('seed')), a === '-' ? '' : a, Number(p.get('t') ?? 0), true);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.a, saved.tick);
else game.start(randomSeed());

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
