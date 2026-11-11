import { installErrorOverlay } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { wantsDaily } from '../shared/daily';
import { RULES_VERSION } from './core';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=... replays a bug report exactly (without touching the saved run).
const p = new URLSearchParams(location.search);
const saved = store.load<{ v: number; seed: number; a: string } | null>('run', null);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  game.start(Number(p.get('seed')), a === '-' ? '' : a, true);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.a);
else {
  game.start(randomSeed());
  game.save();
}

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
