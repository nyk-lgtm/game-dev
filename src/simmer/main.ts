import { wantsDaily } from '../shared/daily';
import { installErrorOverlay, toast } from '../shared/debug';
import { randomSeed } from '../shared/rng';
import { RULES_VERSION } from './core';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=... replays a season (for bug reports).
const p = new URLSearchParams(location.search);
const saved = store.load<{ v: number; seed: number; a: string } | null>('run', null);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  game.start(Number(p.get('seed')), (p.get('a') ?? '').split(',').filter(Boolean));
  history.replaceState(null, '', location.pathname);
} else if (wantsDaily()) game.playDaily();
else if (saved && saved.v === RULES_VERSION) game.start(saved.seed, saved.a ? saved.a.split(',') : []);
else {
  game.start(randomSeed());
  if (saved && saved.a) setTimeout(() => toast('Simmer was updated, so a fresh season started'), 600);
}

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
