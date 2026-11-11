import { installErrorOverlay } from '../shared/debug';
import { RULES_VERSION } from './core/story';
import { Game, store } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?a=go:yard,... replays a bug report (without touching the saved night).
const p = new URLSearchParams(location.search);
const saved = store.load<{ v: number; a: string } | null>('run', null);
if (p.has('a')) {
  game.start((p.get('a') ?? '').split(',').filter(Boolean));
  history.replaceState(null, '', location.pathname);
} else if (saved && saved.v === RULES_VERSION) game.start(saved.a.split(',').filter(Boolean));
else game.start();

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
