import { installErrorOverlay } from '../shared/debug';
import { Game, store, storyFor } from './game';

installErrorOverlay();

const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();
document.getElementById('hintBtn')!.onclick = () => game.showHint();

// ?a=go:yard,... replays a bug report (without touching the saved night); ?n=2 picks the night.
const p = new URLSearchParams(location.search);
// A replay without ?n is an older night 1 report.
const night = storyFor(Number(p.get('n') ?? (p.has('a') ? 1 : store.load<number>('night', 1))) || 1).night;
if (p.has('a')) {
  game.start((p.get('a') ?? '').split(',').filter(Boolean), night);
  history.replaceState(null, '', location.pathname);
} else game.playNight(night);

if (!store.load('seenHelp', false)) game.showHelp();

(window as unknown as { __game: Game }).__game = game;
