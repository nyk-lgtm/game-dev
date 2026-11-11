import { installErrorOverlay } from '../shared/debug';
import { wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { RULES_VERSION, SIZES, type Size } from './core';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('newBtn')!.onclick = () => game.showNew();

// ?seed=123&size=medium opens that exact puzzle (for bug reports).
const p = new URLSearchParams(location.search);
const saved = store.load<Parameters<Game['start']>[2]>('run', null);
const size = (p.get('size') ?? 'medium') as Size;
if (p.has('seed') && Number.isFinite(Number(p.get('seed'))) && size in SIZES) {
  game.start(Number(p.get('seed')), size);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.size, saved);
else game.start(randomSeed(), 'small');

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
