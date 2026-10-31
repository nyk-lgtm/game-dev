import { installErrorOverlay, toast } from '../shared/debug';
import { Game } from './game';

installErrorOverlay();
const game = new Game();
document.getElementById('menuBtn')!.onclick = () => game.showMenu();

// ?seed=123&a=... replays a bug report exactly.
const p = new URLSearchParams(location.search);
// Replays are never saved, so a link can't overwrite your run or records.
if (p.has('seed') && p.get('seed') !== '' && Number.isFinite(Number(p.get('seed')))) {
  const a = p.get('a') ?? '';
  game.start(Number(p.get('seed')), a === '-' ? '' : a, true);
  history.replaceState(null, '', location.pathname);
} else {
  if (p.has('seed')) {
    toast(`Bad replay link: seed "${p.get('seed')}"`);
    history.replaceState(null, '', location.pathname);
  }
  game.showTitle();
}

// Handle for automated browser tests.
(window as unknown as { __game: Game }).__game = game;
