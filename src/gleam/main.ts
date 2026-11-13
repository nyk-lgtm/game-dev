import { installErrorOverlay } from '../shared/debug';
import { todayKey, wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { SIZES, type Size } from './core';
import { Game, store, validSave, type SavedRun } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('newBtn')!.onclick = () => game.showNew();
document.getElementById('helpBtn')!.onclick = () => game.showHelp();

// ?seed=123&size=medium[&a=…] opens that exact puzzle and moves (for bug reports).
const q = new URLSearchParams(location.search);
const size = (q.get('size') ?? 'medium') as Size;
const saved = store.load<SavedRun | null>('run', null);
if (q.has('seed') && Number.isFinite(Number(q.get('seed'))) && Object.hasOwn(SIZES, size)) {
  game.start(Number(q.get('seed')) >>> 0, size, { v: 0, seed: 0, size, a: q.get('a') ?? '', ms: 0, hints: 0, done: false });
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily() || (store.load<string>('mode', 'own') === 'daily' && store.load<SavedRun | null>('dailyRun', null)?.day === todayKey())) game.playDaily();
else if (validSave(saved)) game.start(saved.seed, saved.size, saved);
else game.start(randomSeed(), store.load<Size>('size', 'small'));

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
