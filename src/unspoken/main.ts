import { installErrorOverlay } from '../shared/debug';
import { wantsDaily } from '../shared/daily';
import { randomSeed } from '../shared/rng';
import { rulesVersion, unlinkActions } from './core';
import { Game, runKey, store, village2Open, type SavedRun } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=... replays a bug report exactly (&v=2 for the mountain village); it then becomes the
// current run of that village, so a refresh carries on. Each village keeps its own saved run; the one
// played last opens (the mountain village also when a link opened it before the river village was done).
const p = new URLSearchParams(location.search);
const run2 = store.load<SavedRun | null>(runKey(2), null);
const village = store.load<number>('village', 1) === 2 && (village2Open() || run2) ? 2 : 1;
const saved = store.load<SavedRun | null>(runKey(village), null);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  const seed = Number(p.get('seed'));
  const v = p.get('v') === '2' ? 2 : 1;
  let acts = '';
  try {
    acts = unlinkActions(seed, v, a === '-' ? '' : a);
  } catch {
    acts = a;
  }
  game.start(seed, acts, true, null, v);
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === rulesVersion(village)) game.start(saved.seed, saved.a, false, null, village);
else game.start(randomSeed(), '', false, null, village);

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
