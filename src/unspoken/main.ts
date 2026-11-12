import { installErrorOverlay } from '../shared/debug';
import { wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { RULES_VERSION } from './core';
import { Game, runKey, store, village2Open, type SavedRun } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=... replays a bug report exactly (without touching the saved run); &v=2 for the mountain village.
// Each village keeps its own saved run; the one played last opens.
const p = new URLSearchParams(location.search);
const village = store.load<number>('village', 1) === 2 && village2Open() ? 2 : 1;
const saved = store.load<SavedRun | null>(runKey(village), null);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  game.start(Number(p.get('seed')), a === '-' ? '' : a, true, null, p.get('v') === '2' ? 2 : 1);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.a, false, null, village);
else game.start(randomSeed(), '', false, null, village);

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
