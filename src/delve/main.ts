import { installErrorOverlay } from '../shared/debug';
import { Game } from './game';

installErrorOverlay();
const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=... replays a bug report exactly.
const p = new URLSearchParams(location.search);
if (p.has('seed') && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  game.start(Number(p.get('seed')), a === '-' ? '' : a);
  history.replaceState(null, '', location.pathname);
} else game.showTitle();

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
